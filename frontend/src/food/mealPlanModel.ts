import {
  isIsoTimestamp,
  isLocalDate,
  isValidOwnerId,
  isValidRequestId,
} from '../exercise/workoutModel.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import { isPortion, portionGrams, type Portion } from './foodNutrition.ts'
import type { FoodSource, Per100g } from './foodTypes.ts'
import {
  MAX_WEIGHT_GRAMS,
  isMealType,
  validPer100g,
  validSource,
  type MealFoodInput,
  type MealType,
} from './mealModel.ts'

/**
 * 내일 식단 계획(D02-1)의 저장 모델과 순수 함수(저장소·React를 부르지 않는다). 개발 서버의 IndexedDB `mealPlans`(DB v4)에 저장하는 값의 모양이다.
 *
 * - **계획 전용**이다. 실제 섭취 기록(mealRecords)과 저장소가 다르고, 어떤 합계(D01·D01-1~3·D03·D03-1)에도 더하지 않는다.
 *   계획 날짜가 지나도 자동으로 실제 섭취가 되지 않는다("먹었어요" 확인 기능은 이번 범위가 아니다).
 * - 항목 한 줄이 계획 한 건이다. 영양값은 저장 당시의 스냅샷(음식의 100g 기준값)과 출처를 함께 저장하고, 선택량 영양값은 읽을 때 계산한다.
 * - 양 구분(적게·보통·많이)의 중량은 시안 예시 기준이다(foodNutrition.PORTION_RATIO). 구분과 계산된 중량을 함께 남긴다.
 * - 백엔드 DTO가 아니며 API 계약이 아니다.
 */

/** 저장 레코드의 스키마 버전. 모양을 바꾸면 올리고 exercise/local/exerciseDb.ts의 업그레이드에서 옮긴다. */
export const MEAL_PLAN_SCHEMA_VERSION = 1

export interface MealPlan {
  id: string
  ownerId: string
  schemaVersion: typeof MEAL_PLAN_SCHEMA_VERSION
  /** 계획 날짜(기기 로컬 날짜). 저장할 때 "오늘 이후"여야 한다. */
  planDate: LocalDate
  mealType: MealType
  foodId: string
  /** 저장 당시의 음식 이름(표시용 스냅샷). */
  foodName: string
  portion: Portion
  /** 먹을 양(g). 양 구분을 시안 예시 기준으로 환산한 값이다. */
  weightGrams: number
  /** 저장 당시의 100g 기준 영양값. null은 정보 없음이다. */
  nutritionSnapshot: Per100g
  nutritionSource: FoodSource
  /** 저장할 때마다 1씩 오르는 값(동시 수정 감지). */
  revision: number
  /** 저장 요청 식별자. 같은 계정에서 같은 요청을 반복해도 계획이 하나만 생긴다(중복 저장 방지). */
  requestId: string
  createdAt: string
  updatedAt: string
}

/** 계획 날짜가 기준일(보통 오늘)보다 뒤인가. 오늘 이전·당일의 계획은 새로 만들거나 고칠 수 없다. */
export function isPlanDateOpen(planDate: LocalDate, today: LocalDate): boolean {
  return planDate > today
}

/** 새 계획을 만든다. 날짜·끼니·양 구분·음식 정보가 올바르지 않으면 null이다. revision 1, createdAt = updatedAt = now. */
export function buildMealPlan(params: {
  id: string
  ownerId: string
  requestId: string
  planDate: LocalDate
  mealType: MealType
  food: MealFoodInput
  portion: Portion
  now: Date
}): MealPlan | null {
  if (
    !isLocalDate(params.planDate) ||
    !isMealType(params.mealType) ||
    !isPortion(params.portion) ||
    typeof params.food.id !== 'string' ||
    params.food.id.trim() === '' ||
    typeof params.food.name !== 'string' ||
    params.food.name.trim() === '' ||
    !validPer100g(params.food.per100g) ||
    !validSource(params.food.source)
  ) {
    return null
  }
  const at = params.now.toISOString()
  return {
    id: params.id,
    ownerId: params.ownerId,
    schemaVersion: MEAL_PLAN_SCHEMA_VERSION,
    planDate: params.planDate,
    mealType: params.mealType,
    foodId: params.food.id,
    foodName: params.food.name.trim(),
    portion: params.portion,
    weightGrams: portionGrams(params.portion),
    nutritionSnapshot: { ...params.food.per100g },
    nutritionSource: { ...params.food.source },
    revision: 1,
    requestId: params.requestId,
    createdAt: at,
    updatedAt: at,
  }
}

/**
 * 양을 고친 새 값. id·소유자·날짜·끼니·음식·영양 스냅샷·출처·요청 id·createdAt은 그대로이고, 양 구분과 그에 따른 중량이 바뀐다.
 * revision은 1 오르고 updatedAt은 now다. 올바르지 않은 양 구분이면 null이다.
 */
export function buildMealPlanUpdate(
  existing: MealPlan,
  params: { portion: Portion; now: Date },
): MealPlan | null {
  if (!isPortion(params.portion)) return null
  return {
    ...existing,
    portion: params.portion,
    weightGrams: portionGrams(params.portion),
    revision: existing.revision + 1,
    updatedAt: params.now.toISOString(),
  }
}

/** 같은 저장 요청의 재전송인지 판정하는 내용 비교(날짜·끼니·음식·양). */
export function sameMealPlanContent(
  a: Pick<MealPlan, 'planDate' | 'mealType' | 'foodId' | 'portion'>,
  b: Pick<MealPlan, 'planDate' | 'mealType' | 'foodId' | 'portion'>,
): boolean {
  return (
    a.planDate === b.planDate &&
    a.mealType === b.mealType &&
    a.foodId === b.foodId &&
    a.portion === b.portion
  )
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 저장소에서 읽은 계획. 모양이 맞지 않으면 null(손상). */
export function parseMealPlan(raw: unknown): MealPlan | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== MEAL_PLAN_SCHEMA_VERSION ||
    typeof raw.id !== 'string' ||
    raw.id === '' ||
    !isValidOwnerId(raw.ownerId) ||
    !isLocalDate(raw.planDate) ||
    !isMealType(raw.mealType) ||
    typeof raw.foodId !== 'string' ||
    raw.foodId === '' ||
    raw.foodId.length > 100 ||
    typeof raw.foodName !== 'string' ||
    raw.foodName.trim() === '' ||
    raw.foodName.length > 100 ||
    !isPortion(raw.portion) ||
    typeof raw.weightGrams !== 'number' ||
    !Number.isFinite(raw.weightGrams) ||
    raw.weightGrams <= 0 ||
    raw.weightGrams > MAX_WEIGHT_GRAMS ||
    !validPer100g(raw.nutritionSnapshot) ||
    !validSource(raw.nutritionSource) ||
    typeof raw.revision !== 'number' ||
    !Number.isInteger(raw.revision) ||
    raw.revision < 1 ||
    !isValidRequestId(raw.requestId) ||
    !isIsoTimestamp(raw.createdAt) ||
    !isIsoTimestamp(raw.updatedAt)
  ) {
    return null
  }
  return raw as unknown as MealPlan
}
