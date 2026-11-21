import { useCallback, useEffect, useRef, useState } from 'react'
import { subscribeNotificationsChanged } from './notificationEvents.ts'
import { createNotificationRepository } from './notificationSource.ts'
import {
  NotificationError,
  type AppNotification,
  type NotificationFilter,
} from './notificationTypes.ts'

export type NotificationListState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | {
      status: 'ready'
      items: readonly AppNotification[]
      nextCursor: string | null
      /** 다음 페이지를 불러오는 상태: idle · loading · error(다시 시도 가능) */
      more: 'idle' | 'loading' | 'error'
    }

interface Loaded {
  /** 어떤 계정·필터·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  state: Exclude<NotificationListState, { status: 'loading' }>
}

/**
 * 알림 목록(P08)의 상태와 동작. 구조는 다른 조회 훅과 같다: 계정·필터가 바뀌면 이전 값을 버리고 불러오는 중으로 돌아간다.
 *
 * - 필터(전체 / 읽지 않음)가 바뀌면 첫 페이지부터 다시 조회한다.
 * - loadMore: 마지막으로 받은 위치(nextCursor)부터 다음 페이지를 붙인다. 진행 중이거나 다음 페이지가 없으면 요청하지 않는다(중복 요청 방지).
 *   성공하면 새로 붙은 첫 알림의 id를 돌려준다(화면이 포커스를 옮기는 데 쓴다). 실패하면 more가 error이고 같은 호출로 다시 시도한다.
 * - markRead: 읽음으로 바꾸고 목록의 그 알림을 갱신한다. 처리 완료(resolvedAt)는 건드리지 않는다. 읽지 않은 수도 다시 조회한다.
 *   읽지 않음 필터에서도 읽은 알림은 그 자리에 남는다(사용자가 방금 연 알림이 갑자기 사라지지 않는다). 필터를 바꾸면 반영된다.
 * - markAllRead: 계정의 읽지 않은 알림을 모두(불러온 페이지와 무관하게) 읽음으로 바꾼다. 진행 중이면 다시 실행하지 않는다(skipped).
 *   성공하면 목록·읽지 않은 수를 그 자리에서 고친다. 실패하면 markAll이 error이고 아무것도 바뀌지 않았으므로 같은 호출로 다시 시도한다.
 * - unread: 읽지 않은 알림 수. 모르면(조회 중·실패) null이다.
 */
export function useNotificationList(userId: string): {
  filter: NotificationFilter
  setFilter: (filter: NotificationFilter) => void
  state: NotificationListState
  unread: number | null
  reload: () => void
  loadMore: () => Promise<string | null>
  markRead: (id: string) => Promise<void>
  /** 모두 읽기의 진행 상태. error이면 같은 호출로 다시 시도할 수 있다. */
  markAll: 'idle' | 'running' | 'error'
  markAllRead: () => Promise<'done' | 'error' | 'skipped'>
} {
  const [filter, setFilterState] = useState<NotificationFilter>('all')
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [countTick, setCountTick] = useState(0)
  const [unreadLoaded, setUnreadLoaded] = useState<{
    key: string
    value: number | null
  } | null>(null)
  // 다음 페이지 요청이 진행 중인지. 렌더링을 기다리지 않고 바로 막아, 연달아 눌러도 같은 페이지를 두 번 요청하지 않는다.
  const moreInFlight = useRef(false)
  // 모두 읽기가 진행 중인지. 마찬가지로 렌더링을 기다리지 않고 바로 막아 더블 클릭이 두 번 실행되지 않게 한다.
  const markAllInFlight = useRef(false)
  const [markAllState, setMarkAllState] = useState<{
    userId: string
    status: 'running' | 'error'
  } | null>(null)
  const key = `${userId}#${filter}#${attempt}`
  // 요청이 끝났을 때 필터·조회가 바뀌어 있는지 알아보는 데 쓴다.
  const keyRef = useRef(key)
  useEffect(() => {
    keyRef.current = key
  }, [key])
  const countKey = `${userId}#${attempt}#${countTick}`

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
    repository.list({ filter }).then(
      (page) => {
        if (!cancelled)
          setLoaded({
            key,
            state: {
              status: 'ready',
              items: page.items,
              nextCursor: page.nextCursor,
              more: 'idle',
            },
          })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, filter, key])

  useEffect(() => {
    let cancelled = false
    const repository = createNotificationRepository(userId)
    if (!repository) return
    repository.getUnreadCount().then(
      (value) => {
        if (!cancelled) setUnreadLoaded({ key: countKey, value })
      },
      () => {
        if (!cancelled) setUnreadLoaded({ key: countKey, value: null })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, countKey])

  const current: Loaded['state'] | null =
    loaded && loaded.key === key ? loaded.state : null

  const setFilter = useCallback((next: NotificationFilter) => {
    setFilterState(next)
  }, [])
  const reload = useCallback(() => {
    setAttempt((n) => n + 1)
  }, [])

  const loadMore = useCallback(async (): Promise<string | null> => {
    if (
      !current ||
      current.status !== 'ready' ||
      current.nextCursor === null ||
      current.more === 'loading'
    )
      return null
    if (moreInFlight.current) return null
    const repository = createNotificationRepository(userId)
    if (!repository) return null
    moreInFlight.current = true
    const cursor = current.nextCursor
    const patch = (
      next: Partial<Extract<Loaded['state'], { status: 'ready' }>>,
    ) =>
      setLoaded((prev) =>
        prev && prev.key === key && prev.state.status === 'ready'
          ? { key, state: { ...prev.state, ...next } }
          : prev,
      )
    patch({ more: 'loading' })
    try {
      const page = await repository.list({ filter, cursor })
      // 요청 중에는 다른 요청이 목록에 알림을 붙이지 못한다(moreInFlight). 이미 있는 알림은 다시 붙이지 않는다.
      const known = new Set(current.items.map((n) => n.id))
      const added = page.items.filter((n) => !known.has(n.id))
      setLoaded((prev) =>
        prev && prev.key === key && prev.state.status === 'ready'
          ? {
              key,
              state: {
                status: 'ready',
                items: [...prev.state.items, ...added],
                nextCursor: page.nextCursor,
                more: 'idle',
              },
            }
          : prev,
      )
      return added[0]?.id ?? null
    } catch {
      patch({ more: 'error' })
      return null
    } finally {
      moreInFlight.current = false
    }
  }, [current, filter, key, userId])

  const markRead = useCallback(
    async (id: string) => {
      const repository = createNotificationRepository(userId)
      if (!repository) throw new NotificationError('unavailable')
      const updated = await repository.markRead(id)
      setLoaded((prev) =>
        prev && prev.key === key && prev.state.status === 'ready'
          ? {
              key,
              state: {
                ...prev.state,
                items: prev.state.items.map((n) => (n.id === id ? updated : n)),
              },
            }
          : prev,
      )
      setCountTick((n) => n + 1)
    },
    [key, userId],
  )

  const markAllRead = useCallback(async (): Promise<
    'done' | 'error' | 'skipped'
  > => {
    if (markAllInFlight.current) return 'skipped'
    const repository = createNotificationRepository(userId)
    if (!repository) return 'skipped'
    markAllInFlight.current = true
    setMarkAllState({ userId, status: 'running' })
    try {
      const { readAt } = await repository.markAllRead()
      if (keyRef.current !== key) {
        // 처리 중에 필터가 바뀌어 새로 받은 목록이 처리 전 상태일 수 있다. 다시 조회해 맞춘다.
        reload()
      } else {
        // 불러온 목록은 다시 조회하지 않고 그 자리에서 고친다(펼친 페이지·포커스·스크롤 유지).
        // 읽지 않음 필터는 이제 읽지 않은 알림이 없으므로 빈 목록이다. 전체 필터는 읽지 않던 알림에 읽은 시각만 채운다.
        setLoaded((prev) =>
          prev && prev.key === key && prev.state.status === 'ready'
            ? {
                key,
                state:
                  filter === 'unread'
                    ? {
                        ...prev.state,
                        items: [],
                        nextCursor: null,
                        more: 'idle',
                      }
                    : {
                        ...prev.state,
                        items: prev.state.items.map((n) =>
                          n.readAt === null && readAt !== null
                            ? { ...n, readAt }
                            : n,
                        ),
                      },
              }
            : prev,
        )
      }
      setCountTick((n) => n + 1)
      setMarkAllState(null)
      return 'done'
    } catch {
      setMarkAllState({ userId, status: 'error' })
      return 'error'
    } finally {
      markAllInFlight.current = false
    }
  }, [filter, key, reload, userId])

  // 다른 곳(월간 몸무게 알림 서비스)이 알림을 만들거나 처리 완료로 바꾸면 목록과 개수를 다시 조회한다.
  useEffect(() => subscribeNotificationsChanged(reload), [reload])

  const state: NotificationListState = current ?? { status: 'loading' }
  const unread =
    unreadLoaded && unreadLoaded.key === countKey ? unreadLoaded.value : null
  const markAll =
    markAllState && markAllState.userId === userId
      ? markAllState.status
      : 'idle'
  return {
    filter,
    setFilter,
    state,
    unread,
    reload,
    loadMore,
    markRead,
    markAll,
    markAllRead,
  }
}
