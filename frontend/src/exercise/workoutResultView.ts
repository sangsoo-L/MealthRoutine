import type { NormalizedSet, RecordType } from './workoutDraftTypes.ts'
import { formatClock, formatTargetSeconds } from './workoutListView.ts'
import { toLocalDate } from './workoutModel.ts'
import { RECORD_COMPONENTS } from './recordMode.ts'
import {
  MAX_REPS,
  MAX_WEIGHT_KG,
  parseDurationInput,
  parseReps,
  parseWeightKg,
} from './setInput.ts'
import {
  UNMEASURED_LABEL,
  missingFieldsOf,
  type ResultExercise,
  type ResultSummary,
  type TimeStatus,
} from './workoutResult.ts'
import type { PerformedSet, WorkoutRecord } from './workoutTypes.ts'

/**
 * 운동 결과 화면(W15·W15-1)의 표시용 변환. 문구·카드 모델·입력 검증 메시지만 다루며 React·저장소에 의존하지 않는다.
 * 값은 모두 workoutResult(집계)·workoutProgress(검증)의 결과를 그대로 쓰고 새 규칙을 만들지 않는다.
 * 미완료 세트에는 실제 수행 값을 만들지 않고, 시간형 측정 값이 없으면 목표 시간으로 대체하지 않고 "측정 기록 없음"으로 표시한다.
 */

// ─── 문구 ──────────────────────────────────────────────────

/**
 * 세트 하나의 목표 문구. 방식의 구성값을 횟수 · 중량 · 시간 순서로 보인다(W14와 같은 순서).
 * 목표 중량이 없으면 중량 항목을 만들지 않는다(0kg으로 보이지 않는다).
 */
export function targetLabel(
  recordType: RecordType,
  target: NormalizedSet,
): string {
  const t = target as Partial<
    Record<'reps' | 'weightKg' | 'targetSeconds', number>
  >
  const parts = RECORD_COMPONENTS[recordType]
  const texts: string[] = []
  if (parts.reps) texts.push(`${t.reps ?? 0}회`)
  if (parts.weight && t.weightKg !== undefined) texts.push(`${t.weightKg}kg`)
  if (parts.time) texts.push(formatTargetSeconds(t.targetSeconds ?? 0))
  return texts.join(' · ')
}

/** 측정 시간 문구(분:초). 측정 기록이 없으면 0초가 아니라 "측정 기록 없음"이다. */
export function measuredLabel(measuredMs: number | null): string {
  return measuredMs === null
    ? UNMEASURED_LABEL
    : formatClock(Math.round(measuredMs / 1000))
}

/** 시간 구성값이 있는 결과의 합계 문구(W15). 측정한 세트가 없으면 "측정 기록 없음". */
export function timeLineOf(measuredMs: number | null): string {
  return measuredMs === null
    ? `측정 시간: ${UNMEASURED_LABEL}`
    : `측정 시간 합계 ${measuredLabel(measuredMs)}`
}

/**
 * 완료한 세트의 실제 값 문구. 구성값을 횟수 · 중량 · 시간 순서로 보인다. 시간형은 시간만이라 "0:40"처럼, 다른 값과 함께일 때는 "측정 0:40"으로 보인다.
 * 빠진 값(옛 기록)은 0으로 대신하지 않고 "횟수 없음"·"중량 미입력"·"측정 기록 없음"으로 알린다. 0kg은 입력한 값이라 "0kg"으로 보인다.
 */
export function actualLabel(
  recordType: RecordType,
  set: {
    actualReps: number | null
    actualWeightKg: number | null
    measuredMs: number | null
  },
): string {
  const parts = RECORD_COMPONENTS[recordType]
  const texts: string[] = []
  if (parts.reps)
    texts.push(set.actualReps === null ? '횟수 없음' : `${set.actualReps}회`)
  if (parts.weight)
    texts.push(
      set.actualWeightKg === null ? '중량 미입력' : `${set.actualWeightKg}kg`,
    )
  if (parts.time) {
    const alone = !parts.reps && !parts.weight
    texts.push(
      set.measuredMs === null
        ? UNMEASURED_LABEL
        : `${alone ? '' : '측정 '}${measuredLabel(set.measuredMs)}`,
    )
  }
  return texts.join(' · ')
}

