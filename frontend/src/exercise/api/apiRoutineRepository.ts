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
  MAX_ROUTINE_DESCRIPTION,
  MAX_ROUTINE_NAME,
  ROUTINE_SCHEMA_VERSION,
  buildRoutine,
  parseWorkoutRoutine,
  validateRoutineMeta,
  type WorkoutRoutine,
} from '../workoutRoutineModel.ts'
import type { WorkoutListItem } from '../workoutTypes.ts'

/**
 * 운동 루틴 API(/api/v1/workout-routines, docs/api_exercise_v1.0.md "운동 루틴")를 WorkoutRoutineRepository로 보여 주는 저장소.
 * 운영 빌드에서 쓴다(workoutSource.ts). 개발 서버는 지금처럼 IndexedDB 로컬 저장소를 쓴다.
 *
 * - 화면이 쓰는 규칙은 로컬 저장소와 같다. 저장 전에 같은 검증(buildRoutine: 이름·소개, 운동 구성)을 먼저 하고, 서버가 더 좁게 막는 값
 *   (운동 100개, 횟수 999, 중량 999kg·소수 둘째 자리)도 보내기 전에 걸러 invalidDraft로 알린다. 서버 응답은 로컬 저장값과 같은 검증
 *   (parseWorkoutRoutine)을 거치고, 모양이 맞지 않는 루틴은 목록에서 빼고 개수만 알린다(skippedCount).
 * - 이 앱의 루틴 모델에는 휴식 시간(restSeconds)이 없어서 저장소가 직접 지킨다. 수정 전에 서버의 현재 루틴을 읽어, 운동 구성이
 *   그대로면 items를 보내지 않고(이름·소개만 수정), 바뀌었으면 남긴 줄의 휴식 시간을 서버 값 그대로 붙여 보낸다. 줄은 편집 화면이
 *   넘긴 sourceItemIndexes(초안 항목이 수정 전 몇 번째 항목이었는지)로 찾아서, 같은 운동이 두 줄이어도 섞이지 않는다.
 *   새로 넣은 운동은 휴식 시간 없이 보낸다.
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
 * 항목·세트 값·revision·시각은 로컬 저장값과 같은 parseWorkoutRoutine 규칙으로 검사한다.
 *
 * 서버에서는 올바른데 이 앱의 저장 규칙보다 넓은 값은 읽어서 보여 준다(다른 클라이언트가 만든 루틴도 열고 지울 수 있게).
 * - 이름 50자·소개 200자 초과: 그대로 보여 주고, 수정해서 저장할 때 이름·소개 검증(invalidRoutineMeta)이 줄이라고 안내한다.
 * - requestId 없음: 서버 저장소는 requestId를 다시 쓰지 않으므로(재전송은 생성 때만) `server-<id>` 자리 값을 넣는다.
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
  const name = raw.routineName
  const description = raw.description ?? ''
  if (
    !items ||
    !createdAt ||
    !updatedAt ||
    typeof name !== 'string' ||
    name.trim() === '' ||
    typeof description !== 'string'
  ) {
    return null
  }
  const requestId = isValidRequestId(raw.requestId)
    ? raw.requestId
    : `server-${raw.routineId}`
  // 이름·소개 길이만 이 앱의 규칙 안으로 줄여서 나머지를 검사하고, 통과하면 원래 이름·소개를 돌려준다.
  const checked = parseWorkoutRoutine({
    id: String(raw.routineId),
    ownerId,
    schemaVersion: ROUTINE_SCHEMA_VERSION,
    name: name.slice(0, MAX_ROUTINE_NAME),
    description: description.slice(0, MAX_ROUTINE_DESCRIPTION),
    items,
    revision: raw.revision,
    requestId,
    createdAt,
    updatedAt,
  })
  return checked ? { ...checked, name, description } : null
}

/**
 * 서버(SetTargetValidator, RoutineCreateRequest)가 앱의 초안 규칙보다 좁게 막는 값. 넘으면 서버에 보내지 않고 invalidDraft다.
 * 횟수·중량 상한과 중량 자릿수는 이제 초안 검증(validateDraft)도 같은 규칙으로 막는다. 여기서는 한 번 더 확인한다.
 */
const SERVER_MAX_ITEMS = 100
const SERVER_MAX_REPS = 999
const SERVER_MAX_WEIGHT_KG = 999

