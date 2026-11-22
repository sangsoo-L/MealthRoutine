import type { MealGoalRepository } from './mealGoalTypes.ts'

/**
 * 식단 목표의 데이터 출처. 지금은 개발 서버에서만 회원별 로컬 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 목표를 읽거나 저장할 수단이 없다(API 연결 전)"는 뜻이며 화면은 목표가 없다고 단정하지 않고 준비 중으로 안내한다.
 * 운영 빌드에서 localStorage를 운영 저장소처럼 쓰지 않는다. import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 로컬 구현 청크가 제거된다.
 *
 * 실제 API(`/api/v1/diet-goals`)의 구조가 정해지면 MealGoalRepository를 구현한 객체를 만들어 아래 반환을 교체한다(화면은 그대로).
 */
const local = import.meta.env.DEV
  ? await import('./local/localMealGoalRepository.ts')
  : null

export function createMealGoalRepository(
  ownerId: string,
): MealGoalRepository | null {
  return local ? local.createLocalMealGoalRepository(ownerId) : null
}
