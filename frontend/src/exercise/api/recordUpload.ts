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
import { MAX_TARGET_WEIGHT_KG } from '../workoutDraftModel.ts'
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
 *   만들 수 없는 기록은 "거절" 표시를 하고 다시 보내지 않는다. 같은 본문을 다시 보내도 결과가 같기 때문이다.
 * - 단, 본문 만드는 규칙이 바뀌면(RECORD_BODY_VERSION) 예전 규칙으로 INVALID_REQUEST를 받은 기록은 다시 보낸다(아래 "본문 버전").
 * - 네트워크 오류, 5xx, 로그인 만료, 요청 과다처럼 나중에 될 수 있는 실패는 표시하지 않고 그 자리에서 멈춘다. 다음 업로드 때 다시 보낸다.
 * - 요청마다 시간 제한(REQUEST_TIMEOUT_MS)을 둔다. 공통 코드(apiRequest)에는 시간 제한이 없어서, 응답이 오지 않으면 이 실행과
 *   같은 계정의 다음 업로드가 모두 멈추기 때문이다. 시간을 넘기면 나중에 될 수 있는 실패로 보고 멈춘다. 서버가 이미 저장했을 수 있지만
 *   다음 실행에서 같은 requestId로 다시 보내면 서버가 새로 만들지 않고 200(created: false)으로 답하므로 기록이 겹치지 않는다.
 * - 개발용 카탈로그로 만든 기록(catalogVersion이 서버 카탈로그가 아님)은 운동 id가 서버와 달라서 보내지 않는다.
 * - 측정 시간은 밀리초를 초로 반올림해 보낸다(서버는 초 단위로 저장한다).
 */

type Request = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

const PATH = '/workout-sessions/records'
/** 요청 한 건의 시간 제한. 다른 API 저장소(apiExerciseRepository)와 같은 15초다. */
const REQUEST_TIMEOUT_MS = 15_000
/**
 * 본문 버전. 본문 만드는 규칙을 바꿔 예전에 거절된 기록이 받아들여질 수 있게 되면 올린다.
 * - 1: 처음 규칙. 목표(setTargets)를 세션 목록 사본 그대로 보냈다.
 * - 2: 목표 중량을 소수 둘째 자리로 반올림한다(toSetTarget). 목표 중량 검사가 없던 때 저장한 목록(예: 22.555kg)으로 완료한 기록을
 *   서버가 400으로 거절했기 때문이다.
 */
export const RECORD_BODY_VERSION = 2
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

/**
 * 세트 목표 한 개. 목표 중량만 서버 규칙(소수 둘째 자리까지)에 맞게 반올림한다(본문 버전 2).
 * - 목표는 계획일 뿐이고 반올림 차이는 0.005kg 미만이라 기록의 뜻이 바뀌지 않는다. 서버에 저장되는 통계·보상은 완료한 세트로 계산한다.
 * - 이미 둘째 자리 안인 값은 그대로다(반올림해도 같다). 그래서 예전 규칙으로 이미 저장된 기록과 본문이 달라지지 않아,
 *   표시를 잃고 다시 보내도 409 REQUEST_CONFLICT가 나지 않는다. 값이 바뀌는 것은 서버가 400으로 거절했을 본문뿐이다.
 * - 0~999 밖의 중량과 다른 목표 값(횟수·시간)은 고칠 방법이 없어 그대로 보낸다. 서버가 거절하면 거절로 남는다.
 * - 실제로 수행한 값(completedSets)은 절대 바꾸지 않는다(toCompletedSet).
 */
function toSetTarget(set: Record<string, number>): Record<string, number> {
  const out = { ...set }
  const weight = out.weightKg
  if (
    typeof weight === 'number' &&
    Number.isFinite(weight) &&
    weight >= 0 &&
    weight <= MAX_TARGET_WEIGHT_KG
  ) {
    out.weightKg = Math.round(weight * 100) / 100
  }
  return out
}

/** 완료한 세트 한 개. 사용자가 입력·측정한 값을 그대로 보낸다(측정 시간만 초로 반올림). */
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
      setTargets: item.sets.map((set) => toSetTarget({ ...set })),
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
  /**
   * rejected의 판정을 받은 본문 버전(RECORD_BODY_VERSION). 버전 필드가 없던 예전 표시는 1이다.
   * 업로드할 때 이 값이 지금 버전보다 낮으면 INVALID_REQUEST 거절을 지우고(다시 보낼 대상) 지금 버전으로 올린다.
   * 기록마다 두지 않고 하나만 두는 것은, 올리는 실행에서 지운 거절이 다시 생기면 그것은 항상 지금 버전으로 받은 판정이기 때문이다.
   */
  bodyVersion: number
}

export interface UploadMarkStore {
  read(): UploadMarks
  write(marks: UploadMarks): void
}

const MARK_KEY_PREFIX = 'mealthroutine.recordUploads.v1.'

/**
 * 표시를 localStorage에 계정별로 둔다. 읽을 수 없거나 모양이 틀리면 빈 표시로 본다(다시 보내도 서버가 중복을 막는다).
 * 저장 모양은 { uploaded: [id], rejected: { id: 이유 코드 }, bodyVersion }이다. 키는 그대로 두고 bodyVersion만 더했다.
 * bodyVersion이 없는 예전 표시는 1로 읽어서, 다음 업로드가 그때 INVALID_REQUEST로 거절된 기록을 다시 보낸다.
 * 계정별 임시 데이터 접두어(mealthroutine.account.)는 sessionStorage용이라 쓰지 않는다. 로그아웃해도 이 브라우저의 기록은 남으므로 표시도 남긴다.
 */
export function createStorageMarkStore(
  ownerId: string,
  getStorage: () => Storage | null,
): UploadMarkStore {
  const key = `${MARK_KEY_PREFIX}${ownerId}`
  return {
    read() {
      const empty: UploadMarks = {
        uploaded: new Set(),
        rejected: new Map(),
        bodyVersion: RECORD_BODY_VERSION,
      }
      try {
        const raw = getStorage()?.getItem(key)
        if (!raw) return empty
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return empty
        const { uploaded, rejected, bodyVersion } = parsed as Record<
          string,
          unknown
        >
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
          bodyVersion:
            typeof bodyVersion === 'number' &&
            Number.isInteger(bodyVersion) &&
            bodyVersion >= 1
              ? bodyVersion
              : 1,
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
            bodyVersion: marks.bodyVersion,
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
  /** 요청 한 건의 시간 제한(ms). 기본은 REQUEST_TIMEOUT_MS이고 테스트가 짧게 바꾼다. */
  timeoutMs?: number
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
  const timeoutMs = deps.timeoutMs ?? REQUEST_TIMEOUT_MS
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
  // 본문 규칙이 바뀌었으면 예전 본문으로 INVALID_REQUEST를 받은 기록을 다시 보낸다. 다른 이유(없는 운동, 내용 충돌, 세션 불일치)는
  // 본문 규칙과 관계없어 그대로 둔다. 다시 보내서 또 거절되면(예: 실제 수행 값이 서버 규칙 밖) 지금 버전의 거절로 남는다.
  if (marks.bodyVersion < RECORD_BODY_VERSION) {
    for (const [id, code] of marks.rejected) {
      if (code === 'INVALID_REQUEST') marks.rejected.delete(id)
    }
    marks.bodyVersion = RECORD_BODY_VERSION
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
        await request('POST', PATH, {
          body,
          signal: AbortSignal.timeout(timeoutMs),
        })
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
