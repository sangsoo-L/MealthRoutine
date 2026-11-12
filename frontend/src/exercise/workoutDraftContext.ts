import { createContext, useContext } from 'react'
import type { Exercise } from './exerciseTypes.ts'
import type { DraftSet, RecordType, WorkoutDraft } from './workoutDraftTypes.ts'

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
  /** 운동을 초안 끝에 추가한다. 이미 있는 운동 id와 입력 안의 중복은 건너뛰고 입력 순서를 유지한다. */
  addExercises: (exercises: readonly Exercise[]) => void
  removeItem: (itemId: string) => void
  moveItem: (itemId: string, direction: 'up' | 'down') => void
  setRecordType: (itemId: string, recordType: RecordType) => void
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
