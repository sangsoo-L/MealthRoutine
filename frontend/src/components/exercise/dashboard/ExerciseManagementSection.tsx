import type { ExerciseDashboardSlots } from '../../../exercise/exerciseDashboardTypes.ts'
import { DashboardSection, dashboardSectionTitle } from './DashboardParts.tsx'
import ExerciseGoalBanner from './ExerciseGoalBanner.tsx'
import ExerciseStatistics from './ExerciseStatistics.tsx'
import NextExerciseSection, {
  type NextPlanInfo,
} from './NextExerciseSection.tsx'
import WorkoutRoutineCard from './WorkoutRoutineCard.tsx'

export default function ExerciseManagementSection({
  slots,
  onRetry,
  routinesTo,
  statisticsTo,
  goalTo,
  plan,
  reportTo,
}: {
  slots: ExerciseDashboardSlots
  onRetry: () => void
  /** 내 운동 루틴(W06)으로 가는 경로. 없으면 링크를 그리지 않는다(개발용 예시·저장소 없음). */
  routinesTo?: string
  /** 운동 기록 통계로 가는 경로. 없으면 링크를 그리지 않고 준비 중으로 둔다. */
  statisticsTo?: string
  /** 운동 목표 설정(W01-1)으로 가는 경로. 없으면(개발용 예시) 목표 행에 링크를 그리지 않는다. */
  goalTo?: string
  /** 내일 운동 계획 조회 값. 없으면(개발용 예시 등) 내일 운동 계획은 준비 중으로 둔다. */
  plan?: NextPlanInfo
  /** 주간 리포트(I05) 경로. 없으면(개발용 예시) 주간 리포트는 준비 중으로 둔다. */
  reportTo?: string
}) {
  return (
    <DashboardSection labelId="dashboard-management-title">
      <h2
        id="dashboard-management-title"
        className={`mb-3 ${dashboardSectionTitle}`}
      >
        운동 관리
      </h2>
      <div className="divide-y divide-line rounded-card border border-line bg-surface">
        <ExerciseGoalBanner slot={slots.goal} onRetry={onRetry} to={goalTo} />
        <WorkoutRoutineCard
          slot={slots.routines}
          onRetry={onRetry}
          to={routinesTo}
        />
        <ExerciseStatistics
          slot={slots.statistics}
          onRetry={onRetry}
          to={statisticsTo}
        />
        <NextExerciseSection
          slot={slots.next}
          onRetry={onRetry}
          plan={plan}
          reportTo={reportTo}
        />
      </div>
    </DashboardSection>
  )
}
