/**
 * 알아가기 퀴즈(H02)의 문항 모델. 문항은 프론트엔드 정적 데이터이며 백엔드 DTO가 아니다.
 * 문항 ID는 한 번 정하면 바꾸지 않는 고유값이다(예: EX-0001, ME-0101). 카테고리마다 ID 구간이 고정되어 있어 문항을 더해도 기존 ID가 밀리지 않는다.
 */
export type QuizDomain = 'exercise' | 'meal'
export type QuizDifficulty = 'beginner' | 'intermediate' | 'advanced'
export type QuizOptionId = 'A' | 'B' | 'C' | 'D'

export const QUIZ_OPTION_IDS: readonly QuizOptionId[] = ['A', 'B', 'C', 'D']

/** 문제 유형. multiple_choice는 4지선다, true_false는 OX다(백엔드 구분 이름과 같다). */
export type QuizQuestionType = 'multiple_choice' | 'true_false'
/** OX형의 답. */
export type TrueFalseAnswer = 'O' | 'X'
export const TRUE_FALSE_ANSWERS: readonly TrueFalseAnswer[] = ['O', 'X']
/** 유형과 관계없이 응답·정답을 담는 값(4지선다는 A~D, OX는 O·X). 저장 필드는 문자열 그대로라 DB 형식이 바뀌지 않는다. */
export type QuizAnswerId = QuizOptionId | TrueFalseAnswer

export interface QuizOption {
  id: QuizOptionId
  text: string
}

interface QuizQuestionBase {
  id: string
  domain: QuizDomain
  category: string
  difficulty: QuizDifficulty
  /** OX형에서는 맞는지 틀린지 판단할 서술문이다. */
  question: string
  /** 정답·오답 모두에게 보이는 해설 */
  explanation: string
  /** 확인한 출처. 확인하지 못했으면 null(출처를 지어내지 않는다). */
  source: string | null
  /** 사실관계를 사람 또는 신뢰할 수 있는 출처로 검증했는가. 운영에서는 true인 문항만 제공한다. */
  verified: boolean
  version: number
}

/** 4지선다형(기존 1,000문항). */
export interface MultipleChoiceQuestion extends QuizQuestionBase {
  type: 'multiple_choice'
  /** 정확히 4개 */
  options: readonly QuizOption[]
  correctAnswerId: QuizOptionId
}

/** OX형. 보기 목록이 없고 정답은 O 또는 X다. */
export interface TrueFalseQuestion extends QuizQuestionBase {
  type: 'true_false'
  correctAnswerId: TrueFalseAnswer
}

export type QuizQuestion = MultipleChoiceQuestion | TrueFalseQuestion

/** 작성용 한 줄: [난이도(b·i·a), 질문, 정답, 오답1, 오답2, 오답3, 해설] */
export type QuizRow = readonly [
  difficulty: 'b' | 'i' | 'a',
  question: string,
  correct: string,
  wrong1: string,
  wrong2: string,
  wrong3: string,
  explanation: string,
]

export interface QuizCategorySpec {
  domain: QuizDomain
  key: string
  label: string
  /** ID 구간의 시작 번호(고정) */
  base: number
  /** 이 카테고리의 정확한 문항 수 */
  count: number
}

export const QUIZ_CATEGORIES: readonly QuizCategorySpec[] = [
  {
    domain: 'exercise',
    key: 'basics',
    label: '운동 기초 상식',
    base: 1,
    count: 100,
  },
  {
    domain: 'exercise',
    key: 'warmup',
    label: '준비운동 및 마무리 운동',
    base: 101,
    count: 60,
  },
  {
    domain: 'exercise',
    key: 'form',
    label: '운동 자세와 동작 이해',
    base: 161,
    count: 100,
  },
  {
    domain: 'exercise',
    key: 'intensity',
    label: '운동 강도와 횟수',
    base: 261,
    count: 60,
  },
  {
    domain: 'exercise',
    key: 'body',
    label: '근육 및 신체 이해',
    base: 321,
    count: 60,
  },
  {
    domain: 'exercise',
    key: 'recovery',
    label: '휴식과 회복',
    base: 381,
    count: 60,
  },
  {
    domain: 'exercise',
    key: 'safety',
    label: '운동 안전 및 부상 예방',
    base: 441,
    count: 60,
  },
  {
    domain: 'meal',
    key: 'nutrients',
    label: '영양소 기초',
    base: 1,
    count: 100,
  },
  {
    domain: 'meal',
    key: 'balance',
    label: '균형 잡힌 식사',
    base: 101,
    count: 100,
  },
  {
    domain: 'meal',
    key: 'label',
    label: '식품 선택 및 영양표시',
    base: 201,
    count: 80,
  },
  { domain: 'meal', key: 'habit', label: '식사 습관', base: 281, count: 80 },
  { domain: 'meal', key: 'water', label: '수분 섭취', base: 361, count: 40 },
  {
    domain: 'meal',
    key: 'hygiene',
    label: '식품 보관 및 위생',
    base: 401,
    count: 50,
  },
  {
    domain: 'meal',
    key: 'practice',
    label: '건강한 식단 실천',
    base: 451,
    count: 50,
  },
]

export const QUIZ_ID_PREFIX: Record<QuizDomain, string> = {
  exercise: 'EX',
  meal: 'ME',
}
