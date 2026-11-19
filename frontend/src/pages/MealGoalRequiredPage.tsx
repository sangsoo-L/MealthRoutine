import { Navigate, useLocation } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import MealGoalRequiredView from '../components/meal/goal/MealGoalRequiredView.tsx'
import { resolveReturnPath } from '../meal-goal/mealGoalPaths.ts'
import { useMealGoal } from '../meal-goal/useMealGoal.ts'

/**
 * I07 식단 목표 없음 안내(`/ai/meal/goal-required`, 회원 전용). 목표를 읽어 상태별로 나눈다.
 * - 목표 있음: 이 화면을 보이지 않고 돌아갈 곳으로 `replace` 이동한다(직접 URL·새로고침·뒤로 가기에서도 같다).
 * - 목표 없음: 안내와 목표 설정(D01-4) 링크. 조회 중·실패·저장 수단 없음은 목표 없음으로 보지 않는다.
 * 돌아갈 곳(`state.returnTo`)은 허용 목록의 내부 경로만 쓰며, I03이 아직 없으면 AI 서비스 안내(`/ai`)다. 이 화면의 "이전"은 항상 상위 화면(I01)이라
 * I03 ↔ I07이 서로를 가리키는 반복이 생기지 않는다(I03이 목표 없음에서 이 화면으로 `replace` 이동하고 `from`이 아닌 `returnTo`만 넘긴다).
 */
function RequiredBody({ userId }: { userId: string }) {
  const location = useLocation()
  const { state, reload } = useMealGoal(userId)
  const returnTo = resolveReturnPath(
    (location.state as { returnTo?: unknown } | null)?.returnTo,
    '/ai',
  )
  if (state.status === 'ready' && state.goal !== null) {
    return <Navigate to={returnTo} replace />
  }
  return (
    <MealGoalRequiredView
      state={state.status === 'ready' ? { status: 'ready', goal: null } : state}
      returnTo={returnTo}
      onRetry={reload}
    />
  )
}

export default function MealGoalRequiredPage() {
  const { user } = useAuth()
  return user ? <RequiredBody key={user.id} userId={user.id} /> : null
}
