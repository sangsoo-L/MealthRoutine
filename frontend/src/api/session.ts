import {
  ApiError,
  INVALID_RESPONSE,
  checkBody,
  checkHeaders,
  checkPath,
  sendRaw,
  type FetchLike,
  type HttpMethod,
  type RawRequest,
} from './core.ts'

/**
 * 인증 세션 핵심(계획 F1 v2.2 2.3). 다른 파트는 이 파일을 직접 쓰지 않는다(`api/http.ts`의 apiRequest를 쓴다).
 *
 * 규칙 요약
 * - access 토큰은 메모리에만 둔다. sessionStorage에는 "이 탭에서 로그인했던 회원 ID" 힌트만 둔다(D1·D1-b).
 * - 세대(generation)는 인증 의도가 시작될 때만 올린다: 앱 시작 확인·로그인 시작·명시적 로그아웃·세션 종료. 성공 때는 올리지 않는다.
 *   모든 작업은 시작 때 받은 세대를 들고 다니며, 결과는 `isCurrent(세대)`일 때만 반영한다(늦은 결과가 새 상태를 덮지 않게).
 * - 쿠키를 바꾸는 요청(login·refresh·logout·cookieChanging)은 탭 안 대기열로 한 번에 하나씩 보낸다(F-2).
 *   대기열 작업은 "HTTP 요청 1개 + 응답 해석"뿐이다. 그 안에서 재발급·회원 확인·다른 대기열 작업을 기다리지 않는다(교착 방지).
 * - login·시작 확인·재발급이 받은 토큰은 임시 토큰이다. 그 토큰으로 `GET /users/me`를 확인한 뒤에만 공용 토큰으로 확정한다.
 * - 탭 사이에는 대기열·재발급 공유가 없다(알려진 한계, REFRESH_INVALID 1회 재시도로 완화만 한다).
 */

/** 서버 `GET /users/me` 응답 중 인증 연결에 쓰는 값 */
export interface MeData {
  userId: number
  email: string | null
  nickname: string | null
}

export type SessionEndReason = 'expired' | 'suspended' | 'accountChanged'

export type LoginOutcome =
  | { gen: number; ok: true; me: MeData }
  | {
      gen: number
      ok: false
      reason: 'invalid' | 'suspended' | 'unavailable'
      message?: string
    }

export type ResumeOutcome =
  | {
      gen: number
      ok: true
      me: MeData
      switchedAccount: boolean
      /**
       * 결과를 공용 세션으로 확정한다. 세대가 지금도 유효할 때만 true.
       * 다른 회원(B)으로 바뀐 경우(F1-D10 ①)에는 이 호출 전까지 B 토큰을 공개하지 않는다 —
       * 호출하는 쪽(AuthProvider)이 이전 계정(A) 데이터를 정리한 **뒤에** 부른다(계획 2.7-4, Codex R1).
       */
      activate(): boolean
    }
  | { gen: number; ok: false; kind: 'ended' | 'transient' }

export type AuthMode = 'required' | 'optional' | 'none'

export interface ApiRequestOptions {
  /** 일반 객체·배열만. JSON으로 보낸다 */
  body?: unknown
  /** required(기본): 로그인 필요 / optional: 로그인했으면 토큰을 붙임 / none: 토큰·세션을 쓰지 않음 */
  auth?: AuthMode
  /** 추가 헤더(예: X-Pin-Token). Authorization·X-Requested-With·(본문이 있을 때) Content-Type은 넣을 수 없다 */
  headers?: Record<string, string>
  signal?: AbortSignal
  /** refresh 쿠키를 만들거나 지우는 요청(예: 비밀번호 변경). auth 모드와 상관없이 쿠키 변경 대기열을 거친다 */
  cookieChanging?: boolean
}

export interface SessionDeps {
  fetch: FetchLike
  /** 힌트 저장소. 쓸 수 없으면 null을 돌려준다 */
  getStorage: () => Storage | null
  sleep: (ms: number) => Promise<void>
  /** REFRESH_INVALID 뒤 다시 시도하기 전 대기(ms, D5) */
  refreshRetryDelayMs: number
}

/** 회원 ID 힌트 키. 계정별 정리 접두어(`mealthroutine.account.`)를 쓰지 않는다 — 계정 데이터 정리가 새 힌트를 지우지 않게. */
export const AUTH_HINT_KEY = 'mealthroutine.auth.hint'
const HINT_VERSION = 1

/** 대기열 작업이 실행 직전 오래된 작업이라 건너뛰었다는 표지 */
const SKIPPED: unique symbol = Symbol('skipped')
type Skipped = typeof SKIPPED

