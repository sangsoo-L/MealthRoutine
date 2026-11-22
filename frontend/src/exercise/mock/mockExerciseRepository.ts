import { mockDelay, mockFlag } from '../../dev-mock/devMockStorage.ts'
import type { ExerciseRepository } from '../exerciseRepository.ts'
import { MOCK_EXERCISES } from './mockExerciseData.ts'
import { filterExercises } from './filterExercises.ts'

/**
 * [개발 전용] 운동 Mock 저장소. 서버·DB가 맡을 운동 조회를 개발 환경에서 흉내 낸다. 개발 서버에서만 불러온다(exerciseSource.ts).
 *
 * - 운동은 계정과 무관한 공용 데이터라 저장소에 쓰는 것이 없다(조회만 한다). 데이터는 mockExerciseData.ts의 15종이다.
 * - 짧은 지연을 둔다(로딩 상태를 실제처럼 확인하기 위함). 개발·검수용 스위치(mockFlag)로 조회 실패를 재현할 수 있다.
 * - 돌려주는 값은 읽기 전용 원본이다(호출한 쪽이 바꾸지 못하게 얼려 둔 배열을 그대로 쓴다).
 */
export function createMockExerciseRepository(options?: {
  latencyMs?: number
}): ExerciseRepository {
  const latencyMs = options?.latencyMs ?? 300

  return {
    kind: 'mock',

    async list(query) {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'exercise')) throw new Error('mock load failure')
      return filterExercises(MOCK_EXERCISES, query)
    },

    async getById(id) {
      await mockDelay(latencyMs)
      if (mockFlag('failLoad', 'exercise')) throw new Error('mock load failure')
      return MOCK_EXERCISES.find((e) => e.id === id) ?? null
    },
  }
}
