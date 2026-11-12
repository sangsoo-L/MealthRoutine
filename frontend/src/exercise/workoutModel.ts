import {
  MAX_ITEMS,
  MAX_SETS_PER_ITEM,
  MAX_TARGET_SECONDS,
  MIN_TARGET_SECONDS,
  normalizeDraft,
} from './workoutDraftModel.ts'
import type {
  NormalizedSet,
  RecordType,
  WorkoutDraft,
} from './workoutDraftTypes.ts'
import { RECORD_TYPES } from './workoutDraftTypes.ts'
import {
  WORKOUT_SCHEMA_VERSION,
  WORKOUT_SESSION_STATUSES,
  type LocalDate,
  type PerformedSet,
  type SessionCursor,
  type SessionProgressInput,
  type SessionTimer,
  type WorkoutList,
  type WorkoutListItem,
  type WorkoutListSnapshot,
  type WorkoutRecord,
  type WorkoutRecordExercise,
  type WorkoutRecordSet,
  type WorkoutRecordTotals,
  type WorkoutSession,
  type WorkoutSessionStatus,
} from './workoutTypes.ts'

/**
 * 운동 목록·세션·완료 기록의 순수 변환·검증 함수. 저장소(exercise/local/)와 이후 화면(W11·W14·W15)이 같은 함수를 쓴다.
 * 모두 입력을 바꾸지 않고 새 값을 돌려준다. 시각·id는 호출하는 쪽이 정해서 넘긴다(같은 입력이면 같은 결과).
 * W02 초안의 검증·정규화는 workoutDraftModel의 기존 함수(normalizeDraft)를 그대로 쓰고 제한값도 그대로 따른다.
 */

/** 측정 시간 상한(24시간). 기기 시계 오류 등으로 생긴 비정상 값을 거른다. */
export const MAX_MEASURED_MS = 24 * 60 * 60 * 1000

/** 계정 id 길이 상한. 저장소 생성(쓰기)과 저장값 검증(읽기)이 같은 값을 쓴다. */
export const MAX_OWNER_ID_LENGTH = 200

/** 저장 요청 id 형식. 영문·숫자·`-`·`_` 1~100자. */
const REQUEST_ID_PATTERN = /^[0-9A-Za-z_-]{1,100}$/

const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

// ─── 날짜·값 도구 ───────────────────────────────────────────

/** 기기 로컬 날짜(YYYY-MM-DD). */
export function toLocalDate(date: Date): LocalDate {
  const y = String(date.getFullYear()).padStart(4, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** 실제로 있는 날짜의 YYYY-MM-DD인지. */
export function isLocalDate(value: unknown): value is LocalDate {
  if (typeof value !== 'string' || !LOCAL_DATE_PATTERN.test(value)) {
    return false
  }
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return (
    date.getFullYear() === y &&
    date.getMonth() === m - 1 &&
    date.getDate() === d
  )
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 40 &&
    !Number.isNaN(Date.parse(value))
  )
}

export function isValidRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID_PATTERN.test(value)
}

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown, max = 200): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= max
}

const isPositiveInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1

const isNonNegativeInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

const isNonNegativeNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0

const isMeasuredMs = (value: unknown): value is number =>
  isNonNegativeInt(value) && value <= MAX_MEASURED_MS

/** 계정 id로 쓸 수 있는 값인지(비어 있지 않은 200자 이하 문자열). */
export function isValidOwnerId(value: unknown): value is string {
  return isNonEmptyString(value, MAX_OWNER_ID_LENGTH)
}

/**
 * 저장값에서 소유자 id만 먼저 읽는다(전체 검증 전). 소유자를 알 수 없는 값(객체가 아니거나 ownerId가 올바르지 않음)이면 null이다.
 * 저장소는 이 값으로 다른 계정의 레코드를 손상 여부와 관계없이 "없음"으로 처리하고, 지금 계정의 레코드만 전체 검증한다.
 */
export function readOwnerId(raw: unknown): string | null {
  return isRecordObject(raw) && isValidOwnerId(raw.ownerId) ? raw.ownerId : null
}

// ─── 운동 목록 ──────────────────────────────────────────────

/**
 * W02 초안으로 저장 목록을 만든다. 초안이 기존 검증(validateDraft)을 통과하지 못하거나 모르는 운동이 있으면 null이다.
 * plannedDate는 now의 로컬 날짜(오늘)다. 내일 계획은 만들지 않는다.
 */
