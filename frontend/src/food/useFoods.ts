import { useCallback, useEffect, useState } from 'react'
import { createFoodRepository } from './foodSource.ts'
import type { Food } from './foodTypes.ts'

/**
 * 음식 목록 조회 상태.
 * - loading: 불러오는 중. unavailable: 음식 데이터 소스가 연결되지 않았다(운영 빌드 등). "음식 없음"이나 오류가 아니다. error: 조회 실패(reload로 다시 시도).
 * - ready: 조회 성공. 개발 서버에서는 개발용 예시 4개다.
 */
export type FoodsState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; foods: readonly Food[] }

export type FoodState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'notFound' }
  | { status: 'ready'; food: Food }

interface Loaded<T> {
  /** 몇 번째 조회의 결과인지. 현재 조회와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: T
}

/** 음식 전체 목록(D02의 검색·즐겨찾기 탭이 같은 목록을 쓴다). 마운트당 한 번 조회하고 reload로만 다시 부른다. */
export function useFoods(): { state: FoodsState; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<
    Exclude<FoodsState, { status: 'loading' }>
  > | null>(null)
  const key = String(attempt)

  useEffect(() => {
    let cancelled = false
    const repository = createFoodRepository()
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository.list().then(
      (foods) => {
        if (!cancelled) setLoaded({ key, state: { status: 'ready', foods } })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: FoodsState =
    loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, reload }
}

/** F02용 음식 한 건. 없는 음식은 notFound다(없는 음식을 만들지 않는다). */
export function useFood(foodId: string): {
  state: FoodState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded<
    Exclude<FoodState, { status: 'loading' }>
  > | null>(null)
  const key = `${foodId}#${attempt}`

  useEffect(() => {
    let cancelled = false
    const repository = createFoodRepository()
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository.getById(foodId).then(
      (food) => {
        if (!cancelled) {
          setLoaded({
            key,
            state: food ? { status: 'ready', food } : { status: 'notFound' },
          })
        }
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [foodId, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: FoodState =
    loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, reload }
}
