import { useCallback, useEffect, useRef, useState } from 'react'
import {
  useBlocker,
  useNavigate,
  useSearchParams,
  type BlockerFunction,
} from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import ResultView, {
  PATH_DASHBOARD,
} from '../components/exercise/result/ResultView.tsx'
import type {
  ResultActions,
  ResultEditorState,
  ResultPanel,
} from '../components/exercise/result/resultTypes.ts'
import { useRecordUploadStatus } from '../exercise/useRecordUploadStatus.ts'
import { PATH_SESSION } from '../exercise/useWorkoutStart.ts'
import { hasLeaveRisk, useWorkoutResult } from '../exercise/useWorkoutResult.ts'
import {
  secondsInputOf,
  validateSetFields,
} from '../exercise/workoutResultView.ts'

/**
 * W15·W15-1 운동 결과 확인·수정·최종 저장. 회원 전용이며 비회원은 라우트의 AuthGate가 안내한다.
 * 저장·복구는 useWorkoutResult(컨트롤러)가, 표시는 ResultView가 맡고 이 컴포넌트는 둘을 잇는다.
 *
 * - URL의 session으로 그 세션만 조회한다. 없거나 다른 계정의 세션이면 안내만 하고 다른 진행 중 세션으로 바꾸지 않는다.
 * - 수정은 화면의 초안에만 적용된다. 저장하기를 눌러야 saveProgress → complete 순서로 저장소에 반영된다.
 * - 저장이 확인(saved)되기 전에는 W01로 이동하지 않는다.
 * - 이동 보호: 저장하지 않은 수정이 있으면 라우터 이동을 막고(useBlocker) 계속 수정하기 / 수정 내용 버리고 이동을 고르게 한다.
 *   저장 요청이 진행 중일 때는 이동을 막기만 한다. 브라우저 새로고침·탭 닫기는 beforeunload 경고뿐이며 저장을 보장하지 않는다.
 */