export function buildWorkoutList(params: {
  id: string
  ownerId: string
  requestId: string
  draft: WorkoutDraft
  knownExerciseIds: ReadonlySet<string>
  catalogVersion: string
  now: Date
}): WorkoutList | null {
  if (params.draft.day !== 'today') return null
  const normalized = normalizeDraft(params.draft, params.knownExerciseIds)
  if (!normalized) return null
  const at = params.now.toISOString()
  return {
    id: params.id,
    ownerId: params.ownerId,
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    plannedDate: toLocalDate(params.now),
    items: normalized.map((item) => ({
      exerciseId: item.exerciseId,
      exerciseNameSnapshot: item.name,
      recordType: item.recordType,
      sets: item.sets.map((set) => ({ ...set })),
    })),
    catalogVersion: params.catalogVersion,
    revision: 1,
    requestId: params.requestId,
    createdAt: at,
    updatedAt: at,
  }
}

/** 세트 하나를 키 순서가 고정된 문자열로 만든다(내용 비교용). */
function setKey(set: NormalizedSet): string {
  const s = set as Partial<
    Record<'reps' | 'weightKg' | 'targetSeconds', number>
  >
  return JSON.stringify([
    s.reps ?? null,
    s.weightKg ?? null,
    s.targetSeconds ?? null,
  ])
}

/** 두 목록의 운동 구성(운동·이름·기록 방식·세트 목표·순서)이 같은지. 같은 저장 요청의 재전송인지 판정할 때 쓴다. */
export function sameListItems(
  a: readonly WorkoutListItem[],
  b: readonly WorkoutListItem[],
): boolean {
  if (a.length !== b.length) return false
  return a.every((item, i) => {
    const other = b[i]
    return (
      item.exerciseId === other.exerciseId &&
      item.exerciseNameSnapshot === other.exerciseNameSnapshot &&
      item.recordType === other.recordType &&
      item.sets.length === other.sets.length &&
      item.sets.every((set, j) => setKey(set) === setKey(other.sets[j]))
    )
  })
}

// ─── 수행 세션 ──────────────────────────────────────────────

export function emptyPerformed(
  items: readonly WorkoutListItem[],
): PerformedSet[][] {
  return items.map((item) => item.sets.map(() => ({ completed: false })))
}

/** 저장 목록으로 새 세션을 만든다. 목록은 사본(스냅샷)으로 동결한다. */
export function createWorkoutSession(params: {
  id: string
  ownerId: string
  list: WorkoutList
  now: Date
}): WorkoutSession {
  const at = params.now.toISOString()
  const snapshot: WorkoutListSnapshot = {
    plannedDate: params.list.plannedDate,
    catalogVersion: params.list.catalogVersion,
    items: params.list.items.map((item) => ({
      ...item,
      sets: item.sets.map((set) => ({ ...set })),
    })),
  }
  return {
    id: params.id,
    ownerId: params.ownerId,
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    listId: params.list.id,
    listRevision: params.list.revision,
    listSnapshot: snapshot,
    status: 'in_progress',
    cursor: { itemIndex: 0, setIndex: 0 },
    performed: emptyPerformed(snapshot.items),
    timer: { accumulatedMs: 0, runningSince: null },
    revision: 1,
    startedAt: at,
    lastSavedAt: at,
    completedAt: null,
    endedAt: null,
    recordId: null,
  }
}

function validCursor(
  cursor: unknown,
  items: readonly WorkoutListItem[],
): cursor is SessionCursor {
  if (!isRecordObject(cursor)) return false
  const { itemIndex, setIndex } = cursor
  if (!isNonNegativeInt(itemIndex) || !isNonNegativeInt(setIndex)) return false
  const item = items[itemIndex]
  return item !== undefined && setIndex < item.sets.length
}

function validTimer(timer: unknown): timer is SessionTimer {
  if (!isRecordObject(timer)) return false
  return (
    isMeasuredMs(timer.accumulatedMs) &&
    (timer.runningSince === null || isIsoTimestamp(timer.runningSince))
  )
}

