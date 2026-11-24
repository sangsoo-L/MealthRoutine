import {
  ApiError,
  apiRequest,
  type ApiRequestOptions,
  type HttpMethod,
} from '../../api/http.ts'
import { isValidRequestId } from '../workoutModel.ts'
import {
  WorkoutStoreError,
  type CreateRoutineInput,
  type ListQueryResult,
  type RoutineContentInput,
  type SaveRoutineResult,
  type UpdateRoutineInput,
  type WorkoutRoutineRepository,
} from '../workoutRepositories.ts'
import {
  ROUTINE_SCHEMA_VERSION,
  buildRoutine,
  parseWorkoutRoutine,
  type WorkoutRoutine,
} from '../workoutRoutineModel.ts'
import type { WorkoutListItem } from '../workoutTypes.ts'

/**
 * 운동 루틴 API(/api/v1/workout-routines, docs/api_exercise_v1.0.md "운동 루틴")를 WorkoutRoutineRepository로 보여 주는 저장소.
 * 운영 빌드에서 쓴다(workoutSource.ts). 개발 서버는 지금처럼 IndexedDB 로컬 저장소를 쓴다.
 *
 * - 화면이 쓰는 규칙은 로컬 저장소와 같다. 저장 전에 같은 검증(buildRoutine: 이름·소개, 운동 구성)을 먼저 하고, 서버 응답도
 *   로컬 저장값과 같은 검증(parseWorkoutRoutine)을 거친다. 모양이 맞지 않는 루틴은 목록에서 빼고 개수만 알린다(skippedCount).
 * - 목록은 내 루틴만 항목까지 한 번에 받는다(`mine=true&includeItems=true`, 최근 수정 순). 항목을 예전 방식(targetSets만)으로
 *   저장한 루틴은 세트별 목표가 없어 화면 모델로 바꿀 수 없으므로 목록에서 빼고(skippedCount), 상세 조회는 손상(corruptRecord)으로 본다.
 * - 생성은 requestId로 중복 저장을 막고(같은 요청 재전송이면 created: false), 수정·삭제는 expectedRevision으로 동시 수정을 막는다.
 *   서버 오류는 로컬 저장소와 같은 WorkoutStoreError(이유·코드)로 바꿔 화면 안내를 그대로 쓴다.
 * - 서버 시각(createdAt·updatedAt)은 시간대 없는 한국 시각이라 +09:00을 붙여 ISO(UTC) 문자열로 바꾼다.
 * - 루틴은 비공개(private)로 만든다. 공개·공유 설정은 화면에 아직 없다.
 */

type Request = <T>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>

const BASE = '/workout-routines'
const PAGE_SIZE = 100
/** 페이지 수 상한(루틴 2000개). 서버가 이상한 totalPages를 보내도 요청이 끝없이 이어지지 않게 한다. */
const MAX_PAGES = 20
const ROUTINE_ID = /^[1-9][0-9]{0,15}$/
const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** 서버의 시간대 없는 한국 시각 → ISO(UTC). 형식이 맞지 않으면 null. */
function kstToIso(value: unknown): string | null {
  if (typeof value !== 'string' || !LOCAL_DATE_TIME.test(value)) return null
  const time = new Date(`${value}+09:00`)
  return Number.isNaN(time.getTime()) ? null : time.toISOString()
}

function toItems(raw: unknown): WorkoutListItem[] | null {
  if (!Array.isArray(raw)) return null
  const items: WorkoutListItem[] = []
  for (const item of raw) {
    if (
      !isRecord(item) ||
      typeof item.exerciseId !== 'number' ||
      typeof item.exerciseName !== 'string' ||
      typeof item.recordType !== 'string' ||
      !Array.isArray(item.sets)
    ) {
      return null
    }
    items.push({
      exerciseId: String(item.exerciseId),
      exerciseNameSnapshot: item.exerciseName,
      recordType: item.recordType as WorkoutListItem['recordType'],
      sets: item.sets as WorkoutListItem['sets'],
    })
  }
  return items
}