type RefreshExchange =
  | { kind: 'token'; token: string }
  | { kind: 'invalid' }
  | { kind: 'suspended' }
  | { kind: 'transient'; error: ApiError }
  | { kind: 'stale' }

type MeCheck =
  | { kind: 'me'; me: MeData }
  | { kind: 'denied'; reason: 'expired' | 'suspended' }
  | { kind: 'transient'; error: ApiError }

type RefreshResult = { ok: true } | { ok: false; error: ApiError | null }

function loginRequired(): ApiError {
  return new ApiError(401, 'LOGIN_REQUIRED', '로그인이 필요합니다.')
}

function invalidResponse(): ApiError {
  return new ApiError(0, INVALID_RESPONSE, '응답 형식이 올바르지 않습니다.')
}

function readMe(data: unknown): MeData | null {
  if (typeof data !== 'object' || data === null) return null
  const value = data as Record<string, unknown>
  if (typeof value.userId !== 'number') return null
  return {
    userId: value.userId,
    email: typeof value.email === 'string' ? value.email : null,
    nickname: typeof value.nickname === 'string' ? value.nickname : null,
  }
}

/** 화면 전체 로그인 상태를 끝내야 하는 오류인지(AUTH2-3·AUTH2-5). 그 밖의 403·4xx·5xx는 해당 요청만 실패한다. */
function sessionEndReasonOf(error: ApiError): 'expired' | 'suspended' | null {
  if (error.status === 403 && error.errorCode === 'ACCOUNT_SUSPENDED')
    return 'suspended'
  if (
    error.status === 401 &&
    (error.errorCode === 'INVALID_TOKEN' ||
      error.errorCode === 'LOGIN_REQUIRED' ||
      error.errorCode === 'TOKEN_EXPIRED')
  )
    return 'expired'
  return null
}

/** 호출자의 취소를 공유 작업과 분리한다: 이 호출자만 AbortError로 끝나고 공유 작업은 계속된다. */
function withSignal<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason)
    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort)
        resolve(value)
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort)
        reject(error)
      },
    )
  })
}

