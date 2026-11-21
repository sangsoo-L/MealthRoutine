import {
  buildAllowedRecordTypes,
  newItemId,
  normalizeDraft,
  validateDraft,
  type AllowedRecordTypes,
} from '../workoutDraftModel.ts'
import type {
  DraftIssue,
  DraftItem,
  DraftSet,
  WorkoutDraft,
} from '../workoutDraftTypes.ts'
import { BeginnerPlanAccessError, assertBeginnerPlanAccess } from './access.ts'
import { buildBeginnerPlan, type PlanSource } from './engine.ts'
import {
  classifyExercise,
  estimateItemSeconds,
  estimateTotalSeconds,
  maxAutoExercises,
  validatePlanInput,
  type PlanExerciseInfo,
} from './rules.ts'
import type {
  BeginnerPlanRequest,
  BeginnerPlanResult,
  ExerciseExclusion,
  PlanFailure,
  ValidatedPlanInput,
} from './types.ts'

/**
 * 초급 추천 결과(BeginnerPlanResult) → 기존 WorkoutDraft 변환(순수 함수). 저장은 하지 않는다.
 * 변환된 초안은 기존 W11 절차(saveWorkoutList → validateDraft·normalizeDraft → 저장소 saveFromDraft)를 그대로 거쳐야 하며,
 * 이 파일은 별도 저장 경로를 만들지 않는다.
 *
 * 추천 결과는 호출자가 바꿀 수 있는 일반 객체라 `confirmable`만 믿지 않는다. 다음을 모두 다시 확인한 뒤에만 초안을 만든다.
 * 1) 현재 사용자의 운동 이해도(권한, assertBeginnerPlanAccess)  2) 원본 요청의 검증(validatePlanInput)
 * 3) 결과의 확정 가능 상태(confirmable·blockers·unsupported·overtime)  4) 운동별 무결성(카탈로그 id·중복·P2-1 추천 가능 판정·
 *    기록 방식·세트 수·목표값 범위·시간 상한·개수 상한·직접 선택 목록 보존)  5) 같은 요청을 엔진으로 다시 계산한 결과와의 완전 일치
 *    6) 만들어진 초안의 기존 validateDraft·normalizeDraft 통과.
 * 하나라도 어긋나면 초안을 만들지 않고 이유를 돌려준다(일부 운동만 변환하지 않는다).
 *
 * 초안에는 기존 계약의 필드(운동 id·이름·저장 기록 방식·세트의 reps 또는 targetSeconds)만 담는다. 휴식 시간·추천 이유·역할·경고·
 * 예상 시간·회전값은 담지 않는다(추천 결과 객체에 따로 남는다). 목표 중량은 만들지 않는다.
 */

export interface PlanToDraftContext {
  /** 현재 사용자의 운동 이해도(`loadKnowledgeLevels(userId)`의 `levels.exercise?.tier`). 추천 결과의 값을 믿지 않고 이 값으로 권한을 다시 확인한다. */
  exerciseTier: unknown
  /** 추천을 만들 때 쓴 원본 요청(재계산·대조에 쓴다). */
  request: BeginnerPlanRequest
  /** 추천을 만들 때 쓴 카탈로그·근거(재계산·대조에 쓴다). */
  source: PlanSource
  /** 초안 updatedAt(ISO 8601)을 만드는 시계. 인자로 받아 이 함수를 시계에 의존하지 않게 한다. */
  now: () => string
  /** 화면용 항목 id 만들기(기본: 기존 W02와 같은 newItemId). */
  itemIdFactory?: () => string
}

