import {
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from 'react'
import {
  EMAIL_ERROR_MESSAGE,
  MAX_EMAIL_LENGTH,
  RESET_MESSAGES,
  runResetRequest,
  validateResetEmail,
  type EmailError,
  type PasswordResetSource,
  type ResetPhase,
} from '../../auth/passwordReset.ts'
import {
  errorClass,
  inputClass,
  labelClass,
  noticeClass,
  primaryButtonClass,
} from './authStyles.ts'

/**
 * A04 이메일 입력·요청 폼. 처리 상태(ResetPhase)를 구분해 알린다.
 * - 검증은 입력 형식뿐이다(빈 값·형식). 오류는 입력에 연결(aria-invalid·aria-describedby)하고 입력을 유지한 채 입력으로 포커스를 옮긴다.
 * - 서버 연결(source)이 없으면 요청하지 않고 "연결 전"을 알린다. "요청 완료"는 서버가 접수했을 때만 나온다.
 * - 처리 중에는 다시 제출해도 요청이 한 번만 나간다(ref로 막고 aria-disabled). 이메일을 고치면 이전 결과 안내를 지운다.
 * - 결과(연결 전·실패·완료)가 나오면 안내 영역으로 포커스를 옮겨 읽어 준다.
 * `initial`은 시험에서만 쓴다(화면은 넘기지 않으므로 실제 화면에서는 항상 처음 상태로 시작한다).
 */
export default function PasswordResetForm({
  source,
  initial,
}: {
  source: PasswordResetSource | null
  initial?: { phase: ResetPhase; email?: string; error?: EmailError }
}) {
  const [email, setEmail] = useState(initial?.email ?? '')
  const [phase, setPhase] = useState<ResetPhase>(initial?.phase ?? 'idle')
  const [error, setError] = useState<EmailError | null>(initial?.error ?? null)
  const submittingRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultRef = useRef<HTMLDivElement>(null)
  const firstRef = useRef(true)
  const baseId = useId()
  const emailId = `${baseId}-email`
  const errorId = `${baseId}-error`

  // 화면을 떠나면 진행 중 요청을 중단한다.
  useEffect(() => () => abortRef.current?.abort(), [])
  // 결과 안내가 나오면 그곳으로 포커스를 옮긴다(처음 그릴 때는 옮기지 않는다).
  useEffect(() => {
    if (firstRef.current) {
      firstRef.current = false
      return
    }
    if (phase === 'unavailable' || phase === 'failed' || phase === 'done') {
      resultRef.current?.focus()
    }
  }, [phase])

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setEmail(event.target.value)
    // 이메일을 고치면 이전 오류·결과 안내를 지운다(진행 중인 요청의 상태는 건드리지 않는다).
    if (!submittingRef.current) {
      setError(null)
      setPhase('idle')
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current) return
    const checked = validateResetEmail(email)
    if (!checked.ok) {
      setError(checked.error)
      setPhase('invalid')
      inputRef.current?.focus()
      return
    }
    setError(null)
    submittingRef.current = true
    setPhase(source === null ? 'preparing' : 'requesting')
    const controller = new AbortController()
    abortRef.current = controller
    const result = await runResetRequest(
      source,
      checked.email,
      controller.signal,
    )
    if (controller.signal.aborted) return
    abortRef.current = null
    submittingRef.current = false
    setPhase(result)
  }

  const busy = phase === 'preparing' || phase === 'requesting'
  const invalid = error !== null
  return (
    <form onSubmit={handleSubmit} noValidate data-reset-form="">
      <div>
        <label htmlFor={emailId} className={labelClass}>
          가입 이메일
        </label>
        <input
          ref={inputRef}
          id={emailId}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          maxLength={MAX_EMAIL_LENGTH}
          placeholder="이메일 주소를 입력해 주세요"
          value={email}
          onChange={handleChange}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? errorId : undefined}
          className={inputClass}
        />
      </div>

      {/* 보조기기가 변경을 알 수 있도록 알림 영역은 항상 렌더한다. */}
      <div role="alert">
        {error ? (
          <p id={errorId} className={errorClass}>
            {EMAIL_ERROR_MESSAGE[error]}
          </p>
        ) : null}
      </div>
      <div role="status">
        {phase === 'preparing' || phase === 'requesting' ? (
          <p data-reset-state={phase} className={noticeClass}>
            {RESET_MESSAGES[phase]}
          </p>
        ) : null}
        {phase === 'unavailable' || phase === 'failed' || phase === 'done' ? (
          <div
            ref={resultRef}
            tabIndex={-1}
            data-reset-state={phase}
            className={`${phase === 'failed' ? errorClass : noticeClass} focus:outline-none`}
          >
            {RESET_MESSAGES[phase]}
          </div>
        ) : null}
      </div>

      {/* disabled 속성은 포커스를 잃게 하므로 aria-disabled로 처리한다. 중복 제출은 handleSubmit이 막는다. */}
      <button
        type="submit"
        aria-disabled={busy || undefined}
        className={`mt-6 aria-disabled:cursor-wait aria-disabled:opacity-70 ${primaryButtonClass}`}
      >
        {busy ? '요청 중…' : '재설정 안내 요청'}
      </button>
    </form>
  )
}
