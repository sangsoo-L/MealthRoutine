import { useCallback, useEffect, useMemo, useState } from 'react'
import { createMealGoalRepository } from './mealGoalSource.ts'
import {
  MealGoalError,
  type MealGoalState,
  type MealGoalSummary,
  type MealGoal,
} from './mealGoalTypes.ts'

type Settled = Exclude<MealGoalState, { status: 'loading' }>

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Settled
}

/** 목표를 요약으로 바꾼다(신체 수치·revision을 담지 않는다). */
export function summarizeMealGoal(goal: MealGoal): MealGoalSummary {
  return {
    kcal: goal.kcal,
    ratio: { ...goal.ratio },
    purpose: goal.purpose,
    source: goal.source,
    updatedAt: goal.updatedAt,
  }
}

/**
 * 이 회원의 식단 목표를 읽는다(읽기 전용). 신체 정보가 없어 PIN이 필요 없다.
 * - 계정이 바뀌면 지난 값을 버리고 불러오는 중으로 돌아가 이전 계정의 목표가 보이지 않는다.
 * - 조회 실패(error)와 저장 수단 없음(unavailable)은 "목표 없음"(ready + goal null)이 아니다.
 * - 목표를 저장한 뒤에는 reload로 다시 읽는다. 화면에 다시 들어오면 항상 새로 읽는다(마운트당 한 번 + reload).
 */
export function useMealGoal(userId: string | null): {
  state: MealGoalState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const repository = useMemo(
    () => (userId ? createMealGoalRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${attempt}`

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    repository.getGoal().then(
      (goal) => {
        if (!cancelled) setLoaded({ key, state: { status: 'ready', goal } })
      },
      (error: unknown) => {
        if (cancelled) return
        setLoaded({
          key,
          state: {
            status:
              error instanceof MealGoalError && error.code === 'unavailable'
                ? 'unavailable'
                : 'error',
          },
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [repository, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: MealGoalState = !userId
    ? { status: 'loading' }
    : !repository
      ? { status: 'unavailable' }
      : loaded && loaded.key === key
        ? loaded.state
        : { status: 'loading' }
  return { state, reload }
}
