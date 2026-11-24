import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type HttpMethod,
} from '../../api/http.ts'
import type {
  WorkoutRecordRepository,
  WorkoutSessionRepository,
} from '../workoutRepositories.ts'
import {
  SERVER_CATALOG_VERSION,
  type WorkoutRecord,
  type WorkoutRecordSet,
  type WorkoutSession,
} from '../workoutTypes.ts'

/**
 * 완료 기록을 서버에 올린다(POST /api/v1/workout-sessions/records, docs/api_exercise_v1.0.md "완료 기록 저장").
 * 운영 빌드에서만 쓴다(recordUploadSource.ts).
 *
 * - 완료 기록은 지금처럼 이 브라우저의 IndexedDB에 저장하고 화면도 그것을 읽는다. 서버에는 통계(/summary)와 운동 보상을 위해 사본을 올린다.
 *   화면이 기록을 오늘 목록과 이어 붙이는 sourceListId·plannedDate는 서버에 없어서 기록 조회는 서버로 바꾸지 않는다.
 * - 올릴 대상은 이 계정의 완료 기록 중 아직 올리지 않은 것이다. requestId는 로컬 기록 id라서 같은 기록을 다시 보내도 서버가 새로 만들지 않고
 *   200(created: false)으로 답한다. 그래서 "올렸음" 표시(marks)는 다시 보내지 않기 위한 것일 뿐이고, 표시를 잃어도 다시 보내면 그만이다.
 * - 세트별 목표 전체(setTargets)는 기록에 없고(완료한 세트의 목표만 있다) 세션의 목록 사본에 있어서 같은 세션을 함께 읽는다.
 * - 서버가 내용 때문에 거절한 기록(400 INVALID_REQUEST, 404 EXERCISE_NOT_FOUND, 409 REQUEST_CONFLICT)과 세션이 맞지 않아 본문을
 *   만들 수 없는 기록은 "거절" 표시를 하고 다시 보내지 않는다. 다시 보내도 결과가 같기 때문이다.
 * - 네트워크 오류, 5xx, 로그인 만료, 요청 과다처럼 나중에 될 수 있는 실패는 표시하지 않고 그 자리에서 멈춘다. 다음 업로드 때 다시 보낸다.
 * - 개발용 카탈로그로 만든 기록(catalogVersion이 서버 카탈로그가 아님)은 운동 id가 서버와 달라서 보내지 않는다.
 * - 측정 시간은 밀리초를 초로 반올림해 보낸다(서버는 초 단위로 저장한다).
 */

type Request = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

const PATH = '/workout-sessions/records'
const EXERCISE_ID = /^[1-9][0-9]{0,15}$/
/** 모든 기록을 읽는 날짜 범위(로컬 저장소의 listByDateRange는 날짜 범위로만 읽는다). */
const ALL_FROM = '1970-01-01'
const ALL_TO = '9999-12-31'
/** 다시 보내도 결과가 같은 서버 거절 코드. */
const PERMANENT_CODES = new Set([
  'INVALID_REQUEST',
  'EXERCISE_NOT_FOUND',
  'REQUEST_CONFLICT',
])

export interface UploadCompletedSet {
  setNumber: number
  reps?: number
  weightKg?: number
  durationSeconds?: number
}

export interface UploadExercise {
  exerciseId: number
  recordType: string
  setTargets: Record<string, number>[]
  completedSets: UploadCompletedSet[]
}

export interface RecordUploadBody {
  requestId: string
  startedAt: string
  endedAt: string
  exercises: UploadExercise[]
}

function toCompletedSet(set: WorkoutRecordSet): UploadCompletedSet {
  const out: UploadCompletedSet = { setNumber: set.setNumber }
  if (set.actualReps !== undefined) out.reps = set.actualReps
  if (set.actualWeightKg !== undefined) out.weightKg = set.actualWeightKg
  if (set.measuredMs !== null) {
    out.durationSeconds = Math.round(set.measuredMs / 1000)
  }
  return out
}

