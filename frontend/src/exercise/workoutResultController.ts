import { sameProgress, type Progress } from './workoutProgress.ts'
import type {
  WorkoutRecordRepository,
  WorkoutSessionRepository,
} from './workoutRepositories.ts'
import {
  applyResultEdit,
  cancelResultEdits,
  createResultDraft,
  findRecordMismatch,
  hasResultChanges,
  prepareResultSave,
  resultScreenType,
  summarizeResult,
  type ResultDraft,
  type ResultEdit,
  type ResultEditResult,
  type ResultScreenType,
  type ResultSummary,
  type SaveIssue,
} from './workoutResult.ts'
import {
  classifySessionFailure,
  type SessionFailure,
  type SessionSnapshot,
} from './workoutSessionController.ts'
import type {
  SessionProgressInput,
  WorkoutRecord,
  WorkoutSession,
} from './workoutTypes.ts'

/**
 * 운동 결과(W15·W15-1) 최종 저장 컨트롤러(React와 무관). 순수 로직(workoutResult)과 세션·기록 저장소를 연결한다.
 * 화면(S3)은 이 컨트롤러의 snapshot을 구독하고 edit·submit만 부른다. 저장소·시계를 주입받아 노드에서 시나리오를 시험할 수 있다.
 *
 * 책임 분리: W14 컨트롤러(workoutSessionController)는 진행 중 값의 저장 대기열을 맡고, 이 컨트롤러는 "최종 저장 한 번"만 맡는다.
 * 두 컨트롤러가 동시에 같은 세션에 쓰지 않도록 W14의 저장 상태(w14)를 확인하는 계약을 둔다(W14를 바꾸지 않는다).
 *
 * 불러오기
 * - sessionId가 있으면 그 세션만 get으로 읽는다. 없음·다른 계정이면 notFound이고 다른 진행 중 세션으로 대체하지 않는다(올바르지 않은 id는 invalidSessionId).
 * - sessionId가 없을 때만 getActive를 쓴다. 완료된 세션이면 기록을 확인해 보여 주고(저장 불가), 중단·취소된 세션은 ended다.
 *
 * 최종 저장 순서(submit)
 *   검증(prepareResultSave) → [변경이 있으면] saveProgress → 저장된 revision 확보 → complete(그 revision) → 기록 확인 → success.
 * - 변경이 없으면 saveProgress를 부르지 않는다. 이전 revision으로 complete를 부르지 않는다.
 * - 기록이 내 요청(요약)과 같은지 확인되기 전에는 success가 아니다. complete의 멱등 응답(이미 완료됨)도 같은 확인을 거친다.
 * - 연타·동시 호출은 하나의 실행을 공유한다(single-flight). 성공 뒤에는 저장소를 다시 부르지 않는다.
 *
 * 실패·불확실한 결과
 * - 응답을 알 수 없는 실패(네트워크·저장소 오류)와 revisionMismatch 등은 "불확실"로 표시하고, 다음 시도 전에 반드시 세션을 다시 읽어 판별한다.
 *   저장된 진행 값이 내가 보낸 값과 같으면(applied) 저장을 반복하지 않고 그 revision으로 complete만 한다. 원래 값 그대로면(unchanged) 다시 저장한다.
 *   그 밖의 값이면 다른 곳에서 바뀐 것이므로 충돌(changed)이다. 자동 병합·덮어쓰기는 하지 않으며 사용자의 편집값(draft)도 지우지 않는다.
 *   편집값이 저장된 것이 확인된 뒤(progressSaved)에는 저장된 값이 내 값과 달라지면 다시 저장하지 않고 충돌로 둔다.
 * - 이미 완료된 세션을 만나면 기록을 읽어 내 요청과 같을 때만 성공이다. 다르면 충돌(ended + recordMismatch)이다.
 * - 저장 요청이 한 번이라도 나가면 편집을 잠근다(editLocked). 요청 값과 화면 값이 어긋나지 않게 하기 위해서다. 최신 상태 불러오기(reloadLatest)로만 풀린다.
 *
 * 격리: 비활성화(deactivate)·최신 상태 불러오기마다 세대(epoch)가 올라가 지난 비동기 응답은 모두 버려진다. 계정·세션이 바뀌면 화면이 새 컨트롤러를 만든다.
 * ownerId를 주면 다른 계정의 세션·기록은 저장소가 걸러내지 못해도 "없음"으로 취급한다(이중 방어).
 */

