import { useCallback, useEffect, useMemo, useState } from 'react'
import { doneSessionByList } from './dashboardRecords.ts'
import type {
  DashboardSlot,
  RecentRecordsView,
} from './exerciseDashboardTypes.ts'
import { completedRangeFrom, completedRecordsSlotFrom } from './myExercise.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import { createWorkoutRecordRepository } from './workoutSource.ts'
import type { LocalDate } from './workoutTypes.ts'

const NO_DONE: ReadonlyMap<string, string> = new Map()

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  slot: DashboardSlot<RecentRecordsView>
  done: ReadonlyMap<string, string>
}

/**
 * W10 "완료한 운동 기록"의 데이터와 오늘 완료한 목록의 W15 읽기 전용 링크 대상.
 *
 * - 저장된 완료 기록(WorkoutRecord)만 읽는다. 진행 중인 세션과 저장 전 결과는 기록이 아니라 들어오지 않는다.
 * - 최근 1년(오늘 포함)을 한 번 조회하고, 표시 건수는 화면이 나눈다(20건씩 더 보기).
 * - 저장소가 없으면(계정 없음) unavailable(준비 중). 조회 중 loading, 실패 error(reload로 다시 시도). 실패했을 때 가짜 값으로 채우지 않는다.
 * - 계정·날짜가 바뀌면 지난 값을 버리고 다시 조회한다. 저장소는 계정 id로만 만들고, 다른 계정의 기록은 순수 함수가 한 번 더 걸러 낸다.
 */
export function useCompletedRecords(
  userId: string | null,
  today: LocalDate,
): {
  slot: DashboardSlot<RecentRecordsView>
  doneSessionByList: ReadonlyMap<string, string>
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createWorkoutRecordRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${today}#${attempt}`

  useEffect(() => {
    if (!repository || !userId) return
    let cancelled = false
    repository.listByDateRange(completedRangeFrom(today), today).then(
      (result) => {
        if (cancelled) return
        setLoaded({
          key,
          slot: completedRecordsSlotFrom(result, today, userId),
          done: doneSessionByList(result, today, userId),
        })
      },
      (error: unknown) => {
        if (cancelled) return
        // 이 브라우저가 IndexedDB를 쓸 수 없으면 오류가 아니라 "저장 수단 없음"이다(재시도해도 같다).
        const unavailable =
          isWorkoutStoreError(error) && error.reason === 'unavailable'
        setLoaded({
          key,
          slot: { status: unavailable ? 'unavailable' : 'error' },
          done: NO_DONE,
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, userId, today, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  if (!repository) {
    return {
      slot: { status: 'unavailable' },
      doneSessionByList: NO_DONE,
      reload,
    }
  }
  if (loaded && loaded.key === key) {
    return { slot: loaded.slot, doneSessionByList: loaded.done, reload }
  }
  return { slot: { status: 'loading' }, doneSessionByList: NO_DONE, reload }
}
