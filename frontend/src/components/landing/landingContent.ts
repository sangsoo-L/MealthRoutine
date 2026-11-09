/**
 * H01 비회원 홈의 콘텐츠.
 *
 * 문구는 실제 구현 상태를 그대로 설명해야 한다. 현재 상태:
 * - 이 화면에는 동작하는 기능 체험이 없다. 히어로의 "운동도 식단도, 한곳에" 카드와 퀴즈 배너는 움직이지 않는 정적 소개 콘텐츠다.
 * - 운동 찾기·음식 찾기·고객지원은 경로만 있는 임시 화면이라 "화면 준비 중"을 표시한다. 정식 화면이 생기면 status를 지운다.
 * - 운동·식단 기록과 회원용 하루 한 문제 퀴즈(H02)는 아직 구현되지 않았다. 가입·로그인도 화면과 입력 검증까지이며 API가 연결되지 않았다.
 * - AI 기능은 제공 예정이다. 이용 조건은 v5.0 명세대로 적고(LANDING_AI 주석), 가격·혜택과 체험 횟수의 갱신 주기는 확정되지 않아 쓰지 않는다.
 *
 * "무료"의 근거: v5.0 명세의 "기본 기록 무료", "기본 주간 리포트 무료(AI 미사용)".
 * 링크의 `to`는 라우터에 이미 있는 경로만 쓴다.
 */

export type LandingTone = 'exercise' | 'meal' | 'brand'

export const LANDING_FEATURES_ID = 'features'

/** "둘러보기" 앵커가 가리키는 섹션 */
export const LANDING_EXPLORE_ID = 'explore'

export const LANDING_HEADER = {
  brand: 'MealthRoutine',
  exploreLabel: '둘러보기',
  loginLabel: '로그인',
  loginTo: '/login',
} as const

export const LANDING_HERO = {
  // 의미 단위로 나눈 제목. 이어 붙였을 때 "운동과 식단 기록을 한곳에서."가 되도록 첫 줄 끝 공백을 유지한다.
  titleLines: ['운동과 식단 기록을 ', '한곳에서.'],
  description:
    '오늘의 운동과 식사를 기록하고, 나만의 건강한 습관을 이어가세요.',
  ctaLabel: '무료로 시작하기',
  ctaTo: '/signup',
  exploreLabel: '가입 없이 둘러보기',
} as const

/**
 * 히어로의 서비스 소개 카드. 운동 기록과 식단 기록이 서비스의 두 축임을 보여 주는 정적 콘텐츠다.
 * 수치·그래프 등 기록처럼 보이는 값을 넣지 않는다. 실제 기록 기능은 아직 구현되지 않았다.
 */
export const LANDING_PREVIEW = {
  title: '운동도 식단도, 한곳에',
  summaries: [
    { tone: 'exercise', label: '운동 기록' },
    { tone: 'meal', label: '식단 기록' },
  ],
} as const

export const LANDING_HOW = {
  title: '기록은 이렇게 이어져요',
  description: '기록 기능은 제공 예정이에요.',
  steps: [
    {
      title: '운동·식단 기록하기',
      text: '운동은 세트와 횟수로, 식단은 끼니별로 남겨요.',
    },
    {
      title: '주간 리포트로 확인',
      text: '기록한 날을 요일별로 보고, 쉬었다면 다시 이어가요.',
    },
  ],
} as const

export interface LandingFeature {
  title: string
  description: string
  emoji: string
  tone: LandingTone
  /** 이동 경로. 없으면 이동하지 않는 소개 카드 */
  to?: string
}