// ─── 타입 ──────────────────────────────────────────────────

/** 저장 단계 상태. fatalError는 다시 시도해도 같은 실패(저장소가 값을 거부)다. */
export type ResultPhase =
  | 'idle'
  | 'validating'
  | 'savingProgress'
  | 'completing'
  | 'success'
  | 'retryableError'
  | 'fatalError'
  | 'conflict'
  | 'unavailable'

export type ResultStage = 'savingProgress' | 'completing'

export type ResultLoad =
  | { status: 'loading' }
  /** 저장소가 없거나(운영 빌드·계정 없음) 이 브라우저에서 쓸 수 없다. */
  | { status: 'unavailable' }
  /** sessionId 형식이 올바르지 않다(저장소를 부르지 않았다). */
  | { status: 'invalidSessionId' }
  /** sessionId의 세션이 없거나 다른 계정의 것이다(둘을 구분하지 않는다). */
  | { status: 'notFound' }
  /** sessionId 없이 열었고 진행 중인 세션이 없다. */
  | { status: 'none' }
  | { status: 'corrupt' }
  | { status: 'error'; reason: 'quota' | 'blocked' | 'error' }
  /** 이미 완료된 세션. 기록을 확인했다(record). 편집·저장은 없다. */
  | { status: 'completed' }
  /** 기록 없이 끝난 세션(중단·취소). */
  | { status: 'ended' }
  | { status: 'ready' }

/** 충돌의 종류(W14와 같은 구분). recordMismatch: 완료된 세션의 기록이 내 요청과 다르다. */
export interface ResultConflict {
  kind: 'changed' | 'ended' | 'gone'
  recordMismatch: boolean
}

/** 최종 저장을 시작할 수 없는 이유(W14 저장 상태·타이머). 화면이 먼저 해결해야 한다. */
export type SubmitBlockReason =
  'timerRunning' | 'w14Saving' | 'w14Unsaved' | 'w14SaveFailed' | 'w14Conflict'

/** W14의 저장 상태. W15 최종 저장이 시작되려면 모두 해소되어 있어야 한다. */
export interface W14SaveState {
  saving: boolean
  /** 화면 값이 마지막으로 저장된 값과 다르다(미저장 변경·타이머 복원 저장 대기 포함). */
  dirty: boolean
  failed: boolean
  /** 해소되지 않은 revision 충돌 */
  conflict: boolean
  timerRunning: boolean
}

/** W14 컨트롤러의 snapshot을 W14SaveState로 바꾼다(S3가 w14 getter를 만들 때 쓴다). */
export function w14StateOf(
  snapshot: Pick<
    SessionSnapshot,
    'save' | 'conflict' | 'timerRunning' | 'restorePending'
  >,
): W14SaveState {
  return {
    saving: snapshot.save.saving,
    dirty: snapshot.save.dirty || snapshot.restorePending,
    failed: snapshot.save.failed,
    conflict: snapshot.conflict !== null,
    timerRunning: snapshot.timerRunning,
  }
}

/** W14 저장 상태에서 최종 저장을 막는 이유(없으면 null). null이면 W14가 살아 있지 않은 것이라 저장된 세션 값만 본다. */
export function assessW14Gate(
  state: W14SaveState | null,
): SubmitBlockReason | null {
  if (state === null) return null
  if (state.timerRunning) return 'timerRunning'
  if (state.conflict) return 'w14Conflict'
  if (state.failed) return 'w14SaveFailed'
  if (state.saving) return 'w14Saving'
  if (state.dirty) return 'w14Unsaved'
  return null
}

