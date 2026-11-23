import { newItemId, normalizeDraft } from './workoutDraftModel.ts'
import type { RecordType, WorkoutDraft } from './workoutDraftTypes.ts'
import { toListItems } from './workoutListView.ts'
import {
  isIsoTimestamp,
  isLocalDate,
  isValidOwnerId,
  isValidRequestId,
  toLocalDate,
  validListItems,
} from './workoutModel.ts'
import type { LocalDate, WorkoutListItem } from './workoutTypes.ts'

/**
 * 내일 운동 계획(W02·W11·W10의 day=tomorrow)의 저장 모델과 순수 함수(저장소·React를 부르지 않는다). 개발 서버의 IndexedDB `workoutPlans`(DB v5)에
 * 저장하는 값의 모양이다.
 *
 * - **계획 전용**이다. 운동 목록(workoutLists)·루틴(workoutRoutines)·수행 세션·완료 기록과 저장소가 다르고, 어떤 운동 기록·통계에도 반영되지 않는다.
 *   계획 날짜가 되어도 자동으로 오늘의 운동 목록이 되거나 시작·완료되지 않는다("계획 불러오기"는 이번 범위가 아니다).
 * - 계정당 계획 날짜별 계획은 1개다(저장소의 계정+날짜 유일 인덱스가 보장한다). 운동 줄(items)은 운동 목록과 같은 모양(WorkoutListItem)이며
 *   배열 순서가 운동 순서다: 운동 id, 저장 당시 운동 이름(스냅샷), 기록 방식, 세트별 목표.
 * - 백엔드 DTO가 아니며 API 계약이 아니다.
 */

/** 저장 레코드의 스키마 버전. 모양을 바꾸면 올리고 exercise/local/exerciseDb.ts의 업그레이드에서 옮긴다. */
export const WORKOUT_PLAN_SCHEMA_VERSION = 1

export interface WorkoutPlan {
  id: string
  ownerId: string
  schemaVersion: typeof WORKOUT_PLAN_SCHEMA_VERSION
  /** 계획 날짜(기기 로컬 날짜). 저장할 때 "오늘 이후"여야 한다. */
  planDate: LocalDate
  items: readonly WorkoutListItem[]
  catalogVersion: string
  /** 저장할 때마다 1씩 오르는 값(동시 수정 감지). */
  revision: number
  /** 저장 요청 식별자. 같은 계정에서 같은 요청을 반복해도 계획이 하나만 생긴다(중복 저장 방지). */
  requestId: string
  createdAt: string
  updatedAt: string
}

/** 계획 날짜가 기준일(보통 오늘)보다 뒤인가. 오늘이 되었거나 지난 계획은 새로 만들거나 고칠 수 없다(조회·삭제만 가능). */
export function isWorkoutPlanDateOpen(
  planDate: LocalDate,
  today: LocalDate,
): boolean {
  return planDate > today
}

/** 날짜에 일수를 더한다(기기 로컬 날짜 기준, 월·연 경계와 윤년 포함). */
export function addDaysToLocalDate(date: LocalDate, days: number): LocalDate {
  const [y, m, d] = date.split('-').map(Number)
  const next = new Date(y, m - 1, d, 12)
  next.setDate(next.getDate() + days)
  return toLocalDate(next)
}

/** 오늘의 다음 날(내일 계획의 날짜). */
export function tomorrowOf(today: LocalDate): LocalDate {
  return addDaysToLocalDate(today, 1)
}

interface BuildParams {
  draft: WorkoutDraft
  knownExerciseIds: ReadonlySet<string>
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
}

/** 내일 초안을 검증·정규화해 저장용 운동 줄로 만든다. 내일 초안이 아니거나 검증을 통과하지 못하면 null이다. */
export function planItemsFromDraft(
  params: BuildParams,
): WorkoutListItem[] | null {
  if (params.draft.day !== 'tomorrow') return null
  const normalized = normalizeDraft(
    params.draft,
    params.knownExerciseIds,
    params.allowedRecordTypes,
  )
  return normalized ? toListItems(normalized) : null
}

/** 새 계획을 만든다. 날짜·초안이 올바르지 않으면 null이다. revision 1, createdAt = updatedAt = now. */
export function buildWorkoutPlan(
  params: BuildParams & {
    id: string
    ownerId: string
    requestId: string
    planDate: LocalDate
    catalogVersion: string
    now: Date
  },
): WorkoutPlan | null {
  if (!isLocalDate(params.planDate)) return null
  const items = planItemsFromDraft(params)
  if (!items) return null
  const at = params.now.toISOString()
  return {
    id: params.id,
    ownerId: params.ownerId,
    schemaVersion: WORKOUT_PLAN_SCHEMA_VERSION,
    planDate: params.planDate,
    items,
    catalogVersion: params.catalogVersion,
    revision: 1,
    requestId: params.requestId,
    createdAt: at,
    updatedAt: at,
  }
}

/**
 * 기존 계획의 운동 구성을 초안으로 바꾼 새 값. id·소유자·계획 날짜·요청 id·createdAt은 그대로이고 운동 줄·카탈로그 버전이 바뀐다.
 * revision은 1 오르고 updatedAt은 now다. 초안이 올바르지 않으면 null이다.
 */
export function buildWorkoutPlanReplace(
  existing: WorkoutPlan,
  params: BuildParams & { catalogVersion: string; now: Date },
): WorkoutPlan | null {
  const items = planItemsFromDraft(params)
  if (!items) return null
  return {
    ...existing,
    items,
    catalogVersion: params.catalogVersion,
    revision: existing.revision + 1,
    updatedAt: params.now.toISOString(),
  }
}

/**
 * 저장된 계획을 고치기 위한 내일 초안으로 바꾼다(W10 "계획 수정" → W02). 계획의 운동 순서·기록 방식·세트별 목표를 그대로 옮기고
 * 고치는 계획의 id와 revision을 초안에 남겨 저장할 때 충돌을 확인한다. 항목 id는 화면용이라 새로 만든다.
 */
export function planToDraft(
  plan: WorkoutPlan,
  now: () => string = () => new Date().toISOString(),
): WorkoutDraft {
  return {
    v: 1,
    day: 'tomorrow',
    items: plan.items.map((item) => ({
      itemId: newItemId(),
      exerciseId: item.exerciseId,
      name: item.exerciseNameSnapshot,
      recordType: item.recordType,
      sets: item.sets.map((set) => ({ ...set })),
    })),
    updatedAt: now(),
    editingPlanId: plan.id,
    editingPlanRevision: plan.revision,
  }
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 저장소에서 읽은 계획. 모양이 맞지 않으면 null(손상). */
export function parseWorkoutPlan(raw: unknown): WorkoutPlan | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== WORKOUT_PLAN_SCHEMA_VERSION ||
    typeof raw.id !== 'string' ||
    raw.id === '' ||
    !isValidOwnerId(raw.ownerId) ||
    !isLocalDate(raw.planDate) ||
    !validListItems(raw.items) ||
    typeof raw.catalogVersion !== 'string' ||
    raw.catalogVersion === '' ||
    raw.catalogVersion.length > 50 ||
    typeof raw.revision !== 'number' ||
    !Number.isInteger(raw.revision) ||
    raw.revision < 1 ||
    !isValidRequestId(raw.requestId) ||
    !isIsoTimestamp(raw.createdAt) ||
    !isIsoTimestamp(raw.updatedAt)
  ) {
    return null
  }
  return raw as unknown as WorkoutPlan
}
