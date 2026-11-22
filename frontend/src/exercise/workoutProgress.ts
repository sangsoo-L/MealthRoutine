import { exerciseGoalMode } from '../exercise-goal/exerciseGoalPolicy.ts'
import type { AssessmentLevelCode } from '../onboarding-assessment/assessmentTypes.ts'
import {
  validateNewCompletedSet,
  type CompletedSetIssue,
} from './completedSetValidation.ts'
import { RECORD_COMPONENTS } from './recordMode.ts'
import {
  MAX_REPS,
  MAX_WEIGHT_KG,
  MIN_REPS,
  MIN_WEIGHT_KG,
  parseReps,
  parseWeightKg,
  type NumberInput,
  type RepsParse,
  type WeightParse,
} from './setInput.ts'
import { formatClock } from './workoutListView.ts'
import {
  MAX_MEASURED_MS,
  abandonStatus,
  countCompletedSets,
  pauseTimer,
  restoreTimer,
  startTimer,
  timerElapsedMs,
  validateProgressInput,
} from './workoutModel.ts'
import type {
  PerformedSet,
  SessionCursor,
  SessionProgressInput,
  SessionTimer,
  WorkoutSession,
} from './workoutTypes.ts'

/**
 * 운동 진행(W14)의 순수 로직. 화면·저장소·시계에 의존하지 않는다(시각은 인자로 받는다).
 *
 * 기존 규칙을 그대로 재사용한다: 세트 값 검증·타이머 계산·복원·진행 저장 입력 검증은 workoutModel.ts, 모양은 workoutTypes.ts다.
 * 여기서 만든 진행 저장 입력(SessionProgressInput)은 항상 validateProgressInput을 통과한 것만 돌려준다.
 * 모델에 없는 필드를 만들지 않으며, 저장소가 세션을 "저장된 그대로" 돌려주는 점(saveProgress는 timer·performed를 정규화하지 않는다)을 전제로 한다.
 *
 * 입력 한계(횟수 1~999, 중량 0~999kg·소수점 첫째 자리)는 화면에서 사용자가 입력하는 값에만 적용한다. 모델 규칙(횟수 1 이상 정수,
 * 중량 0 이상)보다 좁을 뿐 충돌하지 않는다. 입력 없이 목표 값을 그대로 저장할 때는 W02에서 정한 목표를 다시 검증하지 않는다.
 */

// ─── 상수 ──────────────────────────────────────────────────

/** 측정 시간이 목표의 이 배수를 넘으면 세트 완료 전에 확인을 받는다(기기 시계 이상·방치 방지). */
export const OVERRUN_CONFIRM_FACTOR = 5

/** 세션에서 진행 로직이 읽는 값. 테스트에서 일부만 채워 쓸 수 있게 Pick으로 둔다. */
export type SessionState = Pick<
  WorkoutSession,
  | 'listSnapshot'
  | 'performed'
  | 'cursor'
  | 'timer'
  | 'revision'
  | 'status'
  | 'lastSavedAt'
>

/** 저장 대상이 되는 진행 값(cursor·performed·timer). 동일성 비교와 변경 여부 판단에 쓴다. */
export interface Progress {
  cursor: SessionCursor
  performed: readonly (readonly PerformedSet[])[]
  timer: SessionTimer
}

const idleTimer = (): SessionTimer => ({ accumulatedMs: 0, runningSince: null })
const isIdleTimer = (timer: SessionTimer): boolean =>
  timer.accumulatedMs === 0 && timer.runningSince === null

const copyPerformed = (
  performed: readonly (readonly PerformedSet[])[],
): PerformedSet[][] => performed.map((sets) => sets.map((set) => ({ ...set })))

const samePosition = (a: SessionCursor, b: SessionCursor): boolean =>
  a.itemIndex === b.itemIndex && a.setIndex === b.setIndex

// 세트 입력 파서·한계는 setInput.ts에 있다. 기존 import 경로를 유지하려고 다시 내보낸다.
export {
  MAX_REPS,
  MAX_WEIGHT_KG,
  MIN_REPS,
  MIN_WEIGHT_KG,
  parseReps,
  parseWeightKg,
  type NumberInput,
  type RepsParse,
  type WeightParse,
}

// ─── 운동 수준별 입력 방식 ─────────────────────────────────

