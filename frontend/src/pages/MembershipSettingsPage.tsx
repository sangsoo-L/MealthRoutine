import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import MembershipSettingsView from '../components/settings/membership/MembershipSettingsView.tsx'
import { MEMBERSHIP_SOURCE } from '../membership/membership.ts'
import { useMembership } from '../membership/useMembership.ts'

function MembershipContent() {
  const { state, reload } = useMembership(MEMBERSHIP_SOURCE)
  return <MembershipSettingsView state={state} onRetry={reload} />
}

/**
 * P03 멤버십과 결제 관리(`/settings/membership`, 회원 전용). 통합 AI 멤버십(무료·베이직·프로)의 현재 멤버십·AI 사용량은 서버가 준 값만 보인다
 * (서버 연결 전에는 "연결 전"). 결제·멤버십 시작·변경 버튼은 결제 API가 없어 비활성이며, 멤버십 상태·사용량·결제 내역을 이 앱이 만들거나 저장하지 않는다.
 * 상위 화면은 상세 설정(P09)이고, 진입한 화면(`state.from`: 마이페이지 등)이 있으면 "이전"이 그곳으로 돌아간다. 화면이 h1을 직접 가진다.
 * 계정이 바뀌면 key로 새로 시작해 이전 사용자의 상태가 남지 않는다.
 */
export default function MembershipSettingsPage() {
  const { user } = useAuth()
  usePageTitle('멤버십과 결제 관리')
  if (!user) return null
  return <MembershipContent key={user.id} />
}
