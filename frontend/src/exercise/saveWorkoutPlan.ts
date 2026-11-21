import { normalizeDraft, validateDraft } from './workoutDraftModel.ts'
import type {
  DraftIssue,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'
import {
  isWorkoutPlanDateOpen,
  planItemsFromDraft,
  tomorrowOf,
  type WorkoutPlan,
} from './workoutPlanModel.ts'
import type { WorkoutPlanRepository } from './workoutPlanRepository.ts'
import { isValidRequestId, sameListItems, toLocalDate } from './workoutModel.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import type { LocalDate } from './workoutTypes.ts'

/**
 * W11(day=tomorrow)의 내일 계획 저장 절차(순수 비동기 함수). 저장소와 시계를 인자로 받으므로 화면 없이 시나리오를 시험할 수 있다.
 * 저장소(WorkoutPlanRepository)와 초안은 바꾸지 않는다. 운동 목록(workoutLists)·세션·기록·루틴에는 아무 영향이 없다.
 *
 * 순서(각 단계에서 멈추면 초안은 그대로다)
 * 1. 초안(내일 초안)을 다시 검증한다.
 * 2. 계획 날짜가 지금 시계 기준 "오늘 이후"가 아니면(화면을 연 채 자정이 지났다) 저장하지 않고 새 날짜(내일) 확인을 요청한다.
 * 3. 그 날짜의 계획을 새로 조회한다. 조회에 실패하면 저장하지 않는다.
 *    - 계획이 있고 구성이 같으면 저장하지 않는다(alreadySaved).
 *    - 계획이 있고 이 초안이 그 계획을 고치는 중이면(draft.editingPlanId) 초안이 읽은 revision으로 교체한다(다르면 revisionMismatch).
 *    - 계획이 있고 고치는 중이 아니면 교체 확인을 요청한다(확인한 계획 id가 지금 계획과 다르면 다시 묻는다).
 * 4. 계획이 없으면 `w11p-<날짜>-<초안 updatedAt>` 요청 ID로 새로 만든다. 실패 뒤 재시도는 같은 ID다.
 * 어떤 경우에도 자동으로 운동을 시작하거나 완료 기록을 만들지 않는다.
 */

export interface SaveWorkoutPlanDeps {
  planRepository: Pick<
    WorkoutPlanRepository,
    'listByDate' | 'create' | 'replace'
  >
  /** 날짜 판단에 쓰는 시계. 저장소의 시계와 같은 기기 시계를 쓴다. */
  now: () => Date
}

export interface SaveWorkoutPlanParams {
  /** 이번 저장 시도가 시작될 때의 내일 초안(시도 중에는 이 값만 쓴다). */
  draft: WorkoutDraft
  knownExerciseIds: ReadonlySet<string>
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
  /** 사용자가 알고 저장하기로 한 계획 날짜(W11을 연 시점의 내일, 또는 날짜 확인에서 새로 확인한 날짜). */
  planDate: LocalDate
  /** 사용자가 교체를 확인한 계획의 id. 확인하지 않았으면 null. */
  confirmedReplacePlanId: string | null
}

export type PlanSaveFailureReason =
  | 'quota'
  | 'unavailable'
  | 'blocked'
  | 'requestConflict'
  | 'invalidDraft'
  | 'revisionMismatch'
  | 'planExists'
  | 'planDatePassed'
  | 'error'

export type SaveWorkoutPlanOutcome =
  /** 저장했다(replaced: 기존 계획을 바꿨다, created: 같은 요청이 이미 저장돼 있었다면 false). */
  | { kind: 'saved'; plan: WorkoutPlan; replaced: boolean; created: boolean }
  /** 같은 구성의 계획이 이미 저장돼 있어 저장하지 않았다. */
  | { kind: 'alreadySaved'; plan: WorkoutPlan }
  /** 계획 날짜가 더 이상 내일이 아니다(자정이 지났다). 사용자의 확인 전에는 저장하지 않았다. */
  | { kind: 'dateChanged'; from: LocalDate; to: LocalDate }
  /** 그 날짜에 이미 다른 구성의 계획이 있다. 확인 전에는 저장하지 않았다. */
  | { kind: 'replaceConfirm'; existing: WorkoutPlan }
  | { kind: 'invalid'; issues: readonly DraftIssue[] }
  /** stage가 read이면 계획 조회 실패(저장을 시도하지 않았다), save이면 저장 실패(아무것도 저장되지 않았다). */
  | { kind: 'failed'; stage: 'read' | 'save'; reason: PlanSaveFailureReason }

/** 저장소 오류를 화면이 안내 문구를 고르는 이유로 바꾼다. 오류 내용(저장값)은 다루지 않는다. */
export function classifyPlanSaveFailure(error: unknown): PlanSaveFailureReason {
  if (!isWorkoutStoreError(error)) return 'error'
  switch (error.reason) {
    case 'quota':
      return 'quota'
    case 'unavailable':
      return 'unavailable'
    case 'blocked':
    case 'versionChange':
      return 'blocked'
    case 'notFound':
      // 고치던 계획이 그 사이 삭제되었다. 최신 상태를 다시 읽도록 revision 충돌과 같이 안내한다.
      return 'revisionMismatch'
    case 'validation':
      return error.code === 'invalidPlanDate'
        ? 'planDatePassed'
        : 'invalidDraft'
    case 'conflict':
      if (error.code === 'requestConflict') return 'requestConflict'
      if (error.code === 'revisionMismatch') return 'revisionMismatch'
      // 같은 순간 다른 탭이 같은 날짜에 저장했다(유일 인덱스).
      if (error.code === 'planExists' || error.code === 'uniqueConstraint') {
        return 'planExists'
      }
      return 'error'
    default:
      return 'error'
  }
}

/**
 * 저장 요청 ID: `w11p-<YYYYMMDD>-<초안 updatedAt의 영문·숫자>`. 같은 계획 날짜·초안 버전은 항상 같은 ID라서
 * 실패·응답 유실·새로고침 뒤 재시도가 계획을 두 번 만들지 않는다. 사용자 식별 정보와 운동 내용은 넣지 않는다. 만들 수 없으면 null이다.
 */
export function makePlanRequestId(
  planDate: LocalDate,
  draftUpdatedAt: string,
): string | null {
  const version = draftUpdatedAt.replace(/[^0-9A-Za-z]/g, '')
  if (version === '') return null
  const id = `w11p-${planDate.replace(/-/g, '')}-${version}`
  return isValidRequestId(id) ? id : null
}

export async function saveWorkoutPlan(
  deps: SaveWorkoutPlanDeps,
  params: SaveWorkoutPlanParams,
): Promise<SaveWorkoutPlanOutcome> {
  const { draft, knownExerciseIds, allowedRecordTypes, planDate } = params
  const input = { draft, knownExerciseIds, allowedRecordTypes }

  // 1. 초안 재검증(내일 초안·허용 기록 방식 포함)
  const validation = validateDraft(draft, knownExerciseIds, allowedRecordTypes)
  if (!validation.ok) return { kind: 'invalid', issues: validation.issues }
  if (draft.day !== 'tomorrow') return { kind: 'invalid', issues: [] }
  if (normalizeDraft(draft, knownExerciseIds, allowedRecordTypes) === null) {
    return { kind: 'invalid', issues: [] }
  }
  const items = planItemsFromDraft(input)
  if (!items) return { kind: 'invalid', issues: [] }

  // 2. 날짜 확인: 계획 날짜는 지금 시계 기준 내일 이후여야 한다.
  const today = toLocalDate(deps.now())
  if (!isWorkoutPlanDateOpen(planDate, today)) {
    return { kind: 'dateChanged', from: planDate, to: tomorrowOf(today) }
  }

  // 3. 그 날짜의 계획 조회 → 같은 구성 / 고치는 중 / 교체 확인
  let existing: WorkoutPlan | null
  try {
    const found = await deps.planRepository.listByDate(planDate)
    existing = found.items[0] ?? null
  } catch (error) {
    return {
      kind: 'failed',
      stage: 'read',
      reason: classifyPlanSaveFailure(error),
    }
  }
  if (existing) {
    if (sameListItems(existing.items, items)) {
      return { kind: 'alreadySaved', plan: existing }
    }
    const editing =
      draft.editingPlanId === existing.id &&
      draft.editingPlanRevision !== undefined
    if (!editing && params.confirmedReplacePlanId !== existing.id) {
      return { kind: 'replaceConfirm', existing }
    }
    // 4a. 교체: 고치던 계획이면 초안이 읽은 revision으로, 확인한 교체면 방금 읽은 revision으로 확인한다.
    const expectedRevision = editing
      ? (draft.editingPlanRevision as number)
      : existing.revision
    // 저장 직전 날짜를 한 번 더 확인한다(조회와 저장 사이에 자정이 지날 수 있다).
    const second = toLocalDate(deps.now())
    if (!isWorkoutPlanDateOpen(planDate, second)) {
      return { kind: 'dateChanged', from: planDate, to: tomorrowOf(second) }
    }
    try {
      const plan = await deps.planRepository.replace(existing.id, {
        ...input,
        expectedRevision,
      })
      return { kind: 'saved', plan, replaced: true, created: true }
    } catch (error) {
      return {
        kind: 'failed',
        stage: 'save',
        reason: classifyPlanSaveFailure(error),
      }
    }
  }

  // 4b. 새 계획
  const second = toLocalDate(deps.now())
  if (!isWorkoutPlanDateOpen(planDate, second)) {
    return { kind: 'dateChanged', from: planDate, to: tomorrowOf(second) }
  }
  const requestId = makePlanRequestId(planDate, draft.updatedAt)
  if (!requestId) {
    return { kind: 'failed', stage: 'save', reason: 'invalidDraft' }
  }
  try {
    const result = await deps.planRepository.create({
      ...input,
      requestId,
      planDate,
    })
    return {
      kind: 'saved',
      plan: result.plan,
      replaced: false,
      created: result.created,
    }
  } catch (error) {
    return {
      kind: 'failed',
      stage: 'save',
      reason: classifyPlanSaveFailure(error),
    }
  }
}
