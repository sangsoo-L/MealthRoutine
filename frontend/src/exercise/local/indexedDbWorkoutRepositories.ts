import {
  abandonStatus,
  applyProgress,
  buildWorkoutList,
  buildWorkoutRecord,
  createWorkoutSession,
  isLocalDate,
  isValidOwnerId,
  isValidRequestId,
  parseWorkoutList,
  parseWorkoutRecord,
  parseWorkoutSession,
  readOwnerId,
  restoreTimer,
  sameListItems,
  validateProgressInput,
} from '../workoutModel.ts'
import {
  WorkoutStoreError,
  type CompleteSessionResult,
  type ListQueryResult,
  type SaveListFromDraftInput,
  type SaveListResult,
  type StartSessionResult,
  type WorkoutListRepository,
  type WorkoutRecordRepository,
  type WorkoutSessionRepository,
} from '../workoutRepositories.ts'
import {
  DEV_CATALOG_VERSION,
  type LocalDate,
  type SessionProgressInput,
  type WorkoutList,
  type WorkoutRecord,
  type WorkoutSession,
} from '../workoutTypes.ts'
import {
  INDEX,
  STORE_LISTS,
  STORE_RECORDS,
  STORE_SESSIONS,
  newRecordId,
  requestResult,
  runTransaction,
} from './exerciseDb.ts'

/**
 * [개발 전용] 운동 목록·수행 세션·완료 기록의 IndexedDB 저장소(로컬 MVP). 개발 서버에서만 불러온다(exercise/workoutSource.ts).
 *
 * 계정 격리: 저장소는 계정 id로 만들고, 모든 조회는 ownerId로 시작하는 인덱스 범위만 쓴다. id로 읽은 값도 ownerId가 다르면
 * 없는 것으로 본다(존재 여부도 드러내지 않는다). 모든 쓰기는 같은 트랜잭션 안에서 소유자와 상태를 다시 확인한다.
 * 이 격리는 화면 사이의 데이터 섞임을 막는 규칙이며 보안 수단이 아니다(같은 출처의 스크립트는 DB를 직접 읽을 수 있다).
 *
 * 무결성: 여러 저장소를 함께 바꾸는 작업(세션 시작, 완료)은 하나의 readwrite 트랜잭션이다. readwrite 트랜잭션은 같은 저장소에 대해
 * 탭 사이에서도 차례로 실행되므로, 진행 중 세션 확인과 생성 사이에 다른 탭이 끼어들 수 없다.
 */

export interface LocalRepositoryOptions {
  /** 현재 시각(테스트에서 고정할 수 있다). */
  now?: () => Date
  /** 레코드 id 생성(테스트에서 고정할 수 있다). */
  newId?: () => string
}

const DEFAULT_RECENT_LIMIT = 20
const MAX_RECENT_LIMIT = 100

/** 계정 id는 저장값 검증과 같은 규칙(비어 있지 않은 200자 이하)을 따른다. 쓰기는 되고 읽기는 실패하는 일을 막는다. */
function assertOwner(ownerId: string): void {
  if (!isValidOwnerId(ownerId)) {
    throw new WorkoutStoreError('validation', { code: 'invalidOwner' })
  }
}

function corrupt(): WorkoutStoreError {
  return new WorkoutStoreError('error', { code: 'corruptRecord' })
}

/** 저장된 값을 검증한다. 값이 없으면 null, 모양이 맞지 않으면 손상 오류다. */
function parseStored<T>(
  raw: unknown,
  parse: (value: unknown) => T | null,
): T | null {
  if (raw === undefined) return null
  const parsed = parse(raw)
  if (parsed === null) throw corrupt()
  return parsed
}

/**
 * id로 읽은 저장값을 이 계정의 값으로 검증한다. 소유자를 먼저 확인하고 이 계정의 값만 전체 검증한다.
 * - 값이 없거나 다른 계정의 값이면 null(손상 여부와 관계없이 없음과 같다. 존재 여부를 드러내지 않는다).
 * - 소유자 정보 자체를 읽을 수 없는 값, 이 계정의 손상된 값은 손상 오류다(저장값은 바꾸거나 지우지 않는다).
 */
