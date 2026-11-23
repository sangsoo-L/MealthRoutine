import { useLocation } from 'react-router'
import { useMealGoal } from '../../meal-goal/useMealGoal.ts'
import type { MealGoalState } from '../../meal-goal/mealGoalTypes.ts'
import {
  devGoalSearch,
  devGoalState,
  parseDevGoalPreview,
  type DevGoalPreview,
} from './devGoalPreview.ts'

export interface MealPlanGoal {
  state: MealGoalState
  reload: () => void
  /** 개발 서버의 검증 상태. 실제 사용자 흐름에서는 항상 null이다. */
  devPreview: DevGoalPreview | null
  /** 단계 이동 때 붙일 검색 문자열(검증 상태를 이어 간다). 실제 흐름에서는 빈 문자열. */
  devSearch: string
}

/**
 * AI 식단 플랜 화면이 쓰는 식단 목표 상태. 기본은 이 회원의 목표 조회(`useMealGoal`, 읽기 전용)다.
 * 개발 서버에서 주소에 `?devGoal=<상태>`가 있으면 그 상태를 메모리 값으로 대신 돌려준다(목표를 저장하거나 저장소를 바꾸지 않는다).
 * 운영 빌드는 `import.meta.env.DEV`가 false라 검증 상태를 읽는 코드가 제거되고 항상 실제 조회 결과만 쓴다.
 */
export function useMealPlanGoal(userId: string | null): MealPlanGoal {
  const real = useMealGoal(userId)
  const { search } = useLocation()
  const devPreview = import.meta.env.DEV ? parseDevGoalPreview(search) : null
  if (devPreview === null) {
    return { ...real, devPreview: null, devSearch: '' }
  }
  return {
    state: devGoalState(devPreview),
    reload: real.reload,
    devPreview,
    devSearch: devGoalSearch(devPreview),
  }
}
