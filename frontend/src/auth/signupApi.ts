import {
  ApiError,
  INVALID_RESPONSE,
  apiRequest,
  type ApiRequestOptions,
  type HttpMethod,
} from '../api/http.ts'

/**
 * 실제 서버 회원가입 호출(F2). `POST /api/v1/auth/signup`
 *
 * - 서버 계약은 바꾸지 않는다(FE-CONTRACT-1): 보내는 값은 서버가 받는 5개뿐이다.
 *   비밀번호 확인값·휴대폰·주소는 보내지 않는다.
 * - 비회원 요청이므로 `auth: 'none'`이다(기본값 required면 요청 전에 LOGIN_REQUIRED로 막힌다).
 *   가입은 refresh 쿠키를 바꾸지 않아 `cookieChanging`을 붙이지 않는다.
 * - 성공은 **HTTP 201 + 양의 정수 `data.userId`** 일 때만이다(PR #27 리뷰). 그 밖의 성공 응답은 `unconfirmed`로,
 *   가입 완료로 보지 않고 다시 보내지도 않는다(서버에서는 이미 가입됐을 수 있다).
 * - 성공해도 로그인하지 않는다(SIGNUP-RES-1). 화면이 로그인 화면으로 보낸다(F2-D3).
 * - 네트워크 오류·서버 오류에서 자동으로 다시 보내지 않는다(서버가 이미 가입을 끝냈을 수 있다).
 * - 비밀번호는 요청 본문에만 쓰고 결과·로그에 남기지 않는다.
 */

export interface SignupInput {
  name: string
  nickname: string
  email: string
  password: string
  consent: boolean
}

/** 화면이 쓰기 쉬운 결과. 서버 문구 대신 화면 문구(SIGNUP_MESSAGES)로 안내한다. */
export type SignupOutcome =
  | 'success'
  /** 409 EMAIL_UNAVAILABLE: 계정 존재를 직접 말하지 않는다(EMAIL-2) */
  | 'emailUnavailable'
  /** 409 NICKNAME_ALREADY_EXISTS */
  | 'nicknameTaken'
  /** 400 등 입력 오류: 서버는 필드별 정보를 주지 않는다 */
  | 'invalid'
  /** 성공 응답(2xx)이 왔지만 201 + 유효한 userId가 아니다. 가입 여부를 확정할 수 없다 */
  | 'unconfirmed'
  /** 네트워크 오류·서버 오류·그 밖의 예상하지 못한 응답 */
  | 'unavailable'

type RequestFn = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

/** 서버로 보내는 본문. 이름·닉네임·이메일은 앞뒤 공백을 빼고 보낸다. 비밀번호는 그대로 보낸다. */
export function signupBody(input: SignupInput) {
  return {
    email: input.email.trim(),
    password: input.password,
    username: input.name.trim(),
    nickname: input.nickname.trim(),
    isAgreedTerm: input.consent,
  }
}

export function classifySignupError(error: unknown): SignupOutcome {
  if (!(error instanceof ApiError)) return 'unavailable'
  // 2xx인데 형식이 맞지 않음(201이 아님·본문 없음·공통 형식 아님): 서버가 가입을 처리했을 수 있다.
  if (
    error.errorCode === INVALID_RESPONSE &&
    error.status >= 200 &&
    error.status <= 299
  )
    return 'unconfirmed'
  if (error.status === 409 && error.errorCode === 'EMAIL_UNAVAILABLE')
    return 'emailUnavailable'
  if (error.status === 409 && error.errorCode === 'NICKNAME_ALREADY_EXISTS')
    return 'nicknameTaken'
  if (error.status === 400) return 'invalid'
  return 'unavailable'
}

/** 가입 성공 응답의 `data`가 서버 계약(`{ userId: 양의 정수 }`)과 맞는지 */
export function isSignupSuccessData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false
  const userId = (data as Record<string, unknown>).userId
  return (
    typeof userId === 'number' && Number.isSafeInteger(userId) && userId > 0
  )
}

