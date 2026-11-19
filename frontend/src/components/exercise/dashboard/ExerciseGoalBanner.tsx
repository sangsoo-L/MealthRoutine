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

/**
 * 목표 설정 진입과 체중 수치가 없는 저장 요약만 연결한다. 다른 대시보드 영역은 변경하지 않는다.
 * `to`(W01-1 경로)가 없으면(개발용 예시 `?sample=`) 실제 목표 설정 화면으로 보내지 않고 링크를 그리지 않는다.
 */
export default function ExerciseGoalBanner({
  slot,
  onRetry,
  to,
}: {
  slot: DashboardSlot<ExerciseGoalView>
  onRetry: () => void
  to?: string
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
  // 오류(다시 시도 버튼이 있는 상태)가 아니면 목적지가 W01-1 하나뿐이라 행 전체를 링크로 둔다(링크 안에 버튼을 넣지 않는다).
  // 불러오는 중에는 목표가 있는지 모르므로 "목표 설정"·"목표 변경"을 단정하지 않고 링크로 만들지 않는다.
  if (current.status !== 'error') {
    const rowTo = current.status === 'loading' ? undefined : to
    return (
      <ManagementRow
        title="운동 목표"
        titleId="dashboard-goal-title"
        icon="dumbbell"
        to={rowTo}
        linkLabel={
          rowTo
            ? current.status === 'ready'
              ? '목표 변경'
              : '목표 설정'
            : undefined
        }
      >
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
      </ManagementRow>
    )
  }
  return (
    <ManagementRow
      title="운동 목표"
      titleId="dashboard-goal-title"
      icon="dumbbell"
      trailing={
        to ? (
          <Link
            to={to}
            className={`inline-flex min-h-11 items-center justify-center rounded-control px-2 text-support font-semibold text-exercise hover:bg-exercise-soft ${dashboardFocusRing}`}
          >
            목표 설정
          </Link>
        ) : null
      }
    >
      <SlotError
        title="운동 목표를 불러오지 못했어요"
        onRetry={slot.status === 'error' ? onRetry : summary.retry}
      />
    </ManagementRow>
  )
}