function parseOwned<T>(
  raw: unknown,
  parse: (value: unknown) => T | null,
  ownerId: string,
): T | null {
  if (raw === undefined) return null
  const owner = readOwnerId(raw)
  if (owner === null) throw corrupt()
  if (owner !== ownerId) return null
  const parsed = parse(raw)
  if (parsed === null) throw corrupt()
  return parsed
}

/**
 * 쓰기 직전의 최종 레코드를 읽기와 같은 검증(parse)으로 확인한다. 통과하지 못하면 validation이며 아무것도 쓰지 않는다.
 * 저장에 성공한 값이 나중에 읽기 검증에서 손상으로 판정되는 일을 막는다.
 */
function assertWritable<T>(
  value: T,
  parse: (raw: unknown) => unknown,
  code?: 'invalidDraft' | 'invalidProgress',
): T {
  if (parse(value) === null) {
    throw new WorkoutStoreError('validation', code ? { code } : undefined)
  }
  return value
}

/** [ownerId, *] 복합 인덱스에서 이 계정의 전체 범위. 배열 키는 다른 모든 키 종류보다 뒤에 정렬된다. */
function ownerRange(ownerId: string): IDBKeyRange {
  return IDBKeyRange.bound([ownerId], [ownerId, []])
}

/**
 * 조회 범위의 행을 이 계정의 정상 값과 손상 수로 나눈다. 건너뛰는 것은 저장값 검증(parse)이 null을 돌려준 행뿐이다.
 * parse 밖에서 던져진 예외(코드 오류 등)는 삼키지 않고 그대로 전파한다. 소유자를 읽을 수 없는 행은 손상으로 세고,
 * 다른 계정의 행은 세지도 보이지도 않는다(조회 범위가 계정별이라 정상적으로는 섞이지 않는다).
 */
function splitRows<T extends { ownerId: string }>(
  raws: readonly unknown[],
  parse: (value: unknown) => T | null,
  ownerId: string,
): { valid: T[]; skippedCount: number } {
  const valid: T[] = []
  let skippedCount = 0
  for (const raw of raws) {
    const owner = readOwnerId(raw)
    if (owner === null) {
      skippedCount += 1
      continue
    }
    if (owner !== ownerId) continue
    const parsed = parse(raw)
    if (parsed === null) skippedCount += 1
    else valid.push(parsed)
  }
  return { valid, skippedCount }
}

/** 커서로 최대 limit개를 모은다. */
function collectCursor(
  request: IDBRequest<IDBCursorWithValue | null>,
  limit: number,
): Promise<unknown[]> {
  return new Promise<unknown[]>((resolve, reject) => {
    const values: unknown[] = []
    request.onsuccess = () => {
      const cursor = request.result
      if (!cursor || values.length >= limit) {
        resolve(values)
        return
      }
      values.push(cursor.value)
      cursor.continue()
    }
    request.onerror = () => reject(request.error)
  })
}

function byCreatedAt(a: WorkoutList, b: WorkoutList): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0
}

function byStartedAt(a: WorkoutSession, b: WorkoutSession): number {
  return a.startedAt < b.startedAt ? -1 : a.startedAt > b.startedAt ? 1 : 0
}

function byCompletedAt(a: WorkoutRecord, b: WorkoutRecord): number {
  return a.completedAt < b.completedAt
    ? -1
    : a.completedAt > b.completedAt
      ? 1
      : 0
}

function checkRevision(
  session: WorkoutSession,
  expectedRevision: number | undefined,
): void {
  if (expectedRevision !== undefined && expectedRevision !== session.revision) {
    throw new WorkoutStoreError('conflict', {
      code: 'revisionMismatch',
      currentRevision: session.revision,
    })
  }
}

// ─── 운동 목록 ──────────────────────────────────────────────

