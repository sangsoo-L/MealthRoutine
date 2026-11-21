import type { SurveyAnswers } from '../pages/surveyQuestions.ts'

/**
 * 개발용 가입 체험에서 A02 초기설문이 임시로 남기는 데이터. 실제 DB 저장이 아니라 개발용 Mock 저장이다.
 * 이해도 확인(onboarding-assessment)의 데이터와 키·모듈이 완전히 분리되어 있다.
 */

/** 설문 진행 상태(새로고침 복구용). 설문을 마치면 지운다. */
export interface SurveyDraft {
  /** 현재 단계(0부터, QUESTION_COUNT면 최종 확인) */
  step: number
  answers: SurveyAnswers
  /** 알레르기 "직접 입력" 내용 */
  allergyText: string
}

/** 설문을 마친 결과. 체험이 끝나거나 로그인·로그아웃 때 지운다. */
export interface SurveyResult {
  answers: SurveyAnswers
  /** 알레르기를 "직접 입력"으로 답했을 때만 내용이 있다. */
  allergyText: string
  /** ISO 8601 */
  completedAt: string
}
