import Icon from '../components/icons/Icon.tsx'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
  type SubmitEvent,
} from 'react'
import {
  AuthBody,
  AuthFrame,
  AuthHero,
  AuthSwitchCard,
  Reveal,
  StepProgress,
} from '../components/auth/AuthParts.tsx'
import {
  actionButtonClass,
  errorClass,
  focusRing,
  inputClass,
  inputWithActionClass,
  labelClass,
  noticeClass,
  primaryButtonClass,
  revealClass,
} from '../components/auth/authStyles.ts'
import {
  FIELD_REGION,
  PASSWORD_MATCH_TEXT,
  PASSWORD_RULE_LABELS,
  SIGNUP_MESSAGES,
  checkEmailInput,
  checkIdentityInput,
  passwordMatchState,
  passwordRules,
  validateSubmit,
  type FieldKey,
  type Region,
  type SignupError,
  type SignupValues,
  type Verification,
} from './signupValidation.ts'
import {
  FIELD_STEP,
  SIGNUP_STEPS,
  fieldBlurError,
  isStepInputValid,
  validateStep,
  visibleFields,
  type SignupStep,
} from './signupSteps.ts'

/**
 * 휴대폰·이메일 인증 완료 여부의 초기값. 인증과 중복확인, 주소 검색은 서버·외부 서비스가 필요한데
 * API 명세에 해당 엔드포인트가 없어 연결하지 않았다. 연동하기 전에는 항상 false이며
 * 이 값이 false라서 1단계의 "다음" 버튼 영역이 나타나지 않고 가입 제출도 인증 단계에서 막힌다.
 * 가짜 인증 성공을 만들지 않는다.
 */
const NOT_VERIFIED: Verification = { phone: false, email: false }

/**
 * [임시·개발 전용] 백엔드 연결 전에 회원가입 흐름을 시험하기 위한 휴대폰 인증 대체 절차.
 * 개발 서버(`npm run dev`)에서만 켜지며 운영 빌드에서는 꺼져 있어(import.meta.env.DEV) 인증을 우회할 수 없다.
 * 인증번호는 v5.0 스토리보드 시안의 고정값(654321)이다. 실제 문자 발송·본인확인은 하지 않는다.
 * 백엔드 인증 API가 연결되면 이 상수와 아래 "[임시·개발 전용]" 표시 코드를 모두 지운다.
 */
const TEMP_DEV_IDENTITY = import.meta.env.DEV
const DEV_IDENTITY_CODE = '654321'

/**
 * [임시·개발 전용] 주소 검색 API 연결 전에 STEP 02를 시험하기 위한 예시 주소 선택. 위와 같은 방식으로 운영 빌드에서는 꺼진다.
 * 실제 사용자 주소가 아니라 개발용 예시 데이터다. 주소 검색이 연결되면 지운다.
 */
const TEMP_DEV_ADDRESS = import.meta.env.DEV

/**
 * [임시·개발 전용] 이메일 인증 API 연결 전에 STEP 03을 시험하기 위한 이메일 인증 대체 절차. 위와 같은 방식으로 운영 빌드에서는 꺼진다.
 * 실제 메일을 보내지 않으며 실제 이메일 소유 확인이 아니다. 인증번호는 휴대폰 시안 번호(654321)와 다른 값이다.
 * 백엔드 인증 API가 연결되면 지운다.
 */
const TEMP_DEV_EMAIL = import.meta.env.DEV
const DEV_EMAIL_CODE = '123456'
const DEV_ADDRESS = '대전광역시 서구 둔산로 100'

const INITIAL_VALUES: SignupValues = {
  name: '',
  phone: '',
  nickname: '',
  address: '',
  addressDetail: '',
  email: '',
  password: '',
  passwordConfirm: '',
  consent: false,
}

type Errors = Partial<Record<Region, SignupError>>

/** 영역별 오류 알림. 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. */
function RegionAlert({
  id,
  error,
}: {
  id: string
  error: SignupError | undefined
}) {
  return (
    <div role="alert">
      {error ? (
        <p id={id} className={errorClass}>
          {error.message}
        </p>
      ) : null}
    </div>
  )
}

