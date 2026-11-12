import {
  ALLERGY_MAX_LENGTH,
  QUESTION_COUNT,
  SURVEY_QUESTIONS,
  type SurveyAnswers,
} from '../../pages/surveyQuestions.ts'
import type { SurveyDraft, SurveyResult } from '../signupExperienceTypes.ts'

/**
 * [개발 전용] 설문 임시 데이터의 검증. 저장소에서 읽은 값은 외부 입력으로 보고, 현재 설문 정의(질문·선택지)와 맞는 것만 받아들인다.
 * React에 의존하지 않는 순수 함수다. 알 수 없는 질문 키·선택값, 범위 밖 단계, 긴 입력은 값 전체를 버린다.
 */

function sanitizeAnswers(raw: unknown): SurveyAnswers | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const answers: SurveyAnswers = {}
  for (const [key, value] of Object.entries(raw)) {
    const question = SURVEY_QUESTIONS.find((q) => q.key === key)
    if (
      !question ||
      typeof value !== 'string' ||
      !question.choices.some((choice) => choice.value === value)
    ) {
      return null
    }
    answers[question.key] = value
  }
  return answers
}

function sanitizeAllergyText(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > ALLERGY_MAX_LENGTH) return null
  return raw
}

export function sanitizeSurveyDraft(raw: unknown): SurveyDraft | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.v !== 1) return null
  if (
    typeof value.step !== 'number' ||
    !Number.isInteger(value.step) ||
    value.step < 0 ||
    value.step > QUESTION_COUNT
  ) {
    return null
  }
  const answers = sanitizeAnswers(value.answers)
  const allergyText = sanitizeAllergyText(value.allergyText)
  if (!answers || allergyText === null) return null
  return { step: value.step, answers, allergyText }
}

export function sanitizeSurveyResult(raw: unknown): SurveyResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.v !== 1 || typeof value.completedAt !== 'string') return null
  const answers = sanitizeAnswers(value.answers)
  const allergyText = sanitizeAllergyText(value.allergyText)
  if (!answers || allergyText === null) return null
  return { answers, allergyText, completedAt: value.completedAt }
}
