import { useNavigate } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import HealthGoalSettingsView from '../components/settings/health-goal/HealthGoalSettingsView.tsx'
import { useHealthGoal } from '../health-goal/useHealthGoal.ts'
import { useKnowledgeLevels } from '../mypage/useKnowledgeLevels.ts'

function GoalContent({
  userId,
  cancelTo,
}: {
  userId: string
  cancelTo: string
}) {
  const navigate = useNavigate()
  const goal = useHealthGoal(userId)
  const knowledge = useKnowledgeLevels(userId)
  return (
    <HealthGoalSettingsView
      goal={goal.state}
      knowledge={knowledge.state}
      save={goal.save}
      onRetry={goal.reload}
      onCancel={() => void navigate(cancelTo)}
    />
  )
}

/**
 * P10 건강 목표 상세 설정(`/settings/health-goal`, 회원 전용). 기존 건강 목표 저장소(`useHealthGoal`)와 설정 폼(GoalForm)을 재사용하며
 * 새 계산식·추천은 없다. 운영 빌드(저장 수단 없음)는 폼 없이 "연결 전"만 보인다. 상위 화면은 상세 설정(P09)이고, 진입한 화면(`state.from`)이 있으면
 * 취소·"이전"이 그곳으로 돌아간다. 화면이 h1을 직접 가진다. 계정이 바뀌면 key로 새로 시작해 이전 사용자의 목표·선택이 남지 않는다.
 */
export default function HealthGoalSettingsPage() {
  const { user } = useAuth()
  usePageTitle('건강 목표 상세 설정')
  const cancelTo = useBackTarget('/settings') ?? '/settings'
  if (!user) return null
  return <GoalContent key={user.id} userId={user.id} cancelTo={cancelTo} />
}
