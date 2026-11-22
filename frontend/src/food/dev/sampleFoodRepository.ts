import type { FoodRepository } from '../foodRepository.ts'
import { DEV_FOODS } from './devFoodSamples.ts'

/** [개발 전용] 개발용 예시 음식 저장소. 개발 서버에서만 불러온다. 조회마다 복사본을 돌려줘 호출한 쪽이 원본을 바꿀 수 없다. */
export function createSampleFoodRepository(): FoodRepository {
  return {
    kind: 'dev-sample',
    list: () => Promise.resolve(structuredClone(DEV_FOODS)),
    getById: (foodId) =>
      Promise.resolve(
        structuredClone(DEV_FOODS.find((food) => food.id === foodId) ?? null),
      ),
  }
}
