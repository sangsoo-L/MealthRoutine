import { useCallback, useEffect, useMemo, useState } from 'react'
import type { WorkoutPlan } from './workoutPlanModel.ts'
import { createWorkoutPlanRepository } from './workoutPlanSource.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import type { LocalDate } from './workoutTypes.ts'

/**
 * 내일 운동 계획 조회 상태(W10 내일 계획 영역·W01 다음 운동 준비하기).
 * - loading: 불러오는 중. unavailable: 저장소가 없다(운영 빌드·계정 없음)거나 이 브라우저에서 IndexedDB를 쓸 수 없다("계획 없음"이 아니다).
 * - error: 조회 실패(reload로 다시 시도). ready: plans는 계획 날짜 오름차순이고 skippedCount는 읽을 수 없는 계획 수다.
 * 계획 날짜가 오늘 이상인 계획만 읽는다(지난 날짜 계획은 보이지 않지만 지우지 않는다). 운동 목록·기록과 별개의 데이터다.
 */
export type WorkoutPlansState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      plans: readonly WorkoutPlan[]
      skippedCount: number
    }

type Settled = Exclude<WorkoutPlansState, { status: 'loading' }>

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Settled
}

/**
 * 이 계정의 계획 날짜가 today 이상인 계획을 읽는다(읽기 전용). 계정·날짜가 바뀌면 지난 값을 버리고 불러오는 중으로 돌아가므로
 * 이전 계정의 계획이 보이지 않는다. 계획을 바꾼 뒤에는 reload로 다시 읽는다.
 */
export function useWorkoutPlans(
  userId: string | null,
  today: LocalDate,
): { state: WorkoutPlansState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createWorkoutPlanRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${today}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.listFrom(today).then(
      (result) => {
        if (cancelled) return
        setLoaded({
          key,
          state: {
            status: 'ready',
            plans: result.items,
            skippedCount: result.skippedCount,
          },
        })
      },
      (error: unknown) => {
        if (cancelled) return
        setLoaded({
          key,
          state: {
            status:
              isWorkoutStoreError(error) && error.reason === 'unavailable'
                ? 'unavailable'
                : 'error',
          },
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, today, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: WorkoutPlansState = !repository
    ? { status: 'unavailable' }
    : loaded && loaded.key === key
      ? loaded.state
      : { status: 'loading' }
  return { state, reload }
}
