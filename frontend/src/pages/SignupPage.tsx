import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
  type SubmitEvent,
} from 'react'
import { Link } from 'react-router'
import {
  FIELD_REGION,
  PASSWORD_MATCH_TEXT,
  PASSWORD_RULE_LABELS,
  SIGNUP_MESSAGES,
  checkEmailInput,
  checkIdentityInput,
  isPasswordReady,
  passwordMatchState,
  passwordRules,
  validateSubmit,
  type FieldKey,
  type Region,
  type SignupError,
  type SignupValues,
  type Verification,
} from './signupValidation.ts'

/**
 * 휴대폰·이메일 인증 완료 여부. 인증과 중복확인, 주소 검색은 서버·외부 서비스가 필요한데
 * API 명세에 해당 엔드포인트가 없어 연결하지 않았다. 연동하기 전에는 항상 false이며
 * 이 값이 false라서 가입 제출은 인증 단계에서 막힌다. 가짜 인증 성공을 만들지 않는다.
 */
const VERIFIED: Verification = { phone: false, email: false }

const INITIAL_VALUES: SignupValues = {
  name: '',
  phone: '',
  nickname: '',
  address: '',
  email: '',
  password: '',
  passwordConfirm: '',
  consent: false,
}

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 입력창 스타일은 로그인(A01)과 같은 규칙이다. 로그인 화면을 건드리지 않으려고 값을 복사했으며,
 * 화면이 늘어나면 공통 컴포넌트로 합치는 것을 검토한다.
 * - text-base(16px): 타입 스케일(본문 14px)의 예외. 모바일 Safari가 16px 미만 입력창을 확대하는 것을 막는다.
 * - border-muted/75: 흰 배경 대비 3.22:1의 입력창 경계.
 * - placeholder-shown:text-ellipsis: 글자 확대로 placeholder가 길어져도 말줄임으로 정리한다.
 */
const inputBase =
  'h-12 rounded-control border border-muted/75 bg-surface px-4 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted placeholder-shown:text-ellipsis hover:border-muted read-only:bg-page focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:outline-danger motion-reduce:transition-none'

const inputClass = `w-full ${inputBase}`

/** 버튼과 나란히 놓는 입력창. 폭이 좁으면(글자 확대 등) 버튼이 아래 줄로 내려간다. */
const inputWithActionClass = `min-w-0 flex-1 basis-40 ${inputBase}`

const labelClass = 'mb-2 block text-body font-normal text-content'

const actionButtonClass = `h-12 shrink-0 cursor-pointer rounded-control bg-brand-soft px-4 text-body font-semibold text-brand transition-colors hover:bg-brand/10 motion-reduce:transition-none ${focusRing}`

const errorClass =
  'mt-2 rounded-control bg-danger-soft px-3 py-2 text-support font-normal text-danger'

const subheadingClass = 'text-body font-semibold text-content'

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
 * A03 회원가입 화면. 기능·문구 기준은 스토리보드 v5.0 화면명세와 HTML 스토리보드다.
 *
 * 현재 범위: 입력 상태·형식 검증·필드별 오류 처리까지. 실제 가입 요청(POST /api/v1/auth/signup)과
 * 휴대폰 본인인증, 이메일 중복확인·인증번호, 주소 검색은 연결하지 않는다.
 * 후속 화면(2차 비밀번호 설정 P05, 초기설문 A02)으로 이동하지 않는다.
 */
