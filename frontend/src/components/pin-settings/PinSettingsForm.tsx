import { useId, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import type { PinSubmitResult } from '../../pin-settings/usePinSettings.ts'
import {
  PIN_LOCKED_MESSAGE,
  isPinLockedError,
  pinErrorField,
  pinSettingsMessage,
} from '../../pin-settings/pinSettingsMessages.ts'
import {
  sanitizePinInput,
  validatePinForm,
  type PinFieldName,
  type PinFormValues,
  type PinReturn,
  type PinSettingsMode,
} from '../../pin-settings/pinSettingsPolicy.ts'
import {
  errorClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryLinkClass,
} from '../auth/authStyles.ts'
import PinField from './PinField.tsx'

const EMPTY: PinFormValues = { current: '', next: '', confirm: '' }
const HIDDEN: Record<PinFieldName, boolean> = {
  current: false,
  new: false,
  confirm: false,
}

interface PinSettingsFormProps {
  mode: PinSettingsMode
  /** true이면 입력과 저장을 모두 막는다(연결 전·미등록 변경 등). 입력값은 처리하지 않는다. */
  disabled: boolean
  /** 현재 번호 확인이 5회 실패로 잠겼는지(변경만). 기본(`blockWhenLocked`)은 잠금 중 저장할 수 없다. */
  locked: boolean
  /** 잠금 안내 문구. 기본은 모의 모드의 5분 문구(`PIN_LOCKED_MESSAGE`). 서버 모드는 "최대 10분" 문구를 넘긴다(F4-D4). */
  lockMessage?: string
  /**
   * 잠금 중 제출을 막는지. 기본 true(모의 모드·가입 PIN의 기존 동작). 서버 모드는 false — 안내만 하고 판정은 서버(403)에 맡긴다(F4-D4).
   */
  blockWhenLocked?: boolean
  /** 현재와 같은 새 번호를 허용하는지. 기본 false(모의 모드). 서버 모드는 true(F4-D7, PIN7-9). */
  allowSamePin?: boolean
  submit: (values: PinFormValues) => Promise<PinSubmitResult | null>
  /** 허용된 진입 화면(P05 등)에서 들어왔을 때의 복귀 지점. "취소"가 그곳으로 돌아간다. 없으면 상세 설정이다. */
  returnTo?: PinReturn | null
  /**
   * 가입 설정(`/signup/pin`)처럼 문구와 이동이 다른 곳이 쓰는 덮어쓰기. 없으면 P11·P12의 기본 문구와 "취소"(진입 화면 또는 상세 설정)다.
   * 입력 검증·마스킹·중복 제출 방지는 그대로이고 바뀌는 것은 글자와 링크 목적지뿐이다.
   */
  texts?: {
    nextLabel?: string
    confirmLabel?: string
    submitLabel?: string
    cancelLabel?: string
    cancelTo?: string
  }
}

/**
 * P11·P12 입력 폼. 입력값은 이 컴포넌트의 상태에만 두고, 처리 중에는 중복 제출을 막으며, 처리 결과를 받은 뒤에는 번호를 화면에 남기지 않는다.
 * - 검증은 제출 때 한 번에 하나씩 안내하고 해당 칸으로 포커스를 옮긴다(aria-invalid · aria-describedby).
 * - 현재 번호가 틀리면 그 칸만 비운다. 새 번호와 확인은 마스킹된 채 유지한다(다시 입력하는 수고를 줄인다).
 * - 성공하면 모든 입력을 비우고, 완료 화면은 부모가 보여 준다.
 */
export default function PinSettingsForm({
  mode,
  disabled,
  locked,
  lockMessage = PIN_LOCKED_MESSAGE,
  blockWhenLocked = true,
  allowSamePin = false,
  submit,
  returnTo = null,
  texts,
}: PinSettingsFormProps) {
  const [values, setValues] = useState<PinFormValues>(EMPTY)
  const [visible, setVisible] = useState(HIDDEN)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<{
    field: PinFieldName
    message: string
  } | null>(null)
  const pending = useRef(false)
  const base = useId()
  const errorId = `${base}-error`
  const helpId = `${base}-help`

  // 잠금이 풀리면 잠금 안내를 거둔다.
  const shown =
    error && !(error.message === lockMessage && !locked) ? error : null
  const message = shown?.message ?? (locked ? lockMessage : null)
  const invalidField: PinFieldName | null =
    shown?.field ?? (locked ? 'current' : null)

  function describe(field: PinFieldName) {
    return invalidField === field && message ? `${helpId} ${errorId}` : helpId
  }
  function focusField(field: PinFieldName) {
    document.getElementById(`${base}-${field}`)?.focus()
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending.current || disabled) return
    if (locked && blockWhenLocked) {
      setError({ field: 'current', message: lockMessage })
      focusField('current')
      return
    }
    const issue = validatePinForm(mode, values, { allowSame: allowSamePin })
    if (issue) {
      setError(issue)
      focusField(issue.field)
      return
    }
    pending.current = true
    setBusy(true)
    setError(null)
    // 제출하면 눈 모양으로 열어 둔 칸도 다시 가린다.
    setVisible(HIDDEN)
    try {
      const result = await submit(values)
      if (!result) return
      if (result.ok) {
        setValues(EMPTY)
        return
      }
      const field = pinErrorField(result.error)
      setError({
        field,
        message: isPinLockedError(result.error)
          ? lockMessage
          : pinSettingsMessage(result.error),
      })
      // 현재 번호 오류는 그 칸을 비운다. 새 번호·확인은 유지한다.
      if (field === 'current') setValues((v) => ({ ...v, current: '' }))
      focusField(field)
    } finally {
      pending.current = false
      setBusy(false)
    }
  }

  function setValue(key: keyof PinFormValues, value: string) {
    setValues((v) => ({ ...v, [key]: sanitizePinInput(value) }))
    // 입력을 고치기 시작하면 그 칸을 가리키던 일반 오류는 거두되, 잠금 안내는 잠금이 풀릴 때까지 둔다.
    setError((e) => (e?.message === lockMessage ? e : null))
  }
  function toggle(field: PinFieldName) {
    setVisible((v) => ({ ...v, [field]: !v[field] }))
  }

  const fieldProps = (field: PinFieldName) => ({
    visible: visible[field],
    onToggleVisible: () => toggle(field),
    readOnly: busy,
    disabled,
    invalid: invalidField === field && message !== null,
    describedBy: describe(field),
  })

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      data-pin-form={mode}
      className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4"
    >
      {mode === 'change' ? (
        <PinField
          id={`${base}-current`}
          name="pinCurrent"
          label="현재 2차 비밀번호"
          value={values.current}
          onChange={(value) => setValue('current', value)}
          {...fieldProps('current')}
        />
      ) : null}
      <PinField
        id={`${base}-new`}
        name="pinNew"
        label={texts?.nextLabel ?? '새 2차 비밀번호'}
        value={values.next}
        onChange={(value) => setValue('next', value)}
        {...fieldProps('new')}
      />
      <PinField
        id={`${base}-confirm`}
        name="pinConfirm"
        label={texts?.confirmLabel ?? '새 2차 비밀번호 확인'}
        value={values.confirm}
        onChange={(value) => setValue('confirm', value)}
        {...fieldProps('confirm')}
      />
      <p
        id={helpId}
        className="text-support leading-relaxed font-normal text-muted"
      >
        숫자 6자리를 동일하게 두 번 입력해 주세요.
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
        disabled={busy || disabled || (locked && blockWhenLocked)}
        className={`${primaryButtonClass} ${primaryDisabledClass}`}
      >
        {busy
          ? '처리하는 중…'
          : mode === 'change'
            ? '변경 내용 저장'
            : (texts?.submitLabel ?? '2차 비밀번호 등록')}
      </button>
      <Link
        to={texts?.cancelTo ?? returnTo?.to ?? '/settings'}
        state={texts?.cancelTo ? undefined : returnTo?.state}
        className={secondaryLinkClass}
      >
        {texts?.cancelLabel ?? '취소'}
      </Link>
    </form>
  )
}
