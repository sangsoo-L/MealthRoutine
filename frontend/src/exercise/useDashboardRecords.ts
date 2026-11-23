import { useCallback, useEffect, useMemo, useState } from 'react'
import { dashboardWeek } from './dashboardSelectors.ts'
import {
  doneSessionByList,
  recentRangeFrom,
  recentSlotFrom,
  weeklySlotFrom,
  type RecordQueryResult,
} from './dashboardRecords.ts'
import type {
  DashboardSlot,
  RecentRecordsView,
  WeeklyExerciseView,
} from './exerciseDashboardTypes.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import { createWorkoutRecordRepository } from './workoutSource.ts'
import type { LocalDate } from './workoutTypes.ts'

const NO_DONE: ReadonlyMap<string, string> = new Map()

interface Settled {
  weekly: DashboardSlot<WeeklyExerciseView>
  recent: DashboardSlot<RecentRecordsView>
  /** 오늘 완료한 기록의 "목록 id → 세션 id". 이번 주 조회가 실패하면 비어 있다(링크를 만들지 않는다). */
  done: ReadonlyMap<string, string>
}

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  settled: Settled
}

function failureSlot(error: unknown): { status: 'unavailable' | 'error' } {
  // 이 브라우저가 IndexedDB를 쓸 수 없으면 오류가 아니라 "저장 수단 없음"이다(재시도해도 같다).
  return {
    status:
      isWorkoutStoreError(error) && error.reason === 'unavailable'
        ? 'unavailable'
        : 'error',
  }
}

/**
 * W01 "이번 주 운동"·"최근 운동 기록"의 데이터와 오늘 완료 기록의 상세 링크 대상.
 *
 * - 저장된 완료 기록(WorkoutRecord)만 읽는다. 진행 중인 세션과 저장 전 결과는 기록이 아니라 들어오지 않는다.
 * - 이번 주(월~일)와 최근 1년을 따로 조회해 영역마다 독립적으로 성공·실패한다(읽을 수 없는 기록 수도 범위별로 센다).
 * - 저장소가 없으면(운영 빌드·계정 없음) unavailable(준비 중). 조회 중 loading, 실패 error(reload로 다시 시도). 실패했을 때 예시 값으로 채우지 않는다.
 * - 계정·날짜가 바뀌면 지난 값을 버리고 다시 조회한다. 저장소는 계정 id로만 만들고, 다른 계정의 기록은 순수 함수가 한 번 더 걸러 낸다.
 * - enabled가 false이면(개발용 예시를 쓰는 중) 조회하지 않는다. 예시와 실제 기록을 섞지 않는다.
 */
export function useDashboardRecords(
  userId: string | null,
  today: LocalDate,
  enabled: boolean,
): {
  weekly: DashboardSlot<WeeklyExerciseView>
  recent: DashboardSlot<RecentRecordsView>
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
    if (!enabled || !repository || !userId) return
    let cancelled = false
    const week = dashboardWeek(today)
    Promise.allSettled([
      repository.listByDateRange(week.from, week.to),
      repository.listByDateRange(recentRangeFrom(today), today),
    ]).then(([weekResult, yearResult]) => {
      if (cancelled) return
      const apply = <T>(
        result: PromiseSettledResult<RecordQueryResult>,
        make: (value: RecordQueryResult) => DashboardSlot<T>,
      ): DashboardSlot<T> =>
        result.status === 'fulfilled'
          ? make(result.value)
          : failureSlot(result.reason)
      setLoaded({
        key,
        settled: {
          weekly: apply(weekResult, (value) =>
            weeklySlotFrom(value, today, userId),
          ),
          recent: apply(yearResult, (value) =>
            recentSlotFrom(value, today, userId),
          ),
          done:
            weekResult.status === 'fulfilled'
              ? doneSessionByList(weekResult.value, today, userId)
              : NO_DONE,
        },
      })
    })
    return () => {
      cancelled = true
    }
  }, [enabled, repository, userId, today, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  if (!repository || !enabled) {
    return {
      weekly: { status: 'unavailable' },
      recent: { status: 'unavailable' },
      doneSessionByList: NO_DONE,
      reload,
    }
  }
  if (loaded && loaded.key === key) {
    return {
      weekly: loaded.settled.weekly,
      recent: loaded.settled.recent,
      doneSessionByList: loaded.settled.done,
      reload,
    }
  }
  return {
    weekly: { status: 'loading' },
    recent: { status: 'loading' },
    doneSessionByList: NO_DONE,
    reload,
  }
}