/**
 * 완료 기록과 그 세션으로 업로드 본문을 만든다. 세션이 그 기록의 것이 아니거나 목록 사본이 기록과 맞지 않으면 null이다.
 * 기록의 운동은 세션 목록 사본과 같은 순서·개수로 만들어진다(buildWorkoutRecord). 완료한 세트가 없는 운동도 계획대로 함께 보낸다.
 */
export function toRecordUploadBody(
  record: WorkoutRecord,
  session: WorkoutSession,
): RecordUploadBody | null {
  if (session.id !== record.sessionId || session.ownerId !== record.ownerId) {
    return null
  }
  const items = session.listSnapshot.items
  if (items.length !== record.exercises.length) return null
  const exercises: UploadExercise[] = []
  for (const [index, exercise] of record.exercises.entries()) {
    const item = items[index]
    if (
      item.exerciseId !== exercise.exerciseId ||
      item.recordType !== exercise.recordType ||
      item.sets.length !== exercise.plannedSetCount ||
      !EXERCISE_ID.test(exercise.exerciseId)
    ) {
      return null
    }
    exercises.push({
      exerciseId: Number(exercise.exerciseId),
      recordType: exercise.recordType,
      setTargets: item.sets.map((set) => ({ ...set })),
      completedSets: exercise.completedSets.map(toCompletedSet),
    })
  }
  return {
    requestId: record.id,
    startedAt: record.startedAt,
    endedAt: record.completedAt,
    exercises,
  }
}

// ─── 올렸음·거절 표시 ──────────────────────────────────────

export interface UploadMarks {
  /** 서버에 저장된 것을 확인한 기록 id */
  uploaded: Set<string>
  /** 서버가 내용 때문에 거절했거나 본문을 만들 수 없는 기록 id → 이유 코드 */
  rejected: Map<string, string>
}

export interface UploadMarkStore {
  read(): UploadMarks
  write(marks: UploadMarks): void
}

const MARK_KEY_PREFIX = 'mealthroutine.recordUploads.v1.'

/**
 * 표시를 localStorage에 계정별로 둔다. 읽을 수 없거나 모양이 틀리면 빈 표시로 본다(다시 보내도 서버가 중복을 막는다).
 * 계정별 임시 데이터 접두어(mealthroutine.account.)는 sessionStorage용이라 쓰지 않는다. 로그아웃해도 이 브라우저의 기록은 남으므로 표시도 남긴다.
 */
export function createStorageMarkStore(
  ownerId: string,
  getStorage: () => Storage | null,
): UploadMarkStore {
  const key = `${MARK_KEY_PREFIX}${ownerId}`
  return {
    read() {
      const empty: UploadMarks = { uploaded: new Set(), rejected: new Map() }
      try {
        const raw = getStorage()?.getItem(key)
        if (!raw) return empty
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return empty
        const { uploaded, rejected } = parsed as Record<string, unknown>
        return {
          uploaded: new Set(
            Array.isArray(uploaded)
              ? uploaded.filter((id): id is string => typeof id === 'string')
              : [],
          ),
          rejected: new Map(
            typeof rejected === 'object' &&
              rejected !== null &&
              !Array.isArray(rejected)
              ? Object.entries(rejected).filter(
                  (entry): entry is [string, string] =>
                    typeof entry[1] === 'string',
                )
              : [],
          ),
        }
      } catch {
        return empty
      }
    },
    write(marks) {
      try {
        getStorage()?.setItem(
          key,
          JSON.stringify({
            uploaded: [...marks.uploaded],
            rejected: Object.fromEntries(marks.rejected),
          }),
        )
      } catch {
        // 저장할 수 없으면 다음에 다시 보낸다(서버가 중복을 막는다).
      }
    },
  }
}

// ─── 업로드 ────────────────────────────────────────────────

