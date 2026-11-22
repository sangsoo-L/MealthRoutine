import { useMemo } from 'react'
import { useExerciseGoalSummary } from '../exercise-goal/useExerciseGoal.ts'
import { useRecordsInRange } from '../exercise/useRecordsInRange.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import { addDays } from '../food/mealHistory.ts'
import { useAllMealRecords } from '../food/useAllMealRecords.ts'
import {
  summarizeExerciseWeek,
  summarizeMealWeek,
  weekRangeFor,
  type ExerciseWeek,
  type MealWeek,
  type WeekRange,
} from './weeklyReport.ts'

/** 운동·식단 조회는 서로 독립이다. 한쪽이 실패해도 다른 쪽 집계는 그대로 보인다. */
export type PartState<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | ({ status: 'ready'; skippedCount: number } & T)

export type ExercisePart = PartState<{
  current: ExerciseWeek
  previous: ExerciseWeek
}>
export type MealPart = PartState<{ current: MealWeek; previous: MealWeek }>

/** 개인 운동 목표(W01-1)의 주당 횟수. 목표가 없거나 읽지 못하면 값이 없고 목표 대비 표시를 하지 않는다(점수 기준과는 별개다). */
export type GoalPart =
  | { status: 'ready'; daysPerWeek: number }
  | { status: 'none' | 'loading' | 'unavailable' | 'error' }

export interface WeeklyReportData {
  range: WeekRange
  exercise: ExercisePart
  meal: MealPart
  goal: GoalPart
  reloadExercise: () => void
  reloadMeal: () => void
}

/**
 * 선택한 주의 운동·식단 집계를 기존 저장소 조회 훅으로 읽는다(신규 저장소·쓰기 없음). 지난주 비교를 위해 직전 주까지 함께 읽는다.
 * 계정·주가 바뀌면 훅들이 지난 값을 버리고 불러오는 중으로 돌아간다.
 */
export function useWeeklyReport(
  userId: string | null,
  today: LocalDate,
  offset: number,
): WeeklyReportData {
  const range = useMemo(() => weekRangeFor(today, offset), [today, offset])
  const previousFrom = addDays(range.from, -7)
  const exerciseQuery = useRecordsInRange(userId, previousFrom, range.to)
  const mealQuery = useAllMealRecords(userId)
  const goalQuery = useExerciseGoalSummary(userId)

  const exercise = useMemo<ExercisePart>(() => {
    const state = exerciseQuery.state
    if (state.status !== 'ready') return { status: state.status }
    const previousRange = { from: previousFrom, to: addDays(range.from, -1) }
    return {
      status: 'ready',
      skippedCount: state.skippedCount,
      current: summarizeExerciseWeek(range, state.records),
      previous: summarizeExerciseWeek(previousRange, state.records),
    }
  }, [exerciseQuery.state, range, previousFrom])

  const meal = useMemo<MealPart>(() => {
    const state = mealQuery.state
    if (state.status !== 'ready') return { status: state.status }
    const previousRange = { from: previousFrom, to: addDays(range.from, -1) }
    return {
      status: 'ready',
      skippedCount: state.skippedCount,
      current: summarizeMealWeek(range, state.records),
      previous: summarizeMealWeek(previousRange, state.records),
    }
  }, [mealQuery.state, range, previousFrom])

  const goal: GoalPart = !goalQuery.available
    ? { status: 'unavailable' }
    : !goalQuery.loaded
      ? { status: 'loading' }
      : goalQuery.loaded.failed
        ? { status: 'error' }
        : goalQuery.loaded.value
          ? { status: 'ready', daysPerWeek: goalQuery.loaded.value.daysPerWeek }
          : { status: 'none' }

  return {
    range,
    exercise,
    meal,
    goal,
    reloadExercise: exerciseQuery.reload,
    reloadMeal: mealQuery.reload,
  }
}
