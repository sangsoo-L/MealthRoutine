import { createApiExerciseRepository } from './api/apiExerciseRepository.ts'
import type { ExerciseRepository } from './exerciseRepository.ts'

/**
 * 운동 데이터의 출처.
 *
 * - 운영 빌드: 운동 API(GET /api/v1/exercises) 저장소(kind 'api'). 카탈로그 전체를 처음에 한 번 받아 두므로 저장소 객체 하나를 계속 쓴다.
 * - 개발 서버: 운동 JSON 시드 저장소(seed/). DB 운동 시드가 같은 파일에서 만들어져 운동 id가 서버와 같다.
 *   import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 시드 청크가 제거된다(body-measurements/bodySource.ts와 같은 방식).
 *
 * 이전의 Mock 운동 15종(mock/mockExerciseRepository.ts)은 더 이상 연결하지 않는다(파일은 남겨 두었다).
 */
const seedModule = import.meta.env.DEV
  ? await import('./seed/seedExerciseRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

let apiRepository: ExerciseRepository | null = null

export function createExerciseRepository(): ExerciseRepository | null {
  if (!import.meta.env.DEV) {
    apiRepository ??= createApiExerciseRepository()
    return apiRepository
  }
  if (!seedModule || !mockStorage) return null
  // 개발·검수용: 데이터 소스 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'exercise')) return null
  return seedModule.createSeedExerciseRepository()
}
