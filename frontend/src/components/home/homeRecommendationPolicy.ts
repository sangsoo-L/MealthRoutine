import { dashboardWeek } from '../../exercise/dashboardSelectors.ts'
import { isLocalDate } from '../../exercise/workoutModel.ts'
import type { LocalDate, WorkoutRecord } from '../../exercise/workoutTypes.ts'
import type { MealRecord } from '../../food/mealModel.ts'
import {
  DEFAULT_RECOMMENDATION,
  FIRST_EXERCISE_RECOMMENDATION,
  RECORD_EXERCISE_RECOMMENDATION,
  RECORD_MEAL_RECOMMENDATION,
  SET_GOAL_RECOMMENDATION,
  weeklyReviewRecommendation,
  type HomeRecommendation,
  type HomeRecommendationId,
} from './homeRecommendation.ts'

/**
 * 회원 홈 "오늘의 추천"을 고르는 규칙(순수 함수). 조회·표시와 분리되어 있어 같은 입력이면 항상 같은 결과다(무작위·시각 의존 없음).
 *
 * 입력은 "사실"(Fact)이다. 각 사실은 읽는 중(loading)·저장 수단 없음(unavailable, 운영 빌드·API 연결 전)·조회 실패(error)·읽음(ready) 중 하나이며,
 * **읽지 못한 사실은 "기록 없음"으로 쓰지 않는다.** 규칙은 읽은 값(ready)으로 확인된 상태에만 반응하고, 아무 규칙도 맞지 않으면 기본 추천이다.
 * 읽을 수 없는 기록(손상 행·다른 계정의 기록)이 있으면 "오늘 기록 없음"을 확인할 수 없으므로 그 사실로는 기록 안내를 하지 않는다.
 *
 * 우선순위(HOME_RECOMMENDATION_PRIORITY, 위가 먼저):
 * 0. (이 규칙 밖) 키·몸무게 입력 카드·몸무게 확인 카드가 있으면 그것이 추천 자리를 차지한다(MemberHomePage, 필수 초기 설정).
 * 1. A 첫 운동: 운동 기록이 없다고 확인되고 식단 기록은 있다고 확인되지 않음 → 운동 찾기
 * 2. B 식단 기록: 오늘 식단 기록이 없다고 확인됨 → 식단 기록
 * 3. C 운동 기록: 오늘 운동 기록이 없다고 확인됨 → 운동 기록
 * 4. D 목표 설정: 운동 목표가 없다고 확인되고 목표 화면을 열 수 있음 → 운동 목표 설정(식단 목표는 저장 기능이 없어 추천하지 않음)
 * 5. E 주간 활동: 이번 주(월~일) 운동 또는 식단 기록이 있음 → 주간 리포트
 * 6. F 기본: 위가 모두 아님 → 운동 찾기
 * 목표 설정은 선택 사항이라 오늘의 기록 안내보다 뒤에 둔다(강요하지 않는다).
 *
 * PIN으로 보호하는 신체 정보·목표 값은 이 규칙의 입력이 아니다. 목표는 "있는지/없는지"만 받는다.
 */

export type Fact<T> =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; value: T }

/** 한 영역(운동 또는 식단)의 기록 요약. 날짜는 기기 로컬 날짜 기준이다. */
export interface ActivityCounts {
  /** 읽은 기록 전체 수 */
  total: number
  /** 오늘 날짜의 기록 수 */
  today: number
  /** 이번 주(월~일)의 기록 수 */
  week: number
  /** 읽을 수 없는 기록 수(손상·다른 계정). 0이 아니면 "없음"을 확인할 수 없다 */
  unreadable: number
}

/** 운동 목표 사실. set: 목표가 저장되어 있음. settable: 목표 화면의 선행 조건(건강 목표·이해도 확인)이 있어 화면을 쓸 수 있음. */
export interface ExerciseGoalFact {
  set: boolean
  settable: boolean
}

export interface HomeRecommendationInput {
  today: LocalDate
  exercise: Fact<ActivityCounts>
  meal: Fact<ActivityCounts>
  exerciseGoal: Fact<ExerciseGoalFact>
}

interface DatedEntry {
  ownerId: unknown
  date: unknown
}

/**
 * 기록 목록을 요약한다. 다른 계정의 기록·날짜를 읽을 수 없는 기록은 세지 않고 `unreadable`에 더한다(다른 계정의 상태를 추천에 쓰지 않는다).
 */
function summarize(
  entries: readonly DatedEntry[],
  skippedCount: number,
  today: LocalDate,
  ownerId: string,
): ActivityCounts {
  const week = isLocalDate(today) ? dashboardWeek(today) : null
  let total = 0
  let todayCount = 0
  let weekCount = 0
  let unreadable =
    Number.isFinite(skippedCount) && skippedCount > 0 ? skippedCount : 0
  for (const entry of entries) {
    if (entry.ownerId !== ownerId || !isLocalDate(entry.date)) {
      unreadable += 1
      continue
    }
    total += 1
    if (entry.date === today) todayCount += 1
    if (week && entry.date >= week.from && entry.date <= week.to) weekCount += 1
  }
  return { total, today: todayCount, week: weekCount, unreadable }
}