export type PlanToDraftFailureCode =
  | 'tierUnknown'
  | 'tierNotBeginner'
  | 'tierInvalid'
  /** 원본 요청이 검증을 통과하지 못했다(planFailures에 이유). */
  | 'requestInvalid'
  /** 결과의 모양이 올바르지 않다(객체·배열·필드 형식). */
  | 'planMalformed'
  /** 확정할 수 없는 상태다(confirmable·blockers·unsupported·overtime·빈 목록). */
  | 'planNotConfirmable'
  | 'exerciseDuplicate'
  | 'exerciseUnknown'
  /** 그 운동이 자동 구성 대상이 아니다(detail에 P2-1 제외 사유: 중량·초급 아님·근거 없음·도구 등). */
  | 'exerciseNotEligible'
  | 'recordTypeMismatch'
  | 'setsOutOfRule'
  | 'targetOutOfRule'
  | 'overLimit'
  | 'overCap'
  | 'selectionNotPreserved'
  /** 같은 요청을 엔진으로 다시 계산한 결과와 다르다(결과가 바뀌었다). */
  | 'planMismatch'
  /** 만들어진 초안이 기존 validateDraft·normalizeDraft를 통과하지 못했다(issues에 이유). */
  | 'draftInvalid'

export interface PlanToDraftFailure {
  code: PlanToDraftFailureCode
  exerciseId?: string
  detail?: ExerciseExclusion
  issues?: readonly DraftIssue[]
  planFailures?: readonly PlanFailure[]
}

export type PlanToDraftResult =
  | {
      ok: true
      draft: WorkoutDraft
      /** saveWorkoutList(W11 절차)에 그대로 넘기는 값: 카탈로그의 운동 id 모음 */
      knownExerciseIds: ReadonlySet<string>
      /** saveWorkoutList에 그대로 넘기는 값: 운동 id별 허용 기록 방식 */
      allowedRecordTypes: AllowedRecordTypes
    }
  | { ok: false; failures: readonly PlanToDraftFailure[] }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 키 순서와 무관한 깊은 비교(JSON 값). */
function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (Array.isArray(a) || Array.isArray(b)) {
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, i) => sameValue(value, b[i]))
    )
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a)
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => key in b && sameValue(a[key], b[key]))
    )
  }
  return false
}

const fail = (...failures: PlanToDraftFailure[]): PlanToDraftResult => ({
  ok: false,
  failures,
})

function checkTier(tier: unknown): PlanToDraftFailure | null {
  try {
    assertBeginnerPlanAccess(tier)
    return null
  } catch (error) {
    if (error instanceof BeginnerPlanAccessError) {
      return {
        code:
          error.reason === 'unknown'
            ? 'tierUnknown'
            : error.reason === 'notBeginner'
              ? 'tierNotBeginner'
              : 'tierInvalid',
      }
    }
    throw error
  }
}

/** 결과의 형식을 확인하고 운동 항목 배열을 돌려준다. 형식이 올바르지 않으면 null. */
function shapeOf(plan: unknown): Record<string, unknown>[] | null {
  if (!isObject(plan) || !Array.isArray(plan.items)) return null
  if (!Array.isArray(plan.blockers) || !Array.isArray(plan.unsupported)) {
    return null
  }
  for (const item of plan.items) {
    if (
      !isObject(item) ||
      typeof item.exerciseId !== 'string' ||
      typeof item.name !== 'string' ||
      typeof item.recordType !== 'string' ||
      !Array.isArray(item.sets)
    ) {
      return null
    }
  }
  return plan.items as Record<string, unknown>[]
}

/** 항목 하나의 무결성(P2-1 판정·기록 방식·세트 수·목표값 범위). 문제를 모두 모아 돌려준다. */
function checkItem(
  item: Record<string, unknown>,
  byId: ReadonlyMap<string, PlanExerciseInfo>,
  input: ValidatedPlanInput,
  source: PlanSource,
): PlanToDraftFailure[] {
  const exerciseId = item.exerciseId as string
  const exercise = byId.get(exerciseId)
  if (!exercise) return [{ code: 'exerciseUnknown', exerciseId }]
  const result = classifyExercise(exercise, {
    tools: input.tools,
    evidence: source.evidence,
  })
  if (!result.eligible) {
    return [{ code: 'exerciseNotEligible', exerciseId, detail: result.reason }]
  }
  const failures: PlanToDraftFailure[] = []
  if (item.recordType !== result.recordType) {
    failures.push({ code: 'recordTypeMismatch', exerciseId })
    return failures
  }
  const { rule } = result
  const sets = item.sets as unknown[]
  if (sets.length < rule.sets.min || sets.length > rule.sets.max) {
    failures.push({ code: 'setsOutOfRule', exerciseId })
  }
  const field = result.recordType === 'reps' ? 'reps' : 'targetSeconds'
  const targetOk = sets.every(
    (set) =>
      isObject(set) &&
      Object.keys(set).length === 1 &&
      Number.isInteger(set[field]) &&
      (set[field] as number) >= rule.target.min &&
      (set[field] as number) <= rule.target.max,
  )
  if (!targetOk) failures.push({ code: 'targetOutOfRule', exerciseId })
  return failures
}

