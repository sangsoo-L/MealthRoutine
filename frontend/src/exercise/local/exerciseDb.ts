import { WorkoutStoreError } from '../workoutRepositories.ts'

/**
 * [개발 전용] 운동 로컬 MVP의 IndexedDB 연결·트랜잭션 도구. 개발 서버에서만 불러온다(exercise/workoutSource.ts가 import.meta.env.DEV로
 * 동적 import). 운영 빌드에는 포함되지 않는다. 브라우저 기본 IndexedDB API만 쓴다.
 *
 * - DB 하나(mealthroutine-exercise)에 Object Store 세 개(workoutLists·workoutSessions·workoutRecords). 운동 카탈로그는 넣지 않는다.
 * - 연결은 하나를 만들어 재사용한다. 다른 탭이 버전을 올리거나 DB를 지우면(versionchange, 개발자 도구의 DB 삭제 포함) 이 연결을
 *   닫고, 이후 요청은 versionChange 오류다(페이지를 다시 열어야 한다). 브라우저가 연결을 강제로 닫으면(close 이벤트) 다음 요청에서 다시 연다.
 * - IndexedDB는 접근 통제 수단이 아니다. 같은 출처의 스크립트·개발자 도구는 값을 읽고 바꿀 수 있으므로 읽은 값은 외부 입력으로 검증한다.
 */

export const EXERCISE_DB_NAME = 'mealthroutine-exercise'
export const EXERCISE_DB_VERSION = 1

export const STORE_LISTS = 'workoutLists'
export const STORE_SESSIONS = 'workoutSessions'
export const STORE_RECORDS = 'workoutRecords'

export type StoreName =
  typeof STORE_LISTS | typeof STORE_SESSIONS | typeof STORE_RECORDS

export const INDEX = {
  listsByOwnerDate: 'byOwnerDate',
  listsByOwnerUpdated: 'byOwnerUpdated',
  listsByOwnerRequest: 'byOwnerRequest',
  sessionsByOwnerStatus: 'byOwnerStatus',
  sessionsByOwnerStarted: 'byOwnerStarted',
  sessionsByOwnerList: 'byOwnerList',
  recordsBySession: 'bySession',
  recordsByOwnerDate: 'byOwnerDate',
  recordsByOwnerCompleted: 'byOwnerCompleted',
} as const

/** 버전별 스키마 생성. 새 버전은 아래에 단계를 더하고 oldVersion부터 차례로 실행한다(기존 단계는 고치지 않는다). */
function upgrade(db: IDBDatabase, oldVersion: number): void {
  if (oldVersion < 1) {
    const lists = db.createObjectStore(STORE_LISTS, { keyPath: 'id' })
    lists.createIndex(INDEX.listsByOwnerDate, ['ownerId', 'plannedDate'])
    lists.createIndex(INDEX.listsByOwnerUpdated, ['ownerId', 'updatedAt'])
    lists.createIndex(INDEX.listsByOwnerRequest, ['ownerId', 'requestId'], {
      unique: true,
    })

    const sessions = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
    sessions.createIndex(INDEX.sessionsByOwnerStatus, ['ownerId', 'status'])
    sessions.createIndex(INDEX.sessionsByOwnerStarted, ['ownerId', 'startedAt'])
    sessions.createIndex(INDEX.sessionsByOwnerList, ['ownerId', 'listId'])

    const records = db.createObjectStore(STORE_RECORDS, { keyPath: 'id' })
    records.createIndex(INDEX.recordsBySession, 'sessionId', { unique: true })
    records.createIndex(INDEX.recordsByOwnerDate, ['ownerId', 'performedDate'])
    records.createIndex(INDEX.recordsByOwnerCompleted, [
      'ownerId',
      'completedAt',
    ])
  }
}

/** 브라우저 오류를 저장 계층 오류로 바꾼다. 이미 저장 계층 오류면 그대로 둔다. */
export function toStoreError(error: unknown): WorkoutStoreError {
  if (error instanceof WorkoutStoreError) return error
  const name =
    error instanceof DOMException || error instanceof Error ? error.name : ''
  switch (name) {
    case 'QuotaExceededError':
      return new WorkoutStoreError('quota', { cause: error })
    case 'ConstraintError':
      return new WorkoutStoreError('conflict', {
        code: 'uniqueConstraint',
        cause: error,
      })
    case 'VersionError':
      return new WorkoutStoreError('versionChange', { cause: error })
    case 'SecurityError':
    case 'InvalidAccessError':
      return new WorkoutStoreError('unavailable', { cause: error })
    default:
      return new WorkoutStoreError('error', { cause: error })
  }
}

