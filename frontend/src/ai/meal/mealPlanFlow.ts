import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { MEAL_TYPES, type MealType } from '../../food/mealModel.ts'
import { FOOD_TYPES, kindsFor } from '../../pages/foodSearch.ts'
import {
  PATH_AI_MEAL,
  PATH_AI_MEAL_FOODS,
  PATH_AI_MEAL_MEALS,
  PATH_AI_MEAL_PLAN,
} from './mealPlanPaths.ts'

/**
 * AI 식단 플랜(I03~I03-3)의 단계 입력 모델(순수 함수). 영양 계산·끼니 배분·후보 수 계산·추천은 하지 않는다(서버 담당).
 * 이 파일은 사용자가 고른 값(끼니·음식 조건)과 그 값을 다루는 규칙만 가진다.
 * 식품 구분·음식 종류의 값은 F01(`pages/foodSearch.ts`)과 같은 것을 쓴다(명세 I03-2: F01과 동일).
 */

export type PlanStep = 'goal' | 'meals' | 'foods' | 'plan'

export const STEP_ORDER: readonly PlanStep[] = [
  'goal',
  'meals',
  'foods',
  'plan',
]

/** 단계 레일의 이름(스토리보드 v5.0 I03 흐름: 목표 확인 → 끼니 선택 → 음식 조건 → 추천 확인). */
export const STEP_LABEL: Record<PlanStep, string> = {
  goal: '목표 확인',
  meals: '끼니 선택',
  foods: '음식 조건',
  plan: '추천 확인',
}

export const STEP_PATH: Record<PlanStep, string> = {
  goal: PATH_AI_MEAL,
  meals: PATH_AI_MEAL_MEALS,
  foods: PATH_AI_MEAL_FOODS,
  plan: PATH_AI_MEAL_PLAN,
}

/** 식품 구분 선택. null은 "전체"(조건 없음)다. */
export type FoodTypeChoice = (typeof FOOD_TYPES)[number] | null

export interface MealPlanConditions {
  /** 식품 구분(단일). null은 전체. */
  type: FoodTypeChoice
  /** 음식 종류(여러 개). 비어 있으면 전체 종류. 항상 선택한 식품 구분에 속한 종류만 담는다. */
  kinds: readonly string[]
  /** 추천에서 뺄 음식 id(여러 개). */
  excludedFoodIds: readonly string[]
}

export const INITIAL_CONDITIONS: MealPlanConditions = {
  type: null,
  kinds: [],
  excludedFoodIds: [],
}

export interface MealPlanSelection {
  /** 추천받을 날짜(내일). 끼니를 처음 고를 때 정하고, 날짜가 바뀌면 선택을 비운다. */
  targetDate: LocalDate | null
  /** 선택한 끼니(항상 아침·점심·저녁 순서). */
  meals: readonly MealType[]
  conditions: MealPlanConditions
}

export const EMPTY_SELECTION: MealPlanSelection = {
  targetDate: null,
  meals: [],
  conditions: INITIAL_CONDITIONS,
}

function ordered(meals: readonly MealType[]): readonly MealType[] {
  return MEAL_TYPES.filter((meal) => meals.includes(meal))
}

export function allMealsSelected(selection: MealPlanSelection): boolean {
  return MEAL_TYPES.every((meal) => selection.meals.includes(meal))
}

/** 끼니 하나를 켜고 끈다. 처음 고르는 때 추천 날짜를 정한다. */
export function toggleMeal(
  selection: MealPlanSelection,
  meal: MealType,
  date: LocalDate,
): MealPlanSelection {
  const next = selection.meals.includes(meal)
    ? selection.meals.filter((m) => m !== meal)
    : [...selection.meals, meal]
  const meals = ordered(next)
  // 끼니를 모두 풀면 날짜도 비운다(고른 것이 없는데 지난 날짜가 남아 날짜 변경 안내가 뜨지 않게 한다).
  return {
    ...selection,
    targetDate: meals.length === 0 ? null : (selection.targetDate ?? date),
    meals,
  }
}

