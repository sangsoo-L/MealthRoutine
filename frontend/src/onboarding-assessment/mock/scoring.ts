import type {
  AssessmentAnswers,
  AssessmentDomain,
  AssessmentLevelCode,
} from '../assessmentTypes.ts'
import type { QuestionRecord } from './questionBank.ts'

/**
 * [개발 전용] Mock 채점. 서버가 맡을 채점을 개발 환경에서 흉내 낸다.
 *
 * 임시 평가 기준(영역당 2문항): 0개 정답 → 초급, 1개 → 중급, 2개 → 고급.
 * 문항 종류(기초 이해형·상황 적용형)와 사용자 단계(초급·중급·고급)는 서로 다른 개념이라 문항 종류에 따라 가중치를 달리하지 않는다.
 * 이 기준은 Mock 개발·테스트용이며 실제 사용자의 전문성을 확정하는 기준이 아니다.
 * 정답 판정은 보기 위치가 아니라 보기 ID로 하므로 보기 순서를 섞어도 결과가 같다.
 */
const LEVEL_BY_CORRECT_COUNT: readonly AssessmentLevelCode[] = [
  'beginner',
  'intermediate',
  'advanced',
]

export function levelFromCorrectCount(
  correctCount: number,
): AssessmentLevelCode {
  const index = Math.max(
    0,
    Math.min(correctCount, LEVEL_BY_CORRECT_COUNT.length - 1),
  )
  return LEVEL_BY_CORRECT_COUNT[index]
}

/**
 * 출제된 문항들에 대한 답안을 영역별로 채점한다.
 * @param records 이 출제에 포함된 문항(정답 포함). 답안의 문항·보기 ID는 이 문항들에 있어야 한다.
 */
export function gradeByDomain(
  records: readonly QuestionRecord[],
  answers: AssessmentAnswers,
): Record<AssessmentDomain, AssessmentLevelCode> {
  const correct: Record<AssessmentDomain, number> = { exercise: 0, meal: 0 }
  for (const record of records) {
    if (answers[record.id] === record.correctChoiceId) {
      correct[record.domain] += 1
    }
  }
  return {
    exercise: levelFromCorrectCount(correct.exercise),
    meal: levelFromCorrectCount(correct.meal),
  }
}
