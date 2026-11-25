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
import { MAX_SAVED_ITEMS, MAX_TARGET_WEIGHT_KG } from '../workoutDraftModel.ts'
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
 * - 서버는 기록 하나에 운동을 100개(MAX_RECORD_EXERCISES)까지만 받는다. 지금은 목록을 저장할 때 100개로 막지만(validateDraft),
 *   그 전에 저장한 101개 이상 목록으로 완료한 기록이 있다. 이런 기록은 보내지 않고 그 자리에서 거절 표시한다(아래 "운동 수 상한").
 *   예전에 보내서 INVALID_REQUEST로 거절된 기록도 업로드할 때 같은 이유로 다시 분류해 화면이 이유를 보여 줄 수 있게 한다.
 * - 거절 이유는 표시에 남고 결과 화면(W15)이 보여 준다(describeUploadRejection, useRecordUploadStatus).
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
/** 서버가 받는 기록 한 건의 운동 수(SessionRecordRequest exercises 1~100개). 목록 저장 상한(MAX_SAVED_ITEMS)과 같은 값이다. */
export const MAX_RECORD_EXERCISES = MAX_SAVED_ITEMS
/**
 * 운동 수 상한 때문에 보내지 않은 기록의 거절 코드(이 앱이 붙이는 코드, 서버 코드가 아니다).
 * - tooManyExercises: 운동이 100개를 넘지만 완료한 세트가 있는 운동은 100개 이하다. 사용자가 고르면 완료한 세트가 없는 운동을 빼고
 *   다시 보낼 수 있다("수정 가능", retry).
 * - tooManyCompletedExercises: 완료한 세트가 있는 운동만 남겨도 100개를 넘는다. 실제로 한 운동을 빼야 해서 고칠 수 없다.
 */
export const TOO_MANY_EXERCISES = 'tooManyExercises'
export const TOO_MANY_COMPLETED_EXERCISES = 'tooManyCompletedExercises'
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
 * options.omitEmptyExercises가 true면 완료한 세트가 없는 운동을 뺀다. 운동이 100개를 넘어 거절된 기록을 사용자가 고쳐 다시 보낼 때만 쓴다.
 * 남은 운동의 목표·완료 세트·세트 번호는 그대로이고(세트 번호는 그 운동 안의 위치다), 서버 통계·보상은 완료한 세트로 계산하므로 결과가 같다.
 */