export function createIndexedDbWorkoutListRepository(
  ownerId: string,
  options: LocalRepositoryOptions = {},
): WorkoutListRepository {
  assertOwner(ownerId)
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? newRecordId

  return {
    kind: 'local',

    async saveFromDraft(
      input: SaveListFromDraftInput,
    ): Promise<SaveListResult> {
      if (!isValidRequestId(input.requestId)) {
        throw new WorkoutStoreError('validation', { code: 'invalidRequestId' })
      }
      const candidate = buildWorkoutList({
        id: newId(),
        ownerId,
        requestId: input.requestId,
        draft: input.draft,
        knownExerciseIds: input.knownExerciseIds,
        catalogVersion: DEV_CATALOG_VERSION,
        now: now(),
      })
      if (!candidate) {
        throw new WorkoutStoreError('validation', { code: 'invalidDraft' })
      }
      // 초안 검증(validateDraft)은 이름·id 길이와 개수 상한을 보지 않으므로 저장 형식으로 한 번 더 확인한다.
      assertWritable(candidate, parseWorkoutList, 'invalidDraft')
      return runTransaction([STORE_LISTS], 'readwrite', async (tx) => {
        const store = tx.objectStore(STORE_LISTS)
        const existing = parseStored(
          await requestResult(
            store
              .index(INDEX.listsByOwnerRequest)
              .get([ownerId, input.requestId]),
          ),
          parseWorkoutList,
        )
        if (existing) {
          // 같은 요청의 재전송이면 처음 저장한 목록을 돌려준다. 같은 요청 id에 다른 구성이 오면 조용히 넘기지 않는다.
          if (!sameListItems(existing.items, candidate.items)) {
            throw new WorkoutStoreError('conflict', { code: 'requestConflict' })
          }
          return { list: existing, created: false }
        }
        await requestResult(store.add(candidate))
        return { list: candidate, created: true }
      })
    },

    async get(listId: string): Promise<WorkoutList | null> {
      return runTransaction([STORE_LISTS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(tx.objectStore(STORE_LISTS).get(listId)),
          parseWorkoutList,
          ownerId,
        ),
      )
    },

    async listRecent(
      limit = DEFAULT_RECENT_LIMIT,
    ): Promise<ListQueryResult<WorkoutList>> {
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_RECENT_LIMIT) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_LISTS], 'readonly', async (tx) => {
        // 손상 행이 앞에 있어도 정상 레코드가 limit 때문에 빠지지 않도록 범위 전체를 최근 순으로 읽고, 정상 값에서 limit개를 고른다.
        const raws = await collectCursor(
          tx
            .objectStore(STORE_LISTS)
            .index(INDEX.listsByOwnerUpdated)
            .openCursor(ownerRange(ownerId), 'prev'),
          Number.POSITIVE_INFINITY,
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseWorkoutList,
          ownerId,
        )
        return { items: valid.slice(0, limit), skippedCount }
      })
    },

    async listByDate(
      plannedDate: LocalDate,
    ): Promise<ListQueryResult<WorkoutList>> {
      if (!isLocalDate(plannedDate)) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_LISTS], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_LISTS)
            .index(INDEX.listsByOwnerDate)
            .getAll(IDBKeyRange.only([ownerId, plannedDate])),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseWorkoutList,
          ownerId,
        )
        return { items: valid.sort(byCreatedAt), skippedCount }
      })
    },
  }
}

// ─── 수행 세션 ──────────────────────────────────────────────