export interface ResultSnapshot {
  load: ResultLoad
  sessionId: string | null
  /** 저장소에서 마지막으로 확인한 세션. */
  session: WorkoutSession | null
  /** 편집 초안. ready일 때만 있다. 충돌·실패가 나도 지우지 않는다. */
  draft: ResultDraft | null
  /** 화면에 보이는 결과(초안 기준). */
  summary: ResultSummary | null
  screenType: ResultScreenType | null
  hasChanges: boolean
  /** 저장 요청이 나간 뒤에는 편집할 수 없다(reloadLatest로 풀린다). */
  editLocked: boolean
  phase: ResultPhase
  /** 진행 중이거나 실패한 저장 단계. */
  stage: ResultStage | null
  /** 편집값이 저장소에 반영된 것이 확인됐다(complete만 남았다). */
  progressSaved: boolean
  retryable: boolean
  failure: SessionFailure | null
  /** 사용자에게 보여 줄 안내 문구. */
  message: string | null
  /** 검증 실패 사유(prepareResultSave). */
  issues: readonly SaveIssue[]
  conflict: ResultConflict | null
  /** 최종 저장을 막는 이유(마지막 emit 시점 기준. submit이 다시 확인한다). */
  block: SubmitBlockReason | null
  /** 확인된 완료 기록. 이 컨트롤러가 저장했거나 이미 완료된 세션의 기록이다. */
  record: WorkoutRecord | null
  /** 이미 완료된 세션을 열었다(저장한 것이 아니다). */
  alreadyCompleted: boolean
  /** 완료 기록이 확인되어 최종 저장이 끝났다. 이때만 완료 화면으로 이동해도 된다. */
  saved: boolean
  /** 지금 최종 저장을 시작할 수 있다. */
  canSubmit: boolean
}

export type SubmitResult =
  | { ok: true; record: WorkoutRecord }
  | { ok: false; reason: 'notReady' }
  /** 비활성화된 컨트롤러다(응답을 버렸다). 새 컨트롤러가 저장소를 다시 읽어 판별한다. */
  | { ok: false; reason: 'inactive' }
  | { ok: false; reason: 'blocked'; block: SubmitBlockReason }
  | { ok: false; reason: 'invalid'; issues: readonly SaveIssue[] }
  | { ok: false; reason: 'conflict'; conflict: ResultConflict }
  | {
      ok: false
      reason: 'failed'
      stage: ResultStage
      failure: SessionFailure
      retryable: boolean
    }

export type ResultReloadResult =
  { ok: true } | { ok: false; reason: 'confirmRequired' | 'inactive' }

export type ResultEditOutcome =
  ResultEditResult | { ok: false; reason: 'notReady' | 'locked' }

export interface ResultControllerDeps {
  /** null이면 저장소가 없는 환경(운영 빌드)이다. */
  repository: Pick<
    WorkoutSessionRepository,
    'get' | 'getActive' | 'saveProgress' | 'complete'
  > | null
  records: Pick<WorkoutRecordRepository, 'getBySession'> | null
  /** URL의 session 값. 없으면 null(진행 중 세션을 읽는다). 빈 문자열 등 올바르지 않은 값은 오류이며 대체하지 않는다. */
  sessionId: string | null
  /** 계정 id. 주면 다른 계정의 세션·기록을 없음으로 취급한다. */
  ownerId?: string
  /** W14의 현재 저장 상태. W14가 살아 있지 않으면 null을 돌려준다. */
  w14?: () => W14SaveState | null
  now?: () => Date
}

export interface WorkoutResultController {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => ResultSnapshot
  activate: () => void
  deactivate: () => void
  edit: (edit: ResultEdit) => ResultEditOutcome
  /** 편집 취소: 원래 상태로 복원한다. */
  cancelEdits: () => ResultEditOutcome
  /** 최종 저장. 연타·동시 호출은 하나의 실행을 공유한다. 실패 뒤 다시 호출하면 재시도다. */
  submit: () => Promise<SubmitResult>
  /** 최종 저장 상태를 W14 등 외부 상태 변화에 맞춰 다시 계산한다(block 갱신). */
  refreshGate: () => void
  /** 저장소의 최신 상태를 다시 불러온다. 편집값이 있으면 confirmed가 true여야 한다(편집값은 버려진다). */
  reloadLatest: (confirmed?: boolean) => Promise<ResultReloadResult>
  /** 진행 중인 실행이 끝날 때까지 기다린다(테스트용). */
  idle: () => Promise<void>
}

