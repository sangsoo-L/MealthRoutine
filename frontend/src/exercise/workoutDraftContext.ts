import { createContext, useContext } from 'react'
import type { Exercise } from './exerciseTypes.ts'
import type {
  DraftDay,
  DraftSet,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'

export interface WorkoutDraftContextValue {
  /** guest: 비회원이라 초안을 쓰지 않는다(저장소에도 접근하지 않는다). ready: 회원의 초안. */
  status: 'guest' | 'ready'
  /** 현재 회원의 초안. 비어 있을 수 있다(운동 0개). guest일 때는 항상 빈 초안이다. */
  draft: WorkoutDraft
  /** 편집 중인 운동이 있다(운동 1개 이상). */
  hasContent: boolean
  /**
   * 임시 저장 상태. unavailable이면 저장소를 쓸 수 없거나 마지막 저장이 실패했다: 이 탭에서만 편집을 이어갈 수 있고
   * 새로고침하면 구성이 사라질 수 있다. 화면의 편집 자체는 계속된다.
   */
  persistence: 'ok' | 'unavailable'
  /** 저장돼 있던 초안이 손상되었거나 다른 버전이라 버리고 새로 시작했다. 다음 편집(초안이 실제로 바뀔 때)에서 사라진다. */
  discardedNotice: boolean
  /** 빈 새 초안으로 초기화한다(기존 초안은 버려진다). 호출하는 쪽이 사용자 확인을 거친다. */
  startNew: () => void
  /**
   * 저장에 성공한 초안을 비운다. 지금 초안의 updatedAt이 expectedUpdatedAt과 같을 때만 비운다(저장하는 사이 초안이 바뀌었다면 아무것도 하지 않는다).
   * 비교와 초기화가 한 번의 상태 갱신 안에서 일어나서, 확인과 초기화 사이에 끼어든 편집이 지워지지 않는다.
   */
  clearSaved: (expectedUpdatedAt: string) => void
  /**
   * 초안 전체를 주어진 초안으로 바꾼다(기존 초안은 버려진다). 초급 운동 추천의 확정(planToDraft 결과)이 W11 검토로 넘어갈 때 쓴다.
   * 기존 validateDraft를 통과하지 못하는 초안은 받지 않고 false를 돌려준다(상태 변화 없음). 비회원(guest)에서도 false다.
   * 호출하는 쪽이 사용자 확인(구성 중인 초안이 있을 때)을 거친다. 저장·검증은 W11의 기존 절차가 그대로 맡는다.
   */
  replaceDraft: (draft: WorkoutDraft) => boolean
  /** 운동을 초안 끝에 추가한다. 이미 있는 운동 id와 입력 안의 중복은 건너뛰고 입력 순서를 유지한다. */
  addExercises: (exercises: readonly Exercise[]) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  /** 기록 방식을 바꾼다. allowedTypes를 주면 그 목록에 없는 방식은 받지 않는다(운동별 허용 방식 제한). */
  setRecordType: (
    itemId: string,
    recordType: RecordType,
    allowedTypes?: readonly RecordType[],
  ) => void
  addSet: (itemId: string) => void
  removeSet: (itemId: string, setIndex: number) => void
  updateSet: (
    itemId: string,
    setIndex: number,
    patch: Partial<Record<keyof DraftSet, number | undefined>>,
  ) => void
}

export const WorkoutDraftContext =
  createContext<WorkoutDraftContextValue | null>(null)

/**
 * 내일 운동 계획 초안의 공유 상태(day="tomorrow"인 WorkoutDraftProvider가 채운다). 오늘 초안(WorkoutDraftContext)과 별개의 상태·임시 저장 키를 가져
 * 서로 덮어쓰지 않는다.
 */
export const TomorrowWorkoutDraftContext =
  createContext<WorkoutDraftContextValue | null>(null)

/** 내일 운동 계획 초안 공유 상태. day="tomorrow"인 WorkoutDraftProvider 안에서만 쓸 수 있다. */
export function useTomorrowWorkoutDraft(): WorkoutDraftContextValue {
  const value = useContext(TomorrowWorkoutDraftContext)
  if (value === null) {
    throw new Error(
      'useTomorrowWorkoutDraft는 day="tomorrow"인 WorkoutDraftProvider 안에서만 사용할 수 있습니다.',
    )
  }
  return value
}

/**
 * 날짜 구분(오늘/내일)에 맞는 초안 공유 상태. W02·W13·W11이 주소의 day 파라미터로 고른다.
 * 두 상태를 항상 함께 읽어(훅 호출 순서 고정) 고른 쪽만 돌려준다.
 */
export function useDayWorkoutDraft(day: DraftDay): WorkoutDraftContextValue {
  const today = useWorkoutDraft()
  const tomorrow = useTomorrowWorkoutDraft()
  return day === 'tomorrow' ? tomorrow : today
}

/** 운동 초안 공유 상태. WorkoutDraftProvider 안에서만 쓸 수 있다. */
export function useWorkoutDraft(): WorkoutDraftContextValue {
  const value = useContext(WorkoutDraftContext)
  if (value === null) {
    throw new Error(
      'useWorkoutDraft는 WorkoutDraftProvider 안에서만 사용할 수 있습니다.',
    )
  }
  return value
}