/**
 * 서버 루틴 한 건 → 화면 모델. 내 루틴이 아니거나(주인 전용 값 없음) 모양이 맞지 않으면 null.
 * 마지막에 로컬 저장값과 같은 parseWorkoutRoutine을 거친다(세트 값·기록 방식·이름 길이까지 같은 규칙).
 */
export function toRoutine(
  raw: unknown,
  ownerId: string,
): WorkoutRoutine | null {
  if (!isRecord(raw)) return null
  if (
    typeof raw.routineId !== 'number' ||
    !Number.isSafeInteger(raw.routineId)
  ) {
    return null
  }
  if (String(raw.ownerUserId) !== ownerId) return null
  const items = toItems(raw.items)
  const createdAt = kstToIso(raw.createdAt)
  const updatedAt = kstToIso(raw.updatedAt)
  if (!items || !createdAt || !updatedAt) return null
  return parseWorkoutRoutine({
    id: String(raw.routineId),
    ownerId,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    name: raw.routineName,
    description: raw.description ?? '',
    items,
    revision: raw.revision,
    requestId: raw.requestId,
    createdAt,
    updatedAt,
  })
}

/** 저장 전 검증. 로컬 저장소와 같은 규칙으로 걸러 서버에 보낼 이름·소개·항목을 만든다. 올바르지 않으면 validation. */
function toRequestBody(input: RoutineContentInput, ownerId: string) {
  const routine = buildRoutine({
    id: 'pending',
    ownerId,
    requestId: 'pending',
    name: input.name,
    description: input.description,
    draft: input.draft,
    knownExerciseIds: input.knownExerciseIds,
    allowedRecordTypes: input.allowedRecordTypes,
    now: new Date(),
  })
  if (!routine) {
    throw new WorkoutStoreError('validation', { code: 'invalidRoutineMeta' })
  }
  const items = routine.items.map((item) => {
    const exerciseId = Number(item.exerciseId)
    if (!Number.isSafeInteger(exerciseId) || exerciseId < 1) {
      throw new WorkoutStoreError('validation', { code: 'invalidDraft' })
    }
    return {
      exerciseId,
      recordType: item.recordType,
      sets: item.sets.map((set) => ({ ...set })),
    }
  })
  // 소개는 빈 문자열도 그대로 보낸다(PATCH에서 null은 "바꾸지 않음"이라 소개를 지울 수 없다).
  return { routineName: routine.name, description: routine.description, items }
}

function currentRevisionOf(error: ApiError): number | undefined {
  const value = isRecord(error.data) ? error.data.currentRevision : undefined
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined
}

/** 서버 오류 → 로컬 저장소와 같은 WorkoutStoreError. */
function toStoreError(error: unknown): WorkoutStoreError {
  if (error instanceof WorkoutStoreError) return error
  if (error instanceof ApiError) {
    switch (error.errorCode) {
      case 'ROUTINE_NOT_FOUND':
      case 'ACCESS_DENIED':
        // 다른 회원의 루틴은 로컬 저장소처럼 "없음"으로 본다.
        return new WorkoutStoreError('notFound', { cause: error })
      case 'REVISION_MISMATCH':
        return new WorkoutStoreError('conflict', {
          code: 'revisionMismatch',
          currentRevision: currentRevisionOf(error),
          cause: error,
        })
      case 'REQUEST_CONFLICT':
        return new WorkoutStoreError('conflict', {
          code: 'requestConflict',
          cause: error,
        })
      case 'SET_TARGETS_WOULD_BE_LOST':
        return new WorkoutStoreError('conflict', { cause: error })
      case 'INVALID_REQUEST':
      case 'EXERCISE_NOT_FOUND':
        return new WorkoutStoreError('validation', {
          code: 'invalidDraft',
          cause: error,
        })
      default:
        break
    }
  }
  return new WorkoutStoreError('error', { cause: error })
}

