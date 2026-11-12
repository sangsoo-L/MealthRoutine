import type { Exercise, ExerciseQuery } from './exerciseTypes.ts'

/**
 * 운동(마스터) 데이터의 경계. 운동 탐색·상세가 이 인터페이스만 안다.
 *
 * 운동 데이터의 실제 출처(외부 API·자체 DB)는 아직 정해지지 않았다. 개발 환경의 Mock 구현(mock/mockExerciseRepository.ts)과
 * 나중에 만들 API 구현을 이 인터페이스로 교체한다. 운동 검색 API(GET /api/v1/exercises)의 요청·응답 구조는 명세서에 없으므로
 * 연결하지 않았다.
 *
 * 운동 `id`는 이후 루틴·운동 기록이 같은 값으로 참조한다. 운동 데이터는 계정과 무관한 공용 데이터라서 계정별로 나뉘지 않는다.
 */
export interface ExerciseRepository {
  /** 'mock'이면 개발용 예시 데이터이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'api'

  /** 조건에 맞는 운동 목록. 조건이 모두 비어 있으면 전체다. 조회가 실패하면 예외를 던진다. */
  list(query: ExerciseQuery): Promise<readonly Exercise[]>

  /** 운동 하나(상세). 없으면(삭제된 운동 포함) null이다. 조회가 실패하면 예외를 던진다. */
  getById(id: string): Promise<Exercise | null>
}
