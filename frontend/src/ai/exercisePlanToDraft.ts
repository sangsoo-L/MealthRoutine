import type { Exercise } from '../exercise/exerciseTypes.ts'
import {
  buildAllowedRecordTypes,
  newItemId,
  normalizeDraft,
  validateDraft,
  type AllowedRecordTypes,
} from '../exercise/workoutDraftModel.ts'
import type {
  DraftDay,
  DraftIssue,
  DraftItem,
  DraftSet,
  WorkoutDraft,
} from '../exercise/workoutDraftTypes.ts'
import type { LevelEvidence } from './exercisePlanEvidence.ts'
import { buildLocalPlan, type PlanResult } from './exercisePlanSelect.ts'

/**
 * I02-1 로컬 예시 추천 결과(PlanResult) → 기존 WorkoutDraft 변환(순수 함수). 저장하지 않는다.
 * 변환된 초안은 W02 편집과 W11 검토·저장(saveWorkoutList·saveWorkoutPlan)의 기존 절차를 그대로 거친다. 이 파일은 별도 저장 경로를 만들지 않는다.
 *
 * 결과는 호출자가 바꿀 수 있는 일반 객체라 status만 믿지 않는다. 다음을 모두 확인한 뒤에만 초안을 만든다.
 * 1) 등록 가능한 상태(status ok·항목 1개 이상)  2) 항목별 무결성(카탈로그 id·중복·기록 방식·세트 수·횟수/시간 정수)
 * 3) 같은 조건·rotation으로 추천을 다시 계산한 결과와의 일치(근거 없는 운동·값이 섞이지 않았음)  4) 만들어진 초안의 기존 validateDraft·normalizeDraft 통과.
 * 하나라도 어긋나면 일부만 변환하지 않고 초안을 만들지 않는다.
 *
 * 초안에는 기존 계약의 필드(운동 id·이름·기록 방식·세트의 reps 또는 targetSeconds)만 담는다. 목표 중량은 만들지 않는다(중량형도 비워 둔다).
 * 휴식 시간·예상 시간·근거는 WorkoutDraft가 담지 못하므로 담지 않는다(W02·W11에는 세트·횟수·시간만 보인다).
 */

export interface PlanToDraftParams {
  /** 초안이 속하는 날. W02·W11의 오늘/내일 구분과 같다. */
  day: DraftDay
  /** 추천에 쓴 카탈로그(허용 기록 방식·운동 id 확인과 재계산에 쓴다). */
  exercises: readonly Exercise[]
  /** 추천에 쓴 운동량 근거(재계산에 쓴다). */
  evidence: LevelEvidence
  /** 초안 updatedAt(ISO 8601). 시계는 인자로 받아 이 함수를 시계에 의존하지 않게 한다. */
  now: () => string
  /** 화면용 항목 id 만들기(기본: 기존 W02와 같은 newItemId). */
  itemIdFactory?: () => string
}

export type PlanDraftFailureCode =
  /** 등록할 수 있는 추천이 아니다(status가 ok가 아니거나 운동이 없다). */
  | 'notRegistrable'
  | 'invalidDay'
  | 'exerciseDuplicate'
  | 'exerciseUnknown'
  | 'recordTypeMismatch'
  | 'valueInvalid'
  /** 같은 조건으로 다시 계산한 추천과 다르다(결과가 바뀌었거나 근거 없는 값이 섞였다). */
  | 'planMismatch'
  | 'draftInvalid'

export interface PlanDraftFailure {
  code: PlanDraftFailureCode
  exerciseId?: string
  issues?: readonly DraftIssue[]
}

export type PlanDraftResult =
  | {
      ok: true
      draft: WorkoutDraft
      knownExerciseIds: ReadonlySet<string>
      allowedRecordTypes: AllowedRecordTypes
    }
  | { ok: false; failure: PlanDraftFailure }

const fail = (failure: PlanDraftFailure): PlanDraftResult => ({
  ok: false,
  failure,
})

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

/** 초안의 저장 기록 방식(표시용 weight는 중량+횟수형 weight 그대로). */
function toDraftItem(
  item: PlanResult['items'][number],
  idFactory: () => string,
): DraftItem {
  const sets = Array.from({ length: item.sets }, (): DraftSet => {
    // 기록 방식에 맞는 목표값 하나만 옮긴다(목표 중량·휴식은 만들지 않는다).
    return item.recordType === 'time'
      ? { targetSeconds: item.seconds as number }
      : { reps: item.reps as number }
  })
  return {
    itemId: idFactory(),
    exerciseId: item.exerciseId,
    name: item.name,
    recordType: item.recordType,
    sets,
  }
}

