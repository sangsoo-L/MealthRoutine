import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import { MEAL_TYPES } from '../food/mealModel.ts'
import { useMealPlanFlow } from '../ai/meal/mealPlanFlowContext.ts'
import { PATH_AI_MEAL_FOODS } from '../ai/meal/mealPlanPaths.ts'
import { useFlowTomorrow } from '../ai/meal/useFlowTomorrow.ts'
import { useMealPlanTargets } from '../ai/meal/useMealPlanInfo.ts'
import MealPlanGate from '../components/ai/meal/MealPlanGate.tsx'
import MealPlanMealsView from '../components/ai/meal/MealPlanMealsView.tsx'
import type { MealGoal } from '../meal-goal/mealGoalTypes.ts'

function MealsStep({ goal, devSearch }: { goal: MealGoal; devSearch: string }) {
  const flow = useMealPlanFlow()
  const navigate = useNavigate()
  const tomorrow = useFlowTomorrow()
  const goalUpdatedAt = goal.updatedAt
  // 끼니별 목표량은 서버가 계산해 줄 값이다(연결 전이면 "연결 대기"). 세 끼 모두의 값을 한 번에 묻는다.
  const query = useMemo(
    () => ({ targetDate: tomorrow, meals: MEAL_TYPES, goalUpdatedAt }),
    [tomorrow, goalUpdatedAt],
  )
  const targets = useMealPlanTargets(query)
  return (
    <MealPlanMealsView
      tomorrow={tomorrow}
      selection={flow.selection}
      targets={targets}
      // 식품 구분 변경 충돌 안내는 음식 조건 화면(I03-2)에서만 보인다.
      notice={flow.noticeStep === 'foods' ? null : flow.notice}
      devSearch={devSearch}
      onToggleMeal={(meal) => flow.toggleMeal(meal, tomorrow)}
      onToggleAll={() => flow.toggleAllMeals(tomorrow)}
      onDismissNotice={flow.dismissNotice}
      onNext={() => navigate(`${PATH_AI_MEAL_FOODS}${devSearch}`)}
    />
  )
}

/**
 * I03-1 AI 식단 플랜 · 끼니 선택(`/ai/meal/meals`, 회원 전용). 앞 단계 입력이 필요 없는 화면이라 새로고침·직접 접근에서도 그대로 열린다.
 * 선택은 앱 수준 Provider가 가져 이전 단계로 갔다 와도 유지된다.
 */
export default function AiMealSelectPage() {
  return (
    <MealPlanGate title="AI 식단 플랜 · 끼니 선택">
      {({ goal, devSearch }) => <MealsStep goal={goal} devSearch={devSearch} />}
    </MealPlanGate>
  )
}
