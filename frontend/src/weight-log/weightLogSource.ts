import type { WeightLogRepository } from './weightLogTypes.ts'

/**
 * 몸무게 기록의 데이터 출처. 지금은 개발 서버에서만 Mock 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 조회·저장 수단이 없다(API 연결 전)"는 뜻이며, 화면은 이를 기록 없음이나 확인 필요로 보지 않는다.
 * 그래서 운영에는 Mock 이력이 없고, 민감한 몸무게 이력을 로컬 저장소에 저장하지 않는다.
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크가 제거된다(body-measurements/bodySource.ts와 같은 방식).
 * 실제 API 계약이 정해지면 WeightLogRepository를 구현한 객체를 만들어 아래 반환을 교체한다.
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockWeightLogRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export function createWeightLogRepository(
  userId: string,
): WeightLogRepository | null {
  // 계정 id가 없으면 어떤 계정의 기록도 읽거나 쓰지 않는다.
  if (!userId || !mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'weightLog')) return null
  return mockModule.createMockWeightLogRepository({ userId })
}