const isUsableSessionId = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 200 &&
  value === value.trim()

// ─── 안내 문구 ─────────────────────────────────────────────

const FAILURE_TEXT: Partial<Record<SessionFailure, string>> = {
  quota: '저장 공간이 부족해요.',
  unavailable: '이 브라우저에서는 저장할 수 없어요.',
  blocked:
    '다른 탭이 저장소를 사용 중이에요. 다른 탭을 닫고 다시 시도해 주세요.',
}

function failureMessage(
  stage: ResultStage,
  failure: SessionFailure,
  progressSaved: boolean,
): string {
  const lead =
    stage === 'completing' && progressSaved
      ? '수정한 값은 저장됐지만 운동 기록을 완료하지 못했어요.'
      : stage === 'completing'
        ? '운동 기록을 저장하지 못했어요.'
        : '수정한 결과를 저장하지 못했어요.'
  if (failure === 'invalidProgress') {
    return `${lead} 저장소가 이 값을 받지 않았어요. 결과를 다시 불러와 주세요.`
  }
  const detail = FAILURE_TEXT[failure]
  return detail ? `${lead} ${detail}` : `${lead} 잠시 후 다시 시도해 주세요.`
}

function conflictMessage(conflict: ResultConflict): string {
  if (conflict.kind === 'gone') return '이 운동을 찾을 수 없어요.'
  if (conflict.kind === 'ended') {
    return conflict.recordMismatch
      ? '이미 저장된 운동 기록이 지금 보는 결과와 달라요. 저장된 기록을 확인해 주세요.'
      : '이 운동은 이미 끝났어요.'
  }
  return '다른 곳에서 이 운동이 바뀌었어요. 최신 내용을 불러온 뒤 다시 확인해 주세요.'
}

const BLOCK_TEXT: Record<SubmitBlockReason, string> = {
  timerRunning: '타이머가 아직 측정 중이에요. 타이머를 멈춘 뒤 저장해 주세요.',
  w14Saving: '운동 진행 내용을 저장하는 중이에요. 잠시 후 다시 시도해 주세요.',
  w14Unsaved: '운동 진행 내용이 아직 저장되지 않았어요.',
  w14SaveFailed:
    '운동 진행 내용 저장이 실패한 상태예요. 먼저 다시 저장해 주세요.',
  w14Conflict: '다른 곳에서 운동이 바뀌어 진행 내용이 맞지 않아요.',
}

// ─── 컨트롤러 ──────────────────────────────────────────────

/** 한 번의 최종 저장 시도가 확정한 계획. 편집이 잠긴 동안 바뀌지 않는다. */
interface Plan {
  input: SessionProgressInput
  summary: ResultSummary
  changed: boolean
  /** 시작 시점에 저장돼 있던 진행 값(저장 전 값). */
  base: Progress
}

type Step =
  | { next: 'proceed' }
  | { next: 'retry' }
  | { next: 'done'; result: SubmitResult }

const progressOfSession = (
  value: Pick<WorkoutSession, 'cursor' | 'performed' | 'timer'>,
): Progress => ({
  cursor: value.cursor,
  performed: value.performed,
  timer: value.timer,
})

const MAX_ATTEMPTS = 4

