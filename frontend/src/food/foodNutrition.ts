import type { NutrientValue, Per100g } from './foodTypes.ts'

/**
 * 영양 계산(순수 함수). 저장소·React를 부르지 않는다.
 *
 * - 선택량 영양값 = 100g 기준값 × 중량(g) ÷ 100 (화면명세 F02). 100g 기준값이 null(정보 없음)이면 결과도 null이며 0으로 바꾸지 않는다.
 * - 열량 비율은 탄수화물·단백질 4kcal/g, 지방 9kcal/g로 환산한 열량의 비율이다(합계 100%, 권장 비율과 비교하지 않는다, 명세 D01-1).
 * - 합계는 값이 있는 기록만 더한다. 값이 없는 기록이 하나라도 있으면 합계는 불완전(incomplete)하다고 알린다. 아무 값도 없으면 합계는 null(미산정)이다.
 */

/**
 * 양 구분(적게·보통·많이)의 중량 환산. **시안 예시 기준이다**: 음식별 1인분 기준이 확정되기 전이라 스토리보드 v5.0이 1인분 = 100g,
 * 적게 0.5배, 많이 1.5배로 계산한다(storyboard.html `mealPortions`). 이 값은 확정된 서비스 기준이 아니므로 화면이 "시안 예시 기준"임을 알리고,
 * 기록에는 구분(portion)과 계산된 중량(weightGrams)을 함께 저장해 기준이 바뀌어도 과거 기록의 중량이 바뀌지 않게 한다.
 */
export type Portion = 'less' | 'normal' | 'more'

export const PORTIONS: readonly Portion[] = ['less', 'normal', 'more']

/** 시안 예시: 1인분 중량(g). 확정 전이다. */
export const SAMPLE_SERVING_GRAMS = 100

export const PORTION_RATIO: Record<Portion, number> = {
  less: 0.5,
  normal: 1,
  more: 1.5,
}

export const PORTION_LABEL: Record<Portion, string> = {
  less: '적게',
  normal: '보통',
  more: '많이',
}

/** 양 구분 설명(스토리보드 문구). */
export const PORTION_HINT: Record<Portion, string> = {
  less: '1인분보다 적게',
  normal: '1인분 정도',
  more: '1인분보다 많이',
}

export function isPortion(value: unknown): value is Portion {
  return value === 'less' || value === 'normal' || value === 'more'
}

/** 양 구분의 중량(g). 시안 예시 기준(1인분 100g)이다. */
/** 양 구분의 중량(g) = 1인분 중량 × 0.5·1·1.5. 1인분을 모르면 시안 예시(100g) 기준이다. */
export function portionGrams(
  portion: Portion,
  servingGrams: number = SAMPLE_SERVING_GRAMS,
): number {
  return servingGrams * PORTION_RATIO[portion]
}

/** "적게 · 50g"·"보통(1인분) · 100g". */
export function portionLabel(portion: Portion, weightGrams: number): string {
  const name = portion === 'normal' ? '보통(1인분)' : PORTION_LABEL[portion]
  return `${name} · ${formatGrams(weightGrams)}`
}

export function formatGrams(grams: number): string {
  return `${Number.isInteger(grams) ? grams : Number(grams.toFixed(1))}g`
}

/** 선택량 영양값. 중량이 올바르지 않으면(0 이하·유한하지 않음) 모두 null이다. */
export interface ScaledNutrition {
  kcal: NutrientValue
  protein: NutrientValue
  fat: NutrientValue
  carb: NutrientValue
}

function scale(value: NutrientValue, grams: number): NutrientValue {
  return value === null ? null : (value * grams) / 100
}

export function scaleNutrition(
  per100g: Per100g,
  grams: number,
): ScaledNutrition {
  if (!Number.isFinite(grams) || grams <= 0) {
    return { kcal: null, protein: null, fat: null, carb: null }
  }
  return {
    kcal: scale(per100g.kcal, grams),
    protein: scale(per100g.protein, grams),
    fat: scale(per100g.fat, grams),
    carb: scale(per100g.carb, grams),
  }
}