export default function SignupPage() {
  const [values, setValues] = useState<SignupValues>(INITIAL_VALUES)
  const [errors, setErrors] = useState<Errors>({})
  const [noticeVisible, setNoticeVisible] = useState(false)
  // 오류가 생긴 입력으로 포커스를 옮기기 위한 ref. 필드마다 하나씩 둔다.
  const nameRef = useRef<HTMLInputElement>(null)
  const phoneRef = useRef<HTMLInputElement>(null)
  const nicknameRef = useRef<HTMLInputElement>(null)
  const addressRef = useRef<HTMLInputElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)
  const consentRef = useRef<HTMLInputElement>(null)
  const fieldRefs: Record<FieldKey, RefObject<HTMLInputElement | null>> = {
    name: nameRef,
    phone: phoneRef,
    nickname: nicknameRef,
    address: addressRef,
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
    nickname: `${baseId}-nickname`,
    address: `${baseId}-address`,
    email: `${baseId}-email`,
    password: `${baseId}-password`,
    confirm: `${baseId}-confirm`,
    consent: `${baseId}-consent`,
    rules: `${baseId}-rules`,
    match: `${baseId}-match`,
    note: `${baseId}-note`,
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
  const passwordReady = isPasswordReady(values.password, values.passwordConfirm)

  /** 오류가 연결된 필드에만 aria-invalid를 표시한다. */
  const invalid = (field: FieldKey) =>
    errors[FIELD_REGION[field]]?.field === field ? true : undefined

  const describedBy = (region: Region, ...extra: string[]) => {
    const list = errors[region] ? [...extra, errorIds[region]] : extra
    return list.length > 0 ? list.join(' ') : undefined
  }

  function focusField(field: FieldKey) {
    fieldRefs[field].current?.focus()
  }

  /** 입력을 고치면 같은 영역의 오류만 지우고, 제출 결과 안내도 지운다. */
  function setValue(field: FieldKey, value: string | boolean) {
    setValues((current) => ({ ...current, [field]: value }))
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

  function showError(error: SignupError) {
    setErrors((current) => ({ ...current, [error.region]: error }))
    setNoticeVisible(false)
    focusField(error.field)
  }

  function clearRegion(region: Region) {
    setErrors((current) => {
      if (!current[region]) return current
      const next = { ...current }
      delete next[region]
      return next
    })
  }

  // 본인인증: 입력 형식만 확인한다. 형식이 맞아도 인증 요청은 하지 않는다. (SMS·본인확인 서비스 미연결)
  function handleIdentityCheck() {
    const error = checkIdentityInput(values.name, values.phone)
    if (error) showError(error)
    else clearRegion('identity')
  }

  // 중복확인: 이메일 형식만 확인한다. 형식이 맞아도 중복 조회나 인증번호 발송은 하지 않는다.
  function handleEmailCheck() {
    const error = checkEmailInput(values.email)
    if (error) showError(error)
    else clearRegion('email')
  }

  // 빈 값은 브라우저 기본 검증(required)이 처리하고, 통과해야 이 핸들러가 실행된다.
  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const error = validateSubmit(values, VERIFIED)
    if (error) {
      setErrors({ [error.region]: error })
      setNoticeVisible(false)
      focusField(error.field)
      return
    }
    // 추후 구현: POST /api/v1/auth/signup 연동, 가입 후 2차 비밀번호 설정(P05)·초기설문(A02) 이동.
    setErrors({})
    setNoticeVisible(true)
  }

  return (
    // break-keep: 한글을 어절 단위로 줄바꿈한다. wrap-anywhere: 한 단어가 줄보다 길 때만 예외로 끊는다.
    <div className="break-keep wrap-anywhere">
      <section>
        <p className="text-support font-normal text-brand">CREATE AN ACCOUNT</p>
        <h2 className="mt-2 text-app-title leading-snug font-semibold text-content">
          나에게 맞는 루틴을
          <br />
          밀스루틴과 시작해요
        </h2>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          기본 기록과 재시작은 무료로 이용할 수 있어요.
        </p>
      </section>

      <section
        aria-labelledby={ids.cardTitle}
        className="mt-5 rounded-card border border-line bg-surface p-4"
      >
        <h3
          id={ids.cardTitle}
          className="text-section-title font-semibold text-content"
        >
          가입 정보
        </h3>

        <form onSubmit={handleSubmit} className="mt-4">
          <h4 className={subheadingClass}>본인 확인</h4>
          <div className="mt-3">
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
              aria-invalid={invalid('name')}
              aria-describedby={describedBy('identity')}
              className={inputClass}
            />
          </div>
          <div className="mt-4">
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
            <RegionAlert id={errorIds.identity} error={errors.identity} />
          </div>

          <h4 className={`mt-6 ${subheadingClass}`}>프로필 정보</h4>
          <div className="mt-3">
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
              aria-invalid={invalid('nickname')}
              aria-describedby={describedBy('nickname')}
              className={inputClass}
            />
            <RegionAlert id={errorIds.nickname} error={errors.nickname} />
          </div>
          <div className="mt-4">
            <label htmlFor={ids.address} className={labelClass}>
              주소
            </label>
            <div className="flex flex-wrap gap-2">
              {/* 읽기 전용: 주소 검색 결과로만 채워지는 입력이다. 주소 검색은 서비스 미연결이라 값이 채워지지 않는다. */}
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
                aria-invalid={invalid('address')}
                aria-describedby={describedBy('address')}
                className={inputWithActionClass}
              />
              {/* 주소 검색 모달과 API가 없으므로 동작하지 않는다. aria-haspopup·aria-controls도 붙이지 않는다. */}
              <button type="button" className={actionButtonClass}>
                주소 검색
              </button>
            </div>
            <RegionAlert id={errorIds.address} error={errors.address} />
          </div>

          <h4 className={`mt-6 ${subheadingClass}`}>계정 정보</h4>
          <div className="mt-3">
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
                aria-invalid={invalid('email')}
                aria-describedby={describedBy('email')}
                className={inputWithActionClass}
              />
              <button
                type="button"
                onClick={handleEmailCheck}
                className={actionButtonClass}
              >
                중복확인
              </button>
            </div>
            <RegionAlert id={errorIds.email} error={errors.email} />
          </div>
          <div className="mt-4">
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
            <ul id={ids.rules} className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {PASSWORD_RULE_LABELS.map(({ key, label }) => (
                <li
                  key={key}
                  className={`text-support font-normal ${rules[key] ? 'text-success' : 'text-muted'}`}
                >
                  <span aria-hidden="true">{rules[key] ? '✓' : '○'}</span>{' '}
                  {label}
                  <span className="sr-only">
                    {rules[key] ? ' 충족' : ' 미충족'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="mt-4">
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
              className={`mt-2 text-support font-normal ${
                matchState === 'match'
                  ? 'text-success'
                  : matchState === 'mismatch'
                    ? 'text-danger'
                    : 'text-muted'
              }`}
            >
              {PASSWORD_MATCH_TEXT[matchState]}
            </p>
            <RegionAlert id={errorIds.password} error={errors.password} />
          </div>

          <div className="mt-4">
            <label
              htmlFor={ids.consent}
              className="flex min-h-11 items-center gap-3 text-body font-normal text-content"
            >
              <input
                ref={consentRef}
                id={ids.consent}
                name="consent"
                type="checkbox"
                required
                checked={values.consent}
                onChange={(event) => setValue('consent', event.target.checked)}
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
            <RegionAlert id={errorIds.consent} error={errors.consent} />
          </div>

          <div role="status">
            {noticeVisible ? (
              <p className="mt-4 rounded-control bg-brand-soft px-3 py-2 text-support font-normal text-content">
                {SIGNUP_MESSAGES.submitNotice}
              </p>
            ) : null}
          </div>
          <p id={ids.note} className="mt-4 text-support font-normal text-muted">
            비밀번호의 네 가지 조건을 모두 충족하고 확인값이 일치해야 가입할 수
            있어요.
          </p>
          <button
            type="submit"
            disabled={!passwordReady}
            aria-describedby={ids.note}
            className={`mt-3 h-12 w-full cursor-pointer rounded-control bg-brand text-body font-semibold text-surface transition-colors enabled:hover:bg-brand-hover enabled:active:bg-brand-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted motion-reduce:transition-none ${focusRing}`}
          >
            회원가입하고 시작하기
          </button>
        </form>
      </section>

      <div className="mt-6 flex flex-col items-center gap-1 text-center">
        <p className="text-body font-normal text-muted">
          이미 계정이 있으신가요?
        </p>
        <Link
          to="/login"
          className={`inline-flex min-h-11 items-center justify-center gap-1 rounded-control bg-brand-soft px-4 text-body font-semibold text-brand ${focusRing}`}
        >
          로그인으로 이동 <span aria-hidden="true">↗</span>
        </Link>
      </div>
    </div>
  )
}