/** simple: 입력 없이 목표 값을 저장하는 간단 모드, detailed: 실제 횟수·중량을 입력하는 상세 모드. */
export type InputMode = 'simple' | 'detailed'

/**
 * 입력 방식. 초보와 수준을 알 수 없는 경우(결과 없음·조회 실패)는 간단 모드, 중급·고급은 상세 모드다.
 * 운동 목표 화면의 exerciseGoalMode와 같은 규칙을 그대로 쓴다(수준을 알 수 없으면 간단). 모드와 관계없이 실제 값은 고칠 수 있다.
 */
export function inputModeFor(
  level: AssessmentLevelCode | null | undefined,
): InputMode {
  return exerciseGoalMode(level ?? null)
}

// ─── 진행률·위치 ───────────────────────────────────────────

export function countTotalSets(
  performed: readonly (readonly PerformedSet[])[],
): number {
  return performed.reduce((sum, sets) => sum + sets.length, 0)
}

export interface ProgressSummary {
  completedSets: number
  totalSets: number
  /** 0~1. 세트가 없으면 0. */
  ratio: number
  /** 0~100 정수(반올림). */
  percent: number
}

export function progressOf(
  performed: readonly (readonly PerformedSet[])[],
): ProgressSummary {
  const completedSets = countCompletedSets(performed)
  const totalSets = countTotalSets(performed)
  const ratio = totalSets === 0 ? 0 : completedSets / totalSets
  return { completedSets, totalSets, ratio, percent: Math.round(ratio * 100) }
}

/** 운동 하나의 완료 세트 수·전체 세트 수. 없는 운동이면 null. */
export function itemProgress(
  performed: readonly (readonly PerformedSet[])[],
  itemIndex: number,
): { completedSets: number; totalSets: number } | null {
  const sets = performed[itemIndex]
  if (!sets) return null
  return {
    completedSets: sets.filter((set) => set.completed).length,
    totalSets: sets.length,
  }
}

/** 모든 세트를 마쳤는지. 세트가 하나도 없으면 false다. */
export function allSetsCompleted(
  performed: readonly (readonly PerformedSet[])[],
): boolean {
  const total = countTotalSets(performed)
  return total > 0 && countCompletedSets(performed) === total
}

/**
 * from 다음의 미완료 세트(운동 순서 → 세트 순서). wrap이 true이면 끝까지 없을 때 앞쪽의 미완료 세트(건너뛴 세트)를 찾는다.
 * from 자체는 대상이 아니다. 미완료 세트가 없으면 null.
 */
export function findNextIncomplete(
  performed: readonly (readonly PerformedSet[])[],
  from: SessionCursor,
  wrap = true,
): SessionCursor | null {
  const flat: SessionCursor[] = []
  performed.forEach((sets, itemIndex) =>
    sets.forEach((_, setIndex) => flat.push({ itemIndex, setIndex })),
  )
  const start = flat.findIndex((position) => samePosition(position, from))
  const order =
    start < 0
      ? flat
      : wrap
        ? [...flat.slice(start + 1), ...flat.slice(0, start)]
        : flat.slice(start + 1)
  return (
    order.find(
      (position) => !performed[position.itemIndex][position.setIndex].completed,
    ) ?? null
  )
}

/** 처음 미완료 세트. 모두 마쳤으면 null. */
export function firstIncomplete(
  performed: readonly (readonly PerformedSet[])[],
): SessionCursor | null {
  for (let itemIndex = 0; itemIndex < performed.length; itemIndex++) {
    const setIndex = performed[itemIndex].findIndex((set) => !set.completed)
    if (setIndex >= 0) return { itemIndex, setIndex }
  }
  return null
}

// ─── 시간형 타이머 ─────────────────────────────────────────

export type TimerState = 'idle' | 'running' | 'paused'

export interface TimerView {
  state: TimerState
  elapsedMs: number
  targetMs: number
  /** 목표까지 남은 시간(음수가 될 수 있다). */
  remainingMs: number
  /** 목표를 넘은 시간(넘지 않았으면 0). */
  overrunMs: number
  /** 목표에 도달했는지. 도달해도 자동으로 완료하지 않는다. */
  reachedTarget: boolean
  /** 측정 시간이 목표의 5배를 넘어 완료 전 확인이 필요한지. */
  needsOverrunConfirmation: boolean
  /** 목표 대비 경과 비율(0~1). 원형 표시용. */
  fraction: number
}

