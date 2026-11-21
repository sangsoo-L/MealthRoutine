/**
 * I05-1 주간 기록 점수. 계산식은 화면명세 v5.0 I05-1의 data 원문 그대로다(AI 미사용·무료).
 *
 *   점수 = 운동 min(기록 수, 3) / 3 × 50 + 식단 min(기록 수, 21) / 21 × 50   (반올림)
 *   등급: 90↑ 아주 꾸준해요 · 70↑ 잘하고 있어요 · 40↑ 조금만 더 힘내요 · 그 외 다시 시작해요
 *   제안은 낮은 쪽 점수 기준이다.
 *
 * 명세에 없는 규칙은 더하지 않았다. 해석한 점(확정 필요):
 * - 총점은 두 항의 합을 한 번에 반올림한다(명세의 "(반올림)"은 식 전체에 붙어 있다). 구성 점수(N/50)는 각각 반올림해 보여 주므로
 *   드물게 구성 점수의 합과 총점이 1점 다를 수 있다.
 * - 운동 기록 수 = 완료한 운동 기록(세션) 1건당 1회, 식단 기록 수 = 같은 날짜·같은 끼니는 1끼(사용자 확정).
 * - 개인 운동 목표(W01-1 daysPerWeek)는 이 점수에 쓰지 않는다. 점수 기준은 위 고정값(3회·21끼)이다.
 */
export const SCORE_RULE = {
  exerciseTarget: 3,
  mealTarget: 21,
  exerciseMax: 50,
  mealMax: 50,
} as const

/** 구성 점수의 표시용 글자: 소수 첫째 자리까지(끝의 0은 지운다). 총점을 이 값으로 다시 계산하지 않는다. */
export function formatPoints(raw: number): string {
  return String(Number(raw.toFixed(1)))
}

export type ScoreGrade =
  '아주 꾸준해요' | '잘하고 있어요' | '조금만 더 힘내요' | '다시 시작해요'

export interface WeeklyScore {
  /** 점수에 반영한 기록 수(상한 적용 후) */
  exerciseCounted: number
  mealCounted: number
  /** 구성 점수(0~50, 반올림) */
  exercisePoints: number
  mealPoints: number
  /** 반올림 전 원점수(0~50). 총점은 이 둘의 합을 한 번 반올림한 값이고, 화면은 소수 첫째 자리로 보여 준다. */
  exerciseRaw: number
  mealRaw: number
  /** 총점(0~100, 합을 한 번 반올림) */
  total: number
  grade: ScoreGrade
  exerciseFull: boolean
  mealFull: boolean
}

function toCount(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

/** 점수 등급. 경계(90·70·40)는 이상이다. */
export function gradeOf(total: number): ScoreGrade {
  if (total >= 90) return '아주 꾸준해요'
  if (total >= 70) return '잘하고 있어요'
  if (total >= 40) return '조금만 더 힘내요'
  return '다시 시작해요'
}

/** 운동 기록 수와 식단 기록 끼니 수로 점수를 계산한다(상한 적용, 음수·소수·NaN은 0 이상의 정수로 본다). */
export function computeWeeklyScore(
  exerciseCount: number,
  mealSlotCount: number,
): WeeklyScore {
  const { exerciseTarget, mealTarget, exerciseMax, mealMax } = SCORE_RULE
  const exerciseCounted = Math.min(toCount(exerciseCount), exerciseTarget)
  const mealCounted = Math.min(toCount(mealSlotCount), mealTarget)
  const exerciseRaw = (exerciseCounted / exerciseTarget) * exerciseMax
  const mealRaw = (mealCounted / mealTarget) * mealMax
  const total = Math.round(exerciseRaw + mealRaw)
  return {
    exerciseCounted,
    mealCounted,
    exerciseRaw,
    mealRaw,
    exercisePoints: Math.round(exerciseRaw),
    mealPoints: Math.round(mealRaw),
    total,
    grade: gradeOf(total),
    exerciseFull: exerciseCounted === exerciseTarget,
    mealFull: mealCounted === mealTarget,
  }
}

export const SUGGESTION = {
  exercise: '다음 주에는 짧은 운동부터 기록해 보세요.',
  meal: '다음 주에는 하루 한 끼부터 기록해 보세요.',
  both: '다음 주에는 운동과 식단을 하나씩 기록하는 것부터 시작해 보세요.',
  keep: '이번 주 기록을 잘 이어왔어요. 다음 주에도 꾸준히 기록해 보세요.',
} as const

/**
 * 다음 주 제안 한 가지(낮은 쪽 점수 기준). 두 점수를 분수 그대로 비교해 반올림 오차가 없게 한다.
 * - 운동 점수가 더 낮음 → 운동 문구, 식단 점수가 더 낮음 → 식단 문구
 * - 같은 점수인데 만점이 아님 → 둘 다 문구, 양쪽 만점 → 이어가기 문구
 */
export function suggestionFor(score: WeeklyScore): string {
  const { exerciseTarget, mealTarget } = SCORE_RULE
  // exercise/target 과 meal/target 의 크기 비교를 교차 곱으로 한다.
  const exercise = score.exerciseCounted * mealTarget
  const meal = score.mealCounted * exerciseTarget
  if (exercise < meal) return SUGGESTION.exercise
  if (meal < exercise) return SUGGESTION.meal
  return score.exerciseFull && score.mealFull
    ? SUGGESTION.keep
    : SUGGESTION.both
}