function ResultBody({
  userId,
  sessionId,
}: {
  userId: string
  sessionId: string | null
}) {
  const navigate = useNavigate()
  const { snapshot, controller } = useWorkoutResult(userId, sessionId)
  // 이미 저장된 기록이 서버에 올라가지 못했으면 그 이유를 보여 주고, 고칠 수 있으면 다시 보낸다.
  const upload = useRecordUploadStatus(
    userId,
    snapshot.load.status === 'completed' ? (snapshot.record?.id ?? null) : null,
  )
  const [editor, setEditor] = useState<ResultEditorState | null>(null)
  const [panel, setPanel] = useState<ResultPanel | null>(null)
  const [failureDismissed, setFailureDismissed] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const leavingRef = useRef(false)

  // ─── 이동 보호 ─────────────────────────────────────────
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      !leavingRef.current &&
      hasLeaveRisk(controller.getSnapshot()) &&
      currentLocation.pathname !== nextLocation.pathname,
    [controller],
  )
  const blocker = useBlocker(shouldBlock)
  const blockerRef = useRef(blocker)
  useEffect(() => {
    blockerRef.current = blocker
  }, [blocker])
  const busy =
    snapshot.phase === 'validating' ||
    snapshot.phase === 'savingProgress' ||
    snapshot.phase === 'completing'
  useEffect(() => {
    if (blocker.state !== 'blocked' || !busy) return
    // 저장 중에는 이동하지 않는다(중복 요청·저장 중 상태 손실 방지).
    blocker.reset()
    void Promise.resolve().then(() =>
      setNotice(
        '저장하는 중에는 이동할 수 없어요. 잠시 후 다시 시도해 주세요.',
      ),
    )
  }, [blocker, busy])
  // 저장하지 않은 수정이 있는 채 이동하려 하면 확인 패널을 연다(저장 중이면 위에서 막기만 한다).
  const shownPanel: ResultPanel | null =
    blocker.state === 'blocked' && !busy ? { kind: 'leave' } : panel

  // 저장이 확인된 뒤에만 W01로 이동한다.
  useEffect(() => {
    if (snapshot.phase === 'success' && snapshot.saved) {
      leavingRef.current = true
      void navigate(PATH_DASHBOARD)
    }
  }, [snapshot.phase, snapshot.saved, navigate])

  // ─── 동작 ─────────────────────────────────────────────
  function resetView() {
    setEditor(null)
    setPanel(null)
    setFailureDismissed(false)
  }

  function focusAfter(id: string) {
    requestAnimationFrame(() => document.getElementById(id)?.focus())
  }

  const actions: ResultActions = {
    openEdit: (itemIndex, setIndex) => {
      const current = controller.getSnapshot()
      const item = current.session?.listSnapshot.items[itemIndex]
      const set = current.draft?.performed[itemIndex]?.[setIndex]
      if (!item || !set || !set.completed || current.editLocked) return
      setEditor({
        itemIndex,
        setIndex,
        reps: set.actualReps === undefined ? '' : String(set.actualReps),
        weightKg:
          set.actualWeightKg === undefined ? '' : String(set.actualWeightKg),
        measuredMs: secondsInputOf(set.measuredMs ?? null),
        errors: {},
      })
    },
    closeEdit: () => {
      if (!editor) return
      const id = `result-edit-${editor.itemIndex}-${editor.setIndex}`
      setEditor(null)
      focusAfter(id)
    },
    changeField: (field, value) => {
      setEditor((prev) =>
        prev
          ? {
              ...prev,
              [field]: value,
              errors: { ...prev.errors, [field]: undefined },
            }
          : prev,
      )
    },
    applyEdit: () => {
      if (!editor) return
      const item =
        controller.getSnapshot().session?.listSnapshot.items[editor.itemIndex]
      if (!item) return
      const checked = validateSetFields(item.recordType, {
        reps: editor.reps,
        weightKg: editor.weightKg,
        measuredMs: editor.measuredMs,
      })
      if (!checked.ok) {
        // 입력한 값은 그대로 두고 틀린 입력 아래에 이유를 보인다(다른 세트의 수정값도 그대로).
        setEditor({ ...editor, errors: checked.errors })
        return
      }
      const position = {
        itemIndex: editor.itemIndex,
        setIndex: editor.setIndex,
      }
      // 한 세트의 모든 구성값을 한 번에 적용한다(일부만 바뀌는 중간 상태를 만들지 않는다).
      const result = controller.edit({
        kind: 'values',
        position,
        ...(checked.reps !== undefined ? { reps: checked.reps } : {}),
        ...(checked.weightKg !== undefined
          ? { weightKg: checked.weightKg }
          : {}),
        ...(checked.measuredMs !== undefined
          ? { measuredMs: editor.measuredMs }
          : {}),
      })
      if (!result.ok) {
        setNotice('지금은 값을 수정할 수 없어요.')
        return
      }
      const id = `result-edit-${editor.itemIndex}-${editor.setIndex}`
      setEditor(null)
      setNotice(`${editor.setIndex + 1}세트 값을 수정했어요.`)
      focusAfter(id)
    },
    uncomplete: (itemIndex, setIndex) => {
      const result = controller.edit({
        kind: 'uncomplete',
        position: { itemIndex, setIndex },
      })
      if (!result.ok) {
        setNotice('지금은 완료를 해제할 수 없어요.')
        return
      }
      setEditor(null)
      setNotice(`${setIndex + 1}세트 완료를 해제했어요.`)
      focusAfter(`result-ex-${itemIndex}`)
    },
    cancelEdits: () => {
      controller.cancelEdits()
      setEditor(null)
      setNotice('수정을 취소했어요. 처음 값으로 돌아갔어요.')
    },
    submit: () => {
      setFailureDismissed(false)
      setEditor(null)
      setNotice(null)
      void controller.submit()
    },
    requestReload: () => {
      const current = controller.getSnapshot()
      const busy =
        current.phase === 'validating' ||
        current.phase === 'savingProgress' ||
        current.phase === 'completing'
      // 저장 요청이 진행 중일 때는 불러오지 않는다(끝난 뒤에 다시 누른다).
      if (busy) return
      if (current.hasChanges) {
        setPanel({ kind: 'reload' })
        return
      }
      resetView()
      void controller.reloadLatest(true)
    },
    confirmReload: () => {
      resetView()
      void controller.reloadLatest(true)
    },
    closePanel: () => setPanel(null),
    dismissFailure: () => setFailureDismissed(true),
    goSession: () => {
      void navigate(PATH_SESSION)
    },
    goDashboard: () => {
      void navigate(PATH_DASHBOARD)
    },
    leaveStay: () => {
      const current = blockerRef.current
      if (current.state === 'blocked') current.reset()
    },
    leaveDiscard: () => {
      const current = blockerRef.current
      if (current.state === 'blocked') current.proceed()
    },
  }

  return (
    <>
      <div aria-live="polite" className="sr-only">
        {notice}
      </div>
      <ResultView
        snapshot={snapshot}
        editor={editor}
        panel={shownPanel}
        failureDismissed={failureDismissed}
        actions={actions}
        upload={upload}
      />
    </>
  )
}

export default function ExerciseResultPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const sessionId = params.get('session')
  // 계정이나 세션이 바뀌면 입력·패널·컨트롤러를 새로 시작한다.
  return user ? (
    <ResultBody
      key={`${user.id}:${sessionId ?? ''}`}
      userId={user.id}
      sessionId={sessionId}
    />
  ) : null
}
