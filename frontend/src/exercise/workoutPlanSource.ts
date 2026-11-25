import { createIndexedDbWorkoutPlanRepository } from './local/indexedDbWorkoutPlanRepository.ts'
import type { WorkoutPlanRepository } from './workoutPlanRepository.ts'

/**
 * 내일 운동 계획의 저장소 출처. 개발 서버와 운영 빌드 모두 이 브라우저의 IndexedDB 로컬 저장소(workoutPlans, DB v5)를 쓴다.
 * 서버에는 계획을 담을 테이블이 없다. 로컬 저장소는 이 브라우저에만 있는 사본이다(서버 보관이 아니다).
 * 저장소는 계정 id로만 만들고, 계정 격리·로그아웃 규칙은 workoutSource.ts와 같다.
 */
export function createWorkoutPlanRepository(
  ownerId: string,
): WorkoutPlanRepository | null {
  return createIndexedDbWorkoutPlanRepository(ownerId)
}