/** 측정 시간이 목표의 OVERRUN_CONFIRM_FACTOR배를 넘었는지(정확히 5배는 넘지 않은 것). */
export function isOverrunBeyondConfirm(
  targetSeconds: number,
  measuredMs: number,
): boolean {
  return measuredMs > OVERRUN_CONFIRM_FACTOR * targetSeconds * 1000
}

/**
 * 타이머의 화면용 값. 경과는 시각 차이로 계산하므로 백그라운드·스로틀 중에도 어긋나지 않고, 일시정지 시간은 빠진다.
 * 기준 시각이 측정 시작보다 이르면(기기 시계 역행) 음수로 내려가지 않고, 경과는 24시간으로 제한된다.
 */
export function timerView(
  timer: SessionTimer,
  targetSeconds: number,
  now: Date,
): TimerView {
  const elapsedMs = Math.max(0, timerElapsedMs(timer, now))
  const targetMs = targetSeconds * 1000
  const state: TimerState =
    timer.runningSince !== null
      ? 'running'
      : isIdleTimer(timer)
        ? 'idle'
        : 'paused'
  return {
    state,
    elapsedMs,
    targetMs,
    remainingMs: targetMs - elapsedMs,
    overrunMs: Math.max(0, elapsedMs - targetMs),
    reachedTarget: elapsedMs >= targetMs,
    needsOverrunConfirmation: isOverrunBeyondConfirm(targetSeconds, elapsedMs),
    fraction: targetMs <= 0 ? 1 : Math.min(1, elapsedMs / targetMs),
  }
}

/** 카운트다운 표시. 남은 시간은 올림(0:00은 목표 도달 시점), 초과하면 "+m:ss". */
export function timerLabel(view: TimerView): {
  text: string
  overrun: boolean
} {
  if (view.remainingMs > 0) {
    return {
      text: formatClock(Math.ceil(view.remainingMs / 1000)),
      overrun: false,
    }
  }
  if (view.overrunMs > 0) {
    return {
      text: `+${formatClock(Math.floor(view.overrunMs / 1000))}`,
      overrun: true,
    }
  }
  return { text: formatClock(0), overrun: false }
}

/**
 * 새로고침·이탈 뒤 저장된 타이머를 복원한다. 측정 중이었다면 마지막 저장 시각까지만 더하고 정지 상태로 돌려준다.
 * 저장소는 읽을 때 복원하지 않으므로(get·getActive는 저장된 값 그대로, 복원은 complete·abandon만) 화면이 불러온 직후 반드시 이 함수를 적용한다.
 * 저장 시각이 측정 시작보다 이르거나(시계 역행) 올바르지 않으면 측정 중이던 시간을 더하지 않는다. 자동으로 다시 시작하지 않는다.
 */
export function restoreSessionTimer(
  session: Pick<WorkoutSession, 'timer' | 'lastSavedAt'>,
): SessionTimer {
  const { timer, lastSavedAt } = session
  if (timer.runningSince === null) return { ...timer }
  if (!Number.isFinite(Date.parse(lastSavedAt))) {
    return { accumulatedMs: timer.accumulatedMs, runningSince: null }
  }
  return restoreTimer(timer, lastSavedAt)
}

/** 복원한 타이머를 적용한 세션과, 저장된 값이 측정 중이라 복원이 일어났는지. */
export function restoreSession<
  T extends Pick<WorkoutSession, 'timer' | 'lastSavedAt'>,
>(session: T): { session: T; timerRestored: boolean } {
  return {
    session: { ...session, timer: restoreSessionTimer(session) },
    timerRestored: session.timer.runningSince !== null,
  }
}

export type TimerActionFailure = 'sessionEnded' | 'notTimeSet' | 'setCompleted'

export type TimerInputResult =
  | { ok: true; input: SessionProgressInput }
  | { ok: false; reason: TimerActionFailure }

/**
 * 시작·재개(start) 또는 일시정지(pause)의 진행 저장 입력. 현재 세트가 아직 마치지 않은 시간형 세트일 때만 시작할 수 있다.
 * 이미 그 상태이면 같은 값을 돌려준다(멱등). 목표 시간에 도달했는지와 무관하게 시작·재개할 수 있다.
 */
