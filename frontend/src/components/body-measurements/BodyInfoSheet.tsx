import { useId, useRef, useState, type FormEvent } from 'react'
import type {
  BodyMeasurementInput,
  BodyMeasurementStatus,
} from '../../body-measurements/bodyTypes.ts'
import {
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  parseMeasurement,
  type MeasurementError,
  type MeasurementRange,
} from '../../body-measurements/bodyValidation.ts'
import {
  errorClass,
  inputClass,
  labelClass,
  primaryButtonClass,
  primaryDisabledClass,
} from '../auth/authStyles.ts'
import BottomSheet from '../layout/BottomSheet.tsx'
import Icon from '../icons/Icon.tsx'

type Variant = 'home' | 'mypage' | 'page'

/** 화면 문구. home은 사용자가 정한 안내 문구이고, mypage는 같은 입력을 마이페이지에서 다시 열 때의 문구, page는 P06 화면(시트가 아닌 전체 화면)의 문구다. */
const TEXT: Record<Variant, { title: string; submit: string; later: string }> =
  {
    home: {
      title: '시작하기 전에 신체 정보를 알려주세요',
      submit: '저장하고 시작하기',
      later: '나중에 입력하기',
    },
    mypage: {
      title: '신체 정보를 입력해 주세요',
      submit: '저장하기',
      later: '닫기',
    },
    page: {
      title: '키·몸무게 입력',
      submit: '저장하기',
      later: '취소',
    },
  }

const DESCRIPTION =
  '키와 몸무게를 입력하면 나에게 맞는 운동·식단 안내를 준비하는 데 도움이 돼요.'
const CAPTION =
  '입력한 정보는 건강관리 서비스에 활용되며, 마이페이지에서 확인할 수 있어요.'

interface FieldDef {
  id: 'height' | 'weight'
  label: string
  /** 조사가 붙는 오류 문구용 */
  subject: string
  object: string
  unit: string
  range: MeasurementRange
  placeholder: string
}

const FIELDS: readonly FieldDef[] = [
  {
    id: 'height',
    label: '키',
    subject: '키는',
    object: '키를',
    unit: 'cm',
    range: HEIGHT_RANGE,
    placeholder: '예) 170.5',
  },
  {
    id: 'weight',
    label: '몸무게',
    subject: '몸무게는',
    object: '몸무게를',
    unit: 'kg',
    range: WEIGHT_RANGE,
    placeholder: '예) 65.5',
  },
]

function errorMessage(field: FieldDef, reason: MeasurementError): string {
  if (reason === 'empty') return `${field.object} 입력해 주세요.`
  if (reason === 'format') {
    return '숫자로 입력해 주세요. 소수점은 첫째 자리까지 쓸 수 있어요.'
  }
  return `${field.subject} ${field.range.min}~${field.range.max}${field.unit} 사이로 입력해 주세요.`
}

interface BodyInfoSheetProps {
  variant: Variant
  /** 등록 여부. 이미 등록된 항목은 입력받지 않고 가려서(***) 보여 준다. */
  status: BodyMeasurementStatus
  /** 저장. 실패하면 예외를 던지고, 그 경우 입력값은 그대로 남는다. */
  save: (input: BodyMeasurementInput) => Promise<void>
  /** 시트가 닫힌 뒤(저장 성공·나중에 입력하기·Esc·배경·닫기 버튼) 호출된다. */
  onClose: () => void
}

/**
 * 신체 정보(키·몸무게) 입력 바텀시트. 기존 BottomSheet를 재사용한다(포커스 이동·복귀, 배경 inert, 스크롤 잠금, Esc는 그쪽이 맡는다).
 *
 * - 누락된 항목만 입력받는다. 이미 등록된 항목은 값을 읽지 않고 `***`로 가려 "등록됨"만 보여 준다. 수치를 미리 채우면 PIN 없이
 *   실제 값이 노출되므로(API 정책 문서 §3-3) 미리 채우지 않는다.
 * - 검증은 명세 P06의 규약(소수점 첫째 자리, 키 1~300cm, 몸무게 1~500kg)이고 오류는 필드 가까이에 보인다. 저장 전에는 어떤 값도
 *   회원 정보에 반영하지 않는다.
 * - 저장 중에는 버튼을 막아 중복 제출을 방지한다. 실패하면 입력값을 유지하고 오류를 보여 준다. 성공하면 닫는다.
 * - 입력창에 포커스하면 모바일 키보드가 가리지 않도록 입력창을 화면 가운데로 스크롤한다.
 */
