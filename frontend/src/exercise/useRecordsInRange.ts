import { useCallback, useEffect, useMemo, useState } from 'react'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import { createWorkoutRecordRepository } from './workoutSource.ts'
import type { LocalDate, WorkoutRecord } from './workoutTypes.ts'

/**
 * 운동 기록 통계가 읽는 완료 기록의 조회 상태.
 * - loading: 불러오는 중. unavailable: 저장소가 없거나 이 브라우저에서 쓸 수 없다("기록 없음"이 아니다). error: 조회 실패(reload로 다시 시도).
 * - ready: 조회 성공. skippedCount는 읽을 수 없는 기록 수이며 정상 기록은 숨기지 않는다.
 */
export type RecordsRangeState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      records: readonly WorkoutRecord[]
      skippedCount: number
    }

type Settled = Exclude<RecordsRangeState, { status: 'loading' }>

interface Loaded {
  /** 어떤 계정·기간·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Settled
}

/**
 * 실제 수행 날짜가 from~to(포함)인 이 계정의 완료 기록을 읽는다(읽기 전용, 저장된 완료 기록만).
 * 계정·기간이 바뀌면 지난 값을 버리고 불러오는 중으로 돌아가므로 이전 계정·기간의 값이 보이지 않는다.
 */
export function useRecordsInRange(
  userId: string | null,
  from: LocalDate,
  to: LocalDate,
): { state: RecordsRangeState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createWorkoutRecordRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${from}#${to}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.listByDateRange(from, to).then(
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
  }, [repository, from, to, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: RecordsRangeState = !repository
    ? { status: 'unavailable' }
    : loaded && loaded.key === key
      ? loaded.state
      : { status: 'loading' }
  return { state, reload }
}