export function createIndexedDbWorkoutSessionRepository(
  ownerId: string,
  options: LocalRepositoryOptions = {},
): WorkoutSessionRepository {
  assertOwner(ownerId)
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? newRecordId

  /** 이 계정의 진행 중 세션(시작 순서). 정상이라면 0개 또는 1개다. */
  async function activeSessions(tx: IDBTransaction): Promise<WorkoutSession[]> {
    const raws = await requestResult(
      tx
        .objectStore(STORE_SESSIONS)
        .index(INDEX.sessionsByOwnerStatus)
        .getAll(IDBKeyRange.only([ownerId, 'in_progress'])),
    )
    // 진행 중 세션은 건너뛰지 않는다: 손상된 진행 중 세션을 빼고 새 세션을 만들면 진행 중 세션이 둘이 될 수 있다.
    // 그래서 하나라도 손상이면 전용 오류(error/activeSessionCorrupt)로 조회·시작을 막고 저장값은 지우지 않는다(복구는 별도 승인 대상).
    // 한계: 진행 중 여부는 status 인덱스로 찾으므로 status 값 자체가 깨진 행은 진행 중 세션으로 보이지 않는다.
    return raws
      .map((raw) => {
        const session = raw === undefined ? null : parseWorkoutSession(raw)
        if (!session || session.ownerId !== ownerId) {
          throw new WorkoutStoreError('error', { code: 'activeSessionCorrupt' })
        }
        return session
      })
      .sort(byStartedAt)
  }

  /** 동작 대상 세션. 없거나 다른 계정 것이면 notFound. */
  async function targetSession(
    tx: IDBTransaction,
    sessionId: string,
  ): Promise<WorkoutSession> {
    const session = parseOwned(
      await requestResult(tx.objectStore(STORE_SESSIONS).get(sessionId)),
      parseWorkoutSession,
      ownerId,
    )
    if (!session) throw new WorkoutStoreError('notFound')
    return session
  }

  return {
    kind: 'local',

    async startOrResume(listId: string): Promise<StartSessionResult> {
      return runTransaction(
        [STORE_LISTS, STORE_SESSIONS],
        'readwrite',
        async (tx) => {
          const list = parseOwned(
            await requestResult(tx.objectStore(STORE_LISTS).get(listId)),
            parseWorkoutList,
            ownerId,
          )
          if (!list) throw new WorkoutStoreError('notFound')
          const [active] = await activeSessions(tx)
          if (active) {
            if (active.listId === listId) {
              return { kind: 'resumed', session: active }
            }
            return {
              kind: 'activeSessionConflict',
              activeSessionId: active.id,
              activeListId: active.listId,
            }
          }
          const session = assertWritable(
            createWorkoutSession({ id: newId(), ownerId, list, now: now() }),
            parseWorkoutSession,
          )
          await requestResult(tx.objectStore(STORE_SESSIONS).add(session))
          return { kind: 'started', session }
        },
      )
    },

    async get(sessionId: string) {
      return runTransaction([STORE_SESSIONS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(tx.objectStore(STORE_SESSIONS).get(sessionId)),
          parseWorkoutSession,
          ownerId,
        ),
      )
    },

    async getActive() {
      return runTransaction([STORE_SESSIONS], 'readonly', async (tx) => {
        const [active] = await activeSessions(tx)
        return active ?? null
      })
    },

    async saveProgress(sessionId: string, input: SessionProgressInput) {
      return runTransaction([STORE_SESSIONS], 'readwrite', async (tx) => {
        const session = await targetSession(tx, sessionId)
        if (session.status !== 'in_progress') {
          throw new WorkoutStoreError('conflict', {
            code: 'sessionNotInProgress',
          })
        }
        if (!validateProgressInput(input, session.listSnapshot)) {
          throw new WorkoutStoreError('validation', { code: 'invalidProgress' })
        }
        checkRevision(session, input.expectedRevision)
        const next = assertWritable(
          applyProgress(session, input, now()),
          parseWorkoutSession,
          'invalidProgress',
        )
        await requestResult(tx.objectStore(STORE_SESSIONS).put(next))
        return next
      })
    },

    async complete(
      sessionId,
      completeOptions = {},
    ): Promise<CompleteSessionResult> {
      return runTransaction(
        [STORE_SESSIONS, STORE_RECORDS],
        'readwrite',
        async (tx) => {
          const session = await targetSession(tx, sessionId)
          const records = tx.objectStore(STORE_RECORDS)
          if (session.status === 'completed') {
            // 이미 완료된 세션: 기존 기록을 돌려준다(멱등). 기록이 없거나 맞지 않으면 손상이다.
            const record = parseOwned(
              await requestResult(records.get(session.recordId as string)),
              parseWorkoutRecord,
              ownerId,
            )
            if (!record || record.sessionId !== session.id) throw corrupt()
            return { session, record, created: false }
          }
          if (session.status !== 'in_progress') {
            throw new WorkoutStoreError('conflict', { code: 'sessionEnded' })
          }
          checkRevision(session, completeOptions.expectedRevision)
          const at = now()
          const record = buildWorkoutRecord({ id: newId(), session, now: at })
          if (!record) {
            throw new WorkoutStoreError('validation', {
              code: 'noCompletedSets',
            })
          }
          assertWritable(record, parseWorkoutRecord, 'invalidProgress')
          // bySession이 unique라 같은 세션의 기록이 이미 있으면 여기서 실패하고 트랜잭션 전체가 되돌아간다.
          await requestResult(records.add(record))
          const completed: WorkoutSession = {
            ...session,
            status: 'completed',
            // 마지막 저장 뒤의 시간은 확인할 수 없으므로 더하지 않는다(restoreTimer와 같은 규칙).
            timer: restoreTimer(session.timer, session.lastSavedAt),
            completedAt: record.completedAt,
            endedAt: record.completedAt,
            recordId: record.id,
            revision: session.revision + 1,
            lastSavedAt: record.completedAt,
          }
          assertWritable(completed, parseWorkoutSession, 'invalidProgress')
          await requestResult(tx.objectStore(STORE_SESSIONS).put(completed))
          return { session: completed, record, created: true }
        },
      )
    },

    async abandon(sessionId, abandonOptions = {}) {
      return runTransaction([STORE_SESSIONS], 'readwrite', async (tx) => {
        const session = await targetSession(tx, sessionId)
        if (
          session.status === 'interrupted' ||
          session.status === 'cancelled'
        ) {
          return session
        }
        if (session.status === 'completed') {
          throw new WorkoutStoreError('conflict', { code: 'sessionEnded' })
        }
        checkRevision(session, abandonOptions.expectedRevision)
        const at = now()
        const ended: WorkoutSession = {
          ...session,
          status: abandonStatus(session),
          // 마지막 저장 뒤의 시간은 확인할 수 없으므로 더하지 않는다(restoreTimer와 같은 규칙).
          timer: restoreTimer(session.timer, session.lastSavedAt),
          endedAt: at.toISOString(),
          revision: session.revision + 1,
          lastSavedAt: at.toISOString(),
        }
        assertWritable(ended, parseWorkoutSession, 'invalidProgress')
        await requestResult(tx.objectStore(STORE_SESSIONS).put(ended))
        return ended
      })
    },
  }
}