function withinServerLimits(items: readonly WorkoutListItem[]): boolean {
  if (items.length > SERVER_MAX_ITEMS) return false
  return items.every((item) =>
    item.sets.every((set) => {
      if ('reps' in set && set.reps > SERVER_MAX_REPS) return false
      if ('weightKg' in set && set.weightKg !== undefined) {
        const cents = set.weightKg * 100
        // 소수 둘째 자리까지(부동소수 오차는 허용).
        if (set.weightKg > SERVER_MAX_WEIGHT_KG) return false
        if (Math.abs(cents - Math.round(cents)) > 1e-6) return false
      }
      return true
    }),
  )
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
    // 이름·소개가 맞으면 초안(세트 목표 등)이 틀린 것이다.
    const metaOk = validateRoutineMeta(input.name, input.description).ok
    throw new WorkoutStoreError('validation', {
      code: metaOk ? 'invalidDraft' : 'invalidRoutineMeta',
    })
  }
  if (!withinServerLimits(routine.items)) {
    throw new WorkoutStoreError('validation', { code: 'invalidDraft' })
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

type RequestItem = ReturnType<typeof toRequestBody>['items'][number]

/** 서버 루틴의 항목 중 수정 때 비교·보존에 쓰는 값. 모양이 맞지 않는 값은 비교에서 다른 것으로 보고 휴식 시간은 없는 것으로 본다. */
interface ServerItem {
  exerciseId: unknown
  recordType: unknown
  sets: unknown
  restSeconds: number | undefined
}

/** 서버 루틴(GET 응답)의 항목. 내 루틴이 아니거나 항목 목록이 없으면 null(알 수 없음). */
function serverItemsOf(raw: unknown, ownerId: string): ServerItem[] | null {
  if (!isRecord(raw) || String(raw.ownerUserId) !== ownerId) return null
  if (!Array.isArray(raw.items)) return null
  return raw.items.map((item: unknown) => {
    const value = isRecord(item) ? item : {}
    const rest = value.restSeconds
    return {
      exerciseId: value.exerciseId,
      recordType: value.recordType,
      sets: value.sets,
      restSeconds:
        typeof rest === 'number' && Number.isSafeInteger(rest) && rest >= 0
          ? rest
          : undefined,
    }
  })
}

const SET_FIELDS = ['reps', 'weightKg', 'targetSeconds'] as const

function sameSets(serverSets: unknown, sets: RequestItem['sets']): boolean {
  if (!Array.isArray(serverSets) || serverSets.length !== sets.length) {
    return false
  }
  return sets.every((set, index) => {
    const serverSet: unknown = serverSets[index]
    if (!isRecord(serverSet)) return false
    const mine = set as Partial<Record<(typeof SET_FIELDS)[number], number>>
    return SET_FIELDS.every(
      (field) => (serverSet[field] ?? undefined) === mine[field],
    )
  })
}

/** 운동 구성(운동·기록 방식·세트 목표와 순서)이 서버의 현재 항목과 같은가. 같으면 items를 보내지 않는다. */
function sameItems(
  serverItems: readonly ServerItem[],
  items: readonly RequestItem[],
): boolean {
  return (
    serverItems.length === items.length &&
    items.every((item, index) => {
      const server = serverItems[index]
      return (
        server.exerciseId === item.exerciseId &&
        server.recordType === item.recordType &&
        sameSets(server.sets, item.sets)
      )
    })
  )
}

/**
 * 남은 줄에 서버의 휴식 시간을 붙인다. `sourceIndexes`(줄마다 수정 전 몇 번째 항목이었는지)가 있으면 그 줄을 그대로 쓴다.
 * 같은 운동이 두 줄 있어도 남긴 줄의 값이 따라가고, 그 자리의 운동이 다르면 붙이지 않는다. 줄 정보를 주지 않은 호출만
 * 예전처럼 운동 id로 앞에서부터 찾는다(서버 항목 하나는 한 번만 쓴다).
 */
function withRestSeconds(
  serverItems: readonly ServerItem[],
  items: readonly RequestItem[],
  sourceIndexes: readonly (number | undefined)[] | null,
): (RequestItem & { restSeconds?: number })[] {
  const used = new Set<number>()
  return items.map((item, position) => {
    let index: number
    if (sourceIndexes) {
      const source = sourceIndexes[position]
      index =
        source !== undefined &&
        serverItems[source]?.exerciseId === item.exerciseId
          ? source
          : -1
    } else {
      index = serverItems.findIndex(
        (server, i) => !used.has(i) && server.exerciseId === item.exerciseId,
      )
    }
    if (index < 0 || used.has(index)) return item
    used.add(index)
    const rest = serverItems[index].restSeconds
    return rest === undefined ? item : { ...item, restSeconds: rest }
  })
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
        if (page + 1 === MAX_PAGES) {
          // 상한을 넘는 나머지 루틴은 받지 않는다. 화면이 "N개 제외"로 알 수 있게 그 수를 센다.
          const total =
            typeof data.totalElements === 'number' ? data.totalElements : 0
          skippedCount += Math.max(0, total - MAX_PAGES * PAGE_SIZE)
        }
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
      const { items, ...meta } = toRequestBody(input, ownerId)
      // 앱 모델에 없는 휴식 시간을 지키려고 서버의 현재 항목을 먼저 읽는다. 없는 루틴·다른 회원의 비공개 루틴은 여기서
      // PATCH와 같은 notFound가 된다. 다른 회원의 공개 루틴처럼 내 루틴이 아니면 항목을 알 수 없는 것으로 두고 예전처럼 보내,
      // 결과(ACCESS_DENIED → notFound)는 서버가 정한다. revision이 다르면 PATCH가 expectedRevision으로 막으므로
      // 여기서 읽은 휴식 시간은 성공하는 PATCH의 revision과 항상 같은 때의 값이다.
      const current = await call<unknown>('GET', `${BASE}/${routineId}`)
      const serverItems = serverItemsOf(current, ownerId)
      // 줄 정보는 화면이 읽은 루틴(expectedRevision) 기준이다. 서버 revision이 다르면 자리가 맞지 않으므로 휴식 시간을 붙이지
      // 않는다(이 PATCH는 서버가 REVISION_MISMATCH로 막는다). toRequestBody는 초안 항목을 순서 그대로 하나씩 바꾸므로
      // items[i]는 input.draft.items[i]에서 왔다.
      const sourceIndexes = input.sourceItemIndexes
        ? isRecord(current) && current.revision === input.expectedRevision
          ? input.draft.items.map((item) =>
              input.sourceItemIndexes?.get(item.itemId),
            )
          : input.draft.items.map(() => undefined)
        : null
      const body =
        serverItems && sameItems(serverItems, items)
          ? // 운동 구성이 그대로면 items를 보내지 않는다(서버는 null·생략을 "바꾸지 않음"으로 본다).
            { ...meta, expectedRevision: input.expectedRevision }
          : {
              ...meta,
              items: serverItems
                ? withRestSeconds(serverItems, items, sourceIndexes)
                : items,
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
