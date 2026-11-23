import { useId, useRef, useState, type FormEvent } from 'react'
import {
  WEIGHT_RANGE,
  parseMeasurement,
  type MeasurementError,
} from '../../body-measurements/bodyValidation.ts'
import { weightLogMessage } from '../../weight-log/weightLogMessages.ts'
import {
  WeightLogError,
  type WeightLogInput,
} from '../../weight-log/weightLogTypes.ts'
import {
  errorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryButtonClass,
} from '../auth/authStyles.ts'
import Icon from '../icons/Icon.tsx'
import BottomSheet from '../layout/BottomSheet.tsx'

/**
 * 시트의 변형.
 * - due: 홈 월간 확인 카드에서(마지막 기록 후 한 달). manual: 마이페이지에서 정상 상태로 직접 기록.
 * - mismatch: 등록된 몸무게와 마지막 기록이 어긋난 상태. 이전 기록을 복사할 수 없다.
 * - start: 이력이 없는 첫 기록(마이페이지 "체중 기록 시작하기"). 복사할 이전 기록이 없다.
 */
export type WeightLogSheetVariant = 'due' | 'manual' | 'mismatch' | 'start'

const TEXT = {
  due: { title: '이번 달 몸무게를 기록해요', submit: '저장하기' },
  manual: { title: '몸무게를 기록해요', submit: '저장하기' },
  mismatch: { title: '현재 몸무게를 다시 기록해요', submit: '저장하기' },
  start: { title: '체중 기록을 시작해요', submit: '첫 기록 저장하기' },
} as const

const DESCRIPTION =
  '지금 몸무게를 입력하면 이번 기록이 남고, 다음 확인일도 이어서 정해져요. 같은 몸무게여도 기록이 새로 추가돼요.'
const START_DESCRIPTION =
  '지금 몸무게를 입력하면 첫 기록이 남고, 한 달 뒤에 다시 확인해 드려요. 이전에 등록된 몸무게는 보여 드리지 않으니 현재 몸무게를 직접 입력해 주세요.'
const CAPTION =
  '입력한 정보는 건강관리 서비스에 활용되며, 마이페이지에서 확인할 수 있어요.'
const BLOCKED_HINT =
  '등록된 몸무게와 마지막 기록이 달라서 이 방법은 쓸 수 없어요. 현재 몸무게를 직접 입력해 주세요.'

function validationMessage(reason: MeasurementError): string {
  if (reason === 'empty') return '몸무게를 입력해 주세요.'
  if (reason === 'format')
    return '숫자로 입력해 주세요. 소수점은 첫째 자리까지 쓸 수 있어요.'
  return `몸무게는 ${WEIGHT_RANGE.min}~${WEIGHT_RANGE.max}kg 사이로 입력해 주세요.`
}

interface WeightLogSheetProps {
  variant: WeightLogSheetVariant
  /** 저장. 실패하면 WeightLogError를 던지고, 그 경우 입력값은 그대로 남는다. 수치는 이 시트와 홈에 되돌려주지 않는다. */
  log: (input: WeightLogInput) => Promise<void>
  /** 시트가 닫힌 뒤(저장 성공·닫기·Esc·배경) 호출된다. */
  onClose: () => void
}

/**
 * 몸무게 기록 입력 바텀시트. 기존 BottomSheet와 신체 정보 입력(P06) 시트의 스타일을 재사용한다.
 *
 * - 현재 몸무게를 직접 입력한다(1~500kg, 소수점 첫째 자리). 이전 몸무게 값은 읽지도 보여 주지도 않는다.
 * - "지난번과 같아요"는 저장소가 마지막 기록을 복사하는 버튼이다(화면이 값을 모른다). 기록과 등록된 몸무게가 어긋난
 *   mismatch에서는 쓸 수 없어 비활성이며 이유를 글자로 알린다.
 * - 저장 중에는 버튼을 막아 중복 제출을 방지한다. 실패하면 입력값을 유지하고 오류를 보여 준다. 성공하면 닫는다.
 * - partialSave는 성공이 아니다. 입력과 저장 버튼을 잠그고 안내를 남기며, 닫으면 홈이 상태를 다시 조회한 결과를 보여 준다.
 */
export default function WeightLogSheet({
  variant,
  log,
  onClose,
}: WeightLogSheetProps) {
  return (
    <BottomSheet title={TEXT[variant].title} onClose={onClose}>
      {(close, closing) => (
        <WeightLogForm
          variant={variant}
          log={log}
          close={close}
          closing={closing}
        />
      )}
    </BottomSheet>
  )
}

