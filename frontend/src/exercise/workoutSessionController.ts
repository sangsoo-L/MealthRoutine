import { countCompletedSets, pauseTimer } from './workoutModel.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import type { WorkoutSessionRepository } from './workoutRepositories.ts'
import {
  assessLeave,
  buildTimerInput,
  canProceedToResult,
  classifyRevisionMismatch,
  completeSet,
  moveCursor,
  restoreSession,
  sameProgress,
  shouldWarnBeforeUnload,
  undoCompletedSet,
  type CompleteSetOptions,
  type CompleteSetResult,
  type LeaveDecision,
  type MoveResult,
  type Progress,
  type ResultEligibility,
  type SessionState,
  type TimerInputResult,
  type UndoResult,
} from './workoutProgress.ts'
import type {
  PerformedSet,
  SessionCursor,
  SessionProgressInput,
  WorkoutSession,
} from './workoutTypes.ts'

/**
 * 운동 진행 세션의 저장·복구 컨트롤러(React와 무관). 순수 진행 로직(workoutProgress)과 WorkoutSessionRepository를 연결한다.
 * 화면은 useWorkoutSession 훅으로 이 컨트롤러의 snapshot을 구독한다. 저장소·시계·주기 실행기를 주입받아 노드에서 시나리오를 시험할 수 있다.
 *
 * 핵심 규칙
 * - 불러오기: getActive로 진행 중 세션을 읽는다. 없음·손상·조회 실패를 구분한다. 저장된 타이머가 측정 중이었다면 restoreSession으로 복원(정지)하고,
 *   복원 결과가 저장된 값과 실제로 달라졌을 때만 저장한다(다른 진행 데이터는 바꾸지 않는다). 자동으로 타이머를 재개하지 않는다.
 *   복원 저장이 끝나기 전에는 타이머를 시작할 수 없다.
 * - 저장 대기열: saveProgress는 한 번에 하나만 실행한다. 화면 값(local)은 항상 최신 전체 상태이고, 저장 중에 변경이 생기면 끝난 뒤 최신 전체 상태를
 *   다시 저장한다. expectedRevision은 입력에 담긴 값이 아니라 마지막으로 확인한 저장소 revision을 보낸다. 실패하면 미저장 상태를 유지하고
 *   재시도는 그 시점의 최신 값을 쓴다. 연타·체크포인트·숨김 저장도 같은 대기열을 지나므로 겹치지 않는다.
 * - revisionMismatch: get으로 저장된 세션을 다시 읽어 classifyRevisionMismatch로 구분한다. 이미 반영된 저장이면 저장된 revision을 받아들이고,
 *   실제 충돌이면 자동 병합하지 않고 저장을 멈추며 타이머를 정지한다(최신 상태를 불러오는 선택만 제공). invalidProgress는 다시 시도하지 않는다.
 * - 체크포인트: 타이머가 측정 중이면 주기(기본 10초)마다 저장한다. 탭이 숨겨지면 타이머를 일시정지하고 저장을 시도하며, 돌아와도 자동 재개하지 않는다.
 *   pagehide·탭 닫기·강제 종료에서는 저장 성공을 보장할 수 없다. 마지막 성공 저장 이후의 측정 시간은 사라질 수 있고(복원은 마지막 저장 시각까지만 인정),
 *   과다 기록은 되지 않는다.
 * - 활성화/비활성화: 계정이 바뀌면 화면이 새 컨트롤러를 만들고 이전 컨트롤러를 비활성화한다. 비활성화 뒤에 도착한 응답은 모두 무시한다.
 */

// ─── 타입 ──────────────────────────────────────────────────

export type SessionFailure =
  | 'quota'
  | 'unavailable'
  | 'blocked'
  | 'revisionMismatch'
  | 'sessionEnded'
  | 'notFound'
  | 'invalidProgress'
  | 'corrupt'
  | 'error'

