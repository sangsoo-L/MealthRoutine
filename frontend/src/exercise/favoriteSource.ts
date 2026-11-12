import type { ExerciseFavoriteRepository } from './favoriteRepository.ts'

/**
 * 운동 즐겨찾기의 데이터 출처. 지금은 개발 서버에서만 Mock 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 조회·저장 수단이 없다(API 연결 전)"는 뜻이며, 화면은 이를 "준비 중"으로 안내한다. 그래서 운영에서는 즐겨찾기가
 * 저장된 것처럼 동작하지 않고, 즐겨찾기 정보를 로컬 저장소에 남기지도 않는다.
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크가 제거된다
 * (exerciseSource.ts, body-measurements/bodySource.ts와 같은 방식).
 *
 * 저장소는 사용자 id로만 만든다. id는 인증 Context(useAuth)가 준 값이며, 임의로 만들지 않는다.
 * 실제 API가 정해지면 ExerciseFavoriteRepository를 구현한 객체를 만들어 아래 반환을 교체한다.
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockFavoriteRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export function createFavoriteRepository(
  userId: string,
): ExerciseFavoriteRepository | null {
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'exerciseFavorite')) return null
  return mockModule.createMockFavoriteRepository({ userId })
}
