import { useId, useRef, useState } from 'react'
import {
  MAX_REPS,
  MAX_WEIGHT_KG,
  MIN_REPS,
  parseReps,
  parseWeightKg,
  type InputMode,
  type SetEntry,
} from '../../../exercise/workoutProgress.ts'
import {
  composeFocusRing,
  composeIconButton,
  composeInput,
  composePrimaryButton,
} from '../compose/composeStyles.ts'

const REPS_ERROR = {
  empty: '실제 횟수를 입력해 주세요.',
  format: '횟수는 숫자로만 입력해 주세요.',
  range: `횟수는 ${MIN_REPS}~${MAX_REPS} 사이로 입력해 주세요.`,
} as const

const WEIGHT_ERROR = {
  empty: '실제 중량을 입력해 주세요. 0kg도 입력할 수 있어요.',
  format: '중량은 숫자로 입력해 주세요. 소수점은 첫째 자리까지 쓸 수 있어요.',
  range: `중량은 0~${MAX_WEIGHT_KG}kg 사이로 입력해 주세요.`,
  decimals: '중량은 소수점 첫째 자리까지 입력할 수 있어요.',
} as const

const disabledCls =
  'aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100'

/**
 * 횟수·중량 입력과 세트 완료. 목표(목표 횟수·중량)와 실제 값을 구분해서 보여 준다. 방식의 구성값(parts)에 따라 입력칸이 정해진다:
 * 횟수형(횟수) · 중량+횟수형(횟수·중량) · 시간+횟수형(횟수) · 중량+시간형(중량). 시간은 타이머(TimerPanel)가 맡고 이 폼은 시간을 다루지 않는다.
 *
 * - 간단 모드(초보·수준 미확인): 목표 값이 실제 값의 초기값이다. 입력칸 없이 "세트 완료" 한 번으로 목표 값을 저장하고, 접힌 "실제 값 고치기"를 열면 고쳐서 저장한다.
 *   단 목표 중량이 없는 중량 방식은 실제 중량을 직접 입력해야 하므로 입력칸을 처음부터 펼친다(자동 0kg 같은 값으로 채우지 않는다).
 * - 상세 모드(중급·고급): 실제 횟수(− / ＋ 버튼과 숫자 입력)와 중량이 목표로 채워져 있고 고쳐서 완료한다. 목표 중량이 없으면 중량칸은 비어 있다.
 * - 횟수 1~999 정수, 중량 0~999kg(소수점 첫째 자리). 중량은 비우면 완료할 수 없다(0kg은 직접 입력했을 때만 유효). 잘못되면 완료하지 않고
 *   입력 아래에 이유를 글자로 알리며 포커스를 그 입력으로 옮긴다. 세트 완료 후 정책 검증(누락·미측정)의 안내는 completeError로 받아 보여 준다.
 * 입력값은 세트가 바뀌면(key) 새로 시작한다.
 */
