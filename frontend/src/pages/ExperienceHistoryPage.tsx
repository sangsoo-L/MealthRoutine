import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import DevDataNotice from '../components/mypage/DevDataNotice.tsx'
import ExperienceHistoryView from '../components/mypage/history/ExperienceHistoryView.tsx'
import {
  createExperienceHistorySource,
  runExperienceHistory,
} from '../growth-history/experienceHistory.ts'
import { useHistory } from '../growth-history/useHistory.ts'
import { useMyPageSummary } from '../mypage/useMyPageSummary.ts'

/** 서버 연결은 한 번 정한다(지금은 연결 전이라 null). */
const SOURCE = createExperienceHistorySource()
const RUN = (signal: AbortSignal) => runExperienceHistory(SOURCE, signal)

function ExperienceContent() {
  const summary = useMyPageSummary()
  const { state, reload } = useHistory(RUN)
  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* 개발 서버의 개발용 레벨 값이 화면에 있을 때만 보인다. 운영 빌드에서는 코드째 제거된다. */}
      {import.meta.env.DEV && summary.sample.level ? <DevDataNotice /> : null}
      <ExperienceHistoryView
        level={summary.level}
        state={state}
        onRetry={reload}
      />
    </div>
  )
}

/**
 * P14 경험치 내역(`/mypage/experience`, 회원 전용). 현재 활동 레벨은 마이페이지(P01)와 같은 기존 출처의 값이고, 적립 내역은 서버가 준 것만 보인다
 * (서버 연결 전에는 "아직 볼 수 없어요", 내역 없음·조회 실패와 구분). 경험치를 적립·차감·산정하지 않으며 예시·가짜 내역을 만들지 않는다.
 * 상위 화면은 마이페이지(P01)이고 화면이 h1을 직접 가진다. 계정이 바뀌면 key로 새로 시작해 이전 사용자의 상태가 남지 않는다.
 */
export default function ExperienceHistoryPage() {
  const { user } = useAuth()
  usePageTitle('경험치 내역')
  if (!user) return null
  return <ExperienceContent key={user.id} />
}