export function summarizeExerciseActivity(
  records: readonly WorkoutRecord[],
  skippedCount: number,
  today: LocalDate,
  ownerId: string,
): ActivityCounts {
  return summarize(
    records.map((r) => ({ ownerId: r?.ownerId, date: r?.performedDate })),
    skippedCount,
    today,
    ownerId,
  )
}

export function summarizeMealActivity(
  records: readonly MealRecord[],
  skippedCount: number,
  today: LocalDate,
  ownerId: string,
): ActivityCounts {
  return summarize(
    records.map((r) => ({ ownerId: r?.ownerId, date: r?.localDate })),
    skippedCount,
    today,
    ownerId,
  )
}

function validCounts(value: unknown): value is ActivityCounts {
  if (typeof value !== 'object' || value === null) return false
  const counts = value as Record<string, unknown>
  return ['total', 'today', 'week', 'unreadable'].every((key) => {
    const n = counts[key]
    return typeof n === 'number' && Number.isInteger(n) && n >= 0
  })
}

/** 읽은 값이 올바를 때만 요약을 돌려준다. 읽지 못했거나 값이 이상하면 null(= 확인할 수 없음). */
function counts(fact: Fact<ActivityCounts>): ActivityCounts | null {
  return fact.status === 'ready' && validCounts(fact.value) ? fact.value : null
}

/** 기록이 하나도 없다고 확인됨(읽을 수 없는 기록도 없음). */
function confirmedNone(fact: Fact<ActivityCounts>): boolean {
  const c = counts(fact)
  return c !== null && c.total === 0 && c.unreadable === 0
}

/** 기록이 있다고 확인됨. */
function confirmedSome(fact: Fact<ActivityCounts>): boolean {
  const c = counts(fact)
  return c !== null && c.total > 0
}

/** 오늘 기록이 없다고 확인됨(읽을 수 없는 기록이 있으면 확인할 수 없다). */
function confirmedNoneToday(fact: Fact<ActivityCounts>): boolean {
  const c = counts(fact)
  return c !== null && c.today === 0 && c.unreadable === 0
}

interface Rule {
  id: HomeRecommendationId
  /** 조건이 맞으면 추천을, 아니면 null을 돌려준다 */
  evaluate(input: HomeRecommendationInput): HomeRecommendation | null
}

/** 추천 우선순위. 앞의 규칙이 먼저 맞으면 뒤의 규칙은 보지 않는다. 순서를 바꾸려면 이 배열만 바꾼다. */
export const HOME_RECOMMENDATION_PRIORITY: readonly Rule[] = [
  {
    id: 'first-exercise',
    evaluate: (input) =>
      confirmedNone(input.exercise) && !confirmedSome(input.meal)
        ? FIRST_EXERCISE_RECOMMENDATION
        : null,
  },
  {
    id: 'record-meal',
    evaluate: (input) =>
      confirmedNoneToday(input.meal) ? RECORD_MEAL_RECOMMENDATION : null,
  },
  {
    id: 'record-exercise',
    evaluate: (input) =>
      confirmedNoneToday(input.exercise)
        ? RECORD_EXERCISE_RECOMMENDATION
        : null,
  },
  {
    id: 'set-exercise-goal',
    evaluate: ({ exerciseGoal }) =>
      exerciseGoal.status === 'ready' &&
      exerciseGoal.value.set === false &&
      exerciseGoal.value.settable === true
        ? SET_GOAL_RECOMMENDATION
        : null,
  },
  {
    id: 'weekly-review',
    evaluate: (input) => {
      const exercise = (counts(input.exercise)?.week ?? 0) > 0
      const meal = (counts(input.meal)?.week ?? 0) > 0
      return exercise || meal
        ? weeklyReviewRecommendation({ exercise, meal })
        : null
    },
  },
]

/**
 * 지금 보여 줄 추천 하나를 고른다. 같은 입력이면 같은 결과이고, 맞는 규칙이 없거나 입력이 이상하면 기본 추천이다.
 */
export function selectHomeRecommendation(
  input: HomeRecommendationInput,
): HomeRecommendation {
  if (typeof input !== 'object' || input === null || !isLocalDate(input.today))
    return DEFAULT_RECOMMENDATION
  try {
    for (const rule of HOME_RECOMMENDATION_PRIORITY) {
      const recommendation = rule.evaluate(input)
      if (recommendation) return recommendation
    }
  } catch {
    // 모양이 올바르지 않은 입력(사실이 빠진 경우 등)은 개인화 판단을 하지 않고 기본 추천으로 돌아간다.
  }
  return DEFAULT_RECOMMENDATION
}
