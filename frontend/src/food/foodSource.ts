import type { FoodRepository } from './foodRepository.ts'
import { serverFoodRepository } from './server/serverFoodRepository.ts'

/**
 * 음식 데이터 연결 자리.
 * - 개발용 체험 로그인(VITE_DEV_AUTH=true)일 때만 개발용 예시 음식 4개를 쓴다.
 * - 그 외에는 백엔드 음식 API(GET /foods)에 연결한다.
 */
const sampleModule =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'
    ? await import('./dev/sampleFoodRepository.ts')
    : null

export function createFoodRepository(): FoodRepository | null {
  return sampleModule
    ? sampleModule.createSampleFoodRepository()
    : serverFoodRepository
}