// ─── 완료 기록 ──────────────────────────────────────────────

export function createIndexedDbWorkoutRecordRepository(
  ownerId: string,
): WorkoutRecordRepository {
  assertOwner(ownerId)

  return {
    kind: 'local',

    async get(recordId: string) {
      return runTransaction([STORE_RECORDS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(tx.objectStore(STORE_RECORDS).get(recordId)),
          parseWorkoutRecord,
          ownerId,
        ),
      )
    },

    async listByDateRange(
      from: LocalDate,
      to: LocalDate,
    ): Promise<ListQueryResult<WorkoutRecord>> {
      if (!isLocalDate(from) || !isLocalDate(to) || from > to) {
        throw new WorkoutStoreError('validation')
      }
      return runTransaction([STORE_RECORDS], 'readonly', async (tx) => {
        const raws = await requestResult(
          tx
            .objectStore(STORE_RECORDS)
            .index(INDEX.recordsByOwnerDate)
            .getAll(IDBKeyRange.bound([ownerId, from], [ownerId, to])),
        )
        const { valid, skippedCount } = splitRows(
          raws,
          parseWorkoutRecord,
          ownerId,
        )
        return { items: valid.sort(byCompletedAt), skippedCount }
      })
    },

    async getBySession(sessionId: string) {
      return runTransaction([STORE_RECORDS], 'readonly', async (tx) =>
        parseOwned(
          await requestResult(
            tx
              .objectStore(STORE_RECORDS)
              .index(INDEX.recordsBySession)
              .get(sessionId),
          ),
          parseWorkoutRecord,
          ownerId,
        ),
      )
    },
  }
}
