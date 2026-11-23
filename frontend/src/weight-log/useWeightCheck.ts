import { useCallback, useEffect, useState } from 'react'
import { createNotificationRepository } from '../notifications/notificationSource.ts'
import { recordWeightAndComplete } from '../weight-notification/recordWithNotification.ts'
import { createWeightNotificationService } from '../weight-notification/weightNotificationService.ts'
import { createWeightLogRepository } from './weightLogSource.ts'
import {
  WeightLogError,
  type WeightCheckStatus,
  type WeightLogInput,
} from './weightLogTypes.ts'

export type WeightCheckState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; value: WeightCheckStatus }

/**
 * 몸무게 기록 뒤 알림 완료 처리의 상태.
 * - idle: 할 일이 없거나 끝났다(알림이 없거나 이미 처리 완료).
 * - failed: 몸무게 기록은 성공했지만 알림 완료 처리만 실패했다. 기록을 다시 하지 않고 완료 처리만 다시 시도할 수 있다.
 * - retrying: 그 재시도가 진행 중이다.
 */
export type NotificationSyncState = 'idle' | 'failed' | 'retrying'

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  state: WeightCheckState
}

/**
 * 몇 번째 조회인지와, 그 조회를 사용자가 "다시 확인"으로 요청했는지.
 * manual은 화면이 재시도 중임을 알리는 데만 쓴다(기록 도중 상태를 다시 읽는 자동 재조회와 구분한다).
 */
interface Request {
  attempt: number
  manual: boolean
}

interface SyncRecord {
  userId: string
  status: NotificationSyncState
  /** 완료 처리를 다시 시도할 확인 주기의 키(주기 식별자이며 몸무게 수치가 아니다) */
  key: string | null
}

const NO_SYNC = (userId: string): SyncRecord => ({
  userId,
  status: 'idle',
  key: null,
})

/**
 * 몸무게 확인 상태와 기록. 구조는 useBodyMeasurementStatus와 같다: 계정이 바뀌면 이전 값을 버리고 불러오는 중으로 돌아간다.
 * 수치는 다루지 않는다(WeightLogRepository가 수치를 돌려주지 않는다).
 *
 * 조회 수단이 없으면(운영 빌드·API 연결 전) unavailable, 조회가 실패하면 error다. 둘 다 "확인 필요"도 "확인 불필요"도 아니다.
 * - reload: 상태를 다시 조회한다. 이미 조회 중이면 새 요청을 만들지 않는다(중복 요청 방지).
 * - retrying: 사용자가 reload로 요청한 조회가 아직 끝나지 않았다. 결과가 나오면(성공이든 실패든) 저절로 false가 된다.
 * - log: 기록을 저장하고 성공하면 돌려받은 상태로 즉시 갱신한다. 실패하면 예외를 그대로 던져 호출한 화면이 입력값을 유지한 채 오류를 보여 준다.
 *   일부만 저장됐거나(partialSave) 마지막 기록과 현재 몸무게가 어긋난(inconsistent) 경우에는 성공으로 표시하지 않고 상태를 다시 조회한다.
 *   기록이 성공하면 그 기록이 끝낸 확인 주기의 알림을 처리 완료로 바꾼다(recordWeightAndComplete). 이 처리는 기록과 분리돼 있어 기다리지 않고,
 *   실패해도 기록은 성공으로 남는다(notificationSync가 failed). 기록이 실패하면 알림은 건드리지 않는다. 홈과 마이페이지가 이 한 곳을 같이 쓴다.
 * - retryNotificationSync: 실패한 알림 완료 처리만 다시 시도한다(몸무게 기록은 다시 실행하지 않는다).
 * 상태를 불러오면 월간 확인 알림도 맞춘다: 확인일이 되었으면 이번 주기의 알림을 만들고(중복 호출에 안전), 이미 새로 기록한 이전 주기의
 * 미처리 알림을 처리 완료로 바로잡는다. 이 자동 처리가 실패해도 이 훅의 주요 기능(상태 조회·기록)은 영향을 받지 않는다.
 * 운영에서는 알림 생성의 최종 책임이 백엔드에 있어야 한다(weight-notification/weightNotificationService.ts).
 */
