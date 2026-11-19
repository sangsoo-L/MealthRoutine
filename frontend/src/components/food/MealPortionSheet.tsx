import { useState } from 'react'
import {
  PORTIONS,
  PORTION_HINT,
  PORTION_LABEL,
  SAMPLE_SERVING_GRAMS,
  formatGrams,
  formatKcal,
  portionGrams,
  scaleNutrition,
  type Portion,
} from '../../food/foodNutrition.ts'
import type { Per100g } from '../../food/foodTypes.ts'
import { MEAL_LABEL, MEAL_TYPES, type MealType } from '../../food/mealModel.ts'
import BottomSheet from '../layout/BottomSheet.tsx'
import {
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
} from './foodStyles.ts'

/**
 * 양 선택 팝업의 내용(적게·보통(1인분)·많이). 새로 등록할 때는 끼니를 함께 고르고, 수정할 때는 끼니를 바꾸지 않는다.
 * 각 선택지에 환산 중량과 예상 열량을 보인다. 양 구분의 중량은 시안 예시 기준(1인분 100g)이며 확정된 서비스 기준이 아니다(아래 안내문).
 * 열량 정보가 없는 음식은 예상 열량을 0이 아니라 "열량 정보 없음"으로 알린다. 끼니를 고르지 않았으면 등록하지 않고 이유를 알린다.
 */
export function MealPortionForm({
  variant = 'record',
  mode,
  foodName,
  per100g,
  initialPortion,
  meal,
  onMealChange,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  /** record: 오늘 먹은 양(D02), plan: 내일 먹을 양(D02-1). 문구만 다르다. */
  variant?: 'record' | 'plan'
  mode: 'new' | 'edit'
  foodName: string
  per100g: Per100g
  initialPortion: Portion
  meal: MealType | null
  /** 새로 등록할 때만 있다. */
  onMealChange?: (meal: MealType) => void
  busy: boolean
  error: string | null
  onSubmit: (portion: Portion) => void
  onCancel: () => void
}) {
  const [portion, setPortion] = useState<Portion>(initialPortion)
  const needsMeal = mode === 'new' && meal === null
  return (
    <div className="flex flex-col gap-4 break-keep wrap-anywhere">
      <p className="text-support leading-relaxed font-normal text-muted">
        {mode === 'new'
          ? `“${foodName}”을(를) 얼마나 ${variant === 'plan' ? '먹을지' : '먹었는지'} 골라 주세요.`
          : `“${foodName}”의 양을 바꿔요. 영양값은 처음 기록했을 때의 값 그대로예요.`}
      </p>
      {mode === 'new' ? (
        <div
          role="radiogroup"
          aria-label="끼니"
          className="grid grid-cols-3 gap-2"
        >
          {MEAL_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={meal === type}
              onClick={() => onMealChange?.(type)}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-2 text-body ${mealFocusRing} ${
                meal === type
                  ? 'border-meal bg-meal-soft font-semibold text-meal'
                  : 'border-line bg-surface font-normal text-muted hover:text-content'
              }`}
            >
              {MEAL_LABEL[type]}
            </button>
          ))}
        </div>
      ) : null}
      <div
        role="radiogroup"
        aria-label={variant === 'plan' ? '먹을 양' : '먹은 양'}
        className="flex flex-col gap-2"
      >
        {PORTIONS.map((option) => {
          const selected = option === portion
          const kcal = formatKcal(
            scaleNutrition(per100g, portionGrams(option)).kcal,
          )
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setPortion(option)}
              className={`flex min-h-14 cursor-pointer items-center justify-between gap-3 rounded-card border px-4 py-2 text-left ${mealFocusRing} ${
                selected
                  ? 'border-meal bg-meal-soft'
                  : 'border-line bg-surface hover:bg-page'
              }`}
            >
              <span className="min-w-0">
                <span
                  className={`block text-body leading-snug ${selected ? 'font-semibold text-meal' : 'font-semibold text-content'}`}
                >
                  {PORTION_LABEL[option]}
                  {option === 'normal' ? ' (1인분)' : ''}
                </span>
                <span className="block text-support leading-snug font-normal text-muted">
                  {PORTION_HINT[option]} · {formatGrams(portionGrams(option))}
                </span>
              </span>
              <span className="shrink-0 text-right text-support leading-snug font-normal tabular-nums text-content">
                {kcal ? `예상 ${kcal}` : '열량 정보 없음'}
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-support leading-relaxed font-normal text-muted">
        1인분 기준이 아직 확정되지 않아 시안 예시 기준으로 계산해요: 1인분은{' '}
        {SAMPLE_SERVING_GRAMS}g, 적게는 0.5배, 많이는 1.5배예요.
      </p>
      {needsMeal ? (
        <p role="status" className="text-support leading-relaxed text-warning">
          끼니를 먼저 골라 주세요.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-support leading-relaxed text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-disabled={busy || needsMeal || undefined}
          onClick={() => {
            if (!busy && !needsMeal) onSubmit(portion)
          }}
          className={mealPrimaryButton}
        >
          {busy ? '저장하는 중…' : mode === 'new' ? '등록' : '수정 저장'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`w-full ${mealSecondaryButton}`}
        >
          취소
        </button>
      </div>
    </div>
  )
}

/** 양 선택 팝업(바텀시트). 닫으면 열기 전 포커스로 돌아간다. */
export default function MealPortionSheet({
  onClose,
  ...form
}: Omit<Parameters<typeof MealPortionForm>[0], 'onCancel'> & {
  onClose: () => void
}) {
  return (
    <BottomSheet
      title={form.mode === 'new' ? '양 선택' : '양 수정'}
      onClose={onClose}
    >
      {(close) => <MealPortionForm {...form} onCancel={close} />}
    </BottomSheet>
  )
}
