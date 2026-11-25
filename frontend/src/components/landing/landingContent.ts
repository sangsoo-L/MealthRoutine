/**
 * H01 비회원 홈의 콘텐츠.
 *
 * 문구는 실제 구현 상태를 그대로 설명해야 한다. 현재 상태:
 * - 이 화면에는 동작하는 기능 체험이 없다. 히어로의 "운동도 식단도, 한곳에" 카드와 퀴즈 배너는 움직이지 않는 정적 소개 콘텐츠다.
 * - 운동 찾기(E01)·음식 찾기(F01)·고객지원(S01)은 정식 화면이 있어 "화면 준비 중"을 표시하지 않는다(비회원도 열 수 있는 공개 경로).
 * - 운동·식단 기록과 회원용 하루 한 문제 퀴즈(H02)는 아직 구현되지 않았다. 가입·로그인도 화면과 입력 검증까지이며 API가 연결되지 않았다.
 * - AI 기능은 제공 예정이다. 이용 조건은 v5.0 명세대로 적고(LANDING_AI 주석), 가격과 유료 플랜의 제공 횟수는 확정되지 않아 쓰지 않는다. 무료 AI 체험은 최초 5회이고 월간 초기화가 없다(통합 AI 멤버십 정책).
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

/** "가입 없이 둘러보기"의 제목과 열린 화면 두 곳. 경로는 검색 안내 카드(HOME_GUIDE_TOPICS)의 시작하기 링크와 같다(타일은 카드로 통합했다). */
export const LANDING_EXPLORE = {
  title: '가입 없이 둘러보기',
  links: [
    {
      label: '운동 찾기',
      description: '운동 종류와 조건',
      tone: 'exercise',
      to: '/exercises',
    },
    {
      label: '음식 찾기',
      description: '음식 종류와 영양 정보',
      tone: 'meal',
      to: '/foods',
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
 * AI 코칭 안내. 통합 AI 멤버십 정책(사용자 확정)을 따른다. v5.0 명세의 운동·식단·종합 유료 권한 구분은 이 정책으로 대체됐다.
 * - 운동 AI와 식단 AI(사진·주간 코칭 포함)는 공통 사용 횟수를 함께 쓰고, 기능별 횟수가 따로 있지 않다.
 * - 무료 AI 체험은 가입 후 최초 5회이고 월간 초기화가 없다. 유료 플랜(베이직·프로)의 제공 횟수와 가격은 최종 확정 전이라 쓰지 않는다.
 * - 실제 사용량·권한 판정은 서버 기준이다. 명세의 "무료 회원"을 화면에서는 "일반 회원"으로 적는다.
 */
export const LANDING_AI = {
  title: 'AI 건강관리',
  lead: '기록을 바탕으로 운동과 식단을 더 쉽게 이어가도록 돕는 AI 코칭이에요. 제공 상태를 기능마다 구분해 알려 드려요.',
  // 제공 상태를 사실대로 구분한다: pending(준비 중), login(로그인 후 이용). 미구현 AI 기능을 제공 중인 것처럼 쓰지 않는다.
  items: [
    {
      title: 'AI 운동 플랜',
      text: '시간·도구·부위를 고르면 운동 목록을 제안해요. 로그인하면 로컬 예시로 체험할 수 있고, 실제 AI 추천은 준비 중이에요.',
      icon: 'dumbbell',
      status: 'login',
      statusLabel: '로컬 예시 체험 · 로그인 후',
    },
    {
      title: 'AI 식단 추천',
      text: '식단 목표를 바탕으로 내일 식단 후보를 제안할 예정이에요.',
      icon: 'utensils',
      status: 'login',
      statusLabel: '로컬 예시 체험 · 로그인 후',
    },
    {
      title: '음식 사진 분석',
      text: '음식 사진으로 식단 기록을 도울 예정이에요.',
      icon: 'eye',
      status: 'login',
      statusLabel: '로컬 예시 체험 · 로그인 후',
    },
    {
      title: '주간 운동·식단 기록 분석',
      text: '한 주의 운동·식단 기록 수로 주간 점수를 확인하는 기본 분석이에요. AI 없이 무료예요.',
      icon: 'chart',
      status: 'login',
      statusLabel: '로그인 후 이용',
    },
  ],
  // 운동·식단 AI는 공통 사용 횟수를 함께 쓴다. 무료 AI 체험은 최초 5회이고 월간 초기화가 없다. 유료 플랜의 횟수·가격은 확정 전이라 적지 않는다.
  access:
    'AI 코칭은 운동·식단 공통 사용 횟수로 이용하고, 제공되면 무료 AI 체험은 최초 5회예요. 월간 초기화는 없어요.',
  disclaimer: 'AI 추천과 분석 값은 참고용이며 의료적 진단을 대신하지 않아요.',
  // 비회원도 로그인 없이 볼 수 있는 AI 서비스 소개(`/ai`, 비로그인은 AI 소개 랜딩)로 간다.
  ctaLabel: 'AI 서비스 자세히 알아보기',
  ctaTo: '/ai',
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
  links: [{ label: '고객지원', to: '/support' }],
} as const
