import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import { composeSecondaryButton } from '../components/exercise/compose/composeStyles.ts'
import { dashboardFocusRing } from '../components/exercise/dashboard/DashboardParts.tsx'
import TodayExerciseSection from '../components/exercise/dashboard/TodayExerciseSection.tsx'
import { ActiveSessionCard } from '../components/exercise/dashboard/WorkoutStartParts.tsx'
import CompletedRecordsSection from '../components/exercise/my/CompletedRecordsSection.tsx'
import TomorrowPlanSection, {
  PATH_PLAN_COMPOSE,
} from '../components/exercise/my/TomorrowPlanSection.tsx'
import Icon from '../components/icons/Icon.tsx'
import {
  PATH_MY_EXERCISE,
  PATH_PREVIOUS_LISTS,
  myNavLinks,
} from '../exercise/myExercise.ts'
import { useCompletedRecords } from '../exercise/useCompletedRecords.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { useTodayWorkoutList } from '../exercise/useTodayWorkoutList.ts'
import { resultPathFor } from '../exercise/useWorkoutResult.ts'
import { useWorkoutStart } from '../exercise/useWorkoutStart.ts'
import {
  useDayWorkoutDraft,
  useWorkoutDraft,
} from '../exercise/workoutDraftContext.ts'
import { planToDraft, type WorkoutPlan } from '../exercise/workoutPlanModel.ts'
import { createWorkoutPlanRepository } from '../exercise/workoutPlanSource.ts'
import { useWorkoutPlans } from '../exercise/useWorkoutPlans.ts'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'

const PATH_NEW_LIST = '/records/exercise/new'

const headerDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
})

/** W11이 내일 계획을 저장한 뒤 이 화면으로 넘기는 안내(저장함·바꿔 저장함·같은 구성). 올바른 값일 때만 쓴다. */
const PLAN_NOTICE = {
  saved: '내일 운동 계획을 저장했어요.',
  replaced: '내일 운동 계획을 바꿔서 저장했어요.',
  same: '같은 구성의 내일 운동 계획이 이미 저장되어 있어요.',
} as const

function readPlanNotice(state: unknown): keyof typeof PLAN_NOTICE | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>).planSaved
  return value === 'saved' || value === 'replaced' || value === 'same'
    ? value
    : null
}

