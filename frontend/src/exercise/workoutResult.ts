import type { NormalizedSet, RecordType } from './workoutDraftTypes.ts'
import {
  validateNewCompletedSet,
  type CompletedSetIssue,
} from './completedSetValidation.ts'
import { RECORD_COMPONENTS } from './recordMode.ts'
import {
  MAX_REPS,
  MAX_WEIGHT_KG,
  parseDurationInput,
  parseReps,
  parseWeightKg,
  type NumberInput,
} from './setInput.ts'
import { sameProgress } from './workoutProgress.ts'
import {
  buildWorkoutRecord,
  parseWorkoutRecord,
  validateProgressInput,
} from './workoutModel.ts'
import type {
  PerformedSet,
  SessionCursor,
  SessionProgressInput,
  SessionTimer,
  WorkoutListSnapshot,
  WorkoutRecord,
  WorkoutSession,
} from './workoutTypes.ts'

/**
 * 운동 결과(W15·W15-1)의 순수 로직: 집계·결과 편집·저장 전 검증. 화면·저장소·시계에 의존하지 않는다(시각은 인자로 받는다).
 *
 * - 기존 규칙을 재사용한다: 입력 한계(횟수 1~999, 중량 0~999kg·소수 첫째 자리)는 workoutProgress, 진행 값 검증·완료 기록 변환·기록 검증은 workoutModel.
 * - 모든 함수는 입력(세션·초안)을 바꾸지 않고 새 값을 돌려준다. 세션의 listSnapshot(목표)은 읽기만 한다.
 * - 새 저장 필드·모델을 만들지 않는다. 저장은 기존 saveProgress 입력(SessionProgressInput)과 complete로만 이루어진다(이 파일은 호출하지 않는다).
 * - 운동 카탈로그를 읽지 않는다. 운동 이름·유형·목표는 세션 시작 때 동결한 listSnapshot만 쓴다(슬러그 ID·숫자 ID 모두 불투명 문자열로 취급).
 */

// ─── 화면 유형 ──────────────────────────────────────────────

/**
 * W15: 시간을 구성값으로 갖는 운동(시간형·시간+횟수형·중량+시간형)이 하나 이상 포함된 세션(포함·혼합),
 * W15-1: 시간 구성값이 없는 세션(횟수형·중량+횟수형만).
 */
export type ResultScreenType = 'W15' | 'W15-1'

/** 세션 스냅샷의 운동 기록 방식(구성값)만으로 판별한다(실제 수행값·타이머 사용 여부와 무관). */
export function resultScreenType(
  snapshot: Pick<WorkoutListSnapshot, 'items'>,
): ResultScreenType {
  return snapshot.items.some((item) => RECORD_COMPONENTS[item.recordType].time)
    ? 'W15'
    : 'W15-1'
}

// ─── 집계 ──────────────────────────────────────────────────

/** 시간을 구성값으로 갖는 세트의 측정 상태. 시간 구성값이 없는 세트는 null. */
export type TimeStatus =
  /** 완료했고 측정 시간이 있다. */
  | 'measured'
  /** 완료했지만 측정 시간이 없다(타이머 미사용). 0초가 아니라 "측정 기록 없음"이다. */
  | 'unmeasured'
  /** 완료하지 않았다. */
  | 'incomplete'

/** 측정 시간이 없는 완료 세트의 표시 문구. 0초·목표 시간으로 대체해 보이지 않는다. */
export const UNMEASURED_LABEL = '측정 기록 없음'

/**
 * 결과 화면의 세트 한 줄. 미완료 세트도 포함한다(표시용). 실제 값은 완료한 세트에만 채우고,
 * 미완료 세트는 입력 중이던 값이 남아 있어도 실제 수행으로 보지 않아 null이다.
 */
export interface ResultSetRow {
  /** 목록에서의 세트 번호(1부터). 완료 기록의 setNumber와 같다. */
  setNumber: number
  target: NormalizedSet
  completed: boolean
  actualReps: number | null
  actualWeightKg: number | null
  /** 측정 시간(ms). 미측정·미완료·시간 구성값이 없으면 null. */
  measuredMs: number | null
  timeStatus: TimeStatus | null
}

