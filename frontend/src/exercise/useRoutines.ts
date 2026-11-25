import { useCallback, useEffect, useMemo, useState } from 'react'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import type { WorkoutRoutine } from './workoutRoutineModel.ts'
import { createWorkoutRoutineRepository } from './workoutSource.ts'

/**
 * 루틴 조회 상태.
 * - loading: 불러오는 중.
 * - unavailable: 저장소가 없다(계정 없음)거나 개발 서버에서 이 브라우저의 IndexedDB를 쓸 수 없다. "루틴 없음"이나 오류가 아니다.
 * - error: 조회에 실패했다(reload로 다시 시도).
 * - ready: 조회 성공. 목록(items)은 최근 수정 순이고, skippedCount는 읽을 수 없는 루틴 수다(정상 루틴은 숨기지 않는다).
 */
export type RoutinesState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'ready'
      items: readonly WorkoutRoutine[]
      skippedCount: number
    }

export type RoutineState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  /** 없는 루틴(다른 계정의 루틴 포함). 존재 여부를 구분하지 않는다. */
  | { status: 'notFound' }
  | { status: 'ready'; routine: WorkoutRoutine }

type Settled<T> = Exclude<T, { status: 'loading' }>

interface Loaded<T> {
  /** 어떤 계정·대상·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Settled<T>
}

function failureState(error: unknown): { status: 'unavailable' | 'error' } {
  return {
    status:
      isWorkoutStoreError(error) && error.reason === 'unavailable'
        ? 'unavailable'
        : 'error',
  }
}

/**
 * W06 내 운동 루틴의 목록. 이 계정의 루틴만 읽는다(저장소가 계정 id로 만들어진다). 읽기 전용이다.
 * 계정이 바뀌면 지난 값을 버리고 불러오는 중으로 돌아간다(이전 계정의 목록이 한 번도 보이지 않는다).
 */
export function useRoutines(userId: string | null): {
  state: RoutinesState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<RoutinesState> | null>(null)
  const repository = useMemo(
    () => (userId ? createWorkoutRoutineRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.list().then(
      (result) => {
        if (cancelled) return
        setLoaded({
          key,
          state: {
            status: 'ready',
            items: result.items,
            skippedCount: result.skippedCount,
          },
        })
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ key, state: failureState(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: RoutinesState = !repository
    ? { status: 'unavailable' }
    : loaded && loaded.key === key
      ? loaded.state
      : { status: 'loading' }
  return { state, reload }
}

/** W07·W08(수정)의 루틴 한 건. 없는 루틴과 다른 계정의 루틴은 모두 notFound다. */
export function useRoutine(
  userId: string | null,
  routineId: string,
): { state: RoutineState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<RoutineState> | null>(null)
  const repository = useMemo(
    () => (userId ? createWorkoutRoutineRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${routineId}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.get(routineId).then(
      (routine) => {
        if (cancelled) return
        setLoaded({
          key,
          state: routine
            ? { status: 'ready', routine }
            : { status: 'notFound' },
        })
      },
      (error: unknown) => {
        if (!cancelled) setLoaded({ key, state: failureState(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, routineId, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: RoutineState = !repository
    ? { status: 'unavailable' }
    : loaded && loaded.key === key
      ? loaded.state
      : { status: 'loading' }
  return { state, reload }
}
