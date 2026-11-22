import type { FoodRepository } from './foodRepository.ts'

/**
 * 음식 데이터의 출처. 지금은 개발 서버에서만 개발용 예시(스토리보드 foodDB 4개)를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 음식 데이터가 연결되어 있지 않다(API 연결 전)"는 뜻이며 화면은 "준비 중"으로 안내한다(가짜 음식을 만들지 않는다).
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 예시 데이터 청크가 제거된다(exercise/exerciseSource.ts와 같은 방식).
 * 실제 음식 API가 정해지면 FoodRepository를 구현한 객체를 만들어 아래 반환을 교체한다(화면은 그대로).
 */
const sampleModule = import.meta.env.DEV
  ? await import('./dev/sampleFoodRepository.ts')
  : null

export function createFoodRepository(): FoodRepository | null {
  return sampleModule ? sampleModule.createSampleFoodRepository() : null
}