export interface ResultExercise {
  /** 목록에서의 운동 순서(0부터). */
  itemIndex: number
  exerciseId: string
  name: string
  recordType: RecordType
  plannedSetCount: number
  completedSetCount: number
  incompleteSetCount: number
  /** 계획한 모든 세트를 완료했을 때만 true. 일부 세트만 완료하면 false다. */
  completedAll: boolean
  /** 목표(스냅샷). 세트별 목표는 sets[].target이고 여기는 운동 단위 합·최댓값이다. 해당 없는 항목은 null. */
  target: {
    /** 목표 횟수 합(횟수형·중량형) */
    totalReps: number | null
    /** 목표 중량의 최댓값(중량형, 목표 중량이 있는 세트가 있을 때) */
    maxWeightKg: number | null
    /** 목표 시간 합(초, 시간형) */
    totalSeconds: number | null
  }
  /** 실제 수행(완료한 세트만). 완료한 세트가 없거나 해당 없으면 null. */
  actual: {
    totalReps: number | null
    maxWeightKg: number | null
    /** 측정한 시간 합(ms, 시간형). 측정한 세트가 하나도 없으면 null(0이 아니다). */
    measuredMs: number | null
    measuredSetCount: number
    /** 완료했지만 측정 시간이 없는 시간형 세트 수 */
    unmeasuredSetCount: number
  }
  sets: readonly ResultSetRow[]
}

export interface ResultSummary {
  screenType: ResultScreenType
  exerciseCount: number
  plannedSetCount: number
  completedSetCount: number
  incompleteSetCount: number
  /** 계획한 모든 세트를 완료한 운동 수. */
  completedExerciseCount: number
  incompleteExerciseCount: number
  /** 완료한 세트가 하나 이상인 운동 수(완료 기록의 totals.exerciseCount와 같은 기준). */
  startedExerciseCount: number
  /** 세트 완료율 0~1. 계획 세트가 없으면 0. */
  ratio: number
  /** 0~100 정수(반올림). */
  percent: number
  allCompleted: boolean
  /** 완료 세트가 1개 이상이지만 전부는 아니다. */
  partial: boolean
  noneCompleted: boolean
  /** 측정한 시간의 합(ms). 측정한 세트가 하나도 없으면 null(0이 아니다). */
  measuredMs: number | null
  measuredSetCount: number
  unmeasuredSetCount: number
  exercises: readonly ResultExercise[]
}

type Performed = readonly (readonly PerformedSet[])[]

const nullable = <T>(value: T | undefined): T | null =>
  value === undefined ? null : value

const sumOrNull = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((sum, v) => sum + v, 0)

const maxOrNull = (values: readonly number[]): number | null =>
  values.length === 0 ? null : Math.max(...values)

/**
 * 세션 스냅샷과 수행 값으로 결과를 집계한다. 성능 요건이 없는 작은 데이터이므로 호출할 때마다 새로 계산한다.
 * 완료한 세트만 실제 수행으로 합산하고, 미완료 세트는 표시용 행으로만 남긴다.
 * 시간형 합계는 측정 시간이 있는 완료 세트만 더한다(없으면 0이 아니라 null).
 */
