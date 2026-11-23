/**
 * 회원가입(A03) 입력 검증. React에 의존하지 않는 순수 함수라서 화면 없이도 규칙을 확인할 수 있다.
 *
 * 이름·닉네임·비밀번호·이메일 규칙은 서버 가입 API(`SignupRequest`)와 같다(decisions NAME-1·NAME-2·PW-1·PW-2·EMAIL-1, F2-D2).
 * 서버가 거절할 값을 화면에서 먼저 막기 위해서다. 정규식을 바꾸면 서버 쪽과 tests/signupConnect.test.mjs 경계값도 함께 확인한다.
 *
 * 가입 모드(F2-D1):
 * - `server`(기본, 실제 서버 가입): 서버가 받는 입력(이름·닉네임·이메일·비밀번호·동의)만 확인한다.
 *   휴대폰·주소·본인인증·이메일 인증은 서버 API가 없어 확인하지 않는다(화면에서도 숨긴다).
 * - `mock`(개발 서버 + `VITE_DEV_AUTH=true`): 기존 개발용 흐름(휴대폰·주소·인증 대체 절차)을 그대로 확인한다.
 *   규칙(이름·닉네임·비밀번호)은 server와 같은 새 규칙을 쓴다.
 */

export type SignupMode = 'server' | 'mock'

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
  /** 기본 주소. 주소 검색 결과로만 채워진다(직접 입력하지 않는다). 모의 모드에서만 쓴다. */
  address: string
  /** 상세 주소(동·호수 등). 기본 주소를 선택한 뒤 직접 입력한다. 기본 주소가 바뀌면 비운다. 모의 모드에서만 쓴다. */
  addressDetail: string
  email: string
  password: string
  passwordConfirm: string
  consent: boolean
}

/** 휴대폰·이메일 인증 완료 여부(모의 모드의 개발용 대체 절차). 실제 인증 API는 없다. */
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
  nameInvalid:
    '이름은 한글 2~10자 또는 영문 2~30자로 입력해 주세요. 한글·영문을 섞거나 숫자·기호는 쓸 수 없어요.',
  phoneInvalid: '휴대폰 번호를 올바르게 입력해 주세요. 예: 01012345678',
  emailInvalid: '이메일 형식을 확인해 주세요.',
  identityInvalid: '이름과 휴대폰 번호를 확인해 주세요.',
  identityNotVerified: '이름·휴대폰 번호 본인인증을 완료해 주세요.',
  nicknameInvalid:
    '닉네임은 한글·영문·숫자로 입력해 주세요. 한글이 있으면 2~8자, 없으면 2~16자예요.',
  addressInvalid: '주소를 확인해 주세요.',
  addressDetailRequired: '상세 주소를 입력해 주세요.',
  emailNotVerified: '이메일 인증을 완료해 주세요.',
  passwordRules:
    '비밀번호는 8~64자이며 영문, 숫자, 특수문자를 모두 포함해야 해요. 공백·한글은 쓸 수 없어요.',
  passwordMismatch: '비밀번호 확인이 일치하지 않아요.',
  consentRequired: '필수 이용 안내를 확인해 주세요.',
  // 아래는 실제 서버 가입 결과 문구다(SignupPage).
  // 이메일 중복은 계정 존재를 직접 말하지 않는 서버 문구와 같다(EMAIL-2).
  emailUnavailable: '사용할 수 없는 이메일입니다. 다른 이메일을 입력해 주세요.',
  nicknameTaken: '이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요.',
  // 서버 검증 400은 필드별 정보가 없어 공통 안내만 한다(필드별 안내는 위 화면 검증이 맡는다).
  invalidRequest: '입력한 내용을 다시 확인해 주세요.',
  // F1-MESSAGE-1과 같은 연결 실패 문구. 네트워크 오류·서버 오류에 쓴다. 자동으로 다시 보내지 않는다.
  connectionFailed: '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
  // 모의 모드에서 가입 체험을 쓸 수 없을 때의 안내. 실제 계정을 만들지 않는다.
  submitNotice: '가입 흐름을 체험합니다. 실제 계정은 생성하지 않습니다.',
} as const

export const PASSWORD_MATCH_TEXT = {
  empty: '비밀번호를 한 번 더 입력해 주세요.',
  match: '✓ 비밀번호가 일치합니다.',
  mismatch: '비밀번호가 일치하지 않습니다.',
} as const

export type PasswordMatchState = keyof typeof PASSWORD_MATCH_TEXT

export type PasswordRuleKey =
  'length' | 'letters' | 'special' | 'number' | 'charset'

