/**
 * 회원 홈(MemberHomePage)에서 쓰는 바로가기 6개·퀴즈 카드·공지의 문구와, 아직 쓰지 않는 검색 안내(HomeDiscovery) 문구. 비로그인 랜딩(H01)의 문구는 landing/landingContent.ts에 있다.
 *
 * H01 홈 비회원 화면의 콘텐츠. 문구와 구성은 공개 스토리보드 v5.0(가이드 기반 리디자인 v5.0)의 비회원 홈을 그대로 옮긴 것이다.
 * (이 파일은 스토리보드 v5.0을 기준으로 한다.)
 *
 * 이 값들은 시안용 정적 데이터(Mock)다. 운동·음식 소개 콘텐츠와 공지사항은 실제 API가 연결되면 응답으로 교체한다.
 * `to`가 null이면 목적지 경로가 라우터에 없거나 확정되지 않은 항목이며, 화면에서는 비활성으로 표시한다.
 */

/** 이모지 타일의 배경색 계열. 도메인 토큰(운동 인디고, 식단 앰버, 브랜드 블루)에 대응한다. */
export type HomeTone = 'exercise' | 'meal' | 'brand'

export interface HomeShortcut {
  label: string
  emoji: string
  tone: HomeTone
  /** 이동 경로. null이면 미연결(비활성) */
  to: string | null
}

/**
 * 핵심 기능 바로가기 6개(3열 × 2행). 순서와 이름은 v5.0 H01의 6개 아이콘 구성(1행: 운동 기록·식단 기록·AI 코칭,
 * 2행: 운동 찾기·음식 찾기·커뮤니티)을 따른다. v5.0의 비로그인 역할은 4개, 무료 회원 역할은 6개인데,
 * 이 앱의 비로그인 홈은 사용자 지시로 6개를 쓴다. 운동 기록·식단 기록은 비로그인이면 해당 화면의 로그인 안내(GuestNoticeGate)가 보인다.
 */
export const HOME_SHORTCUTS: readonly HomeShortcut[] = [
  {
    label: '운동 기록',
    emoji: '💪',
    tone: 'exercise',
    to: '/records/exercise',
  },
  { label: '식단 기록', emoji: '🍽️', tone: 'meal', to: '/records/meal' },
  { label: 'AI 코칭', emoji: '✨', tone: 'brand', to: '/ai' },
  { label: '운동 찾기', emoji: '🏋️', tone: 'exercise', to: '/exercises' },
  { label: '음식 찾기', emoji: '🔎', tone: 'meal', to: '/foods' },
  // 커뮤니티 목록(C01)은 라우터에 경로가 없고 화면 경로도 확정되지 않아 연결하지 않는다.
  { label: '커뮤니티', emoji: '💬', tone: 'brand', to: null },
]

/**
 * "운동·식단 알아가기 퀴즈" 카드. 문구는 v5.0 H01의 퀴즈 배너 원문이다.
 * v5.0에서 이 카드는 오늘의 퀴즈(H02)로 이동하지만, H02의 URL이 정해지지 않았다(screen-route-map: 미정·미구현).
 * 그래서 `to`는 null(비활성)로 두고, 경로가 확정되면 값만 채운다.
 */
export const HOME_QUIZ = {
  kicker: '처음이라면, 가볍게',
  title: '운동·식단 알아가기 퀴즈',
  descriptionLines: ['헷갈리는 건강 상식,', '퀴즈로 하나씩 알아가요.'],
  audience: '초보자를 위한 퀴즈',
  frequency: '하루 한 문제',
  /** 장식 그림의 글자(보조기기에서는 숨긴다) */
  artLabel: '오늘의 상식',
  artProgress: '● ○ ○',
  to: null as string | null,
} as const

/** "처음이라면 여기부터"의 검색 이용 순서(3단계) */
export const HOME_GUIDE_STEPS: readonly string[] = [
  '검색어 입력',
  '조건 선택',
  '결과 확인',
]

export const HOME_GUIDE_TEXT = {
  lead: '이름이나 조건을 고르면, 원하는 결과를 찾을 수 있어요.',
  flowLabel: '검색 이용 순서',
  previewCaption: '검색 화면 미리보기 · 예시',
  next: '조건에 맞는 결과 확인',
  // 비회원 홈의 마무리 안내
  guestNote: '검색은 가입 없이 이용할 수 있어요. 기록은 로그인 후 시작해요.',
} as const

export interface HomeGuideTopic {
  tone: Exclude<HomeTone, 'brand'>
  emoji: string
  category: string
  title: string
  /** 미리보기 전체를 설명하는 접근 가능한 이름(미리보기는 예시 그림으로 취급한다) */
  previewLabel: string
  query: string
  filters: readonly { label: string; value: string }[]
  /** 음식 검색에만 있는 영양 조건 한 줄 */
  extra?: string
  resultEmoji: string
  resultTitle: string
  resultMeta: string
  ctaLabel: string
  to: string
}

/** 운동·음식 검색 사용법 소개(시안용 정적 예시). 예시 결과는 실제 검색 결과가 아니다. */
export const HOME_GUIDE_TOPICS: readonly HomeGuideTopic[] = [
  {
    tone: 'exercise',
    emoji: '💪',
    category: '운동 검색',
    title: '내가 할 수 있는 운동 찾기',
    previewLabel:
      '운동 탐색 이용 방법: 운동명 입력, 난이도 · 운동 부위 · 사용 가능한 도구 선택 후 검색 결과에서 운동 선택',
    query: '운동 이름 또는 조건으로 찾기',
    filters: [
      { label: '난이도', value: '초급' },
      { label: '운동 부위', value: '하체' },
      { label: '운동 도구', value: '맨몸' },
    ],
    resultEmoji: '🦵',
    resultTitle: '의자 스쿼트',
    resultMeta: '초급 · 하체 · 맨몸',
    ctaLabel: '운동 탐색 시작하기',
    to: '/exercises',
  },
  {
    tone: 'meal',
    emoji: '🍽️',
    category: '음식 검색',
    title: '종류와 영양 조건으로 찾기',
    previewLabel:
      '음식 검색 예시: 음식명 입력, 식품 구분·음식 종류·100g당 열량과 단백질 조건 선택 후 결과에서 영양정보 확인',
    query: '닭가슴살',
    filters: [
      { label: '식품 구분', value: '식재료' },
      { label: '음식 종류', value: '육류' },
      { label: '상세 필터', value: '열량 · 단백질' },
    ],
    extra: '100g당 100~200 kcal · 단백질 20g 이상',
    resultEmoji: '🍗',
    resultTitle: '닭가슴살',
    resultMeta: '100g · 165 kcal · 단백질 31g',
    ctaLabel: '음식 검색 시작하기',
    to: '/foods',
  },
]

export interface HomeNotice {
  tag: string
  title: string
}

/** 공지사항 미리보기 2개(시안 콘텐츠). 목적지는 모두 고객지원(S01)이다. */
export const HOME_NOTICES: readonly HomeNotice[] = [
  { tag: '안내', title: '시안 이용 안내' },
  { tag: '서비스', title: '무료 기록과 AI 코칭 이용 안내' },
]

/** 이모지 타일 배경 클래스. Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다. */
export const TONE_CLASS: Record<HomeTone, string> = {
  exercise: 'bg-exercise-soft',
  meal: 'bg-meal-soft',
  brand: 'bg-brand-soft',
}
