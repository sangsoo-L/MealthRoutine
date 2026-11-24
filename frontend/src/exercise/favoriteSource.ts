import { createApiFavoriteRepository } from './api/apiFavoriteRepository.ts'
import type { ExerciseFavoriteRepository } from './favoriteRepository.ts'

/**
 * 운동 즐겨찾기의 데이터 출처.
 *
 * - 운영 빌드: 즐겨찾기 API(/api/v1/users/me/favorite-exercises) 저장소(kind 'api'). 서버가 로그인 토큰으로 회원을 정한다.
 * - 개발 서버: Mock 저장소(localStorage). import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크가 제거된다
 *   (exerciseSource.ts, body-measurements/bodySource.ts와 같은 방식).
 *
 * 저장소는 사용자 id로만 만든다. id는 인증 Context(useAuth)가 준 값이며, 임의로 만들지 않는다. API 저장소는 이 id를 요청에 쓰지 않지만
 * 화면은 계정이 바뀌면 저장소를 새로 만들어 이전 계정의 목록을 버린다(FavoritesProvider).
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
  if (!import.meta.env.DEV) return createApiFavoriteRepository()
  if (!mockModule || !mockStorage) return null
  // 개발·검수용: API 미연결 상태를 재현한다.
  if (mockStorage.mockFlag('unavailable', 'exerciseFavorite')) return null
  return mockModule.createMockFavoriteRepository({ userId })
}
