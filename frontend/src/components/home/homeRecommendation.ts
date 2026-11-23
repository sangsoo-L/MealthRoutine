/**
 * 회원 홈 "오늘의 추천" 배너의 추천 카탈로그(문구·아이콘·이동 경로). 어떤 추천을 보여 줄지는 homeRecommendationPolicy.ts의
 * 선택 규칙이 정하고, 표시는 HomeRecommendationBanner가 맡는다.
 *
 * 규칙 기반이다. AI·외부 API·무작위·가짜 개인화 수치를 쓰지 않는다. 같은 상태에는 항상 같은 추천이다.
 * 추천은 실제로 읽을 수 있는 사용자 상태(운동·식단 기록, 운동 목표)로만 고르고, 읽지 못했거나 연결되지 않은 값은 "기록 없음"으로 보지 않는다.
 * 문구는 초보자에게 부담을 주지 않는다(안 한 날을 실패로 말하지 않고, 쉬는 날에 운동을 강요하지 않고, 확인하지 못한 상태를 단정하지 않는다).
 *
 * 추천 유형을 늘리려면 아래 카탈로그에 항목을 더하고 선택 규칙(homeRecommendationPolicy.ts)의 우선순위에 넣는다.
 * 이동 경로는 라우터에 있는 정식 화면만 쓴다.
 */

/**
 * 추천 대상 화면의 준비 상태.
 * available: 정식 화면이 있다. preparing: 경로만 있는 임시 화면이라 배너가 "화면 준비 중"을 함께 표시한다(지금 추천 대상은 모두 available).
 */
export type RecommendationAvailability = 'available' | 'preparing'

export type HomeRecommendationId =
  | 'start-with-exercise'
  | 'first-exercise'
  | 'record-meal'
  | 'record-exercise'
  | 'set-exercise-goal'
  | 'weekly-review'

export interface HomeRecommendation {
  id: HomeRecommendationId
  /** 배너 위의 작은 라벨 */
  label: string
  title: string
  description: string
  /** CTA 글자 */
  ctaLabel: string
  /** 이동 경로. 라우터에 있는 경로만 쓴다 */
  href: string
  availability: RecommendationAvailability
  /** 배너 한쪽의 장식 이모지(보조기기에서는 숨긴다) */
  emoji: string
  /** 이 추천이 나온 조건(화면에는 보이지 않는다. 점검·테스트용 설명) */
  condition: string
  /** true이면 CTA 링크가 도착 화면의 "이전"이 홈으로 돌아오도록 진입 경로(/home)를 알린다 */
  returnHome?: boolean
}

/** 준비 상태가 preparing일 때 배너에 보이는 글자 */
export const PREPARING_LABEL = '화면 준비 중'

const LABEL = '오늘의 추천'

/**
 * 기본 추천. 개인화에 필요한 값을 읽지 못했거나(연결 전·조회 중·실패) 해당하는 상태가 없을 때 쓴다.
 * 운동 찾기(E01)는 정식 화면이 있어 available이고 바로 이동할 수 있다.
 */
export const DEFAULT_RECOMMENDATION: HomeRecommendation = {
  id: 'start-with-exercise',
  label: LABEL,
  title: '오늘은 가볍게 운동부터 시작해 볼까요?',
  description: '이름이나 조건으로 내가 할 수 있는 운동을 찾아볼 수 있어요.',
  ctaLabel: '운동 찾기로 이동',
  href: '/exercises',
  availability: 'available',
  emoji: '💪',
  condition: '개인화에 쓸 수 있는 값이 없거나 해당하는 상태가 없음',
}

/** A. 운동 기록이 없다고 확인된 사용자(식단 기록도 없다). 운동 찾기(E01)로 이동한다. */
export const FIRST_EXERCISE_RECOMMENDATION: HomeRecommendation = {
  id: 'first-exercise',
  label: LABEL,
  title: '첫 운동을 시작해 볼까요?',
  description: '부담 없이 할 수 있는 운동부터 찾아보세요.',
  ctaLabel: '운동 찾아보기',
  href: '/exercises',
  availability: 'available',
  emoji: '💪',
  condition: '운동 기록이 없고(식단 기록도 없음) 둘 다 읽을 수 있음',
}

/** B. 오늘 식단 기록이 없다고 확인된 사용자. 식단 기록 허브(D01)로 이동한다. */
export const RECORD_MEAL_RECOMMENDATION: HomeRecommendation = {
  id: 'record-meal',
  label: LABEL,
  title: '오늘 먹은 음식을 기록해 보세요',
  description: '식단 기록을 시작하면 나의 식습관을 조금씩 알아갈 수 있어요.',
  ctaLabel: '식단 기록하기',
  href: '/records/meal',
  availability: 'available',
  emoji: '🍽️',
  condition: '오늘 식단 기록이 없는 것으로 확인됨',
}

/** C. 오늘 운동 기록이 없다고 확인된 사용자. 운동 기록 허브(W01)로 이동한다. */
export const RECORD_EXERCISE_RECOMMENDATION: HomeRecommendation = {
  id: 'record-exercise',
  label: LABEL,
  title: '오늘의 활동을 기록해 볼까요?',
  description: '가벼운 움직임도 기록으로 남겨보세요.',
  ctaLabel: '운동 기록하기',
  href: '/records/exercise',
  availability: 'available',
  emoji: '🏋️',
  condition: '오늘 운동 기록이 없는 것으로 확인됨',
}

/** D. 운동 목표가 없고 목표 화면을 열 수 있는 사용자. 운동 목표 설정(W01-1)으로 이동한다(식단 목표는 저장할 수 없어 추천하지 않는다). */
export const SET_GOAL_RECOMMENDATION: HomeRecommendation = {
  id: 'set-exercise-goal',
  label: LABEL,
  title: '나에게 맞는 목표를 정해볼까요?',
  description: '목표를 정하면 운동 관리를 시작하기 쉬워져요.',
  ctaLabel: '목표 설정하기',
  href: '/records/exercise/goal',
  availability: 'available',
  emoji: '🎯',
  condition: '운동 목표가 없는 것으로 확인되고 목표 화면의 선행 조건이 있음',
  returnHome: true,
}

/** E. 이번 주 기록이 있는 사용자. 주간 리포트(I05)로 이동한다. 설명은 실제로 기록이 있는 쪽만 말한다. */
export function weeklyReviewRecommendation(scope: {
  exercise: boolean
  meal: boolean
}): HomeRecommendation {
  const description =
    scope.exercise && scope.meal
      ? '지금까지 남긴 운동과 식단 기록을 확인해 보세요.'
      : scope.exercise
        ? '이번 주에 남긴 운동 기록을 확인해 보세요.'
        : '이번 주에 남긴 식단 기록을 확인해 보세요.'
  return {
    id: 'weekly-review',
    label: LABEL,
    title: '이번 주의 활동을 돌아보세요',
    description,
    ctaLabel: '활동 돌아보기',
    href: '/ai/weekly-report',
    availability: 'available',
    emoji: '📊',
    condition: '이번 주 운동 또는 식단 기록이 있음',
    returnHome: true,
  }
}

/** 개인화 입력이 없을 때의 추천(항상 기본 추천). 개인화는 homeRecommendationPolicy.ts의 selectHomeRecommendation이 한다. */
export function getHomeRecommendation(): HomeRecommendation {
  return DEFAULT_RECOMMENDATION
}
