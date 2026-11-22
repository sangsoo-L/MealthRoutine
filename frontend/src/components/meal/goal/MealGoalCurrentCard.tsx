import { ratioToGrams } from '../../../meal-goal/mealGoalCalculation.ts'
import { PURPOSE_LABEL } from '../../../meal-goal/mealGoalPolicy.ts'
import type { MealGoal } from '../../../meal-goal/mealGoalTypes.ts'
import { goalCard } from './mealGoalStyles.ts'

/** 저장된 식단 목표 요약(수정 화면 위). 신체 수치는 담지 않는다. */
export default function MealGoalCurrentCard({ goal }: { goal: MealGoal }) {
  const grams = ratioToGrams(goal.kcal, goal.ratio)
  return (
    <section
      className={goalCard}
      aria-labelledby="meal-goal-current-title"
      data-meal-goal-current=""
    >
      <p
        id="meal-goal-current-title"
        className="text-support leading-snug font-semibold text-muted"
      >
        현재 목표
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong className="text-metric leading-none font-semibold tabular-nums text-content">
          하루 {goal.kcal.toLocaleString()} kcal
        </strong>
        <span className="rounded-full bg-meal-soft px-3 py-1 text-support leading-snug font-semibold text-meal">
          {PURPOSE_LABEL[goal.purpose]}
        </span>
      </div>
      <p className="mt-2 text-support leading-relaxed font-normal tabular-nums text-muted">
        탄수화물 {goal.ratio.carb}% · 단백질 {goal.ratio.protein}% · 지방{' '}
        {goal.ratio.fat}%
      </p>
      <p className="text-support leading-relaxed font-normal tabular-nums text-muted">
        약 탄수화물 {grams.carb}g · 단백질 {grams.protein}g · 지방 {grams.fat}g
      </p>
      <p className="mt-2 text-support leading-relaxed font-normal text-muted">
        목표가 맞지 않거나 기록이 며칠 끊겼다면 언제든 다시 정해도 괜찮아요.
        지난 기록은 그대로 남아요.
      </p>
    </section>
  )
}