export function summarizeResult(
  snapshot: Pick<WorkoutListSnapshot, 'items'>,
  performed: Performed,
): ResultSummary {
  const exercises = snapshot.items.map((item, itemIndex): ResultExercise => {
    const rows = item.sets.map((target, j): ResultSetRow => {
      const done = performed[itemIndex]?.[j]
      const completed = done?.completed === true
      const parts = RECORD_COMPONENTS[item.recordType]
      const isTime = parts.time
      const measuredMs = completed && isTime ? nullable(done?.measuredMs) : null
      return {
        setNumber: j + 1,
        target,
        completed,
        actualReps: completed && parts.reps ? nullable(done?.actualReps) : null,
        actualWeightKg:
          completed && parts.weight ? nullable(done?.actualWeightKg) : null,
        measuredMs,
        timeStatus: !isTime
          ? null
          : !completed
            ? 'incomplete'
            : measuredMs === null
              ? 'unmeasured'
              : 'measured',
      }
    })
    const parts = RECORD_COMPONENTS[item.recordType]
    const completedRows = rows.filter((row) => row.completed)
    const targets = item.sets as readonly Partial<
      Record<'reps' | 'weightKg' | 'targetSeconds', number>
    >[]
    const measured = completedRows.flatMap((row) =>
      row.measuredMs === null ? [] : [row.measuredMs],
    )
    return {
      itemIndex,
      exerciseId: item.exerciseId,
      name: item.exerciseNameSnapshot,
      recordType: item.recordType,
      plannedSetCount: rows.length,
      completedSetCount: completedRows.length,
      incompleteSetCount: rows.length - completedRows.length,
      completedAll: rows.length > 0 && completedRows.length === rows.length,
      target: {
        totalReps: parts.reps
          ? sumOrNull(
              targets.flatMap((t) => (t.reps === undefined ? [] : [t.reps])),
            )
          : null,
        maxWeightKg: parts.weight
          ? maxOrNull(
              targets.flatMap((t) =>
                t.weightKg === undefined ? [] : [t.weightKg],
              ),
            )
          : null,
        totalSeconds: parts.time
          ? sumOrNull(
              targets.flatMap((t) =>
                t.targetSeconds === undefined ? [] : [t.targetSeconds],
              ),
            )
          : null,
      },
      actual: {
        totalReps: sumOrNull(
          completedRows.flatMap((row) =>
            row.actualReps === null ? [] : [row.actualReps],
          ),
        ),
        maxWeightKg: maxOrNull(
          completedRows.flatMap((row) =>
            row.actualWeightKg === null ? [] : [row.actualWeightKg],
          ),
        ),
        measuredMs: sumOrNull(measured),
        measuredSetCount: measured.length,
        unmeasuredSetCount: completedRows.filter(
          (row) => row.timeStatus === 'unmeasured',
        ).length,
      },
      sets: rows,
    }
  })

  const plannedSetCount = exercises.reduce(
    (sum, e) => sum + e.plannedSetCount,
    0,
  )
  const completedSetCount = exercises.reduce(
    (sum, e) => sum + e.completedSetCount,
    0,
  )
  const completedExerciseCount = exercises.filter((e) => e.completedAll).length
  const ratio = plannedSetCount === 0 ? 0 : completedSetCount / plannedSetCount
  const allCompleted =
    plannedSetCount > 0 && completedSetCount === plannedSetCount
  return {
    screenType: resultScreenType(snapshot),
    exerciseCount: exercises.length,
    plannedSetCount,
    completedSetCount,
    incompleteSetCount: plannedSetCount - completedSetCount,
    completedExerciseCount,
    incompleteExerciseCount: exercises.length - completedExerciseCount,
    startedExerciseCount: exercises.filter((e) => e.completedSetCount > 0)
      .length,
    ratio,
    percent: Math.round(ratio * 100),
    allCompleted,
    partial: completedSetCount > 0 && !allCompleted,
    noneCompleted: completedSetCount === 0,
    measuredMs: sumOrNull(
      exercises.flatMap((e) =>
        e.actual.measuredMs === null ? [] : [e.actual.measuredMs],
      ),
    ),
    measuredSetCount: exercises.reduce(
      (sum, e) => sum + e.actual.measuredSetCount,
      0,
    ),
    unmeasuredSetCount: exercises.reduce(
      (sum, e) => sum + e.actual.unmeasuredSetCount,
      0,
    ),
    exercises,
  }
}

// ─── 기록 상태 파생(W01 등에서 활용) ───────────────────────

/**
 * 파생 기록 상태. 별도 저장 필드가 아니다.
 * - in_progress: 세션 상태가 in_progress
 * - partial: 완료한 세트가 1개 이상이지만 전체를 완료하지 않았다
 * - full: 모든 계획 세트를 완료했다
 * - abandoned: 기록 없이 그만뒀다(interrupted·cancelled)
 */
export type ResultStatus = 'in_progress' | 'partial' | 'full' | 'abandoned'

/**
 * 세션으로 파생한 상태. completed 세션은 저장된 performed로 부분/전체를 가른다
 * (완료 기록은 완료 세트가 1개 이상일 때만 생기므로 completed인데 0개인 세션은 없다. 방어적으로 partial로 둔다).
 */
export function deriveSessionResultStatus(
  session: Pick<WorkoutSession, 'status' | 'performed'>,
): ResultStatus {
  if (session.status === 'in_progress') return 'in_progress'
  if (session.status === 'interrupted' || session.status === 'cancelled') {
    return 'abandoned'
  }
  const planned = session.performed.reduce((sum, sets) => sum + sets.length, 0)
  const done = session.performed.reduce(
    (sum, sets) => sum + sets.filter((set) => set.completed).length,
    0,
  )
  return planned > 0 && done === planned ? 'full' : 'partial'
}

/**
 * 저장된 완료 기록으로 파생한 상태(완료 기록은 항상 partial 또는 full). 완료 세트 수와 계획 세트 수만 비교하며
 * totals를 읽는다(parseWorkoutRecord가 totals와 세트의 일치를 이미 보장한다).
 */
export function deriveRecordResultStatus(
  record: Pick<WorkoutRecord, 'totals'>,
): Extract<ResultStatus, 'partial' | 'full'> {
  const { completedSetCount, plannedSetCount } = record.totals
  return plannedSetCount > 0 && completedSetCount === plannedSetCount
    ? 'full'
    : 'partial'
}

// ─── 결과 편집 ─────────────────────────────────────────────

/**
 * 편집 초안. base는 W15에 들어올 때의 저장된 수행 값(원본 사본), performed는 편집 중인 값이다.
 * 둘 다 세션 객체와 별개의 깊은 사본이라 세션 원본을 바꾸지 않는다. 편집은 저장 전까지 이 초안에만 적용된다.
 */
export interface ResultDraft {
  readonly base: Performed
  readonly performed: Performed
}

