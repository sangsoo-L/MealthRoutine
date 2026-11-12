import type { HealthGoalRepository } from './goalRepository.ts'

/**
 * 건강관리 목표의 데이터 출처. 지금은 개발 서버에서만 Mock 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 조회·저장 수단이 없다(API 연결 전)"는 뜻이며, 화면은 목표 설정을 열지 않고 연결 전 상태로 안내한다.
 * 운영에는 Mock 목표가 없다. import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크가 제거된다.
 *
 * 실제 API가 정해지면 HealthGoalRepository를 구현한 객체를 만들어 아래 반환을 교체한다.
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockGoalRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export function createGoalRepository(
  userId: string,
): HealthGoalRepository | null {
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'goal')) return null
  return mockModule.createMockGoalRepository({ userId })
}