/**
 * 실제 수행 값 하나를 기록 방식에 맞게 검사한다.
 * - 시간형: measuredMs만 쓸 수 있다(횟수·중량 없음). 완료해도 측정값은 없을 수 있다(타이머 미사용 = 미측정).
 * - 횟수형: actualReps만. 중량형: actualReps와 actualWeightKg. 완료한 세트는 actualReps가 있어야 한다.
 * 숫자 규칙은 W02 검증과 같다(횟수 1 이상 정수, 중량 0 이상).
 */
function validPerformedSet(raw: unknown, recordType: RecordType): boolean {
  if (!isRecordObject(raw)) return false
  const { completed, actualReps, actualWeightKg, measuredMs } = raw
  if (typeof completed !== 'boolean') return false
  const allowed =
    recordType === 'time'
      ? ['completed', 'measuredMs']
      : recordType === 'weight'
        ? ['completed', 'actualReps', 'actualWeightKg']
        : ['completed', 'actualReps']
  if (Object.keys(raw).some((key) => !allowed.includes(key))) return false
  if (actualReps !== undefined && !isPositiveInt(actualReps)) return false
  if (actualWeightKg !== undefined && !isNonNegativeNumber(actualWeightKg)) {
    return false
  }
  if (measuredMs !== undefined && !isMeasuredMs(measuredMs)) return false
  if (completed && recordType !== 'time' && actualReps === undefined) {
    return false
  }
  return true
}

/** performed가 목록 스냅샷과 같은 모양이고 값이 올바른지. */
export function validPerformed(
  performed: unknown,
  items: readonly WorkoutListItem[],
): performed is readonly (readonly PerformedSet[])[] {
  if (!Array.isArray(performed) || performed.length !== items.length) {
    return false
  }
  return items.every((item, i) => {
    const sets: unknown = performed[i]
    return (
      Array.isArray(sets) &&
      sets.length === item.sets.length &&
      sets.every((set) => validPerformedSet(set, item.recordType))
    )
  })
}

/** 진행 저장 입력이 세션 스냅샷에 맞는지(revision 비교는 저장소가 한다). */
export function validateProgressInput(
  input: SessionProgressInput,
  snapshot: WorkoutListSnapshot,
): boolean {
  return (
    isRecordObject(input) &&
    isPositiveInt(input.expectedRevision) &&
    validCursor(input.cursor, snapshot.items) &&
    validPerformed(input.performed, snapshot.items) &&
    validTimer(input.timer)
  )
}

/** 진행 값을 적용한 새 세션(revision + 1). 값은 깊은 사본으로 담는다. */
export function applyProgress(
  session: WorkoutSession,
  input: SessionProgressInput,
  now: Date,
): WorkoutSession {
  return {
    ...session,
    cursor: { ...input.cursor },
    performed: input.performed.map((sets) => sets.map((set) => ({ ...set }))),
    timer: { ...input.timer },
    revision: session.revision + 1,
    lastSavedAt: now.toISOString(),
  }
}

export function countCompletedSets(
  performed: readonly (readonly PerformedSet[])[],
): number {
  return performed.reduce(
    (sum, sets) => sum + sets.filter((set) => set.completed).length,
    0,
  )
}

/** 기록 없이 그만둘 때의 상태: 완료한 세트가 있으면 interrupted, 없으면 cancelled. */
export function abandonStatus(
  session: Pick<WorkoutSession, 'performed'>,
): Extract<WorkoutSessionStatus, 'interrupted' | 'cancelled'> {
  return countCompletedSets(session.performed) > 0 ? 'interrupted' : 'cancelled'
}

// ─── 타이머 ─────────────────────────────────────────────────

/** 지금까지 측정한 시간(측정 중이면 now까지 포함). */
export function timerElapsedMs(timer: SessionTimer, now: Date): number {
  if (timer.runningSince === null) return timer.accumulatedMs
  const since = Date.parse(timer.runningSince)
  const running = Math.max(0, now.getTime() - since)
  return Math.min(MAX_MEASURED_MS, timer.accumulatedMs + running)
}

/** 측정을 멈춘 타이머(누적에 더한다). */
export function pauseTimer(timer: SessionTimer, now: Date): SessionTimer {
  if (timer.runningSince === null) return timer
  return { accumulatedMs: timerElapsedMs(timer, now), runningSince: null }
}

/** 측정을 시작한 타이머. 이미 측정 중이면 그대로다. */
export function startTimer(timer: SessionTimer, now: Date): SessionTimer {
  if (timer.runningSince !== null) return timer
  return { accumulatedMs: timer.accumulatedMs, runningSince: now.toISOString() }
}

