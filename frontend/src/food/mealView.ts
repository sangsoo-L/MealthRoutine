import {
  formatKcal,
  formatMacro,
  macroShare,
  sumNutrition,
  type MacroShare,
  type NutritionTotals,
  type ScaledNutrition,
} from './foodNutrition.ts'
import { mealNutrition, type MealEntry } from './mealModel.ts'

/**
 * 식단 기록 표시용 순수 함수. 기록의 영양값은 저장 당시 스냅샷으로 계산한 값이며, 값이 없는 영양소는 "정보 없음"으로 알리고 0으로 바꾸지 않는다.
 */

/** 기록 한 건의 영양 한 줄 요약의 조각. 값이 없으면 그 영양소는 "정보 없음"이다. */
export function nutritionPieces(scaled: ScaledNutrition): string[] {
  return [
    formatKcal(scaled.kcal) ?? '열량 정보 없음',
    `탄수화물 ${formatMacro(scaled.carb) ?? '정보 없음'}`,
    `단백질 ${formatMacro(scaled.protein) ?? '정보 없음'}`,
    `지방 ${formatMacro(scaled.fat) ?? '정보 없음'}`,
  ]
}

/** 기록 한 건의 영양 한 줄: "153kcal · 탄수화물 33g · 단백질 3.1g · 지방 1g". */
export function recordNutritionLine(
  record: Pick<MealEntry, 'nutritionSnapshot' | 'weightGrams'>,
): string {
  return nutritionPieces(mealNutrition(record)).join(' · ')
}

export interface MealSummary {
  totals: NutritionTotals
  share: MacroShare | null
}

/** 기록들의 영양 합계와 탄단지 열량 비율. 값이 있는 기록만 더하고, 비어 있는 기록이 있으면 totals.incomplete가 true다. */
export function summarizeMeals(
  records: readonly Pick<MealEntry, 'nutritionSnapshot' | 'weightGrams'>[],
): MealSummary {
  const scaled = records.map(mealNutrition)
  return { totals: sumNutrition(scaled), share: macroShare(scaled) }
}

/** "아침 · 현미밥, 닭가슴살 외 1개"처럼 끼니 카드에 쓰는 음식 요약. 기록이 없으면 빈 문자열. */
export function foodSummary(
  records: readonly Pick<MealEntry, 'foodName'>[],
): string {
  if (records.length === 0) return ''
  const names = records.slice(0, 2).map((r) => r.foodName)
  const rest = records.length - names.length
  return rest > 0 ? `${names.join(', ')} 외 ${rest}개` : names.join(', ')
}

/** 합계 열량 문구: 값이 없으면 "미산정", 있으면 "153kcal". */
export function totalKcalText(totals: NutritionTotals): string {
  return formatKcal(totals.kcal) ?? '미산정'
}

/** 합계가 불완전할 때의 안내. 완전하면 null. */
export function incompleteNotice(totals: NutritionTotals): string | null {
  if (!totals.incomplete) return null
  return `영양정보가 없는 기록 ${totals.incompleteCount}개가 있어 합계가 불완전해요. 값이 있는 기록만 더했어요.`
}
