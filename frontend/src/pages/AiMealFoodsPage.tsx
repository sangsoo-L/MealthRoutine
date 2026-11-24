import { useMemo } from 'react'
import { Navigate, useNavigate } from 'react-router'
import type { MealPlanRequest } from '../ai/meal/mealPlanContract.ts'
import { redirectStep, STEP_PATH, suggestedSelectedCalories } from '../ai/meal/mealPlanFlow.ts'
import { useMealPlanFlow } from '../ai/meal/mealPlanFlowContext.ts'
import { PATH_AI_MEAL_PLAN } from '../ai/meal/mealPlanPaths.ts'
import { useFlowTomorrow } from '../ai/meal/useFlowTomorrow.ts'
import { useCandidateCount } from '../ai/meal/useMealPlanInfo.ts'
import MealPlanFoodsView from '../components/ai/meal/MealPlanFoodsView.tsx'
import MealPlanGate from '../components/ai/meal/MealPlanGate.tsx'
import type { MealGoal } from '../meal-goal/mealGoalTypes.ts'

function FoodsStep({ goal, devSearch }: { goal: MealGoal; devSearch: string }) {
  const flow = useMealPlanFlow()
  const navigate = useNavigate()
  useFlowTomorrow()
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
            excludedFoodGroups: selection.conditions.excludedFoodGroups,
            goalUpdatedAt,
          },
    [selection, goalUpdatedAt],
  )
  // 현재 FastAPI에는 후보 수 별도 조회 API가 없으므로 미제공 상태로 표시한다.
  const candidates = useCandidateCount(request)

  const back = redirectStep('foods', selection)
  if (back !== null) {
    return <Navigate to={`${STEP_PATH[back]}${devSearch}`} replace />
  }
  return (
    <MealPlanFoodsView
      targetCalories={flow.targetCalories ?? String(suggestedSelectedCalories(goal.kcal, selection.meals.length))}
      onTargetCaloriesChange={flow.setTargetCalories}
      selection={selection}
      candidates={candidates}
      notice={flow.notice}
      devSearch={devSearch}
      onSetType={flow.setFoodType}
      onToggleKind={flow.toggleKind}
      onToggleExcludedGroup={flow.toggleExcludedGroup}
      onReset={flow.resetConditions}
      onDismissNotice={flow.dismissNotice}
      onNext={() => {
        flow.startRequest(goalUpdatedAt, goal.kcal)
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
