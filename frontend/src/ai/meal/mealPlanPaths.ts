import { PATH_I03 } from '../../meal-goal/mealGoalPaths.ts'

/**
 * AI 식단 플랜(I03~I03-3)의 경로. 사용자가 확정한 URL이다(화면명세 v5.0은 URL을 정의하지 않는다).
 * I03 목표 확인 `/ai/meal` → I03-1 끼니 선택 → I03-2 음식 조건 → I03-3 추천·등록.
 * 목표가 없을 때 I07(`/ai/meal/goal-required`)로 보내는 경로는 meal-goal/mealGoalPaths.ts에 있다.
 */
export const PATH_AI_MEAL = PATH_I03
export const PATH_AI_MEAL_MEALS = '/ai/meal/meals'
export const PATH_AI_MEAL_FOODS = '/ai/meal/foods'
export const PATH_AI_MEAL_PLAN = '/ai/meal/plan'
