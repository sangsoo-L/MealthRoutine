import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { ExerciseGoalError } from '../../exercise-goal/exerciseGoalTypes.ts'
import {
  PIN_LOCKED_MESSAGE,
  pinSettingsMessage,
} from '../../pin-settings/pinSettingsMessages.ts'
import {
  sanitizePinInput,
  validatePinVerifyInput,
} from '../../pin-settings/pinSettingsPolicy.ts'
import type { PinVerifyResult } from '../../pin-settings/usePinVerify.ts'
import {
  errorClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryLinkClass,
} from '../auth/authStyles.ts'
import PinField from './PinField.tsx'

interface PinVerifyFormProps {
  /** true이면 입력과 확인을 모두 막는다(연결 전·미등록). 입력값은 처리하지 않는다. */
  disabled: boolean
  /** 5분 잠금 중인지. 잠금 중에는 확인할 수 없고 안내가 보인다. */
  locked: boolean
  submit: (pin: string) => Promise<PinVerifyResult | null>
  /**
   * 확인에 성공했을 때. 열람 표지를 만드는 `commit`을 넘겨 준다(F5 계획 8.8.2). 받는 쪽은 이동하기 바로 앞에서 `commit()`을 부르고
   * true일 때만 이동한다(그 사이 로그인·PIN 토큰이 바뀌었으면 false).
   */
  onVerified: (commit: () => boolean) => void
  /** 5회 불일치로 잠겼을 때(P01로 돌아간다). */
  onLocked: () => void
  /** "취소"가 이동할 곳. */
  cancelTo: string
  /** 잠금 안내 문구. 기본은 모의 모드(5분) 문구이고, 서버 모드는 "최대 10분" 문구를 넘긴다(F5-D6). */
  lockedMessage?: string
}

/**
 * P05 신체 정보 확인 입력 폼(2차 비밀번호 한 칸).
 * - 입력값은 이 컴포넌트의 상태에만 두고, 처리 중에는 중복 제출을 막으며(`aria-busy`), 결과를 받은 뒤에는 번호를 화면에 남기지 않는다.
 * - 형식 오류는 저장소를 부르기 전에 안내하고 실패 횟수에 넣지 않는다. 불일치는 남은 횟수(n/5)를 알리고 칸을 비운 뒤 포커스를 돌려준다.
 * - 5회째 불일치(잠금)는 `onLocked`로 알려 P01로 돌아간다.
 */
export default function PinVerifyForm({
  disabled,
  locked,
  submit,
  onVerified,
  onLocked,
  cancelTo,
  lockedMessage = PIN_LOCKED_MESSAGE,
}: PinVerifyFormProps) {
  const [pin, setPin] = useState('')
  const [visible, setVisible] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)
  const base = useId()
  const inputId = `${base}-pin`
  const errorId = `${base}-error`
  const helpId = `${base}-help`

  // 잠금이 풀리면 잠금 안내를 거둔다.
  const shown = error && !(error === lockedMessage && !locked) ? error : null
  const message = shown ?? (locked ? lockedMessage : null)

  function focusInput() {
    document.getElementById(inputId)?.focus()
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || disabled) return
    if (locked) {
      setError(lockedMessage)
      focusInput()
      return
    }
    const issue = validatePinVerifyInput(pin)
    if (issue) {
      setError(issue)
      focusInput()
      return
    }
    pending.current = true
    setBusy(true)
    setError(null)
    // 제출하면 눈 모양으로 열어 둔 칸도 다시 가린다.
    setVisible(false)
    try {
      const result = await submit(pin)
      if (!result) return
      // 실패도 반영 바로 앞에서 다시 확인한다(F5-C1): 그 사이 로그인·화면이 바뀌었으면 문구·포커스·잠금 이동을 하지 않는다.
      if (!result.ok && !result.isCurrent()) return
      setPin('')
      if (result.ok) {
        onVerified(result.commit)
        return
      }
      if (
        result.error instanceof ExerciseGoalError &&
        result.error.code === 'locked'
      ) {
        setError(lockedMessage)
        onLocked()
        return
      }
      setError(pinSettingsMessage(result.error))
      focusInput()
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      aria-busy={busy}
      data-pin-verify=""
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
    >
      <PinField
        id={inputId}
        name="pinVerify"
        label="2차 비밀번호"
        value={pin}
        onChange={(value) => {
          setPin(sanitizePinInput(value))
          // 입력을 고치기 시작하면 일반 오류는 거두되, 잠금 안내는 잠금이 풀릴 때까지 둔다.
          setError((e) => (e === lockedMessage ? e : null))
        }}
        visible={visible}
        onToggleVisible={() => setVisible((v) => !v)}
        readOnly={busy}
        disabled={disabled}
        invalid={message !== null}
        describedBy={message ? `${helpId} ${errorId}` : helpId}
      />
      <p
        id={helpId}
        className="text-support leading-relaxed font-normal text-muted"
      >
        숫자 6자리를 입력해 주세요.
      </p>
      <div aria-live="polite">
        {message ? (
          <p id={errorId} role="alert" className={`${errorClass} mt-0`}>
            {message}
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={busy || disabled || locked}
        className={`${primaryButtonClass} ${primaryDisabledClass}`}
      >
        {busy ? '확인하는 중…' : '확인'}
      </button>
      <Link to={cancelTo} className={secondaryLinkClass}>
        취소
      </Link>
    </form>
  )
}