export function buildTimerInput(
  session: SessionState,
  action: 'start' | 'pause',
  now: Date,
): TimerInputResult {
  if (session.status !== 'in_progress')
    return { ok: false, reason: 'sessionEnded' }
  const { itemIndex, setIndex } = session.cursor
  const item = session.listSnapshot.items[itemIndex]
  // 시간을 구성값으로 갖는 방식(time·time_reps·weight_time)만 타이머를 쓴다.
  if (!item || !RECORD_COMPONENTS[item.recordType].time) {
    return { ok: false, reason: 'notTimeSet' }
  }
  if (session.performed[itemIndex]?.[setIndex]?.completed) {
    return { ok: false, reason: 'setCompleted' }
  }
  const timer =
    action === 'start'
      ? startTimer(session.timer, now)
      : pauseTimer(session.timer, now)
  return {
    ok: true,
    input: {
      expectedRevision: session.revision,
      cursor: { ...session.cursor },
      performed: copyPerformed(session.performed),
      timer: { ...timer },
    },
  }
}

// ─── 세트 완료 ─────────────────────────────────────────────

/** 사용자가 직접 입력한 실제 값. 필드를 생략(undefined)하면 목표 값을 쓴다. */
export interface SetEntry {
  /** 횟수형·중량형. 생략하면 목표 횟수, 빈 값(null·'')이면 오류. */
  reps?: NumberInput
  /** 중량형. 생략하면 목표 중량(없을 수 있음), 빈 값(null·'')이면 "중량 미입력". */
  weightKg?: NumberInput
}

export interface CompleteSetOptions {
  /** 완료할 세트. 생략하면 세션의 현재 세트. */
  position?: SessionCursor
  entry?: SetEntry
  /** 측정 시간이 목표의 5배를 넘을 때 사용자가 확인했는지. */
  confirmOverrun?: boolean
  /** 다음 미완료 세트를 앞쪽(건너뛴 세트)까지 찾을지. 기본 true. */
  wrap?: boolean
}

export type CompleteSetFailure =
  | { ok: false; reason: 'sessionEnded' }
  | { ok: false; reason: 'invalidPosition' }
  | { ok: false; reason: 'alreadyCompleted' }
  | { ok: false; reason: 'invalidReps'; detail: 'empty' | 'format' | 'range' }
  | {
      ok: false
      reason: 'invalidWeight'
      detail: 'format' | 'range' | 'decimals'
    }
  /** 측정 시간이 목표의 5배를 넘었다. confirmOverrun으로 다시 호출하면 완료한다(자동 완료하지 않음). */
  | {
      ok: false
      reason: 'needsOverrunConfirmation'
      measuredMs: number
      targetSeconds: number
    }
  /**
   * 신규 완료 정책(A안) 위반: 그 방식의 구성값이 모두 유효하지 않다(미입력·미측정·0 등). validateNewCompletedSet의 문제를 그대로 담는다.
   * 세션·입력값은 바뀌지 않는다. 화면이 누락·오류 항목을 안내한다.
   */
  | {
      ok: false
      reason: 'invalidSet'
      issues: readonly CompletedSetIssue[]
    }
  | { ok: false; reason: 'invalidProgress' }

export interface CompleteSetSuccess {
  ok: true
  /** 완료 상태·커서·타이머 초기화를 한 번에 담은 진행 저장 입력. 재시도할 때도 같은 값을 보낸다(측정 시간은 이미 확정). */
  input: SessionProgressInput
  completed: SessionCursor
  /** 다음 미완료 세트. 모두 마쳤으면 null(커서는 방금 완료한 세트에 남는다). */
  next: SessionCursor | null
  allCompleted: boolean
  /** 확정한 측정 시간. 시간형에서 타이머를 쓰지 않았거나 다른 방식이면 null(미측정). */
  measuredMs: number | null
  /** 입력 없이 목표 값을 실제 값으로 저장했는지(횟수형·중량형). */
  usedTargetValues: boolean
}

export type CompleteSetResult = CompleteSetSuccess | CompleteSetFailure

