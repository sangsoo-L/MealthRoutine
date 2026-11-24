import type {
  MealPlanCandidateCount,
  MealPlanRequest,
  MealPlanResult,
  MealPlanSource,
  MealPlanTargets,
} from './mealPlanContract.ts'
import type { MealType } from '../../food/mealModel.ts'

const AI_BASE = 'http://127.0.0.1:8000/internal/ai'
const isMeal = (v: unknown): v is MealType =>
  v === 'breakfast' || v === 'lunch' || v === 'dinner'
const numberOrNull = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null

export function parseDietRecommendation(
  raw: unknown,
  request: MealPlanRequest,
): MealPlanResult | null {
  if (!raw || typeof raw !== 'object')
    throw new Error('식단 추천 응답이 올바르지 않습니다.')
  const data = raw as Record<string, unknown>
  if (data.status !== 'generated' || !Array.isArray(data.meals)) {
    throw new Error('식단 추천 결과가 누락됐습니다.')
  }
  const meals = data.meals.flatMap((rawMeal: unknown) => {
    if (!rawMeal || typeof rawMeal !== 'object') return []
    const meal = rawMeal as Record<string, unknown>
    if (!isMeal(meal.meal_type) || !Array.isArray(meal.foods)) return []
    const items = meal.foods.flatMap((rawFood: unknown, index: number) => {
      if (!rawFood || typeof rawFood !== 'object') return []
      const food = rawFood as Record<string, unknown>
      if (
        !Number.isSafeInteger(food.food_id) ||
        !(Number(food.food_id) > 0) ||
        typeof food.food_name !== 'string' ||
        !food.food_name.trim()
      )
        return []
      const nutrients =
        food.nutrients && typeof food.nutrients === 'object'
          ? (food.nutrients as Record<string, unknown>)
          : null
      return [
        {
          foodId: String(food.food_id),
          foodName: food.food_name,
          quantity: numberOrNull(food.quantity),
          unit: '인분',
          nutrients: nutrients
            ? {
                kcal: numberOrNull(nutrients.calories_kcal),
                carbG: numberOrNull(nutrients.carbohydrate_g),
                proteinG: numberOrNull(nutrients.protein_g),
                fatG: numberOrNull(nutrients.fat_g),
              }
            : null,
          allergenNotes: null,
          reason:
            index === 0 && typeof meal.reason === 'string' ? meal.reason : null,
        },
      ]
    })
    return [
      {
        meal: meal.meal_type,
        target: {
          kcal:
            numberOrNull(data.target_calories_kcal) ??
            request.targetCaloriesKcal ??
            null,
          carbG: null,
          proteinG: null,
          fatG: null,
        },
        warnings: Array.isArray(data.warnings)
          ? data.warnings.filter(
              (warning): warning is string =>
                typeof warning === 'string' && warning.trim().length > 0,
            )
          : [],
        items,
        totals: {
          kcal: numberOrNull(meal.estimated_calories_kcal),
          carbG: numberOrNull(meal.estimated_carbohydrate_g),
          proteinG: numberOrNull(meal.estimated_protein_g),
          fatG: numberOrNull(meal.estimated_fat_g),
        },
      },
    ]
  })
  if (meals.length === 0 || meals.some((meal) => meal.items.length === 0))
    return null
  // FastAPI는 저장된 계획 ID를 제공하지 않으므로 표시 전용 임시 ID를 씁니다.
  return {
    requestId: `local-${Date.now()}`,
    targetDate: request.targetDate,
    meals,
  }
}

export function createLocalMealPlanSource(): MealPlanSource {
  return {
    // 이 두 조회 API는 FastAPI에 없으므로 실제 수치를 지어내지 않습니다.
    async getTargets(_query, signal): Promise<MealPlanTargets> {
      if (signal.aborted) throw new DOMException('취소', 'AbortError')
      return { meals: [] }
    },
    async countCandidates(_request, signal): Promise<MealPlanCandidateCount> {
      if (signal.aborted) throw new DOMException('취소', 'AbortError')
      return { count: null }
    },
    async requestPlan(request, signal) {
      const kcal = request.targetCaloriesKcal
      if (
        typeof kcal !== 'number' ||
        !Number.isInteger(kcal) ||
        kcal < 1 ||
        kcal > 8000
      ) {
        throw new Error('끼니당 목표 열량을 1~8000kcal로 입력해 주세요.')
      }
      if (request.meals.length === 0) {
        throw new Error('추천받을 끼니를 선택해 주세요.')
      }
      // 기존 F01의 개발용 샘플 ID(dev-food-*)는 실제 DB ID가 아니므로 보내지 않는다.
      // 사용자가 화면에서 선택하는 넓은 제외 범주는 별도로 전달한다.
      const excluded = request.excludedFoodIds
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
      const preferences = [
        request.foodType ? `선호 식품 구분: ${request.foodType}` : null,
        request.foodKinds.length
          ? `선호 음식 종류: ${request.foodKinds.join(', ')}`
          : null,
      ]
        .filter(Boolean)
        .join('; ')

      // FastAPI의 목표 열량은 전체 일일 합산이 아니라 *해당 추천 요청*의 목표입니다.
      // 아침/점심/저녁을 한 번에 요청하지 않고 끼니마다 한 번씩 호출해야
      // 700kcal 입력 시 각 끼니에 700kcal 식단이 생성됩니다.
      // LLM 동시 호출로 인한 일시적 서버 오류를 피하려고 순서대로 요청합니다.
      const meals: MealPlanResult['meals'][number][] = []
      for (const meal of [...new Set(request.meals)]) {
        if (signal.aborted) throw new DOMException('취소', 'AbortError')
        const response = await fetch(`${AI_BASE}/diet-recommendations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_calories_kcal: kcal,
            meal_types: [meal],
            excluded_food_ids: excluded,
            excluded_food_groups: request.excludedFoodGroups ?? [],
            food_type: request.foodType,
            food_kinds: request.foodKinds,
            preferences,
          }),
          signal,
        })
        if (!response.ok)
          throw new Error(`${meal} 식단 추천 요청 실패 (${response.status})`)
        const parsed = parseDietRecommendation(
          (await response.json()) as unknown,
          {
            ...request,
            meals: [meal],
          },
        )
        if (!parsed) return null
        if (parsed.meals.length !== 1 || parsed.meals[0].meal !== meal) {
          throw new Error(`${meal} 식단 추천 결과가 올바르지 않습니다.`)
        }
        meals.push(parsed.meals[0])
      }
      return {
        requestId: `local-${Date.now()}`,
        targetDate: request.targetDate,
        meals,
      }
    },
  }
}
