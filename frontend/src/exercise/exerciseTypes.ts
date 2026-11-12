import type { ExerciseDifficulty, ExerciseTool } from './exerciseTaxonomy.ts'

/**
 * 운동 도메인의 운동(마스터) 타입. 탐색·상세·루틴·기록이 모두 이 `id`를 같은 운동의 식별자로 쓴다.
 *
 * 운동 데이터의 실제 출처(외부 API·자체 DB·운동 마스터 테이블)는 확정되지 않았다. 이 타입은 화면이 필요로 하는 값만 담은 임시 형태이며
 * 실제 API 응답 구조가 아니다. 실제 정책이 정해지면 변환을 저장소 구현에 둔다.
 */

/** 큰 분류. 개발용 Mock 데이터의 분류이며 운동 부위 필터의 큰 분류(상체·하체·코어·전신)와 값이 겹친다. */
export type ExerciseCategory = '상체' | '하체' | '전신'

export interface Exercise {
  /** 운동 식별자. 루틴·운동 기록이 같은 값으로 이 운동을 가리킨다. */
  id: string
  name: string
  category: ExerciseCategory
  /** 자극 부위(세부 부위 이름은 ALL_PARTS의 값) */
  targetMuscles: readonly string[]
  difficulty: ExerciseDifficulty
  /** 필요한 도구. 맨몸이면 ['맨몸'] */
  equipment: readonly ExerciseTool[]
  /** 단계별 운동 방법 */
  instructions: readonly string[]
  /** 주의사항 */
  precautions: readonly string[]
  /** 대표 이미지. 없으면 화면이 공통 플레이스홀더를 쓴다(이미지가 있는 것처럼 보이지 않는다). */
  imageUrl?: string
}

/**
 * 운동 검색 결과 한 건(목록 카드·통합검색 행용 요약). 운동 부위·도구는 운동 데이터(Exercise)의 배열을 그대로 담는다.
 * 화면에 보이는 문자열("가슴·어깨·팔")은 표시하는 쪽이 만든다. 문자열로 합쳐 넘기지 않으므로 다시 나눌 필요가 없고,
 * 운동 선택 화면(루틴·기록)이나 즐겨찾기 목록 같은 곳이 부위·도구를 따로 쓸 수 있다.
 * 운동 검색 API(GET /api/v1/exercises)의 응답 구조는 미확정이라 이 타입은 화면을 그리기 위한 임시 형태이지 API 계약이 아니다.
 * 페이지(pages/)와 컴포넌트(components/)가 모두 이 도메인 타입을 참조한다(페이지 모듈은 import하지 않는다).
 */
export interface ExerciseResult {
  id: string
  name: string
  /** 운동 부위(세부 부위). 비어 있으면 표시하지 않는다. */
  bodyParts: readonly string[]
  /** 난이도. 없으면 표시하지 않는다. */
  difficulty?: string
  /** 운동 도구. 비어 있으면 표시하지 않는다. */
  tools: readonly string[]
}

/**
 * 운동 목록 조회 조건. 운동 탐색 화면의 검색 조건과 같은 모양이다. null은 "전체"(조건 없음)이고 조건끼리는 독립(AND)이다.
 * `part`는 세부 부위(예: 가슴) 또는 큰 분류(상체·하체·코어·전신) 이름이다.
 */
export interface ExerciseQuery {
  /** 운동 이름 검색어(부분 일치, 대소문자·공백 무시). 빈 문자열이면 이름 조건 없음 */
  query: string
  difficulty: string | null
  part: string | null
  tool: string | null
}
