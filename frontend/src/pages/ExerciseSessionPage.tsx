import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Link,
  useBlocker,
  useNavigate,
  type BlockerFunction,
} from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import {
  composeCard,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../components/exercise/compose/composeStyles.ts'
import SessionView from '../components/exercise/session/SessionView.tsx'
import type {
  SessionActions,
  SessionPanel,
} from '../components/exercise/session/sessionTypes.ts'
import { useExerciseLevel } from '../exercise/useExerciseLevel.ts'
import { useNow } from '../exercise/useNow.ts'
import { resultPathFor } from '../exercise/useWorkoutResult.ts'
import { useWorkoutSession } from '../exercise/useWorkoutSession.ts'
import { describeCompletedSetIssues } from '../exercise/completedSetValidation.ts'
import { adjacentExercise, type SetEntry } from '../exercise/workoutProgress.ts'
import type { SessionCursor } from '../exercise/workoutTypes.ts'

const PATH_DASHBOARD = '/records/exercise'

const NO_ACTIVE_MESSAGE = '진행 중인 운동이 없어요'

/**
 * W14 운동 진행(화면명세 W14-1 중량형·W14-2 횟수형·W14-3 시간형). 회원 전용이며 비회원은 라우트의 AuthGate가 안내한다.
 * 세션 저장·복구는 useWorkoutSession(컨트롤러)이, 표시는 SessionView가 맡고 이 컴포넌트는 둘을 잇는다.
 *
 * - 진행 중인 세션이 없으면 이 화면에서 새로 시작하지 않는다(시작은 W01의 시작·이어하기).
 * - 이동 보호: 측정 중이거나 저장하지 못한 변경이 있으면 라우터 이동을 막고(useBlocker) 일시정지·저장을 마친 뒤 이동한다.
 *   저장에 실패하면 다시 시도 / 그래도 나가기 / 머무르기를 고르게 한다. 브라우저 강제 종료는 막을 수 없다.
 * - 결과 확인(W15) 이동은 일반 나가기와 구분한다: 타이머 일시정지 → 기존 저장 대기열(prepareLeave) 처리 → 저장·충돌 없음 확인
 *   (canProceedToResult) → 이동. 하나라도 실패하면 이동하지 않는다. 이 화면은 기록을 만들지 않는다(최종 저장은 W15).
 */
function SessionBody({ userId }: { userId: string }) {
  const navigate = useNavigate()
  const { snapshot, controller } = useWorkoutSession(userId)
  // 입력 방식은 수준 조회가 끝난 뒤 한 번 정해져 이 화면에서 고정된다.
  const level = useExerciseLevel(userId)
  const now = useNow(snapshot.timerRunning)
  const [panel, setPanel] = useState<SessionPanel | null>(null)
  const [lastCompleted, setLastCompleted] = useState<SessionCursor | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  // 세트 완료가 정책 검증(미측정·누락)에서 막힌 이유. 입력 근처에 글자로 보이고, 세트가 바뀌거나 완료·타이머 조작이 있으면 지운다.
  const [completeError, setCompleteError] = useState<string | null>(null)
  const leavingRef = useRef(false)
  const snapshotRef = useRef(snapshot)
  useEffect(() => {
    snapshotRef.current = snapshot
  }, [snapshot])

  // ─── 이동 보호 ─────────────────────────────────────────
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      !leavingRef.current &&
      snapshotRef.current.needsLeavePreparation &&
      currentLocation.pathname !== nextLocation.pathname,
    [],
  )
  const blocker = useBlocker(shouldBlock)
  const blockerRef = useRef(blocker)
  useEffect(() => {
    blockerRef.current = blocker
  }, [blocker])
  const [leaveTick, setLeaveTick] = useState(0)
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    let cancelled = false
    void controller.prepareLeave().then((outcome) => {
      if (cancelled) return
      const current = blockerRef.current
      if (outcome.action === 'allow') {
        if (current.state === 'blocked') current.proceed()
        return
      }
      setPanel({
        kind: 'leave',
        unsavedCompletedSets: outcome.unsavedCompletedSets,
        retrying: false,
      })
    })
    return () => {
      cancelled = true
    }
  }, [blocker.state, controller, leaveTick])

  // ─── 결과(W15) 이동 ────────────────────────────────────
  const RESULT_BLOCK_TEXT: Record<string, string> = {
    sessionEnded: '이 운동은 이미 끝났어요. 운동 기록에서 확인해 주세요.',
    noCompletedSets: '완료한 세트가 없어 결과를 확인할 수 없어요.',
    saving: '진행 상태를 저장하는 중이에요. 잠시 후 다시 시도해 주세요.',
    saveFailed: '진행 상태를 저장하지 못했어요. 저장을 다시 시도해 주세요.',
    unsaved: '저장되지 않은 변경이 있어요. 저장을 다시 시도해 주세요.',
  }

  /**
   * 타이머를 멈추고 W14의 저장 대기열을 비운 뒤 W15로 이동한다. 저장소에 직접 쓰지 않는다(prepareLeave가 기존 저장 대기열로 저장한다).
   * 이동 보호(useBlocker)는 건너뛴다: 저장이 끝난 것을 확인한 뒤의 정상 이동이라 이탈 경고가 필요 없다.
   */
  async function proceedToResult() {
    setPanel({ kind: 'result', step: 'busy', reason: null })
    const fail = (reason: string) =>
      setPanel({ kind: 'result', step: 'failed', reason })
    const outcome = await controller.prepareLeave()
    const current = controller.getSnapshot()
    if (current.conflict !== null || current.save.fatal) {
      fail('충돌이 있어 결과를 확인할 수 없어요. 최신 상태를 불러와 주세요.')
      return
    }
    if (outcome.action !== 'allow') {
      fail('진행 상태를 저장하지 못했어요. 저장을 다시 시도해 주세요.')
      return
    }
    const eligible = current.result
    if (!current.sessionId || !eligible || !eligible.ok) {
      fail(
        RESULT_BLOCK_TEXT[
          eligible && !eligible.ok ? eligible.reason : 'saveFailed'
        ] ?? '잠시 후 다시 시도해 주세요.',
      )
      return
    }
    if (current.session?.timer.runningSince !== null) {
      fail('타이머를 멈추지 못했어요. 잠시 후 다시 시도해 주세요.')
      return
    }
    leavingRef.current = true
    void navigate(resultPathFor(current.sessionId))
  }

  // ─── 동작 ─────────────────────────────────────────────
  const nextLabel = (next: SessionCursor | null): string => {
    const session = snapshotRef.current.session
    if (!next || !session) return ''
    const item = session.listSnapshot.items[next.itemIndex]
    return ` 다음은 ${item.exerciseNameSnapshot} ${next.setIndex + 1}세트예요.`
  }

  function runComplete(entry: SetEntry | undefined, confirmOverrun = false) {
    const result = controller.complete({ entry, confirmOverrun })
    if (result.ok) {
      setPanel(null)
      setCompleteError(null)
      setLastCompleted(result.completed)
      setMessage(
        `${result.completed.setIndex + 1}세트를 완료했어요.${
          result.allCompleted
            ? ' 모든 세트를 마쳤어요.'
            : nextLabel(result.next)
        }`,
      )
      return
    }
    switch (result.reason) {
      case 'needsOverrunConfirmation':
        setPanel({
          kind: 'overrun',
          measuredMs: result.measuredMs,
          targetSeconds: result.targetSeconds,
          entry,
        })
        return
      case 'alreadyCompleted':
        setMessage('이미 완료한 세트예요.')
        return
      case 'invalidReps':
      case 'invalidWeight':
        setCompleteError(null)
        setMessage('입력한 값을 확인해 주세요.')
        return
      case 'invalidSet': {
        // 세션·입력·타이머는 그대로다. 빠졌거나 잘못된 항목을 화면에 알린다.
        const text = describeCompletedSetIssues(result.issues)
        setCompleteError(text)
        setMessage(`세트를 완료하지 못했어요. ${text}`)
        return
      }
      default:
        setMessage(
          '지금은 세트를 완료할 수 없어요. 화면의 안내를 확인해 주세요.',
        )
    }
  }

  function doMove(direction: 'previous' | 'next') {
    const session = snapshotRef.current.session
    if (!session) return
    const target = adjacentExercise(
      session.performed,
      session.cursor,
      direction,
    )
    if (!target) return
    const result = controller.move(target)
    setPanel(null)
    if (result.ok) {
      setLastCompleted(null)
      setCompleteError(null)
      setMessage(
        `${direction === 'next' ? '다음' : '이전'} 운동으로 이동했어요.`,
      )
    }
  }

  const actions: SessionActions = {
    complete: (entry) => runComplete(entry),
    undo: () => {
      if (!lastCompleted) return
      const result = controller.undo(lastCompleted)
      if (result.ok) {
        setLastCompleted(null)
        setMessage('방금 완료한 세트를 되돌렸어요.')
      } else if (result.reason === 'timerInUse') {
        setMessage('다음 세트의 타이머가 이미 쓰이고 있어 되돌릴 수 없어요.')
      } else {
        setMessage('되돌릴 수 없어요.')
      }
    },
    requestMove: (direction) => {
      const session = snapshotRef.current.session
      if (!session) return
      const idle =
        session.timer.accumulatedMs === 0 && session.timer.runningSince === null
      // 측정 중이거나 시간이 쌓여 있으면 이동할 때 그 측정이 버려진다: 먼저 확인한다.
      if (!idle) setPanel({ kind: 'discard', direction })
      else doMove(direction)
    },
    startTimer: () => {
      const result = controller.startTimer()
      if (result.ok) {
        setLastCompleted(null)
        setCompleteError(null)
        setMessage('타이머를 시작했어요.')
      }
    },
    pauseTimer: () => {
      const result = controller.pauseTimer()
      if (result.ok) setMessage('타이머를 일시정지했어요.')
    },
    retrySave: () => {
      void controller.retry()
    },
    requestReload: () => {
      const current = snapshotRef.current
      if (current.save.dirty) {
        setPanel({
          kind: 'reload',
          unsavedCompletedSets:
            current.leave?.action === 'confirmLoss'
              ? current.leave.unsavedCompletedSets
              : 0,
        })
      } else {
        void controller.reloadLatest(true)
      }
    },
    leave: () => {
      void navigate(PATH_DASHBOARD)
    },
    openAbandon: () => {
      setPanel({ kind: 'abandon', step: 1, busy: false, failed: false })
    },
    openResult: () => {
      const current = snapshotRef.current
      if (current.conflict !== null || current.save.fatal) return
      const timer = current.session?.timer
      // 측정 중이거나 시간이 쌓인 세트가 있으면 이동하면서 그 측정이 기록되지 않는다: 먼저 확인한다.
      if (timer && (timer.runningSince !== null || timer.accumulatedMs > 0)) {
        setPanel({ kind: 'result', step: 'confirm', reason: null })
      } else {
        void proceedToResult()
      }
    },
    confirmResult: () => {
      void proceedToResult()
    },
    closePanel: () => setPanel(null),
    confirmOverrun: () => {
      if (panel?.kind === 'overrun') runComplete(panel.entry, true)
    },
    confirmDiscard: () => {
      if (panel?.kind === 'discard') doMove(panel.direction)
    },
    confirmReload: () => {
      setLastCompleted(null)
      setPanel(null)
      void controller.reloadLatest(true)
    },
    confirmAbandon: () => {
      if (panel?.kind !== 'abandon' || panel.busy) return
      if (panel.step === 1) {
        setPanel({ ...panel, step: 2, failed: false })
        return
      }
      setPanel({ ...panel, busy: true, failed: false })
      void controller.abandon().then((result) => {
        if (result.ok) {
          // 이미 세션을 끝냈으므로 이동 보호를 건너뛴다.
          leavingRef.current = true
          void navigate(PATH_DASHBOARD)
        } else if (result.reason === 'conflict') {
          setPanel(null) // 충돌 안내가 화면에 나타난다
        } else {
          setPanel({ kind: 'abandon', step: 2, busy: false, failed: true })
        }
      })
    },
    leaveRetry: () => {
      setPanel((prev) =>
        prev?.kind === 'leave' ? { ...prev, retrying: true } : prev,
      )
      setLeaveTick((n) => n + 1)
    },
    leaveAnyway: () => {
      // 저장되지 않은 내용이 사라질 수 있음을 패널에서 알렸다.
      const current = blockerRef.current
      if (current.state === 'blocked') current.proceed()
    },
    leaveStay: () => {
      setPanel(null)
      const current = blockerRef.current
      if (current.state === 'blocked') current.reset()
    },
  }

  // ─── 불러오기 상태별 화면 ─────────────────────────────
  const load = snapshot.load
  if (load.status === 'loading' || level.status === 'loading') {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-app-title leading-snug font-semibold text-content">
          운동 진행
        </h1>
        <p role="status" className={`${composeCard} text-body text-muted`}>
          운동 진행 정보를 불러오는 중이에요…
        </p>
      </div>
    )
  }
  if (load.status !== 'ready') {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-app-title leading-snug font-semibold text-content">
          운동 진행
        </h1>
        {load.status === 'unavailable' ? (
          <p role="status" className={`${composeCard} text-body text-muted`}>
            운동 진행 기능을 준비 중이에요.
          </p>
        ) : load.status === 'none' ? (
          <section className={composeCard} aria-labelledby="session-none-title">
            <h2 id="session-none-title" className={composeSectionTitle}>
              {NO_ACTIVE_MESSAGE}
            </h2>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              운동 기록에서 오늘의 운동을 시작할 수 있어요.
            </p>
            <Link
              to={PATH_DASHBOARD}
              className={`${composePrimaryButton} mt-4`}
            >
              운동 기록으로 가기
            </Link>
          </section>
        ) : load.status === 'corrupt' ? (
          <section role="alert" className={composeCard}>
            <h2 className={composeSectionTitle}>
              운동 데이터를 읽을 수 없어요
            </h2>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              진행 중인 운동의 저장 데이터가 손상됐어요. 데이터는 지우지
              않았어요.
            </p>
            <Link
              to={PATH_DASHBOARD}
              className={`${composeSecondaryButton} mt-4`}
            >
              운동 기록으로 가기
            </Link>
          </section>
        ) : (
          <section role="alert" className={composeCard}>
            <h2 className={composeSectionTitle}>운동을 불러오지 못했어요</h2>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              잠시 후 다시 시도해 주세요. 저장된 운동은 그대로예요.
            </p>
            <button
              type="button"
              onClick={() => void controller.reloadLatest(true)}
              className={`${composePrimaryButton} mt-4`}
            >
              다시 시도
            </button>
          </section>
        )}
      </div>
    )
  }

  return (
    <SessionView
      snapshot={snapshot}
      mode={level.mode}
      levelFailed={level.failed}
      now={now}
      lastCompleted={lastCompleted}
      panel={panel}
      message={message}
      completeError={completeError}
      actions={actions}
    />
  )
}

export default function ExerciseSessionPage() {
  const { user } = useAuth()
  // 계정이 바뀌면 세션·입력·패널을 새로 시작한다(세션 저장은 계정별 컨트롤러가 격리한다).
  return user ? <SessionBody key={user.id} userId={user.id} /> : null
}
