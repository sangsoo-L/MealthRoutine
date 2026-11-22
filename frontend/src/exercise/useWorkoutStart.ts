import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  decideStart,
  summarizeActiveSession,
  type ActiveSessionSummary,
  type StartDecision,
} from './startWorkout.ts'
import { classifySessionFailure } from './workoutSessionController.ts'
import {
  createWorkoutRecordRepository,
  createWorkoutSessionRepository,
} from './workoutSource.ts'
import { toLocalDate } from './workoutModel.ts'
import type { LocalDate } from './workoutTypes.ts'

/** W14(운동 진행) 경로. */
export const PATH_SESSION = '/records/exercise/session'

type Info =
  | { status: 'loading' }
  /** 저장소가 없거나(운영 빌드) 이 브라우저에서 쓸 수 없다. W01은 기존 "준비 중" 안내를 유지한다. */
  | { status: 'unavailable' }
  /** 진행 중 세션의 저장값이 손상됐다. 시작·이어하기를 막는다. */
  | { status: 'corrupt' }
  | { status: 'error' }
  | {
      status: 'ready'
      active: ActiveSessionSummary | null
      doneListIds: ReadonlySet<string>
    }

interface Loaded {
  key: string
  info: Info
}

export type StartError =
  | 'start'
  | 'abandon'
  /** 다른 곳에서 세션이 바뀌어 요청하지 않았다(다시 확인했다). */
  | 'changed'
  /** 자정이 지나 목록이 오늘 것이 아니게 됐다. */
  | 'dateChanged'

/**
 * 열려 있는 확인 패널. conflict는 다른 목록의 진행 중 세션과 충돌했을 때 고르는 패널이고, abandon은 그만두기 2단계 확인이다.
 * origin은 패널을 그릴 영역(진행 중인 운동 카드 / 오늘의 운동)이다. thenStart이면 그만둔 뒤 오늘 목록을 새로 시작한다.
 */
export interface StartPanel {
  origin: 'card' | 'today'
  kind: 'conflict' | 'abandon'
  step: 1 | 2
  thenStart: boolean
}

export interface StartControls {
  status: Info['status']
  active: ActiveSessionSummary | null
  decision: StartDecision | null
  busy: boolean
  error: StartError | null
  panel: StartPanel | null
  reload: () => void
  start: () => void
  resume: () => void
  openAbandon: (origin: 'card' | 'today') => void
  /** 충돌 패널에서 "그만두고 새로 시작"을 고른다(2단계 확인으로 이어진다). */
  chooseAbandonAndStart: () => void
  /** 그만두기 확인의 다음 단계. 마지막 단계에서 실행한다. */
  confirmAbandon: () => void
  closePanel: () => void
}

/**
 * W01의 운동 시작·이어하기 상태와 동작. 진행 중 세션(getActive)과 오늘 완료 기록(listByDateRange)을 읽어
 * startWorkout.decideStart로 시작·이어하기·충돌·완료·오늘 아님을 판단한다.
 *
 * - 시작은 startOrResume을 쓰므로 두 탭이 동시에 시작해도 세션은 하나다(저장소가 한 트랜잭션으로 처리). 다른 목록의 진행 중 세션이 있으면
 *   저장소가 activeSessionConflict를 돌려주고, 그때 충돌 패널을 연다.
 * - 그만두기는 기록을 만들지 않는다. 2단계 확인을 거치고, 마지막으로 확인한 revision으로 요청해 다른 곳의 변경을 덮어쓰지 않는다.
 * - 완료 세트가 있는 세션을 그만두면 기록이 남지 않는다는 점은 화면이 안내한다.
 * - 날짜는 기기 로컬 날짜다. 목록이 오늘 것이 아니면 새로 시작하지 않는다(이어하기는 날짜와 무관).
 */