const copyPerformed = (performed: Performed): PerformedSet[][] =>
  performed.map((sets) => sets.map((set) => ({ ...set })))

const idleProgress = (performed: Performed) => ({
  cursor: { itemIndex: 0, setIndex: 0 },
  performed,
  timer: { accumulatedMs: 0, runningSince: null } satisfies SessionTimer,
})

/** 두 수행 값이 같은지(값이 없는 필드와 undefined는 같다). */
function samePerformed(a: Performed, b: Performed): boolean {
  return sameProgress(idleProgress(a), idleProgress(b))
}

export type CreateDraftResult =
  | { ok: true; draft: ResultDraft }
  | { ok: false; reason: 'sessionEnded' | 'invalidSession' }

/** 저장된 세션으로 편집 초안을 만든다. 진행 중이 아니면 거부한다(완료·중단된 세션의 결과는 고칠 수 없다). */
export function createResultDraft(
  session: Pick<
    WorkoutSession,
    'status' | 'listSnapshot' | 'performed' | 'cursor' | 'timer' | 'revision'
  >,
): CreateDraftResult {
  if (session.status !== 'in_progress') {
    return { ok: false, reason: 'sessionEnded' }
  }
  const baseline: SessionProgressInput = {
    expectedRevision: session.revision,
    cursor: session.cursor,
    performed: session.performed,
    timer: session.timer,
  }
  if (!validateProgressInput(baseline, session.listSnapshot)) {
    return { ok: false, reason: 'invalidSession' }
  }
  return {
    ok: true,
    draft: {
      base: copyPerformed(session.performed),
      performed: copyPerformed(session.performed),
    },
  }
}

/** 편집 취소: 원래 상태(base)로 되돌린 새 초안. 세션 원본은 처음부터 건드리지 않았다. */
export function cancelResultEdits(draft: ResultDraft): ResultDraft {
  return {
    base: copyPerformed(draft.base),
    performed: copyPerformed(draft.base),
  }
}

/** 편집한 값이 원본과 다른지. */
export function hasResultChanges(draft: ResultDraft): boolean {
  return !samePerformed(draft.base, draft.performed)
}

/** W15에서 허용하지 않는 조작. 화면이 실수로 시도해도 거부 사유를 받도록 종류를 명시한다. */
export type ForbiddenResultEditKind =
  | 'complete'
  | 'target'
  | 'setCount'
  | 'reorder'
  | 'addExercise'
  | 'removeExercise'

export type ResultEdit =
  /** 완료한 세트의 실제 횟수(1~999 정수). 횟수가 구성값인 방식만. 빈 값은 거부. */
  | { kind: 'reps'; position: SessionCursor; value: NumberInput }
  /** 완료한 세트의 실제 중량(0~999kg, 소수 첫째 자리). 중량이 구성값인 방식만. 빈 값은 거부(0kg은 직접 입력). */
  | { kind: 'weightKg'; position: SessionCursor; value: NumberInput }
  /** 완료한 세트의 실제 측정 시간. 시간이 구성값인 방식만. 초 단위 숫자 또는 분:초(parseDurationInput), 1ms~24시간. */
  | { kind: 'measuredMs'; position: SessionCursor; value: NumberInput }
  /**
   * 한 세트의 실제 값을 한 번에 고친다(여러 구성값을 함께 고치는 화면 입력용). 주어진 값은 모두 확인하고 하나라도 틀리면 아무것도 바꾸지 않는다.
   * 결과 세트는 신규 완료 검증(A안)을 통과해야 한다. 주지 않은 값은 현재 값을 유지한다.
   */
  | {
      kind: 'values'
      position: SessionCursor
      reps?: NumberInput
      weightKg?: NumberInput
      measuredMs?: NumberInput
    }
  /** 완료한 세트를 미완료로 바꾼다(실제 값도 지운다). */
  | { kind: 'uncomplete'; position: SessionCursor }
  | { kind: ForbiddenResultEditKind; position?: SessionCursor; value?: unknown }

export type ResultEditFailure =
  | { ok: false; reason: 'invalidPosition' }
  /** 미완료 세트는 W15에서 값을 고치거나 완료할 수 없다. */
  | { ok: false; reason: 'setNotCompleted' }
  /** 그 기록 방식에 없는 값(시간형의 횟수·중량, 횟수형의 중량). */
  | { ok: false; reason: 'notApplicable' }
  | { ok: false; reason: 'invalidReps'; detail: 'empty' | 'format' | 'range' }
  | {
      ok: false
      reason: 'invalidWeight'
      detail: 'empty' | 'format' | 'range' | 'decimals'
    }
  | {
      ok: false
      reason: 'invalidMeasured'
      detail: 'empty' | 'format' | 'range'
    }
  /** 고친 결과 세트가 신규 완료 검증(A안)을 통과하지 못한다(구성값 누락 등). */
  | { ok: false; reason: 'invalidSet'; issues: readonly CompletedSetIssue[] }
  | { ok: false; reason: 'cannotComplete' }
  | { ok: false; reason: 'targetNotEditable' }
  | { ok: false; reason: 'structureNotEditable' }
  | { ok: false; reason: 'unsupportedEdit' }

