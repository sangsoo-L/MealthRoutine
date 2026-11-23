import { useCallback, useEffect, useMemo, useState } from 'react'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import type { MealPlan } from './mealPlanModel.ts'
import { createMealPlanRepository } from './mealPlanSource.ts'

/**
 * 하루의 식단 계획 조회 상태(상태 이름과 뜻은 useMealRecords와 같다).
 * - loading: 불러오는 중. unavailable: 저장소가 없다(운영 빌드·계정 없음)거나 이 브라우저에서 IndexedDB를 쓸 수 없다("계획 없음"이 아니다).
 * - error: 조회 실패(reload로 다시 시도). ready: plans는 등록 순서이고 skippedCount는 읽을 수 없는 계획 수다.
 * 실제 섭취 기록과 별개의 데이터다(합계에 섞지 않는다).
 */
export type MealPlansState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      records: readonly MealPlan[]
      skippedCount: number
    }

type Settled = Exclude<MealPlansState, { status: 'loading' }>

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Settled
}

/**
 * 이 계정의 해당 계획 날짜의 계획을 읽는다(읽기 전용). 계정·날짜가 바뀌면 지난 값을 버리고 불러오는 중으로 돌아가므로
 * 이전 계정·날짜의 계획이 보이지 않는다. 계획을 바꾼 뒤에는 reload로 다시 읽는다.
 * 목록 필드 이름을 records로 둔 것은 D02와 같은 화면 컴포넌트가 두 상태를 같은 모양으로 받게 하려는 것이다.
 */
export function useMealPlans(
  userId: string | null,
  planDate: LocalDate,
): { state: MealPlansState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createMealPlanRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${planDate}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.listByDate(planDate).then(
      (result) => {
        if (cancelled) return
        setLoaded({
          key,
          state: {
            status: 'ready',
            records: result.items,
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
  }, [repository, planDate, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: MealPlansState = !repository
    ? { status: 'unavailable' }
    : loaded && loaded.key === key
      ? loaded.state
      : { status: 'loading' }
  return { state, reload }
}