/**
 * 세트 하나를 완료한다. 입력 값을 검증하고, 완료·다음 세트로 커서 이동·타이머 초기화를 하나의 진행 저장 입력으로 만든다.
 *
 * 방식의 구성값(recordMode.RECORD_COMPONENTS)에 따라 실제 값을 모은다.
 * - 횟수(reps): entry가 없으면 목표 횟수를 실제 값 초기값으로 쓴다. 값이 있으면 1~999 정수를 검증한다.
 * - 중량(weight): entry가 없으면 목표 중량을 쓴다(목표 중량이 없으면 값이 없다). 값이 있으면 0~999kg(소수 첫째 자리)를 검증한다. 비우면 값이 없다.
 * - 시간(time): 실제 경과 시간을 이 호출 시점에 한 번 정해 measuredMs로 저장한다(기존 타이머 재사용). 목표 시간은 실제 시간으로 쓰지 않는다.
 *   타이머를 쓰지 않았으면(대기 상태) 값이 없다. 현재 세트가 아닌 세트를 완료할 때는 타이머를 쓰지 않는다(타이머는 현재 세트의 것이다).
 *
 * 신규 완료 정책(A안): 모은 값을 validateNewCompletedSet으로 확인한다. 구성값이 하나라도 없거나(미입력·미측정) 0이면(횟수 0회·시간 0ms) 완료하지 않고
 * invalidSet을 돌려준다. 이 검증은 지금 완료하는 세트에만 적용한다 — 과거에 완료한 세트를 읽거나 복원하는 경로에서는 호출하지 않는다.
 * 이미 완료한 세트는 거부한다(완료한 세트는 W14에서 읽기 전용, 되돌린 뒤 다시 완료하면 이 정책이 적용된다).
 * 세션은 바꾸지 않는다(새 값을 돌려준다).
 */
export function completeSet(
  session: SessionState,
  now: Date,
  options: CompleteSetOptions = {},
): CompleteSetResult {
  if (session.status !== 'in_progress')
    return { ok: false, reason: 'sessionEnded' }
  const position = options.position ?? session.cursor
  const item = session.listSnapshot.items[position.itemIndex]
  const target = item?.sets[position.setIndex]
  const current = session.performed[position.itemIndex]?.[position.setIndex]
  if (!item || !target || !current)
    return { ok: false, reason: 'invalidPosition' }
  if (current.completed) return { ok: false, reason: 'alreadyCompleted' }

  const parts = RECORD_COMPONENTS[item.recordType]
  const targetValues = target as {
    reps?: number
    weightKg?: number
    targetSeconds?: number
  }
  const entry = options.entry
  let usedTargetValues = false

  // 횟수
  let reps: number | undefined
  if (parts.reps) {
    if (entry?.reps === undefined) {
      reps = targetValues.reps
      usedTargetValues = true
    } else {
      const parsed = parseReps(entry.reps)
      if (!parsed.ok) {
        return { ok: false, reason: 'invalidReps', detail: parsed.reason }
      }
      reps = parsed.value
    }
  }

  // 중량
  let weightKg: number | undefined
  if (parts.weight) {
    if (entry?.weightKg === undefined) {
      weightKg = targetValues.weightKg
      if (!parts.reps) usedTargetValues = true
    } else {
      const parsed = parseWeightKg(entry.weightKg)
      if (!parsed.ok) {
        return { ok: false, reason: 'invalidWeight', detail: parsed.reason }
      }
      weightKg = parsed.value
    }
  }

  // 시간
  let measuredMs: number | null = null
  if (parts.time) {
    const targetSeconds = targetValues.targetSeconds as number
    const timerApplies =
      samePosition(position, session.cursor) && !isIdleTimer(session.timer)
    if (timerApplies) {
      // 실제 측정 시간은 세트를 완료하는 이 순간 한 번만 정한다(재시도에서 다시 계산하지 않는다).
      measuredMs = Math.min(
        MAX_MEASURED_MS,
        Math.max(0, Math.round(timerElapsedMs(session.timer, now))),
      )
      if (
        isOverrunBeyondConfirm(targetSeconds, measuredMs) &&
        !options.confirmOverrun
      ) {
        return {
          ok: false,
          reason: 'needsOverrunConfirmation',
          measuredMs,
          targetSeconds,
        }
      }
    }
  }

  const done: PerformedSet = { completed: true }
  if (reps !== undefined) done.actualReps = reps
  if (weightKg !== undefined) done.actualWeightKg = weightKg
  if (measuredMs !== null) done.measuredMs = measuredMs

  // 신규 완료 정책(A안): 그 방식의 구성값이 모두 유효해야 완료한다.
  const check = validateNewCompletedSet(item.recordType, done)
  if (!check.ok)
    return { ok: false, reason: 'invalidSet', issues: check.issues }

  const performed = copyPerformed(session.performed)
  performed[position.itemIndex][position.setIndex] = done
  const next = findNextIncomplete(performed, position, options.wrap ?? true)
  const input: SessionProgressInput = {
    expectedRevision: session.revision,
    cursor: next ? { ...next } : { ...position },
    performed,
    timer: idleTimer(),
  }
  if (!validateProgressInput(input, session.listSnapshot)) {
    return { ok: false, reason: 'invalidProgress' }
  }
  return {
    ok: true,
    input,
    completed: { ...position },
    next,
    allCompleted: next === null,
    measuredMs,
    usedTargetValues,
  }
}