export function useWeightCheck(userId: string): {
  state: WeightCheckState
  retrying: boolean
  notificationSync: NotificationSyncState
  reload: () => void
  log: (input: WeightLogInput) => Promise<void>
  retryNotificationSync: () => void
} {
  const [request, setRequest] = useState<Request>({
    attempt: 0,
    manual: false,
  })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [sync, setSync] = useState<SyncRecord>(() => NO_SYNC(userId))
  const key = `${userId}#${request.attempt}`

  useEffect(() => {
    let cancelled = false
    const repository = createWeightLogRepository(userId)
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository.getCheckStatus().then(
      (value) => {
        if (!cancelled) setLoaded({ key, state: { status: 'ready', value } })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, key])

  const loading = !(loaded && loaded.key === key)
  const readyValue =
    !loading && (loaded as Loaded).state.status === 'ready'
      ? ((loaded as Loaded).state as { value: WeightCheckStatus }).value
      : null

  // 상태가 새로 정해질 때마다 월간 확인 알림을 맞춘다. 중복 호출에 안전하고, 실패해도 무시한다(다음 조회에서 다시 맞춘다).
  useEffect(() => {
    if (!readyValue) return
    const notifications = createNotificationRepository(userId)
    if (!notifications) return
    createWeightNotificationService(notifications)
      .sync(readyValue)
      .catch(() => {})
  }, [userId, readyValue])

  const reload = useCallback(() => {
    // 조회 중에는 새 요청을 만들지 않는다.
    if (loading) return
    setRequest((r) => ({ attempt: r.attempt + 1, manual: true }))
  }, [loading])

  const log = useCallback(
    async (input: WeightLogInput) => {
      const repository = createWeightLogRepository(userId)
      if (!repository) throw new WeightLogError('unavailable')
      const notifications = createNotificationRepository(userId)
      try {
        const { status, completion } = await recordWeightAndComplete({
          weight: repository,
          service: notifications
            ? createWeightNotificationService(notifications)
            : null,
          previous: readyValue,
          input,
        })
        // 저장이 성공한 뒤에만 상태를 바꾼다.
        setLoaded({
          key: `${userId}#${request.attempt}`,
          state: { status: 'ready', value: status },
        })
        // 알림 완료 처리는 기다리지 않는다. 실패해도 기록은 성공이며, 결과는 별도 상태로 알린다.
        void completion.then((result) => {
          setSync(
            result.state === 'failed'
              ? { userId, status: 'failed', key: result.key }
              : NO_SYNC(userId),
          )
        })
      } catch (error) {
        if (
          error instanceof WeightLogError &&
          (error.code === 'partialSave' || error.code === 'inconsistent')
        )
          setRequest((r) => ({ attempt: r.attempt + 1, manual: false }))
        throw error
      }
    },
    [userId, request.attempt, readyValue],
  )

  const retryNotificationSync = useCallback(() => {
    const current = sync.userId === userId ? sync : NO_SYNC(userId)
    if (current.status !== 'failed' || !current.key) return
    const notifications = createNotificationRepository(userId)
    if (!notifications) return
    const failedKey = current.key
    setSync({ userId, status: 'retrying', key: failedKey })
    createWeightNotificationService(notifications)
      .resolveByKey(failedKey)
      .then(
        () => setSync(NO_SYNC(userId)),
        () => setSync({ userId, status: 'failed', key: failedKey }),
      )
  }, [sync, userId])

  const state: WeightCheckState = loading
    ? { status: 'loading' }
    : (loaded as Loaded).state
  const notificationSync: NotificationSyncState =
    sync.userId === userId ? sync.status : 'idle'
  return {
    state,
    retrying: loading && request.manual,
    notificationSync,
    reload,
    log,
    retryNotificationSync,
  }
}
