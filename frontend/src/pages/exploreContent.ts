/**
 * 통합 탐색(/explore)의 문구와 시안용 정적 데이터.
 * 화면명세 v5.0에는 통합 탐색 화면이 없어(탐색 탭은 E01 운동 탐색으로 연결되었다) 문구는 사용자 지시서를 따른다.
 * 추천 검색어는 실제 API가 연결되면 응답으로 교체한다. 화면 컴포넌트는 이 모듈의 값만 읽는다.
 */
import type { IconName } from '../components/icons/iconTypes.ts'

export const EXPLORE_COPY = {
  title: '탐색',
  description: '오늘은 무엇을 찾아볼까요?',
  searchPlaceholder: '운동명 또는 음식명 검색',
  suggestionsTitle: '무엇부터 찾아볼지 고민된다면?',
  // 실제 인기 검색어나 개인화 추천이 아니라 시안용 예시이므로 "자주 쓰는" 같은 표현을 쓰지 않는다.
  suggestionsDescription: '운동과 식단 검색어 예시를 살펴보세요.',
  guideTitle: '검색어가 떠오르지 않나요?',
  guideDescription: '운동 찾기와 음식 찾기에서 조건별로 살펴보세요.',
} as const

export interface ExploreCategory {
  key: 'exercise' | 'meal'
  title: string
  description: string
  to: string
  icon: IconName
}

/** 운동 찾기·음식 찾기는 동등한 핵심 도메인이라 같은 구조로 둔다. */
export const EXPLORE_CATEGORIES: readonly ExploreCategory[] = [
  {
    key: 'exercise',
    title: '운동 찾기',
    description: '부위와 난이도로 찾아보세요',
    to: '/exercises',
    icon: 'dumbbell',
  },
  {
    key: 'meal',
    title: '음식 찾기',
    description: '음식과 영양 정보를 살펴보세요',
    to: '/foods',
    icon: 'utensils',
  },
]

export interface ExploreKeywordGroup {
  key: 'exercise' | 'meal'
  label: string
  keywords: readonly string[]
}

/**
 * 추천 검색어(시안용). 검색 화면이 검색어를 받을 수 있게 되기 전까지는 누를 수 없는 예시로만 보여 준다.
 * 검색어 전달이 가능해지면 항목마다 이동 경로를 추가한다.
 */
export const EXPLORE_KEYWORD_GROUPS: readonly ExploreKeywordGroup[] = [
  { key: 'exercise', label: '운동', keywords: ['스쿼트', '맨몸 운동'] },
  { key: 'meal', label: '식단', keywords: ['계란', '닭가슴살'] },
]