/**
 * A03 회원가입 화면. 기능·문구 기준은 화면명세_v5.0.json과 v5.0 HTML 스토리보드다.
 *
 * 3단계(본인 확인 → 프로필 정보 → 계정 정보)의 순차 등장형 폼이다. 입력값(values)은 이 컴포넌트가 한곳에서 갖고
 * 단계가 바뀌어도 유지된다. 단계 판정과 필드 노출은 signupSteps.ts의 순수 함수가 입력값에서 파생한다.
 * 검증 규칙은 signupValidation.ts 그대로이며, 오류는 "다음"·"본인인증"·"중복확인"·제출을 눌렀을 때와
 * 입력창을 벗어날 때(blur)만 보인다. 한 글자 입력 같은 입력 도중에는 오류를 만들지 않는다.
 *
 * 현재 범위: 입력 상태·형식 검증·필드별 오류 처리까지. 실제 가입 요청(POST /api/v1/auth/signup)과
 * 휴대폰 본인인증, 이메일 중복확인·인증번호, 주소 검색은 연결하지 않는다.
 * 그래서 본인인증이 항상 미완료이고 주소를 채울 수 없어, 인증을 우회하지 않는 한 1단계에서 다음으로 갈 수 없다.
 * 후속 화면(2차 비밀번호 설정 P05, 초기설문 A02)으로 이동하지 않는다.
 * 단계는 URL이나 history에 넣지 않는다(새로고침하면 처음부터, 브라우저 뒤로 가기는 이 화면을 떠난다).
 */