export default function SetEntryForm({
  parts,
  mode,
  target,
  blocked,
  completeError,
  onComplete,
}: {
  parts: { reps: boolean; weight: boolean }
  mode: InputMode
  target: { reps?: number; weightKg?: number }
  /** 충돌·치명적 실패로 완료할 수 없다. */
  blocked: boolean
  /** 직전 완료 시도가 정책 검증(미측정·누락)에서 막힌 이유. 없으면 null. */
  completeError?: string | null
  onComplete: (entry: SetEntry | undefined) => void
}) {
  const id = useId()
  const needsWeightInput = parts.weight && target.weightKg === undefined
  const [editing, setEditing] = useState(
    mode === 'detailed' || needsWeightInput,
  )
  const [reps, setReps] = useState(
    target.reps === undefined ? '' : String(target.reps),
  )
  const [weight, setWeight] = useState(
    target.weightKg === undefined ? '' : String(target.weightKg),
  )
  const [repsError, setRepsError] = useState<string | null>(null)
  const [weightError, setWeightError] = useState<string | null>(null)
  const repsRef = useRef<HTMLInputElement>(null)
  const weightRef = useRef<HTMLInputElement>(null)
  const showFixedFields = mode === 'detailed' || needsWeightInput

  function adjust(delta: number) {
    const parsed = parseReps(reps)
    const base = parsed.ok ? parsed.value : (target.reps ?? MIN_REPS)
    setReps(String(Math.min(MAX_REPS, Math.max(MIN_REPS, base + delta))))
    setRepsError(null)
  }

  function submit() {
    if (blocked) return
    if (!editing) {
      onComplete(undefined)
      return
    }
    if (parts.reps) {
      const parsedReps = parseReps(reps)
      if (!parsedReps.ok) {
        setRepsError(REPS_ERROR[parsedReps.reason])
        setWeightError(null)
        repsRef.current?.focus()
        return
      }
    }
    if (parts.weight) {
      const parsedWeight = parseWeightKg(weight)
      const problem = !parsedWeight.ok
        ? WEIGHT_ERROR[parsedWeight.reason]
        : parsedWeight.value === undefined
          ? WEIGHT_ERROR.empty
          : null
      if (problem) {
        setRepsError(null)
        setWeightError(problem)
        weightRef.current?.focus()
        return
      }
    }
    setRepsError(null)
    setWeightError(null)
    onComplete({
      ...(parts.reps ? { reps } : {}),
      ...(parts.weight ? { weightKg: weight } : {}),
    })
  }

  const targetParts: string[] = []
  if (parts.reps && target.reps !== undefined)
    targetParts.push(`목표 ${target.reps}회`)
  if (parts.weight && target.weightKg !== undefined)
    targetParts.push(`${parts.reps ? '' : '목표 '}${target.weightKg}kg`)
  const targetText = targetParts.join(' · ')

  const fields = (
    <div className="mt-3 flex flex-col gap-3">
      {parts.reps ? (
        <div>
          <label
            htmlFor={`${id}-reps`}
            className="text-support font-normal text-muted"
          >
            실제 횟수
          </label>
          <div className="mt-1 flex items-center gap-2">
            <button
              type="button"
              aria-label="횟수 1 줄이기"
              onClick={() => adjust(-1)}
              className={composeIconButton}
            >
              −
            </button>
            <input
              ref={repsRef}
              id={`${id}-reps`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              value={reps}
              aria-invalid={repsError !== null}
              aria-describedby={repsError ? `${id}-reps-error` : undefined}
              onChange={(event) => {
                setReps(event.target.value)
                setRepsError(null)
              }}
              className={`${composeInput} text-center tabular-nums`}
            />
            <button
              type="button"
              aria-label="횟수 1 늘리기"
              onClick={() => adjust(1)}
              className={composeIconButton}
            >
              ＋
            </button>
          </div>
          {repsError ? (
            <p
              id={`${id}-reps-error`}
              role="alert"
              className="mt-1 text-support text-danger"
            >
              {repsError}
            </p>
          ) : null}
        </div>
      ) : null}
      {parts.weight ? (
        <div>
          <label
            htmlFor={`${id}-weight`}
            className="text-support font-normal text-muted"
          >
            실제 중량(kg)
          </label>
          <input
            ref={weightRef}
            id={`${id}-weight`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={weight}
            aria-invalid={weightError !== null}
            aria-describedby={weightError ? `${id}-weight-error` : undefined}
            onChange={(event) => {
              setWeight(event.target.value)
              setWeightError(null)
            }}
            className={`${composeInput} mt-1 text-center tabular-nums`}
          />
          {weightError ? (
            <p
              id={`${id}-weight-error`}
              role="alert"
              className="mt-1 text-support text-danger"
            >
              {weightError}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )

  return (
    <div>
      {targetText ? (
        <p className="text-center text-section-title leading-snug font-semibold text-content">
          {targetText}
        </p>
      ) : null}
      {showFixedFields ? (
        fields
      ) : (
        <details
          open={editing}
          onToggle={(event) => setEditing(event.currentTarget.open)}
          className="mt-3"
        >
          <summary
            className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control text-body font-normal text-exercise ${composeFocusRing}`}
          >
            실제 {parts.reps && !parts.weight ? '횟수' : '값'} 고치기
          </summary>
          {editing ? fields : null}
        </details>
      )}
      {completeError ? (
        <p role="alert" className="mt-3 text-support text-danger">
          {completeError}
        </p>
      ) : null}
      <button
        type="button"
        aria-disabled={blocked}
        onClick={submit}
        className={`${composePrimaryButton} mt-4 ${disabledCls}`}
      >
        세트 완료
      </button>
      {mode === 'simple' && !editing ? (
        <p className="mt-2 text-center text-support leading-relaxed font-normal text-muted">
          {parts.weight
            ? parts.reps
              ? '목표 횟수와 중량이 기록으로 저장돼요.'
              : '목표 중량이 기록으로 저장돼요.'
            : '목표 횟수가 기록으로 저장돼요.'}
        </p>
      ) : null}
    </div>
  )
}
