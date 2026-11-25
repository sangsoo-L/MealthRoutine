// F1 인증 연결 테스트 공용 도구. 테스트 파일이 아니다(이름이 *.test.mjs가 아니라 test:node가 직접 실행하지 않는다).
// 가짜 fetch는 경로별로 응답을 차례로 꺼내 쓴다. 응답 대신 deferred()를 넣으면 테스트가 해제할 때까지 그 요청이 멈춘다(순서 강제).
// 토큰 값은 'access-A1' 같은 가짜 문자열이며 비밀 값이 아니다.

export function deferred() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject, isDeferred: true }
}

const json = (body, status, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

export const ok = (data, status = 200) =>
  json({ success: true, message: '요청 성공', data }, status)
export const fail = (status, errorCode, data, headers) =>
  json(
    { success: false, message: `msg:${errorCode}`, errorCode, data },
    status,
    headers,
  )
export const noContent = () => new Response(null, { status: 204 })
export const networkError = () => {
  const error = new TypeError('fetch failed')
  error.isNetwork = true
  return error
}
export const me = (userId, extra = {}) =>
  ok({
    userId,
    email: `u${userId}@example.test`,
    username: 'Tester',
    nickname: `nick${userId}`,
    role: 'user',
    accountStatus: 'active',
    passwordSet: true,
    pinRegistered: false,
    onboardingCompleted: false,
    ...extra,
  })
export const loginOk = (userId, token) =>
  ok({
    accessToken: token,
    user: {
      userId,
      role: 'user',
      accountStatus: 'active',
      pinRegistered: false,
      onboardingCompleted: false,
    },
    restoredFromWithdrawal: false,
  })
export const refreshOk = (token) => ok({ accessToken: token })

/** 경로별 응답 대기열을 가진 가짜 fetch */
export function createFakeServer() {
  const calls = []
  const routes = new Map()
  function on(key, ...responses) {
    if (!routes.has(key)) routes.set(key, [])
    routes.get(key).push(...responses)
  }
  async function fetchImpl(input, init) {
    const path = input.replace(/^\/api\/v1/, '')
    const key = `${init.method} ${path}`
    const call = {
      key,
      path,
      method: init.method,
      headers: { ...init.headers },
      body:
        init.body instanceof FormData || init.body === undefined
          ? init.body
          : JSON.parse(init.body),
      credentials: init.credentials,
      signal: init.signal,
    }
    calls.push(call)
    const queue = routes.get(key)
    if (!queue || queue.length === 0)
      throw new Error(`테스트에 준비되지 않은 요청: ${key}`)
    let next = queue.shift()
    if (typeof next === 'function') next = next(call)
    if (next && next.isDeferred) {
      const signal = init.signal
      next = await new Promise((resolve, reject) => {
        if (signal) {
          if (signal.aborted) return reject(signal.reason)
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          })
        }
        next.promise.then(resolve, reject)
      })
    }
    if (next instanceof Error) throw next
    return next
  }
  return {
    calls,
    on,
    fetch: fetchImpl,
    keys: () => calls.map((c) => c.key),
    auth: (i) => calls[i].headers.Authorization ?? null,
    pending: (key) => routes.get(key)?.length ?? 0,
  }
}

/** Map으로 만든 sessionStorage 대역. broken이면 모든 접근이 예외를 던진다. */
export function createStorage({ broken = false } = {}) {
  const map = new Map()
  const guard = () => {
    if (broken) throw new Error('storage blocked')
  }
  return {
    map,
    getItem: (k) => (guard(), map.has(k) ? map.get(k) : null),
    setItem: (k, v) => (guard(), map.set(k, String(v))),
    removeItem: (k) => (guard(), map.delete(k)),
    get length() {
      guard()
      return map.size
    },
    key: (i) => (guard(), [...map.keys()][i] ?? null),
  }
}

/** 마이크로태스크·즉시 실행 작업을 충분히 비운다(고정 시간 대기 아님). */
export async function flush(times = 5) {
  for (let i = 0; i < times; i += 1)
    await new Promise((resolve) => setImmediate(resolve))
}

/** 교착 검출: 유한한 시간 안에 끝나지 않으면 실패한다. */
export function within(promise, ms = 2000) {
  let timer
  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`교착: ${ms}ms 안에 끝나지 않음`)),
        ms,
      )
    }),
  ])
}
