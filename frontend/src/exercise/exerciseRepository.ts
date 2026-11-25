import type { Exercise, ExerciseQuery } from './exerciseTypes.ts'

/**
 * 운동(마스터) 데이터의 경계. 운동 탐색·상세가 이 인터페이스만 안다.
 *
 * 운영 빌드는 운동 API(GET /api/v1/exercises, docs/api_exercise_v1.0.md) 구현(api/apiExerciseRepository.ts)을, 개발 서버는 운동 JSON 시드
 * 구현(seed/seedExerciseRepository.ts)을 쓴다. 서버 DB 시드가 같은 JSON에서 만들어져 두 구현의 운동 id와 값이 같다.
 *
 * 운동 `id`는 이후 루틴·운동 기록이 같은 값으로 참조한다. 운동 데이터는 계정과 무관한 공용 데이터라서 계정별로 나뉘지 않는다.
 */
export interface ExerciseRepository {
  /** 'mock'은 개발용 예시 데이터, 'seed'는 운동 JSON 시드(exercise/seed/)이며 둘 다 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'seed' | 'api'

  /** 조건에 맞는 운동 목록. 조건이 모두 비어 있으면 전체다. 조회가 실패하면 예외를 던진다. */
  list(query: ExerciseQuery): Promise<readonly Exercise[]>

  /** 운동 하나(상세). 없으면(삭제된 운동 포함) null이다. 조회가 실패하면 예외를 던진다. */
  getById(id: string): Promise<Exercise | null>
}
