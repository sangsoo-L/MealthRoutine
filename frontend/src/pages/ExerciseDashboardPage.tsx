import { useAuth } from '../auth/authContext.ts'
import ExerciseManagementSection from '../components/exercise/dashboard/ExerciseManagementSection.tsx'
import ExerciseMealSwitch from '../components/exercise/dashboard/ExerciseMealSwitch.tsx'
import RecentRecordsSection from '../components/exercise/dashboard/RecentRecordsSection.tsx'
import TodayExerciseSection from '../components/exercise/dashboard/TodayExerciseSection.tsx'
import WeeklyExerciseSection from '../components/exercise/dashboard/WeeklyExerciseSection.tsx'
import { useExerciseDashboard } from '../exercise/useExerciseDashboard.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'

const headerDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

function DashboardBody() {
  const { slots, sampleNotice, reload, today } = useExerciseDashboard()
  const { draft, hasContent } = useWorkoutDraft()
  const sharedUnavailable =
    slots.weekly.status === 'unavailable' &&
    slots.recent.status === 'unavailable'
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <header>
        <ExerciseMealSwitch />
        <div className="mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            운동 기록
          </h1>
          <time
            dateTime={today}
            className="text-support font-normal text-muted"
          >
            {headerDate.format(new Date(`${today}T12:00:00`))}
          </time>
        </div>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          나의 운동을 한눈에 확인해요.
        </p>
      </header>
      {sampleNotice ? (
        <p
          role="note"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          {sampleNotice}
        </p>
      ) : null}
      <WeeklyExerciseSection
        slot={slots.weekly}
        today={today}
        sharedUnavailable={sharedUnavailable}
        onRetry={reload}
      />
      <RecentRecordsSection
        slot={slots.recent}
        sharedUnavailable={sharedUnavailable}
        onRetry={reload}
      />
      <TodayExerciseSection
        slot={slots.today}
        draftCount={hasContent ? draft.items.length : 0}
        onRetry={reload}
      />
      <ExerciseManagementSection slots={slots} onRetry={reload} />
    </div>
  )
}

/** W01: 기록 현황을 먼저 보여 주는 모바일 대시보드. 실제 값과 개발용 예시를 구분한다. */
export default function ExerciseDashboardPage() {
  const { user } = useAuth()
  return <DashboardBody key={user?.id ?? ''} />
}