export function useWorkoutStart(
  userId: string | null,
  today: LocalDate,
  list: { id: string; plannedDate: LocalDate; startBlocked?: boolean } | null,
  enabled: boolean,
  /** 주면 W14로 이동할 때 이 경로를 `state.from`으로 넘겨 W14의 "이전"이 그 화면(W10)으로 돌아오게 한다. 없으면 기존 동작(W01)이다. */
  returnTo?: string,
): StartControls {
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<StartError | null>(null)
  const [panel, setPanel] = useState<StartPanel | null>(null)

  const sessions = useMemo(
    () => (userId ? createWorkoutSessionRepository(userId) : null),
    [userId],
  )
  const records = useMemo(
    () => (userId ? createWorkoutRecordRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${today}#${attempt}`

  useEffect(() => {
    if (!enabled || !sessions || !records) return
    let cancelled = false
    Promise.all([
      sessions.getActive(),
      records.listByDateRange(today, today),
    ]).then(
      ([session, done]) => {
        if (cancelled) return
        setLoaded({
          key,
          info: {
            status: 'ready',
            active: session ? summarizeActiveSession(session, today) : null,
            doneListIds: new Set(
              done.items.map((record) => record.sourceListId),
            ),
          },
        })
      },
      (failure: unknown) => {
        if (cancelled) return
        const kind = classifySessionFailure(failure)
        setLoaded({
          key,
          info: {
            status:
              kind === 'corrupt'
                ? 'corrupt'
                : kind === 'unavailable'
                  ? 'unavailable'
                  : 'error',
          },
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [enabled, sessions, records, today, key])

  const info: Info =
    !enabled || !sessions || !records
      ? { status: 'unavailable' }
      : loaded && loaded.key === key
        ? loaded.info
        : { status: 'loading' }

  const active = info.status === 'ready' ? info.active : null
  const decision: StartDecision | null =
    info.status === 'ready' && list
      ? decideStart({
          today,
          list,
          active: info.active,
          doneListIds: info.doneListIds,
        })
      : null

  const reload = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])

  const goSession = useCallback(() => {
    void navigate(PATH_SESSION, returnTo ? { state: { from: returnTo } } : {})
  }, [navigate, returnTo])

  /** 오늘 목록으로 시작하거나 이어한다. 다른 목록의 진행 중 세션이 있으면 충돌 패널을 연다. */
  const startList = useCallback(
    async (listId: string, origin: 'card' | 'today'): Promise<void> => {
      if (!sessions) return
      setBusy(true)
      setError(null)
      try {
        const result = await sessions.startOrResume(listId)
        if (result.kind === 'activeSessionConflict') {
          setPanel({ origin, kind: 'conflict', step: 1, thenStart: false })
          reload()
          return
        }
        goSession()
      } catch {
        setError('start')
      } finally {
        setBusy(false)
      }
    },
    [sessions, goSession, reload],
  )

  const start = useCallback(() => {
    if (busy || !list || !decision) return
    if (decision.kind === 'resume') {
      goSession()
      return
    }
    if (decision.kind === 'conflict') {
      setError(null)
      setPanel({ origin: 'today', kind: 'conflict', step: 1, thenStart: false })
      return
    }
    if (decision.kind !== 'start') return
    // 저장소는 날짜를 보지 않으므로 자정이 지났다면 시작하지 않는다.
    if (toLocalDate(new Date()) !== list.plannedDate) {
      setError('dateChanged')
      reload()
      return
    }
    void startList(list.id, 'today')
  }, [busy, list, decision, goSession, startList, reload])

  const openAbandon = useCallback(
    (origin: 'card' | 'today') => {
      if (!active) return
      setError(null)
      setPanel({ origin, kind: 'abandon', step: 1, thenStart: false })
    },
    [active],
  )

  const chooseAbandonAndStart = useCallback(() => {
    setPanel((prev) =>
      prev ? { ...prev, kind: 'abandon', step: 1, thenStart: true } : prev,
    )
  }, [])

  const confirmAbandon = useCallback(() => {
    if (busy || !panel || panel.kind !== 'abandon' || !active || !sessions)
      return
    if (panel.step === 1) {
      setPanel({ ...panel, step: 2 })
      return
    }
    void (async () => {
      setBusy(true)
      setError(null)
      try {
        // 마지막으로 확인한 revision으로 요청한다. 다른 곳에서 바뀌었다면 저장소가 막는다(그만두지 않는다).
        await sessions.abandon(active.id, { expectedRevision: active.revision })
      } catch (failure) {
        setError(
          classifySessionFailure(failure) === 'revisionMismatch'
            ? 'changed'
            : 'abandon',
        )
        setPanel(null)
        setBusy(false)
        reload()
        return
      }
      const thenStart = panel.thenStart
      setPanel(null)
      setBusy(false)
      if (thenStart && list && toLocalDate(new Date()) === list.plannedDate) {
        await startList(list.id, panel.origin)
      } else {
        reload()
      }
    })()
  }, [busy, panel, active, sessions, list, startList, reload])

  const closePanel = useCallback(() => {
    setPanel(null)
  }, [])

  return {
    status: info.status,
    active,
    decision,
    busy,
    error,
    panel,
    reload,
    start,
    resume: goSession,
    openAbandon,
    chooseAbandonAndStart,
    confirmAbandon,
    closePanel,
  }
}
