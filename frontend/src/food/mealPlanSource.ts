import type { MealPlanRepository } from './mealPlanRepository.ts'

/**
 * 내일 식단 계획의 저장소 출처. 지금은 개발 서버에서만 IndexedDB 로컬 저장소(mealPlans, DB v4)를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 저장 수단이 연결되어 있지 않다"는 뜻이며 화면은 "준비 중"으로 안내한다(가짜 계획을 만들지 않는다).
 * 로컬 저장소는 이 브라우저에만 있는 사본이다(서버 보관이 아니다). 저장소는 계정 id로만 만든다.
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 로컬 저장소 청크가 제거된다(food/mealSource.ts와 같은 방식).
 */
const localModule = import.meta.env.DEV
  ? await import('./local/indexedDbMealPlanRepository.ts')
  : null

export function createMealPlanRepository(
  ownerId: string,
): MealPlanRepository | null {
  return localModule
    ? localModule.createIndexedDbMealPlanRepository(ownerId)
    : null
}
