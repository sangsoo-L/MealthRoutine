import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import ExerciseStatsView from '../components/stats/ExerciseStatsView.tsx'
import {
  clampOffset,
  computeStats,
  statsRange,
  type StatsPeriod,
} from '../exercise/exerciseStats.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { useRecordsInRange } from '../exercise/useRecordsInRange.ts'

function StatsBody() {
  const { user } = useAuth()
  const today = useLocalToday()
  const [params, setParams] = useSearchParams()
  const period: StatsPeriod =
    params.get('period') === 'month' ? 'month' : 'week'
  const range = useMemo(
    () =>
      statsRange(
        period,
        clampOffset(period, Number(params.get('offset') ?? 0)),
        today,
      ),
    [period, params, today],
  )
  const { state, reload } = useRecordsInRange(
    user?.id ?? null,
    range.from,
    range.to,
  )
  const stats = useMemo(
    () =>
      state.status === 'ready'
        ? computeStats(state.records, range, user?.id)
        : null,
    [state, range, user?.id],
  )

  /** 기간 단위·오프셋은 주소에 보관한다(같은 경로 안의 이동이라 화면이 다시 마운트되지 않고, 새로고침해도 유지된다). */
  function update(nextPeriod: StatsPeriod, nextOffset: number) {
    const next: Record<string, string> = {}
    if (nextPeriod === 'month') next.period = 'month'
    if (nextOffset !== 0) next.offset = String(nextOffset)
    setParams(next, { replace: true })
  }

  return (
    <ExerciseStatsView
      period={period}
      offset={range.offset}
      label={range.label}
      sub={range.sub}
      state={state.status}
      stats={stats}
      skippedCount={state.status === 'ready' ? state.skippedCount : 0}
      onPeriodChange={(next) => update(next, 0)}
      onOffsetChange={(next) => update(period, next)}
      onRetry={reload}
    />
  )
}

/**
 * 운동 기록 통계(`/records/exercise/stats`, 화면 ID 미정, 회원 전용: 라우트의 AuthGate). 화면명세 v5.0에 없는 신규 화면이며 사용자 승인으로 만들었다.
 * 저장된 완료 기록(workoutRecords)만 읽어 주간·월간 통계를 계산한다(exercise/exerciseStats.ts). I05 주간 리포트와 연결하지 않는다.
 * 계정이 바뀌면 key로 본체를 다시 만들어 이전 계정의 통계가 남지 않게 한다.
 */
export default function ExerciseStatsPage() {
  const { user } = useAuth()
  return <StatsBody key={user?.id ?? ''} />
}
