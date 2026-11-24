import { useId, useRef, useState, type Ref, type SubmitEvent } from 'react'
import { Link, Navigate, useLocation, useMatches } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import { useAuth } from '../auth/authContext.ts'
import { safeReturnTo } from '../auth/returnTo.ts'
import {
  AuthBody,
  AuthFrame,
  AuthHero,
  AuthSwitchCard,
} from '../components/auth/AuthParts.tsx'
import {
  errorClass,
  inputClass,
  labelClass,
  noticeClass,
  primaryButtonClass,
} from '../components/auth/authStyles.ts'
import BackLink from '../components/layout/BackLink.tsx'

const MIN_PASSWORD_LENGTH = 8

/** 화면 문구 출처: 스토리보드 v5.0(v5.0 스토리보드)의 A01 정의 */
const FORM_MESSAGES = {
  passwordTooShort: '체험용 비밀번호는 8자 이상 입력해 주세요.',
  // 입력이 개발용 계정과 맞지 않을 때. 어느 입력이 틀렸는지 알려 주지 않는다.
  authFailed: '로그인하지 못했어요. 입력한 이메일과 비밀번호를 확인해 주세요.',
  // 서버에 연결할 수 없을 때(F1-MESSAGE-1). 로그인 실패나 앱 시작 확인의 연결 실패(F1-D7)에 함께 쓴다.
  connectionFailed: '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
  // 정지 계정인데 서버 문구가 없을 때만 쓰는 대체 문구(F1-D4). 보통은 서버 문구를 그대로 보여 준다.
  suspendedFallback: '정지된 계정입니다. 고객센터에 문의해 주세요.',
  // 처리 중 안내(스토리보드 문구 아님). role="status" 영역으로 알린다.
  submitting: '로그인하고 있어요.',
} as const

/**
 * 표시하는 오류. passwordTooShort는 비밀번호 입력에 연결되어 비밀번호를 고칠 때만 지우고,
 * authFailed는 이메일이든 비밀번호든 고치면 지운다.
 */
type FieldErrorKey = 'passwordTooShort' | 'authFailed'

function EyeIcon({ crossed }: { crossed: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {crossed ? <path d="m3 3 18 18" /> : null}
    </svg>
  )
}

interface PasswordInputProps {
  id: string
  invalid: boolean
  describedBy: string | undefined
  /** 표시 상태. 제출할 때 숨김으로 되돌려야 해서 폼(LoginForm)이 가진다. */
  visible: boolean
  onToggleVisible: () => void
  onChange: () => void
  ref: Ref<HTMLInputElement>
}

function PasswordInput({
  id,
  invalid,
  describedBy,
  visible,
  onToggleVisible,
  onChange,
  ref,
}: PasswordInputProps) {
  const toggleLabel = visible ? '비밀번호 숨기기' : '비밀번호 보기'

  return (
    <div className="relative">
      <input
        ref={ref}
        id={id}
        name="password"
        type={visible ? 'text' : 'password'}
        required
        autoComplete="current-password"
        // 보기 상태(type=text)에서 비밀번호가 자동 수정되거나 맞춤법 검사로 전달되지 않게 한다.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder="비밀번호를 입력해 주세요"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={onChange}
        className={`${inputClass} pr-12`}
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={toggleLabel}
        title={toggleLabel}
        className="absolute inset-y-0 right-0 my-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-control text-muted transition-colors hover:text-brand focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand aria-pressed:text-brand motion-reduce:transition-none"
      >
        <EyeIcon crossed={visible} />
      </button>
    </div>
  )
}

