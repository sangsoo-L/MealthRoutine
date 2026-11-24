/**
 * P11 2차 비밀번호 등록 · P12 2차 비밀번호 변경의 입력 규칙.
 * 숫자 6자리, 새 번호 확인 일치, 변경 시 현재 번호와 다른 새 번호(화면명세 v5.0). 서버가 아니라 입력 화면의 즉시 검증이다.
 * 입력값은 화면 상태에만 두고 URL·라우터 state·로그·오류 객체에 넣지 않는다.
 */

export type PinSettingsMode = 'register' | 'change'
export type PinFieldName = 'current' | 'new' | 'confirm'

export interface PinFormValues {
  current: string
  next: string
  confirm: string
}

export interface PinFormIssue {
  field: PinFieldName
  message: string
}

export const PIN_LENGTH = 6
/** 잠기기까지 허용하는 현재 번호 확인 횟수와 잠금 시간. 저장소(개발용)와 화면 문구가 같은 값을 쓴다. */
export const PIN_MAX_ATTEMPTS = 5

/** P11·P12 경로(사용자 승인). P09 메뉴와 화면 사이 이동이 같은 값을 쓴다. */
export const PIN_PATHS = {
  register: '/settings/pin/register',
  change: '/settings/pin/change',
} as const

/** P05 가입 설정 모드 경로(사용자 승인). 회원가입(A03) 다음 단계다. */
export const SIGNUP_PIN_PATH = '/signup/pin'
/** 가입 설정 다음 화면. 정식 흐름은 A02(초기설문)이지만 개발용 가입 체험은 A02를 건너뛰고 이해도 확인으로 이어진다(A03과 같은 우회). */
export const SIGNUP_PIN_NEXT_PATH = '/onboarding/assessment'
/** 가입 설정에서 돌아가는 회원가입(A03) 경로. */
export const SIGNUP_PATH = '/signup'

/** P05 신체 정보 확인 경로(사용자 승인). P01 진입 링크와 P11·P12의 복귀 처리가 같은 값을 쓴다. */
export const BODY_UNLOCK_PATH = '/mypage/body/unlock'
/** P05 인증 성공 뒤와 5회 불일치 뒤에 돌아가는 마이페이지(P01) 경로. */
export const BODY_UNLOCK_RETURN_PATH = '/mypage'

/**
 * P11·P12가 "이전 화면으로 돌아가기"에 쓸 수 있는 진입 경로(`state.from`) 허용 목록.
 * 내부 경로여도 목록 밖이면 무시하고 기본(상세 설정)으로 돌아간다. 쿼리·해시가 붙은 값은 허용하지 않는다.
 */
export const PIN_RETURN_PATHS: readonly string[] = [
  BODY_UNLOCK_PATH,
  '/mypage',
  '/settings',
]

/** P11·P12가 돌아갈 진입 화면과 그 화면이 되돌려 받을 `state`(진입 화면의 "이전" 목적지). */
export interface PinReturn {
  to: string
  state?: { from: string }
}

/** 진입 화면으로 다시 이동하는 링크가 넘길 state. 진입 화면이 없으면(기본 흐름) undefined다. */
export function pinReturnForwardState(
  returnTo: PinReturn | null | undefined,
): { from: string; fromState?: { from: string } } | undefined {
  if (!returnTo) return undefined
  return returnTo.state
    ? { from: returnTo.to, fromState: returnTo.state }
    : { from: returnTo.to }
}

/** 허용 목록의 경로만 돌려주고 그 밖(외부 주소·알 수 없는 경로·형식 오류)은 null이다. */
export function safePinReturn(value: unknown): string | null {
  return typeof value === 'string' && PIN_RETURN_PATHS.includes(value)
    ? value
    : null
}

const DIGITS_ONLY = /^\d+$/

/** 숫자가 아닌 글자를 버리고 6자리까지만 남긴다. 붙여넣기도 같은 규칙이다. */
export function sanitizePinInput(value: string): string {
  return value.replace(/\D/g, '').slice(0, PIN_LENGTH)
}

function formatProblem(value: string, emptyMessage: string): string | null {
  if (value === '') return emptyMessage
  if (!DIGITS_ONLY.test(value)) return '숫자만 입력해 주세요.'
  if (value.length !== PIN_LENGTH) return '숫자 6자리로 입력해 주세요.'
  return null
}

/**
 * 제출 전 검증. 첫 번째 문제만 돌려주며 순서는 화면 순서(현재 → 새 → 확인 → 일치 → 동일)다.
 * 이 검증은 현재 번호 확인(실패 횟수)과 무관하다. 통과해도 실제 확인은 저장소가 한다.
 * `allowSame`: 현재와 같은 새 번호를 허용한다. 서버 모드만 true다(F4-D7, PIN7-9 "같은 PIN 변경 허용").
 * 모의 모드(개발용 저장소)는 기존 규칙대로 막는다.
 */
export function validatePinForm(
  mode: PinSettingsMode,
  values: PinFormValues,
  { allowSame = false }: { allowSame?: boolean } = {},
): PinFormIssue | null {
  if (mode === 'change') {
    const message = formatProblem(
      values.current,
      '현재 2차 비밀번호를 입력해 주세요.',
    )
    if (message) return { field: 'current', message }
  }
  const nextProblem = formatProblem(
    values.next,
    '새 2차 비밀번호를 입력해 주세요.',
  )
  if (nextProblem) return { field: 'new', message: nextProblem }
  const confirmProblem = formatProblem(
    values.confirm,
    '새 2차 비밀번호 확인을 입력해 주세요.',
  )
  if (confirmProblem) return { field: 'confirm', message: confirmProblem }
  if (values.next !== values.confirm)
    return { field: 'confirm', message: '새 비밀번호 확인이 일치하지 않아요.' }
  if (mode === 'change' && !allowSame && values.next === values.current)
    return {
      field: 'new',
      message: '현재와 다른 새 비밀번호를 입력해 주세요.',
    }
  return null
}

/**
 * P05 신체 정보 확인의 입력 검증(현재 번호 한 칸). 형식 문제는 실패 횟수에 넣지 않는다 — 저장소를 부르기 전에 막는다.
 * 통과해도 실제 확인은 저장소(`unlock`)가 한다.
 */
export function validatePinVerifyInput(pin: string): string | null {
  return formatProblem(pin, '2차 비밀번호를 입력해 주세요.')
}
