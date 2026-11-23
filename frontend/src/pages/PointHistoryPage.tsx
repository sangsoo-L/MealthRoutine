import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import DevDataNotice from '../components/mypage/DevDataNotice.tsx'
import PointHistoryView from '../components/mypage/history/PointHistoryView.tsx'
import {
  createPointHistorySource,
  runPointHistory,
} from '../growth-history/pointHistory.ts'
import { useHistory } from '../growth-history/useHistory.ts'
import { useMyPageSummary } from '../mypage/useMyPageSummary.ts'

/** 서버 연결은 한 번 정한다(지금은 연결 전이라 null). */
const SOURCE = createPointHistorySource()
const RUN = (signal: AbortSignal) => runPointHistory(SOURCE, signal)

function PointContent() {
  const summary = useMyPageSummary()
  const { state, reload } = useHistory(RUN)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* 개발 서버의 개발용 포인트 값이 화면에 있을 때만 보인다. 운영 빌드에서는 코드째 제거된다. */}
      {import.meta.env.DEV && summary.sample.points ? <DevDataNotice /> : null}
      <PointHistoryView
        points={summary.points}
        state={state}
        onRetry={reload}
      />
    </div>
  )
}

/**
 * P16 포인트 내역(`/mypage/points`, 회원 전용). 보유 포인트는 마이페이지(P01)와 같은 기존 출처의 값이고, 적립·사용 내역은 서버가 준 것만 보인다
 * (서버 연결 전에는 "아직 볼 수 없어요", 내역 없음·조회 실패와 구분). 포인트를 적립·차감·사용하지 않으며 예시·가짜 내역을 만들지 않는다.
 * 상위 화면은 마이페이지(P01)이고 화면이 h1을 직접 가진다. 계정이 바뀌면 key로 새로 시작해 이전 사용자의 상태가 남지 않는다.
 */
export default function PointHistoryPage() {
  const { user } = useAuth()
  usePageTitle('포인트 내역')
  if (!user) return null
  return <PointContent key={user.id} />
}
