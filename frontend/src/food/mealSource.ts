import type { MealRecordRepository } from './mealRepository.ts'

/**
 * 식단 기록의 저장소 출처. 지금은 개발 서버에서만 IndexedDB 로컬 저장소(mealRecords, DB v3)를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 저장 수단이 연결되어 있지 않다"는 뜻이며 화면은 "준비 중"으로 안내한다(가짜 기록을 만들지 않는다).
 * 로컬 저장소는 이 브라우저에만 있는 사본이다(서버 보관이 아니다). 저장소는 계정 id로만 만든다.
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 로컬 저장소 청크가 제거된다(exercise/workoutSource.ts와 같은 방식).
 * 서버 연동(`/api/v1/meal-records`)이 정해지면 같은 인터페이스를 구현한 객체로 아래 반환을 교체한다(화면은 그대로).
 */
const localModule = import.meta.env.DEV
  ? await import('./local/indexedDbMealRepository.ts')
  : null

export function createMealRecordRepository(
  ownerId: string,
): MealRecordRepository | null {
  return localModule
    ? localModule.createIndexedDbMealRecordRepository(ownerId)
    : null
}
