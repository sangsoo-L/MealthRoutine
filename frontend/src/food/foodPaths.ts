import type { MealType } from './mealModel.ts'

/** 식단 관련 경로. 모두 사용자 지시로 정한 임시 확정 URL이다(화면명세 v5.0은 URL을 정의하지 않는다). */
export const PATH_MEAL = '/records/meal'
export const PATH_MEAL_RECORD = '/records/meal/record'

/** D02-1 내일 식단 계획(사용자 승인 URL). */
export const PATH_MEAL_PLAN = '/records/meal/plan'

/** D02-1 경로. 음식(food)·끼니(meal)를 주면 그 음식이 선택된 채, 그 끼니가 골라진 채 열리고, 수정은 계획 id(edit)로 연다. */
export function mealPlanPath(options?: {
  food?: string
  meal?: MealType
  edit?: string
}): string {
  const params = new URLSearchParams()
  if (options?.meal) params.set('meal', options.meal)
  if (options?.food) params.set('food', options.food)
  if (options?.edit) params.set('edit', options.edit)
  const query = params.toString()
  return query === '' ? PATH_MEAL_PLAN : `${PATH_MEAL_PLAN}?${query}`
}

/** D03 식단 리스트와 D03-1 이전 식단 상세. 둘 다 사용자 지시 없이 정한 임시 확정 URL이다(운동의 `/records/exercise/previous`와 같은 이름 규칙). */
export const PATH_MEAL_LIST = '/records/meal/list'
export const PATH_MEAL_PREVIOUS = '/records/meal/previous'

/** D03 경로. 날짜를 주면 그 날짜가 선택된 채 열린다(`?date=YYYY-MM-DD`). */
export function mealListPath(date?: string): string {
  return date
    ? `${PATH_MEAL_LIST}?date=${encodeURIComponent(date)}`
    : PATH_MEAL_LIST
}

/** D03-1 경로. 날짜가 없으면 가장 최근 지난 기록을 연다. 끼니(meal)는 날짜를 바꿔도 유지하려고 주소에 둔다. */
export function mealPreviousPath(date?: string, meal?: MealType): string {
  const base = date
    ? `${PATH_MEAL_PREVIOUS}/${encodeURIComponent(date)}`
    : PATH_MEAL_PREVIOUS
  return meal && meal !== 'breakfast' ? `${base}?meal=${meal}` : base
}

/** 끼니 상세(D01-1·2·3)의 경로. 끼니 코드를 그대로 쓴다. */
export function mealDetailPath(meal: MealType): string {
  return `${PATH_MEAL}/${meal}`
}

/** F02 음식 영양정보 경로. */
export function foodDetailPath(foodId: string): string {
  return `/foods/${encodeURIComponent(foodId)}`
}

/**
 * D02 식단 기록 경로. 음식(food)·끼니(meal)를 주면 그 음식이 선택된 채, 그 끼니가 골라진 채 열린다.
 * 끼니 상세의 "수정"은 기록 id(edit)로 연다.
 */
export function recordMealPath(options?: {
  food?: string
  meal?: MealType
  edit?: string
}): string {
  const params = new URLSearchParams()
  if (options?.meal) params.set('meal', options.meal)
  if (options?.food) params.set('food', options.food)
  if (options?.edit) params.set('edit', options.edit)
  const query = params.toString()
  return query === '' ? PATH_MEAL_RECORD : `${PATH_MEAL_RECORD}?${query}`
}

/** F02에서 영양값을 확인하는 중량 선택지(g). 스토리보드 v5.0 F02의 중량 선택(100g·150g·200g)이다. */
export const FOOD_WEIGHT_CHOICES = [100, 150, 200] as const
