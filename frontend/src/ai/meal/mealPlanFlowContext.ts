import { createContext, useContext } from 'react'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import type { MealType } from '../../food/mealModel.ts'
import type { PlanRequestState, MealPlanSource } from './mealPlanContract.ts'
import type {
  ExcludedFoodGroup,
  FoodTypeChoice,
  MealPlanSelection,
  PlanStep,
} from './mealPlanFlow.ts'

/** AI 식단 플랜 흐름의 공유 상태와 조작. 화면은 이 값만 읽고 바꾼다. */
export interface MealPlanFlowValue {
  selection: MealPlanSelection
  request: PlanRequestState
  notice: string | null
  /** 안내를 보일 단계. null이면 어느 단계에서나 보인다. */
  noticeStep: PlanStep | null
  /** 서버 연결(없으면 null: 연결 전). */
  source: MealPlanSource | null
  /** null이면 하루 목표를 기준으로 끼니당 열량을 자동 제안한다. */
  targetCalories: string | null
  setTargetCalories: (value: string) => void
  toggleMeal: (meal: MealType, date: LocalDate) => void
  toggleAllMeals: (date: LocalDate) => void
  setFoodType: (value: FoodTypeChoice) => void
  toggleKind: (kind: string) => void
  toggleExcluded: (foodId: string) => void
  toggleExcludedGroup: (group: ExcludedFoodGroup) => void
  resetConditions: () => void
  /** 화면이 본 식단 목표의 시점을 알린다. 흐름 중에 달라지면 선택을 비운다. */
  syncGoal: (stamp: string) => void
  /** 지금의 "내일" 날짜를 알린다. 선택한 날짜와 달라지면 선택을 비운다. */
  syncDate: (date: LocalDate) => void
  /** 추천을 요청한다. 진행 중이거나 입력이 모자라면 아무것도 하지 않는다(중복 요청 방지). */
  startRequest: (goalUpdatedAt: string, dailyGoalKcal: number) => void
  /** 진행 중인 요청을 취소하고 요청 전 상태로 돌린다. */
  cancelRequest: () => void
  dismissNotice: () => void
}

export const MealPlanFlowContext = createContext<MealPlanFlowValue | null>(null)

export function useMealPlanFlow(): MealPlanFlowValue {
  const value = useContext(MealPlanFlowContext)
  if (value === null) {
    throw new Error('MealPlanFlowProvider 안에서만 쓸 수 있어요.')
  }
  return value
}