export const PASSWORD_RULE_LABELS: ReadonlyArray<{
  key: PasswordRuleKey
  label: string
}> = [
  { key: 'length', label: '8~64자' },
  { key: 'letters', label: '영문' },
  { key: 'special', label: '특수문자' },
  { key: 'number', label: '숫자' },
  { key: 'charset', label: '공백·한글 없음' },
]

// 서버 SignupRequest와 같은 정규식(Java와 JavaScript에서 같은 뜻으로 쓰이는 문법만 사용).
/** NAME-1: 한글만 2~10자, 또는 영문(단어 사이 공백 1칸)만 2~30자 */
const NAME_RULE = /^(?:[가-힣]{2,10}|(?=.{2,30}$)[A-Za-z]+(?: [A-Za-z]+)*)$/
/** NAME-2: 한글·영문·숫자만. 한글이 있으면 2~8자, 없으면 2~16자 */
const NICKNAME_RULE =
  /^(?:(?=.*[가-힣])[가-힣A-Za-z0-9]{2,8}|[A-Za-z0-9]{2,16})$/
/** PW-1의 특수문자: 영문·숫자·공백이 아닌 출력 가능한 ASCII */
const PASSWORD_SPECIAL = /[!-/:-@[-`{-~]/
/** PW-2: 출력 가능한 ASCII만(공백 제외) */
const PASSWORD_CHARSET = /^[!-~]*$/
const EMAIL_FORMAT = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 255

export function passwordRules(
  password: string,
): Record<PasswordRuleKey, boolean> {
  return {
    length: password.length >= 8 && password.length <= 64,
    letters: /[A-Za-z]/.test(password),
    special: PASSWORD_SPECIAL.test(password),
    number: /[0-9]/.test(password),
    // 빈 값은 "충족"으로 보이지 않게 한다(아직 입력 전).
    charset: password.length > 0 && PASSWORD_CHARSET.test(password),
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

/** 비밀번호 조건을 모두 충족하고 확인값이 일치해야 가입 버튼이 활성화된다. */
export function isPasswordReady(password: string, confirm: string): boolean {
  return allRulesMet(password) && password === confirm
}

export function isValidPhone(phone: string): boolean {
  return /^01\d{8,9}$/.test(phone.replace(/\D/g, ''))
}

/** 앞뒤 공백은 빼고 판단한다. 서버에는 앞뒤 공백을 뺀 값을 보낸다(signupApi). */
export function isValidName(name: string): boolean {
  return NAME_RULE.test(name.trim())
}

/** 앞뒤 공백은 빼고 판단한다. 서버에는 앞뒤 공백을 뺀 값을 보낸다(signupApi). */
export function isValidNickname(nickname: string): boolean {
  return NICKNAME_RULE.test(nickname.trim())
}

/** `본인인증` 버튼을 눌렀을 때의 입력 확인(모의 모드). 형식이 맞으면 null이며 이때 다른 동작은 없다. */
export function checkIdentityInput(
  name: string,
  phone: string,
): SignupError | null {
  if (!isValidName(name)) {
    return {
      region: 'identity',
      field: 'name',
      message: SIGNUP_MESSAGES.nameInvalid,
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

/** 이메일 형식 확인. 형식이 맞으면 null이다. 서버처럼 앞뒤 공백은 빼고 본다(EMAIL-1). */
export function checkEmailInput(email: string): SignupError | null {
  const trimmed = email.trim()
  return EMAIL_FORMAT.test(trimmed) && trimmed.length <= EMAIL_MAX_LENGTH
    ? null
    : {
        region: 'email',
        field: 'email',
        message: SIGNUP_MESSAGES.emailInvalid,
      }
}

/**
 * 제출 시 검증. 확인 순서(1단계 → 2단계 → 3단계)대로 첫 번째 오류만 돌려주며, 통과하면 null이다.
 * 빈 값은 브라우저 기본 검증(required)이 제출 이벤트 전에 먼저 처리한다.
 * server 모드는 휴대폰·주소·인증을 확인하지 않는다(F2-D1). mock 모드는 기존 순서 그대로다.
 */
export function validateSubmit(
  values: SignupValues,
  verified: Verification,
  mode: SignupMode,
): SignupError | null {
  if (mode === 'server') {
    if (!isValidName(values.name)) {
      return {
        region: 'identity',
        field: 'name',
        message: SIGNUP_MESSAGES.nameInvalid,
      }
    }
  } else {
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
  }
  if (!isValidNickname(values.nickname)) {
    return {
      region: 'nickname',
      field: 'nickname',
      message: SIGNUP_MESSAGES.nicknameInvalid,
    }
  }
  if (mode === 'mock') {
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
  }
  if (mode === 'server') {
    const emailError = checkEmailInput(values.email)
    if (emailError) return emailError
  } else if (!verified.email) {
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
