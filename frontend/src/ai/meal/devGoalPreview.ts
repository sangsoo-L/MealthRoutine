import { CURRENT_POLICY_VERSION } from '../../meal-goal/mealGoalPolicy.ts'
import type { MealGoal, MealGoalState } from '../../meal-goal/mealGoalTypes.ts'

/**
 * [개발 전용] AI 식단 플랜 화면 검증용 식단 목표 상태.
 *
 * D01-4는 계산 기준 검증 전이라 저장 버튼이 항상 막혀 있어 목표 있음 상태를 실제로 만들 수 없다. 그 우회로 실제 목표를 저장하지 않고,
 * 개발 서버에서만 주소의 `?devGoal=<상태>`로 이 화면의 목표 상태를 메모리 값으로 바꿔 레이아웃과 분기를 확인한다.
 * - 개발 서버에서만 호출된다. 호출 쪽(`useMealPlanGoal`)이 `import.meta.env.DEV`로 막아 운영 빌드에서는 이 코드가 제거된다.
 * - 목표 저장소·D01-4 저장 정책·추천 API·체험 횟수와 무관하다. 아무것도 저장하지 않고 읽지도 않는다.
 * - `ready`의 수치는 레이아웃 확인용 표시 값일 뿐 실제 목표나 권장량이 아니다. 화면이 "개발용 검증 상태"를 항상 함께 알린다.
 */
export type DevGoalPreview =
  'loading' | 'error' | 'unavailable' | 'missing' | 'ready'

export const DEV_GOAL_PARAM = 'devGoal'
const PREVIEWS: readonly DevGoalPreview[] = [
  'loading',
  'error',
  'unavailable',
  'missing',
  'ready',
]

/** 주소의 검색 문자열에서 검증 상태를 읽는다. 알 수 없는 값은 null이다. */
export function parseDevGoalPreview(search: string): DevGoalPreview | null {
  const value = new URLSearchParams(search).get(DEV_GOAL_PARAM)
  return PREVIEWS.find((preview) => preview === value) ?? null
}

/** 화면 이동 때 검증 상태를 이어 가는 검색 문자열(없으면 빈 문자열). 값은 상태 이름뿐이고 수치·개인정보를 담지 않는다. */
export function devGoalSearch(preview: DevGoalPreview | null): string {
  return preview === null ? '' : `?${DEV_GOAL_PARAM}=${preview}`
}

const PREVIEW_GOAL: MealGoal = {
  v: 1,
  calculationVersion: CURRENT_POLICY_VERSION,
  source: 'calculated',
  purpose: 'maintain',
  level: null,
  activity: null,
  kcal: 2000,
  ratio: { carb: 50, protein: 30, fat: 20 },
  basis: { profileUpdatedAt: '2000-01-01T00:00:00.000Z' },
  revision: 1,
  updatedAt: '2000-01-01T00:00:00.000Z',
}

export function devGoalState(preview: DevGoalPreview): MealGoalState {
  switch (preview) {
    case 'loading':
      return { status: 'loading' }
    case 'error':
      return { status: 'error' }
    case 'unavailable':
      return { status: 'unavailable' }
    case 'missing':
      return { status: 'ready', goal: null }
    case 'ready':
      return { status: 'ready', goal: PREVIEW_GOAL }
  }
}