function assertRoutineId(routineId: string): void {
  if (!ROUTINE_ID.test(routineId)) throw new WorkoutStoreError('notFound')
}

export function createApiRoutineRepository(
  ownerId: string,
  request: Request = apiRequest,
): WorkoutRoutineRepository {
  async function call<T>(
    method: HttpMethod,
    path: string,
    options?: ApiRequestOptions,
  ): Promise<T> {
    try {
      return await request<T>(method, path, options)
    } catch (error) {
      throw toStoreError(error)
    }
  }

  function saved(data: unknown): WorkoutRoutine {
    const routine = toRoutine(data, ownerId)
    if (!routine) {
      throw new WorkoutStoreError('error', { code: 'corruptRecord' })
    }
    return routine
  }

  return {
    kind: 'api',

    async create(input: CreateRoutineInput): Promise<SaveRoutineResult> {
      if (!isValidRequestId(input.requestId)) {
        throw new WorkoutStoreError('validation', { code: 'invalidRequestId' })
      }
      const body = {
        ...toRequestBody(input, ownerId),
        visibility: 'private',
        requestId: input.requestId,
      }
      const data = await call<unknown>('POST', BASE, { body })
      return {
        routine: saved(data),
        created: !(isRecord(data) && data.created === false),
      }
    },

    async get(routineId: string): Promise<WorkoutRoutine | null> {
      if (!ROUTINE_ID.test(routineId)) return null
      let data: unknown
      try {
        data = await call<unknown>('GET', `${BASE}/${routineId}`)
      } catch (error) {
        if (error instanceof WorkoutStoreError && error.reason === 'notFound') {
          return null
        }
        throw error
      }
      // 다른 회원의 공개 루틴은 내 루틴이 아니다(로컬 저장소처럼 없음).
      if (isRecord(data) && String(data.ownerUserId) !== ownerId) return null
      return saved(data)
    },

    async list(): Promise<ListQueryResult<WorkoutRoutine>> {
      const items: WorkoutRoutine[] = []
      let skippedCount = 0
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const data = await call<unknown>(
          'GET',
          `${BASE}?mine=true&includeItems=true&page=${page}&size=${PAGE_SIZE}`,
        )
        if (
          !isRecord(data) ||
          !Array.isArray(data.content) ||
          typeof data.totalPages !== 'number'
        ) {
          throw new WorkoutStoreError('error', { code: 'corruptRecord' })
        }
        for (const raw of data.content) {
          // mine=true라 다른 회원의 루틴은 오지 않는다. 옵션을 모르는 예전 서버가 공개 루틴을 섞어 보내도 읽을 수 없는 루틴으로 세지 않는다.
          if (isRecord(raw) && String(raw.ownerUserId) !== ownerId) continue
          const routine = toRoutine(raw, ownerId)
          if (routine) items.push(routine)
          else skippedCount += 1
        }
        if (page + 1 >= data.totalPages) break
      }
      return { items, skippedCount }
    },

    async update(
      routineId: string,
      input: UpdateRoutineInput,
    ): Promise<WorkoutRoutine> {
      if (!Number.isInteger(input.expectedRevision)) {
        throw new WorkoutStoreError('validation')
      }
      assertRoutineId(routineId)
      const body = {
        ...toRequestBody(input, ownerId),
        expectedRevision: input.expectedRevision,
      }
      return saved(
        await call<unknown>('PATCH', `${BASE}/${routineId}`, { body }),
      )
    },

    async delete(
      routineId: string,
      options?: { expectedRevision?: number },
    ): Promise<void> {
      assertRoutineId(routineId)
      const revision = options?.expectedRevision
      if (revision !== undefined && !Number.isInteger(revision)) {
        throw new WorkoutStoreError('validation')
      }
      const query =
        revision === undefined ? '' : `?expectedRevision=${revision}`
      await call<unknown>('DELETE', `${BASE}/${routineId}${query}`)
    },
  }
}
