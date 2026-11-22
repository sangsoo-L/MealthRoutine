import { useLocation, useSearchParams } from 'react-router'
import { weeklyScorePath } from '../ai/aiPaths.ts'
import { useWeeklyReport } from '../ai/useWeeklyReport.ts'
import { clampWeekOffset } from '../ai/weeklyReport.ts'
import { useAuth } from '../auth/authContext.ts'
import WeeklyReportView from '../components/ai/weekly/WeeklyReportView.tsx'
import { useBackNavigation } from '../components/layout/useBackTarget.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'

function ReportBody() {
  const { user } = useAuth()
  const today = useLocalToday()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  // 진입한 화면(W01·D01 등). 모르면 상위 화면(I01)이다. 주를 바꾸거나 점수 화면을 다녀와도 "이전"이 그대로 이어지도록 state를 보존한다.
  const entry = useBackNavigation('/ai')
  const offset = clampWeekOffset(params.get('offset'))
  const report = useWeeklyReport(user?.id ?? null, today, offset)

  /** 선택한 주는 주소(?offset=)에 보관한다(같은 경로 안의 이동이라 화면이 다시 마운트되지 않고, 새로고침·평가하기에서도 유지된다). */
  function moveTo(next: number) {
    setParams(next === 0 ? {} : { offset: String(next) }, {
      replace: true,
      state: location.state,
    })
  }

  return (
    <WeeklyReportView
      range={report.range}
      today={today}
      exercise={report.exercise}
      meal={report.meal}
      goal={report.goal}
      onOffsetChange={moveTo}
      onRetryExercise={report.reloadExercise}
      onRetryMeal={report.reloadMeal}
      scoreTo={weeklyScorePath(report.range.offset)}
      entryFrom={entry?.to}
    />
  )
}

/** I05 주간 기록 리포트(`/ai/weekly-report`, 회원 전용). 계정이 바뀌면 화면 상태를 새로 시작한다. */
export default function WeeklyReportPage() {
  const { user } = useAuth()
  return <ReportBody key={user?.id ?? ''} />
}
