/**
 * API 호출의 가장 아래 단계: 요청 검증, fetch 한 번, 응답 해석.
 * 토큰·재발급·세션은 모른다(session.ts가 담당). 다른 파트는 이 파일을 직접 쓰지 않고 `api/http.ts`의 `apiRequest`를 쓴다.
 *
 * 응답 형식(백엔드 ApiResponse): 성공 `{ success: true, message, data }`, 실패 `{ success: false, message, errorCode, data? }`.
 * 204·빈 본문은 해석하지 않고 `undefined`를 돌려준다.
 */

/** 모든 API 경로 앞에 붙는 접두어. 브라우저는 같은 출처로만 호출하고 개발 서버(proxy)·배포 서버가 백엔드로 전달한다. */
export const API_PREFIX = '/api/v1'

/** 네트워크 실패(서버에 닿지 못함)의 errorCode. status는 0이다. */
export const NETWORK_ERROR = 'NETWORK'
/** 응답이 JSON이 아니거나 공통 형식과 다를 때의 errorCode. */
export const INVALID_RESPONSE = 'INVALID_RESPONSE'
/** 요청을 보내기 전에 막은 잘못된 호출(경로·헤더·본문)의 errorCode. status는 0이다. */
export const INVALID_REQUEST = 'INVALID_REQUEST'

/**
 * API 실패. 서버 응답이면 status·errorCode·message가 서버 값이고, `data`는 실패 상세(PIN 남은 횟수 등)를 그대로 담는다.
 * 토큰·비밀번호 같은 요청 값은 담지 않는다.
 */
export class ApiError extends Error {
  readonly status: number
  readonly errorCode: string
  readonly data: unknown
  /** `Retry-After` 헤더의 초. 없으면 undefined */
  readonly retryAfter: number | undefined

  constructor(
    status: number,
    errorCode: string,
    message: string,
    data?: unknown,
    retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.errorCode = errorCode
    this.data = data
    this.retryAfter = retryAfter
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** 호출자가 넣을 수 없는 헤더(소문자로 비교). Content-Type은 본문이 있을 때만 막는다. */
const RESERVED_HEADERS = ['authorization', 'x-requested-with']

/**
 * 경로 검사. `/`로 시작하는 상대 경로만 받는다. 다른 출처로 Bearer 토큰이 나가지 않도록
 * `//`(프로토콜 생략 주소)·`://`·역슬래시를 거부한다.
 */
export function checkPath(path: string): void {
  if (
    typeof path !== 'string' ||
    !path.startsWith('/') ||
    path.includes('//') ||
    path.includes(':/') ||
    path.includes('\\')
  ) {
    throw new ApiError(0, INVALID_REQUEST, 'API 경로가 올바르지 않습니다.')
  }
}

/** 본문 검사. 일반 객체·배열만 JSON으로 보낸다. FormData·Blob 등은 F1에서 지원하지 않는다. */
export function checkBody(body: unknown): void {
  if (body === undefined) return
  if (Array.isArray(body)) return
  if (typeof body === 'object' && body !== null) {
    const proto: unknown = Object.getPrototypeOf(body)
    if (proto === Object.prototype || proto === null) return
  }
  throw new ApiError(
    0,
    INVALID_REQUEST,
    'API 본문은 일반 객체만 보낼 수 있습니다.',
  )
}

/** 추가 헤더 검사. 예약 헤더는 대소문자와 상관없이 거부한다. */
export function checkHeaders(
  headers: Record<string, string> | undefined,
  hasBody: boolean,
): void {
  if (!headers) return
  for (const name of Object.keys(headers)) {
    const lower = name.toLowerCase()
    if (
      RESERVED_HEADERS.includes(lower) ||
      (hasBody && lower === 'content-type')
    ) {
      throw new ApiError(
        0,
        INVALID_REQUEST,
        `${name} 헤더는 직접 넣을 수 없습니다.`,
      )
    }
  }
}

export interface RawRequest {
  method: HttpMethod
  /** `/auth/login`처럼 API_PREFIX 뒤의 경로(checkPath를 통과한 값) */
  path: string
  body?: unknown
  /** 넣으면 `Authorization: Bearer ...`로 보낸다 */
  token?: string | null
  /** refresh·logout처럼 CSRF 확인 헤더가 필요한 요청 */
  csrfHeader?: boolean
  headers?: Record<string, string>
  signal?: AbortSignal
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

function parseRetryAfter(response: Response): number | undefined {
  const raw = response.headers.get('Retry-After')
  if (raw === null) return undefined
  const seconds = Number(raw)
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined
}

function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  )
}

/**
 * fetch 한 번과 응답 해석. 재시도·재발급은 하지 않는다(네트워크 오류·500은 이미 처리됐을 수 있어 자동 재전송하지 않는다).
 * 취소(AbortError)는 바꾸지 않고 그대로 던진다.
 */
export async function sendRaw(
  fetchImpl: FetchLike,
  request: RawRequest,
): Promise<unknown> {
  const headers: Record<string, string> = { ...request.headers }
  if (request.body !== undefined) headers['Content-Type'] = 'application/json'
  if (request.token) headers.Authorization = `Bearer ${request.token}`
  if (request.csrfHeader) headers['X-Requested-With'] = 'XMLHttpRequest'

  let response: Response
  try {
    response = await fetchImpl(API_PREFIX + request.path, {
      method: request.method,
      headers,
      body:
        request.body === undefined ? undefined : JSON.stringify(request.body),
      credentials: 'same-origin',
      signal: request.signal,
    })
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, NETWORK_ERROR, '서버에 연결할 수 없습니다.')
  }

  const retryAfter = parseRetryAfter(response)
  let text: string
  try {
    text = await response.text()
  } catch (error) {
    if (isAbortError(error)) throw error
    throw new ApiError(0, NETWORK_ERROR, '서버에 연결할 수 없습니다.')
  }

  if (response.status === 204 || text === '') {
    if (response.ok) return undefined
    throw new ApiError(
      response.status,
      INVALID_RESPONSE,
      '응답 형식이 올바르지 않습니다.',
      undefined,
      retryAfter,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new ApiError(
      response.status,
      INVALID_RESPONSE,
      '응답 형식이 올바르지 않습니다.',
      undefined,
      retryAfter,
    )
  }
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('success' in parsed) ||
    typeof parsed.success !== 'boolean'
  ) {
    throw new ApiError(
      response.status,
      INVALID_RESPONSE,
      '응답 형식이 올바르지 않습니다.',
      undefined,
      retryAfter,
    )
  }
  const envelope = parsed as {
    success: boolean
    message?: unknown
    data?: unknown
    errorCode?: unknown
  }
  if (envelope.success && response.ok) return envelope.data
  if (!envelope.success && !response.ok) {
    throw new ApiError(
      response.status,
      typeof envelope.errorCode === 'string'
        ? envelope.errorCode
        : INVALID_RESPONSE,
      typeof envelope.message === 'string' ? envelope.message : '',
      envelope.data,
      retryAfter,
    )
  }
  // success 값과 상태 코드가 서로 맞지 않는다.
  throw new ApiError(
    response.status,
    INVALID_RESPONSE,
    '응답 형식이 올바르지 않습니다.',
    undefined,
    retryAfter,
  )
}