export type ResultEditResult =
  { ok: true; draft: ResultDraft } | ResultEditFailure

const FORBIDDEN_REASON: Record<
  ForbiddenResultEditKind,
  Extract<
    ResultEditFailure['reason'],
    'cannotComplete' | 'targetNotEditable' | 'structureNotEditable'
  >
> = {
  complete: 'cannotComplete',
  target: 'targetNotEditable',
  setCount: 'targetNotEditable',
  reorder: 'structureNotEditable',
  addExercise: 'structureNotEditable',
  removeExercise: 'structureNotEditable',
}

/**
 * 편집 하나를 적용한 새 초안을 돌려준다(초안·세션은 바뀌지 않는다). 실패하면 초안을 바꾸지 않고 사유를 돌려준다.
 * 허용: 완료한 세트의 실제 횟수·중량·측정 시간 수정(그 기록 방식의 구성값만), 완료 해제.
 * 거부: 미완료 세트 완료, 방식에 없는 값, 목표·세트 수·순서·운동 추가/삭제.
 * 값 검증은 입력 한계(setInput)와 신규 완료 검증(validateNewCompletedSet, values 편집)을 그대로 쓴다.
 */
export function applyResultEdit(
  snapshot: Pick<WorkoutListSnapshot, 'items'>,
  draft: ResultDraft,
  edit: ResultEdit,
): ResultEditResult {
  const forbidden = FORBIDDEN_REASON[edit.kind as ForbiddenResultEditKind]
  if (forbidden !== undefined) return { ok: false, reason: forbidden }
  if (
    edit.kind !== 'reps' &&
    edit.kind !== 'weightKg' &&
    edit.kind !== 'measuredMs' &&
    edit.kind !== 'values' &&
    edit.kind !== 'uncomplete'
  ) {
    return { ok: false, reason: 'unsupportedEdit' }
  }

  const { itemIndex, setIndex } = edit.position
  const item = snapshot.items[itemIndex]
  const current = draft.performed[itemIndex]?.[setIndex]
  if (!item || !current) return { ok: false, reason: 'invalidPosition' }
  if (!current.completed) return { ok: false, reason: 'setNotCompleted' }

  let next: PerformedSet
  if (edit.kind === 'uncomplete') {
    next = { completed: false }
  } else {
    const parts = RECORD_COMPONENTS[item.recordType]
    const fields: {
      reps?: NumberInput
      weightKg?: NumberInput
      measuredMs?: NumberInput
    } =
      edit.kind === 'values'
        ? {
            ...('reps' in edit ? { reps: edit.reps } : {}),
            ...('weightKg' in edit ? { weightKg: edit.weightKg } : {}),
            ...('measuredMs' in edit ? { measuredMs: edit.measuredMs } : {}),
          }
        : { [edit.kind]: edit.value }
    next = { ...current }
    if ('reps' in fields) {
      if (!parts.reps) return { ok: false, reason: 'notApplicable' }
      const parsed = parseReps(fields.reps)
      if (!parsed.ok) {
        return { ok: false, reason: 'invalidReps', detail: parsed.reason }
      }
      next.actualReps = parsed.value
    }
    if ('weightKg' in fields) {
      if (!parts.weight) return { ok: false, reason: 'notApplicable' }
      const parsed = parseWeightKg(fields.weightKg)
      if (!parsed.ok) {
        return { ok: false, reason: 'invalidWeight', detail: parsed.reason }
      }
      // 신규 값은 비울 수 없다(중량 미입력으로 저장하지 않는다). 0kg은 직접 입력해야 한다.
      if (parsed.value === undefined) {
        return { ok: false, reason: 'invalidWeight', detail: 'empty' }
      }
      next.actualWeightKg = parsed.value
    }
    if ('measuredMs' in fields) {
      if (!parts.time) return { ok: false, reason: 'notApplicable' }
      const parsed = parseDurationInput(fields.measuredMs)
      if (!parsed.ok) {
        return { ok: false, reason: 'invalidMeasured', detail: parsed.reason }
      }
      next.measuredMs = parsed.value
    }
    if (edit.kind === 'values') {
      const check = validateNewCompletedSet(item.recordType, next)
      if (!check.ok)
        return { ok: false, reason: 'invalidSet', issues: check.issues }
    }
  }

  const performed = copyPerformed(draft.performed)
  performed[itemIndex][setIndex] = next
  return { ok: true, draft: { base: draft.base, performed } }
}

