import type { Exercise } from './exerciseTypes.ts'
import { validateRecordModes } from './recordMode.ts'
import {
  addExercisesToDraft,
  createEmptyDraft,
  hasDraftContent,
  MAX_ITEMS,
} from './workoutDraftModel.ts'
import type { WorkoutDraft } from './workoutDraftTypes.ts'

/**
 * E02(운동 상세)의 "오늘 기록에 추가"를 W02 초안에 연결하는 순수 판단 함수(화면·저장소와 무관, 입력을 바꾸지 않는다).
 * 운동명·기록 방식·기본 목표는 W02·W13이 쓰는 `addExercisesToDraft`(createDraftItem)를 그대로 쓰므로 새 규칙·기본값이 없다.
 * 중복 운동·상한(500개) 처리도 같은 함수의 결과를 그대로 따른다(이미 있는 운동은 건너뛴다).
 */

export type AddToTodayRejection =
  /** 회원 초안(WorkoutDraftProvider status가 ready)이 아니다. */
  | 'notMember'
  /** 운동 데이터가 없거나 W02 초안에 담을 수 없는 모양이다. */
  | 'invalidExercise'

export type AddToTodayPlan =
  | { kind: 'rejected'; reason: AddToTodayRejection }
  /** 구성 중인 초안이 없다: 이 운동만 담은 새 초안으로 시작한다(`draft`). */
  | { kind: 'start'; draft: WorkoutDraft }
  /** 구성 중인 초안이 있다: 사용자가 "기존 초안에 추가 / 새 구성으로 시작 / 취소"를 고른다. */
  | {
      kind: 'choose'
      /** 새 구성으로 시작할 때의 초안(기존 초안을 대체한다). */
      fresh: WorkoutDraft
      itemCount: number
    }
  /** 구성 중인 초안이 있고 이 운동을 더 담을 수 없다(이미 있음·상한). 기존 초안은 바뀌지 않는다. */
  | {
      kind: 'blocked'
      reason: 'duplicate' | 'full'
      fresh: WorkoutDraft
      itemCount: number
    }

function isNonEmptyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * W02 초안에 담을 수 있는 운동인가. 초안은 운동 식별자·이름·부위·도구와 기록 방식 메타데이터(있다면)만 읽는다.
 * 기록 방식 메타데이터가 있으면 W02 시드 검증과 같은 규칙(validateRecordModes)을 통과해야 한다.
 * 이 함수는 "유효한 운동만 전달한다"를 위한 입구 검사이며, 카탈로그에 실제로 있는지는 호출한 쪽(E02는 저장소 조회 결과)이 보장한다.
 */
export function isAddableExercise(value: unknown): value is Exercise {
  if (typeof value !== 'object' || value === null) return false
  const exercise = value as Record<string, unknown>
  if (!isNonEmptyText(exercise.id) || !isNonEmptyText(exercise.name)) {
    return false
  }
  if (
    !Array.isArray(exercise.targetMuscles) ||
    !Array.isArray(exercise.equipment)
  ) {
    return false
  }
  if (exercise.recordModes !== undefined) {
    const modes = exercise.recordModes as Record<string, unknown> | null
    if (typeof modes !== 'object' || modes === null) return false
    if (!validateRecordModes(modes.default, modes.allowed).ok) return false
  }
  return true
}

/** 이 운동 하나만 담은 새 초안. 기본 기록 방식·목표는 W02·W13과 같은 규칙으로 정해진다. */
export function buildFreshDraft(
  exercise: Exercise,
  now?: () => string,
): WorkoutDraft {
  return addExercisesToDraft(createEmptyDraft(now), [exercise], now)
}

/**
 * 지금 초안 상태에서 "오늘 기록에 추가"를 눌렀을 때 무엇을 해야 하는지 판단한다. 초안은 바꾸지 않는다.
 * - 회원이 아니거나 운동이 유효하지 않으면 거절한다(아무것도 담지 않는다).
 * - 초안이 비어 있으면 새 초안으로 시작한다.
 * - 초안에 운동이 있으면 사용자가 고르게 하며(기존 초안은 확인 전에 바뀌지 않는다), 더 담을 수 없으면 그 이유를 돌려준다.
 */
export function planAddToToday(input: {
  memberReady: boolean
  draft: WorkoutDraft
  exercise: unknown
}): AddToTodayPlan {
  const { memberReady, draft, exercise } = input
  if (!memberReady) return { kind: 'rejected', reason: 'notMember' }
  if (!isAddableExercise(exercise)) {
    return { kind: 'rejected', reason: 'invalidExercise' }
  }
  if (!hasDraftContent(draft)) {
    return { kind: 'start', draft: buildFreshDraft(exercise) }
  }
  const fresh = buildFreshDraft(exercise)
  const itemCount = draft.items.length
  // 추가할 것이 없으면 같은 초안이 돌아온다(이미 있는 운동이 우선이고, 아니면 상한이다).
  if (addExercisesToDraft(draft, [exercise]) === draft) {
    const duplicate = draft.items.some(
      (item) => item.exerciseId === exercise.id,
    )
    return {
      kind: 'blocked',
      reason: duplicate || itemCount < MAX_ITEMS ? 'duplicate' : 'full',
      fresh,
      itemCount,
    }
  }
  return { kind: 'choose', fresh, itemCount }
}
