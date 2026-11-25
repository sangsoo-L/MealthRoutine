import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import RoutineDetailView, {
  RoutineStateNotice,
  type RoutineDeletePanel,
  type RoutineStartPanel,
} from '../components/routine/RoutineDetailView.tsx'
import { useExerciseCatalog } from '../exercise/useExerciseCatalog.ts'
import { useRoutine } from '../exercise/useRoutines.ts'
import { PATH_ROUTINES, routineDetailPath } from '../exercise/routinePaths.ts'
import { validateDraft } from '../exercise/workoutDraftModel.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'
import {
  routineToDraft,
  type WorkoutRoutine,
} from '../exercise/workoutRoutineModel.ts'
import { createWorkoutRoutineRepository } from '../exercise/workoutSource.ts'

/** 루틴으로 운동을 준비하면 도착하는 W02(운동 목록 구성). */
const PATH_COMPOSE = '/records/exercise/compose'

function RoutineDetailBody({ routineId }: { routineId: string }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { state, reload } = useRoutine(user?.id ?? null, routineId)
  const draftCtx = useWorkoutDraft()
  const catalog = useExerciseCatalog()
  const [startPanel, setStartPanel] = useState<RoutineStartPanel>('none')
  const [startError, setStartError] = useState<string | null>(null)
  const [deletePanel, setDeletePanel] = useState<RoutineDeletePanel>('none')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  // 삭제 요청이 진행 중일 때 연타를 무시한다(state 갱신 전에도 막는다).
  const deletingRef = useRef(false)

  const routine = state.status === 'ready' ? state.routine : null

  // 부위 요약: 운동 목록에서 찾은 값만 쓴다(운동 목록을 읽지 못하면 부위 줄을 그리지 않는다).
  const bodyParts = useMemo<readonly string[] | null>(() => {
    if (!routine || catalog.state.status !== 'ready') return null
    const byId = new Map(catalog.state.exercises.map((e) => [e.id, e]))
    const parts: string[] = []
    for (const item of routine.items) {
      for (const part of byId.get(item.exerciseId)?.targetMuscles ?? []) {
        if (!parts.includes(part)) parts.push(part)
      }
    }
    return parts
  }, [routine, catalog.state])

  if (!routine) {
    return (
      <RoutineStateNotice
        state={state as Exclude<typeof state, { status: 'ready' }>}
        onRetry={reload}
      />
    )
  }

  /**
   * 루틴을 오늘의 운동 구성(W02 초안)으로 복사해 W02로 간다. 루틴은 바꾸지 않는다.
   * 서버 상한(횟수 999, 중량 999kg·소수 둘째 자리)은 여기서 보지 않는다. 그 규칙 전에 저장한 루틴도 옮겨지고 W02가 저장 전에 안내한다.
   */
  function applyToDraft(target: WorkoutRoutine) {
    const draft = routineToDraft(target)
    if (
      !validateDraft(draft, undefined, undefined, { serverLimits: false }).ok ||
      !draftCtx.replaceDraft(draft)
    ) {
      setStartError('이 루틴으로 운동을 준비하지 못했어요. 다시 시도해 주세요.')
      return
    }
    void navigate(PATH_COMPOSE, {
      state: { from: routineDetailPath(target.id) },
    })
  }

  function handleStart() {
    setStartError(null)
    if (draftCtx.status !== 'ready') {
      setStartError('로그인 후 운동을 준비할 수 있어요.')
      return
    }
    // 구성 중인 초안이 있으면 임의로 덮어쓰지 않고 먼저 교체할지 묻는다.
    if (draftCtx.hasContent) {
      setStartPanel('replace')
      return
    }
    applyToDraft(routine as WorkoutRoutine)
  }

  async function handleDelete() {
    if (!user || !routine || deletingRef.current) return
    const repository = createWorkoutRoutineRepository(user.id)
    if (!repository) {
      setDeleteError('루틴 저장 기능을 준비 중이라 삭제할 수 없어요.')
      return
    }
    deletingRef.current = true
    setDeleting(true)
    setDeleteError(null)
    try {
      await repository.delete(routine.id, {
        expectedRevision: routine.revision,
      })
      void navigate(PATH_ROUTINES, { replace: true })
    } catch (error) {
      deletingRef.current = false
      setDeleting(false)
      if (isWorkoutStoreError(error) && error.reason === 'notFound') {
        // 이미 없는 루틴(다른 곳에서 삭제)이다. 목록으로 돌아간다.
        void navigate(PATH_ROUTINES, { replace: true })
        return
      }
      if (isWorkoutStoreError(error) && error.code === 'revisionMismatch') {
        setDeleteError(
          '다른 곳에서 이 루틴이 바뀌어 삭제하지 않았어요. 최신 내용을 확인한 뒤 다시 삭제해 주세요.',
        )
        reload()
        return
      }
      setDeleteError('루틴을 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  return (
    <RoutineDetailView
      routine={routine}
      bodyParts={bodyParts}
      startPanel={startPanel}
      startError={startError}
      onStart={handleStart}
      onConfirmReplace={() => {
        setStartPanel('none')
        applyToDraft(routine)
      }}
      onCancelReplace={() => setStartPanel('none')}
      deletePanel={deletePanel}
      deleting={deleting}
      deleteError={deleteError}
      onOpenDelete={() => {
        setDeleteError(null)
        setDeletePanel('confirm')
      }}
      onConfirmDelete={() => void handleDelete()}
      onCancelDelete={() => {
        setDeleteError(null)
        setDeletePanel('none')
      }}
    />
  )
}

/**
 * W07 운동 루틴 상세(`/records/exercise/routines/:routineId`, 회원 전용). 없는 루틴과 다른 계정의 루틴은 같은 "찾을 수 없어요" 안내다.
 * 계정·루틴이 바뀌면 key로 본체를 다시 만들어 이전 화면 상태(확인 패널 등)가 남지 않게 한다.
 */
export default function RoutineDetailPage() {
  const { user } = useAuth()
  const { routineId = '' } = useParams()
  return (
    <RoutineDetailBody
      key={`${user?.id ?? ''}|${routineId}`}
      routineId={routineId}
    />
  )
}