export interface RecordUploadDeps {
  records: Pick<WorkoutRecordRepository, 'listByDateRange'>
  sessions: Pick<WorkoutSessionRepository, 'get'>
  marks: UploadMarkStore
  request?: Request
  /** 업로드를 시작한 계정이 아직 로그인 중인지. false가 되면 다음 기록부터 보내지 않는다(다른 계정 토큰으로 보내지 않게). */
  isCurrent?: () => boolean
}

export interface RecordUploadSummary {
  /** 이번에 서버에 저장된 것을 확인한 기록 수(이미 저장돼 있던 것 포함) */
  uploaded: number
  /** 이번에 거절 표시한 기록 수 */
  rejected: number
  /** 나중에 될 수 있는 실패로 멈췄으면 그 오류. 멈춘 기록과 그 뒤 기록은 다음에 다시 보낸다. */
  stoppedBy: unknown
}

function isPermanent(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    PERMANENT_CODES.has(error.errorCode)
  )
}

/** 아직 올리지 않은 완료 기록을 오래된 것부터 하나씩 올린다. */
export async function uploadPendingRecords(
  deps: RecordUploadDeps,
): Promise<RecordUploadSummary> {
  const request = deps.request ?? apiRequest
  const isCurrent = deps.isCurrent ?? (() => true)
  const summary: RecordUploadSummary = {
    uploaded: 0,
    rejected: 0,
    stoppedBy: undefined,
  }
  const { items } = await deps.records.listByDateRange(ALL_FROM, ALL_TO)
  const marks = deps.marks.read()
  // 지워진 기록의 표시는 정리한다(표시가 끝없이 쌓이지 않게).
  const ids = new Set(items.map((record) => record.id))
  for (const id of marks.uploaded) if (!ids.has(id)) marks.uploaded.delete(id)
  for (const id of marks.rejected.keys()) {
    if (!ids.has(id)) marks.rejected.delete(id)
  }
  const pending = items.filter(
    (record) =>
      record.catalogVersion === SERVER_CATALOG_VERSION &&
      !marks.uploaded.has(record.id) &&
      !marks.rejected.has(record.id),
  )
  try {
    for (const record of pending) {
      if (!isCurrent()) break
      let session: WorkoutSession | null
      try {
        session = await deps.sessions.get(record.sessionId)
      } catch (error) {
        summary.stoppedBy = error
        break
      }
      const body = session ? toRecordUploadBody(record, session) : null
      if (!body) {
        marks.rejected.set(
          record.id,
          session ? 'sessionMismatch' : 'sessionMissing',
        )
        summary.rejected += 1
        continue
      }
      if (!isCurrent()) break
      try {
        await request('POST', PATH, { body })
        marks.uploaded.add(record.id)
        summary.uploaded += 1
      } catch (error) {
        if (isPermanent(error)) {
          marks.rejected.set(record.id, error.errorCode)
          summary.rejected += 1
          continue
        }
        summary.stoppedBy = error
        break
      }
    }
  } finally {
    deps.marks.write(marks)
  }
  return summary
}

/**
 * 키(계정)별로 업로드를 하나씩만 돌린다. 도는 중에 같은 키로 다시 요청하면(방금 완료한 기록 등) 지금 것이 끝난 뒤 한 번 더 돈다.
 * run이 던지면 그 실행만 끝나고 다음 요청은 다시 돈다.
 */
export function createUploadRunner(
  run: (key: string) => Promise<unknown>,
): (key: string) => Promise<void> {
  const running = new Map<string, { again: boolean; done: Promise<void> }>()
  return (key) => {
    const current = running.get(key)
    if (current) {
      current.again = true
      return current.done
    }
    const state = { again: false, done: Promise.resolve() }
    state.done = (async () => {
      try {
        do {
          state.again = false
          try {
            await run(key)
          } catch {
            // 다음 요청 때 다시 돈다.
          }
        } while (state.again)
      } finally {
        running.delete(key)
      }
    })()
    running.set(key, state)
    return state.done
  }
}