/** 저장소 오류를 화면이 구분하는 이유로 바꾼다. 오류 내용(저장값)은 다루지 않는다. */
export function classifySessionFailure(error: unknown): SessionFailure {
  if (!isWorkoutStoreError(error)) return 'error'
  switch (error.reason) {
    case 'quota':
      return 'quota'
    case 'unavailable':
      return 'unavailable'
    case 'blocked':
    case 'versionChange':
      return 'blocked'
    case 'notFound':
      return 'notFound'
    case 'validation':
      return 'invalidProgress'
    case 'conflict':
      if (error.code === 'revisionMismatch') return 'revisionMismatch'
      if (
        error.code === 'sessionNotInProgress' ||
        error.code === 'sessionEnded'
      ) {
        return 'sessionEnded'
      }
      return 'error'
    case 'error':
      return error.code === 'activeSessionCorrupt' ||
        error.code === 'corruptRecord'
        ? 'corrupt'
        : 'error'
    default:
      return 'error'
  }
}

export type SessionLoad =
  | { status: 'loading' }
  /** 저장소가 없거나(계정 없음) 이 브라우저에서 쓸 수 없다. */
  | { status: 'unavailable' }
  /** 진행 중인 세션이 없다. */
  | { status: 'none' }
  /** 진행 중 세션의 저장값이 손상됐다. 시작·진행 모두 막고 저장값은 지우지 않는다. */
  | { status: 'corrupt' }
  | { status: 'error'; reason: 'quota' | 'blocked' | 'error' }
  | { status: 'ready' }

/** 저장 실패의 이유. invalidProgress는 다시 시도해도 같으므로 fatal이다. */
export type SaveFailureReason =
  'quota' | 'unavailable' | 'blocked' | 'invalidProgress' | 'error'

/**
 * 충돌의 종류.
 * - changed: 다른 탭이 먼저 저장해서 저장된 값이 내 값과 다르다.
 * - ended: 세션이 다른 곳에서 끝났다(완료·중단·취소).
 * - gone: 세션을 찾을 수 없다.
 */
export type SessionConflictKind = 'changed' | 'ended' | 'gone'

export interface SessionSaveState {
  saving: boolean
  /** 화면 값이 마지막으로 저장된 값과 다르다(미저장 변경). */
  dirty: boolean
  /** 마지막 저장 시도가 실패했다(성공할 때까지 유지). */
  failed: boolean
  reason: SaveFailureReason | null
  /** 다시 시도해도 소용없는 실패(invalidProgress). */
  fatal: boolean
}

export interface SessionSnapshot {
  load: SessionLoad
  sessionId: string | null
  /** 화면이 쓰는 세션 상태(화면 값 기준). ready일 때만 있다. */
  session: SessionState | null
  /** 마지막으로 확인한 저장소 revision. */
  revision: number | null
  save: SessionSaveState
  /** 복원된 타이머의 저장이 아직 끝나지 않았다. 끝나기 전에는 타이머를 시작할 수 없다. */
  restorePending: boolean
  /** 타이머를 시작·재개할 수 없다(복원 저장 전·충돌·치명적 실패). */
  timerBlocked: boolean
  timerRunning: boolean
  /** 탭 숨김·pagehide로 타이머가 일시정지됐다. 돌아와도 자동 재개하지 않으므로 화면이 "재개" 안내를 보인다. */
  pausedByHide: boolean
  conflict: { kind: SessionConflictKind } | null
  /** 화면을 떠나기 전에 일시정지·저장 준비(prepareLeave)가 필요한지. 라우터 이동 차단(useBlocker)의 기준이다. */
  needsLeavePreparation: boolean
  /** beforeunload 경고 여부: 저장되지 않은 변경이 있거나 저장 중일 때만이다. */
  warnBeforeUnload: boolean
  leave: LeaveDecision | null
  /** W15로 이동할 수 있는지. */
  result: ResultEligibility | null
}