export default function BodyInfoSheet({
  variant,
  status,
  save,
  onClose,
}: BodyInfoSheetProps) {
  const text = TEXT[variant]
  return (
    <BottomSheet title={text.title} onClose={onClose}>
      {(close, closing) => (
        <BodyInfoForm
          variant={variant}
          status={status}
          save={save}
          close={close}
          closing={closing}
        />
      )}
    </BottomSheet>
  )
}

/**
 * 입력 폼 본체. 시트(BodyInfoSheet)와 P06 화면(variant "page")이 같이 쓴다.
 * - `editable`: 이미 등록된 항목 중 다시 입력할 수 있는 것(P06이 정한다). 등록된 값은 읽지 않고 가려 두며, "다시 입력"을 눌러야 빈 입력칸이 열리고
 *   저장하면 새 값으로 바뀐다(이전 값을 보여 주거나 채워 넣지 않는다). 시트에서는 쓰지 않는다.
 * - `onSaved`: 있으면 저장 성공 뒤 닫지 않고 알린다(화면에 머무는 P06). 없으면 기존처럼 `close()`로 닫는다.
 */
export function BodyInfoForm({
  variant,
  status,
  save,
  close,
  closing,
  editable = [],
  onSaved,
}: Omit<BodyInfoSheetProps, 'onClose'> & {
  close: () => void
  closing: boolean
  editable?: readonly ('height' | 'weight')[]
  onSaved?: () => void
}) {
  const text = TEXT[variant]
  const formId = useId()
  const [values, setValues] = useState({ height: '', weight: '' })
  const [errors, setErrors] = useState<
    Partial<Record<'height' | 'weight', MeasurementError>>
  >({})
  const [saving, setSaving] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const [reentering, setReentering] = useState<
    Record<'height' | 'weight', boolean>
  >({ height: false, weight: false })
  const submitting = useRef(false)
  // 입력을 받는 항목: 등록되지 않은 항목, 그리고 "다시 입력"을 연 등록 항목.
  const missing = FIELDS.filter(
    (f) => !status[f.id] || (editable.includes(f.id) && reentering[f.id]),
  )
  const firstMissing = FIELDS.find((f) => !status[f.id])?.id

  function toggleReenter(id: 'height' | 'weight', on: boolean) {
    setReentering((prev) => ({ ...prev, [id]: on }))
    if (!on) {
      // 그대로 두기: 입력과 오류를 버린다.
      setValues((prev) => ({ ...prev, [id]: '' }))
      setErrors((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
    setSaveFailed(false)
  }

  function validate(id: 'height' | 'weight', value: string) {
    const field = FIELDS.find((f) => f.id === id)!
    const result = parseMeasurement(value, field.range)
    setErrors((prev) => {
      const next = { ...prev }
      if (result.ok) delete next[id]
      else next[id] = result.reason
      return next
    })
    return result
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // 중복 제출 방지: 처리 중이거나 닫히는 중에는 다시 보내지 않는다.
    if (submitting.current || closing || missing.length === 0) return

    const input: BodyMeasurementInput = {}
    let firstInvalid: string | null = null
    for (const field of missing) {
      const result = validate(field.id, values[field.id])
      if (!result.ok) {
        firstInvalid ??= field.id
      } else if (field.id === 'height') {
        input.heightCm = result.value
      } else {
        input.weightKg = result.value
      }
    }
    if (firstInvalid) {
      document.getElementById(`${formId}-${firstInvalid}`)?.focus()
      return
    }

    submitting.current = true
    setSaving(true)
    setSaveFailed(false)
    try {
      await save(input)
      if (onSaved) {
        // 화면에 머무는 경우: 입력을 비우고 다시 입력 상태를 닫는다(저장한 값은 읽지 않는다).
        setValues({ height: '', weight: '' })
        setReentering({ height: false, weight: false })
        setSaving(false)
        submitting.current = false
        onSaved()
      } else {
        close()
      }
    } catch {
      // 실패하면 입력값을 그대로 두고 다시 시도할 수 있게 한다.
      setSaveFailed(true)
      setSaving(false)
      submitting.current = false
    }
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
          {DESCRIPTION}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-4">
        {FIELDS.map((field) => {
          const error = errors[field.id]
          const inputId = `${formId}-${field.id}`
          const errorId = `${inputId}-error`
          const hintId = `${inputId}-hint`
          if (status[field.id] && !reentering[field.id]) {
            // 이미 등록된 항목: 값을 읽지 않고 가려서 보여 준다. 다시 입력은 `editable`인 항목만 열 수 있다.
            return (
              <div key={field.id}>
                <span className={labelClass}>{field.label}</span>
                <div className="flex min-h-12 items-center justify-between rounded-control bg-page px-4 text-body font-normal text-muted">
                  <span>
                    <span aria-hidden="true">***</span>
                    <span className="sr-only">숨김</span> {field.unit}
                  </span>
                  <span className="font-semibold text-content">등록됨</span>
                </div>
                {editable.includes(field.id) ? (
                  <button
                    type="button"
                    onClick={() => toggleReenter(field.id, true)}
                    disabled={saving || closing}
                    data-body-reenter={field.id}
                    className="mt-1 -ml-1 inline-flex min-h-11 cursor-pointer items-center px-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
                  >
                    {field.label} 다시 입력
                  </button>
                ) : null}
              </div>
            )
          }
          return (
            <div key={field.id}>
              <label htmlFor={inputId} className={labelClass}>
                {field.label}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id={inputId}
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  enterKeyHint={
                    field.id === firstMissing && missing.length > 1
                      ? 'next'
                      : 'done'
                  }
                  data-autofocus={field.id === firstMissing ? '' : undefined}
                  value={values[field.id]}
                  placeholder={field.placeholder}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${hintId} ${errorId}` : hintId}
                  disabled={saving}
                  onChange={(e) => {
                    setValues((prev) => ({
                      ...prev,
                      [field.id]: e.target.value,
                    }))
                    setSaveFailed(false)
                    if (error) validate(field.id, e.target.value)
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== '')
                      validate(field.id, e.target.value)
                  }}
                  onFocus={(e) =>
                    // 모바일 키보드가 입력창을 가리지 않도록 화면 가운데로 옮긴다.
                    e.currentTarget.scrollIntoView({
                      block: 'center',
                      behavior: window.matchMedia(
                        '(prefers-reduced-motion: reduce)',
                      ).matches
                        ? 'auto'
                        : 'smooth',
                    })
                  }
                  className={`${inputClass} min-w-0 flex-1`}
                />
                <span className="w-8 shrink-0 text-body font-normal text-muted">
                  {field.unit}
                </span>
              </div>
              <p
                id={hintId}
                className="mt-1.5 text-support leading-snug font-normal text-muted"
              >
                {field.range.min}~{field.range.max}
                {field.unit}, 소수점 첫째 자리까지 입력할 수 있어요.
              </p>
              {error ? (
                <p id={errorId} role="alert" className={errorClass}>
                  {errorMessage(field, error)}
                </p>
              ) : null}
              {status[field.id] ? (
                <button
                  type="button"
                  onClick={() => toggleReenter(field.id, false)}
                  disabled={saving || closing}
                  data-body-keep={field.id}
                  className="mt-1 -ml-1 inline-flex min-h-11 cursor-pointer items-center px-1 text-body leading-snug font-normal text-muted hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed"
                >
                  그대로 두기
                </button>
              ) : null}
            </div>
          )
        })}
      </div>

      <p className="mt-5 text-support leading-relaxed font-normal text-muted">
        {CAPTION}
      </p>

      {saveFailed ? (
        <p role="alert" className={errorClass}>
          저장하지 못했어요. 입력한 값은 그대로 있으니 다시 시도해 주세요.
        </p>
      ) : null}

      <div className="mt-5 flex flex-col gap-2">
        <button
          type="submit"
          disabled={saving || closing || missing.length === 0}
          className={`${primaryButtonClass} ${primaryDisabledClass}`}
        >
          {saving ? '저장하는 중…' : text.submit}
        </button>
        <button
          type="button"
          onClick={close}
          disabled={saving || closing}
          className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control text-body font-normal text-muted transition-colors hover:text-content focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed motion-reduce:transition-none"
        >
          {text.later}
        </button>
      </div>
    </form>
  )
}