/** 연결 하나의 상태. 열기 요청마다 새로 만들고, 지금 쓰는 연결(current)과 같은 항목일 때만 전역 상태를 바꾼다. */
interface ConnectionEntry {
  promise: Promise<IDBDatabase> | null
  db: IDBDatabase | null
}

let current: ConnectionEntry | null = null
/** 다른 탭의 버전 변경·DB 삭제로 지금 연결이 닫혔다. 페이지를 다시 열기 전까지 새로 열지 않는다. */
let versionChanged = false

function factory(): IDBFactory | null {
  try {
    return typeof indexedDB === 'undefined' ? null : indexedDB
  } catch {
    // 일부 환경은 indexedDB에 접근만 해도 예외를 던진다(쿠키·저장소 차단 등).
    return null
  }
}

function openConnection(entry: ConnectionEntry): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const idb = factory()
    if (!idb) {
      reject(new WorkoutStoreError('unavailable'))
      return
    }
    let request: IDBOpenDBRequest
    try {
      request = idb.open(EXERCISE_DB_NAME, EXERCISE_DB_VERSION)
    } catch (error) {
      reject(new WorkoutStoreError('unavailable', { cause: error }))
      return
    }
    let settled = false
    request.onupgradeneeded = (event) => {
      upgrade(request.result, event.oldVersion)
    }
    request.onblocked = () => {
      // 다른 탭이 이전 버전 연결을 쥐고 있다. 기다리지 않고 알린다(나중에 열리면 아래 onsuccess가 연결을 닫는다).
      if (settled) return
      settled = true
      reject(new WorkoutStoreError('blocked'))
    }
    request.onerror = () => {
      if (settled) return
      settled = true
      reject(toStoreError(request.error))
    }
    request.onsuccess = () => {
      const db = request.result
      if (settled) {
        // 이미 blocked로 알린 요청이 늦게 열렸다. 이 연결은 쓰지 않는다.
        db.close()
        return
      }
      settled = true
      entry.db = db
      // 아래 두 처리는 이 연결이 지금 쓰는 연결일 때만 전역 상태를 바꾼다(정리된 이전 연결의 이벤트가 새 연결을 지우지 않게).
      db.onversionchange = () => {
        // 다른 탭이 버전을 올리거나 DB를 지우려 한다. 막지 않도록 바로 닫는다.
        db.close()
        if (current === entry) {
          current = null
          versionChanged = true
        }
      }
      db.onclose = () => {
        // 브라우저가 연결을 강제로 닫았다(저장소 접근 오류 등). 다음 요청에서 다시 연다.
        if (current === entry) current = null
      }
      resolve(db)
    }
  })
}

/** 재사용하는 DB 연결. 열기에 실패하면 다음 호출에서 다시 시도한다. */
export function openExerciseDb(): Promise<IDBDatabase> {
  if (versionChanged) {
    return Promise.reject(new WorkoutStoreError('versionChange'))
  }
  if (current?.promise) return current.promise
  const entry: ConnectionEntry = { promise: null, db: null }
  current = entry
  const promise = openConnection(entry)
  entry.promise = promise
  promise.catch(() => {
    if (current === entry) current = null
  })
  return promise
}

/** 연결을 닫고 상태를 처음으로 돌린다(테스트·정리용). versionChange 상태도 풀린다. 진행 중인 열기는 끝난 뒤 닫는다. */
export async function closeExerciseDb(): Promise<void> {
  const entry = current
  current = null
  versionChanged = false
  if (!entry?.promise) return
  try {
    ;(await entry.promise).close()
  } catch {
    // 열리지 않았던 연결은 닫을 것도 없다.
  }
}

/** 지금 연결 상태(진단·화면 안내용). */
export function exerciseDbState(): 'idle' | 'open' | 'versionChanged' {
  if (versionChanged) return 'versionChanged'
  return current ? 'open' : 'idle'
}