export type MutationBlocked = {
  ok: false
  reason: 'notReady' | 'conflict' | 'blocked' | 'restorePending'
}

export type LeaveOutcome =
  | { action: 'allow' }
  /** 저장하지 못한 변경이 남았다. 사용자가 확인하지 않으면 이동하지 않는다. */
  | { action: 'confirmLoss'; unsavedCompletedSets: number }

export type AbandonResult =
  | { ok: true }
  | {
      ok: false
      reason: 'notReady' | 'conflict' | 'failed'
      failure?: SessionFailure
    }

export interface ReloadResult {
  ok: boolean
  /** 미저장 변경이 있어 사용자 확인(confirmed)이 필요하다. */
  reason?: 'confirmRequired'
}

export interface SessionControllerDeps {
  /** null이면 저장소가 없는 상태(계정 없음)다. */
  repository: Pick<
    WorkoutSessionRepository,
    'getActive' | 'get' | 'saveProgress' | 'abandon'
  > | null
  now?: () => Date
  scheduler?: {
    setInterval(callback: () => void, ms: number): unknown
    clearInterval(handle: unknown): void
  }
  /** 측정 중 체크포인트 저장 주기(ms). 기본 10초. */
  checkpointMs?: number
}

export const CHECKPOINT_MS = 10_000

type Meta = Pick<
  WorkoutSession,
  'id' | 'listSnapshot' | 'status' | 'lastSavedAt'
>

const copyPerformed = (
  performed: readonly (readonly PerformedSet[])[],
): PerformedSet[][] => performed.map((sets) => sets.map((set) => ({ ...set })))

const progressOf = (
  value: Pick<WorkoutSession, 'cursor' | 'performed' | 'timer'>,
): Progress => ({
  cursor: { ...value.cursor },
  performed: copyPerformed(value.performed),
  timer: { ...value.timer },
})

const defaultScheduler = {
  setInterval: (callback: () => void, ms: number): unknown =>
    globalThis.setInterval(callback, ms),
  clearInterval: (handle: unknown): void =>
    globalThis.clearInterval(handle as ReturnType<typeof setInterval>),
}

const EMPTY_SAVE: SessionSaveState = {
  saving: false,
  dirty: false,
  failed: false,
  reason: null,
  fatal: false,
}

export interface WorkoutSessionController {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => SessionSnapshot
  activate: () => void
  deactivate: () => void
  complete: (
    options?: CompleteSetOptions,
  ) => CompleteSetResult | MutationBlocked
  undo: (position: SessionCursor) => UndoResult | MutationBlocked
  move: (target: SessionCursor) => MoveResult | MutationBlocked
  startTimer: () => TimerInputResult | MutationBlocked
  pauseTimer: () => TimerInputResult | MutationBlocked
  /** 저장 실패 뒤 다시 시도한다. 그 시점의 최신 값을 저장한다. 치명적 실패·충돌에서는 아무것도 하지 않는다. */
  retry: () => Promise<void>
  /** 저장소의 최신 상태를 다시 불러온다. 미저장 변경이 있으면 confirmed가 true여야 한다(화면 값은 버려진다). */
  reloadLatest: (confirmed?: boolean) => Promise<ReloadResult>
  /** 화면을 떠나기 전: 타이머를 일시정지하고 저장을 마친 뒤 이동 가능 여부를 돌려준다. */
  prepareLeave: () => Promise<LeaveOutcome>
  /**
   * 기록 없이 그만둔다(완료 세트가 있으면 interrupted, 없으면 cancelled). 진행 중인 저장이 끝나기를 기다린 뒤, 마지막으로 확인한
   * revision으로 요청하므로 다른 탭의 변경을 덮어쓰지 않는다(다르면 충돌). 성공하면 진행 중인 세션이 없는 상태(none)가 된다.
   */
  abandon: () => Promise<AbandonResult>
  /**
   * 탭으로 돌아왔을 때 저장소의 최신 상태를 확인한다. 미저장 변경·저장 중·충돌·저장 실패가 없을 때만 다른 곳의 변경을 반영하고,
   * 그렇지 않으면 아무것도 덮어쓰지 않는다. 타이머는 자동으로 재개하지 않는다.
   */
  syncOnReturn: () => Promise<void>
  onHidden: () => void
  onPageHide: () => void
  /** 지금 진행 중인 저장(없으면 이미 끝난 것)이 끝날 때까지 기다린다(테스트·이동 준비용). */
  idle: () => Promise<void>
}

