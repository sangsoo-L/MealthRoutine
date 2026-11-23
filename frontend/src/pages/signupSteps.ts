/**
 * 회원가입(A03)의 3단계 구성과 단계별 판정. React에 의존하지 않는 순수 함수다.
 *
 * 검증 규칙은 새로 만들지 않고 signupValidation.ts의 `validateSubmit`을 그대로 쓴다.
 * `validateSubmit`은 확인 순서(1단계 → 2단계 → 3단계)대로 첫 오류만 돌려주므로,
 * "그 오류의 입력이 몇 단계에 있는가"만 보면 단계별 진행 가능 여부를 알 수 있다.
 * (앞 단계에 오류가 있으면 뒤 단계는 진행할 수 없다. 이전 단계 값이 무효가 되면 자동으로 다시 계산된다.)
 *
 * 가입 모드(`SignupMode`, F2-D1): server(실제 서버 가입)는 휴대폰·주소·인증 입력을 보이지도 확인하지도 않는다.
 * mock(개발 서버 + `VITE_DEV_AUTH=true`)은 기존 개발용 흐름 그대로다.
 *
 * 필드 노출(순차 등장)은 입력값에서 파생한다. 별도 상태로 저장하지 않는다.
 * 한 번 값이 들어간 필드는 값이 지워지기 전까지 계속 보인다(이전 필드를 고쳐도 입력한 값을 숨기거나 지우지 않는다).
 */
import {
  SIGNUP_MESSAGES,
  checkEmailInput,
  checkIdentityInput,
  isPasswordReady,
  isValidName,
  isValidNickname,
  isValidPhone,
  passwordRules,
  validateSubmit,
  type FieldKey,
  type SignupError,
  type SignupMode,
  type SignupValues,
  type Verification,
} from './signupValidation.ts'

export type SignupStep = 1 | 2 | 3

export interface StepMeta {
  step: SignupStep
  /** 진행 표시와 단계 제목에 쓰는 이름 */
  label: string
  description: string
}

/** 모의 모드(개발용 흐름)의 단계 구성 */
export const SIGNUP_STEPS: readonly StepMeta[] = [
  {
    step: 1,
    label: '본인 확인',
    description: '이름과 휴대폰 번호를 입력해 주세요.',
  },
  {
    step: 2,
    label: '프로필 정보',
    description: '서비스에서 쓸 닉네임과 주소를 입력해 주세요.',
  },
  {
    step: 3,
    label: '계정 정보',
    description: '로그인에 쓸 이메일과 비밀번호를 정해 주세요.',
  },
]

/**
 * 실제 서버 가입의 단계 구성. 3단계 틀은 같고 휴대폰·주소가 없다.
 * 본인인증을 하지 않으므로 1단계 이름을 "본인 확인"으로 부르지 않는다(인증을 마친 것으로 오해하지 않게).
 */
export const SERVER_SIGNUP_STEPS: readonly StepMeta[] = [
  {
    step: 1,
    label: '기본 정보',
    description: '이름을 입력해 주세요.',
  },
  {
    step: 2,
    label: '프로필 정보',
    description: '서비스에서 쓸 닉네임을 입력해 주세요.',
  },
  {
    step: 3,
    label: '계정 정보',
    description: '로그인에 쓸 이메일과 비밀번호를 정해 주세요.',
  },
]

export function signupStepsFor(mode: SignupMode): readonly StepMeta[] {
  return mode === 'server' ? SERVER_SIGNUP_STEPS : SIGNUP_STEPS
}

/** 각 입력이 속한 단계. 9개 필드가 빠짐없이 한 단계에 속한다(server 모드에서 숨기는 필드도 자리는 같다). */
export const FIELD_STEP: Record<FieldKey, SignupStep> = {
  name: 1,
  phone: 1,
  nickname: 2,
  address: 2,
  addressDetail: 2,
  email: 3,
  password: 3,
  passwordConfirm: 3,
  consent: 3,
}

/** 인증 여부를 따지지 않고 "입력값 자체"만 볼 때 쓰는 값. */
const INPUT_ONLY: Verification = { phone: true, email: true }