export type UndoFailure =
  | 'sessionEnded'
  | 'invalidPosition'
  | 'notCompleted'
  /** 다음 세트의 타이머가 이미 쓰이고 있다(시작했거나 시간이 쌓임). 되돌리면 그 측정이 사라지므로 거부한다. */
  | 'timerInUse'
  | 'invalidProgress'

export type UndoResult =
  { ok: true; input: SessionProgressInput } | { ok: false; reason: UndoFailure }

/**
 * 방금 완료한 세트 하나를 되돌린다. 지정한 세트의 완료 상태와 값(횟수·중량·측정 시간)을 지우고 커서를 그 세트로 옮긴다.
 * 입력은 세션 전체 상태(performed 전체)를 기반으로 하며 expectedRevision에 그 세션의 revision을 담는다. 충돌을 무시하거나
 * revision을 올려 쓰지 않으므로, 다른 곳에서 먼저 저장했다면 저장소가 revisionMismatch로 막는다.
 * 모델에는 완료 순서가 없어서 되돌릴 세트는 호출한 화면이 기억하는 "방금 완료한 위치"로 지정한다.
 */
export function undoCompletedSet(
  session: SessionState,
  position: SessionCursor,
): UndoResult {
  if (session.status !== 'in_progress')
    return { ok: false, reason: 'sessionEnded' }
  const current = session.performed[position.itemIndex]?.[position.setIndex]
  if (!current) return { ok: false, reason: 'invalidPosition' }
  if (!current.completed) return { ok: false, reason: 'notCompleted' }
  if (!isIdleTimer(session.timer)) return { ok: false, reason: 'timerInUse' }
  const performed = copyPerformed(session.performed)
  performed[position.itemIndex][position.setIndex] = { completed: false }
  const input: SessionProgressInput = {
    expectedRevision: session.revision,
    cursor: { ...position },
    performed,
    timer: idleTimer(),
  }
  if (!validateProgressInput(input, session.listSnapshot)) {
    return { ok: false, reason: 'invalidProgress' }
  }
  return { ok: true, input }
}

// ─── 운동 이동 ─────────────────────────────────────────────

export type MoveFailure = 'sessionEnded' | 'invalidPosition'

export type MoveResult =
  | {
      ok: true
      input: SessionProgressInput
      /** 이동하면서 아직 완료하지 않은 세트의 측정 시간이 버려지는지(화면이 확인을 받는다). */
      discardsTimer: boolean
    }
  | { ok: false; reason: MoveFailure }

/**
 * 커서를 다른 세트로 옮기는 진행 저장 입력. 완료 여부는 바꾸지 않는다. 타이머는 현재 세트의 것이라 다른 세트로 가면 초기화된다
 * (측정 중이거나 시간이 쌓여 있었다면 discardsTimer가 true).
 */
export function moveCursor(
  session: SessionState,
  target: SessionCursor,
): MoveResult {
  if (session.status !== 'in_progress')
    return { ok: false, reason: 'sessionEnded' }
  if (!session.performed[target.itemIndex]?.[target.setIndex]) {
    return { ok: false, reason: 'invalidPosition' }
  }
  const moving = !samePosition(target, session.cursor)
  const discardsTimer = moving && !isIdleTimer(session.timer)
  return {
    ok: true,
    discardsTimer,
    input: {
      expectedRevision: session.revision,
      cursor: { ...target },
      performed: copyPerformed(session.performed),
      timer: moving ? idleTimer() : { ...session.timer },
    },
  }
}

/**
 * 이전·다음 운동의 이동 위치. 그 운동의 처음 미완료 세트, 모두 마쳤으면 첫 세트다. 처음·끝 운동에서 더 갈 수 없으면 null.
 */
