/**
 * 통합검색(/search)의 공통 타입과 검색 처리 경계.
 *
 * 운동·음식 검색 API(GET /api/v1/exercises, GET /api/v1/foods)는 명세서에 경로만 있고 요청·응답 구조가 정의되지 않았으며
 * 연결된 코드도 없다(frontend/docs/api-status.md). 그래서 아래 결과 타입은 화면을 그리기 위한 임시 형태이지 API 계약이 아니다.
 * 필드는 모두 "있을 때만" 보여 주며, 값이 없는 항목을 만들어 채우지 않는다.
 */

/** 검색 범위. food는 URL 검색 파라미터(c)에도 같은 값으로 쓴다. */
export type SearchCategory = 'all' | 'exercise' | 'food'

export interface ExerciseResult {
  id: string
  name: string
  /** 운동 부위. 없으면 표시하지 않는다. */
  bodyPart?: string
  /** 난이도. 없으면 표시하지 않는다. */
  difficulty?: string
  /** 운동 도구. 없으면 표시하지 않는다. */
  tool?: string
}

export interface FoodResult {
  id: string
  name: string
  /** 영양 정보 한 줄 요약(예: 단위·열량). 없으면 표시하지 않는다. */
  nutrition?: string
  /** 식품 구분(음식 탐색 결과용). 없으면 표시하지 않는다. */
  type?: string
  /** 음식 종류(음식 탐색 결과용). 없으면 표시하지 않는다. */
  kind?: string
  /** 100g 기준으로 환산된 값인지(음식 탐색 결과용). 아니면 "영양 기준 미확인"으로 표시한다. */
  per100g?: boolean
  /** 100g당 열량(kcal). null·없음은 "정보 없음"이며 0과 다르다. */
  kcal?: number | null
  /** 100g당 단백질(g). null·없음은 "정보 없음"이며 0과 다르다. */
  protein?: number | null
}

/**
 * 검색 한 번의 결과.
 * - unavailable: 데이터 소스(검색 API·데이터)가 연결되지 않았다. "결과 없음"이나 "오류"가 아니다.
 * - error: 연결은 되어 있으나 검색에 실패했다.
 * - results: 검색에 성공했다. 두 목록이 모두 비어 있으면 "결과 없음"이다.
 */
export type SearchOutcome =
  | { status: 'unavailable' }
  | { status: 'error' }
  | {
      status: 'results'
      exercises: readonly ExerciseResult[]
      foods: readonly FoodResult[]
    }

/**
 * 검색 처리 경계. SearchPage는 이 인터페이스만 안다.
 * 검색 API가 정해지면 이 인터페이스를 구현한 객체로 `searchBackend.ts`의 연결을 교체한다.
 */
export interface SearchBackend {
  search(query: string, category: SearchCategory): Promise<SearchOutcome>
}
