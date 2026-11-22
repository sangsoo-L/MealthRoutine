import { Link } from 'react-router'
import { PATH_MEAL } from '../../../food/foodPaths.ts'
import { PATH_MEAL_GOAL } from '../../../meal-goal/mealGoalPaths.ts'
import { isMealGoalSaveEnabled } from '../../../meal-goal/mealGoalPolicy.ts'
import type { MealGoalState } from '../../../meal-goal/mealGoalTypes.ts'
import Icon from '../../icons/Icon.tsx'
import {
  mealPrimaryButton,
  mealSecondaryButton,
} from '../../food/foodStyles.ts'
import { goalCard } from './mealGoalStyles.ts'

type NotReadyState = Exclude<MealGoalState, { status: 'ready' }>

/**
 * I07 식단 목표 없음 안내(`/ai/meal/goal-required`, 회원 전용). AI 식단 플랜(I03)에 들어왔는데 식단 목표가 없을 때 이용할 수 없는 이유를 알리고 목표 설정(D01-4)으로 보낸다.
 * 목표 조회가 끝나 "목표 없음"이 확인됐을 때만 안내 본문을 보인다. 조회 중·실패·저장 수단 없음은 목표 없음으로 단정하지 않고 각자의 안내를 보인다.
 * 목표가 이미 있으면 이 화면을 보이지 않고 페이지가 돌아갈 곳으로 이동시킨다.
 */
export default function MealGoalRequiredView({
  state,
  returnTo,
  onRetry,
}: {
  state: NotReadyState | { status: 'ready'; goal: null }
  /** 목표를 정한 뒤 돌아갈 검증된 경로(I03이 없으면 AI 서비스 안내) */
  returnTo: string
  onRetry: () => void
}) {
  if (state.status === 'loading') {
    return (
      <p role="status" data-meal-goal-required="loading" className={goalCard}>
        식단 목표를 확인하는 중이에요…
      </p>
    )
  }
  if (state.status === 'error') {
    return (
      <div role="alert" data-meal-goal-required="error" className={goalCard}>
        <h1 className="text-section-title leading-snug font-semibold text-content">
          식단 목표를 확인하지 못했어요
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          목표가 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className={`mt-4 w-full ${mealSecondaryButton}`}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <div data-meal-goal-required="unavailable" className={goalCard}>
        <h1 className="text-section-title leading-snug font-semibold text-content">
          식단 목표 기능을 준비 중이에요
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          지금은 식단 목표를 확인할 수 없어요. 식단 목표가 있는지 단정하지 않고,
          준비가 끝나면 안내해 드릴게요.
        </p>
        <Link to="/ai" className={`mt-4 ${mealSecondaryButton}`}>
          AI 서비스 안내로 돌아가기
        </Link>
      </div>
    )
  }
  return (
    <div
      data-meal-goal-required="missing"
      className="flex min-w-0 flex-col items-center gap-4 pt-6 text-center"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-meal-soft text-meal"
      >
        <Icon name="clipboard-check" size={30} />
      </span>
      <p className="inline-flex items-center rounded-full bg-meal-soft px-2.5 py-1 text-support leading-none font-semibold text-meal">
        AI 식단 플랜
      </p>
      <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
        식단 목표가 아직 설정되지 않았어요
      </h1>
      <p className="text-body leading-relaxed font-normal text-pretty text-muted">
        AI 식단 플랜은 하루 열량과 탄단지 목표를 기준으로 음식을 구성해요.
        목표가 없으면 이용할 수 없어요. 식단 대시보드에서 먼저 목표를 정해
        주세요.
      </p>
      {!isMealGoalSaveEnabled() ? (
        <p
          role="note"
          data-meal-goal-policy-note=""
          className="w-full rounded-control bg-warning-soft px-3 py-2 text-left text-support leading-relaxed font-normal text-warning"
        >
          식단 목표 계산 기준은 전문가 검증을 기다리고 있어서 지금은 목표를
          저장할 수 없어요. 저장할 수 있게 되면 AI 식단 플랜을 이용할 수 있어요.
        </p>
      ) : null}
      <div className="flex w-full flex-col gap-2">
        <Link
          to={PATH_MEAL_GOAL}
          state={{ from: returnTo }}
          data-meal-goal-cta=""
          className={mealPrimaryButton}
        >
          식단 목표 정하기
        </Link>
        <Link to={PATH_MEAL} className={mealSecondaryButton}>
          식단 대시보드로 가기
        </Link>
      </div>
    </div>
  )
}
