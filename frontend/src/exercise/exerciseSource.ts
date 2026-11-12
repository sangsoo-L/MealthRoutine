import type { ExerciseRepository } from './exerciseRepository.ts'

/**
 * 운동 데이터의 출처. 지금은 개발 서버에서만 Mock 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 운동 데이터가 연결되어 있지 않다"는 뜻이며, 화면은 이를 "준비 중"으로 안내한다(결과 없음·오류와 구분).
 * 운영에는 Mock 운동 데이터가 없다. import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크가 제거된다
 * (body-measurements/bodySource.ts와 같은 방식).
 *
 * 실제 운동 데이터 정책(외부 API·자체 DB·운동 마스터)이 정해지면 ExerciseRepository를 구현한 객체를 만들어 아래 반환을 교체한다.
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockExerciseRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export function createExerciseRepository(): ExerciseRepository | null {
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: 데이터 소스 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'exercise')) return null
  return mockModule.createMockExerciseRepository()
}
