/**
 * 회원가입(A03) 입력 검증. 규칙과 문구는 스토리보드의 A03 정의를 그대로 옮긴 것이다.
 * React에 의존하지 않는 순수 함수라서 화면 없이도 규칙을 확인할 수 있다.
 */

export type FieldKey =
  | 'name'
  | 'phone'
  | 'nickname'
  | 'address'
  | 'addressDetail'
  | 'email'
  | 'password'
  | 'passwordConfirm'
  | 'consent'

/** 오류 메시지를 보여 주는 영역. 같은 영역의 입력을 고칠 때만 그 영역의 오류를 지운다. */
export type Region =
  'identity' | 'nickname' | 'address' | 'email' | 'password' | 'consent'

export const FIELD_REGION: Record<FieldKey, Region> = {
  name: 'identity',
  phone: 'identity',
  nickname: 'nickname',
  address: 'address',
  addressDetail: 'address',
  email: 'email',
  password: 'password',
  passwordConfirm: 'password',
  consent: 'consent',
}

export interface SignupValues {
  name: string
  phone: string
  nickname: string
  /** 기본 주소. 주소 검색 결과로만 채워진다(직접 입력하지 않는다). */
  address: string
  /** 상세 주소(동·호수 등). 기본 주소를 선택한 뒤 직접 입력한다. 기본 주소가 바뀌면 비운다. */
  addressDetail: string
  email: string
  password: string
  passwordConfirm: string
  consent: boolean
}

/** 휴대폰·이메일 인증 완료 여부. 인증은 서버·외부 서비스가 필요해 현재 화면에서는 항상 false다. */
export interface Verification {
  phone: boolean
  email: boolean
}

export interface SignupError {
  region: Region
  /** 포커스를 옮기고 aria-invalid를 표시할 입력 */
  field: FieldKey
  message: string
}

export const SIGNUP_MESSAGES = {
  nameTooShort: '이름을 2자 이상 입력해 주세요.',
  phoneInvalid: '휴대폰 번호를 올바르게 입력해 주세요. 예: 01012345678',
  emailInvalid: '이메일 형식을 확인해 주세요.',
  identityInvalid: '이름과 휴대폰 번호를 확인해 주세요.',
  identityNotVerified: '이름·휴대폰 번호 본인인증을 완료해 주세요.',
  nicknameLength: '닉네임은 2~20자로 입력해 주세요.',
  addressInvalid: '주소를 확인해 주세요.',
  addressDetailRequired: '상세 주소를 입력해 주세요.',
  emailNotVerified: '이메일 인증을 완료해 주세요.',
  passwordRules:
    '비밀번호는 8자 이상이며 영어 대문자·소문자, 특수문자, 숫자를 모두 포함해야 합니다.',
  passwordMismatch: '비밀번호 확인이 일치하지 않아요.',
  consentRequired: '필수 이용 안내를 확인해 주세요.',
  // 모든 검증을 통과했을 때 보여 주는 안내. 운영 빌드에서는 이 안내만 보이며 계정 생성도 화면 이동도 하지 않는다.
  // 개발 서버에서는 이 안내 대신 개발용 가입 체험 흐름(초기설문 A02)으로 이동한다(SignupPage).
  submitNotice: '가입 흐름을 체험합니다. 실제 계정은 생성하지 않습니다.',
} as const

export const PASSWORD_MATCH_TEXT = {
  empty: '비밀번호를 한 번 더 입력해 주세요.',
  match: '✓ 비밀번호가 일치합니다.',
  mismatch: '비밀번호가 일치하지 않습니다.',
} as const

export type PasswordMatchState = keyof typeof PASSWORD_MATCH_TEXT

export type PasswordRuleKey = 'length' | 'letters' | 'special' | 'number'

export const PASSWORD_RULE_LABELS: ReadonlyArray<{
  key: PasswordRuleKey
  label: string
}> = [
  { key: 'length', label: '8자 이상' },
  { key: 'letters', label: '영어 대·소문자' },
  { key: 'special', label: '특수문자' },
  { key: 'number', label: '숫자' },
]