export function toRecordUploadBody(
  record: WorkoutRecord,
  session: WorkoutSession,
  options: { omitEmptyExercises?: boolean } = {},
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
    if (options.omitEmptyExercises && exercise.completedSets.length === 0) {
      continue
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

// ─── 운동 수 상한 ──────────────────────────────────────────

/**
 * 운동 수 때문에 서버가 받지 않을 기록이면 그 거절 코드, 아니면 null. 세션 없이 기록만 보고 정한다(본문의 운동 수는 기록의 운동 수와 같다).
 * omitEmpty는 사용자가 완료한 세트가 없는 운동을 빼고 보내기로 한 기록인지다. 완료 기록은 바뀌지 않으므로 같은 기록의 판정은 늘 같다.
 */
export function exerciseLimitRejection(
  record: Pick<WorkoutRecord, 'exercises'>,
  omitEmpty: boolean,
): string | null {
  const completed = record.exercises.filter(
    (exercise) => exercise.completedSets.length > 0,
  ).length
  const sent = omitEmpty ? completed : record.exercises.length
  if (sent <= MAX_RECORD_EXERCISES) return null
  return !omitEmpty && completed <= MAX_RECORD_EXERCISES
    ? TOO_MANY_EXERCISES
    : TOO_MANY_COMPLETED_EXERCISES
}

/** 화면에 보여 줄 거절 이유. fixable이면 "완료한 운동만 다시 보내기"를 보여 준다(requestRecordRetry). */
export interface UploadRejectionView {
  message: string
  fixable: boolean
}

/** 거절 코드를 사용자에게 보여 줄 이유로 바꾼다. 모르는 코드는 일반 문구다. */
export function describeUploadRejection(code: string): UploadRejectionView {
  switch (code) {
    case TOO_MANY_EXERCISES:
      return {
        message: `운동이 ${MAX_RECORD_EXERCISES}개를 넘어 서버에 저장하지 못했어요. 완료한 세트가 없는 운동을 빼면 ${MAX_RECORD_EXERCISES}개 이하라 다시 보낼 수 있어요.`,
        fixable: true,
      }
    case TOO_MANY_COMPLETED_EXERCISES:
      return {
        message: `완료한 운동이 ${MAX_RECORD_EXERCISES}개를 넘어 서버에 저장할 수 없어요. 서버는 기록 하나에 운동을 ${MAX_RECORD_EXERCISES}개까지만 받아요.`,
        fixable: false,
      }
    case 'EXERCISE_NOT_FOUND':
      return {
        message: '서버에 없는 운동이 들어 있어 서버에 저장하지 못했어요.',
        fixable: false,
      }
    case 'REQUEST_CONFLICT':
      return {
        message:
          '같은 기록이 다른 내용으로 이미 서버에 있어 다시 저장하지 않았어요.',
        fixable: false,
      }
    case 'sessionMissing':
    case 'sessionMismatch':
      return {
        message: '이 기록의 운동 목록 정보를 찾지 못해 서버에 보내지 못했어요.',
        fixable: false,
      }
    default:
      return {
        message: '기록 내용이 서버 규칙에 맞지 않아 서버에 저장하지 못했어요.',
        fixable: false,
      }
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
  /**
   * 사용자가 "완료한 운동만 다시 보내기"를 고른 기록 id. 이 기록은 완료한 세트가 없는 운동을 빼고 보낸다(toRecordUploadBody).
   * 한 번 보내고 끝이 아니라 표시로 남기는 것은, 보내다 네트워크 오류·시간 초과로 멈춘 뒤 다음 업로드도 같은 본문으로 보내야 하기 때문이다.
   * 서버가 이미 저장했다면 같은 requestId·같은 본문이라 200(created: false)이고 기록이 겹치지 않는다.
   */
  omitEmpty: Set<string>
}

export interface UploadMarkStore {
  read(): UploadMarks
  write(marks: UploadMarks): void
}

const MARK_KEY_PREFIX = 'mealthroutine.recordUploads.v1.'

/**
 * 표시를 localStorage에 계정별로 둔다. 읽을 수 없거나 모양이 틀리면 빈 표시로 본다(다시 보내도 서버가 중복을 막는다).
 * 저장 모양은 { uploaded: [id], rejected: { id: 이유 코드 }, bodyVersion, omitEmpty: [id] }이다. 키는 그대로 두고 bodyVersion·omitEmpty를 더했다.
 * omitEmpty가 없는 예전 표시는 빈 목록으로 읽는다.
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
        omitEmpty: new Set(),
      }
      const ids = (value: unknown) =>
        new Set(
          Array.isArray(value)
            ? value.filter((id): id is string => typeof id === 'string')
            : [],
        )
      try {
        const raw = getStorage()?.getItem(key)
        if (!raw) return empty
        const parsed: unknown = JSON.parse(raw)
        if (typeof parsed !== 'object' || parsed === null) return empty
        const { uploaded, rejected, bodyVersion, omitEmpty } = parsed as Record<
          string,
          unknown
        >
        return {
          uploaded: ids(uploaded),
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
          omitEmpty: ids(omitEmpty),
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
            omitEmpty: [...marks.omitEmpty],
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
  /**
   * 사용자가 "완료한 운동만 다시 보내기"를 누른 기록 id. 거절 코드가 tooManyExercises인 기록만 받아들여(고칠 수 있는 기록)
   * 거절 표시를 지우고 omitEmpty 표시를 단 뒤 이번 실행에서 같은 requestId로 보낸다. 다른 기록은 무시한다.
   */
  retry?: ReadonlySet<string>
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
  for (const id of marks.omitEmpty) {
    if (!ids.has(id) || marks.uploaded.has(id)) marks.omitEmpty.delete(id)
  }
  const byId = new Map(items.map((record) => [record.id, record]))
  // 운동 수 상한: 예전에 보내서 INVALID_REQUEST로 거절된 기록 중 운동이 100개를 넘는 것은 그 이유로 다시 분류한다(요청 없이 기록만 본다).
  // 이 판정이 없던 때 거절된 기록도 화면이 이유를 보여 주고, 고칠 수 있으면 다시 보낼 수 있게 하기 위해서다.
  for (const [id, code] of marks.rejected) {
    if (code !== 'INVALID_REQUEST') continue
    const record = byId.get(id)
    const limit = record
      ? exerciseLimitRejection(record, marks.omitEmpty.has(id))
      : null
    if (limit) marks.rejected.set(id, limit)
  }
  // 사용자가 고쳐 보내기로 한 기록(고칠 수 있는 거절만): 거절을 지우고 완료한 세트가 없는 운동을 빼고 보낸다.
  for (const id of deps.retry ?? []) {
    if (marks.rejected.get(id) !== TOO_MANY_EXERCISES) continue
    marks.rejected.delete(id)
    marks.omitEmpty.add(id)
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
      const omitEmpty = marks.omitEmpty.has(record.id)
      // 서버가 받지 않을 운동 수면 보내지 않고 이유를 남긴다(같은 본문은 늘 400이다).
      const limit = exerciseLimitRejection(record, omitEmpty)
      if (limit) {
        marks.rejected.set(record.id, limit)
        summary.rejected += 1
        continue
      }
      let session: WorkoutSession | null
      try {
        session = await deps.sessions.get(record.sessionId)
      } catch (error) {
        summary.stoppedBy = error
        break
      }
      const body = session
        ? toRecordUploadBody(record, session, { omitEmptyExercises: omitEmpty })
        : null
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