/** 현재 단계까지 막고 있는 첫 오류. 없으면 null. */
function blockingError(
  step: SignupStep,
  values: SignupValues,
  verified: Verification,
  mode: SignupMode,
): SignupError | null {
  const error = validateSubmit(values, verified, mode)
  if (!error || FIELD_STEP[error.field] > step) return null
  return error
}

/**
 * "다음"을 눌렀을 때의 단계 검증(모의 모드는 인증 여부 포함). 통과하면 null.
 * 모의 모드의 본인 확인 단계에서 입력 형식이 틀리면 합친 문구 대신 이름·휴대폰 각각의 구체적인 오류를 돌려준다.
 */
export function validateStep(
  step: SignupStep,
  values: SignupValues,
  verified: Verification,
  mode: SignupMode,
): SignupError | null {
  const error = blockingError(step, values, verified, mode)
  if (
    error &&
    error.region === 'identity' &&
    error.message === SIGNUP_MESSAGES.identityInvalid
  ) {
    return checkIdentityInput(values.name, values.phone) ?? error
  }
  return error
}

/**
 * 단계의 "다음" 버튼을 활성화할지. 입력값이 그 단계의 규칙을 만족하는지만 본다(인증 여부는 제외).
 * 인증은 "다음"을 눌렀을 때 validateStep이 따로 막는다. 즉 입력 완료와 이동 허용은 별개다.
 */
export function isStepInputValid(
  step: SignupStep,
  values: SignupValues,
  mode: SignupMode,
): boolean {
  return blockingError(step, values, INPUT_ONLY, mode) === null
}

/** 순차 등장: 각 필드를 지금 보여 줄지(입력값에서 파생). 현재 단계의 첫 필드는 항상 보인다. */
export function visibleFields(
  values: SignupValues,
  verified: Verification,
  mode: SignupMode,
): Record<FieldKey, boolean> {
  const rulesMet = Object.values(passwordRules(values.password)).every(Boolean)
  const mock = mode === 'mock'
  return {
    name: true,
    // server 모드에는 휴대폰·주소 입력이 없다(서버가 받지 않는 값, F2-D1).
    phone: mock && (isValidName(values.name) || values.phone !== ''),
    nickname: true,
    address:
      mock && (isValidNickname(values.nickname) || values.address !== ''),
    // 상세 주소는 기본 주소를 고른 뒤에 나타난다. 한 번 값이 들어가면 기본 주소가 바뀌어 비워지기 전까지 보인다.
    addressDetail:
      mock && (values.address !== '' || values.addressDetail !== ''),
    email: true,
    // 모의: 비밀번호는 이메일 인증을 마친 뒤에 나타난다. server: 이메일 형식이 맞으면 나타난다(이메일 인증 없음).
    // 한 번 값이 들어가면 이메일을 고쳐도 입력값은 보존한다(제출은 검증이 막는다).
    password:
      (mock ? verified.email : checkEmailInput(values.email) === null) ||
      values.password !== '',
    passwordConfirm: rulesMet || values.passwordConfirm !== '',
    consent:
      isPasswordReady(values.password, values.passwordConfirm) ||
      values.consent,
  }
}

/**
 * 입력창을 벗어났을 때(blur)의 오류. 값이 비어 있으면 오류를 만들지 않는다(빈 값은 제출 때 처리).
 * 글자를 입력하는 도중에는 호출하지 않는다.
 */
export function fieldBlurError(
  field: FieldKey,
  values: SignupValues,
): SignupError | null {
  switch (field) {
    case 'name':
      return values.name !== '' && !isValidName(values.name)
        ? {
            region: 'identity',
            field: 'name',
            message: SIGNUP_MESSAGES.nameInvalid,
          }
        : null
    case 'phone':
      return values.phone !== '' && !isValidPhone(values.phone)
        ? {
            region: 'identity',
            field: 'phone',
            message: SIGNUP_MESSAGES.phoneInvalid,
          }
        : null
    case 'nickname':
      return values.nickname !== '' && !isValidNickname(values.nickname)
        ? {
            region: 'nickname',
            field: 'nickname',
            message: SIGNUP_MESSAGES.nicknameInvalid,
          }
        : null
    case 'email':
      return values.email !== '' ? checkEmailInput(values.email) : null
    default:
      return null
  }
}