/** 편집 입력용 시간 문구: 초 단위(소수는 밀리초 셋째 자리까지, 뒤의 0은 뺀다). */
export function secondsInputOf(measuredMs: number | null): string {
  if (measuredMs === null) return ''
  if (measuredMs % 1000 === 0) return String(measuredMs / 1000)
  return (measuredMs / 1000).toFixed(3).replace(/0+$/, '')
}

/** "2026년 11월 13일"(기기 로컬 날짜). */
export function formatResultDate(iso: string): string {
  const [y, m, d] = toLocalDate(new Date(iso)).split('-').map(Number)
  return `${y}년 ${m}월 ${d}일`
}

export type ResultStatusKey = 'full' | 'partial' | 'none'

/** 요약의 결과 상태 문구(별도 저장 필드가 아닌 파생 값). */
export function resultStatusOf(
  summary: Pick<ResultSummary, 'allCompleted' | 'partial' | 'noneCompleted'>,
): { key: ResultStatusKey; label: string } {
  if (summary.allCompleted) return { key: 'full', label: '전체 완료' }
  if (summary.partial) return { key: 'partial', label: '부분 완료' }
  return { key: 'none', label: '완료한 세트 없음' }
}

// ─── 카드 모델 ─────────────────────────────────────────────

export interface ResultCardSet {
  setNumber: number
  completed: boolean
  /** 세트 목표. 기록(읽기 전용)의 미완료 세트는 목표를 모르므로 null. */
  targetText: string | null
  /** 완료한 세트의 실제 값. 미완료 세트는 null(실제 값을 만들어 보이지 않는다). */
  actualText: string | null
  timeStatus: TimeStatus | null
  /** 초안이 W15 진입 때의 값과 다르다. */
  edited: boolean
  /** 완료했지만 신규 완료 정책상 빠진 값의 이름(옛 세션). 저장 전에 입력하거나 완료를 해제해야 한다. 없으면 빈 배열. */
  missing: readonly string[]
  /** 편집 입력의 초기값(완료한 횟수형·중량형 세트). */
  actualReps: number | null
  actualWeightKg: number | null
  /** 편집 입력의 초기값(측정 시간 ms). 미측정이면 null. */
  measuredMs: number | null
}

export interface ResultCardModel {
  /** 편집 위치용 운동 순서(0부터). */
  itemIndex: number
  exerciseId: string
  name: string
  recordType: RecordType
  plannedSetCount: number
  completedSetCount: number
  completedAll: boolean
  /** "목표 3세트 · 합계 28회" 같은 목표 한 줄. */
  targetSummary: string
  /** "실제 20회" 같은 실제 한 줄. 완료한 세트가 없으면 null. */
  actualSummary: string | null
  sets: readonly ResultCardSet[]
}

function sameSet(
  a: PerformedSet | undefined,
  b: PerformedSet | undefined,
): boolean {
  return (
    a?.completed === b?.completed &&
    a?.actualReps === b?.actualReps &&
    a?.actualWeightKg === b?.actualWeightKg &&
    a?.measuredMs === b?.measuredMs
  )
}

function targetSummaryOf(exercise: ResultExercise): string {
  const sets = `목표 ${exercise.plannedSetCount}세트`
  const { totalReps, maxWeightKg, totalSeconds } = exercise.target
  const parts = RECORD_COMPONENTS[exercise.recordType]
  const texts: string[] = []
  if (parts.reps && totalReps !== null) texts.push(`합계 ${totalReps}회`)
  if (parts.weight && maxWeightKg !== null) texts.push(`최대 ${maxWeightKg}kg`)
  if (parts.time && totalSeconds !== null)
    texts.push(`합계 ${formatTargetSeconds(totalSeconds)}`)
  return [sets, ...texts].join(' · ')
}

