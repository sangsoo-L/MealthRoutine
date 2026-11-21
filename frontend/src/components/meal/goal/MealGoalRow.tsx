import type { MouseEvent } from 'react'
import { Link } from 'react-router'
import { PATH_MEAL } from '../../../food/foodPaths.ts'
import { ratioToGrams } from '../../../meal-goal/mealGoalCalculation.ts'
import { PATH_MEAL_GOAL } from '../../../meal-goal/mealGoalPaths.ts'
import {
  PURPOSE_LABEL,
  isMealGoalSaveEnabled,
} from '../../../meal-goal/mealGoalPolicy.ts'
import type { MealGoalState } from '../../../meal-goal/mealGoalTypes.ts'
import Icon from '../../icons/Icon.tsx'
import { mealSecondaryButton } from '../../food/foodStyles.ts'

const insetFocusRing =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-meal'

function PendingBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-meal-soft px-2.5 py-1 text-support leading-none font-normal text-meal">
      준비 중
    </span>
  )
}

/**
 * D01 "식단 관리"의 식단 목표 행. 목표 조회 상태를 서로 다른 안내로 보여 준다.
 * - 불러오는 중 / 조회 실패(다시 시도, 목표 없음으로 단정하지 않는다) / 저장 수단 없음(준비 중)
 * - 목표 없음: 상태 안내와 "식단 목표 정하기"(D01-4). 계산 기준이 전문가 검증 전이면 아직 저장할 수 없다고 정확히 알린다.
 * - 목표 있음: 저장된 하루 열량·목적·탄단지 비율과 "목표 다시 정하기"(D01-4).
 * 링크는 들어온 화면(D01)을 state.from으로 넘겨 목표 화면에서 취소·저장하면 D01로 돌아온다.
 */
export default function MealGoalRow({
  state,
  onRetry,
}: {
  state: MealGoalState
  onRetry: () => void
}) {
  if (state.status === 'loading') {
    return (
      <div
        role="group"
        aria-label="식단 목표"
        data-meal-goal-row="loading"
        className="p-4"
      >
        <p className="text-body leading-snug font-semibold text-content">
          식단 목표
        </p>
        <p
          role="status"
          className="mt-0.5 text-support leading-relaxed font-normal text-muted"
        >
          식단 목표를 불러오는 중이에요…
        </p>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div
        role="group"
        aria-label="식단 목표"
        data-meal-goal-row="error"
        tabIndex={-1}
        className="p-4"
      >
        <div role="alert">
          <p className="text-body leading-snug font-semibold text-content">
            현재 식단 목표를 불러올 수 없어요
          </p>
          <p className="mt-0.5 text-support leading-relaxed font-normal text-muted">
            목표가 없는 것은 아니에요. 식단 기록에는 영향이 없어요. 잠시 후 다시
            시도해 주세요.
          </p>
        </div>
        <button
          type="button"
          onClick={(event: MouseEvent<HTMLButtonElement>) => {
            event.currentTarget.closest<HTMLElement>('[tabindex="-1"]')?.focus()
            onRetry()
          }}
          className={`mt-3 w-full ${mealSecondaryButton}`}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <div
        role="group"
        aria-label="식단 목표"
        data-meal-goal-row="unavailable"
        className="p-4"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-body leading-snug font-semibold text-content">
              식단 목표
            </p>
            <p className="mt-0.5 text-support leading-relaxed font-normal text-muted">
              식단 목표 저장 기능은 준비 중이에요. 목표가 없어 남은
              열량·달성률은 보여 드리지 않아요.
            </p>
          </div>
          <PendingBadge />
        </div>
      </div>
    )
  }
  const goal = state.goal
  const grams = goal ? ratioToGrams(goal.kcal, goal.ratio) : null
  return (
    <div
      role="group"
      aria-label="식단 목표"
      data-meal-goal-row={goal ? 'filled' : 'empty'}
    >
      <Link
        to={PATH_MEAL_GOAL}
        state={{ from: PATH_MEAL }}
        className={`flex min-h-11 items-center justify-between gap-3 p-4 hover:bg-page ${insetFocusRing}`}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-body leading-snug font-semibold text-content">
              식단 목표
            </span>
            {goal ? (
              <span className="rounded-full bg-meal-soft px-2.5 py-0.5 text-support leading-snug font-semibold text-meal">
                {PURPOSE_LABEL[goal.purpose]}
              </span>
            ) : null}
          </span>
          {goal && grams ? (
            <>
              <span className="mt-0.5 block text-body leading-snug font-semibold tabular-nums text-content">
                하루 {goal.kcal.toLocaleString()} kcal
              </span>
              <span className="block text-support leading-relaxed font-normal tabular-nums text-muted">
                탄수화물 {goal.ratio.carb}% · 단백질 {goal.ratio.protein}% ·
                지방 {goal.ratio.fat}%
              </span>
            </>
          ) : (
            <span className="mt-0.5 block text-support leading-relaxed font-normal text-muted">
              {isMealGoalSaveEnabled()
                ? '아직 정하지 않았어요. 목적을 고르면 하루 열량과 탄단지 비율을 정해 드려요.'
                : '아직 정하지 않았어요. 목표 계산 기준의 전문가 검증이 끝나야 목표를 저장할 수 있어요.'}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-support font-semibold text-meal">
          {goal ? '목표 다시 정하기' : '식단 목표 정하기'}
          <Icon name="chevron-right" size={18} />
        </span>
      </Link>
    </div>
  )
}