/** 요청 하나를 Promise로 바꾼다. 실패하면 브라우저 오류를 그대로 거부한다(트랜잭션 처리에서 바꾼다). */
export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 트랜잭션이 중단된 원인. 작업이 던진 저장 계층 오류(도메인 오류)를 우선하고, 그 밖에는 트랜잭션의 실제 원인(예: 할당량 초과)을
 * 작업 쪽 요청 오류보다 우선한다(대기 중이던 요청은 원인과 무관한 AbortError로 실패할 수 있다).
 */
function abortCause(workError: unknown, txError: DOMException | null): unknown {
  if (workError instanceof WorkoutStoreError) return workError
  return txError ?? workError
}

/**
 * 트랜잭션 하나를 실행한다.
 *
 * 성공 조건: 트랜잭션이 완료(complete)되었고, **그 시점에 work도 성공으로 끝나 있어야** 한다. 둘 중 하나라도 아니면 실패로 돌려준다.
 * - work가 실패하면(도메인 오류 포함) 트랜잭션을 중단해 그 안의 모든 쓰기를 되돌린다(부분 저장 없음).
 * - 트랜잭션이 work보다 먼저 끝나면(아래 계약 위반) 성공으로 처리하지 않고 오류를 돌려준다. 이때 이미 커밋된 쓰기는 되돌릴 수
 *   없으므로 이 방어는 "잘못된 성공 보고"를 막을 뿐 원자성을 보장하지 않는다. 원자성은 아래 계약으로 지킨다.
 *
 * 계약: work 안에서는 IndexedDB 요청의 결과만 기다린다. 네트워크·타이머·React 상태·다른 저장소·트랜잭션과 무관한 Promise를
 * 기다리지 않는다(기다리는 동안 요청이 없으면 브라우저가 트랜잭션을 자동으로 커밋한다). 시각·id처럼 필요한 값은 트랜잭션 전에 만든다.
 */
export async function runTransaction<T>(
  stores: readonly StoreName[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction) => Promise<T>,
): Promise<T> {
  const db = await openExerciseDb()
  return new Promise<T>((resolve, reject) => {
    let tx: IDBTransaction
    try {
      tx = db.transaction(stores as string[], mode)
    } catch (error) {
      // 연결이 닫혀 있으면 InvalidStateError가 난다. 지금 쓰는 연결이면 버리고 다음 요청에서 다시 연다.
      const closed =
        error instanceof DOMException && error.name === 'InvalidStateError'
      if (closed && current?.db === db) current = null
      reject(
        closed && versionChanged
          ? new WorkoutStoreError('versionChange', { cause: error })
          : toStoreError(error),
      )
      return
    }
    let workState: 'pending' | 'fulfilled' | 'rejected' = 'pending'
    let result: T
    let workError: unknown = null
    let finished = false
    const fail = (error: unknown) => {
      if (finished) return
      finished = true
      reject(toStoreError(error))
    }
    tx.oncomplete = () => {
      if (workState === 'fulfilled') {
        if (finished) return
        finished = true
        resolve(result)
        return
      }
      // 트랜잭션은 커밋되었지만 work가 끝나지 않았거나 실패했다: 성공으로 보고하지 않는다.
      fail(
        workState === 'rejected'
          ? workError
          : new WorkoutStoreError('error', {
              cause: new Error('transaction finished before work settled'),
            }),
      )
    }
    tx.onabort = () => fail(abortCause(workError, tx.error))
    work(tx).then(
      (value) => {
        workState = 'fulfilled'
        result = value
      },
      (error: unknown) => {
        workState = 'rejected'
        workError = error
        try {
          tx.abort()
        } catch {
          // 이미 끝난 트랜잭션은 중단할 수 없다. 중단 중이면 onabort가, 이미 커밋됐다면 oncomplete가(위에서) 실패로 처리했다.
        }
      },
    )
  })
}

/**
 * id 생성. crypto.randomUUID를 우선 쓰고, 보안 컨텍스트가 아니라 없는 환경(예: 개발 서버를 LAN 주소로 열 때)에서는
 * crypto.getRandomValues로 같은 형식의 UUID v4를 만든다. 둘 다 없으면 unavailable이다(Math.random으로 대체하지 않는다).
 */
export function newRecordId(): string {
  const c = typeof crypto === 'undefined' ? undefined : crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  if (c && typeof c.getRandomValues === 'function') {
    const bytes = c.getRandomValues(new Uint8Array(16))
    bytes[6] = (bytes[6] & 0x0f) | 0x40
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
  }
  throw new WorkoutStoreError('unavailable')
}
