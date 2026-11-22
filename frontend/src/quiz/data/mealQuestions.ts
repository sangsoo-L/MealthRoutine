import { buildQuestions } from '../quizBuild.ts'
import {
  QUIZ_CATEGORIES,
  type QuizQuestion,
  type QuizRow,
} from '../quizTypes.ts'
import { ROWS as balance } from './meal/balance.ts'
import { ROWS as habit } from './meal/habit.ts'
import { ROWS as hygiene } from './meal/hygiene.ts'
import { ROWS as label } from './meal/label.ts'
import { ROWS as nutrients } from './meal/nutrients.ts'
import { ROWS as practice } from './meal/practice.ts'
import { ROWS as water } from './meal/water.ts'

const ROWS_BY_KEY: Record<string, readonly QuizRow[]> = {
  nutrients,
  balance,
  label,
  habit,
  water,
  hygiene,
  practice,
}

/** 식단 퀴즈 500문항(개발용 미검증 초안). 개발 서버에서만 불러온다. */
export const MEAL_QUESTIONS: readonly QuizQuestion[] = QUIZ_CATEGORIES.filter(
  (spec) => spec.domain === 'meal',
).flatMap((spec) => buildQuestions(spec, ROWS_BY_KEY[spec.key]))