/**
 * 새로고침·이탈 뒤 저장된 타이머를 복원한다. 측정 중이었다면 마지막 저장 시각(lastSavedAt)까지만 더하고 멈춘 상태로 돌려준다.
 * 마지막 저장 뒤의 시간은 실제로 운동했는지 확인할 수 없으므로 더하지 않는다(명세: 이탈 시 측정 일시정지).
 */
export function restoreTimer(
  timer: SessionTimer,
  lastSavedAt: string,
): SessionTimer {
  if (timer.runningSince === null) return timer
  return pauseTimer(timer, new Date(lastSavedAt))
}

// ─── 완료 기록 ──────────────────────────────────────────────

/** 저장된 완료 세트만으로 합계를 계산한다. 측정한 세트가 없으면 시간은 null이다. */
export function computeRecordTotals(
  exercises: readonly WorkoutRecordExercise[],
): WorkoutRecordTotals {
  let completedSetCount = 0
  let plannedSetCount = 0
  let exerciseCount = 0
  let measured: number | null = null
  for (const exercise of exercises) {
    plannedSetCount += exercise.plannedSetCount
    completedSetCount += exercise.completedSets.length
    if (exercise.completedSets.length > 0) exerciseCount += 1
    for (const set of exercise.completedSets) {
      if (set.measuredMs !== null) measured = (measured ?? 0) + set.measuredMs
    }
  }
  return {
    exerciseCount,
    completedSetCount,
    plannedSetCount,
    measuredMs: measured,
  }
}

/**
 * 진행 중 세션으로 완료 기록을 만든다(순수 함수). 완료한 세트만 담고 목표는 스냅샷 값을 그대로 쓴다.
 * 완료한 세트가 없으면 null이다(W15: 완료 세트가 없으면 저장 불가). 측정 중인 타이머는 기록에 넣지 않는다(화면이 세트를 완료하며 멈춘다).
 */
export function buildWorkoutRecord(params: {
  id: string
  session: WorkoutSession
  now: Date
}): WorkoutRecord | null {
  const { session } = params
  if (countCompletedSets(session.performed) === 0) return null
  const exercises = session.listSnapshot.items.map(
    (item, i): WorkoutRecordExercise => ({
      exerciseId: item.exerciseId,
      exerciseNameSnapshot: item.exerciseNameSnapshot,
      recordType: item.recordType,
      plannedSetCount: item.sets.length,
      completedSets: item.sets.flatMap((target, j): WorkoutRecordSet[] => {
        const done = session.performed[i]?.[j]
        if (!done?.completed) return []
        const set: WorkoutRecordSet = {
          setNumber: j + 1,
          target: { ...target },
          measuredMs:
            item.recordType === 'time' && done.measuredMs !== undefined
              ? done.measuredMs
              : null,
        }
        if (item.recordType !== 'time' && done.actualReps !== undefined) {
          set.actualReps = done.actualReps
        }
        if (item.recordType === 'weight' && done.actualWeightKg !== undefined) {
          set.actualWeightKg = done.actualWeightKg
        }
        return [set]
      }),
    }),
  )
  const at = params.now.toISOString()
  return {
    id: params.id,
    ownerId: session.ownerId,
    schemaVersion: WORKOUT_SCHEMA_VERSION,
    sessionId: session.id,
    sourceListId: session.listId,
    plannedDate: session.listSnapshot.plannedDate,
    performedDate: toLocalDate(new Date(session.startedAt)),
    startedAt: session.startedAt,
    completedAt: at,
    exercises,
    totals: computeRecordTotals(exercises),
    catalogVersion: session.listSnapshot.catalogVersion,
    createdAt: at,
  }
}

// ─── 저장값 검증(읽은 값은 외부 입력으로 본다) ──────────────

function validTarget(raw: unknown, recordType: RecordType): boolean {
  if (!isRecordObject(raw)) return false
  const keys = Object.keys(raw)
  if (recordType === 'time') {
    const t = raw.targetSeconds
    return (
      keys.length === 1 &&
      typeof t === 'number' &&
      Number.isInteger(t) &&
      t >= MIN_TARGET_SECONDS &&
      t <= MAX_TARGET_SECONDS
    )
  }
  if (!isPositiveInt(raw.reps)) return false
  if (recordType === 'reps') return keys.length === 1
  return (
    keys.every((key) => key === 'reps' || key === 'weightKg') &&
    (raw.weightKg === undefined || isNonNegativeNumber(raw.weightKg))
  )
}

