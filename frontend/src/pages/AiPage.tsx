import { aiEntryKind } from '../ai/aiEntry.ts'
import { useAuth } from '../auth/authContext.ts'
import AiHomeView from '../components/ai/AiHomeView.tsx'
import AiLandingView from '../components/ai/AiLandingView.tsx'

/**
 * AI 서비스 진입(`/ai`, I01). 같은 주소에서 로그인 상태에 따라 화면이 나뉜다: 회원은 AI 서비스 홈(AiHomeView), 비회원은 AI 소개 랜딩(AiLandingView).
 * 인증 상태를 아직 모르면 아무것도 그리지 않는다(aiEntryKind). 실제 AI 기능과 체험 횟수 처리는 하지 않는다.
 * /ai/exercise(I02)는 비회원에게도 공개이고 /ai/weekly-report(I05)·/ai/weekly-report/score(I05-1)는 라우터의 AuthGate가 회원 전용으로 지킨다.
 */
export default function AiPage() {
  const { status } = useAuth()
  const kind = aiEntryKind(status)
  if (kind === 'pending') return null
  return kind === 'member' ? <AiHomeView /> : <AiLandingView />
}