export function createWorkoutSessionController(
  deps: SessionControllerDeps,
): WorkoutSessionController {
  const now = deps.now ?? (() => new Date())
  const scheduler = deps.scheduler ?? defaultScheduler
  const checkpointMs = deps.checkpointMs ?? CHECKPOINT_MS
  const repository = deps.repository

  let active = false
  /** 활성화·비활성화마다 올라간다. 지난 세대의 비동기 응답을 무시하는 데 쓴다(계정·화면 전환 격리). */
  let epoch = 0

  let load: SessionLoad = { status: 'loading' }
  let meta: Meta | null = null
  let revision = 0
  let stored: Progress | null = null
  let local: Progress | null = null
  let failure: SaveFailureReason | null = null
  /**
   * 결과를 알 수 없이 끝난 마지막 저장 시도의 값(응답 유실 가능). 다음 시도가 revisionMismatch를 만났을 때, 저장된 상태가
   * 이 값과 같으면 "내 이전 저장이 이미 반영된 것"이므로 충돌이 아니다(그 뒤에 생긴 변경만 이어서 저장한다).
   */
  let unacked: Progress | null = null
  let saving = false
  let restorePending = false
  let pausedByHide = false
  let conflict: SessionConflictKind | null = null
  let checkpointHandle: unknown = null
  /** 저장 반복문이 실행 중인지. 반복문이 끝나는 순간 같은 틱에서 바로 풀려, 그 뒤에 생긴 변경은 새 저장을 시작한다. */
  let busy = false
  let flushing: Promise<void> = Promise.resolve()
  /** 저장 반복문의 세대. 세션을 다시 불러오거나 비활성화하면 올라가서 지난 반복문이 새 반복문을 막지 못한다. */
  let flushSeq = 0

  const listeners = new Set<() => void>()

  const isCurrent = (e: number): boolean => active && epoch === e

  const dirtyNow = (): boolean =>
    local !== null && stored !== null && !sameProgress(local, stored)

  function sessionState(): SessionState | null {
    if (!meta || !local) return null
    return {
      listSnapshot: meta.listSnapshot,
      status: meta.status,
      lastSavedAt: meta.lastSavedAt,
      revision,
      cursor: local.cursor,
      performed: local.performed,
      timer: local.timer,
    }
  }

  function buildSnapshot(): SessionSnapshot {
    const state = sessionState()
    const ready = load.status === 'ready' && state !== null
    const dirty = ready && dirtyNow()
    const fatal = failure === 'invalidProgress'
    const save: SessionSaveState = ready
      ? { saving, dirty, failed: failure !== null, reason: failure, fatal }
      : EMPTY_SAVE
    const timerRunning =
      ready && local !== null && local.timer.runningSince !== null
    const timerBlocked = ready && (restorePending || conflict !== null || fatal)
    const localDone = local ? countCompletedSets(local.performed) : 0
    const savedDone = stored ? countCompletedSets(stored.performed) : 0
    return {
      load,
      sessionId: ready && meta ? meta.id : null,
      session: ready ? state : null,
      revision: ready ? revision : null,
      save,
      restorePending: ready && restorePending,
      timerBlocked,
      timerRunning,
      pausedByHide: ready && pausedByHide,
      conflict: ready && conflict ? { kind: conflict } : null,
      needsLeavePreparation: ready && (timerRunning || dirty || saving),
      warnBeforeUnload: ready && shouldWarnBeforeUnload(save),
      leave: ready
        ? assessLeave({
            save: { dirty, saving, failed: failure !== null },
            localCompletedSets: localDone,
            savedCompletedSets: savedDone,
          })
        : null,
      result:
        ready && state
          ? canProceedToResult({
              status: state.status,
              performed: state.performed,
              timer: state.timer,
              save: { dirty, saving, failed: failure !== null },
            })
          : null,
    }
  }

  let snapshot: SessionSnapshot = buildSnapshot()

  function syncCheckpoint(): void {
    const shouldRun =
      active &&
      load.status === 'ready' &&
      local !== null &&
      local.timer.runningSince !== null &&
      conflict === null &&
      failure !== 'invalidProgress'
    if (shouldRun && checkpointHandle === null) {
      checkpointHandle = scheduler.setInterval(checkpoint, checkpointMs)
    } else if (!shouldRun && checkpointHandle !== null) {
      scheduler.clearInterval(checkpointHandle)
      checkpointHandle = null
    }
  }

  function emit(): void {
    snapshot = buildSnapshot()
    syncCheckpoint()
    for (const listener of [...listeners]) listener()
  }

  /** 타이머가 측정 중이면 지금 시각까지 누적하고 멈춘다(화면 값만 바꾼다). */
  function pauseLocalTimer(): void {
    if (local && local.timer.runningSince !== null) {
      local = { ...local, timer: pauseTimer(local.timer, now()) }
    }
  }

  // ─── 저장 대기열 ────────────────────────────────────────

  type ErrorOutcome = 'applied' | 'stop'

  async function handleSaveError(
    error: unknown,
    sent: SessionProgressInput,
    id: string,
    e: number,
  ): Promise<ErrorOutcome> {
    const kind = classifySessionFailure(error)
    if (kind === 'revisionMismatch') {
      // 저장은 반영됐는데 응답만 잃은 것인지, 다른 탭이 먼저 저장한 것인지 저장된 상태로 구분한다.
      let current: WorkoutSession | null
      try {
        current = await repository!.get(id)
      } catch (readError) {
        if (!isCurrent(e)) return 'stop'
        failure = reasonOfRead(readError)
        return 'stop'
      }
      if (!isCurrent(e)) return 'stop'
      if (current === null) {
        conflict = 'gone'
        pauseLocalTimer()
        return 'stop'
      }
      if (current.status !== 'in_progress') {
        conflict = 'ended'
        pauseLocalTimer()
        return 'stop'
      }
      const sentProgress: Progress = {
        cursor: sent.cursor,
        performed: sent.performed,
        timer: sent.timer,
      }
      // 이번에 보낸 값 또는 응답을 못 받은 이전 저장이 이미 저장돼 있으면 충돌이 아니다.
      const applied = [sentProgress, ...(unacked ? [unacked] : [])].find(
        (candidate) =>
          classifyRevisionMismatch(candidate, current) === 'alreadyApplied',
      )
      if (applied) {
        revision = current.revision
        stored = progressOf(applied)
        failure = null
        unacked = null
        restorePending = false
        return 'applied'
      }
      conflict = 'changed'
      pauseLocalTimer()
      return 'stop'
    }
    if (kind === 'sessionEnded') {
      conflict = 'ended'
      pauseLocalTimer()
      return 'stop'
    }
    if (kind === 'notFound') {
      conflict = 'gone'
      pauseLocalTimer()
      return 'stop'
    }
    failure =
      kind === 'quota' ||
      kind === 'unavailable' ||
      kind === 'blocked' ||
      kind === 'invalidProgress'
        ? kind
        : 'error'
    // 저장이 반영됐는지 알 수 없다(응답 유실 가능). 다음 시도가 충돌을 만나면 이 값과 비교한다.
    unacked = {
      cursor: sent.cursor,
      performed: sent.performed,
      timer: sent.timer,
    }
    return 'stop'
  }

  function reasonOfRead(error: unknown): SaveFailureReason {
    const kind = classifySessionFailure(error)
    return kind === 'quota' || kind === 'unavailable' || kind === 'blocked'
      ? kind
      : 'error'
  }

  async function runFlush(force: boolean, seq: number): Promise<void> {
    const e = epoch
    let forced = force
    try {
      for (;;) {
        if (!isCurrent(e) || !repository || !meta || !local || !stored) return
        if (conflict !== null || failure === 'invalidProgress') return
        if (!dirtyNow() && !forced) return
        forced = false
        const sent: SessionProgressInput = {
          expectedRevision: revision,
          cursor: { ...local.cursor },
          performed: copyPerformed(local.performed),
          timer: { ...local.timer },
        }
        const id = meta.id
        saving = true
        emit()
        try {
          const next = await repository.saveProgress(id, sent)
          if (!isCurrent(e)) return
          revision = next.revision
          stored = progressOf(sent)
          failure = null
          unacked = null
          restorePending = false
        } catch (error) {
          if (!isCurrent(e)) return
          const outcome = await handleSaveError(error, sent, id, e)
          if (!isCurrent(e)) return
          if (outcome === 'stop') return
        }
        // 저장하는 동안 변경이 생겼다면 최신 전체 상태로 이어서 저장한다(반복 조건에서 확인).
      }
    } finally {
      if (flushSeq === seq) busy = false
      if (isCurrent(e)) {
        saving = false
        emit()
      }
    }
  }

  function requestSave(force = false): Promise<void> {
    // 진행 중인 저장 반복문이 있으면 그것이 끝나기 전에 최신 값이 남아 있는지 다시 확인하므로 새로 시작하지 않는다.
    if (busy) return flushing
    busy = true
    flushSeq += 1
    flushing = runFlush(force, flushSeq)
    return flushing
  }

  /** 세션을 다시 불러오거나 비활성화할 때: 지난 응답을 버리고 저장 반복문의 실행 표시를 푼다. */
  function bumpEpoch(): void {
    epoch += 1
    busy = false
    flushSeq += 1
  }

  function checkpoint(): void {
    if (!active || load.status !== 'ready' || conflict !== null) return
    if (failure === 'invalidProgress' || saving) return
    // 측정 중일 때만 시각을 저장한다(복원이 마지막 저장 시각까지만 인정하기 때문). 실패하면 오류 상태를 유지한다.
    if (!local || local.timer.runningSince === null) return
    void requestSave(true)
  }

  function applyInput(input: SessionProgressInput): void {
    local = {
      cursor: { ...input.cursor },
      performed: copyPerformed(input.performed),
      timer: { ...input.timer },
    }
    emit()
    void requestSave()
  }

  function blocked(forTimerStart = false): MutationBlocked | null {
    if (load.status !== 'ready' || !meta || !local) {
      return { ok: false, reason: 'notReady' }
    }
    if (conflict !== null) return { ok: false, reason: 'conflict' }
    if (failure === 'invalidProgress') return { ok: false, reason: 'blocked' }
    if (forTimerStart && restorePending) {
      return { ok: false, reason: 'restorePending' }
    }
    return null
  }

  // ─── 불러오기 ───────────────────────────────────────────

  function resetState(): void {
    meta = null
    stored = null
    local = null
    revision = 0
    failure = null
    unacked = null
    saving = false
    restorePending = false
    pausedByHide = false
    conflict = null
  }

  async function loadActive(): Promise<void> {
    const e = epoch
    resetState()
    if (!repository) {
      load = { status: 'unavailable' }
      emit()
      return
    }
    load = { status: 'loading' }
    emit()
    let session: WorkoutSession | null
    try {
      session = await repository.getActive()
    } catch (error) {
      if (!isCurrent(e)) return
      const kind = classifySessionFailure(error)
      load =
        kind === 'corrupt'
          ? { status: 'corrupt' }
          : kind === 'unavailable'
            ? { status: 'unavailable' }
            : {
                status: 'error',
                reason: kind === 'quota' || kind === 'blocked' ? kind : 'error',
              }
      emit()
      return
    }
    if (!isCurrent(e)) return
    if (!session) {
      load = { status: 'none' }
      emit()
      return
    }
    // 저장된 타이머가 측정 중이었다면 마지막 저장 시각까지만 인정하고 정지 상태로 복원한다. 자동으로 재개하지 않는다.
    const { session: restored } = restoreSession(session)
    meta = {
      id: session.id,
      listSnapshot: session.listSnapshot,
      status: session.status,
      lastSavedAt: session.lastSavedAt,
    }
    revision = session.revision
    stored = progressOf(session)
    local = progressOf(restored)
    // 복원이 저장된 값과 실제로 달라진 경우에만 저장한다(cursor·performed는 저장된 그대로 두고 타이머만 바뀐다).
    restorePending = dirtyNow()
    load = { status: 'ready' }
    emit()
    if (restorePending) void requestSave()
  }

  /** 탭 숨김·pagehide: 측정 중이면 일시정지하고, 측정 중이거나 미저장 변경이 있으면 저장을 시도한다. 돌아와도 자동으로 재개하지 않는다. */
  function pauseAndSave(): void {
    if (load.status !== 'ready' || !local) return
    const running = local.timer.runningSince !== null
    if (running) {
      pauseLocalTimer()
      pausedByHide = true
      emit()
    }
    if ((running || dirtyNow()) && conflict === null) void requestSave()
  }

  // ─── 컨트롤러 ───────────────────────────────────────────

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },

    getSnapshot: () => snapshot,

    activate() {
      if (active) return
      active = true
      bumpEpoch()
      void loadActive()
    },

    deactivate() {
      if (!active) return
      active = false
      bumpEpoch()
      if (checkpointHandle !== null) {
        scheduler.clearInterval(checkpointHandle)
        checkpointHandle = null
      }
    },

    complete(options = {}) {
      const block = blocked()
      if (block) return block
      const result = completeSet(sessionState()!, now(), options)
      if (result.ok) applyInput(result.input)
      return result
    },

    undo(position) {
      const block = blocked()
      if (block) return block
      const result = undoCompletedSet(sessionState()!, position)
      if (result.ok) applyInput(result.input)
      return result
    },

    move(target) {
      const block = blocked()
      if (block) return block
      const result = moveCursor(sessionState()!, target)
      if (result.ok) applyInput(result.input)
      return result
    },

    startTimer() {
      const block = blocked(true)
      if (block) return block
      const result = buildTimerInput(sessionState()!, 'start', now())
      if (result.ok) {
        pausedByHide = false
        applyInput(result.input)
      }
      return result
    },

    pauseTimer() {
      const block = blocked()
      if (block) return block
      const result = buildTimerInput(sessionState()!, 'pause', now())
      if (result.ok) applyInput(result.input)
      return result
    },

    async retry() {
      if (conflict !== null || failure === 'invalidProgress') return
      if (load.status !== 'ready') return
      await requestSave(true)
    },

    async reloadLatest(confirmed = false) {
      if (load.status === 'ready' && dirtyNow() && !confirmed) {
        return { ok: false, reason: 'confirmRequired' }
      }
      if (!active) return { ok: false }
      if (checkpointHandle !== null) {
        scheduler.clearInterval(checkpointHandle)
        checkpointHandle = null
      }
      // 진행 중인 저장 응답은 무시한다(세대를 올려 지난 응답을 버린다).
      bumpEpoch()
      await loadActive()
      return { ok: true }
    },

    async abandon() {
      if (load.status !== 'ready' || !meta || !repository) {
        return { ok: false, reason: 'notReady' }
      }
      if (conflict !== null) return { ok: false, reason: 'conflict' }
      const e = epoch
      // 진행 중인 저장이 있으면 끝난 뒤의 revision으로 요청한다(내 저장과 어긋나 스스로 충돌하지 않게).
      while (busy) await flushing
      if (!isCurrent(e) || !meta || conflict !== null) {
        return { ok: false, reason: 'conflict' }
      }
      try {
        await repository.abandon(meta.id, { expectedRevision: revision })
      } catch (error) {
        if (!isCurrent(e)) return { ok: false, reason: 'failed' }
        const kind = classifySessionFailure(error)
        if (kind === 'revisionMismatch') {
          conflict = 'changed'
          pauseLocalTimer()
          emit()
          return { ok: false, reason: 'conflict' }
        }
        if (kind === 'sessionEnded') {
          conflict = 'ended'
          pauseLocalTimer()
          emit()
          return { ok: false, reason: 'conflict' }
        }
        if (kind === 'notFound') {
          conflict = 'gone'
          pauseLocalTimer()
          emit()
          return { ok: false, reason: 'conflict' }
        }
        return { ok: false, reason: 'failed', failure: kind }
      }
      if (!isCurrent(e)) return { ok: true }
      resetState()
      load = { status: 'none' }
      emit()
      return { ok: true }
    },

    async syncOnReturn() {
      const e = epoch
      if (!repository || load.status !== 'ready' || !meta || !stored || !local)
        return
      if (busy || dirtyNow() || conflict !== null || failure !== null) return
      let current: WorkoutSession | null
      try {
        current = await repository.get(meta.id)
      } catch {
        return // 확인하지 못해도 화면의 상태를 바꾸지 않는다(다음 저장이 충돌을 판별한다)
      }
      // 읽는 사이에 변경·저장이 생겼다면 덮어쓰지 않는다.
      if (!isCurrent(e) || busy || dirtyNow() || conflict !== null || !meta)
        return
      if (current === null) {
        conflict = 'gone'
        pauseLocalTimer()
        emit()
        return
      }
      if (current.status !== 'in_progress') {
        conflict = 'ended'
        pauseLocalTimer()
        emit()
        return
      }
      if (current.revision === revision) return
      // 다른 곳에서 바뀌었고 이 화면에는 미저장 변경이 없다: 최신 상태를 반영한다(타이머는 정지 상태로 복원, 자동 재개 없음).
      const { session: restored } = restoreSession(current)
      meta = {
        id: current.id,
        listSnapshot: current.listSnapshot,
        status: current.status,
        lastSavedAt: current.lastSavedAt,
      }
      revision = current.revision
      stored = progressOf(current)
      local = progressOf(restored)
      restorePending = dirtyNow()
      emit()
      if (restorePending) void requestSave()
    },

    async prepareLeave() {
      if (load.status !== 'ready' || !local || !stored)
        return { action: 'allow' }
      if (conflict === null && local.timer.runningSince !== null) {
        pauseLocalTimer()
        emit()
      }
      if (conflict === null && failure !== 'invalidProgress') {
        await requestSave(failure !== null)
      }
      const localDone = local ? countCompletedSets(local.performed) : 0
      const savedDone = stored ? countCompletedSets(stored.performed) : 0
      if (!dirtyNow()) return { action: 'allow' }
      return {
        action: 'confirmLoss',
        unsavedCompletedSets: Math.max(0, localDone - savedDone),
      }
    },

    onHidden: pauseAndSave,

    // pagehide의 저장은 끝까지 실행되지 않을 수 있다. 일시정지와 저장 시도만 하고, 실패·중단은 마지막 저장 시각까지만 인정하는 복원 규칙에 맡긴다.
    onPageHide: pauseAndSave,

    idle: async () => {
      while (busy) await flushing
    },
  }
}