export function passwordRules(
  password: string,
): Record<PasswordRuleKey, boolean> {
  return {
    length: password.length >= 8,
    letters: /[a-z]/.test(password) && /[A-Z]/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
    number: /[0-9]/.test(password),
  }
}

function allRulesMet(password: string): boolean {
  return Object.values(passwordRules(password)).every(Boolean)
}

export function passwordMatchState(
  password: string,
  confirm: string,
): PasswordMatchState {
  if (!confirm) return 'empty'
  return password === confirm ? 'match' : 'mismatch'
}

/** 비밀번호 네 가지 조건을 모두 충족하고 확인값이 일치해야 가입 버튼이 활성화된다. */
export function isPasswordReady(password: string, confirm: string): boolean {
  return allRulesMet(password) && password === confirm
}

export function isValidPhone(phone: string): boolean {
  return /^01\d{8,9}$/.test(phone.replace(/\D/g, ''))
}

export function isValidName(name: string): boolean {
  return name.trim().length >= 2
}

/** `본인인증` 버튼을 눌렀을 때의 입력 확인. 형식이 맞으면 null이며 이때 다른 동작은 없다. */
export function checkIdentityInput(
  name: string,
  phone: string,
): SignupError | null {
  if (!isValidName(name)) {
    return {
      region: 'identity',
      field: 'name',
      message: SIGNUP_MESSAGES.nameTooShort,
    }
  }
  if (!isValidPhone(phone)) {
    return {
      region: 'identity',
      field: 'phone',
      message: SIGNUP_MESSAGES.phoneInvalid,
    }
  }
  return null
}

/** `중복확인` 버튼을 눌렀을 때의 입력 확인. 형식이 맞으면 null이며 이때 다른 동작은 없다. */
export function checkEmailInput(email: string): SignupError | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? null
    : {
        region: 'email',
        field: 'email',
        message: SIGNUP_MESSAGES.emailInvalid,
      }
}

/**
 * 제출 시 검증. 스토리보드의 확인 순서대로 첫 번째 오류만 돌려주며, 통과하면 null이다.
 * 빈 값과 이메일 형식 같은 브라우저 기본 검증은 제출 이벤트 전에 이미 처리된다.
 *
 * 주의: 서버 연동 후에는 이름·휴대폰 번호나 이메일을 바꾸면 해당 인증이 무효가 되도록
 * `verified`를 갱신해야 한다.
 */
export function validateSubmit(
  values: SignupValues,
  verified: Verification,
): SignupError | null {
  if (!isValidName(values.name) || !isValidPhone(values.phone)) {
    return {
      region: 'identity',
      field: isValidName(values.name) ? 'phone' : 'name',
      message: SIGNUP_MESSAGES.identityInvalid,
    }
  }
  if (!verified.phone) {
    return {
      region: 'identity',
      field: 'phone',
      message: SIGNUP_MESSAGES.identityNotVerified,
    }
  }
  const nickname = values.nickname.trim()
  if (nickname.length < 2 || nickname.length > 20) {
    return {
      region: 'nickname',
      field: 'nickname',
      message: SIGNUP_MESSAGES.nicknameLength,
    }
  }
  if (values.address.trim().length < 5) {
    return {
      region: 'address',
      field: 'address',
      message: SIGNUP_MESSAGES.addressInvalid,
    }
  }
  if (values.addressDetail.trim().length === 0) {
    return {
      region: 'address',
      field: 'addressDetail',
      message: SIGNUP_MESSAGES.addressDetailRequired,
    }
  }
  if (!verified.email) {
    return {
      region: 'email',
      field: 'email',
      message: SIGNUP_MESSAGES.emailNotVerified,
    }
  }
  if (!allRulesMet(values.password)) {
    return {
      region: 'password',
      field: 'password',
      message: SIGNUP_MESSAGES.passwordRules,
    }
  }
  if (values.password !== values.passwordConfirm) {
    return {
      region: 'password',
      field: 'passwordConfirm',
      message: SIGNUP_MESSAGES.passwordMismatch,
    }
  }
  if (!values.consent) {
    return {
      region: 'consent',
      field: 'consent',
      message: SIGNUP_MESSAGES.consentRequired,
    }
  }
  return null
}
