import { registerAccountCleanup } from '../auth/accountScope.ts'
import {
  createStorageMarkStore,
  createUploadRunner,
  uploadPendingRecords,
  type UploadMarks,
} from './api/recordUpload.ts'
import {
  createIndexedDbWorkoutRecordRepository,
  createIndexedDbWorkoutSessionRepository,
} from './local/indexedDbWorkoutRepositories.ts'

/**
 * 완료 기록 서버 업로드의 출처(api/recordUpload.ts). 운영 빌드에서만 올린다.
 * 개발 서버는 개발용 카탈로그를 써서 운동 id가 서버와 달라 올리지 않는다(import.meta.env.DEV는 빌드 때 상수로 바뀐다).
 *
 * - 결과 화면(W15)에서 기록을 완료했을 때와 운동 대시보드(W01)를 열 때 요청한다. 앞서 실패한 기록도 이때 다시 보낸다.
 * - 로그인·로그아웃하면(clearAccountScopedData) 세대가 바뀌어, 그 전에 요청한 업로드는 다음 기록부터 보내지 않는다.
 *   요청은 그때 로그인한 계정의 토큰으로 나가므로 다른 계정의 기록을 새 계정으로 올리지 않기 위해서다.
 * - 나중에 될 수 있는 실패(네트워크 등)는 화면에 알리지 않는다. 기록은 이 브라우저에 그대로 있고 다음 요청 때 다시 보낸다.
 * - 서버가 받지 않는 기록(거절)은 이유가 표시(marks)에 남고, 결과 화면이 그 이유를 보여 준다(readRecordUploadMarks).
 *   고칠 수 있는 거절(운동 100개 초과)은 사용자가 "완료한 운동만 다시 보내기"를 누르면 requestRecordRetry로 다시 보낸다.
 *   다시 보내기도 같은 실행기(runUpload)로 돌아서 자동 업로드와 동시에 같은 기록을 보내지 않고, 표시를 서로 덮어쓰지 않는다.
 */

/** 계정별로 사용자가 다시 보내기를 누른 기록 id. 다음 실행이 가져가서(takeRetries) uploadPendingRecords에 넘긴다. */
const retries = new Map<string, Set<string>>()

let generation = 0
registerAccountCleanup(() => {
  generation += 1
  retries.clear()
})

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function takeRetries(ownerId: string): Set<string> {
  const taken = retries.get(ownerId) ?? new Set<string>()
  retries.delete(ownerId)
  return taken
}

/** 업로드 실행이 끝날 때마다(표시가 바뀌었을 수 있다) 부르는 구독자. 결과 화면이 거절 이유를 다시 읽는다. */
const listeners = new Set<() => void>()
let marksVersion = 0

/** 업로드 표시가 바뀌었을 수 있을 때 알림을 받는다. 돌려준 함수로 구독을 끝낸다(useSyncExternalStore 모양). */
export function subscribeRecordUploads(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 표시가 바뀔 때마다 커지는 값(useSyncExternalStore의 스냅샷). */
export function recordUploadMarksVersion(): number {
  return marksVersion
}

/** 이 계정의 업로드 표시(올렸음·거절 이유·고쳐 보내기). 개발 서버는 올리지 않으므로 표시가 없다. */
export function readRecordUploadMarks(ownerId: string): UploadMarks {
  return createStorageMarkStore(ownerId, localStorageOrNull).read()
}

/**
 * 실행 키는 "세대:계정"이다. 요청한 때의 세대로 묶어서, 계정이 바뀐 뒤에 다시 도는 실행이 새 계정의 토큰으로
 * 이전 계정의 기록을 보내지 않게 한다.
 */
const runUpload = createUploadRunner(async (key) => {
  const separator = key.indexOf(':')
  const started = Number(key.slice(0, separator))
  const ownerId = key.slice(separator + 1)
  if (generation !== started) return
  try {
    await uploadPendingRecords({
      records: createIndexedDbWorkoutRecordRepository(ownerId),
      sessions: createIndexedDbWorkoutSessionRepository(ownerId),
      marks: createStorageMarkStore(ownerId, localStorageOrNull),
      isCurrent: () => generation === started,
      retry: takeRetries(ownerId),
    })
  } finally {
    marksVersion += 1
    for (const listener of listeners) listener()
  }
})

/** 이 계정의 올리지 않은 완료 기록을 서버에 올리도록 요청한다. 기다리지 않아도 되고 실패해도 던지지 않는다. */
export function requestRecordUpload(ownerId: string): void {
  if (import.meta.env.DEV) return
  void runUpload(`${generation}:${ownerId}`)
}

/**
 * 운동 100개 초과로 거절된 기록을 완료한 세트가 없는 운동을 빼고 같은 requestId(기록 id)로 다시 보낸다.
 * 끝나면(성공·거절·나중에 될 수 있는 실패 모두) 풀린다. 결과는 표시(readRecordUploadMarks)로 확인한다. 던지지 않는다.
 * 고칠 수 없는 거절이면 아무것도 보내지 않는다(uploadPendingRecords가 tooManyExercises만 받아들인다).
 */
export function requestRecordRetry(
  ownerId: string,
  recordId: string,
): Promise<void> {
  if (import.meta.env.DEV) return Promise.resolve()
  const pending = retries.get(ownerId) ?? new Set<string>()
  pending.add(recordId)
  retries.set(ownerId, pending)
  return runUpload(`${generation}:${ownerId}`)
}