export function createWorkoutResultController(
  deps: ResultControllerDeps,
): WorkoutResultController {
  const now = deps.now ?? (() => new Date())
  const { repository, records } = deps

  let active = false
  /** 활성화·비활성화·재불러오기마다 올라간다. 지난 세대의 비동기 응답을 무시한다. */
  let epoch = 0
  const isCurrent = (e: number): boolean => active && epoch === e

  let load: ResultLoad = { status: 'loading' }
  let session: WorkoutSession | null = null
  /** 마지막으로 확인한 저장소 revision. */
  let revision = 0
  let draft: ResultDraft | null = null
  let phase: ResultPhase = 'idle'
  let stage: ResultStage | null = null
  let progressSaved = false
  /** 마지막 요청의 결과를 알 수 없다. 다음 시도 전에 저장소를 다시 읽어 판별한다. */
  let uncertain = false
  let failure: SessionFailure | null = null
  let retryable = false
  let message: string | null = null
  let issues: readonly SaveIssue[] = []
  let conflict: ResultConflict | null = null
  let record: WorkoutRecord | null = null
  let alreadyCompleted = false
  let plan: Plan | null = null
  let inflight: Promise<SubmitResult> | null = null

  const listeners = new Set<() => void>()

  const gate = (): SubmitBlockReason | null => {
    if (session && session.timer.runningSince !== null) return 'timerRunning'
    return assessW14Gate(deps.w14?.() ?? null)
  }

  function buildSnapshot(): ResultSnapshot {
    const ready = load.status === 'ready' && session !== null && draft !== null
    const summary =
      ready && session && draft
        ? summarizeResult(session.listSnapshot, draft.performed)
        : null
    const block = ready ? gate() : null
    const busy =
      phase === 'validating' ||
      phase === 'savingProgress' ||
      phase === 'completing'
    return {
      load,
      sessionId: session?.id ?? null,
      session,
      draft: ready ? draft : null,
      summary,
      screenType:
        ready && session ? resultScreenType(session.listSnapshot) : null,
      hasChanges: ready && draft ? hasResultChanges(draft) : false,
      editLocked: plan !== null || busy || phase === 'success',
      phase,
      stage,
      progressSaved,
      retryable,
      failure,
      message,
      issues,
      conflict,
      block,
      record,
      alreadyCompleted,
      saved: record !== null && (phase === 'success' || alreadyCompleted),
      canSubmit:
        ready &&
        conflict === null &&
        !busy &&
        phase !== 'success' &&
        phase !== 'fatalError' &&
        block === null &&
        summary !== null &&
        !summary.noneCompleted,
    }
  }

  let snapshot: ResultSnapshot = buildSnapshot()

  function emit(): void {
    snapshot = buildSnapshot()
    for (const listener of [...listeners]) listener()
  }

  function bumpEpoch(): void {
    epoch += 1
    inflight = null
  }

  function resetState(): void {
    session = null
    revision = 0
    draft = null
    phase = 'idle'
    stage = null
    progressSaved = false
    uncertain = false
    failure = null
    retryable = false
    message = null
    issues = []
    conflict = null
    record = null
    alreadyCompleted = false
    plan = null
  }

  /** 다른 계정의 세션은 저장소가 걸러내지 못해도 없음으로 취급한다. */
  const foreign = (value: { ownerId: string }): boolean =>
    deps.ownerId !== undefined && value.ownerId !== deps.ownerId

  // ─── 불러오기 ───────────────────────────────────────────

  function loadFailure(error: unknown): ResultLoad {
    const kind = classifySessionFailure(error)
    if (kind === 'corrupt') return { status: 'corrupt' }
    if (kind === 'unavailable') return { status: 'unavailable' }
    return {
      status: 'error',
      reason: kind === 'quota' || kind === 'blocked' ? kind : 'error',
    }
  }

  async function loadSession(): Promise<void> {
    const e = epoch
    resetState()
    if (!repository || !records) {
      load = { status: 'unavailable' }
      phase = 'unavailable'
      emit()
      return
    }
    const requested = deps.sessionId
    if (requested !== null && !isUsableSessionId(requested)) {
      // 올바르지 않은 id를 다른 진행 중 세션으로 바꾸지 않는다. 저장소도 부르지 않는다.
      load = { status: 'invalidSessionId' }
      emit()
      return
    }
    load = { status: 'loading' }
    emit()
    let found: WorkoutSession | null
    try {
      found =
        requested !== null
          ? await repository.get(requested)
          : await repository.getActive()
    } catch (error) {
      if (!isCurrent(e)) return
      load = loadFailure(error)
      if (load.status === 'unavailable') phase = 'unavailable'
      emit()
      return
    }
    if (!isCurrent(e)) return
    if (
      !found ||
      foreign(found) ||
      (requested !== null && found.id !== requested)
    ) {
      load = requested !== null ? { status: 'notFound' } : { status: 'none' }
      emit()
      return
    }
    if (found.status === 'completed') {
      let saved: WorkoutRecord | null
      try {
        saved = await records.getBySession(found.id)
      } catch (error) {
        if (!isCurrent(e)) return
        load = loadFailure(error)
        if (load.status === 'unavailable') phase = 'unavailable'
        emit()
        return
      }
      if (!isCurrent(e)) return
      if (
        !saved ||
        foreign(saved) ||
        saved.sessionId !== found.id ||
        saved.id !== found.recordId
      ) {
        load = { status: 'corrupt' }
        emit()
        return
      }
      session = found
      revision = found.revision
      record = saved
      alreadyCompleted = true
      load = { status: 'completed' }
      emit()
      return
    }
    if (found.status !== 'in_progress') {
      session = found
      revision = found.revision
      load = { status: 'ended' }
      emit()
      return
    }
    const created = createResultDraft(found)
    if (!created.ok) {
      load = { status: 'corrupt' }
      emit()
      return
    }
    session = found
    revision = found.revision
    draft = created.draft
    load = { status: 'ready' }
    emit()
  }

  // ─── 최종 저장 ──────────────────────────────────────────

  function setConflict(next: ResultConflict): SubmitResult {
    conflict = next
    phase = 'conflict'
    failure = null
    retryable = false
    message = conflictMessage(next)
    emit()
    return { ok: false, reason: 'conflict', conflict: next }
  }

  function fail(error: unknown, at: ResultStage): SubmitResult {
    const kind = classifySessionFailure(error)
    const fatal = kind === 'invalidProgress'
    failure = kind
    stage = at
    retryable = !fatal
    phase = fatal ? 'fatalError' : 'retryableError'
    message = failureMessage(at, kind, progressSaved)
    emit()
    return { ok: false, reason: 'failed', stage: at, failure: kind, retryable }
  }

  /** 기록이 내 요청과 같고 세션과 연결되어 있으면 성공으로 확정한다. 아니면 충돌이다. */
  function confirmRecord(
    completed: WorkoutSession,
    saved: WorkoutRecord,
    current: Plan,
  ): SubmitResult {
    const consistent =
      completed.status === 'completed' &&
      completed.id === session?.id &&
      saved.sessionId === completed.id &&
      saved.id === completed.recordId &&
      !foreign(completed) &&
      !foreign(saved) &&
      findRecordMismatch(saved, current.summary) === null
    if (!consistent) {
      session = completed
      revision = completed.revision
      uncertain = false
      return setConflict({ kind: 'ended', recordMismatch: true })
    }
    session = completed
    revision = completed.revision
    record = saved
    uncertain = false
    progressSaved = true
    failure = null
    retryable = false
    stage = null
    issues = []
    message = null
    phase = 'success'
    emit()
    return { ok: true, record: saved }
  }

  /**
   * 결과를 알 수 없는 상태에서 저장소를 다시 읽어 판별한다. 읽기에 실패하면 불확실한 채로 실패를 돌려준다.
   * - 완료됨: 기록이 내 요청과 같을 때만 성공.
   * - 진행 중이고 저장된 값이 내 값과 같음(applied): 저장을 반복하지 않고 그 revision으로 이어 간다.
   * - 진행 중이고 원래 값 그대로(unchanged): 편집값이 아직 저장되지 않았다. 확인된 저장이 없을 때만 다시 저장한다.
   * - 그 밖: 다른 곳에서 바뀌었다(changed). 병합하지 않는다.
   */
  async function reconcile(current: Plan, e: number): Promise<Step> {
    const at: ResultStage = stage ?? 'savingProgress'
    let latest: WorkoutSession | null
    try {
      latest = await repository!.get(session!.id)
    } catch (error) {
      if (!isCurrent(e)) return { next: 'done', result: inactive() }
      return { next: 'done', result: fail(error, at) }
    }
    if (!isCurrent(e)) return { next: 'done', result: inactive() }
    if (latest === null || foreign(latest)) {
      return {
        next: 'done',
        result: setConflict({ kind: 'gone', recordMismatch: false }),
      }
    }
    if (latest.status === 'completed') {
      let saved: WorkoutRecord | null
      try {
        saved = await records!.getBySession(latest.id)
      } catch (error) {
        if (!isCurrent(e)) return { next: 'done', result: inactive() }
        return { next: 'done', result: fail(error, at) }
      }
      if (!isCurrent(e)) return { next: 'done', result: inactive() }
      if (!saved) {
        return { next: 'done', result: fail(new Error('missing record'), at) }
      }
      return { next: 'done', result: confirmRecord(latest, saved, current) }
    }
    if (latest.status !== 'in_progress') {
      session = latest
      revision = latest.revision
      return {
        next: 'done',
        result: setConflict({ kind: 'ended', recordMismatch: false }),
      }
    }
    const stored = progressOfSession(latest)
    if (sameProgress(stored, progressOfSession(current.input))) {
      session = latest
      revision = latest.revision
      progressSaved = current.changed
      uncertain = false
      return { next: 'proceed' }
    }
    if (!progressSaved && sameProgress(stored, current.base)) {
      session = latest
      revision = latest.revision
      uncertain = false
      return { next: 'proceed' }
    }
    session = latest
    revision = latest.revision
    return {
      next: 'done',
      result: setConflict({ kind: 'changed', recordMismatch: false }),
    }
  }

  function inactive(): SubmitResult {
    return { ok: false, reason: 'inactive' }
  }

  /** 저장소 오류 중 "상태를 다시 읽어 봐야 하는" 것(다른 곳에서 바뀌었거나 끝났을 가능성). */
  const needsReread = (kind: SessionFailure): boolean =>
    kind === 'revisionMismatch' ||
    kind === 'sessionEnded' ||
    kind === 'notFound'

  async function saveStep(current: Plan, e: number): Promise<Step> {
    stage = 'savingProgress'
    phase = 'savingProgress'
    failure = null
    message = null
    emit()
    uncertain = true // 요청이 나가면 반영 여부를 응답으로 확인하기 전까지 불확실하다.
    try {
      const next = await repository!.saveProgress(session!.id, {
        ...current.input,
        expectedRevision: revision,
      })
      if (!isCurrent(e)) return { next: 'done', result: inactive() }
      if (
        !sameProgress(progressOfSession(next), progressOfSession(current.input))
      ) {
        // 저장소가 돌려준 값이 내가 보낸 값과 다르다: 확인되지 않은 저장을 성공으로 보지 않는다.
        session = next
        revision = next.revision
        uncertain = false
        return {
          next: 'done',
          result: setConflict({ kind: 'changed', recordMismatch: false }),
        }
      }
      session = next
      revision = next.revision
      progressSaved = true
      uncertain = false
      return { next: 'proceed' }
    } catch (error) {
      if (!isCurrent(e)) return { next: 'done', result: inactive() }
      if (needsReread(classifySessionFailure(error))) return { next: 'retry' }
      return { next: 'done', result: fail(error, 'savingProgress') }
    }
  }

  async function completeStep(current: Plan, e: number): Promise<Step> {
    stage = 'completing'
    phase = 'completing'
    failure = null
    message = null
    emit()
    uncertain = true
    try {
      const result = await repository!.complete(session!.id, {
        expectedRevision: revision,
      })
      if (!isCurrent(e)) return { next: 'done', result: inactive() }
      return {
        next: 'done',
        result: confirmRecord(result.session, result.record, current),
      }
    } catch (error) {
      if (!isCurrent(e)) return { next: 'done', result: inactive() }
      const kind = classifySessionFailure(error)
      // 저장소가 완료할 세트가 없다고 거부(validation)한 것은 저장된 값이 내가 아는 값과 다르다는 뜻이다. 다시 읽어 판별한다.
      if (needsReread(kind) || kind === 'invalidProgress') {
        return { next: 'retry' }
      }
      return { next: 'done', result: fail(error, 'completing') }
    }
  }

  async function run(e: number): Promise<SubmitResult> {
    if (load.status !== 'ready' || !session || !draft) {
      return { ok: false, reason: 'notReady' }
    }
    if (conflict !== null) {
      return { ok: false, reason: 'conflict', conflict }
    }
    if (phase === 'fatalError' && failure !== null && stage !== null) {
      return {
        ok: false,
        reason: 'failed',
        stage,
        failure,
        retryable: false,
      }
    }
    const block = gate()
    if (block !== null) {
      issues = []
      message = BLOCK_TEXT[block]
      emit()
      return { ok: false, reason: 'blocked', block }
    }
    if (plan === null) {
      phase = 'validating'
      issues = []
      message = null
      emit()
      const check = prepareResultSave(session, draft, now())
      if (!check.ok) {
        issues = check.issues
        phase = 'idle'
        message = check.issues[0]?.message ?? null
        emit()
        return { ok: false, reason: 'invalid', issues: check.issues }
      }
      plan = {
        input: check.input,
        summary: check.summary,
        changed: check.changed,
        base: progressOfSession(session),
      }
      emit()
    }
    const current = plan
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (uncertain) {
        const step = await reconcile(current, e)
        if (step.next === 'done') return step.result
      }
      if (current.changed && !progressSaved) {
        const step = await saveStep(current, e)
        if (step.next === 'done') return step.result
        if (step.next === 'retry') {
          uncertain = true
          continue
        }
      }
      const step = await completeStep(current, e)
      if (step.next === 'done') return step.result
      uncertain = true
    }
    // 다시 읽어도 안정되지 않으면 다른 곳에서 계속 바뀌는 것이므로 자동으로 맞추지 않는다.
    return setConflict({ kind: 'changed', recordMismatch: false })
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
      void loadSession()
    },

    deactivate() {
      if (!active) return
      active = false
      bumpEpoch()
    },

    edit(e) {
      if (load.status !== 'ready' || !session || !draft) {
        return { ok: false, reason: 'notReady' }
      }
      if (snapshot.editLocked) return { ok: false, reason: 'locked' }
      const result = applyResultEdit(session.listSnapshot, draft, e)
      if (result.ok) {
        draft = result.draft
        issues = []
        message = null
        emit()
      }
      return result
    },

    cancelEdits() {
      if (load.status !== 'ready' || !draft) {
        return { ok: false, reason: 'notReady' }
      }
      if (snapshot.editLocked) return { ok: false, reason: 'locked' }
      draft = cancelResultEdits(draft)
      issues = []
      message = null
      emit()
      return { ok: true, draft }
    },

    submit() {
      if (!active) return Promise.resolve(inactive())
      if (phase === 'success' && record) {
        return Promise.resolve({ ok: true, record })
      }
      // 실행 중이면 같은 실행을 공유한다(연타·동시 호출·재클릭).
      if (inflight) return inflight
      const e = epoch
      const running = run(e).finally(() => {
        if (inflight === running) inflight = null
      })
      inflight = running
      return running
    },

    refreshGate() {
      if (active && load.status === 'ready') emit()
    },

    async reloadLatest(confirmed = false) {
      if (!active) return { ok: false, reason: 'inactive' }
      if (draft && hasResultChanges(draft) && !confirmed) {
        return { ok: false, reason: 'confirmRequired' }
      }
      // 진행 중인 실행의 응답은 버린다(세대를 올린다).
      bumpEpoch()
      await loadSession()
      return { ok: true }
    },

    idle: async () => {
      while (inflight) {
        try {
          await inflight
        } catch {
          // 결과는 submit 호출자가 받는다.
        }
      }
    },
  }
}
