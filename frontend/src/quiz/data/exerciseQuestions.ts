import { buildQuestions } from '../quizBuild.ts'
import {
  QUIZ_CATEGORIES,
  type QuizQuestion,
  type QuizRow,
} from '../quizTypes.ts'
import { ROWS as basics } from './exercise/basics.ts'
import { ROWS as body } from './exercise/body.ts'
import { ROWS as form } from './exercise/form.ts'
import { ROWS as intensity } from './exercise/intensity.ts'
import { ROWS as recovery } from './exercise/recovery.ts'
import { ROWS as safety } from './exercise/safety.ts'
import { ROWS as warmup } from './exercise/warmup.ts'

const ROWS_BY_KEY: Record<string, readonly QuizRow[]> = {
  basics,
  warmup,
  form,
  intensity,
  body,
  recovery,
  safety,
}

/** 운동 퀴즈 500문항(개발용 미검증 초안). 개발 서버에서만 불러온다. */
export const EXERCISE_QUESTIONS: readonly QuizQuestion[] =
  QUIZ_CATEGORIES.filter((spec) => spec.domain === 'exercise').flatMap((spec) =>
    buildQuestions(spec, ROWS_BY_KEY[spec.key]),
  )
