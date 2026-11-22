import { createLocalPlanSource } from '../ai/exercisePlanSource.ts'
import { useAuth } from '../auth/authContext.ts'
import { getExercisePlanAccess } from '../auth/entitlements.ts'
import ExercisePlanFlowView from '../components/ai/exercise/ExercisePlanFlowView.tsx'

/**
 * I02-1 AI 운동 플랜 · 조건 선택과 추천(`/ai/exercise/plan`, 회원 전용). 실제 AI 호출·체험 횟수 저장·차감 없이 로컬 예시 추천만 보여 준다.
 * 권한은 getExercisePlanAccess로 구분만 하며(서버 검증이 아니다) 확정할 수 없는 구분(unspecified)은 안내 상태로 둔다.
 * 계정이 바뀌면 입력·결과를 새로 시작한다(key). 결과의 "목록 등록"은 W02·W11 흐름으로 이어진다(저장은 기존 W11 절차).
 */
function PlanBody() {
  const { user } = useAuth()
  const access = user ? getExercisePlanAccess(user.entitlement) : 'unspecified'
  return (
    <ExercisePlanFlowView access={access} source={createLocalPlanSource()} />
  )
}

export default function AiExercisePlanPage() {
  const { user } = useAuth()
  return <PlanBody key={user?.id ?? ''} />
}