function validListItems(raw: unknown): raw is WorkoutListItem[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ITEMS) {
    return false
  }
  return raw.every(
    (item) =>
      isRecordObject(item) &&
      isNonEmptyString(item.exerciseId, 100) &&
      isNonEmptyString(item.exerciseNameSnapshot, 100) &&
      typeof item.recordType === 'string' &&
      RECORD_TYPES.includes(item.recordType as RecordType) &&
      Array.isArray(item.sets) &&
      item.sets.length >= 1 &&
      item.sets.length <= MAX_SETS_PER_ITEM &&
      item.sets.every((set) => validTarget(set, item.recordType as RecordType)),
  )
}

const validRevision = isPositiveInt

/** 저장소에서 읽은 운동 목록. 모양이 맞지 않으면 null(손상). */
export function parseWorkoutList(raw: unknown): WorkoutList | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== WORKOUT_SCHEMA_VERSION ||
    !isNonEmptyString(raw.id) ||
    !isValidOwnerId(raw.ownerId) ||
    !isLocalDate(raw.plannedDate) ||
    !validListItems(raw.items) ||
    !isNonEmptyString(raw.catalogVersion, 50) ||
    !validRevision(raw.revision) ||
    !isValidRequestId(raw.requestId) ||
    !isIsoTimestamp(raw.createdAt) ||
    !isIsoTimestamp(raw.updatedAt)
  ) {
    return null
  }
  return raw as unknown as WorkoutList
}

function validSnapshot(raw: unknown): raw is WorkoutListSnapshot {
  return (
    isRecordObject(raw) &&
    isLocalDate(raw.plannedDate) &&
    isNonEmptyString(raw.catalogVersion, 50) &&
    validListItems(raw.items)
  )
}

const nullableIso = (value: unknown) => value === null || isIsoTimestamp(value)

/** 저장소에서 읽은 세션. 모양이 맞지 않으면 null(손상). */
export function parseWorkoutSession(raw: unknown): WorkoutSession | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== WORKOUT_SCHEMA_VERSION ||
    !isNonEmptyString(raw.id) ||
    !isValidOwnerId(raw.ownerId) ||
    !isNonEmptyString(raw.listId) ||
    !validRevision(raw.listRevision) ||
    !validSnapshot(raw.listSnapshot) ||
    typeof raw.status !== 'string' ||
    !WORKOUT_SESSION_STATUSES.includes(raw.status as WorkoutSessionStatus) ||
    !validCursor(raw.cursor, raw.listSnapshot.items) ||
    !validPerformed(raw.performed, raw.listSnapshot.items) ||
    !validTimer(raw.timer) ||
    !validRevision(raw.revision) ||
    !isIsoTimestamp(raw.startedAt) ||
    !isIsoTimestamp(raw.lastSavedAt) ||
    !nullableIso(raw.completedAt) ||
    !nullableIso(raw.endedAt) ||
    !(raw.recordId === null || isNonEmptyString(raw.recordId))
  ) {
    return null
  }
  // 상태와 시각·기록 연결이 서로 맞아야 한다.
  const status = raw.status as WorkoutSessionStatus
  const ended = raw.endedAt !== null
  const consistent =
    status === 'in_progress'
      ? !ended && raw.completedAt === null && raw.recordId === null
      : status === 'completed'
        ? ended && raw.completedAt !== null && raw.recordId !== null
        : ended && raw.completedAt === null && raw.recordId === null
  return consistent ? (raw as unknown as WorkoutSession) : null
}

/** 완료 기록 세트의 기록 방식별 허용 필드(buildWorkoutRecord가 만드는 모양). */
const RECORD_SET_KEYS: Record<RecordType, readonly string[]> = {
  time: ['setNumber', 'target', 'measuredMs'],
  reps: ['setNumber', 'target', 'actualReps', 'measuredMs'],
  weight: ['setNumber', 'target', 'actualReps', 'actualWeightKg', 'measuredMs'],
}

const RECORD_EXERCISE_KEYS: readonly string[] = [
  'exerciseId',
  'exerciseNameSnapshot',
  'recordType',
  'plannedSetCount',
  'completedSets',
]

