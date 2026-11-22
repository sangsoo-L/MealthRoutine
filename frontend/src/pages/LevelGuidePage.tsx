import { useAuth } from '../auth/authContext.ts'
import LevelGuideView from '../components/level/LevelGuideView.tsx'
import { useKnowledgeLevels } from '../mypage/useKnowledgeLevels.ts'
import { useMyPageSummary } from '../mypage/useMyPageSummary.ts'

/**
 * P15 레벨 안내(`/mypage/level`, 회원 전용: 라우트의 AuthGate). 마이페이지(P01)와 같은 출처의 활동 레벨·운동 이해도를 읽기만 한다.
 * 경험치·포인트·승급은 어떤 값도 만들거나 바꾸지 않는다.
 */
export default function LevelGuidePage() {
  const { user } = useAuth()
  const summary = useMyPageSummary()
  // 훅은 조건 없이 호출해야 하므로 사용자가 없을 때의 빈 id로 부른다(AuthGate 안이라 실제로는 도달하지 않는다).
  const knowledge = useKnowledgeLevels(user?.id ?? '')
  return <LevelGuideView level={summary.level} knowledge={knowledge.state} />
}
