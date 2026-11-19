import { normalizeDraft, validateDraft } from './workoutDraftModel.ts'
import type {
  DraftIssue,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import type { WorkoutListRepository } from './workoutRepositories.ts'
import { sameListItems, toLocalDate } from './workoutModel.ts'
import type { LocalDate, WorkoutList } from './workoutTypes.ts'
import {
  makeSaveRequestId,
  selectTodayList,
  toListItems,
} from './workoutListView.ts'

/**
 * W11의 저장 절차(순수 비동기 함수). 저장소와 시계를 인자로 받으므로 화면 없이 시나리오를 시험할 수 있다.
 * 저장소(WorkoutListRepository)와 초안은 바꾸지 않는다. 오늘 목록의 "교체"는 새 목록을 추가하고 가장 최근 저장본을 오늘의 목록으로 보는 규칙이다
 * (이전 목록·세션·완료 기록은 지우지 않는다).
 *
 * 순서(각 단계에서 멈추면 초안은 그대로다)
 * 1. 현재 초안을 다시 검증한다.
 * 2. 현재 날짜가 사용자가 알고 있는 날짜(acknowledgedDate)와 다르면 날짜 확인을 요청한다.
 * 3. 그 날짜의 목록을 새로 조회한다. 조회에 실패하면 저장하지 않는다.
 *    같은 구성의 최신 목록이 있으면 저장하지 않고, 다른 구성이면 교체 확인을 요청한다(확인한 목록 id가 지금 최신 목록과 다르면 다시 묻는다).
 * 4. 저장 직전에 날짜를 한 번 더 확인한다. 달라졌으면 2번으로 돌아간다(자동으로 저장하지 않는다).
 * 5. `w11-<날짜>-<초안 updatedAt>` 요청 ID로 저장한다. 실패 뒤 재시도는 같은 ID다.
 * 6. 반환된 목록의 날짜가 사용자가 확인한 날짜와 다르면 저장은 됐지만 초안을 비우지 않도록 알린다.
 * requestConflict는 자동으로 다시 저장하지 않는다.
 */

export interface SaveWorkoutListDeps {
  listRepository: Pick<WorkoutListRepository, 'listByDate' | 'saveFromDraft'>
  /** 날짜 판단에 쓰는 시계. 저장소의 plannedDate도 같은 기기 시계를 쓴다. */
  now: () => Date
}

export interface SaveWorkoutListParams {
  /** 이번 저장 시도가 시작될 때의 초안(시도 중에는 이 값만 쓴다). */
  draft: WorkoutDraft
  knownExerciseIds: ReadonlySet<string>
  /**
   * 운동 id별 허용 기록 방식. 저장 직전 재검증과 저장소 검증에 쓴다. 화면이 선택지를 제한했더라도 여기서 다시 확인한다.
   * 주지 않으면 확인하지 않는다.
   */
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
  /** 사용자가 알고 저장하기로 한 날짜(W11을 연 날짜, 또는 날짜 확인에서 새로 확인한 날짜). */
  acknowledgedDate: LocalDate
  /** 사용자가 교체를 확인한 목록의 id. 확인하지 않았으면 null. */
  confirmedReplaceListId: string | null
}

export type SaveFailureReason =
  | 'quota'
  | 'unavailable'
  | 'blocked'
  | 'requestConflict'
  | 'invalidDraft'
  | 'error'

export type SaveWorkoutListOutcome =
  /** 저장했다(같은 요청이 이미 저장돼 있었다면 created가 false). 날짜도 확인한 날짜와 같다. */
  | { kind: 'saved'; list: WorkoutList; created: boolean }
  /** 같은 구성의 목록이 이미 오늘의 목록이라 저장하지 않았다. */
  | { kind: 'alreadySaved'; list: WorkoutList }
  /** 날짜가 바뀌었다. 사용자의 확인 전에는 저장하지 않았다. */
  | { kind: 'dateChanged'; from: LocalDate; to: LocalDate }
  /** 오늘 이미 다른 구성의 목록이 있다. 확인 전에는 저장하지 않았다. */
  | { kind: 'replaceConfirm'; existing: WorkoutList }
  /** 저장은 됐지만 확인한 날짜와 다른 날짜의 목록이 됐다(자정을 넘긴 경우). 초안을 비우면 안 된다. */
  | { kind: 'dateMismatch'; list: WorkoutList; expected: LocalDate }
  | { kind: 'invalid'; issues: readonly DraftIssue[] }
  /** stage가 read이면 오늘 목록 조회 실패(저장을 시도하지 않았다), save이면 저장 실패(아무것도 저장되지 않았다). */
  | { kind: 'failed'; stage: 'read' | 'save'; reason: SaveFailureReason }

/** 저장소 오류를 화면이 안내 문구를 고르는 이유로 바꾼다. 오류 내용(저장값)은 다루지 않는다. */
export function classifySaveFailure(error: unknown): SaveFailureReason {
  if (!isWorkoutStoreError(error)) return 'error'
  switch (error.reason) {
    case 'quota':
      return 'quota'
    case 'unavailable':
      return 'unavailable'
    case 'blocked':
    case 'versionChange':
      return 'blocked'
    case 'validation':
      return 'invalidDraft'
    case 'conflict':
      return error.code === 'requestConflict' ? 'requestConflict' : 'error'
    default:
      return 'error'
  }
}

export async function saveWorkoutList(
  deps: SaveWorkoutListDeps,
  params: SaveWorkoutListParams,
): Promise<SaveWorkoutListOutcome> {
  const { draft, knownExerciseIds, allowedRecordTypes, acknowledgedDate } =
    params

  // 1. 초안 재검증(허용 기록 방식 포함)
  const validation = validateDraft(draft, knownExerciseIds, allowedRecordTypes)
  if (!validation.ok) return { kind: 'invalid', issues: validation.issues }
  const normalized = normalizeDraft(draft, knownExerciseIds, allowedRecordTypes)
  if (!normalized) return { kind: 'invalid', issues: [] }

  // 2. 날짜 확인
  const first = toLocalDate(deps.now())
  if (first !== acknowledgedDate) {
    return { kind: 'dateChanged', from: acknowledgedDate, to: first }
  }

  // 3. 오늘 목록 조회 → 같은 구성 / 교체 확인
  let existing: WorkoutList | null
  try {
    const found = await deps.listRepository.listByDate(acknowledgedDate)
    existing = selectTodayList(found.items, acknowledgedDate)
  } catch (error) {
    return { kind: 'failed', stage: 'read', reason: classifySaveFailure(error) }
  }
  if (existing) {
    if (sameListItems(existing.items, toListItems(normalized))) {
      return { kind: 'alreadySaved', list: existing }
    }
    if (params.confirmedReplaceListId !== existing.id) {
      return { kind: 'replaceConfirm', existing }
    }
  }

  // 4. 저장 직전 날짜 재확인
  const second = toLocalDate(deps.now())
  if (second !== acknowledgedDate) {
    return { kind: 'dateChanged', from: acknowledgedDate, to: second }
  }

  // 5. 저장
  const requestId = makeSaveRequestId(acknowledgedDate, draft.updatedAt)
  if (!requestId) {
    return { kind: 'failed', stage: 'save', reason: 'invalidDraft' }
  }
  let result
  try {
    result = await deps.listRepository.saveFromDraft({
      requestId,
      draft,
      knownExerciseIds,
      allowedRecordTypes,
    })
  } catch (error) {
    return { kind: 'failed', stage: 'save', reason: classifySaveFailure(error) }
  }

  // 6. 반환된 목록의 날짜 확인
  if (result.list.plannedDate !== acknowledgedDate) {
    return {
      kind: 'dateMismatch',
      list: result.list,
      expected: acknowledgedDate,
    }
  }
  return { kind: 'saved', list: result.list, created: result.created }
}
