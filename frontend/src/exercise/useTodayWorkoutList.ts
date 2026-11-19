import { useCallback, useEffect, useMemo, useState } from 'react'
import type {
  DashboardSlot,
  TodayExerciseView,
} from './exerciseDashboardTypes.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import { todaySlotFromLists } from './workoutListView.ts'
import { createWorkoutListRepository } from './workoutSource.ts'
import type { LocalDate } from './workoutTypes.ts'

type Settled = DashboardSlot<TodayExerciseView>

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  slot: Settled
}

/**
 * W01 "오늘의 운동"의 데이터. 오늘 날짜(기기 로컬)에 저장한 목록을 IndexedDB에서 조회해 가장 최근 저장본을 보여 준다.
 *
 * - 저장소가 없으면(운영 빌드·계정 없음) unavailable. 기록 없음(empty)이나 오류와 다르다.
 * - 조회 중 loading, 실패 error(reload로 다시 시도), 이 브라우저가 IndexedDB를 쓸 수 없으면 unavailable, 오늘 목록이 없으면 empty.
 * - 계정·날짜가 바뀌면 지난 값을 버리고 다시 조회한다(날짜가 바뀌면 어제 목록은 오늘의 운동에서 빠진다).
 * - enabled가 false이면(개발용 예시를 쓰는 중) 조회하지 않는다.
 */
export function useTodayWorkoutList(
  userId: string | null,
  today: LocalDate,
  enabled: boolean,
): { slot: DashboardSlot<TodayExerciseView>; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createWorkoutListRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${today}#${attempt}`

  useEffect(() => {
    if (!enabled || !repository) return
    let cancelled = false
    repository.listByDate(today).then(
      (result) => {
        if (!cancelled)
          setLoaded({ key, slot: todaySlotFromLists(result, today) })
      },
      (error: unknown) => {
        if (cancelled) return
        // 이 브라우저가 IndexedDB를 쓸 수 없으면 오류가 아니라 "저장 수단 없음"이다(재시도해도 같다).
        const unavailable =
          isWorkoutStoreError(error) && error.reason === 'unavailable'
        setLoaded({
          key,
          slot: { status: unavailable ? 'unavailable' : 'error' },
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, repository, today, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const slot: Settled =
    !repository || !enabled
      ? { status: 'unavailable' }
      : loaded && loaded.key === key
        ? loaded.slot
        : { status: 'loading' }
  return { slot, reload }
}