// ─── 저장 전 검증 ──────────────────────────────────────────

export type SaveIssueReason =
  /** 진행 중인 세션이 아니다(이미 완료·중단됨). */
  | 'sessionEnded'
  /** 저장된 세션 값이 모델 규칙에 맞지 않는다(손상). */
  | 'invalidSession'
  /** 초안이 이 세션의 현재 값에서 만든 것이 아니다(다른 곳에서 세션이 바뀜). */
  | 'staleDraft'
  /** 완료한 세트가 하나도 없어 저장할 수 없다. */
  | 'noCompletedSets'
  /** 편집 초안의 모양이 세션과 다르다(운동·세트 수). */
  | 'invalidPerformed'
  /** 완료한 세트의 값이 신규 완료 검증(A안: 구성값 모두 있고 입력 한계 안)을 통과하지 못했다. */
  | 'invalidValue'
  /** 허용되지 않은 변경(미완료 세트 변경, 방식에 없는 값 추가 등). */
  | 'forbiddenChange'
  /** validateProgressInput을 통과하지 못했다(cursor·performed·timer 정합성). */
  | 'invalidProgress'
  /** 저장될 완료 기록이 기존 기록 모델(parseWorkoutRecord)과 맞지 않는다. */
  | 'recordIncompatible'
  /** 화면에 보이는 결과와 저장될 기록의 값이 다르다. */
  | 'displayMismatch'

export interface SaveIssue {
  reason: SaveIssueReason
  itemIndex?: number
  setIndex?: number
  message: string
}

export type ResultSaveCheck =
  | {
      ok: true
      /** 기존 saveProgress에 그대로 넘길 수 있는 입력. 이 함수는 저장하지 않는다. */
      input: SessionProgressInput
      /** 화면에 보이는 결과(저장될 값과 일치함을 검증했다). */
      summary: ResultSummary
      /** 편집으로 값이 바뀌었는지. false이면 saveProgress를 생략하고 complete만 해도 된다. */
      changed: boolean
    }
  | { ok: false; issues: readonly SaveIssue[] }

/**
 * 신규 완료 검증의 문제를 W15 안내 문구로 바꾼다(저장 전 검증·편집 입력 안내용). 같은 문구는 한 번만 담는다.
 */
export function describeResultSetIssues(
  issues: readonly CompletedSetIssue[],
): string {
  const lines: string[] = []
  const add = (text: string) => {
    if (!lines.includes(text)) lines.push(text)
  }
  for (const issue of issues) {
    if (issue.field === 'measuredMs') {
      add(
        issue.reason === 'missing'
          ? '측정 시간을 입력해 주세요.'
          : issue.reason === 'zero'
            ? '측정 시간은 0보다 커야 해요.'
            : '측정 시간은 1밀리초 이상 24시간 이하여야 해요.',
      )
    } else if (issue.field === 'actualWeightKg') {
      add(
        issue.reason === 'missing'
          ? '실제 중량을 입력해 주세요. 0kg도 입력할 수 있어요.'
          : `실제 중량은 0~${MAX_WEIGHT_KG}kg, 소수점 첫째 자리까지예요.`,
      )
    } else if (issue.field === 'actualReps') {
      add(
        issue.reason === 'missing'
          ? '실제 횟수를 입력해 주세요.'
          : `실제 횟수는 1~${MAX_REPS}회 정수여야 해요.`,
      )
    } else {
      add('이 기록 방식에 없는 값이 있어요.')
    }
  }
  return lines.join(' ')
}

/** 신규 완료 검증이 요구하는 값의 사용자용 이름. */
const FIELD_LABEL: Record<string, string> = {
  actualReps: '실제 횟수',
  actualWeightKg: '실제 중량',
  measuredMs: '측정 시간',
}

/**
 * 완료한 세트에서 신규 완료 정책(A안)을 채우지 못한 값의 이름(실제 횟수·실제 중량·측정 시간). 문제가 없거나 미완료 세트면 빈 배열이다.
 * 옛 세션의 값 빠진 완료 세트를 W15가 미리 알리는 데 쓴다(검증 규칙은 validateNewCompletedSet 그대로, 읽기·저장 동작은 바뀌지 않는다).
 */
export function missingFieldsOf(
  recordType: RecordType,
  set: PerformedSet | undefined,
): string[] {
  if (!set || !set.completed) return []
  const check = validateNewCompletedSet(recordType, set)
  if (check.ok) return []
  const labels: string[] = []
  for (const issue of check.issues) {
    const label = FIELD_LABEL[issue.field]
    if (label !== undefined && !labels.includes(label)) labels.push(label)
  }
  return labels
}