export function adjacentExercise(
  performed: readonly (readonly PerformedSet[])[],
  from: SessionCursor,
  direction: 'previous' | 'next',
): SessionCursor | null {
  const itemIndex = from.itemIndex + (direction === 'next' ? 1 : -1)
  const sets = performed[itemIndex]
  if (!sets || sets.length === 0) return null
  const setIndex = sets.findIndex((set) => !set.completed)
  return { itemIndex, setIndex: setIndex >= 0 ? setIndex : 0 }
}

// ─── 저장 충돌 판별 ────────────────────────────────────────

const orNull = <T>(value: T | undefined): T | null =>
  value === undefined ? null : value

function samePerformedSet(a: PerformedSet, b: PerformedSet): boolean {
  return (
    a.completed === b.completed &&
    orNull(a.actualReps) === orNull(b.actualReps) &&
    orNull(a.actualWeightKg) === orNull(b.actualWeightKg) &&
    orNull(a.measuredMs) === orNull(b.measuredMs)
  )
}

/**
 * 두 진행 값(cursor·performed·timer)이 같은지. revision·저장 시각은 비교하지 않는다.
 * 값이 없는 필드와 undefined인 필드는 같은 것으로 본다(저장소는 정규화하지 않고 값을 그대로 저장한다).
 */
export function sameProgress(a: Progress, b: Progress): boolean {
  if (!samePosition(a.cursor, b.cursor)) return false
  if (
    a.timer.accumulatedMs !== b.timer.accumulatedMs ||
    a.timer.runningSince !== b.timer.runningSince
  ) {
    return false
  }
  if (a.performed.length !== b.performed.length) return false
  return a.performed.every((sets, i) => {
    const other = b.performed[i]
    return (
      sets.length === other.length &&
      sets.every((set, j) => samePerformedSet(set, other[j]))
    )
  })
}

export type RevisionMismatchKind =
  /** 저장된 진행 값이 내가 보낸 값과 같다: 저장은 이미 반영됐고 응답만 유실됐다. 저장된 revision을 받아들이면 된다. */
  | 'alreadyApplied'
  /** 저장된 값이 다르다: 다른 곳에서 먼저 저장한 실제 충돌이다. 자동 병합하지 않는다. */
  | 'conflict'

/**
 * `saveProgress`는 멱등이 아니라서, 저장은 반영됐는데 응답을 받지 못한 채 같은 요청을 다시 보내면 revisionMismatch가 난다.
 * 그때 세션을 다시 읽어 이 함수로 구분한다. 내가 보낸 전체 진행 상태(cursor·performed·timer)가 저장된 상태와 같으면 alreadyApplied,
 * 다르면 conflict다. revision·타임스탬프는 동일성 판단에 쓰지 않는다. 저장된 세션이 진행 중이 아니면 conflict다.
 *
 * 저장 형식: 저장소의 saveProgress는 입력의 cursor·performed·timer를 복사해 그대로 저장하며 타이머를 정규화하지 않는다(복원은 읽을 때가 아니라
 * complete·abandon에서만 적용). 그래서 보낸 값과 저장된 값을 직접 비교해도 된다.
 */
export function classifyRevisionMismatch(
  sent: Progress,
  stored: Pick<WorkoutSession, 'status' | 'cursor' | 'performed' | 'timer'>,
): RevisionMismatchKind {
  if (stored.status !== 'in_progress') return 'conflict'
  return sameProgress(sent, stored) ? 'alreadyApplied' : 'conflict'
}

// ─── 이탈·W15 이동 판단 ────────────────────────────────────

/** 화면의 저장 상태. dirty는 저장된 값과 화면 값이 다르다는 뜻(isDirty), failed는 마지막 저장이 실패했다는 뜻. */
export interface SaveStatusFlags {
  dirty: boolean
  saving: boolean
  failed: boolean
}

/** 화면 값이 마지막으로 저장된 값과 다른지(미저장 변경). */
export function isDirty(local: Progress, lastSaved: Progress): boolean {
  return !sameProgress(local, lastSaved)
}

