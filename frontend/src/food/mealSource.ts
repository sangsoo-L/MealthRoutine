import type { MealRecordRepository } from './mealRepository.ts'
import { createServerMealRecordRepository } from './server/serverMealRepository.ts'

/**
 * 식단 기록 연결 자리.
 * - 개발용 체험 로그인(VITE_DEV_AUTH=true)일 때만 브라우저 저장소(IndexedDB)를 쓴다.
 * - 그 외에는 백엔드 식단 기록 API(/meal-records)에 연결한다.
 */
const localModule =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'
    ? await import('./local/indexedDbMealRepository.ts')
    : null

export function createMealRecordRepository(
  ownerId: string,
): MealRecordRepository | null {
  return localModule
    ? localModule.createIndexedDbMealRecordRepository(ownerId)
    : createServerMealRecordRepository(ownerId)
}
