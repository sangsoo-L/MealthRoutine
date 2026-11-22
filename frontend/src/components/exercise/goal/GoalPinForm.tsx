import { useRef, useState, type FormEvent } from 'react'
import { exerciseGoalMessage } from '../../../exercise-goal/exerciseGoalMessages.ts'
import { ExerciseGoalError } from '../../../exercise-goal/exerciseGoalTypes.ts'
import Icon from '../../icons/Icon.tsx'
import {
  goalCard,
  goalFocus,
  goalHeading,
  goalInput,
  goalPrimary,
} from './goalStyles.ts'

export default function GoalPinForm({
  configured,
  retryAt,
  register,
  unlock,
}: {
  configured: boolean
  retryAt: number | null
  register: (pin: string, confirmation: string) => Promise<void>
  unlock: (pin: string) => Promise<void>
}) {
  const [pin, setPin] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [limitedUntil, setLimitedUntil] = useState(retryAt)
  const pending = useRef(false)
  const pinRef = useRef<HTMLInputElement>(null)
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current) return
    setError('')
    if (limitedUntil && limitedUntil > Date.now()) {
      setError('확인이 잠시 제한돼요. 5분 후 다시 시도해 주세요.')
      return
    }
    pending.current = true
    setBusy(true)
    try {
      if (configured) await unlock(pin)
      else await register(pin, confirmation)
      setPin('')
      setConfirmation('')
      setVisible(false)
    } catch (reason) {
      setError(exerciseGoalMessage(reason))
      if (reason instanceof ExerciseGoalError && reason.code === 'locked')
        setLimitedUntil(reason.retryAt ?? null)
      if (reason instanceof ExerciseGoalError && reason.code === 'pinMismatch')
        document.getElementById('goal-pin-confirmation')?.focus()
      else pinRef.current?.focus()
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <section className={goalCard} aria-labelledby="goal-pin-title">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-exercise-soft text-exercise"
        >
          <Icon name="lock" size={20} />
        </span>
        <div>
          <h2 id="goal-pin-title" className={goalHeading}>
            {configured ? '신체 정보 확인' : '신체 정보를 보호해요'}
          </h2>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {configured
              ? '숫자 6자리 비밀번호를 확인하면 1분 동안 목표를 설정할 수 있어요.'
              : '처음 한 번 숫자 6자리 비밀번호를 등록해 주세요.'}
          </p>
        </div>
      </div>
      <form onSubmit={submit} noValidate className="mt-4 flex flex-col gap-4">
        <div>
          <label
            htmlFor="goal-pin"
            className="mb-2 block text-body text-content"
          >
            {configured ? '2차 비밀번호' : '새 2차 비밀번호'}
          </label>
          <input
            ref={pinRef}
            id="goal-pin"
            name="goalPin"
            type={visible ? 'text' : 'password'}
            inputMode="numeric"
            autoComplete={configured ? 'current-password' : 'new-password'}
            maxLength={6}
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            disabled={busy}
            aria-invalid={!!error}
            aria-describedby={error ? 'goal-pin-error' : undefined}
            className={goalInput}
          />
        </div>
        {!configured ? (
          <div>
            <label
              htmlFor="goal-pin-confirmation"
              className="mb-2 block text-body text-content"
            >
              비밀번호 확인
            </label>
            <input
              id="goal-pin-confirmation"
              name="goalPinConfirmation"
              type={visible ? 'text' : 'password'}
              inputMode="numeric"
              autoComplete="new-password"
              maxLength={6}
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={busy}
              aria-invalid={!!error}
              aria-describedby={error ? 'goal-pin-error' : undefined}
              className={goalInput}
            />
          </div>
        ) : null}
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          className={`inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-control px-2 text-support text-muted ${goalFocus}`}
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={18} />
          {visible ? '비밀번호 숨기기' : '비밀번호 보기'}
        </button>
        <div aria-live="polite">
          {error ? (
            <p
              id="goal-pin-error"
              role="alert"
              className="text-body leading-relaxed text-danger"
            >
              {error}
            </p>
          ) : null}
        </div>
        <button type="submit" disabled={busy} className={goalPrimary}>
          {busy
            ? '확인하는 중…'
            : configured
              ? '확인하고 목표 설정하기'
              : '비밀번호 등록하기'}
        </button>
      </form>
    </section>
  )
}
