import type {
  AssessmentDomain,
  AssessmentLevelCode,
} from './assessmentTypes.ts'

/**
 * 이해도 단계의 한국어 표시. 내부는 영문 코드로만 다루고 표시는 여기서만 바꾼다.
 * 이해도 확인 결과 화면과 마이페이지(P01)가 모두 이 표시를 쓴다(표시 이름을 두 곳에서 따로 갖지 않는다).
 * 표기는 사용자 지시(초보·중급·고급)로 통일했다. 화면명세 v5.0 P01은 초보/중수/고수로 적고 있어 명세와 다르다(보고 사항).
 */
export const ASSESSMENT_LEVEL_LABEL: Record<AssessmentLevelCode, string> = {
  beginner: '초보',
  intermediate: '중급',
  advanced: '고급',
}

/**
 * 단계별 한 줄 설명. 실력이나 전문성을 평가하는 문구가 아니라, 처음 안내를 어떤 모습으로 준비할지 알리는 부담 없는 문구다.
 * 영역당 2문항으로 정한 임시 단계(Mock 기준)라서 "잘 안다/모른다" 같은 판정 표현을 쓰지 않는다.
 */
export const ASSESSMENT_LEVEL_NOTE: Record<AssessmentLevelCode, string> = {
  beginner: '기초부터 차근차근 안내해 드릴게요.',
  intermediate: '기본을 바탕으로 한 걸음씩 넓혀 가요.',
  advanced: '기본 원리를 바탕으로 더 다양하게 활용해 봐요.',
}

export const ASSESSMENT_DOMAIN_LABEL: Record<AssessmentDomain, string> = {
  exercise: '운동',
  meal: '식단',
}

/** 화면 문구. 시험처럼 느껴지지 않도록 부드럽고 친근한 말투를 쓴다. */
export const ASSESSMENT_TEXT = {
  /** 화면 이름. 보이는 제목 바가 없는 화면이라 보조기기용 h1로만 쓴다. */
  title: '운동·식단 이해도 확인',
  /** 안내 화면의 큰 제목. 줄 단위로 나눠 두고 화면 폭에 따라 각 줄이 자연스럽게 줄바꿈된다. */
  introTitleLines: ['운동과 식단,', '얼마나 알고 계신가요?'],
  /** 문항 수는 출제 결과에서 받아 쓴다(문구에 숫자를 고정하지 않는다). */
  introLead: (total: number) =>
    `간단한 질문 ${total}개로 운동과 식단에 대한 이해도를 확인해 볼게요.`,
  introReassure: '정답을 몰라도 괜찮아요. 편하게 답변해 주세요.',
  introMeta: (total: number) => `약 1분 · 총 ${total}문항`,
  start: '시작하기',
  progressLabel: '이해도 확인',
  progressBarLabel: '진행 상황',
  previous: '이전',
  next: '다음',
  finish: '결과 확인',
  submitting: '확인하는 중…',
  answerHint: '답을 고르면 다음으로 넘어갈 수 있어요.',
  finishHint: '답을 고르면 결과를 볼 수 있어요.',
  submitError:
    '결과를 확인하지 못했어요. 답변은 그대로 있으니 다시 시도해 주세요.',
  restarted: '진행 중이던 문항이 바뀌어서 처음부터 다시 시작해요.',
  resultHeading: '확인이 끝났어요',
  resultBody: '수고하셨어요. 운동과 식단에 대한 이해도를 각각 확인했어요.',
  resultNote:
    '이 결과는 처음 안내를 준비하는 참고 정보예요. 실력이나 전문성을 판단하는 기준은 아니에요.',
  goHome: '홈으로 가기',
  loading: '불러오는 중이에요',
  loadError: '이해도 확인을 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.',
  retry: '다시 시도',
  unavailable: '운동·식단 이해도 확인은 아직 이용할 수 없어요.',
  mockBadge: '개발용 예시',
  mockResultBadge: '개발용 예시 결과',
} as const