function LoginForm() {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const [errorKey, setErrorKey] = useState<FieldErrorKey | null>(null)
  const [noticeVisible, setNoticeVisible] = useState(false)
  // 정지 계정 안내(서버 문구). 입력을 고치면 지운다.
  const [suspendedMessage, setSuspendedMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // 연속 제출 이벤트가 같은 렌더 안에서 들어와도 login이 한 번만 호출되도록 ref로 막는다.
  const submittingRef = useRef(false)
  const { login, connectionNotice } = useAuth()
  const passwordRef = useRef<HTMLInputElement>(null)
  const baseId = useId()
  const emailId = `${baseId}-email`
  const passwordId = `${baseId}-password`
  const errorId = `${baseId}-error`

  const passwordInvalid = errorKey === 'passwordTooShort'

  // 제출 결과 안내는 어느 입력을 고쳐도 지우고, 오류는 연결된 필드를 고칠 때만 지운다.
  function handleEmailChange() {
    setNoticeVisible(false)
    setSuspendedMessage(null)
    setErrorKey((current) => (current === 'authFailed' ? null : current))
  }

  function handlePasswordChange() {
    setErrorKey(null)
    setNoticeVisible(false)
    setSuspendedMessage(null)
  }

  // 빈 값과 이메일 형식은 원본과 같이 브라우저 기본 검증이 처리한다. 통과해야 이 핸들러가 실행된다.
  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return
    // 제출하면 비밀번호 표시를 숨김으로 되돌린다. 입력값은 그대로 둔다.
    setPasswordVisible(false)
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '')
    const password = String(formData.get('password') ?? '')
    if (password.length < MIN_PASSWORD_LENGTH) {
      setErrorKey('passwordTooShort')
      setNoticeVisible(false)
      passwordRef.current?.focus()
      return
    }
    setErrorKey(null)
    setNoticeVisible(false)
    setSuspendedMessage(null)
    submittingRef.current = true
    setSubmitting(true)
    const result = await login(email, password)
    submittingRef.current = false
    setSubmitting(false)
    // 성공하면 로그인 상태가 바뀌어 LoginPage가 /home으로 이동시킨다. 비밀번호는 어디에도 저장하지 않는다.
    if (result.ok) return
    if (result.reason === 'invalid') {
      setErrorKey('authFailed')
      passwordRef.current?.focus()
    } else if (result.reason === 'suspended') {
      setSuspendedMessage(result.message ?? FORM_MESSAGES.suspendedFallback)
    } else {
      setNoticeVisible(true)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div>
        <label htmlFor={emailId} className={labelClass}>
          이메일
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="이메일 주소를 입력해 주세요"
          onChange={handleEmailChange}
          className={inputClass}
        />
      </div>
      <div className="mt-5">
        <label htmlFor={passwordId} className={labelClass}>
          비밀번호
        </label>
        <PasswordInput
          id={passwordId}
          ref={passwordRef}
          invalid={passwordInvalid}
          describedBy={passwordInvalid ? errorId : undefined}
          visible={passwordVisible}
          onToggleVisible={() => setPasswordVisible((current) => !current)}
          onChange={handlePasswordChange}
        />
      </div>

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. */}
      <div role="alert">
        {errorKey ? (
          <p id={errorId} className={errorClass}>
            {FORM_MESSAGES[errorKey]}
          </p>
        ) : null}
        {suspendedMessage ? (
          <p className={errorClass}>{suspendedMessage}</p>
        ) : null}
      </div>
      <div role="status">
        {submitting ? (
          <p className={noticeClass}>{FORM_MESSAGES.submitting}</p>
        ) : null}
        {/* 제출 결과의 연결 실패, 또는 앱 시작 확인이 서버에 닿지 못한 경우(F1-D7). 같은 문구를 한 번만 보여 준다. */}
        {noticeVisible ||
        (connectionNotice && !submitting && !errorKey && !suspendedMessage) ? (
          <p className={noticeClass}>{FORM_MESSAGES.connectionFailed}</p>
        ) : null}
      </div>

      {/* disabled 속성은 포커스를 잃게 하므로 쓰지 않고 aria-disabled로 처리한다. 중복 제출은 handleSubmit이 막는다. */}
      <button
        type="submit"
        aria-disabled={submitting || undefined}
        className={`mt-6 aria-disabled:cursor-wait aria-disabled:opacity-70 ${primaryButtonClass}`}
      >
        {submitting ? '로그인 중…' : '로그인하고 시작하기'}
      </button>
    </form>
  )
}

/**
 * A01 로그인 화면. 기능·문구 기준은 v5.0 화면 명세과 v5.0 HTML 스토리보드다.
 *
 * 회원가입(A03)은 `/signup` 라우트로 연결한다.
 * 비밀번호 재설정(A04)은 `/password/reset` 라우트로 연결한다.
 *
 * 로그인 처리는 useAuth().login에 맡긴다(기본은 실제 서버 POST /api/v1/auth/login, `VITE_DEV_AUTH=true`면 개발용 계정).
 * 앱 시작 확인 중(loading)에도 폼을 그대로 보여 주며, 직접 로그인하면 시작 확인 결과는 버려진다.
 * 이미 로그인한 사용자는 /home으로 보낸다. 로그인에 성공해도 같은 경로로 이동한다.
 * 단, 로그인 안내(LoginRequiredNotice)에서 들어와 history state에 안전한 앱 내부 경로(returnTo, safeReturnTo로 검증)가 있으면 그 화면으로 돌아간다.
 */
export default function LoginPage() {
  const { status } = useAuth()
  const matches = useMatches()
  const location = useLocation()
  if (status === 'authenticated') {
    return <Navigate to={safeReturnTo(location.state) ?? '/home'} replace />
  }
  // 상단 바가 없어서 뒤로가기(→홈)는 이 틀 안에서 직접 그린다(라우트 handle.bodyBack). 목적지는 handle.parent다.
  const parent = getRouteHandle(matches.at(-1)?.handle).parent ?? null
  // 비밀번호 재설정(A04)으로 갈 때도 로그인 후 돌아갈 경로(검증된 값만)를 이어 가 A04의 "로그인으로 돌아가기"가 되돌려 준다.
  const returnTo = safeReturnTo(location.state)

  return (
    <AuthFrame>
      <div className="px-5 pt-2">
        <BackLink parent={parent} />
      </div>
      <AuthHero
        plain
        title={
          <>
            운동도, 식단도.
            <br />
            다시 나의 루틴으로.
          </>
        }
        description={
          <>
            운동과 식단의 기록이 꾸준한 건강 습관으로.
            <br />
            무료로 가입하고 나에게 맞는 루틴을 시작하세요.
          </>
        }
      />

      <AuthBody>
        <section aria-labelledby="login-form-title">
          {/* 화면 제목(h1 로그인)은 AppShell이 보조기기용으로 넣으므로 여기는 섹션 이름으로만 쓴다. */}
          <h3 id="login-form-title" className="sr-only">
            로그인
          </h3>
          <LoginForm />
          <div className="mt-1 flex justify-center">
            <Link
              to="/password/reset"
              state={returnTo ? { returnTo } : undefined}
              data-login-reset-link=""
              className="inline-flex min-h-11 items-center text-support font-semibold text-brand underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              비밀번호를 잊으셨나요?
            </Link>
          </div>
        </section>

        <AuthSwitchCard
          prompt="처음 오셨나요?"
          hint="기본 기록과 다시 시작은 무료예요."
          to="/signup"
          linkLabel="무료 회원가입"
          arrow="→"
        />
      </AuthBody>
    </AuthFrame>
  )
}