export interface IncompleteSetInfo {
  itemIndex: number
  setIndex: number
  name: string
  setNumber: number
  fields: string[]
}

/** 저장 전에 값을 채우거나 완료를 해제해야 하는 세트 목록(운동 순서·세트 순서). */
export function listIncompleteRecordedSets(
  snapshot: Pick<WorkoutListSnapshot, 'items'>,
  performed: Performed,
): IncompleteSetInfo[] {
  return snapshot.items.flatMap((item, itemIndex) =>
    item.sets.flatMap((_, setIndex) => {
      const fields = missingFieldsOf(
        item.recordType,
        performed[itemIndex]?.[setIndex],
      )
      return fields.length === 0
        ? []
        : [
            {
              itemIndex,
              setIndex,
              name: item.exerciseNameSnapshot,
              setNumber: setIndex + 1,
              fields,
            },
          ]
    }),
  )
}

/**
 * 편집 전 세트(before)와 후(after)의 차이가 W15에서 허용되는 변경인지. 허용하는 변경은 다음뿐이다.
 * - 완료한 세트가 미완료로 바뀌고 다른 값이 남지 않음({ completed: false })
 * - 완료한 세트에서 그 기록 방식의 구성값(actualReps·actualWeightKg·measuredMs)이 바뀜
 * 그 밖(미완료 세트 변경, 미완료→완료, 방식에 없는 값 추가·변경)은 허용하지 않는다.
 */
function forbiddenChange(
  before: PerformedSet,
  after: PerformedSet,
  recordType: RecordType,
): string | null {
  if (samePerformed([[before]], [[after]])) return null
  if (!before.completed)
    return '완료하지 않은 세트는 결과 화면에서 바꿀 수 없어요.'
  if (!after.completed) {
    return Object.keys(after).length === 1
      ? null
      : '완료를 해제한 세트에 실제 값이 남아 있어요.'
  }
  const parts = RECORD_COMPONENTS[recordType]
  if (!parts.time && before.measuredMs !== after.measuredMs) {
    return '이 기록 방식에는 측정 시간을 넣을 수 없어요.'
  }
  if (!parts.reps && before.actualReps !== after.actualReps) {
    return '이 기록 방식에는 횟수를 넣을 수 없어요.'
  }
  if (!parts.weight && before.actualWeightKg !== after.actualWeightKg) {
    return '이 기록 방식에는 중량을 넣을 수 없어요.'
  }
  return null
}

/**
 * 편집한 결과를 최종 저장 전에 검증하고 saveProgress 입력으로 변환한다. 저장·complete는 호출하지 않는다.
 *
 * 확인 항목: ① 진행 중인 세션 ② 완료 세트 1개 이상 ③ 편집한 값의 입력 한계 ④ 운동·세트 위치(모양) ⑤ cursor·performed·timer 정합성
 * (validateProgressInput) ⑥ 허용되지 않은 변경·필드 추가 없음 ⑦ 수정하지 않은 값 보존(cursor·timer는 세션 값 그대로, 손대지 않은 세트는 동일)
 * ⑧ 저장될 완료 기록이 기존 기록 모델(buildWorkoutRecord·parseWorkoutRecord)과 호환 ⑨ 화면에 보이는 요약과 저장될 기록의 일치.
 * 검사에 실패하면 모든 사유를 모아 돌려준다.
 *
 * now는 미리보기 기록(저장하지 않음)을 만드는 데만 쓴다.
 */