function toDraftItem(
  item: Record<string, unknown>,
  idFactory: () => string,
): DraftItem {
  const recordType = item.recordType as 'reps' | 'time'
  const sets = (item.sets as Record<string, number>[]).map((set): DraftSet => {
    // 기록 방식에 맞는 목표값 하나만 옮긴다(다른 값·목표 중량·휴식은 만들지 않는다).
    return recordType === 'reps'
      ? { reps: set.reps }
      : { targetSeconds: set.targetSeconds }
  })
  return {
    itemId: idFactory(),
    exerciseId: item.exerciseId as string,
    name: item.name as string,
    recordType,
    sets,
  }
}

/**
 * 확정 가능한 초급 추천 결과를 WorkoutDraft로 바꾼다. 위 조건을 모두 통과해야 하며, 통과하지 못하면 초안을 만들지 않는다.
 * 항목 순서·세트 수·목표값은 추천 결과 그대로이고 바꾸지 않는다.
 */
export function planToDraft(
  plan: BeginnerPlanResult,
  context: PlanToDraftContext,
): PlanToDraftResult {
  // 1) 현재 사용자 권한(추천 결과의 값이 아니라 호출자가 넘긴 현재 이해도)
  const tierFailure = checkTier(context.exerciseTier)
  if (tierFailure) return fail(tierFailure)

  // 2) 원본 요청 검증(권한 포함)
  const validation = validatePlanInput(context.request)
  if (!validation.ok) {
    return fail({ code: 'requestInvalid', planFailures: validation.failures })
  }
  const input = validation.input

  // 3) 결과 형식과 확정 가능 상태
  const rawItems = shapeOf(plan)
  if (!rawItems) return fail({ code: 'planMalformed' })
  if (
    plan.confirmable !== true ||
    plan.blockers.length > 0 ||
    plan.unsupported.length > 0 ||
    plan.overtime !== null ||
    rawItems.length === 0
  ) {
    return fail({ code: 'planNotConfirmable' })
  }

  // 4) 운동별 무결성
  const byId = new Map(context.source.exercises.map((e) => [e.id, e]))
  const failures: PlanToDraftFailure[] = []
  const seen = new Set<string>()
  for (const item of rawItems) {
    const exerciseId = item.exerciseId as string
    if (exerciseId.trim() === '' || exerciseId !== exerciseId.trim()) {
      failures.push({ code: 'exerciseUnknown', exerciseId })
      continue
    }
    if (seen.has(exerciseId)) {
      failures.push({ code: 'exerciseDuplicate', exerciseId })
      continue
    }
    seen.add(exerciseId)
    failures.push(...checkItem(item, byId, input, context.source))
  }
  if (failures.length > 0) return fail(...failures)

  // 시간 상한(원본 요청의 운동 가능 시간 기준, 결과가 적어 둔 값을 믿지 않는다)
  const limitSeconds = input.availableMinutes * 60
  const estimated = estimateTotalSeconds(
    rawItems.map((item) => {
      const exercise = byId.get(item.exerciseId as string) as PlanExerciseInfo
      const rule = classifyExercise(exercise, {
        tools: input.tools,
        evidence: context.source.evidence,
      })
      if (!rule.eligible) return { estimatedSeconds: Number.POSITIVE_INFINITY }
      const sets = item.sets as Record<string, number>[]
      return {
        estimatedSeconds: estimateItemSeconds({
          recordType: rule.recordType,
          sets: sets.length,
          target:
            sets[0][rule.recordType === 'reps' ? 'reps' : 'targetSeconds'],
          restSeconds: rule.rule.restSeconds.default,
        }),
      }
    }),
  )
  if (estimated > limitSeconds) return fail({ code: 'overLimit' })

  // 모드별 확인: 자동은 개수 상한, 직접 선택은 선택 목록 그대로(누락·추가·순서 변경 없음)
  if (input.mode === 'automatic') {
    if (rawItems.length > maxAutoExercises(input.availableMinutes)) {
      return fail({ code: 'overCap' })
    }
  } else {
    const ids = rawItems.map((item) => item.exerciseId as string)
    if (!sameValue(ids, [...input.selectedExerciseIds])) {
      return fail({ code: 'selectionNotPreserved' })
    }
  }

  // 5) 같은 요청을 엔진으로 다시 계산해 결과 전체와 대조한다(결과가 한 곳이라도 바뀌었으면 거부).
  const recomputed = buildBeginnerPlan(context.request, context.source)
  if (!recomputed.ok || !sameValue(recomputed.plan, plan)) {
    return fail({ code: 'planMismatch' })
  }

  // 6) 초안 만들기 + 기존 검증·정규화
  const idFactory = context.itemIdFactory ?? newItemId
  const draft: WorkoutDraft = {
    v: 1,
    day: 'today',
    items: rawItems.map((item) => toDraftItem(item, idFactory)),
    updatedAt: context.now(),
  }
  const knownExerciseIds = new Set(context.source.exercises.map((e) => e.id))
  const allowedRecordTypes = buildAllowedRecordTypes(context.source.exercises)
  const checked = validateDraft(draft, knownExerciseIds, allowedRecordTypes)
  if (!checked.ok) {
    return fail({ code: 'draftInvalid', issues: checked.issues })
  }
  if (!normalizeDraft(draft, knownExerciseIds, allowedRecordTypes)) {
    return fail({ code: 'draftInvalid', issues: [] })
  }
  return { ok: true, draft, knownExerciseIds, allowedRecordTypes }
}

