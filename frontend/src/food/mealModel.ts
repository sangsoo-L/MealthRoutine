import {
  isIsoTimestamp,
  isLocalDate,
  isValidOwnerId,
  isValidRequestId,
} from '../exercise/workoutModel.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import {
  isPortion,
  portionGrams,
  scaleNutrition,
  type Portion,
  type ScaledNutrition,
} from './foodNutrition.ts'
import type { Food, FoodSource, NutrientValue, Per100g } from './foodTypes.ts'

/**
 * 식단 기록(D01·D01-1~3·D02)의 저장 모델과 순수 함수(저장소·React를 부르지 않는다). 개발 서버의 IndexedDB `mealRecords`(DB v3)에 저장하는 값의 모양이다.
 *
 * - 실제로 먹은 음식 한 줄이 기록 한 건이다. 날짜는 기기 로컬 날짜(YYYY-MM-DD)다.
 * - 영양값은 **저장 당시의 스냅샷**(음식의 100g 기준값)과 그 출처를 함께 저장한다. 음식 데이터가 나중에 바뀌어도 과거 기록의 영양·합계는 바뀌지 않는다.
 *   선택량 영양값은 스냅샷 × 중량(weightGrams) ÷ 100으로 읽을 때 계산한다(저장하지 않는다).
 * - 양 구분(적게·보통·많이)의 중량은 시안 예시 기준이다(foodNutrition.PORTION_RATIO). 기록에는 구분과 계산된 중량을 함께 남긴다.
 * - 백엔드 DTO가 아니며 API 계약이 아니다(`/api/v1/meal-records`의 요청·응답 구조는 미확정).
 */

/** 저장 레코드의 스키마 버전. 모양을 바꾸면 올리고 exercise/local/exerciseDb.ts의 업그레이드에서 옮긴다. */
export const MEAL_SCHEMA_VERSION = 1

export type MealType = 'breakfast' | 'lunch' | 'dinner'

export const MEAL_TYPES: readonly MealType[] = ['breakfast', 'lunch', 'dinner']

export const MEAL_LABEL: Record<MealType, string> = {
  breakfast: '아침',
  lunch: '점심',
  dinner: '저녁',
}

export function isMealType(value: unknown): value is MealType {
  return value === 'breakfast' || value === 'lunch' || value === 'dinner'
}

/** 끼니 상세(D01-1·2·3)의 주소 조각. 끼니 코드와 같다. */
export function mealTypeFromParam(param: string | undefined): MealType | null {
  return isMealType(param) ? param : null
}

export const MAX_WEIGHT_GRAMS = 5000

/**
 * 화면이 한 줄로 보여 주는 식단 항목에 필요한 값. 실제 섭취 기록(MealRecord)과 내일 계획(MealPlan)이 모두 만족한다.
 * 표시·합계 계산 함수는 이 형만 받으므로 같은 컴포넌트를 쓰지만, 두 데이터를 섞어 더하지는 않는다(호출한 쪽이 하나만 넘긴다).
 */
export interface MealEntry {
  id: string
  mealType: MealType
  foodName: string
  portion: Portion
  weightGrams: number
  nutritionSnapshot: Per100g
  revision: number
  createdAt: string
}

export interface MealRecord {
  id: string
  ownerId: string
  schemaVersion: typeof MEAL_SCHEMA_VERSION
  localDate: LocalDate
  mealType: MealType
  foodId: string
  /** 저장 당시의 음식 이름(표시용 스냅샷). */
  foodName: string
  portion: Portion
  /** 먹은 양(g). 양 구분을 시안 예시 기준으로 환산한 값이다. */
  weightGrams: number
  /** 저장 당시의 100g 기준 영양값. null은 정보 없음이다. */
  nutritionSnapshot: Per100g
  nutritionSource: FoodSource
  /** 저장할 때마다 1씩 오르는 값(동시 수정 감지). */
  revision: number
  /** 저장 요청 식별자. 같은 계정에서 같은 요청을 반복해도 기록이 하나만 생긴다(중복 저장 방지). */
  requestId: string
  createdAt: string
  updatedAt: string
}

