import { registerAccountCleanup } from '../auth/accountScope.ts'
import {
  createStorageMarkStore,
  createUploadRunner,
  uploadPendingRecords,
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
 * - 실패는 화면에 알리지 않는다. 기록은 이 브라우저에 그대로 있고 다음 요청 때 다시 보낸다.
 */

let generation = 0
registerAccountCleanup(() => {
  generation += 1
})

function localStorageOrNull(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
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
  await uploadPendingRecords({
    records: createIndexedDbWorkoutRecordRepository(ownerId),
    sessions: createIndexedDbWorkoutSessionRepository(ownerId),
    marks: createStorageMarkStore(ownerId, localStorageOrNull),
    isCurrent: () => generation === started,
  })
})

/** 이 계정의 올리지 않은 완료 기록을 서버에 올리도록 요청한다. 기다리지 않아도 되고 실패해도 던지지 않는다. */
export function requestRecordUpload(ownerId: string): void {
  if (import.meta.env.DEV) return
  void runUpload(`${generation}:${ownerId}`)
}
