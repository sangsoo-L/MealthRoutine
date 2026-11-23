/**
 * 운동 검색 조건의 공통 정의. 운동 탐색 페이지(pages/exerciseSearch.ts·ExercisesPage)와 운동 컴포넌트(components/exercise/)가 함께 쓴다.
 * 컴포넌트가 페이지 모듈을 import하지 않도록(의존 방향: 페이지 → 공통, 컴포넌트 → 공통) 이 값들을 도메인 폴더에 둔다.
 *
 * 필터 항목과 값은 화면명세 v5.0 E01의 운동 검색 화면을 따른다. 난이도·운동 부위·운동 도구는 각각 하나만 고르고(단일 선택),
 * 서로 독립된 조건이며 "전체"는 값 없음(null)이다. 선택지 값 자체는 exerciseTaxonomy.ts에 있다.
 * 운동 검색 API(GET /api/v1/exercises)의 요청·응답 구조는 미확정이라 이 값들은 화면을 그리기 위한 것이며 API 코드값이 아니다.
 */

export type FilterKey = 'difficulty' | 'part' | 'tool'

/** null은 "전체"(조건 없음). */
export type ExerciseFilters = Record<FilterKey, string | null>

export const EMPTY_FILTERS: ExerciseFilters = {
  difficulty: null,
  part: null,
  tool: null,
}

export const FILTER_LABELS: Record<FilterKey, string> = {
  difficulty: '난이도',
  part: '운동 부위',
  tool: '운동 도구',
}

/** 운동 이름과 필터 조건. 검색하기를 누를 때의 값이다. */
export interface ExerciseCriteria {
  query: string
  filters: ExerciseFilters
}

export const MAX_EXERCISE_QUERY = 50
