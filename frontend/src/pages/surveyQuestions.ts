/**
 * 초기설문(A02) 질문과 문구. 질문·선택지·설명은 스토리보드의 A02 정의를 그대로 옮긴 것이다.
 * React에 의존하지 않는 순수 모듈이라 화면 없이도 규칙을 확인할 수 있다.
 */

export type SurveyKey = 'goal' | 'time' | 'tool' | 'environment' | 'allergyMode'

export interface SurveyChoice {
  value: string
  description: string
}

export interface SurveyQuestion {
  key: SurveyKey
  /** 진행 단계 이름. 최종 확인 목록의 항목 이름으로도 쓴다. */
  label: string
  /** 줄바꿈 위치를 원문 그대로 유지하기 위해 줄 단위로 나눈다. */
  question: readonly string[]
  help: string
  required: boolean
  choices: readonly SurveyChoice[]
}

/** 질문별 선택값. 건너뛰었거나 아직 답하지 않은 질문은 키가 없다. */
export type SurveyAnswers = Partial<Record<SurveyKey, string>>

/** 알레르기 질문에서 이름을 직접 적게 하는 선택지 */
export const ALLERGY_CUSTOM = '직접 입력'

export const SURVEY_QUESTIONS: readonly SurveyQuestion[] = [
  {
    key: 'goal',
    label: '나의 목표',
    question: ['지금 가장 만들고 싶은', '변화는 무엇인가요?'],
    help: '가장 먼저 시작하고 싶은 한 가지를 골라주세요.',
    required: true,
    choices: [
      {
        value: '꾸준한 운동',
        description: '조금씩 자주 움직이는 습관을 만들고 싶어요.',
      },
      {
        value: '균형 잡힌 식사',
        description: '무엇을 먹는지 알고, 식사를 챙기고 싶어요.',
      },
      {
        value: '건강한 생활',
        description: '무리하지 않고 일상의 균형을 찾고 싶어요.',
      },
    ],
  },
  {
    key: 'time',
    label: '가능한 시간',
    question: ['하루에 어느 정도', '시간을 낼 수 있나요?'],
    help: '지금 생활에서 부담 없는 시간을 골라주세요.',
    required: false,
    choices: [
      { value: '5분', description: '아주 짧게, 한 동작부터 시작할래요.' },
      { value: '10분', description: '일상 사이에 가볍게 움직일 수 있어요.' },
      { value: '15분', description: '몇 가지 운동을 함께 해보고 싶어요.' },
      { value: '30분', description: '조금 더 여유 있게 운동할 수 있어요.' },
    ],
  },
  {
    key: 'tool',
    label: '운동 환경',
    question: ['어떤 도구로', '시작하면 편할까요?'],
    help: '가장 자주 사용할 수 있는 것을 하나 골라주세요.',
    required: false,
    choices: [
      { value: '맨몸', description: '별도 도구 없이 시작하고 싶어요.' },
      { value: '덤벨', description: '집이나 운동 공간에 덤벨이 있어요.' },
      { value: '밴드', description: '운동 밴드를 사용할 수 있어요.' },
    ],
  },
  {
    key: 'environment',
    label: '식사 환경',
    question: ['평소 식사는', '어떻게 준비하나요?'],
    help: '가장 가까운 생활 모습을 선택해주세요.',
    required: false,
    choices: [
      {
        value: '집밥',
        description: '직접 만들거나 집에서 준비된 식사를 해요.',
      },
      { value: '편의점', description: '빠르고 간단하게 골라 먹는 편이에요.' },
      {
        value: '배달',
        description: '배달 음식으로 끼니를 해결하는 편이에요.',
      },
      { value: '외식', description: '식당이나 구내식당을 자주 이용해요.' },
    ],
  },
  {
    key: 'allergyMode',
    label: '알레르기 확인',
    question: ['미리 알아두어야 할', '알레르기가 있나요?'],
    help: '확실하지 않으면 미확인으로 남겨도 괜찮아요.',
    required: false,
    choices: [
      { value: '없음', description: '알고 있는 음식 알레르기가 없어요.' },
      { value: '미확인', description: '아직 잘 모르겠어요.' },
      {
        value: ALLERGY_CUSTOM,
        description: '알고 있는 알레르기를 적을게요.',
      },
    ],
  },
]

/** 질문 단계 수. 이 값과 같은 단계 번호가 최종 확인 화면이다. */
export const QUESTION_COUNT = SURVEY_QUESTIONS.length

export const SURVEY_TEXT = {
  progressLabel: '초기설문',
  progressReviewLabel: '마지막 확인',
  progressReviewValue: '선택 내용 확인',
  progressBarLabel: '설문 진행',
  reviewEyebrow: 'READY TO BEGIN',
  reviewTitle: ['지금의 나에게 맞는', '시작을 준비했어요'],
  reviewHelp: '선택한 내용을 확인하고 시작해 보세요.',
  reviewEdit: '수정',
  reviewAllergyFallback: '미확인',
  reviewEmptyFallback: '나중에 입력',
  allergyLabel: '알레르기 음식',
  allergyPlaceholder: '예: 우유, 땅콩',
  previous: '이전',
  customDone: '입력 완료',
  start: '이 목표로 시작하기',
  requiredFootnote:
    '목표 한 가지만 선택하면, 나머지는 나중에 입력할 수 있어요.',
  skip: '이 질문은 나중에 답할게요',
  leave: '설문 전체를 나중에 하기',
} as const

/** 알레르기 직접 입력 최대 글자 수 (스토리보드 입력창 maxlength) */
export const ALLERGY_MAX_LENGTH = 200

/**
 * 현재 질문에 진행할 만한 답이 있는지. `직접 입력`을 골랐다면 이름을 적어야 한다.
 * 질문 단계가 아닌(undefined) 경우는 항상 true다.
 */
export function isAnswerReady(
  question: SurveyQuestion | undefined,
  answers: SurveyAnswers,
  allergyText: string,
): boolean {
  if (!question) return true
  const answer = answers[question.key]
  if (!answer) return false
  if (question.key === 'allergyMode' && answer === ALLERGY_CUSTOM) {
    return allergyText.trim().length > 0
  }
  return true
}

/** 최종 확인 목록에 보여 줄 값. 답하지 않은 항목은 원문의 대체 문구를 쓴다. */
export function reviewValue(
  question: SurveyQuestion,
  answers: SurveyAnswers,
  allergyText: string,
): string {
  const answer = answers[question.key]
  if (question.key === 'allergyMode') {
    return answer === ALLERGY_CUSTOM
      ? allergyText
      : (answer ?? SURVEY_TEXT.reviewAllergyFallback)
  }
  return answer ?? SURVEY_TEXT.reviewEmptyFallback
}
