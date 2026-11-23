import MealPlanGate from '../components/ai/meal/MealPlanGate.tsx'
import MealPlanGoalView from '../components/ai/meal/MealPlanGoalView.tsx'

/**
 * I03 AI 식단 플랜 · 목표 확인(`/ai/meal`, 회원 전용). 식단 목표를 확인하고 끼니 선택(I03-1)으로 간다.
 * 목표 조회 상태 분기(조회 중·실패·저장 수단 없음·목표 없음 → I07)는 MealPlanGate가 맡는다. 추천·계산·저장은 하지 않는다.
 */
export default function AiMealPlanPage() {
  return (
    <MealPlanGate title="AI 식단 플랜 · 목표 확인">
      {({ goal, devSearch }) => (
        <MealPlanGoalView goal={goal} devSearch={devSearch} />
      )}
    </MealPlanGate>
  )
}
