import { useEffect, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import BeginnerPlanEntry from '../components/exercise/dashboard/BeginnerPlanEntry.tsx'
import ExerciseManagementSection from '../components/exercise/dashboard/ExerciseManagementSection.tsx'
import ExerciseMealSwitch from '../components/exercise/dashboard/ExerciseMealSwitch.tsx'
import RecentRecordsSection from '../components/exercise/dashboard/RecentRecordsSection.tsx'
import TodayExerciseSection from '../components/exercise/dashboard/TodayExerciseSection.tsx'
import { ActiveSessionCard } from '../components/exercise/dashboard/WorkoutStartParts.tsx'
import WeeklyExerciseSection from '../components/exercise/dashboard/WeeklyExerciseSection.tsx'
import RecordsDashboardHeader from '../components/records/RecordsDashboardHeader.tsx'
import { weeklyReportPath } from '../ai/aiPaths.ts'
import type {
  DashboardSlot,
  WorkoutRoutineView,
} from '../exercise/exerciseDashboardTypes.ts'
import { PATH_EXERCISE_STATS, PATH_ROUTINES } from '../exercise/routinePaths.ts'
import { useExerciseDashboard } from '../exercise/useExerciseDashboard.ts'
import { useRoutines, type RoutinesState } from '../exercise/useRoutines.ts'
import { useWorkoutPlans } from '../exercise/useWorkoutPlans.ts'
import { resultPathFor } from '../exercise/useWorkoutResult.ts'
import { useWorkoutStart } from '../exercise/useWorkoutStart.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'

/** W11에서 저장하고 돌아왔을 때의 안내(history state). 그 밖의 값은 무시한다. */
function readSavedNotice(state: unknown): 'saved' | 'same' | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>).workoutSaved
  return value === 'saved' || value === 'same' ? value : null
}

const SAVED_NOTICE = {
  saved: '오늘의 운동 목록을 저장했어요.',
  same: '같은 구성의 목록이 이미 오늘의 운동으로 저장돼 있어요.',
} as const

/** 저장된 루틴 조회 상태를 W01 영역 상태로 바꾼다(루틴이 없으면 empty, 있으면 개수). */
function routinesSlotFrom(
  state: RoutinesState,
): DashboardSlot<WorkoutRoutineView> {
  if (state.status === 'ready') {
    return state.items.length === 0
      ? { status: 'empty' }
      : { status: 'ready', data: { count: state.items.length } }
  }
  return { status: state.status }
}