export const LANDING_FEATURES = {
  title: '이런 걸 할 수 있어요',
  description: '가입 없이 바로 쓰는 기능과, 가입하면 쓸 수 있는 기능이에요.',
  freeHeading: '지금 바로 이용할 수 있어요',
  memberHeading: '가입하면 이용할 수 있어요',
  memberBadge: '회원가입 후 이용',
  free: [
    {
      title: '운동 탐색',
      description: '이름이나 조건으로, 내가 할 수 있는 운동을 찾아봐요.',
      emoji: '🏋️',
      tone: 'exercise',
      to: '/exercises',
    },
    {
      title: '음식 정보 검색',
      description: '음식 종류와 영양 조건으로 원하는 음식을 찾아봐요.',
      emoji: '🔎',
      tone: 'meal',
      to: '/foods',
    },
  ],
  member: [
    {
      title: '건강 상식 퀴즈',
      description: '헷갈리는 건강 상식을 하루 한 문제씩 풀어 봐요.',
      emoji: '💡',
      tone: 'brand',
    },
    {
      title: '운동·식단 습관 기록',
      description:
        '오늘의 운동과 식단을 기록하고, 쉬었다가도 부담 없이 이어가요.',
      emoji: '📝',
      tone: 'brand',
    },
  ],
} as const satisfies {
  title: string
  description: string
  freeHeading: string
  memberHeading: string
  memberBadge: string
  free: readonly LandingFeature[]
  member: readonly LandingFeature[]
}

export const LANDING_EXPLORE = {
  title: '가입 없이 둘러보기',
  links: [
    {
      label: '운동 찾기',
      description: '운동 종류와 조건',
      tone: 'exercise',
      to: '/exercises',
      status: '화면 준비 중',
    },
    {
      label: '음식 찾기',
      description: '음식 종류와 영양 정보',
      tone: 'meal',
      to: '/foods',
      status: '화면 준비 중',
    },
  ],
} as const

/**
 * 건강 상식 퀴즈 소개 배너의 문구. 이 화면에는 동작하는 퀴즈가 없고(문제·선택지 없음), 눌러서 갈 곳도 없다.
 * 회원용 하루 한 문제 퀴즈(H02)는 아직 구현되지 않았으므로 "제공 예정"을 함께 표시한다.
 * 제목은 이어 붙였을 때 한 문장이 되도록 첫 줄 끝 공백을 유지한다.
 */
export const LANDING_QUIZ = {
  titleLines: ['헷갈리는 건강 상식, ', '퀴즈로 쉽게 알아가요.'],
  description:
    '하루 한 문제씩 운동·식단 기초를 익히는 회원 서비스를 준비하고 있어요.',
  status: '제공 예정',
} as const

/**
 * AI 코칭 안내. 이용 조건의 근거는 v5.0 명세의 access 항목이다.
 * - I02-1(운동 추천): 유료 운동 또는 종합 권한, I04(사진 분석): 유료 식단 또는 종합 권한.
 * - 체험: I02-1·I03·I04·I05·P03 모두 AI 운동·식단·사진·주간 코칭 합산(통합) 5회. 기능별 5회가 아니다.
 *   명세의 "무료 회원"을 화면에서는 "일반 회원"으로 적는다.
 * - P03에 체험 규정은 "확정 필요"로 남아 있고 횟수는 "현재 시안 세션 동안"으로만 정의되어 있어, 갱신 주기와 추가 조건은 쓰지 않는다.
 */
export const LANDING_AI = {
  title: 'AI 코칭',
  badge: '제공 예정',
  items: [
    {
      title: '운동 루틴 추천',
      text: '목표와 수준에 맞는 루틴을 제안할 예정이에요.',
      icon: 'clipboard-check',
    },
    {
      title: '식단 사진 분석',
      text: '음식 사진으로 식단 기록을 도울 예정이에요.',
      icon: 'eye',
    },
  ],
  // 운동 추천은 유료 운동·종합, 사진 분석은 유료 식단·종합 권한이 필요하다(v5.0). 화면에서는 "유료 권한"으로 묶어 적는다.
  access:
    '유료 권한이 필요하고, 제공되면 일반 회원은 AI 코칭을 합산 5회 체험할 수 있어요.',
  disclaimer: 'AI 추천과 분석 값은 참고용이며 의료적 진단을 대신하지 않아요.',
} as const

export const LANDING_SIGNUP = {
  title: '건강한 습관, 밀스루틴과 함께해요.',
  description: '기본 기록·기본 주간 리포트는 무료 제공 예정이에요.',
  ctaLabel: '무료로 시작하기',
  ctaTo: '/signup',
} as const

export const LANDING_FOOTER = {
  brand: 'MealthRoutine · 밀스루틴',
  description: '초보자를 위한 운동·식단 건강관리 서비스예요.',
  links: [{ label: '고객지원', to: '/support', status: '화면 준비 중' }],
} as const