const FAILURE_MESSAGE: Record<PlanToDraftFailureCode, string> = {
  tierUnknown:
    '운동 이해도를 확인하지 못해 추천 운동을 목록으로 만들 수 없어요.',
  tierNotBeginner:
    '맞춤 운동 구성은 운동 이해도가 초급인 회원을 위한 기능이에요.',
  tierInvalid:
    '운동 이해도 정보가 올바르지 않아 추천 운동을 목록으로 만들 수 없어요.',
  requestInvalid:
    '추천 조건이 올바르지 않아 목록으로 만들 수 없어요. 조건을 다시 확인해 주세요.',
  planMalformed:
    '추천 결과가 올바르지 않아 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  planNotConfirmable:
    '아직 확정할 수 없는 추천이에요. 안내된 운동이나 시간을 조정한 뒤 다시 확인해 주세요.',
  exerciseDuplicate: '같은 운동이 겹쳐 있어 목록으로 만들 수 없어요.',
  exerciseUnknown: '운동 정보를 찾을 수 없어 목록으로 만들 수 없어요.',
  exerciseNotEligible:
    '자동으로 구성할 수 없는 운동이 있어 목록으로 만들 수 없어요.',
  recordTypeMismatch:
    '운동 방식이 맞지 않아 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  setsOutOfRule:
    '세트 수가 기준을 벗어나 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  targetOutOfRule:
    '목표 횟수·시간이 기준을 벗어나 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  overLimit: '예상 시간이 운동 가능 시간을 넘어 목록으로 만들 수 없어요.',
  overCap:
    '추천 운동 개수가 기준을 넘어 목록으로 만들 수 없어요. 다시 추천받아 주세요.',
  selectionNotPreserved:
    '선택한 운동 목록과 달라 목록으로 만들 수 없어요. 다시 확인해 주세요.',
  planMismatch: '추천 결과가 바뀐 것 같아요. 다시 추천받아 주세요.',
  draftInvalid:
    '운동 목록 형식이 올바르지 않아 만들 수 없어요. 다시 추천받아 주세요.',
}

export function describePlanToDraftFailure(
  code: PlanToDraftFailureCode,
): string {
  return FAILURE_MESSAGE[code]
}
