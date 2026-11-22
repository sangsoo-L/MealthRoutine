import { mockDelay, mockFlag } from '../../dev-mock/devMockStorage.ts'
import type { ExerciseRepository } from '../exerciseRepository.ts'
import { getSeedCatalog } from './seedData.ts'

/**
 * [개발 전용] 운동 JSON 시드(exercise/seed/)를 ExerciseRepository로 보여 주는 저장소. 개발 서버에서만 불러온다(exerciseSource.ts).
 *
 * - 운동은 계정과 무관한 공용 읽기 전용 데이터라 저장소에 쓰는 것이 없다(조회만 한다).
 * - 짧은 지연을 둔다(로딩 상태를 실제처럼 확인하기 위함). 개발·검수용 스위치(mockFlag)로 조회 실패를 재현할 수 있다.
 * - 시드가 올바르지 않으면 조회가 예외를 던진다(화면은 오류 상태). 문제 있는 운동만 빼고 보여 주지 않는다.
 * - 실제 서비스 API가 정해지면 이 저장소를 API 구현으로 바꾼다(운동 JSON은 그 API가 돌려줄 값과 같은 모양을 목표로 한 원본이다).
 */
export function createSeedExerciseRepository(options?: {
  latencyMs?: number
}): ExerciseRepository {
  const latencyMs = options?.latencyMs ?? 300

  return {
    kind: 'seed',

    async list(query) {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'exercise')) throw new Error('mock load failure')
      return getSeedCatalog().queryExercises(query)
    },

    async getById(id) {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'exercise')) throw new Error('mock load failure')
      return getSeedCatalog().getExerciseById(id)
    },
  }
}