/** 세 끼 모두 선택. 이미 모두 선택된 상태이면 전체 해제한다. */
export function toggleAllMeals(
  selection: MealPlanSelection,
  date: LocalDate,
): MealPlanSelection {
  const clear = allMealsSelected(selection)
  return {
    ...selection,
    targetDate: clear ? null : (selection.targetDate ?? date),
    meals: clear ? [] : MEAL_TYPES,
  }
}

export interface FoodTypeChange {
  conditions: MealPlanConditions
  /** 식품 구분을 바꾸면서 함께 푼 음식 종류. 화면이 충돌 안내에 쓴다. */
  droppedKinds: readonly string[]
}

/** 식품 구분을 바꾼다. 새 구분에 속하지 않는 음식 종류는 함께 푼다(구분마다 종류가 다르다, F01과 같은 규칙). */
export function setFoodType(
  conditions: MealPlanConditions,
  type: FoodTypeChoice,
): FoodTypeChange {
  const allowed = kindsFor(type)
  const kinds = conditions.kinds.filter((kind) => allowed.includes(kind))
  return {
    conditions: { ...conditions, type, kinds },
    droppedKinds: conditions.kinds.filter((kind) => !allowed.includes(kind)),
  }
}

export function toggleKind(
  conditions: MealPlanConditions,
  kind: string,
): MealPlanConditions {
  if (!kindsFor(conditions.type).includes(kind)) return conditions
  const kinds = conditions.kinds.includes(kind)
    ? conditions.kinds.filter((k) => k !== kind)
    : [...conditions.kinds, kind]
  return { ...conditions, kinds }
}

export function toggleExcluded(
  conditions: MealPlanConditions,
  foodId: string,
): MealPlanConditions {
  const excludedFoodIds = conditions.excludedFoodIds.includes(foodId)
    ? conditions.excludedFoodIds.filter((id) => id !== foodId)
    : [...conditions.excludedFoodIds, foodId]
  return { ...conditions, excludedFoodIds }
}

export function hasAnyCondition(conditions: MealPlanConditions): boolean {
  return (
    conditions.type !== null ||
    conditions.kinds.length > 0 ||
    conditions.excludedFoodIds.length > 0
  )
}

/** 식품 구분과 음식 종류가 서로 맞는가(맞지 않는 종류가 남아 있으면 안 된다). */
export function isConditionsValid(conditions: MealPlanConditions): boolean {
  const allowed = kindsFor(conditions.type)
  return conditions.kinds.every((kind) => allowed.includes(kind))
}

/** 끼니 단계를 마쳤는가: 끼니를 하나 이상 골랐고 날짜가 정해져 있다. */
export function isMealsComplete(selection: MealPlanSelection): boolean {
  return selection.meals.length > 0 && selection.targetDate !== null
}

/** 추천을 요청할 수 있는가: 끼니 단계를 마쳤고 음식 조건이 올바르다. */
export function isRequestReady(selection: MealPlanSelection): boolean {
  return isMealsComplete(selection) && isConditionsValid(selection.conditions)
}

/**
 * 이 단계에 있어도 되는가. 그렇지 않으면 돌아가야 할 앞 단계를 돌려준다(직접 URL 접근·새로고침으로 앞 입력이 없는 경우).
 * 목표 확인(I03)과 끼니 선택(I03-1)은 앞선 입력이 필요 없다.
 */
export function redirectStep(
  step: PlanStep,
  selection: MealPlanSelection,
): PlanStep | null {
  if (step === 'foods' && !isMealsComplete(selection)) return 'meals'
  if (step === 'plan' && !isRequestReady(selection)) {
    return isMealsComplete(selection) ? 'foods' : 'meals'
  }
  return null
}

/** 음식 조건 한 줄 요약. 선택하지 않은 조건은 "전체"·"없음"으로 쓰며 값을 지어내지 않는다. */
export function describeConditions(
  conditions: MealPlanConditions,
  foodNameOf: (id: string) => string | null = () => null,
): { type: string; kinds: string; excluded: string } {
  const names = conditions.excludedFoodIds.map(
    (id) => foodNameOf(id) ?? '선택한 음식',
  )
  return {
    type: conditions.type ?? '전체',
    kinds: conditions.kinds.length > 0 ? conditions.kinds.join(' · ') : '전체',
    excluded: names.length > 0 ? names.join(' · ') : '없음',
  }
}