function planErrorText(error: unknown): string {
  if (isWorkoutStoreError(error)) {
    if (error.code === 'revisionMismatch') {
      return '다른 곳에서 이 계획이 바뀌어 삭제하지 않았어요. 화면을 새로 열어 다시 시도해 주세요.'
    }
    if (error.reason === 'unavailable') {
      return '이 환경에서는 내일 계획을 삭제할 수 없어요.'
    }
  }
  return '내일 계획을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

function MyBody() {
  const today = useLocalToday()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const navigate = useNavigate()
  const location = useLocation()
  const { draft, hasContent } = useWorkoutDraft()
  // 내일 계획: 오늘 초안과 별개의 내일 초안·계획 전용 저장소를 쓴다(오늘의 운동·기록과 섞이지 않는다).
  const tomorrowDraft = useDayWorkoutDraft('tomorrow')
  const plans = useWorkoutPlans(userId, today)
  const planRepository = useMemo(
    () => (userId ? createWorkoutPlanRepository(userId) : null),
    [userId],
  )
  const [planNotice, setPlanNotice] = useState<string | null>(null)
  const [editConfirmPlanId, setEditConfirmPlanId] = useState<string | null>(
    null,
  )
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const deletingRef = useRef(false)
  // W11에서 저장하고 돌아온 안내. 새로고침·뒤로가기로 다시 나타나지 않도록 읽은 뒤 history state를 비운다(같은 경로라 화면 전환·재마운트는 없다).
  const [savedNotice] = useState(() => readPlanNotice(location.state))
  useEffect(() => {
    if (savedNotice)
      void navigate(`${location.pathname}${location.search}`, {
        replace: true,
        state: null,
      })
  }, [savedNotice, navigate, location.pathname, location.search])

  function startEdit(plan: WorkoutPlan) {
    // 계획을 내일 초안으로 옮기고 W02(day=tomorrow)로 간다. 저장할 때 W11이 이 계획의 revision으로 충돌을 확인한다.
    if (!tomorrowDraft.replaceDraft(planToDraft(plan))) {
      setPlanNotice(
        '계획을 수정 모드로 열지 못했어요. 잠시 후 다시 시도해 주세요.',
      )
      return
    }
    void navigate(PATH_PLAN_COMPOSE, { state: { from: PATH_MY_EXERCISE } })
  }
  function askEdit(plan: WorkoutPlan) {
    setPlanNotice(null)
    setDeleteTargetId(null)
    // 같은 계획을 이미 고치는 중이면 그대로 이어 간다. 다른 구성이 남아 있으면 버려도 되는지 먼저 확인한다.
    if (
      tomorrowDraft.hasContent &&
      tomorrowDraft.draft.editingPlanId !== plan.id
    ) {
      setEditConfirmPlanId(plan.id)
      return
    }
    if (tomorrowDraft.draft.editingPlanId === plan.id) {
      void navigate(PATH_PLAN_COMPOSE, { state: { from: PATH_MY_EXERCISE } })
      return
    }
    startEdit(plan)
  }
  async function confirmDelete(plan: WorkoutPlan) {
    if (!planRepository || deletingRef.current) return
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await planRepository.delete(plan.id, { expectedRevision: plan.revision })
      setPlanNotice('내일 운동 계획을 삭제했어요.')
      setDeleteTargetId(null)
      plans.reload()
    } catch (error) {
      if (isWorkoutStoreError(error) && error.reason === 'notFound') {
        // 이미 지워진 계획이다. 목록만 새로 읽는다.
        setPlanNotice('이 계획은 이미 삭제되어 있어요.')
        setDeleteTargetId(null)
        plans.reload()
      } else {
        setDeleteError(planErrorText(error))
      }
    } finally {
      deletingRef.current = false
      setDeleting(false)
    }
  }
  const todayList = useTodayWorkoutList(user?.id ?? null, today, true)
  const records = useCompletedRecords(user?.id ?? null, today)

  // 오늘 대표 목록(같은 날짜에 여러 목록이 있으면 가장 최근 저장본 하나, W01과 같은 조회)으로만 운동을 시작한다.
  const slot = todayList.slot
  const list =
    slot.status === 'ready' &&
    slot.data.phase === 'planned' &&
    slot.data.listId &&
    slot.data.plannedDate
      ? {
          id: slot.data.listId,
          plannedDate: slot.data.plannedDate,
          startBlocked: slot.data.startBlocked === true,
        }
      : null
  const doneSessionId = list
    ? records.doneSessionByList.get(list.id)
    : undefined
  const recordPath = doneSessionId ? resultPathFor(doneSessionId) : null
  // 시작·이어하기로 W14에 들어가면 W14의 "이전"이 W10으로 돌아오도록 이 화면의 경로를 알린다(W01은 알리지 않아 기존 동작 그대로).
  const start = useWorkoutStart(
    user?.id ?? null,
    today,
    list,
    true,
    PATH_MY_EXERCISE,
  )

  const reloadToday = todayList.reload
  const reloadRecords = records.reload
  const navLinks = myNavLinks(slot, hasContent ? draft.items.length : 0)
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <header>
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            나의 운동
          </h1>
          <time
            dateTime={today}
            className="text-support font-normal text-muted"
          >
            {headerDate.format(new Date(`${today}T12:00:00`))}
          </time>
        </div>
        <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
          오늘의 운동과 완료한 기록을 한곳에서 확인해요.
        </p>
      </header>
      <ActiveSessionCard controls={start} />
      <TodayExerciseSection
        slot={slot}
        draftCount={hasContent ? draft.items.length : 0}
        onRetry={reloadToday}
        start={start}
        recordPath={recordPath}
        recordFrom={PATH_MY_EXERCISE}
      />
      <CompletedRecordsSection
        slot={records.slot}
        fromPath={PATH_MY_EXERCISE}
        onRetry={reloadRecords}
      />
      <TomorrowPlanSection
        state={plans.state}
        today={today}
        notice={planNotice ?? (savedNotice ? PLAN_NOTICE[savedNotice] : null)}
        editConfirmPlanId={editConfirmPlanId}
        deleteTargetId={deleteTargetId}
        deleting={deleting}
        deleteError={deleteError}
        onRetry={plans.reload}
        onEdit={askEdit}
        onConfirmEdit={(plan) => {
          setEditConfirmPlanId(null)
          startEdit(plan)
        }}
        onCancelEdit={() => setEditConfirmPlanId(null)}
        onAskDelete={(plan) => {
          setPlanNotice(null)
          setEditConfirmPlanId(null)
          setDeleteError(null)
          setDeleteTargetId(plan.id)
        }}
        onConfirmDelete={(plan) => void confirmDelete(plan)}
        onCancelDelete={() => {
          setDeleteTargetId(null)
          setDeleteError(null)
        }}
      />
      {navLinks.create || navLinks.previous ? (
        <nav aria-label="운동 목록 이동" className="flex flex-col gap-3">
          {navLinks.create ? (
            <Link
              to={PATH_NEW_LIST}
              className={`w-full gap-2 ${composeSecondaryButton}`}
            >
              새 운동 목록 만들기
            </Link>
          ) : null}
          {navLinks.previous ? (
            <Link
              to={PATH_PREVIOUS_LISTS}
              className={`flex min-h-11 items-center justify-between gap-3 rounded-card border border-line bg-surface p-4 hover:border-exercise/40 ${dashboardFocusRing}`}
            >
              <span className="min-w-0">
                <span className="block text-body leading-snug font-semibold text-content">
                  이전 운동 리스트 보기
                </span>
                <span className="mt-0.5 block text-support leading-snug font-normal break-keep text-muted">
                  지난 날짜에 구성한 운동을 확인해요.
                </span>
              </span>
              <Icon name="chevron-right" size={20} />
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  )
}

/** W10 나의 운동: 오늘의 운동 상태와 완료한 운동 기록, 내일 계획(조회·수정·삭제), 이전 운동 리스트·새 목록 만들기 이동. 회원 전용(라우트의 AuthGate). */
export default function ExerciseMyPage() {
  const { user } = useAuth()
  return <MyBody key={user?.id ?? ''} />
}