function actualSummaryOf(exercise: ResultExercise): string | null {
  if (exercise.completedSetCount === 0) return null
  const { totalReps, maxWeightKg, measuredMs } = exercise.actual
  const parts = RECORD_COMPONENTS[exercise.recordType]
  const texts: string[] = []
  if (parts.reps)
    texts.push(totalReps === null ? '횟수 없음' : `합계 ${totalReps}회`)
  if (parts.weight && maxWeightKg !== null) texts.push(`최대 ${maxWeightKg}kg`)
  if (parts.time)
    texts.push(
      exercise.actual.measuredSetCount === 0
        ? UNMEASURED_LABEL
        : `측정 합계 ${measuredLabel(measuredMs)}`,
    )
  return texts.join(' · ')
}

/** 집계 요약과 W15 진입 때의 수행 값(base)으로 운동별 카드 모델을 만든다. */
export function cardsFromSummary(
  summary: ResultSummary,
  base: readonly (readonly PerformedSet[])[] | null,
  current: readonly (readonly PerformedSet[])[] | null,
): ResultCardModel[] {
  return summary.exercises.map((exercise) => ({
    itemIndex: exercise.itemIndex,
    exerciseId: exercise.exerciseId,
    name: exercise.name,
    recordType: exercise.recordType,
    plannedSetCount: exercise.plannedSetCount,
    completedSetCount: exercise.completedSetCount,
    completedAll: exercise.completedAll,
    targetSummary: targetSummaryOf(exercise),
    actualSummary: actualSummaryOf(exercise),
    sets: exercise.sets.map((row, j) => ({
      setNumber: row.setNumber,
      completed: row.completed,
      targetText: targetLabel(exercise.recordType, row.target),
      actualText: row.completed ? actualLabel(exercise.recordType, row) : null,
      timeStatus: row.timeStatus,
      edited:
        base !== null &&
        current !== null &&
        !sameSet(
          base[exercise.itemIndex]?.[j],
          current[exercise.itemIndex]?.[j],
        ),
      missing:
        current === null
          ? []
          : missingFieldsOf(
              exercise.recordType,
              current[exercise.itemIndex]?.[j],
            ),
      actualReps: row.actualReps,
      actualWeightKg: row.actualWeightKg,
      measuredMs: row.measuredMs,
    })),
  }))
}

/** 저장된 완료 기록(읽기 전용 화면)의 카드 모델. 기록에는 완료한 세트만 있어 미완료 세트는 번호만 채운다. */
export function cardsFromRecord(record: WorkoutRecord): ResultCardModel[] {
  return record.exercises.map((exercise, itemIndex) => {
    const byNumber = new Map(
      exercise.completedSets.map((set) => [set.setNumber, set]),
    )
    const sets: ResultCardSet[] = Array.from(
      { length: exercise.plannedSetCount },
      (_, j): ResultCardSet => {
        const done = byNumber.get(j + 1)
        const row = {
          actualReps: done?.actualReps ?? null,
          actualWeightKg: done?.actualWeightKg ?? null,
          measuredMs: done?.measuredMs ?? null,
        }
        return {
          setNumber: j + 1,
          completed: done !== undefined,
          targetText: done
            ? targetLabel(exercise.recordType, done.target)
            : null,
          actualText: done ? actualLabel(exercise.recordType, row) : null,
          timeStatus: !RECORD_COMPONENTS[exercise.recordType].time
            ? null
            : !done
              ? 'incomplete'
              : done.measuredMs === null
                ? 'unmeasured'
                : 'measured',
          edited: false,
          missing: [],
          actualReps: row.actualReps,
          actualWeightKg: row.actualWeightKg,
          measuredMs: row.measuredMs,
        }
      },
    )
    const parts = RECORD_COMPONENTS[exercise.recordType]
    const reps = exercise.completedSets.reduce(
      (sum, set) => sum + (set.actualReps ?? 0),
      0,
    )
    const weights = exercise.completedSets.flatMap((set) =>
      set.actualWeightKg === undefined ? [] : [set.actualWeightKg],
    )
    const measured = exercise.completedSets.flatMap((set) =>
      set.measuredMs === null ? [] : [set.measuredMs],
    )
    const done = exercise.completedSets.length
    const texts: string[] = []
    if (parts.reps) texts.push(`합계 ${reps}회`)
    if (parts.weight && weights.length > 0)
      texts.push(`최대 ${Math.max(...weights)}kg`)
    if (parts.time)
      texts.push(
        measured.length === 0
          ? UNMEASURED_LABEL
          : `측정 합계 ${measuredLabel(measured.reduce((a, b) => a + b, 0))}`,
      )
    const summary = done === 0 ? null : texts.join(' · ')
    return {
      itemIndex,
      exerciseId: exercise.exerciseId,
      name: exercise.exerciseNameSnapshot,
      recordType: exercise.recordType,
      plannedSetCount: exercise.plannedSetCount,
      completedSetCount: done,
      completedAll: done === exercise.plannedSetCount,
      targetSummary: `목표 ${exercise.plannedSetCount}세트`,
      actualSummary: summary,
      sets,
    }
  })
}

