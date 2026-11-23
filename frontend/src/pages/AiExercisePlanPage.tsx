import { createLocalPlanSource } from '../ai/exercisePlanSource.ts'
import { useAuth } from '../auth/authContext.ts'
import ExercisePlanFlowView from '../components/ai/exercise/ExercisePlanFlowView.tsx'
import { useAiAccess } from '../membership/useAiAccess.ts'

/**
 * I02-1 AI 운동 플랜 · 조건 선택과 추천(`/ai/exercise/plan`, 회원 전용). 실제 AI 호출·체험 횟수 저장·차감 없이 로컬 예시 추천만 보여 준다.
 * 접근 상태는 멤버십 상품 유형이 아니라 서버가 확인한 통합 AI 사용량으로 구분한다(useAiAccess). 서버 연결 전(unknown)에는 권한을 부여하지 않으며,
 * 로컬 예시는 AI 요청이 아니라 그대로 열려 있다. 서버가 확인한 잔여가 0이면 새 요청을 제한하는 안내만 보인다. 사용량은 이 앱이 계산·저장하지 않는다.
 * 계정이 바뀌면 입력·결과를 새로 시작한다(key). 결과의 "목록 등록"은 W02·W11 흐름으로 이어진다(저장은 기존 W11 절차).
 */
function PlanBody() {
  const access = useAiAccess()
  return (
    <ExercisePlanFlowView access={access} source={createLocalPlanSource()} />
  )
}

export default function AiExercisePlanPage() {
  const { user } = useAuth()
  return <PlanBody key={user?.id ?? ''} />
}
