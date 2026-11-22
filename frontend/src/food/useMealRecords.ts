import { useCallback, useEffect, useMemo, useState } from 'react'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import type { MealRecord } from './mealModel.ts'
import { createMealRecordRepository } from './mealSource.ts'

/**
 * 하루의 식단 기록 조회 상태.
 * - loading: 불러오는 중.
 * - unavailable: 저장소가 없다(운영 빌드·계정 없음)거나 이 브라우저에서 IndexedDB를 쓸 수 없다. "기록 없음"이나 오류가 아니다.
 * - error: 조회에 실패했다(reload로 다시 시도).
 * - ready: 조회 성공. records는 등록 순서이고, skippedCount는 읽을 수 없는 기록 수다(정상 기록은 숨기지 않는다).
 */
export type MealRecordsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      records: readonly MealRecord[]
      skippedCount: number
    }

type Settled = Exclude<MealRecordsState, { status: 'loading' }>

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Settled
}

/**
 * 이 계정의 해당 날짜 식단 기록을 읽는다(읽기 전용). 계정·날짜가 바뀌면 지난 값을 버리고 불러오는 중으로 돌아가므로
 * 이전 계정·날짜의 기록이 보이지 않는다. 기록을 바꾼 뒤에는 reload로 다시 읽는다.
 */
export function useMealRecords(
  userId: string | null,
  localDate: LocalDate,
): { state: MealRecordsState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createMealRecordRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${localDate}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.listByDate(localDate).then(
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
  }, [repository, localDate, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: MealRecordsState = !repository
    ? { status: 'unavailable' }
    : loaded && loaded.key === key
      ? loaded.state
      : { status: 'loading' }
  return { state, reload }
}
