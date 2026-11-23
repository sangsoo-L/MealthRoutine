import { useSearchParams } from 'react-router'
import { useBackNavigation } from '../components/layout/useBackTarget.ts'
import { weeklyReportPath } from '../ai/aiPaths.ts'
import { useCalcSteps } from '../ai/useCalcSteps.ts'
import { useWeeklyReport } from '../ai/useWeeklyReport.ts'
import { clampWeekOffset } from '../ai/weeklyReport.ts'
import { computeWeeklyScore } from '../ai/weeklyScore.ts'
import { useAuth } from '../auth/authContext.ts'
import WeeklyScoreView, {
  type ScorePhase,
} from '../components/ai/weekly/WeeklyScoreView.tsx'
import { useLocalToday } from '../exercise/useLocalToday.ts'

function ScoreBody() {
  const { user } = useAuth()
  const today = useLocalToday()
  const [params] = useSearchParams()
  // 리포트(I05)가 맡겨 둔 "처음 진입한 화면"을 "주간 리포트로 돌아가기"에 되돌려 준다.
  const back = useBackNavigation('/ai/weekly-report')
  const offset = clampWeekOffset(params.get('offset'))
  const report = useWeeklyReport(user?.id ?? null, today, offset)
  const calc = useCalcSteps()
  const { exercise, meal } = report

  // 두 기록을 모두 읽었고 연출이 끝났을 때만 점수를 낸다. 읽지 못했거나 저장소가 없으면 점수를 만들지 않는다(0점으로 대신하지 않는다).
  const blocked =
    exercise.status === 'error' ||
    exercise.status === 'unavailable' ||
    meal.status === 'error' ||
    meal.status === 'unavailable'
  const phase: ScorePhase = blocked
    ? { kind: 'error' }
    : calc.done && exercise.status === 'ready' && meal.status === 'ready'
      ? {
          kind: 'result',
          score: computeWeeklyScore(
            exercise.current.count,
            meal.current.slotCount,
          ),
          exercise: exercise.current,
          meal: meal.current,
        }
      : { kind: 'calculating', step: calc.step }

  return (
    <WeeklyScoreView
      range={report.range}
      today={today}
      phase={phase}
      exercise={exercise}
      meal={meal}
      onRetryExercise={report.reloadExercise}
      onRetryMeal={report.reloadMeal}
      reportTo={weeklyReportPath(report.range.offset)}
      reportState={back?.state}
    />
  )
}

/**
 * I05-1 주간 기록 점수(`/ai/weekly-report/score`, 회원 전용). 주는 `?offset=`으로 받는다. 계정이나 주(offset)가 바뀌면 다시 마운트되어
 * 계산 연출부터 새로 시작하고, 화면을 떠나면 타이머가 정리된다.
 */
export default function WeeklyScorePage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  return (
    <ScoreBody
      key={`${user?.id ?? ''}#${clampWeekOffset(params.get('offset'))}`}
    />
  )
}