/** 열량(kcal) 표시: 정수로 반올림. 없으면 null. */
export function formatKcal(value: NutrientValue): string | null {
  return value === null ? null : `${Math.round(value)}kcal`
}

/** 영양소(g) 표시: 소수 첫째 자리(끝의 0 제거). 없으면 null. */
export function formatMacro(value: NutrientValue): string | null {
  return value === null ? null : `${Number(value.toFixed(1))}g`
}

export interface NutritionTotals {
  /** 기록 수 */
  recordCount: number
  /** 값이 있는 기록만 더한 합계. 값이 있는 기록이 하나도 없으면 null(미산정). */
  kcal: NutrientValue
  protein: NutrientValue
  fat: NutrientValue
  carb: NutrientValue
  /** 열량이 없는 기록이 있다. 합계(kcal)는 값이 있는 기록만의 합이라는 뜻이다. */
  kcalIncomplete: boolean
  /** 어느 영양소든 값이 없는 기록이 하나라도 있다(합계가 불완전하다는 안내를 보인다). */
  incomplete: boolean
  /** 값이 없어 합계에서 빠진 기록 수(어느 영양소든 하나라도 없으면 센다). */
  incompleteCount: number
}

type Scaled = ScaledNutrition

function sumField(values: readonly NutrientValue[]): NutrientValue {
  const known = values.filter((v): v is number => v !== null)
  return known.length === 0 ? null : known.reduce((a, b) => a + b, 0)
}

/** 선택량 영양값들의 합계. 입력은 기록마다 계산한 선택량 영양값이다. */
export function sumNutrition(items: readonly Scaled[]): NutritionTotals {
  const incompleteCount = items.filter(
    (item) =>
      item.kcal === null ||
      item.protein === null ||
      item.fat === null ||
      item.carb === null,
  ).length
  return {
    recordCount: items.length,
    kcal: sumField(items.map((i) => i.kcal)),
    protein: sumField(items.map((i) => i.protein)),
    fat: sumField(items.map((i) => i.fat)),
    carb: sumField(items.map((i) => i.carb)),
    kcalIncomplete: items.some((i) => i.kcal === null),
    incomplete: incompleteCount > 0,
    incompleteCount,
  }
}

export interface MacroShare {
  /** 열량 비율(%) 정수. 세 값의 합이 100이다. */
  carbPercent: number
  proteinPercent: number
  fatPercent: number
  /** 비율 계산에 쓴 기록의 영양소 합(g) */
  carbG: number
  proteinG: number
  fatG: number
  /** 비율에 쓴 탄·단·지 환산 열량의 합(kcal) */
  macroKcal: number
}

/**
 * 탄수화물·단백질·지방의 열량 비율. 세 영양소가 모두 있는 기록만 쓴다(하나라도 없는 기록은 제외 — 호출한 쪽이 incomplete로 알린다).
 * 합이 0(쓸 수 있는 기록이 없거나 모두 0g)이면 null이다. 백분율은 합이 정확히 100이 되도록 가장 큰 나머지 순으로 맞춘다.
 */
export function macroShare(items: readonly Scaled[]): MacroShare | null {
  let carbG = 0
  let proteinG = 0
  let fatG = 0
  let used = 0
  for (const item of items) {
    if (item.carb === null || item.protein === null || item.fat === null)
      continue
    carbG += item.carb
    proteinG += item.protein
    fatG += item.fat
    used += 1
  }
  if (used === 0) return null
  const parts = [carbG * 4, proteinG * 4, fatG * 9]
  const total = parts[0] + parts[1] + parts[2]
  if (total <= 0) return null
  const exact = parts.map((p) => (p / total) * 100)
  const floors = exact.map((e) => Math.floor(e))
  let rest = 100 - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((e, index) => ({ index, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of order) {
    if (rest <= 0) break
    floors[index] += 1
    rest -= 1
  }
  return {
    carbPercent: floors[0],
    proteinPercent: floors[1],
    fatPercent: floors[2],
    carbG,
    proteinG,
    fatG,
    macroKcal: total,
  }
}