export type LeaveDecision =
  /** 저장할 것이 없다: 타이머를 일시정지·저장한 뒤 바로 이동해도 된다. */
  | { action: 'allow' }
  /** 저장이 진행 중이다: 끝날 때까지 기다린다. */
  | { action: 'waitForSave' }
  /** 저장하지 않은 변경이 있다: 저장을 시도한 뒤 성공하면 이동한다. */
  | { action: 'saveThenLeave' }
  /** 저장 실패 상태: 이동을 막고 사용자 확인을 받는다. 그냥 나가면 저장되지 않은 세트·측정 시간이 사라질 수 있다. */
  | { action: 'confirmLoss'; unsavedCompletedSets: number }

/** 화면을 떠나려 할 때의 판단. 저장 실패 상태에서는 확인 없이 이동할 수 없다. */
export function assessLeave(params: {
  save: SaveStatusFlags
  /** 화면 값의 완료 세트 수. */
  localCompletedSets: number
  /** 저장된 값의 완료 세트 수. */
  savedCompletedSets: number
}): LeaveDecision {
  const { save } = params
  if (save.saving) return { action: 'waitForSave' }
  if (save.dirty && save.failed) {
    return {
      action: 'confirmLoss',
      unsavedCompletedSets: Math.max(
        0,
        params.localCompletedSets - params.savedCompletedSets,
      ),
    }
  }
  if (save.dirty) return { action: 'saveThenLeave' }
  return { action: 'allow' }
}

/** 탭 닫기·새로고침 때 브라우저 경고를 띄울지. 저장되지 않은 변경이 있거나 저장 중일 때만이다. */
export function shouldWarnBeforeUnload(save: SaveStatusFlags): boolean {
  return save.dirty || save.saving
}

export interface AbandonInfo {
  completedSets: number
  totalSets: number
  /** 그만두면 완료한 세트가 기록으로 남지 않는다(abandon은 기록을 만들지 않는다). */
  losesRecord: boolean
  /** 저장소가 정하는 종료 상태: 완료 세트가 있으면 interrupted, 없으면 cancelled. */
  resultingStatus: 'interrupted' | 'cancelled'
  /** 완료 세트가 있으면 그만두기 대신 "여기까지 종료(결과 저장)"를 먼저 권한다. */
  recommendFinish: boolean
}

/** 그만두기 확인 문구에 쓰는 값. 완료 세트가 있으면 기록 손실을 알려야 한다. */
export function describeAbandon(
  performed: readonly (readonly PerformedSet[])[],
): AbandonInfo {
  const completedSets = countCompletedSets(performed)
  return {
    completedSets,
    totalSets: countTotalSets(performed),
    losesRecord: completedSets > 0,
    resultingStatus: abandonStatus({ performed }),
    recommendFinish: completedSets > 0,
  }
}

export type ResultBlockReason =
  'sessionEnded' | 'noCompletedSets' | 'saving' | 'saveFailed' | 'unsaved'

export type ResultEligibility =
  | {
      ok: true
      completedSets: number
      /** 기록되지 않는 미완료 세트 수(결과 이동 전에 알린다). */
      incompleteSets: number
      allCompleted: boolean
      /** 측정 중이거나 시간이 쌓인 세트가 있어 그 시간이 기록되지 않는지. */
      discardsTimer: boolean
    }
  | { ok: false; reason: ResultBlockReason }

/**
 * W15로 이동할 수 있는 조건. 진행 중인 세션이고, 완료한 세트가 1개 이상이며, 모든 변경이 저장되어 있어야 한다
 * (저장 중·저장 실패·미저장이면 이동하지 않는다). W14는 기록을 만들지 않고(complete는 W15가 호출) 저장된 상태만 넘긴다.
 */
export function canProceedToResult(params: {
  status: WorkoutSession['status']
  performed: readonly (readonly PerformedSet[])[]
  timer: SessionTimer
  save: SaveStatusFlags
}): ResultEligibility {
  const { status, performed, timer, save } = params
  if (status !== 'in_progress') return { ok: false, reason: 'sessionEnded' }
  const completedSets = countCompletedSets(performed)
  if (completedSets === 0) return { ok: false, reason: 'noCompletedSets' }
  if (save.saving) return { ok: false, reason: 'saving' }
  if (save.failed) return { ok: false, reason: 'saveFailed' }
  if (save.dirty) return { ok: false, reason: 'unsaved' }
  const totalSets = countTotalSets(performed)
  return {
    ok: true,
    completedSets,
    incompleteSets: totalSets - completedSets,
    allCompleted: completedSets === totalSets,
    discardsTimer: !isIdleTimer(timer),
  }
}
