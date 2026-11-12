import { Link } from 'react-router'
import { useAuth } from '../../../auth/authContext.ts'
import { useExerciseGoalSummary } from '../../../exercise-goal/useExerciseGoal.ts'
import type {
  DashboardSlot,
  ExerciseGoalView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import {
  ManagementRow,
  SlotError,
  dashboardFocusRing,
} from './DashboardParts.tsx'

/** 목표 설정 진입과 체중 수치가 없는 저장 요약만 연결한다. 다른 대시보드 영역은 변경하지 않는다. */
export default function ExerciseGoalBanner({
  slot,
  onRetry,
}: {
  slot: DashboardSlot<ExerciseGoalView>
  onRetry: () => void
}) {
  const { user } = useAuth()
  const summary = useExerciseGoalSummary(user?.id ?? null)
  const current: DashboardSlot<ExerciseGoalView> =
    slot.status !== 'unavailable'
      ? slot
      : !summary.available
        ? { status: 'unavailable' }
        : !summary.loaded
          ? { status: 'loading' }
          : summary.loaded.failed
            ? { status: 'error' }
            : summary.loaded.value
              ? {
                  status: 'ready',
                  data: {
                    summary: `주 ${summary.loaded.value.daysPerWeek}회 · 1회 ${summary.loaded.value.minutesPerSession}분`,
                  },
                }
              : { status: 'empty' }
  return (
    <ManagementRow
      title="운동 목표"
      titleId="dashboard-goal-title"
      icon="dumbbell"
      trailing={
        <Link
          to="/records/exercise/goal"
          className={`inline-flex min-h-11 items-center justify-center rounded-control px-2 text-support font-semibold text-exercise hover:bg-exercise-soft ${dashboardFocusRing}`}
        >
          {current.status === 'ready' ? '목표 변경' : '목표 설정'}
        </Link>
      }
    >
      {current.status === 'error' ? (
        <SlotError
          title="운동 목표를 불러오지 못했어요"
          onRetry={slot.status === 'error' ? onRetry : summary.retry}
        />
      ) : (
        <p
          className="mt-1 text-support leading-relaxed font-normal break-keep text-muted"
          role={current.status === 'loading' ? 'status' : undefined}
        >
          {current.status === 'ready'
            ? current.data.summary
            : current.status === 'loading'
              ? '목표를 불러오는 중이에요…'
              : current.status === 'empty'
                ? '건강 목표와 운동 이해도에 맞게 설정해요.'
                : '목표 저장 기능을 연결할 수 없어요.'}
        </p>
      )}
    </ManagementRow>
  )
}
