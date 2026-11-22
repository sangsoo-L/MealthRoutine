import type { BodyMeasurementRepository } from './bodyRepository.ts'

/**
 * 신체 정보의 데이터 출처. 지금은 개발 서버에서만 Mock 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 조회·저장 수단이 없다(API 연결 전)"는 뜻이며, 화면은 이를 신체 정보 누락으로 보지 않는다
 * (홈 안내를 띄우지 않고 마이페이지는 마스킹만 한다). 그래서 운영에는 Mock 신체 정보가 없고, 민감한 신체 정보를 로컬 저장소에
 * 저장하지 않는다.
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크가 제거된다
 * (assessmentSource.ts, mypage/mypageSource.ts와 같은 방식).
 *
 * 실제 API가 정해지면 BodyMeasurementRepository를 구현한 객체를 만들어 아래 반환을 교체한다.
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockBodyRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export function createBodyRepository(
  userId: string,
): BodyMeasurementRepository | null {
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'body')) return null
  return mockModule.createMockBodyRepository({ userId })
}