export default function SignupPage() {
  const [values, setValues] = useState<SignupValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<Errors>({})
  const [noticeVisible, setNoticeVisible] = useState(false)
  const [step, setStep] = useState<SignupStep>(1)
  // 인증 완료 여부. 인증 API를 연결하면 성공 응답에서 이 값을 true로 바꾼다(현재는 바꾸는 곳이 없어 항상 false).
  // 이름·휴대폰 번호를 바꾸면 휴대폰 인증을, 이메일을 바꾸면 이메일 인증을 무효로 돌린다(setValue). 입력값은 지우지 않는다.
  const [verified, setVerified] = useState<Verification>(NOT_VERIFIED)
  // [임시·개발 전용] 인증번호 입력 폼 상태. 백엔드 인증 API가 연결되면 제거하고 verified만 API 응답으로 바꾼다.
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [codeMessage, setCodeMessage] = useState<string | null>(null)
  const [codeFocusTick, setCodeFocusTick] = useState(0)
  // [임시·개발 전용] 이메일 인증번호 입력 폼 상태(STEP 03). 백엔드 인증 API가 연결되면 제거한다.
  const [emailCodeSent, setEmailCodeSent] = useState(false)
  const [emailCode, setEmailCode] = useState('')
  const [emailCodeMessage, setEmailCodeMessage] = useState<string | null>(null)
  const [emailCodeFocusTick, setEmailCodeFocusTick] = useState(0)
  // 오류가 생긴 입력으로 포커스를 옮기기 위한 요청. 입력이 다른 단계에 있으면 단계를 옮긴 뒤(렌더 뒤) 포커스한다.
  // ref에 담고 focusTick으로 효과를 다시 실행시킨다(효과 안에서 상태를 바꾸지 않기 위해서다).
  const focusRequest = useRef<FieldKey | null>(null)
  const [focusTick, setFocusTick] = useState(0)
  // 단계에 들어온 직후에는 등장 전환을 끄고, 첫 화면이 그려진 뒤부터(사용자 입력으로 나타나는 필드부터) 켠다.
  const [armedStep, setArmedStep] = useState<SignupStep | null>(null)
  const revealArmed = armedStep === step
  const previousStep = useRef<SignupStep>(1)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const codeRef = useRef<HTMLInputElement>(null)
  const emailCodeRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const nicknameRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLInputElement>(null)
  const addressDetailRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const fieldRefs: Record<FieldKey, RefObject<HTMLInputElement | null>> = {
    name: nameRef,
    phone: phoneRef,
    nickname: nicknameRef,
    address: addressRef,
    addressDetail: addressDetailRef,
    email: emailRef,
    password: passwordRef,
    passwordConfirm: confirmRef,
    consent: consentRef,
  }
  const baseId = useId()

  const ids = {
    cardTitle: `${baseId}-card-title`,
    name: `${baseId}-name`,
    phone: `${baseId}-phone`,
    code: `${baseId}-code`,
    codeNote: `${baseId}-code-note`,
    codeError: `${baseId}-code-error`,
    nickname: `${baseId}-nickname`,
    address: `${baseId}-address`,
    addressDetail: `${baseId}-address-detail`,
    email: `${baseId}-email`,
    password: `${baseId}-password`,
    confirm: `${baseId}-confirm`,
    consent: `${baseId}-consent`,
    emailCode: `${baseId}-email-code`,
    emailCodeNote: `${baseId}-email-code-note`,
    emailCodeError: `${baseId}-email-code-error`,
    rules: `${baseId}-rules`,
    match: `${baseId}-match`,
  }
  const errorIds: Record<Region, string> = {
    identity: `${baseId}-identity-error`,
    nickname: `${baseId}-nickname-error`,
    address: `${baseId}-address-error`,
    email: `${baseId}-email-error`,
    password: `${baseId}-password-error`,
    consent: `${baseId}-consent-error`,
  }

  const rules = passwordRules(values.password)
  const matchState = passwordMatchState(values.password, values.passwordConfirm)
  const show = visibleFields(values, verified)
  const emailFormatOk = checkEmailInput(values.email) === null
  const meta = SIGNUP_STEPS[step - 1]
  const isLastStep = step === SIGNUP_STEPS.length

  // 포커스 이동: 오류 입력이 있으면 그곳으로, 단계만 바뀌었으면 새 단계 제목으로 옮긴다(보조기기가 단계 변경을 알 수 있다).
  // 필드가 나타나기만 한 경우에는 포커스를 옮기지 않는다.
  useEffect(() => {
    if (focusRequest.current) {
      // 오류 입력이 아직 보이지 않는 경우(순차 등장 전)에는 단계 제목으로 포커스해 오류 안내가 조용히 사라지지 않게 한다.
      const target =
        fieldRefs[focusRequest.current].current ?? headingRef.current
      target?.focus()
      focusRequest.current = null
    } else if (previousStep.current !== step) {
      headingRef.current?.focus()
    }
    previousStep.current = step
    // fieldRefs는 렌더마다 새로 만들어지지만 가리키는 ref 객체는 같아서 의존성에 넣지 않는다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, focusTick])

  // [임시·개발 전용] 본인인증을 누를 때마다 인증번호 입력으로 포커스를 옮긴다(입력창이 그려진 뒤).
  useEffect(() => {
    if (codeFocusTick > 0) codeRef.current?.focus()
  }, [codeFocusTick])

  // [임시·개발 전용] 이메일 인증 요청을 누를 때마다 인증번호 입력으로 포커스를 옮긴다(입력창이 그려진 뒤).
  useEffect(() => {
    if (emailCodeFocusTick > 0) emailCodeRef.current?.focus()
  }, [emailCodeFocusTick])

  // 단계가 바뀐 직후(첫 화면이 그려지기 전)에는 revealArmed가 false라 전환이 꺼져 있고, 두 프레임 뒤 현재 단계로 켠다.
  useEffect(() => {
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setArmedStep(step))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [step])

  /** 오류가 연결된 필드에만 aria-invalid를 표시한다. */
  const invalid = (field: FieldKey) =>
    errors[FIELD_REGION[field]]?.field === field ? true : undefined

  const describedBy = (region: Region, ...extra: string[]) => {
    const list = errors[region] ? [...extra, errorIds[region]] : extra
    return list.length > 0 ? list.join(' ') : undefined
  }

  /** 입력을 고치면 같은 영역의 오류만 지우고, 제출 결과 안내도 지운다. */
  function setValue(field: FieldKey, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }))
    // 인증 무효화: 인증받은 값(이름·휴대폰 번호, 이메일)이 바뀌면 그 인증은 더 이상 유효하지 않다.
    if (field === 'name' || field === 'phone') {
      setVerified((current) =>
        current.phone ? { ...current, phone: false } : current,
      )
      resetCode()
    } else if (field === 'email') {
      setVerified((current) =>
        current.email ? { ...current, email: false } : current,
      )
      resetEmailCode()
    }
    const region = FIELD_REGION[field]
    setErrors((current) => {
      if (!current[region]) return current
      const next = { ...current }
      delete next[region]
      return next
    })
    setNoticeVisible(false)
  }

  const handleText =
    (field: FieldKey) => (event: ChangeEvent<HTMLInputElement>) => {
      setValue(field, event.target.value)
    }

  /** 입력창을 벗어날 때만 오류를 확인한다(빈 값은 제외). 포커스는 옮기지 않는다. */
  const handleBlur = (field: FieldKey) => () => {
    const error = fieldBlurError(field, values)
    if (error) setErrors((current) => ({ ...current, [error.region]: error }))
  }

  /** 오류를 보여 주고 그 입력으로 포커스를 옮긴다. 입력이 다른 단계에 있으면 그 단계로 이동한다. */
  function showError(error: SignupError) {
    setErrors((current) => ({ ...current, [error.region]: error }))
    setNoticeVisible(false)
    setStep(FIELD_STEP[error.field])
    focusRequest.current = error.field
    setFocusTick((tick) => tick + 1)
  }

  function clearRegion(region: Region) {
    setErrors((current) => {
      if (!current[region]) return current
      const next = { ...current }
      delete next[region]
      return next
    })
  }

  /** [임시·개발 전용] 인증번호 입력 상태를 처음으로 돌린다. 이름·휴대폰 번호가 바뀌었거나 본인인증을 다시 누를 때 쓴다. */
  function resetCode() {
    setCodeSent(false)
    setCode('')
    setCodeMessage(null)
  }

  // 본인인증: 입력 형식을 확인한다. 실제 인증 요청(SMS·본인확인 서비스)은 하지 않는다.
  // [임시·개발 전용] 개발 서버(import.meta.env.DEV)에서만, 형식이 맞으면 인증번호 입력을 연다. 운영 빌드에서는 열리지 않는다.
  function handleIdentityCheck() {
    const error = checkIdentityInput(values.name, values.phone)
    if (error) {
      showError(error)
      return
    }
    clearRegion('identity')
    if (!TEMP_DEV_IDENTITY) return
    // 다시 누르면 처음부터 다시 인증한다(이전 인증은 무효).
    setVerified((current) => ({ ...current, phone: false }))
    setCode('')
    setCodeMessage(null)
    setCodeSent(true)
    setCodeFocusTick((tick) => tick + 1)
  }

  /** [임시·개발 전용] 인증번호는 숫자만, 6자리까지 받는다. 고치면 이전 불일치 안내는 지운다. */
  function handleCodeChange(event: ChangeEvent<HTMLInputElement>) {
    setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
    setCodeMessage(null)
  }

  /** [임시·개발 전용] 시안 고정 인증번호와 같으면 휴대폰 인증을 완료한다. 다르면 불일치 안내를 보인다. */
  function handleCodeVerify() {
    if (!codeSent || verified.phone) return
    if (code.trim() !== DEV_IDENTITY_CODE) {
      setCodeMessage('인증번호가 일치하지 않습니다.')
      return
    }
    setCodeMessage(null)
    clearRegion('identity')
    setVerified((current) => ({ ...current, phone: true }))
  }

  /** [임시·개발 전용] 인증번호 입력창에서 Enter는 가입 폼 제출이 아니라 "확인"으로 처리한다. */
  function handleCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleCodeVerify()
  }

  /**
   * [임시·개발 전용] 주소 검색 대신 예시 주소를 기본 주소로 넣는다. 개발 서버(import.meta.env.DEV)에서만 동작한다.
   * 기본 주소를 (다시) 고르면 이전 상세 주소는 비워 다시 입력받는다. 주소 검색 API가 연결되면 이 함수로 검색 결과를 넣는다.
   */
  function selectDevAddress() {
    if (!TEMP_DEV_ADDRESS) return
    setValues((current) => ({
      ...current,
      address: DEV_ADDRESS,
      addressDetail: '',
    }))
    clearRegion('address')
    setNoticeVisible(false)
  }

  /** [임시·개발 전용] 읽기 전용 주소 입력창에서 Enter·Space로도 선택할 수 있게 한다(키보드 사용자). */
  function handleAddressKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    selectDevAddress()
  }

  /** [임시·개발 전용] 이메일 인증번호 입력 상태를 처음으로 돌린다. 이메일이 바뀌었거나 인증을 다시 요청할 때 쓴다. */
  function resetEmailCode() {
    setEmailCodeSent(false)
    setEmailCode('')
    setEmailCodeMessage(null)
  }

  // 이메일 인증 요청: 형식을 확인한다. 실제 인증번호 발송·서버 검증은 하지 않는다(API 미연결).
  // [임시·개발 전용] 개발 서버(import.meta.env.DEV)에서만, 형식이 맞으면 인증번호 입력을 연다(메일은 발송되지 않는다).
  function handleEmailVerifyRequest() {
    const error = checkEmailInput(values.email)
    if (error) {
      showError(error)
      return
    }
    clearRegion('email')
    if (!TEMP_DEV_EMAIL) return
    // 다시 요청하면 처음부터 다시 인증한다(이전 인증은 무효). 재요청 횟수·만료 시간 정책은 백엔드 확정 전이라 두지 않는다.
    setVerified((current) => ({ ...current, email: false }))
    setEmailCode('')
    setEmailCodeMessage(null)
    setEmailCodeSent(true)
    setEmailCodeFocusTick((tick) => tick + 1)
  }

  /** [임시·개발 전용] 인증번호는 숫자만, 6자리까지 받는다. 고치면 이전 안내는 지운다. */
  function handleEmailCodeChange(event: ChangeEvent<HTMLInputElement>) {
    setEmailCode(event.target.value.replace(/\D/g, '').slice(0, 6))
    setEmailCodeMessage(null)
  }

  /** [임시·개발 전용] 6자리 형식을 확인하고 개발용 고정 번호와 같으면 이메일 인증을 완료한다. 실제 이메일 소유 확인이 아니다. */
  function handleEmailCodeVerify() {
    if (!emailCodeSent || verified.email) return
    if (emailCode.length !== 6) {
      setEmailCodeMessage('인증번호 6자리를 입력해 주세요.')
      return
    }
    if (emailCode !== DEV_EMAIL_CODE) {
      setEmailCodeMessage('인증번호가 일치하지 않습니다. 다시 확인해 주세요.')
      return
    }
    setEmailCodeMessage(null)
    clearRegion('email')
    setVerified((current) => ({ ...current, email: true }))
  }

  /** [임시·개발 전용] 인증번호 입력창에서 Enter는 폼 제출이 아니라 "확인"으로 처리한다. */
  function handleEmailCodeKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return
    event.preventDefault()
    handleEmailCodeVerify()
  }

  /**
   * 다음 단계로. 그 단계의 입력 규칙과 인증 여부를 기존 검증 그대로 확인하고, 막히면 오류를 보여 준다.
   * 인증(verified)이 미완료이면 통과할 수 없으며 우회하지 않는다.
   */
  function handleNext() {
    const error = validateStep(step, values, verified)
    if (error) {
      showError(error)
      return
    }
    setErrors({})
    setNoticeVisible(false)
    setStep(
      (current) => Math.min(current + 1, SIGNUP_STEPS.length) as SignupStep,
    )
  }

  function handleBack() {
    setNoticeVisible(false)
    setErrors({})
    setStep((current) => Math.max(current - 1, 1) as SignupStep)
  }

  // 빈 값은 브라우저 기본 검증(required)이 처리하고, 통과해야 이 핸들러가 실행된다.
  // 마지막 단계가 아닐 때의 제출(엔터)은 "다음"으로 처리한다.
  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isLastStep) {
      handleNext()
      return
    }
    const error = validateSubmit(values, verified)
    if (error) {
      showError(error)
      return
    }
    // 추후 구현: POST /api/v1/auth/signup 연동, 가입 후 2차 비밀번호 설정(P05)·초기설문(A02) 이동.
    setErrors({})
    setNoticeVisible(true)
  }

  // 단계 버튼(다음·가입)을 그릴지. 기존 검증 함수를 그대로 쓴다.
  // 1단계: 이름·휴대폰 형식 + 휴대폰 인증 완료. 형식이 맞는 것만으로는 나타나지 않는다.
  // 2단계: 닉네임·기본 주소·상세 주소 입력 완료(인증은 이미 1단계에서 확인).
  // 3단계: 가입에 필요한 모든 검증 통과(이메일 인증 포함). 인증 API가 없는 지금은 이메일 인증이 항상 미완료라 나타나지 않는다.
  const showNext =
    step === 1
      ? isStepInputValid(1, values) && verified.phone
      : step === 2
        ? isStepInputValid(2, values)
        : validateSubmit(values, verified) === null

  return (
    <AuthFrame appBar={false}>
      <AuthHero
        title={
          <>
            나에게 맞는 루틴을
            <br />
            밀스루틴과 시작해요
          </>
        }
        description="기본 기록과 재시작은 무료로 이용할 수 있어요."
      />

      <AuthBody>
        <StepProgress steps={SIGNUP_STEPS} current={step} />

        <section aria-labelledby={ids.cardTitle} className="mt-6">
          {/* 단계가 바뀌면 이 제목으로 포커스를 옮긴다(tabIndex -1: 탭 순서에는 들어가지 않는다). */}
          <div className="flex items-center gap-1">
            {/* 이전 단계 화살표(2·3단계). 터치 영역은 44px, 아이콘은 작게. -ml-[11px]로 아이콘 왼쪽을 본문 왼쪽 선에 맞춘다. */}
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                aria-label="이전 단계로 이동"
                className={`-ml-[11px] flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-content transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`}
              >
                <Icon name="arrow-left" />
              </button>
            ) : null}
            <h3
              ref={headingRef}
              id={ids.cardTitle}
              tabIndex={-1}
              className="min-w-0 text-section-title leading-snug font-semibold text-content outline-none"
            >
              <span className="block text-support font-normal text-brand">
                STEP {String(step).padStart(2, '0')}
              </span>
              {meta.label}
            </h3>
          </div>
          <p className="mt-1 text-body leading-relaxed font-normal text-muted">
            {meta.description}
          </p>

          <form onSubmit={handleSubmit} className="mt-2">
            {step === 1 ? (
              <>
                <div className="mt-5">
                  <label htmlFor={ids.name} className={labelClass}>
                    이름
                  </label>
                  <input
                    ref={nameRef}
                    id={ids.name}
                    name="fullName"
                    type="text"
                    required
                    maxLength={50}
                    autoComplete="name"
                    spellCheck={false}
                    placeholder="이름을 입력해 주세요"
                    value={values.name}
                    onChange={handleText('name')}
                    onBlur={handleBlur('name')}
                    aria-invalid={invalid('name')}
                    aria-describedby={describedBy('identity')}
                    className={inputClass}
                  />
                </div>
                {show.phone ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.phone} className={labelClass}>
                        휴대폰 번호
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={phoneRef}
                          id={ids.phone}
                          name="phone"
                          type="tel"
                          required
                          maxLength={14}
                          autoComplete="tel-national"
                          inputMode="tel"
                          placeholder="01012345678"
                          value={values.phone}
                          onChange={handleText('phone')}
                          onBlur={handleBlur('phone')}
                          aria-invalid={invalid('phone')}
                          aria-describedby={describedBy('identity')}
                          className={inputWithActionClass}
                        />
                        <button
                          type="button"
                          onClick={handleIdentityCheck}
                          className={actionButtonClass}
                        >
                          본인인증
                        </button>
                      </div>
                    </div>
                  </Reveal>
                ) : null}
                {/* [임시·개발 전용] 본인인증 버튼을 누르면 나타나는 인증번호 입력. 백엔드 연동 후 제거한다. */}
                {TEMP_DEV_IDENTITY && codeSent ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.code} className={labelClass}>
                        휴대폰 인증번호
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={codeRef}
                          id={ids.code}
                          name="verificationCode"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          readOnly={verified.phone}
                          placeholder="6자리 인증번호"
                          value={code}
                          onChange={handleCodeChange}
                          onKeyDown={handleCodeKeyDown}
                          aria-invalid={codeMessage ? true : undefined}
                          aria-describedby={`${ids.codeNote}${codeMessage ? ` ${ids.codeError}` : ''}`}
                          className={inputWithActionClass}
                        />
                        <button
                          type="button"
                          onClick={handleCodeVerify}
                          aria-disabled={verified.phone}
                          className={`${actionButtonClass} aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-page aria-disabled:text-muted`}
                        >
                          {verified.phone ? '인증 완료' : '확인'}
                        </button>
                      </div>
                      <div role="alert">
                        {codeMessage ? (
                          <p id={ids.codeError} className={errorClass}>
                            {codeMessage}
                          </p>
                        ) : null}
                      </div>
                      <div role="status">
                        {verified.phone ? (
                          <p className="mt-3 rounded-control border border-success/30 bg-success-soft px-[12px] py-[10px] text-support leading-relaxed font-normal text-success">
                            ✓ 휴대폰 인증 확인이 완료되었습니다. (시안)
                          </p>
                        ) : (
                          <p className={noticeClass}>
                            인증번호 입력을 진행해 주세요. 현재는 시안용
                            인증입니다.
                          </p>
                        )}
                      </div>
                      <p
                        id={ids.codeNote}
                        className="mt-3 text-support leading-relaxed font-normal text-muted"
                      >
                        시안 인증번호: {DEV_IDENTITY_CODE} · 실제 문자
                        발송·본인인증은 수행하지 않습니다.
                      </p>
                    </div>
                  </Reveal>
                ) : null}
                <RegionAlert id={errorIds.identity} error={errors.identity} />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <div className="mt-5">
                  <label htmlFor={ids.nickname} className={labelClass}>
                    닉네임
                  </label>
                  <input
                    ref={nicknameRef}
                    id={ids.nickname}
                    name="nickname"
                    type="text"
                    required
                    minLength={2}
                    maxLength={20}
                    autoComplete="nickname"
                    spellCheck={false}
                    placeholder="서비스에서 사용할 닉네임"
                    value={values.nickname}
                    onChange={handleText('nickname')}
                    onBlur={handleBlur('nickname')}
                    aria-invalid={invalid('nickname')}
                    aria-describedby={describedBy('nickname')}
                    className={inputClass}
                  />
                  <RegionAlert id={errorIds.nickname} error={errors.nickname} />
                </div>
                {show.address ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.address} className={labelClass}>
                        주소
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {/* 읽기 전용: 주소 검색 결과로만 채워지는 입력이다. 직접 입력하지 않는다. 주소 검색은 서비스 미연결이다. */}
                        {/* [임시·개발 전용] 개발 서버에서는 입력창 클릭(Enter·Space)이나 버튼으로 예시 주소가 들어간다. 운영 빌드에서는 동작하지 않는다. */}
                        <input
                          ref={addressRef}
                          id={ids.address}
                          name="address"
                          type="text"
                          required
                          readOnly
                          autoComplete="street-address"
                          placeholder="주소 검색으로 입력해 주세요"
                          value={values.address}
                          onClick={selectDevAddress}
                          onKeyDown={handleAddressKeyDown}
                          aria-invalid={invalid('address')}
                          aria-describedby={describedBy('address')}
                          className={`${inputWithActionClass} ${TEMP_DEV_ADDRESS ? 'cursor-pointer' : ''}`}
                        />
                        {/* 주소 검색 모달과 API가 없다. aria-haspopup·aria-controls도 붙이지 않는다. */}
                        <button
                          type="button"
                          onClick={selectDevAddress}
                          className={actionButtonClass}
                        >
                          주소 검색
                        </button>
                      </div>
                      {TEMP_DEV_ADDRESS ? (
                        <p className="mt-3 text-support leading-relaxed font-normal text-muted">
                          개발용 임시 기능: 주소 입력창이나 주소 검색 버튼을
                          누르면 예시 주소({DEV_ADDRESS})가 입력됩니다. 실제
                          주소 검색은 연결되어 있지 않습니다.
                        </p>
                      ) : null}
                      <RegionAlert
                        id={errorIds.address}
                        error={errors.address}
                      />
                    </div>
                  </Reveal>
                ) : null}
                {show.addressDetail ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.addressDetail} className={labelClass}>
                        상세 주소
                      </label>
                      <input
                        ref={addressDetailRef}
                        id={ids.addressDetail}
                        name="addressDetail"
                        type="text"
                        required
                        maxLength={100}
                        autoComplete="address-line2"
                        placeholder="상세 주소를 입력해 주세요."
                        value={values.addressDetail}
                        onChange={handleText('addressDetail')}
                        aria-invalid={invalid('addressDetail')}
                        aria-describedby={describedBy('address')}
                        className={inputClass}
                      />
                    </div>
                  </Reveal>
                ) : null}
              </>
            ) : null}

            {step === 3 ? (
              <>
                <div className="mt-5">
                  <label htmlFor={ids.email} className={labelClass}>
                    이메일
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <input
                      ref={emailRef}
                      id={ids.email}
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      placeholder="이메일 주소"
                      value={values.email}
                      onChange={handleText('email')}
                      onBlur={handleBlur('email')}
                      aria-invalid={invalid('email')}
                      aria-describedby={describedBy('email')}
                      className={inputWithActionClass}
                    />
                    {/* 이메일 인증 버튼은 형식이 맞는 이메일이 입력되면 나타난다. */}
                    {emailFormatOk ? (
                      <button
                        type="button"
                        onClick={handleEmailVerifyRequest}
                        className={actionButtonClass}
                      >
                        이메일 인증
                      </button>
                    ) : null}
                  </div>
                  <RegionAlert id={errorIds.email} error={errors.email} />
                </div>
                {/* [임시·개발 전용] 이메일 인증번호 입력. 실제 메일은 발송하지 않는다. 백엔드 연동 후 제거한다. */}
                {TEMP_DEV_EMAIL && emailCodeSent ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.emailCode} className={labelClass}>
                        이메일 인증번호
                      </label>
                      <div className="flex flex-wrap gap-2">
                        <input
                          ref={emailCodeRef}
                          id={ids.emailCode}
                          name="emailVerificationCode"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          maxLength={6}
                          readOnly={verified.email}
                          placeholder="6자리 인증번호"
                          value={emailCode}
                          onChange={handleEmailCodeChange}
                          onKeyDown={handleEmailCodeKeyDown}
                          aria-invalid={emailCodeMessage ? true : undefined}
                          aria-describedby={`${ids.emailCodeNote}${emailCodeMessage ? ` ${ids.emailCodeError}` : ''}`}
                          className={inputWithActionClass}
                        />
                        <button
                          type="button"
                          onClick={handleEmailCodeVerify}
                          aria-disabled={verified.email}
                          className={`${actionButtonClass} aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:bg-page aria-disabled:text-muted`}
                        >
                          {verified.email ? '인증 완료' : '확인'}
                        </button>
                      </div>
                      <div role="alert">
                        {emailCodeMessage ? (
                          <p id={ids.emailCodeError} className={errorClass}>
                            {emailCodeMessage}
                          </p>
                        ) : null}
                      </div>
                      <div role="status">
                        {verified.email ? (
                          <p className="mt-3 rounded-control border border-success/30 bg-success-soft px-[12px] py-[10px] text-support leading-relaxed font-normal text-success">
                            ✓ 이메일 인증이 완료되었습니다. (개발용 체험)
                          </p>
                        ) : (
                          <p className={noticeClass}>
                            개발용 인증입니다. 실제 메일은 발송되지 않았어요.
                          </p>
                        )}
                      </div>
                      <p
                        id={ids.emailCodeNote}
                        className="mt-3 text-support leading-relaxed font-normal text-muted"
                      >
                        개발용 인증번호: {DEV_EMAIL_CODE} · 실제 이메일 소유
                        확인이 아닙니다.
                      </p>
                    </div>
                  </Reveal>
                ) : null}
                {show.password ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.password} className={labelClass}>
                        비밀번호
                      </label>
                      <input
                        ref={passwordRef}
                        id={ids.password}
                        name="password"
                        type="password"
                        required
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={values.password}
                        onChange={handleText('password')}
                        aria-invalid={invalid('password')}
                        aria-describedby={describedBy('password', ids.rules)}
                        className={inputClass}
                      />
                      <ul id={ids.rules} className="mt-3 flex flex-wrap gap-2">
                        {PASSWORD_RULE_LABELS.map(({ key, label }) => (
                          <li
                            key={key}
                            className={`inline-flex items-center gap-1 rounded-full px-[10px] py-[4px] text-support font-normal ${
                              rules[key]
                                ? 'bg-success-soft text-success ring-1 ring-success/30'
                                : 'bg-page text-muted ring-1 ring-line'
                            }`}
                          >
                            <span aria-hidden="true">
                              {rules[key] ? '✓' : '○'}
                            </span>{' '}
                            {label}
                            <span className="sr-only">
                              {rules[key] ? ' 충족' : ' 미충족'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </Reveal>
                ) : null}
                {show.passwordConfirm ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-5">
                      <label htmlFor={ids.confirm} className={labelClass}>
                        비밀번호 확인
                      </label>
                      <input
                        ref={confirmRef}
                        id={ids.confirm}
                        name="passwordConfirm"
                        type="password"
                        required
                        autoComplete="new-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        value={values.passwordConfirm}
                        onChange={handleText('passwordConfirm')}
                        aria-invalid={invalid('passwordConfirm')}
                        aria-describedby={describedBy('password', ids.match)}
                        className={inputClass}
                      />
                      <p
                        id={ids.match}
                        aria-live="polite"
                        className={
                          matchState === 'mismatch'
                            ? errorClass
                            : matchState === 'match'
                              ? 'mt-3 rounded-control border border-success/30 bg-success-soft px-[12px] py-[10px] text-support leading-relaxed font-normal text-success'
                              : 'mt-3 text-support leading-relaxed font-normal text-muted'
                        }
                      >
                        {PASSWORD_MATCH_TEXT[matchState]}
                      </p>
                      <RegionAlert
                        id={errorIds.password}
                        error={errors.password}
                      />
                    </div>
                  </Reveal>
                ) : null}
                {show.consent ? (
                  <Reveal animate={revealArmed}>
                    <div className="mt-8 border-t border-line pt-8">
                      {/* 동의 영역은 면(brand-soft)과 테두리로 구분한다. 선택하면 brand 테두리, 오류면 danger 테두리가 된다. */}
                      <label
                        htmlFor={ids.consent}
                        className="flex min-h-14 items-center gap-3 rounded-control border border-transparent bg-brand-soft px-[16px] py-[12px] text-body font-normal text-content transition-colors has-checked:border-brand has-aria-[invalid=true]:border-danger has-aria-[invalid=true]:bg-danger-soft motion-reduce:transition-none"
                      >
                        <input
                          ref={consentRef}
                          id={ids.consent}
                          name="consent"
                          type="checkbox"
                          required
                          checked={values.consent}
                          onChange={(event) =>
                            setValue('consent', event.target.checked)
                          }
                          aria-invalid={invalid('consent')}
                          aria-describedby={describedBy('consent')}
                          className={`size-5 shrink-0 cursor-pointer accent-brand ${focusRing}`}
                        />
                        {/* 공백 없는 긴 어절이라 확대하면 단어 중간에서 끊기므로, 가운뎃점 뒤에 줄바꿈 위치(<wbr />)를 둔다. 글자는 그대로다. */}
                        <span>
                          필수 이용약관·
                          <wbr />
                          개인정보 처리 안내 확인
                        </span>
                      </label>
                      <RegionAlert
                        id={errorIds.consent}
                        error={errors.consent}
                      />
                    </div>
                  </Reveal>
                ) : null}
              </>
            ) : null}

            <div role="status">
              {noticeVisible ? (
                <p className={noticeClass}>{SIGNUP_MESSAGES.submitNotice}</p>
              ) : null}
            </div>
            {/*
              단계 버튼 영역. "다음"(3단계는 "회원가입하고 시작하기")은 그 단계를 모두 마쳤을 때만 렌더한다(showNext).
              비활성 버튼·안내 문구·빈 컨테이너를 미리 그리지 않는다. 조건부 렌더라 탭 순서에도 없고 높이도 남지 않는다.
              이전 단계 이동은 하단 버튼이 아니라 단계 제목 왼쪽의 화살표 버튼이 맡는다.
            */}
            {showNext ? (
              <div className={`mt-8 ${revealArmed ? revealClass : ''}`}>
                {/* 다음(button)과 가입(submit)은 같은 자리의 버튼이라 key를 달리해 React가 DOM 노드를 재사용하지 못하게 한다(type이 바뀌는 순간 오제출 방지). */}
                {isLastStep ? (
                  <button
                    key="submit"
                    type="submit"
                    className={primaryButtonClass}
                  >
                    회원가입하고 시작하기
                  </button>
                ) : (
                  <button
                    key="next"
                    type="button"
                    onClick={handleNext}
                    className={primaryButtonClass}
                  >
                    다음
                  </button>
                )}
              </div>
            ) : null}
          </form>
        </section>

        <AuthSwitchCard
          prompt="이미 계정이 있으신가요?"
          to="/login"
          linkLabel="로그인으로 이동"
          arrow="↗"
        />
      </AuthBody>
    </AuthFrame>
  )
}