function DashboardBody() {
  const { slots, sampleNotice, reload, today, doneSessionByList } =
    useExerciseDashboard()
  const { draft, hasContent } = useWorkoutDraft()
  const { user } = useAuth()
  // 운동 시작·이어하기: 저장된 오늘 목록이 있을 때만 시작할 수 있다. 개발용 예시(?sample=)에서는 조회하지 않는다.
  const list =
    slots.today.status === 'ready' &&
    slots.today.data.phase === 'planned' &&
    slots.today.data.listId &&
    slots.today.data.plannedDate
      ? {
          id: slots.today.data.listId,
          plannedDate: slots.today.data.plannedDate,
          startBlocked: slots.today.data.startBlocked === true,
        }
      : null
  // 오늘 마친 목록의 완료 기록 상세(W15 읽기 전용). 지금 보여 주는 목록과 같은 목록의 저장된 기록이 있을 때만 값이 있다.
  const doneSessionId = list ? doneSessionByList.get(list.id) : undefined
  const recordPath = doneSessionId ? resultPathFor(doneSessionId) : null
  const start = useWorkoutStart(
    user?.id ?? null,
    today,
    list,
    sampleNotice === null,
  )
  // 저장된 루틴은 개발용 예시(?sample=)가 아닐 때만 읽는다(예시와 실제 값을 섞지 않는다).
  const usingSample = sampleNotice !== null
  const routines = useRoutines(usingSample ? null : (user?.id ?? null))
  const routinesSlot: DashboardSlot<WorkoutRoutineView> = usingSample
    ? slots.routines
    : routinesSlotFrom(routines.state)
  const reloadRoutines = routines.reload
  // 내일 운동 계획(계획 전용 저장소)은 개발용 예시(?sample=)가 아닐 때만 읽는다. 오늘의 운동·완료 기록과 섞지 않는다.
  const plans = useWorkoutPlans(usingSample ? null : (user?.id ?? null), today)
  const location = useLocation()
  const navigate = useNavigate()
  // 새로고침·뒤로가기로 안내가 다시 나타나지 않도록 읽은 뒤 history state를 비운다(같은 경로라 화면 전환·재마운트는 없다).
  const [savedNotice] = useState(() => readSavedNotice(location.state))
  useEffect(() => {
    if (savedNotice)
      void navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      })
  }, [savedNotice, navigate, location.pathname, location.search])
  const sharedUnavailable =
    slots.weekly.status === 'unavailable' &&
    slots.recent.status === 'unavailable'
  return (
    // 다른 화면과 같은 앱 폭(390px)과 한 열 배치를 쓴다. 오늘 상태·주요 행동 뒤에 요약·기록·관리를 둔다.
    <div className="flex min-w-0 flex-col gap-6">
      <RecordsDashboardHeader title="운동 기록" today={today}>
        <ExerciseMealSwitch />
      </RecordsDashboardHeader>
      {/* 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역(비어 있으면 자리를 차지하지 않는다) */}
      <div aria-live="polite" className="empty:hidden">
        {savedNotice ? (
          <p className="rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-semibold text-exercise">
            {SAVED_NOTICE[savedNotice]}
          </p>
        ) : null}
      </div>
      {sampleNotice ? (
        <p
          role="note"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          {sampleNotice}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-col gap-6">
        {/* 오늘 상태와 주요 행동: 진행 중인 운동(있으면 이어하기가 주요 행동) → 오늘의 운동 → 초급 추천(보조, 접힘) */}
        <div className="flex min-w-0 flex-col gap-6">
          <ActiveSessionCard controls={start} />
          <TodayExerciseSection
            slot={slots.today}
            draftCount={hasContent ? draft.items.length : 0}
            onRetry={reload}
            start={start}
            recordPath={recordPath}
            activeCardAbove
          />
          <BeginnerPlanEntry />
        </div>
        {/* 요약·기록·관리 */}
        <div className="flex min-w-0 flex-col gap-6">
          <WeeklyExerciseSection
            slot={slots.weekly}
            today={today}
            sharedUnavailable={sharedUnavailable}
            onRetry={reload}
            reportTo={usingSample ? undefined : weeklyReportPath()}
          />
          <RecentRecordsSection
            slot={slots.recent}
            sharedUnavailable={sharedUnavailable}
            onRetry={reload}
            showAllLink={sampleNotice === null}
          />
          <ExerciseManagementSection
            slots={{ ...slots, routines: routinesSlot }}
            onRetry={() => {
              reload()
              reloadRoutines()
              plans.reload()
            }}
            plan={
              usingSample
                ? undefined
                : { state: plans.state, today, onRetry: plans.reload }
            }
            routinesTo={
              !usingSample && routinesSlot.status !== 'unavailable'
                ? PATH_ROUTINES
                : undefined
            }
            // 개발용 예시에서는 실제 목표 설정(저장 흐름)으로 보내지 않는다(루틴·통계와 같은 기준).
            goalTo={usingSample ? undefined : '/records/exercise/goal'}
            reportTo={usingSample ? undefined : weeklyReportPath()}
            statisticsTo={
              !usingSample && slots.recent.status !== 'unavailable'
                ? PATH_EXERCISE_STATS
                : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}

/**
 * W01: 오늘 상태와 주요 행동(진행 중인 운동 → 오늘의 운동)을 먼저 보여 주고, 그 아래에 초급 추천(보조)·주간 현황·최근 기록·운동 관리를 둔다.
 * 실제 값과 개발용 예시를 구분한다.
 */
export default function ExerciseDashboardPage() {
  const { user } = useAuth()
  return <DashboardBody key={user?.id ?? ''} />
}
