import { Navigate, useNavigate } from 'react-router'
import { redirectStep, STEP_PATH } from '../ai/meal/mealPlanFlow.ts'
import { useMealPlanFlow } from '../ai/meal/mealPlanFlowContext.ts'
import { PATH_AI_MEAL_FOODS } from '../ai/meal/mealPlanPaths.ts'
import { useFlowTomorrow } from '../ai/meal/useFlowTomorrow.ts'
import MealPlanGate from '../components/ai/meal/MealPlanGate.tsx'
import MealPlanResultView from '../components/ai/meal/MealPlanResultView.tsx'
import { useFoods } from '../food/useFoods.ts'
import type { MealGoal } from '../meal-goal/mealGoalTypes.ts'

function ResultStep({
  goal,
  devSearch,
}: {
  goal: MealGoal
  devSearch: string
}) {
  const flow = useMealPlanFlow()
  const navigate = useNavigate()
  useFlowTomorrow()
  // 제외 음식의 이름을 보여 주려고 F01과 같은 음식 조회를 읽기만 한다. 연결 전이면 이름 대신 "선택한 음식"으로 표시한다.
  const { state: foods } = useFoods()
  const goalUpdatedAt = goal.updatedAt

  const back = redirectStep('plan', flow.selection)
  if (back !== null) {
    return <Navigate to={`${STEP_PATH[back]}${devSearch}`} replace />
  }
  const foodNameOf = (foodId: string) =>
    foods.status === 'ready'
      ? (foods.foods.find((food) => food.id === foodId)?.name ?? null)
      : null
  return (
    <MealPlanResultView
      selection={flow.selection}
      request={flow.request}
      foodNameOf={foodNameOf}
      devSearch={devSearch}
      onRequest={() => flow.startRequest(goalUpdatedAt, goal.kcal)}
      onRetry={() => flow.startRequest(goalUpdatedAt, goal.kcal)}
      onLeave={() => {
        if (flow.request.status === 'analyzing') flow.cancelRequest()
      }}
      onCancel={() => {
        flow.cancelRequest()
        navigate(`${PATH_AI_MEAL_FOODS}${devSearch}`)
      }}
    />
  )
}

/**
 * I03-3 AI 식단 플랜 · 추천·등록(`/ai/meal/plan`, 회원 전용). 앞 단계 입력이 없으면(새로고침·직접 접근) 앞 단계로 돌려보내며,
 * 화면에 들어온 것만으로 추천을 요청하거나 결과를 만들지 않는다(요청은 I03-2의 "추천 생성"이나 이 화면의 "추천 요청하기"가 한다).
 * 내일 식단 계획 등록은 이번 범위에서 열지 않는다.
 */
export default function AiMealResultPage() {
  return (
    <MealPlanGate title="AI 식단 플랜 · 추천 확인">
      {({ goal, devSearch }) => (
        <ResultStep goal={goal} devSearch={devSearch} />
      )}
    </MealPlanGate>
  )
}