/**
 * 완료 기록의 세트 하나. 규칙은 진행 값 검증(validPerformedSet)·기록 변환(buildWorkoutRecord)과 같다.
 * - 시간형: 실제 횟수·중량 없음, measuredMs는 측정값 또는 null.
 * - 횟수형·중량형: measuredMs는 null(시간을 측정하지 않는다), 실제 횟수(1 이상 정수) 필수. 중량형만 실제 중량(0 이상)을 쓸 수 있다.
 * - 세트 번호는 1~계획 세트 수 안에서 앞 세트보다 커야 한다(중복·역순 없음).
 */
function validRecordSet(
  set: unknown,
  recordType: RecordType,
  plannedSetCount: number,
  previousSetNumber: number,
): set is WorkoutRecordSet {
  if (!isRecordObject(set)) return false
  const allowed = RECORD_SET_KEYS[recordType]
  if (Object.keys(set).some((key) => !allowed.includes(key))) return false
  if (!('measuredMs' in set)) return false
  const { setNumber, measuredMs, actualReps, actualWeightKg } = set
  if (
    !isPositiveInt(setNumber) ||
    setNumber <= previousSetNumber ||
    setNumber > plannedSetCount ||
    !validTarget(set.target, recordType)
  ) {
    return false
  }
  if (recordType === 'time') {
    return measuredMs === null || isMeasuredMs(measuredMs)
  }
  return (
    measuredMs === null &&
    isPositiveInt(actualReps) &&
    (actualWeightKg === undefined || isNonNegativeNumber(actualWeightKg))
  )
}

function validRecordExercises(raw: unknown): raw is WorkoutRecordExercise[] {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ITEMS) {
    return false
  }
  return raw.every((exercise) => {
    if (!isRecordObject(exercise)) return false
    if (
      Object.keys(exercise).some((key) => !RECORD_EXERCISE_KEYS.includes(key))
    ) {
      return false
    }
    const { recordType, plannedSetCount, completedSets } = exercise
    if (
      !isNonEmptyString(exercise.exerciseId, 100) ||
      !isNonEmptyString(exercise.exerciseNameSnapshot, 100) ||
      typeof recordType !== 'string' ||
      !RECORD_TYPES.includes(recordType as RecordType) ||
      !isPositiveInt(plannedSetCount) ||
      plannedSetCount > MAX_SETS_PER_ITEM ||
      !Array.isArray(completedSets) ||
      completedSets.length > plannedSetCount
    ) {
      return false
    }
    let previous = 0
    for (const set of completedSets) {
      if (
        !validRecordSet(
          set,
          recordType as RecordType,
          plannedSetCount,
          previous,
        )
      ) {
        return false
      }
      previous = set.setNumber
    }
    return true
  })
}

/** 저장소에서 읽은 완료 기록. 모양이 맞지 않거나 합계가 완료 세트와 맞지 않으면 null(손상). */
export function parseWorkoutRecord(raw: unknown): WorkoutRecord | null {
  if (!isRecordObject(raw)) return null
  if (
    raw.schemaVersion !== WORKOUT_SCHEMA_VERSION ||
    !isNonEmptyString(raw.id) ||
    !isValidOwnerId(raw.ownerId) ||
    !isNonEmptyString(raw.sessionId) ||
    !isNonEmptyString(raw.sourceListId) ||
    !isLocalDate(raw.plannedDate) ||
    !isLocalDate(raw.performedDate) ||
    !isIsoTimestamp(raw.startedAt) ||
    !isIsoTimestamp(raw.completedAt) ||
    !isIsoTimestamp(raw.createdAt) ||
    !isNonEmptyString(raw.catalogVersion, 50) ||
    !validRecordExercises(raw.exercises) ||
    !isRecordObject(raw.totals)
  ) {
    return null
  }
  const expected = computeRecordTotals(raw.exercises)
  // 완료 기록은 완료한 세트가 하나 이상일 때만 만든다(W15: 완료 세트가 없으면 저장 불가).
  if (expected.completedSetCount < 1) return null
  const totals = raw.totals
  const sameTotals =
    totals.exerciseCount === expected.exerciseCount &&
    totals.completedSetCount === expected.completedSetCount &&
    totals.plannedSetCount === expected.plannedSetCount &&
    totals.measuredMs === expected.measuredMs
  return sameTotals ? (raw as unknown as WorkoutRecord) : null
}