/** 테스트에서는 가짜 fetch를 쓰는 세션의 request를 넘긴다. 앱은 공통 호출(apiRequest)을 쓴다. */
export async function requestSignup(
  input: SignupInput,
  request: RequestFn = apiRequest,
): Promise<SignupOutcome> {
  let data: unknown
  try {
    // expectStatus: 201이 아닌 성공 응답은 공통 호출이 INVALID_RESPONSE로 던진다(이 호출에만 적용).
    data = await request<unknown>('POST', '/auth/signup', {
      auth: 'none',
      body: signupBody(input),
      expectStatus: 201,
    })
  } catch (error) {
    return classifySignupError(error)
  }
  return isSignupSuccessData(data) ? 'success' : 'unconfirmed'
}

/**
 * 늦게 도착한 409가 지금 입력에도 해당하는지(PR #27 리뷰). 서버가 비교하는 기준으로 맞춘다.
 * - 이메일: 앞뒤 공백 제거 + 소문자(서버 `SignupRequest`가 같은 방식으로 바꾼 뒤 비교).
 * - 닉네임: 앞뒤 공백 제거 + 소문자(서버 DB가 대소문자를 구분하지 않고 비교. 보내는 값은 `signupBody`처럼 trim).
 * 값이 바뀌었으면 false: 그 409는 이전 값의 결과이므로 화면에 반영하지 않는다.
 */
export function conflictStillApplies(
  outcome: 'emailUnavailable' | 'nicknameTaken',
  submitted: Pick<SignupInput, 'email' | 'nickname'>,
  current: Pick<SignupInput, 'email' | 'nickname'>,
): boolean {
  const key = (value: string) => value.trim().toLowerCase()
  return outcome === 'emailUnavailable'
    ? key(submitted.email) === key(current.email)
    : key(submitted.nickname) === key(current.nickname)
}

export interface SubmitSignupOptions {
  /** 지금 인증 상태. 'unauthenticated'일 때만 보낸다(loading 중에는 확인이 끝날 때까지 미룸, 로그인 회원은 보내지 않음, F2-D4). */
  status: 'authenticated' | 'unauthenticated' | 'loading'
  /** 응답이 왔을 때 아직 그 화면에 있는지. false면 결과를 반영하지 않는다(새 화면을 덮지 않음). */
  isMounted: () => boolean
  /** 요청을 보내기 직전(동기)에 한 번 부른다. 화면의 "가입하는 중" 표시용 */
  onStart?: () => void
  request?: RequestFn
}

/**
 * 가입 화면의 제출 규칙(F2). React와 분리해 테스트에서 보류 Promise로 순서를 확인한다.
 * - 'blocked': 보내지 않음(이미 보내는 중 = 중복 제출, 또는 비회원 상태가 아님).
 * - 'stale': 보냈지만 응답 전에 화면을 떠남. 서버에서는 가입이 끝났을 수 있으므로 "취소됨"으로 안내하지 않는다.
 * - 그 밖에는 서버 결과. 자동으로 다시 보내지 않는다.
 * `inFlight`는 화면의 ref다(같은 렌더 안의 빠른 두 번 클릭도 막기 위해 state가 아니라 ref를 쓴다).
 */
export async function submitSignupOnce(
  input: SignupInput,
  inFlight: { current: boolean },
  options: SubmitSignupOptions,
): Promise<SignupOutcome | 'blocked' | 'stale'> {
  if (inFlight.current || options.status !== 'unauthenticated') return 'blocked'
  inFlight.current = true
  options.onStart?.()
  const outcome = await requestSignup(input, options.request)
  // 화면을 떠났으면 그 화면의 진행 표시는 다시 쓰지 않으므로 inFlight를 풀지 않는다.
  if (!options.isMounted()) return 'stale'
  inFlight.current = false
  return outcome
}

/**
 * 가입 성공 뒤 로그인 화면으로 넘기는 router state(F2-D3). 표시용 값 하나뿐이며 이메일·비밀번호 등 입력값은 넣지 않는다.
 * 인증·PIN·온보딩 완료의 증거가 아니다. 로그인 화면의 returnTo 검증(safeReturnTo)과 섞이지 않는다(returnTo 키 없음).
 */
export const SIGNED_UP_STATE = { signedUp: true } as const

/** 가입 화면이 넘긴 router state인지. `signedUp === true`만 인정한다. */
export function isSignedUpState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>).signedUp === true
  )
}