export function prepareResultSave(
  session: WorkoutSession,
  draft: ResultDraft,
  now: Date,
): ResultSaveCheck {
  if (session.status !== 'in_progress') {
    return {
      ok: false,
      issues: [
        {
          reason: 'sessionEnded',
          message: '이미 끝난 운동은 저장할 수 없어요.',
        },
      ],
    }
  }
  const { items } = session.listSnapshot
  const baseline: SessionProgressInput = {
    expectedRevision: session.revision,
    cursor: session.cursor,
    performed: session.performed,
    timer: session.timer,
  }
  if (!validateProgressInput(baseline, session.listSnapshot)) {
    return {
      ok: false,
      issues: [
        {
          reason: 'invalidSession',
          message: '저장된 운동 기록 값이 올바르지 않아요.',
        },
      ],
    }
  }
  if (!samePerformed(session.performed, draft.base)) {
    return {
      ok: false,
      issues: [
        {
          reason: 'staleDraft',
          message:
            '운동 기록이 다른 곳에서 바뀌었어요. 결과를 다시 불러와 주세요.',
        },
      ],
    }
  }
  const shapeOk =
    draft.performed.length === items.length &&
    items.every((item, i) => draft.performed[i]?.length === item.sets.length)
  if (!shapeOk) {
    return {
      ok: false,
      issues: [
        {
          reason: 'invalidPerformed',
          message: '운동·세트 구성이 원래 운동과 달라요.',
        },
      ],
    }
  }

  const issues: SaveIssue[] = []
  items.forEach((item, itemIndex) => {
    item.sets.forEach((_, setIndex) => {
      const before = draft.base[itemIndex][setIndex]
      const after = draft.performed[itemIndex][setIndex]
      if (!samePerformed([[before]], [[after]])) {
        const blocked = forbiddenChange(before, after, item.recordType)
        if (blocked !== null) {
          issues.push({
            reason: 'forbiddenChange',
            itemIndex,
            setIndex,
            message: blocked,
          })
          return
        }
      }
      // 신규 완료 기록(A안): 저장할 모든 완료 세트는 그 방식의 구성값이 모두 유효해야 한다. 이 검증은 최종 저장 경로에만 있고,
      // 저장된 기록·세션을 읽는 경로(parse*)에는 없다. 옛 세션의 값 없는 완료 세트는 여기서 막혀, 값을 입력하거나 완료를 해제해야 저장된다.
      if (after.completed) {
        const check = validateNewCompletedSet(item.recordType, after)
        if (!check.ok) {
          issues.push({
            reason: 'invalidValue',
            itemIndex,
            setIndex,
            message: `${item.exerciseNameSnapshot} ${setIndex + 1}세트: ${describeResultSetIssues(check.issues)}`,
          })
        }
      }
    })
  })

  // cursor·timer는 편집 대상이 아니므로 세션 값을 그대로 둔다(수정하지 않은 값 보존).
  const input: SessionProgressInput = {
    expectedRevision: session.revision,
    cursor: { ...session.cursor },
    performed: copyPerformed(draft.performed),
    timer: { ...session.timer },
  }
  const summary = summarizeResult(session.listSnapshot, input.performed)
  if (summary.noneCompleted) {
    issues.push({
      reason: 'noCompletedSets',
      message: '완료한 세트가 없어 운동 기록을 저장할 수 없어요.',
    })
  }
  if (issues.length > 0) return { ok: false, issues }

  if (!validateProgressInput(input, session.listSnapshot)) {
    return {
      ok: false,
      issues: [
        {
          reason: 'invalidProgress',
          message: '운동 진행 값(위치·수행 값·타이머)이 서로 맞지 않아요.',
        },
      ],
    }
  }

  const record = buildWorkoutRecord({
    id: 'preview',
    session: {
      ...session,
      cursor: input.cursor,
      performed: input.performed,
      timer: input.timer,
    },
    now,
  })
  if (record === null || parseWorkoutRecord(record) === null) {
    return {
      ok: false,
      issues: [
        {
          reason: 'recordIncompatible',
          message: '저장할 결과가 운동 기록 형식과 맞지 않아요.',
        },
      ],
    }
  }
  const mismatch = findRecordMismatch(record, summary)
  if (mismatch !== null) {
    return {
      ok: false,
      issues: [{ reason: 'displayMismatch', message: mismatch }],
    }
  }
  return { ok: true, input, summary, changed: hasResultChanges(draft) }
}

/** 저장될 완료 기록이 화면에 보이는 요약과 같은지. 다르면 사유를, 같으면 null을 돌려준다. */
export function findRecordMismatch(
  record: WorkoutRecord,
  summary: ResultSummary,
): string | null {
  const text = '화면에 보이는 결과와 저장될 값이 달라요.'
  const { totals } = record
  if (
    totals.completedSetCount !== summary.completedSetCount ||
    totals.plannedSetCount !== summary.plannedSetCount ||
    totals.exerciseCount !== summary.startedExerciseCount ||
    totals.measuredMs !== summary.measuredMs ||
    record.exercises.length !== summary.exercises.length
  ) {
    return text
  }
  for (const [i, exercise] of summary.exercises.entries()) {
    const saved = record.exercises[i]
    const rows = exercise.sets.filter((row) => row.completed)
    if (
      saved.exerciseId !== exercise.exerciseId ||
      saved.exerciseNameSnapshot !== exercise.name ||
      saved.recordType !== exercise.recordType ||
      saved.plannedSetCount !== exercise.plannedSetCount ||
      saved.completedSets.length !== rows.length
    ) {
      return text
    }
    for (const [k, row] of rows.entries()) {
      const set = saved.completedSets[k]
      if (
        set.setNumber !== row.setNumber ||
        nullable(set.actualReps) !== row.actualReps ||
        nullable(set.actualWeightKg) !== row.actualWeightKg ||
        set.measuredMs !== row.measuredMs
      ) {
        return text
      }
    }
  }
  return null
}
