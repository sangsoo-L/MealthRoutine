import { safeReturnPath } from './mealGoalPolicy.ts'

/**
 * 식단 목표 화면의 경로. v5.0은 URL을 정의하지 않아 아래 두 URL은 임시 후보이며 사용자 확인이 필요하다(frontend/docs/screen-route-map.md).
 * 목표 화면은 D01-4 `/records/meal/goal`, 목표 미설정 안내는 I07 `/ai/meal/goal-required`다.
 */
export const PATH_MEAL_GOAL = '/records/meal/goal'
export const PATH_MEAL_GOAL_REQUIRED = '/ai/meal/goal-required'

/** I03 AI 식단 플랜의 진입 경로 후보. I03은 아직 구현되지 않아 라우트가 없다(I03을 만들 때 true로 바꾼다). */
export const PATH_I03 = '/ai/meal'
export const I03_IMPLEMENTED = false

/**
 * 목표 설정을 마친 뒤(또는 취소하고) 돌아갈 경로. 허용 목록 안의 내부 경로만 쓰고, 그 밖이면 fallback이다.
 * I03이 아직 없으면 존재하지 않는 페이지로 보내지 않고 AI 서비스 안내(`/ai`)로 연결한다.
 */
export function resolveReturnPath(value: unknown, fallback: string): string {
  const path = safeReturnPath(value, fallback)
  return path === PATH_I03 && !I03_IMPLEMENTED ? '/ai' : path
}
