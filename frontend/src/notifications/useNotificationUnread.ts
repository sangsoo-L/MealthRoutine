import { useCallback, useEffect, useState } from 'react'
import { subscribeNotificationsChanged } from './notificationEvents.ts'
import { createNotificationRepository } from './notificationSource.ts'

export type NotificationUnreadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; count: number }

interface Loaded {
  /** 어떤 계정·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 계정·조회의 값이라 쓰지 않는다. */
  key: string
  state: NotificationUnreadState
}

/**
 * 읽지 않은 알림 수(벨 배지용). 계정이 바뀌면 이전 값을 버리고 불러오는 중으로 돌아간다(이전 계정의 숫자가 잠깐이라도 보이지 않는다).
 * 알림 내용은 다루지 않는다. 조회 수단이 없으면(운영 빌드·API 연결 전) unavailable, 실패하면 error이며 둘 다 0개가 아니다.
 */
export function useNotificationUnread(userId: string): {
  state: NotificationUnreadState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  // 알림이 바뀌었다는 신호를 받으면 불러오는 중으로 돌아가지 않고 조용히 다시 조회한다(벨 숫자가 깜빡이지 않게).
  const [refreshTick, setRefreshTick] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${userId}#${attempt}`

  useEffect(() => {
    let cancelled = false
    const repository = createNotificationRepository(userId)
    if (!repository) {
      Promise.resolve().then(() => {
        if (!cancelled) setLoaded({ key, state: { status: 'unavailable' } })
      })
      return () => {
        cancelled = true
      }
    }
    repository.getUnreadCount().then(
      (count) => {
        if (!cancelled) setLoaded({ key, state: { status: 'ready', count } })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, key, refreshTick])

  useEffect(
    () => subscribeNotificationsChanged(() => setRefreshTick((n) => n + 1)),
    [],
  )

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const state: NotificationUnreadState =
    loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, reload }
}
