import { useAuth } from '../auth/authContext.ts'
import RoutineListView from '../components/routine/RoutineListView.tsx'
import { useRoutines } from '../exercise/useRoutines.ts'

function RoutineListBody() {
  const { user } = useAuth()
  const { state, reload } = useRoutines(user?.id ?? null)
  return <RoutineListView state={state} onRetry={reload} />
}

/**
 * W06 내 운동 루틴(`/records/exercise/routines`, 회원 전용: 라우트의 AuthGate). 이 계정이 저장한 루틴 목록과 새 루틴 만들기(W08)·상세(W07) 이동.
 * 계정이 바뀌면 key로 본체를 다시 만들어 이전 계정의 목록이 남지 않게 한다.
 */
export default function RoutineListPage() {
  const { user } = useAuth()
  return <RoutineListBody key={user?.id ?? ''} />
}
