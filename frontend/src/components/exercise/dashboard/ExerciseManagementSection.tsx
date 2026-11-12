import type { ExerciseDashboardSlots } from '../../../exercise/exerciseDashboardTypes.ts'
import { DashboardSection, dashboardSectionTitle } from './DashboardParts.tsx'
import ExerciseGoalBanner from './ExerciseGoalBanner.tsx'
import ExerciseStatistics from './ExerciseStatistics.tsx'
import NextExerciseSection from './NextExerciseSection.tsx'
import WorkoutRoutineCard from './WorkoutRoutineCard.tsx'

export default function ExerciseManagementSection({
  slots,
  onRetry,
}: {
  slots: ExerciseDashboardSlots
  onRetry: () => void
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
        <ExerciseGoalBanner slot={slots.goal} onRetry={onRetry} />
        <WorkoutRoutineCard slot={slots.routines} onRetry={onRetry} />
        <ExerciseStatistics slot={slots.statistics} onRetry={onRetry} />
        <NextExerciseSection slot={slots.next} onRetry={onRetry} />
      </div>
    </DashboardSection>
  )
}
