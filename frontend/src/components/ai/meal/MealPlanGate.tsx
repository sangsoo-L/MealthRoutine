import { useEffect, type ReactNode } from 'react'
import { Link, Navigate } from 'react-router'
import { useAuth } from '../../../auth/authContext.ts'
import type { DevGoalPreview } from '../../../ai/meal/devGoalPreview.ts'
import { PATH_AI_MEAL } from '../../../ai/meal/mealPlanPaths.ts'
import { useMealPlanFlow } from '../../../ai/meal/mealPlanFlowContext.ts'
import { useMealPlanGoal } from '../../../ai/meal/useMealPlanGoal.ts'
import { usePageTitle } from '../../../ai/meal/usePageTitle.ts'
import { PATH_MEAL_GOAL_REQUIRED } from '../../../meal-goal/mealGoalPaths.ts'
import type { MealGoal } from '../../../meal-goal/mealGoalTypes.ts'
import { PATH_AI } from '../../../ai/aiPaths.ts'
import { DevPreviewBanner } from './MealPlanChrome.tsx'
import { mealCard, mealSecondaryButton } from './mealPlanStyles.ts'

export interface GateContext {
  goal: MealGoal
  /** 단계 이동 때 붙일 검색 문자열(개발 서버의 검증 상태를 이어 간다). 실제 흐름에서는 빈 문자열. */
  devSearch: string
}

/**
 * AI 식단 플랜 4개 화면이 공유하는 식단 목표 확인 관문. 목표 조회 상태를 구분해 그린다.
 * - 조회 중: 안내만. 조회 실패: 오류와 다시 시도(목표가 없는 것이 아니다). 저장 수단 없음: 준비 중 안내.
 * - 목표 없음이 확인되면 I07로 `replace` 이동한다(돌아갈 곳은 I03 흐름의 시작). 목표가 있어도 I03으로 되돌아오는 반복은 없다.
 * - 목표가 있으면 화면(children)을 그리고, 흐름이 본 목표의 시점(updatedAt)을 Provider에 알려 목표가 바뀌면 선택을 비운다.
 * 실제로 목표를 저장하거나 목표 상태를 만들어 내지 않는다. 개발 서버의 `?devGoal=` 검증 상태는 이 관문의 입력만 바꾼다.
 */
function GateBody({
  userId,
  title,
  children,
}: {
  userId: string
  title: string
  children: (context: GateContext) => ReactNode
}) {
  const { syncGoal } = useMealPlanFlow()
  // 목표를 확인하는 동안·오류·준비 중 상태에서도 문서 제목이 앞 화면의 것으로 남지 않게 한다(목표 있음이면 각 단계 머리말이 다시 정한다).
  usePageTitle(title)
  const { state, reload, devPreview, devSearch } = useMealPlanGoal(userId)
  const goal = state.status === 'ready' ? state.goal : null
  const stamp = goal?.updatedAt ?? null

  useEffect(() => {
    if (stamp !== null) syncGoal(stamp)
  }, [stamp, syncGoal])

  const banner = (preview: DevGoalPreview | null) =>
    import.meta.env.DEV && preview !== null ? (
      <DevPreviewBanner preview={preview} />
    ) : null

  if (state.status === 'loading') {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {banner(devPreview)}
        <h1 className="sr-only">{title}</h1>
        <p role="status" data-plan-gate="loading" className={mealCard}>
          식단 목표를 확인하는 중이에요…
        </p>
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {banner(devPreview)}
        <div role="alert" data-plan-gate="error" className={mealCard}>
          <h1 className="text-section-title leading-snug font-semibold text-content">
            식단 목표를 확인하지 못했어요
          </h1>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            목표가 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={reload}
            className={`mt-4 w-full ${mealSecondaryButton}`}
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }
  if (state.status === 'unavailable') {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        {banner(devPreview)}
        <div data-plan-gate="unavailable" className={mealCard}>
          <h1 className="text-section-title leading-snug font-semibold text-content">
            AI 식단 플랜을 준비 중이에요
          </h1>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            지금은 식단 목표를 확인할 수 없어요. 식단 목표가 있는지 단정하지
            않고, 준비가 끝나면 안내해 드릴게요.
          </p>
          <Link to={PATH_AI} className={`mt-4 ${mealSecondaryButton}`}>
            AI 서비스 안내로 돌아가기
          </Link>
        </div>
      </div>
    )
  }
  if (goal === null) {
    return (
      <Navigate
        to={PATH_MEAL_GOAL_REQUIRED}
        replace
        state={{ returnTo: PATH_AI_MEAL }}
      />
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {banner(devPreview)}
      {children({ goal, devSearch })}
    </div>
  )
}

/** 회원만 그린다(라우트의 AuthGate가 비회원을 먼저 막는다). 계정이 바뀌면 목표 조회를 새로 시작한다(key). */
export default function MealPlanGate({
  title,
  children,
}: {
  /** 화면 제목(조회 중에 보조기기용 h1로 쓴다). */
  title: string
  children: (context: GateContext) => ReactNode
}) {
  const { user } = useAuth()
  return user ? (
    <GateBody key={user.id} userId={user.id} title={title}>
      {children}
    </GateBody>
  ) : null
}
