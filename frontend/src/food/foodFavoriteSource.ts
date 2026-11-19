import type { FoodFavoriteRepository } from './foodFavoriteRepository.ts'

/**
 * 음식 즐겨찾기의 데이터 출처. 지금은 개발 서버에서만 Mock 저장소(계정별 localStorage)를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 조회·저장 수단이 없다(API 연결 전)"는 뜻이며 화면은 "준비 중"으로 안내한다. 운영에서는 즐겨찾기가 저장된 것처럼 동작하지 않고
 * 로컬 저장소에 남기지도 않는다. import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 Mock 청크가 제거된다(exercise/favoriteSource.ts와 같은 방식).
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockFoodFavoriteRepository.ts')
  : null
const mockStorage = import.meta.env.DEV
  ? await import('../dev-mock/devMockStorage.ts')
  : null

export function createFoodFavoriteRepository(
  userId: string,
): FoodFavoriteRepository | null {
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'foodFavorite')) return null
  return mockModule.createMockFoodFavoriteRepository({ userId })
}
