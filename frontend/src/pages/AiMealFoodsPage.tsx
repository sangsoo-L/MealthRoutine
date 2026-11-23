import { useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router'
import type { MealPlanRequest } from '../ai/meal/mealPlanContract.ts'
import { redirectStep, STEP_PATH } from '../ai/meal/mealPlanFlow.ts'
import { useMealPlanFlow } from '../ai/meal/mealPlanFlowContext.ts'
import { PATH_AI_MEAL_PLAN } from '../ai/meal/mealPlanPaths.ts'
import { useFlowTomorrow } from '../ai/meal/useFlowTomorrow.ts'
import { useCandidateCount } from '../ai/meal/useMealPlanInfo.ts'
import MealPlanFoodsView from '../components/ai/meal/MealPlanFoodsView.tsx'
import MealPlanGate from '../components/ai/meal/MealPlanGate.tsx'
import { useFoods } from '../food/useFoods.ts'
import type { MealGoal } from '../meal-goal/mealGoalTypes.ts'

function FoodsStep({ goal, devSearch }: { goal: MealGoal; devSearch: string }) {
  const flow = useMealPlanFlow()
  const navigate = useNavigate()
  useFlowTomorrow()
  // 제외할 음식을 고르는 목록만 F01과 같은 음식 조회에서 읽는다(읽기 전용). 후보 수 계산에는 쓰지 않는다.
  const { state: foods, reload } = useFoods()
  const { selection } = flow
  const goalUpdatedAt = goal.updatedAt
  const request = useMemo<MealPlanRequest | null>(
    () =>
      selection.targetDate === null || selection.meals.length === 0
        ? null
        : {
            targetDate: selection.targetDate,
            meals: selection.meals,
            foodType: selection.conditions.type,
            foodKinds: selection.conditions.kinds,
            excludedFoodIds: selection.conditions.excludedFoodIds,
            goalUpdatedAt,
          },
    [selection, goalUpdatedAt],
  )
  // 후보 수는 서버가 계산할 값이다(연결 전이면 "연결 대기").
  const candidates = useCandidateCount(request)

  const back = redirectStep('foods', selection)
  if (back !== null) {
    return <Navigate to={`${STEP_PATH[back]}${devSearch}`} replace />
  }
  return (
    <MealPlanFoodsView
      selection={selection}
      foods={foods}
      candidates={candidates}
      notice={flow.notice}
      devSearch={devSearch}
      onSetType={flow.setFoodType}
      onToggleKind={flow.toggleKind}
      onToggleExcluded={flow.toggleExcluded}
      onReset={flow.resetConditions}
      onRetryFoods={reload}
      onDismissNotice={flow.dismissNotice}
      onNext={() => {
        flow.startRequest(goalUpdatedAt)
        navigate(`${PATH_AI_MEAL_PLAN}${devSearch}`)
      }}
    />
  )
}

/**
 * I03-2 AI 식단 플랜 · 음식 조건 설정(`/ai/meal/foods`, 회원 전용). 앞 단계(끼니 선택) 입력이 없으면(새로고침·직접 접근) I03-1로 돌려보낸다.
 * "추천 생성"은 추천 요청을 시작하고 I03-3으로 이동한다. 서버 연결이 없으면 요청 없이 "연결 전" 상태가 된다.
 */
export default function AiMealFoodsPage() {
  return (
    <MealPlanGate title="AI 식단 플랜 · 음식 조건">
      {({ goal, devSearch }) => <FoodsStep goal={goal} devSearch={devSearch} />}
    </MealPlanGate>
  )
}