function WeightLogForm({
  variant,
  log,
  close,
  closing,
}: Omit<WeightLogSheetProps, 'onClose'> & {
  close: () => void
  closing: boolean
}) {
  const id = useId()
  const inputId = `${id}-weight`
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const blockedId = `${id}-blocked`
  const [value, setValue] = useState('')
  const [fieldError, setFieldError] = useState<MeasurementError | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [partial, setPartial] = useState(false)
  const [saving, setSaving] = useState(false)
  const submitting = useRef(false)
  // 복사할 이전 기록이 없으면(start) 버튼을 그리지 않고, 기록이 어긋나 있으면(mismatch) 비활성으로 이유를 알린다.
  const repeatHidden = variant === 'start'
  const repeatBlocked = variant === 'mismatch'
  const locked = saving || closing || partial

  async function run(input: WeightLogInput) {
    if (submitting.current || closing || partial) return
    submitting.current = true
    setSaving(true)
    setFailure(null)
    try {
      await log(input)
      close()
    } catch (error) {
      // 입력값은 그대로 두고 다시 시도할 수 있게 한다. 일부만 저장된 경우는 성공이 아니므로 더 시도하지 못하게 잠근다.
      if (error instanceof WeightLogError && error.code === 'partialSave')
        setPartial(true)
      setFailure(weightLogMessage(error))
      setSaving(false)
      submitting.current = false
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = parseMeasurement(value, WEIGHT_RANGE)
    if (!result.ok) {
      setFieldError(result.reason)
      document.getElementById(inputId)?.focus()
      return
    }
    setFieldError(null)
    void run({ weightKg: result.value })
  }

  return (
    <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand"
        >
          <Icon name="clipboard-plus" />
        </span>
        <p className="text-body leading-relaxed font-normal text-muted">
          {variant === 'start' ? START_DESCRIPTION : DESCRIPTION}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor={inputId} className={labelClass}>
          현재 몸무게
        </label>
        <div className="flex items-center gap-2">
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="done"
            data-autofocus=""
            value={value}
            placeholder="예) 65.5"
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? `${hintId} ${errorId}` : hintId}
            disabled={locked}
            onChange={(e) => {
              setValue(e.target.value)
              setFailure(null)
              if (fieldError) {
                const result = parseMeasurement(e.target.value, WEIGHT_RANGE)
                setFieldError(result.ok ? null : result.reason)
              }
            }}
            onBlur={(e) => {
              if (e.target.value !== '') {
                const result = parseMeasurement(e.target.value, WEIGHT_RANGE)
                setFieldError(result.ok ? null : result.reason)
              }
            }}
            onFocus={(e) =>
              // 모바일 키보드가 입력창을 가리지 않도록 화면 가운데로 옮긴다.
              e.currentTarget.scrollIntoView({
                block: 'center',
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)')
                  .matches
                  ? 'auto'
                  : 'smooth',
              })
            }
            className={`${inputClass} min-w-0 flex-1`}
          />
          <span className="w-8 shrink-0 text-body font-normal text-muted">
            kg
          </span>
        </div>
        <p
          id={hintId}
          className="mt-1.5 text-support leading-snug font-normal text-muted"
        >
          {WEIGHT_RANGE.min}~{WEIGHT_RANGE.max}kg, 소수점 첫째 자리까지 입력할
          수 있어요.
        </p>
        {fieldError ? (
          <p id={errorId} role="alert" className={errorClass}>
            {validationMessage(fieldError)}
          </p>
        ) : null}
      </div>

      <p className="mt-5 text-support leading-relaxed font-normal text-muted">
        {CAPTION}
      </p>

      {failure ? (
        <p role="alert" className={errorClass}>
          {failure}
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="submit"
          disabled={locked}
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {saving ? '저장하는 중…' : TEXT[variant].submit}
        </button>
        {repeatHidden ? null : (
          <button
            type="button"
            onClick={() => void run({ sameAsLast: true })}
            disabled={locked || repeatBlocked}
            aria-describedby={repeatBlocked ? blockedId : undefined}
            className={`${secondaryButtonClass} disabled:cursor-not-allowed disabled:border-line disabled:text-muted disabled:hover:bg-surface`}
          >
            지난번과 같아요
          </button>
        )}
        {repeatBlocked ? (
          <p
            id={blockedId}
            className="text-support leading-snug font-normal text-muted"
          >
            {BLOCKED_HINT}
          </p>
        ) : null}
        <button
          type="button"
          onClick={close}
          disabled={saving || closing}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control text-body font-normal text-muted transition-colors hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed motion-reduce:transition-none"
        >
          닫기
        </button>
      </div>
    </form>
  )
}
