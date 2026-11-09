/**
 * 회원 홈 "오늘의 추천" 배너의 추천 데이터와 선택 규칙. 표시는 HomeRecommendationBanner가 맡는다.
 *
 * 지금은 추천 API와 회원의 운동·식단 기록 데이터가 없어 AI·개인화 추천을 하지 않는다. 항상 기본 추천 하나를 돌려준다.
 * 무작위 추천, 임의 개인화 수치, 가짜 사용자 정보는 쓰지 않는다.
 *
 * 추천을 늘리려면(예: 운동 기록 여부·식단 기록 여부·지식 수준·건강 목표 사용):
 * 1) 아래 `HomeRecommendation`에 맞는 추천 항목을 추가하고,
 * 2) `getHomeRecommendation`이 실제로 제공되는 값(기록 데이터 응답 등)을 인자로 받아 항목을 고르도록 바꾼다.
 * 값이 제공되지 않는(알 수 없는) 경우에는 기본 추천을 돌려준다. 추천은 한 번에 하나만 표시한다.
 */

/**
 * 추천 대상 화면의 준비 상태.
 * available: 정식 화면이 있다. preparing: 경로만 있는 임시 화면이라 배너가 "화면 준비 중"을 함께 표시한다.
 */
export type RecommendationAvailability = 'available' | 'preparing'

export interface HomeRecommendation {
  id: string
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
}

/** 준비 상태가 preparing일 때 배너에 보이는 글자 */
export const PREPARING_LABEL = '화면 준비 중'

/**
 * 기본 추천. 운동 찾기(E01)는 아직 임시 화면이라 availability가 preparing이고,
 * 설명도 지금 할 수 있는 것처럼 쓰지 않고 준비 중임을 밝힌다. 정식 화면이 생기면 available로 바꾸고 설명을 정한다.
 */
export const DEFAULT_RECOMMENDATION: HomeRecommendation = {
  id: 'start-with-exercise',
  label: '오늘의 추천',
  title: '오늘은 가볍게 운동부터 시작해 볼까요?',
  description:
    '운동 찾기 화면을 준비하고 있어요. 준비되면 내게 맞는 운동을 찾아볼 수 있어요.',
  ctaLabel: '운동 찾기로 이동',
  href: '/exercises',
  availability: 'preparing',
  emoji: '💪',
}

/** 지금 보여 줄 추천 하나를 돌려준다. 현재는 선택에 쓸 실제 데이터가 없어 항상 기본 추천이다. */
export function getHomeRecommendation(): HomeRecommendation {
  return DEFAULT_RECOMMENDATION
}