function validNutrient(value: unknown): value is NutrientValue {
  return (
    value === null ||
    (typeof value === 'number' && Number.isFinite(value) && value >= 0)
  )
}

export function validPer100g(raw: unknown): raw is Per100g {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return false
  const v = raw as Record<string, unknown>
  return (
    validNutrient(v.kcal) &&
    validNutrient(v.protein) &&
    validNutrient(v.fat) &&
    validNutrient(v.carb)
  )
}

export function validSource(raw: unknown): raw is FoodSource {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw))
    return false
  const v = raw as Record<string, unknown>
  return (
    (v.kind === 'dev-sample' || v.kind === 'server') &&
    typeof v.label === 'string' &&
    v.label.length > 0 &&
    v.label.length <= 100
  )
}

/** 기록에 담을 음식 정보. 음식 전체가 아니라 저장에 쓰는 값만 받는다. */
export type MealFoodInput = Pick<Food, 'id' | 'name' | 'per100g' | 'source'>

/** 새 기록을 만든다. 날짜·끼니·양 구분·음식 정보가 올바르지 않으면 null이다. revision 1, createdAt = updatedAt = now. */
export function buildMealRecord(params: {
  id: string
  ownerId: string
  requestId: string
  localDate: LocalDate
  mealType: MealType
  food: MealFoodInput
  portion: Portion
  now: Date
}): MealRecord | null {
  if (
    !isLocalDate(params.localDate) ||
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
    schemaVersion: MEAL_SCHEMA_VERSION,
    localDate: params.localDate,
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
export function buildMealUpdate(
  existing: MealRecord,
  params: { portion: Portion; now: Date },
): MealRecord | null {
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
export function sameMealContent(
  a: Pick<MealRecord, 'localDate' | 'mealType' | 'foodId' | 'portion'>,
  b: Pick<MealRecord, 'localDate' | 'mealType' | 'foodId' | 'portion'>,
): boolean {
  return (
    a.localDate === b.localDate &&
    a.mealType === b.mealType &&
    a.foodId === b.foodId &&
    a.portion === b.portion
  )
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 저장소에서 읽은 기록. 모양이 맞지 않으면 null(손상). */
export function parseMealRecord(raw: unknown): MealRecord | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== MEAL_SCHEMA_VERSION ||
    typeof raw.id !== 'string' ||
    raw.id === '' ||
    !isValidOwnerId(raw.ownerId) ||
    !isLocalDate(raw.localDate) ||
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
  return raw as unknown as MealRecord
}

/** 기록한 양의 영양값(저장 당시 스냅샷 × 중량 ÷ 100). */
export function mealNutrition(
  record: Pick<MealRecord, 'nutritionSnapshot' | 'weightGrams'>,
): ScaledNutrition {
  return scaleNutrition(record.nutritionSnapshot, record.weightGrams)
}

/** 등록 순서(createdAt, 같으면 id)로 정렬한 새 배열. */
export function sortByCreated<T extends { id: string; createdAt: string }>(
  records: readonly T[],
): readonly T[] {
  return records.toSorted((a, b) =>
    a.createdAt !== b.createdAt
      ? a.createdAt < b.createdAt
        ? -1
        : 1
      : a.id < b.id
        ? -1
        : a.id > b.id
          ? 1
          : 0,
  )
}

/** 끼니별로 나눈다(각 끼니는 등록 순서). 기록이 없는 끼니는 빈 배열이다. */
export function groupByMeal<
  T extends { id: string; createdAt: string; mealType: MealType },
>(records: readonly T[]): Record<MealType, readonly T[]> {
  const sorted = sortByCreated(records)
  return {
    breakfast: sorted.filter((r) => r.mealType === 'breakfast'),
    lunch: sorted.filter((r) => r.mealType === 'lunch'),
    dinner: sorted.filter((r) => r.mealType === 'dinner'),
  }
}
