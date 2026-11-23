import type { QuizQuestion } from './quizTypes.ts'

/**
 * 제공할 수 있는 문항만 고른다. 개발 환경은 미검증(verified: false) 문항도 기능 시험에 쓰고, 운영 환경은 검증된 문항만 쓴다.
 * 검증된 문항이 없으면 빈 배열이고 화면은 "준비 중"을 보인다.
 */
export function usableQuestions(
  all: readonly QuizQuestion[],
  isDev: boolean,
): QuizQuestion[] {
  return isDev ? [...all] : all.filter((q) => q.verified)
}

/**
 * 문항 은행을 퀴즈 화면에 들어올 때 불러온다(대량 데이터를 처음 번들에 넣지 않는다).
 * 지금은 모든 문항이 사람 검수 전이라 운영 빌드는 문항 모듈을 아예 포함하지 않고 빈 은행을 돌려준다
 * (import.meta.env.DEV는 빌드 때 상수로 바뀌어 아래 동적 import가 운영 번들에서 제거된다).
 * 사람 검수를 마친 문항이 생기면 그 문항만 담은 별도 모듈을 운영 분기에서 불러오도록 바꾼다.
 */
export async function loadQuizBank(): Promise<QuizQuestion[]> {
  if (!import.meta.env.DEV) return []
  const [exercise, meal] = await Promise.all([
    import('./data/exerciseQuestions.ts'),
    import('./data/mealQuestions.ts'),
  ])
  return usableQuestions(
    [...exercise.EXERCISE_QUESTIONS, ...meal.MEAL_QUESTIONS],
    true,
  )
}
