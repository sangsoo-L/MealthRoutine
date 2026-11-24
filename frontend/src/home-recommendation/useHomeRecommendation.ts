import { useEffect, useMemo, useState } from 'react'
import {
  summarizeExerciseActivity,
  summarizeMealActivity,
  selectHomeRecommendation,
  type ActivityCounts,
  type ExerciseGoalFact,
  type Fact,
} from '../components/home/homeRecommendationPolicy.ts'
import type { HomeRecommendation } from '../components/home/homeRecommendation.ts'
import { loadExerciseGoalContext } from '../exercise-goal/exerciseGoalContext.ts'
import { createExerciseGoalRepository } from '../exercise-goal/exerciseGoalSource.ts'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import {
  useRecordsInRange,
  type RecordsRangeState,
} from '../exercise/useRecordsInRange.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import {
  useAllMealRecords,
  type AllMealRecordsState,
} from '../food/useAllMealRecords.ts'

/** "기록이 아직 없는지"를 가리는 조회의 시작일. 이 날짜부터 오늘까지의 모든 완료 기록을 읽는다. */
const RECORDS_FROM: LocalDate = '2000-01-01'

function exerciseFact(
  state: RecordsRangeState,
  today: LocalDate,
  userId: string,
): Fact<ActivityCounts> {
  if (state.status !== 'ready') return { status: state.status }
  return {
    status: 'ready',
    value: summarizeExerciseActivity(
      state.records,
      state.skippedCount,
      today,
      userId,
    ),
  }
}

function mealFact(
  state: AllMealRecordsState,
  today: LocalDate,
  userId: string,
): Fact<ActivityCounts> {
  if (state.status !== 'ready') return { status: state.status }
  return {
    status: 'ready',
    value: summarizeMealActivity(
      state.records,
      state.skippedCount,
      today,
      userId,
    ),
  }
}

interface LoadedGoal {
  key: string
  fact: Fact<ExerciseGoalFact>
}

/**
 * 운동 목표가 있는지와 목표 화면을 열 수 있는지를 읽는다.
 * - PIN으로 보호하는 값은 읽지 않는다. 대시보드 요약(getSummary, 횟수·시간만 있고 신체 수치·목표 체중 없음)과
 *   목표 화면의 선행 조건(건강 목표·이해도 확인, loadExerciseGoalContext)만 읽는다. PIN 확인·열람 권한은 만들지 않는다.
 * - 저장 수단이 없으면(운영 빌드) unavailable이다. 조회 실패(error)와 저장 수단 없음(unavailable)은 "목표 없음"이 아니다.
 * - 계정이 바뀌면 지난 값을 버린다(키에 계정이 들어 있다). 홈에 들어올 때마다 새로 읽고 반복 조회하지 않는다.
 */
function useExerciseGoalFact(userId: string): Fact<ExerciseGoalFact> {
  const repository = useMemo(
    () => createExerciseGoalRepository(userId),
    [userId],
  )
  const [loaded, setLoaded] = useState<LoadedGoal | null>(null)
  const key = userId

  useEffect(() => {
    if (!repository) return
    let cancelled = false
    const settle = (fact: Fact<ExerciseGoalFact>) => {
      if (!cancelled) setLoaded({ key, fact })
    }
    async function read() {
      let summary
      try {
        summary = await repository!.getSummary()
      } catch (error) {
        settle({
          status:
            error instanceof ExerciseGoalError && error.code === 'unavailable'
              ? 'unavailable'
              : 'error',
        })
        return
      }
      if (summary) {
        settle({ status: 'ready', value: { set: true, settable: true } })
        return
      }
      // 목표가 없다. 목표 화면이 열리는지(건강 목표·이해도 확인이 있는지)까지 확인해야 설정을 권할 수 있다.
      try {
        const context = await loadExerciseGoalContext(userId)
        settle({
          status: 'ready',
          value: { set: false, settable: context !== null },
        })
      } catch (error) {
        // 선행 조건을 읽을 수 없으면(저장 수단·이해도 결과 없음) 화면을 쓸 수 있다고 보지 않는다. 그 밖의 실패는 확인 불가다.
        settle(
          error instanceof ExerciseGoalError && error.code === 'unavailable'
            ? { status: 'ready', value: { set: false, settable: false } }
            : { status: 'error' },
        )
      }
    }
    void read()
    return () => {
      cancelled = true
    }
  }, [repository, userId, key])

  if (!repository) return { status: 'unavailable' }
  return loaded && loaded.key === key ? loaded.fact : { status: 'loading' }
}

/**
 * 회원 홈 "오늘의 추천"에 쓸 추천 하나. 이 계정의 운동 기록·식단 기록·운동 목표를 읽고 규칙(selectHomeRecommendation)으로 고른다.
 * - 기존 조회 훅을 재사용한다(기록 저장 방식·스키마를 바꾸지 않는다). 홈에 들어올 때 한 번 읽고 폴링하지 않는다. 기록·목표를 바꾼 뒤 홈에 다시 들어오면 새로 읽는다.
 * - 계정 id로만 읽으며 계정이 바뀌면 이전 계정의 값은 버려진다(읽는 중에는 기본 추천).
 * - 읽는 중·저장 수단 없음(운영 빌드의 식단 기록·목표 등)·조회 실패는 "기록 없음"이 아니다. 확인되지 않은 사실로는 개인화하지 않아 기본 추천이 된다.
 */
export function useHomeRecommendation(
  userId: string,
  today: LocalDate,
): HomeRecommendation {
  const exercise = useRecordsInRange(userId, RECORDS_FROM, today).state
  const meals = useAllMealRecords(userId).state
  const exerciseGoal = useExerciseGoalFact(userId)
  return useMemo(
    () =>
      selectHomeRecommendation({
        today,
        exercise: exerciseFact(exercise, today, userId),
        meal: mealFact(meals, today, userId),
        exerciseGoal,
      }),
    [today, userId, exercise, meals, exerciseGoal],
  )
}