// ─── 입력 검증 문구 ────────────────────────────────────────

export interface SetFieldErrors {
  reps?: string
  weightKg?: string
  measuredMs?: string
}

export type SetFieldsResult =
  | { ok: true; reps?: number; weightKg?: number; measuredMs?: number }
  | { ok: false; errors: SetFieldErrors }

const REPS_ERROR = {
  empty: '횟수를 입력해 주세요.',
  format: '횟수는 숫자(정수)로 입력해 주세요.',
  range: `횟수는 1~${MAX_REPS} 사이로 입력해 주세요.`,
} as const

const WEIGHT_ERROR = {
  empty: '중량을 입력해 주세요. 0kg도 입력할 수 있어요.',
  format: '중량은 숫자로 입력해 주세요.',
  range: `중량은 0~${MAX_WEIGHT_KG}kg 사이로 입력해 주세요.`,
  decimals: '중량은 소수점 한 자리까지 입력할 수 있어요.',
} as const

const MEASURED_ERROR = {
  empty: '측정 시간을 입력해 주세요. 예: 55 또는 1:05',
  format: '측정 시간은 초(예: 55, 55.5) 또는 분:초(예: 1:05)로 입력해 주세요.',
  range: '측정 시간은 0보다 크고 24시간 이하여야 해요. 예: 55 또는 1:05',
} as const

/**
 * 편집 입력(문자열)을 기존 검증(parseReps·parseWeightKg·parseDurationInput)으로 확인한다. 그 기록 방식의 구성값 입력만 확인하고
 * 결과에 담는다(방식에 없는 값은 보지도 담지도 않는다). 모든 구성값은 필수다(중량 0kg은 "0"을 직접 입력해야 한다).
 * 오류는 입력 항목별 메시지로 돌려주어 화면이 해당 입력에 연결한다.
 */
export function validateSetFields(
  recordType: RecordType,
  raw: { reps: string; weightKg: string; measuredMs?: string },
): SetFieldsResult {
  const parts = RECORD_COMPONENTS[recordType]
  const errors: SetFieldErrors = {}
  const result: { reps?: number; weightKg?: number; measuredMs?: number } = {}
  if (parts.reps) {
    const reps = parseReps(raw.reps)
    if (!reps.ok) errors.reps = REPS_ERROR[reps.reason]
    else result.reps = reps.value
  }
  if (parts.weight) {
    const weight = parseWeightKg(raw.weightKg)
    if (!weight.ok) errors.weightKg = WEIGHT_ERROR[weight.reason]
    else if (weight.value === undefined) errors.weightKg = WEIGHT_ERROR.empty
    else result.weightKg = weight.value
  }
  if (parts.time) {
    const measured = parseDurationInput(raw.measuredMs ?? '')
    if (!measured.ok) errors.measuredMs = MEASURED_ERROR[measured.reason]
    else result.measuredMs = measured.value
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, ...result }
}
