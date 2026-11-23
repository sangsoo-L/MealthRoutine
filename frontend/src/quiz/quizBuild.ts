import {
  QUIZ_ID_PREFIX,
  QUIZ_OPTION_IDS,
  type QuizCategorySpec,
  type QuizDifficulty,
  type QuizOptionId,
  type MultipleChoiceQuestion,
  type QuizRow,
} from './quizTypes.ts'

const DIFFICULTY: Record<QuizRow[0], QuizDifficulty> = {
  b: 'beginner',
  i: 'intermediate',
  a: 'advanced',
}

/** ID 번호에서 정한 자리에 정답을 둔다(정답 위치가 한쪽으로 몰리지 않게 하는 고정 규칙, 같은 ID는 항상 같은 배치). */
export function correctPosition(number: number): number {
  return (number * 5 + (number >> 2)) % 4
}

export function questionId(spec: QuizCategorySpec, index: number): string {
  return `${QUIZ_ID_PREFIX[spec.domain]}-${String(spec.base + index).padStart(4, '0')}`
}

/**
 * 작성용 줄을 문항으로 바꾼다. 출처는 확인하지 못했으므로 null, 검증 상태는 false다(사람 검수 후에만 true로 바꾼다).
 * 줄 수가 카테고리 수량과 다르거나 줄의 모양이 틀리면 예외를 던진다(개발 중 바로 알 수 있게).
 */
export function buildQuestions(
  spec: QuizCategorySpec,
  rows: readonly QuizRow[],
): MultipleChoiceQuestion[] {
  if (rows.length !== spec.count) {
    throw new Error(
      `${spec.domain}/${spec.key}: ${spec.count}문항이어야 하는데 ${rows.length}문항이에요.`,
    )
  }
  return rows.map((row, index) => {
    if (row.length !== 7 || !(row[0] in DIFFICULTY)) {
      throw new Error(
        `${spec.key} ${index + 1}번째 줄의 모양이 올바르지 않아요.`,
      )
    }
    const [d, question, correct, w1, w2, w3, explanation] = row
    const position = correctPosition(spec.base + index)
    const texts = [w1, w2, w3]
    texts.splice(position, 0, correct)
    const correctAnswerId: QuizOptionId = QUIZ_OPTION_IDS[position]
    return {
      id: questionId(spec, index),
      type: 'multiple_choice' as const,
      domain: spec.domain,
      category: spec.key,
      difficulty: DIFFICULTY[d],
      question,
      options: QUIZ_OPTION_IDS.map((id, i) => ({ id, text: texts[i] })),
      correctAnswerId,
      explanation,
      source: null,
      verified: false,
      version: 1,
    }
  })
}
