import { mealFocusRing } from '../../food/foodStyles.ts'

/** AI 식단 플랜(I03~I03-3) 전용 스타일. 식단 도메인 색(meal, 오렌지)을 쓰고 기존 식단 스타일을 재사용한다. */
export {
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
} from '../../food/foodStyles.ts'

export const planSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

/** 선택 행(끼니·식품 구분·음식 종류·제외 음식의 공통 모양). 선택 여부는 색만이 아니라 글자·표시로도 전한다. */
export const choiceRow = `flex min-h-12 w-full cursor-pointer items-center justify-between gap-3 rounded-control border px-4 py-2 text-left text-body ${mealFocusRing}`
export const choiceOn = 'border-meal bg-meal-soft font-semibold text-meal'
export const choiceOff =
  'border-line bg-surface font-normal text-content hover:border-meal/40'

/** 연결 대기·준비 중 같은 상태 안내 칸. */
export const statusBox =
  'rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted'

/** 상태 칩(글자로 상태를 전한다). */
export const planChip =
  'inline-flex shrink-0 items-center rounded-full border border-line bg-page px-2.5 py-0.5 text-support leading-snug font-semibold text-muted'

/** aria-disabled 버튼의 막힌 모양(누를 수 없음을 보조기기에도 알린다). */
export const disabledButton =
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-60'
