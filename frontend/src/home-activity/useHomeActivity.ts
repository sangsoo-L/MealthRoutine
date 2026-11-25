import { useMemo } from 'react'
import { recentRangeFrom } from '../exercise/dashboardRecords.ts'
import { useRecordsInRange } from '../exercise/useRecordsInRange.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import { useAllMealRecords } from '../food/useAllMealRecords.ts'
import {
  normalizeExerciseActivity,
  normalizeMealActivity,
  type DomainActivity,
  type Fact,
} from './homeActivity.ts'

export interface HomeActivityData {
  exercise: Fact<DomainActivity>
  meal: Fact<DomainActivity>
  reloadExercise: () => void
  reloadMeal: () => void
}

/**
 * 로그인 홈의 운동·식단 기록(이번 주 나의 활동·오늘의 기록·최근 활동이 함께 쓴다). 홈이 한 번만 읽어 아래 세 영역에 나눠 준다.
 * - 기존 조회 훅을 그대로 쓴다(저장소·스키마·저장 방식 변경 없음). 운동은 최근 1년(이번 주와 최근 3건을 모두 포함), 식단은 전체를 읽는다.
 * - 홈에 들어올 때마다 새로 읽고 폴링하지 않는다. 기록을 바꾼 뒤 홈에 다시 들어오면 최신 상태가 보인다.
 * - 계정 id로만 읽고, 계정이 바뀌면 지난 값은 버려져 읽는 중으로 돌아간다(이전 계정의 기록이 남지 않는다). 날짜가 바뀌면 다시 읽는다.
 * - 읽는 중·저장 수단 없음(저장소가 연결되지 않은 영역)·조회 실패는 서로 다른 상태이며 "기록 없음"이 아니다.
 */
export function useHomeActivity(
  userId: string,
  today: LocalDate,
): HomeActivityData {
  const exerciseRange = useRecordsInRange(userId, recentRangeFrom(today), today)
  const meals = useAllMealRecords(userId)
  const exercise = useMemo<Fact<DomainActivity>>(() => {
    const state = exerciseRange.state
    if (state.status !== 'ready') return { status: state.status }
    return {
      status: 'ready',
      value: normalizeExerciseActivity(
        state.records,
        state.skippedCount,
        today,
        userId,
      ),
    }
  }, [exerciseRange.state, today, userId])
  const meal = useMemo<Fact<DomainActivity>>(() => {
    const state = meals.state
    if (state.status !== 'ready') return { status: state.status }
    return {
      status: 'ready',
      value: normalizeMealActivity(
        state.records,
        state.skippedCount,
        today,
        userId,
      ),
    }
  }, [meals.state, today, userId])
  return {
    exercise,
    meal,
    reloadExercise: exerciseRange.reload,
    reloadMeal: meals.reload,
  }
}