export function createAuthSession(deps: SessionDeps) {
  let token: string | null = null
  let userId: number | null = null
  let generation = 0
  let bootstrapJob: { gen: number; promise: Promise<ResumeOutcome> } | null =
    null
  let refreshInFlight: { gen: number; promise: Promise<RefreshResult> } | null =
    null
  let queueTail: Promise<unknown> = Promise.resolve()
  const listeners = new Set<(reason: SessionEndReason) => void>()

  const isCurrent = (gen: number) => gen === generation

  // ---- 힌트(회원 ID만). 저장소 오류·손상은 "힌트 없음"으로 본다.
  function readHint(): number | null {
    try {
      const raw = deps.getStorage()?.getItem(AUTH_HINT_KEY)
      if (raw === null || raw === undefined) return null
      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'v' in parsed &&
        'userId' in parsed &&
        parsed.v === HINT_VERSION &&
        typeof parsed.userId === 'number' &&
        Number.isSafeInteger(parsed.userId)
      ) {
        return parsed.userId
      }
    } catch {
      // 아래에서 정리한다.
    }
    removeHint()
    return null
  }
  function writeHint(id: number): void {
    try {
      deps
        .getStorage()
        ?.setItem(
          AUTH_HINT_KEY,
          JSON.stringify({ v: HINT_VERSION, userId: id }),
        )
    } catch {
      // 저장하지 못하면 새로고침 때 로그인이 유지되지 않을 뿐이다.
    }
  }
  function removeHint(): void {
    try {
      deps.getStorage()?.removeItem(AUTH_HINT_KEY)
    } catch {
      // 저장소를 쓸 수 없으면 지울 것도 없다.
    }
  }

  function clearMemory(): void {
    token = null
    userId = null
  }

  // ---- 쿠키 변경 대기열(탭 안). 작업은 raw 교환 1회뿐이며, 실패해도 다음 작업은 진행한다.
  function enqueue<T>(
    job: () => Promise<T>,
    isStale: () => boolean,
  ): Promise<T | Skipped> {
    const run = queueTail.then<T | Skipped>(() => (isStale() ? SKIPPED : job()))
    // 다음 작업은 이 작업의 성공·실패와 상관없이 이어진다.
    queueTail = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  const raw = (request: RawRequest) => sendRaw(deps.fetch, request)

  /** 임시 토큰으로 회원 확인. 재발급·대기열을 거치지 않는 raw GET 1회. */
  async function checkMe(candidate: string): Promise<MeCheck> {
    try {
      const me = readMe(
        await raw({ method: 'GET', path: '/users/me', token: candidate }),
      )
      return me
        ? { kind: 'me', me }
        : { kind: 'transient', error: invalidResponse() }
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 403 && error.errorCode === 'ACCOUNT_SUSPENDED')
        return { kind: 'denied', reason: 'suspended' }
      if (error.status === 401) return { kind: 'denied', reason: 'expired' }
      return { kind: 'transient', error }
    }
  }

  /** refresh 교환(대기열 경유). REFRESH_INVALID면 D5대로 한 번 더(최대 2시도). */
  async function refreshExchange(myGen: number): Promise<RefreshExchange> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let data: unknown
      try {
        const result = await enqueue(
          () =>
            raw({
              method: 'POST',
              path: '/auth/token/refresh',
              csrfHeader: true,
            }),
          () => !isCurrent(myGen),
        )
        if (result === SKIPPED) return { kind: 'stale' }
        data = result
      } catch (error) {
        if (!(error instanceof ApiError)) throw error
        if (error.status === 403 && error.errorCode === 'ACCOUNT_SUSPENDED')
          return { kind: 'suspended' }
        if (error.status === 401) {
          if (attempt === 0 && error.errorCode === 'REFRESH_INVALID') {
            await deps.sleep(deps.refreshRetryDelayMs)
            if (!isCurrent(myGen)) return { kind: 'stale' }
            continue
          }
          return { kind: 'invalid' }
        }
        return { kind: 'transient', error }
      }
      const access =
        typeof data === 'object' && data !== null && 'accessToken' in data
          ? data.accessToken
          : null
      return typeof access === 'string' && access !== ''
        ? { kind: 'token', token: access }
        : { kind: 'transient', error: invalidResponse() }
    }
    return { kind: 'invalid' }
  }

  /** 로컬 세션 종료(서버 logout 없음). 자기 세대일 때만, 통지는 세대를 올린 뒤 1회. */
  function endSession(reason: SessionEndReason, myGen: number): void {
    if (!isCurrent(myGen)) return
    generation += 1
    clearMemory()
    removeHint()
    for (const listener of [...listeners]) {
      try {
        listener(reason)
      } catch {
        // 한 구독자의 오류가 다른 구독자를 막지 않는다.
      }
    }
  }

  /** 보호 요청의 TOKEN_EXPIRED에서만 쓰는 재발급. 같은 세대 안에서 하나만 돈다(single-flight). */
  function refreshOnce(myGen: number): Promise<RefreshResult> {
    if (refreshInFlight && refreshInFlight.gen === myGen)
      return refreshInFlight.promise
    const expectedUserId = userId
    const promise = (async (): Promise<RefreshResult> => {
      const exchange = await refreshExchange(myGen)
      if (exchange.kind === 'stale') return { ok: false, error: null }
      if (exchange.kind === 'invalid') {
        endSession('expired', myGen)
        return { ok: false, error: null }
      }
      if (exchange.kind === 'suspended') {
        endSession('suspended', myGen)
        return { ok: false, error: null }
      }
      if (exchange.kind === 'transient')
        return { ok: false, error: exchange.error }
      // 그 사이 로그아웃·새 로그인이 시작됐으면 후보 토큰으로 확인 요청도 보내지 않는다.
      if (!isCurrent(myGen)) return { ok: false, error: null }
      const check = await checkMe(exchange.token)
      if (check.kind === 'transient') return { ok: false, error: check.error }
      if (check.kind === 'denied') {
        endSession(check.reason, myGen)
        return { ok: false, error: null }
      }
      if (!isCurrent(myGen)) return { ok: false, error: null }
      if (expectedUserId === null || check.me.userId !== expectedUserId) {
        // D10 ②: 사용 중에는 다른 회원을 이어받지 않는다. 후보 토큰은 버리고 원요청도 다시 보내지 않는다.
        endSession('accountChanged', myGen)
        return { ok: false, error: null }
      }
      token = exchange.token
      return { ok: true }
    })()
    const entry = { gen: myGen, promise }
    refreshInFlight = entry
    // 자기 작업일 때만 비운다(그 사이 다른 세대의 재발급이 들어왔을 수 있다).
    const release = () => {
      if (refreshInFlight === entry) refreshInFlight = null
    }
    promise.then(release, release)
    return promise
  }

  // ---- 공개 동작

  async function login(email: string, password: string): Promise<LoginOutcome> {
    generation += 1
    const myGen = generation
    clearMemory()
    let loginUserId: number
    let candidate: string
    try {
      const result = await enqueue(
        () =>
          raw({
            method: 'POST',
            path: '/auth/login',
            body: { email, password },
          }),
        () => !isCurrent(myGen),
      )
      if (result === SKIPPED)
        return { gen: myGen, ok: false, reason: 'unavailable' }
      const data = result as Record<string, unknown> | null | undefined
      const user = data?.user as Record<string, unknown> | null | undefined
      if (
        typeof data?.accessToken !== 'string' ||
        data.accessToken === '' ||
        typeof user?.userId !== 'number'
      ) {
        return { gen: myGen, ok: false, reason: 'unavailable' }
      }
      candidate = data.accessToken
      loginUserId = user.userId
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 401 && error.errorCode === 'LOGIN_FAILED')
        return { gen: myGen, ok: false, reason: 'invalid' }
      if (error.status === 403 && error.errorCode === 'ACCOUNT_SUSPENDED')
        return {
          gen: myGen,
          ok: false,
          reason: 'suspended',
          message: error.message || undefined,
        }
      return { gen: myGen, ok: false, reason: 'unavailable' }
    }

    // 그 사이 로그아웃·새 로그인이 시작됐으면 확인 요청을 보내지 않는다(쿠키 정리는 새 의도가 대기열 순서대로 한다).
    if (!isCurrent(myGen))
      return { gen: myGen, ok: false, reason: 'unavailable' }
    const check = await checkMe(candidate)
    if (check.kind === 'me' && check.me.userId === loginUserId) {
      if (!isCurrent(myGen))
        return { gen: myGen, ok: false, reason: 'unavailable' }
      token = candidate
      userId = check.me.userId
      writeHint(check.me.userId)
      return { gen: myGen, ok: true, me: check.me }
    }
    // 확인 실패·불일치: 임시 토큰을 버리고, 지금 세대일 때만 방금 받은 쿠키를 정리한다(보상 logout, 기다리지 않음).
    if (isCurrent(myGen)) {
      enqueue(
        () => raw({ method: 'POST', path: '/auth/logout', csrfHeader: true }),
        () => !isCurrent(myGen),
      ).catch(() => undefined)
    }
    return { gen: myGen, ok: false, reason: 'unavailable' }
  }

  /** 앱 시작 확인. 힌트가 없으면 null(요청 없음). 같은 페이지에서 지금 세대의 작업이 있으면 그것을 돌려준다(StrictMode 이중 호출). */
  function resume(): Promise<ResumeOutcome> | null {
    if (bootstrapJob)
      return isCurrent(bootstrapJob.gen) ? bootstrapJob.promise : null
    const expectedUserId = readHint()
    if (expectedUserId === null) return null
    generation += 1
    const myGen = generation
    clearMemory()
    const promise = (async (): Promise<ResumeOutcome> => {
      const exchange = await refreshExchange(myGen)
      if (exchange.kind === 'stale')
        return { gen: myGen, ok: false, kind: 'transient' }
      if (exchange.kind === 'transient')
        return { gen: myGen, ok: false, kind: 'transient' }
      if (exchange.kind === 'invalid' || exchange.kind === 'suspended') {
        if (isCurrent(myGen)) removeHint()
        return { gen: myGen, ok: false, kind: 'ended' }
      }
      if (!isCurrent(myGen)) return { gen: myGen, ok: false, kind: 'transient' }
      const check = await checkMe(exchange.token)
      if (check.kind === 'transient')
        return { gen: myGen, ok: false, kind: 'transient' }
      if (check.kind === 'denied') {
        if (isCurrent(myGen)) removeHint()
        return { gen: myGen, ok: false, kind: 'ended' }
      }
      if (!isCurrent(myGen)) return { gen: myGen, ok: false, kind: 'transient' }
      const candidate = exchange.token
      const confirmedUserId = check.me.userId
      if (confirmedUserId === expectedUserId) {
        token = candidate
        userId = confirmedUserId
        return {
          gen: myGen,
          ok: true,
          me: check.me,
          switchedAccount: false,
          activate: () => isCurrent(myGen),
        }
      }
      // D10 ①: 힌트와 다른 회원(B)이다. B 토큰은 아직 공개하지 않는다(업무 요청은 LOGIN_REQUIRED로 막힘).
      // Provider가 A 데이터를 정리한 뒤 activate()를 부르면 그때 토큰·회원·힌트를 B로 확정한다.
      return {
        gen: myGen,
        ok: true,
        me: check.me,
        switchedAccount: true,
        activate: () => {
          if (!isCurrent(myGen)) return false
          token = candidate
          userId = confirmedUserId
          writeHint(confirmedUserId)
          return true
        },
      }
    })()
    bootstrapJob = { gen: myGen, promise }
    return promise
  }

  /** 명시적 로그아웃. 화면 상태는 즉시 비우고, 서버 logout은 대기열 순서대로 보낸다(건너뛰지 않음, 기다리지 않음). */
  function logout(): Promise<void> {
    generation += 1
    clearMemory()
    removeHint()
    return enqueue(
      () => raw({ method: 'POST', path: '/auth/logout', csrfHeader: true }),
      () => false,
    ).then(
      () => undefined,
      // 실패하면 서버 쿠키가 남을 수 있다(알려진 한계). 응답 내용은 기록하지 않는다.
      () => undefined,
    )
  }

  function onSessionEnded(listener: (reason: SessionEndReason) => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  /** 공통 API 호출. 계획 2.3 D "보호 요청"·optional·none 흐름. */
  async function request<T = unknown>(
    method: HttpMethod,
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<T> {
    checkPath(path)
    checkBody(options.body)
    checkHeaders(options.headers, options.body !== undefined)
    const mode = options.auth ?? 'required'
    const base = {
      method,
      path,
      body: options.body,
      headers: options.headers,
      signal: options.signal,
    }

    /**
     * 요청 1회 전송. cookieChanging이면 auth 모드와 상관없이 쿠키 변경 대기열을 거친다(Codex R2).
     * isStale은 실행 직전 건너뛸지 판단한다(세션과 무관한 요청은 건너뛰지 않음).
     */
    const dispatch = async (
      request: RawRequest,
      isStale: () => boolean,
    ): Promise<T> => {
      if (!options.cookieChanging) return (await raw(request)) as T
      const result = await enqueue(() => raw(request), isStale)
      if (result === SKIPPED) throw loginRequired()
      return result as T
    }
    const never = () => false

    // none: 세션을 읽지도 바꾸지도 않는다. 비회원 optional: 토큰 없이 보낸다. 둘 다 전역 종료·재발급 없음.
    if (mode === 'none') return dispatch(base, never)

    const myGen = generation
    const usedToken = token
    if (usedToken === null) {
      if (mode === 'required') throw loginRequired()
      return dispatch(base, never)
    }

    const send = (withToken: string): Promise<T> =>
      dispatch({ ...base, token: withToken }, () => !isCurrent(myGen))

    try {
      return await send(usedToken)
    } catch (error) {
      if (!(error instanceof ApiError)) throw error
      if (error.status === 401 && error.errorCode === 'TOKEN_EXPIRED') {
        if (!isCurrent(myGen)) throw error
        let retryToken: string | null
        if (token !== null && token !== usedToken) {
          // 그 사이 다른 요청이 재발급했다: 재발급 없이 현재 토큰으로 1회 재시도.
          retryToken = token
        } else {
          const refreshed = await withSignal(refreshOnce(myGen), options.signal)
          if (!refreshed.ok) throw refreshed.error ?? error
          if (!isCurrent(myGen)) throw error
          retryToken = token
        }
        if (retryToken === null) throw error
        try {
          return await send(retryToken)
        } catch (retryError) {
          if (retryError instanceof ApiError) {
            const reason = sessionEndReasonOf(retryError)
            if (reason && isCurrent(myGen) && token === retryToken)
              endSession(reason, myGen)
          }
          throw retryError
        }
      }
      const reason = sessionEndReasonOf(error)
      if (reason && isCurrent(myGen) && token === usedToken)
        endSession(reason, myGen)
      throw error
    }
  }

  return { login, resume, logout, onSessionEnded, isCurrent, request }
}

export type AuthSession = ReturnType<typeof createAuthSession>

/** D5 대기 시간(ms). 탭 간 재발급 경합 완화용이며 근거 있는 최적값이 아니다. */
export const REFRESH_RETRY_DELAY_MS = 300

/** 앱이 쓰는 세션 하나. 브라우저 fetch·sessionStorage를 쓴다. */
export const authSession: AuthSession = createAuthSession({
  fetch: (input, init) => fetch(input, init),
  getStorage: () => {
    try {
      return typeof window === 'undefined' ? null : window.sessionStorage
    } catch {
      return null
    }
  },
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  refreshRetryDelayMs: REFRESH_RETRY_DELAY_MS,
})