const sameItem = (
  a: PlanResult['items'][number],
  b: PlanResult['items'][number],
): boolean =>
  a.exerciseId === b.exerciseId &&
  a.recordType === b.recordType &&
  a.sets === b.sets &&
  a.reps === b.reps &&
  a.seconds === b.seconds

export function planToWorkoutDraft(
  plan: PlanResult,
  params: PlanToDraftParams,
): PlanDraftResult {
  if (params.day !== 'today' && params.day !== 'tomorrow') {
    return fail({ code: 'invalidDay' })
  }
  // 1) 등록 가능한 상태
  if (
    !plan ||
    plan.status !== 'ok' ||
    !Array.isArray(plan.items) ||
    plan.items.length === 0
  ) {
    return fail({ code: 'notRegistrable' })
  }

  // 2) 항목별 무결성
  const byId = new Map(params.exercises.map((e) => [e.id, e]))
  const allowedRecordTypes = buildAllowedRecordTypes(params.exercises)
  const seen = new Set<string>()
  for (const item of plan.items) {
    const id = item.exerciseId
    if (typeof id !== 'string' || id.trim() === '' || id !== id.trim()) {
      return fail({ code: 'exerciseUnknown', exerciseId: id })
    }
    if (seen.has(id)) return fail({ code: 'exerciseDuplicate', exerciseId: id })
    seen.add(id)
    if (!byId.has(id)) return fail({ code: 'exerciseUnknown', exerciseId: id })
    if (!allowedRecordTypes.get(id)?.includes(item.recordType)) {
      return fail({ code: 'recordTypeMismatch', exerciseId: id })
    }
    const value = item.recordType === 'time' ? item.seconds : item.reps
    if (!isCount(item.sets) || !isCount(value)) {
      return fail({ code: 'valueInvalid', exerciseId: id })
    }
  }

  // 3) 같은 조건·rotation으로 다시 계산한 추천과 항목이 완전히 같아야 한다.
  const recomputed = buildLocalPlan({
    conditions: plan.conditions,
    rotation: plan.rotation,
    exercises: params.exercises,
    evidence: params.evidence,
  })
  if (
    recomputed.status !== 'ok' ||
    recomputed.items.length !== plan.items.length ||
    !recomputed.items.every((item, i) => sameItem(item, plan.items[i]))
  ) {
    return fail({ code: 'planMismatch' })
  }

  // 4) 초안 만들기 + 기존 검증·정규화
  const idFactory = params.itemIdFactory ?? newItemId
  const draft: WorkoutDraft = {
    v: 1,
    day: params.day,
    items: plan.items.map((item) => toDraftItem(item, idFactory)),
    updatedAt: params.now(),
  }
  const knownExerciseIds = new Set(params.exercises.map((e) => e.id))
  const checked = validateDraft(draft, knownExerciseIds, allowedRecordTypes)
  if (!checked.ok) {
    return fail({ code: 'draftInvalid', issues: checked.issues })
  }
  if (!normalizeDraft(draft, knownExerciseIds, allowedRecordTypes)) {
    return fail({ code: 'draftInvalid', issues: [] })
  }
  return { ok: true, draft, knownExerciseIds, allowedRecordTypes }
}

const FAILURE_MESSAGE: Record<PlanDraftFailureCode, string> = {
  notRegistrable: '등록할 수 있는 추천이 아니에요. 다시 추천받아 주세요.',
  invalidDay: '등록할 날짜를 확인할 수 없어요. 다시 시도해 주세요.',
  exerciseDuplicate: '같은 운동이 겹쳐 있어 목록으로 만들 수 없어요.',
  exerciseUnknown: '운동 정보를 찾을 수 없어 목록으로 만들 수 없어요.',
  recordTypeMismatch:
    '운동 방식이 맞지 않아 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  valueInvalid:
    '세트·횟수·시간 값이 올바르지 않아 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  planMismatch: '추천 결과가 바뀐 것 같아요. 다시 추천받아 주세요.',
  draftInvalid:
    '운동 목록 형식이 올바르지 않아 만들 수 없어요. 다시 추천받아 주세요.',
}

export function describePlanDraftFailure(code: PlanDraftFailureCode): string {
  return FAILURE_MESSAGE[code]
}
