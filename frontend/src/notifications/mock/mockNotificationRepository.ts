import { mockDelay, mockFlag, mockKey } from '../../dev-mock/devMockStorage.ts'
import {
  NotificationError,
  type AppNotification,
  type NotificationDraft,
  type NotificationListQuery,
  type NotificationPage,
  type NotificationRepository,
} from '../notificationTypes.ts'
import {
  compareNewestFirst,
  decodeCursor,
  encodeCursor,
  parseStoredNotifications,
  validateDraft,
} from '../notificationValidation.ts'

/**
 * [개발 전용] 알림 Mock 저장소. 서버가 맡을 보관을 개발 환경에서 흉내 낸다. 개발 서버에서만 불러온다(notificationSource.ts).
 *
 * - 저장 위치는 localStorage의 `mealthroutine.dev.mock.notifications.<사용자 id>` = { v: 1, ownerId, items: [...] }이다.
 *   계정 id가 키에 들어가고 읽을 때 소유자도 다시 확인한다. 다른 계정의 키는 읽지 않는다. 개수 제한은 두지 않는다.
 * - 읽은 값은 외부 입력으로 보고 전체를 검증한다. 하나라도 어긋나거나 다른 계정의 알림이 섞여 있으면 'corrupt'이며, 손상된 데이터 위에는 쓰지 않는다.
 * - 쓰기는 읽고 검증한 뒤 키 하나를 한 번에 쓴다. 실패하면 아무것도 바뀌지 않는다('save').
 * - 모두 읽기(markAllRead)는 읽지 않은 알림 전체의 readAt만 같은 시각으로 채우고 키 하나를 한 번에 쓴다(전부 반영 또는 무변경).
 * - 같은 dedupeKey는 한 번만 만든다(이미 있으면 쓰지 않고 기존 알림을 돌려준다). 읽음(readAt)과 처리 완료(resolvedAt)는 서로 바꾸지 않는다.
 * - 알림 내용에 신체 수치를 넣을 수 없다(validateDraft). 오류 메시지·콘솔에는 알림 내용을 쓰지 않는다.
 * - 짧은 지연을 둔다. 개발·검수용 스위치(mockFlag)의 `notifications` 도메인으로 조회·저장 실패를 재현할 수 있다.
 */

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50
/** dedupeKeyPrefix에 쓸 수 있는 글자(dedupeKey와 같은 규칙). */
const PREFIX_PATTERN = /^[A-Za-z0-9:_.-]{1,200}$/

export interface MockNotificationOptions {
  userId: string
  latencyMs?: number
  /** 생성·읽음 시각의 기준. 테스트에서 시간을 고정한다. */
  now?: () => Date
  newId?: () => string
}

function defaultId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return (
    uuid ??
    `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  )
}

export function createMockNotificationRepository(
  options: MockNotificationOptions,
): NotificationRepository {
  const { userId, latencyMs = 300 } = options
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? defaultId
  if (!userId || userId.length > 200)
    throw new NotificationError('invalidInput')
  const key = mockKey('notifications', userId)

  function read(): AppNotification[] {
    if (mockFlag('failLoad', 'notifications'))
      throw new NotificationError('load')
    let raw: string | null
    try {
      raw = window.localStorage.getItem(key)
    } catch {
      throw new NotificationError('load')
    }
    if (raw === null) return []
    let value: unknown
    try {
      value = JSON.parse(raw)
    } catch {
      throw new NotificationError('corrupt')
    }
    const items = parseStoredNotifications(value, userId)
    if (!items) throw new NotificationError('corrupt')
    return items
  }

  function write(items: readonly AppNotification[]): void {
    if (mockFlag('failSave', 'notifications'))
      throw new NotificationError('save')
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ v: 1, ownerId: userId, items }),
      )
    } catch {
      throw new NotificationError('save')
    }
  }

  return {
    kind: 'mock',

    async list(query: NotificationListQuery): Promise<NotificationPage> {
      await mockDelay(latencyMs)
      if (
        typeof query !== 'object' ||
        query === null ||
        (query.filter !== 'all' && query.filter !== 'unread')
      )
        throw new NotificationError('invalidInput')
      // 새 필터는 선택이다. 있으면 값이 올바른지 확인하고, 잘못된 값은 조용히 무시하지 않고 거부한다.
      if (query.resolved !== undefined && typeof query.resolved !== 'boolean')
        throw new NotificationError('invalidInput')
      if (
        query.dedupeKeyPrefix !== undefined &&
        (typeof query.dedupeKeyPrefix !== 'string' ||
          !PREFIX_PATTERN.test(query.dedupeKeyPrefix))
      )
        throw new NotificationError('invalidInput')
      const { resolved, dedupeKeyPrefix } = query
      const limit = query.limit ?? DEFAULT_LIMIT
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT)
        throw new NotificationError('invalidInput')
      const after = query.cursor ? decodeCursor(query.cursor) : null
      const sorted = read()
        .filter((n) => query.filter === 'all' || n.readAt === null)
        .filter(
          (n) => resolved === undefined || (n.resolvedAt !== null) === resolved,
        )
        .filter(
          (n) =>
            dedupeKeyPrefix === undefined ||
            n.dedupeKey.startsWith(dedupeKeyPrefix),
        )
        .sort(compareNewestFirst)
      const rest = after
        ? sorted.filter((n) => compareNewestFirst(n, after) > 0)
        : sorted
      const items = rest.slice(0, limit)
      return {
        items,
        nextCursor:
          rest.length > limit ? encodeCursor(items[items.length - 1]) : null,
      }
    },

    async getUnreadCount() {
      await mockDelay(latencyMs)
      return read().filter((n) => n.readAt === null).length
    },

    async markRead(id: string) {
      await mockDelay(latencyMs)
      const items = read()
      const index = items.findIndex((n) => n.id === id)
      if (index < 0) throw new NotificationError('notFound')
      // 이미 읽은 알림은 쓰지 않는다(처음 읽은 시각을 지키고 쓰기 실패 위험도 만들지 않는다).
      if (items[index].readAt !== null) return items[index]
      const updated = { ...items[index], readAt: now().toISOString() }
      write(items.map((n, i) => (i === index ? updated : n)))
      return updated
    },

    async markAllRead() {
      await mockDelay(latencyMs)
      const items = read()
      // 읽지 않은 알림이 없으면 쓰지 않는다(멱등, 쓰기 실패 위험도 만들지 않는다).
      if (!items.some((n) => n.readAt === null))
        return { updated: 0, readAt: null }
      // 새로 읽음이 되는 알림은 모두 같은 시각을 갖는다. 읽는 즉시 쓰기까지 한 번에 하므로 부분 반영이 없다.
      const readAt = now().toISOString()
      let updated = 0
      const next = items.map((n) => {
        if (n.readAt !== null) return n
        updated += 1
        return { ...n, readAt }
      })
      write(next)
      return { updated, readAt }
    },

    async create(draft: NotificationDraft) {
      await mockDelay(latencyMs)
      const valid = validateDraft(draft)
      const items = read()
      const existing = items.find((n) => n.dedupeKey === valid.dedupeKey)
      if (existing) return { notification: existing, created: false }
      const notification: AppNotification = {
        id: newId(),
        userId,
        type: valid.type,
        title: valid.title,
        body: valid.body,
        createdAt: now().toISOString(),
        readAt: null,
        resolvedAt: null,
        dedupeKey: valid.dedupeKey,
        target: valid.target,
      }
      write([...items, notification])
      return { notification, created: true }
    },

    async resolve(dedupeKey: string) {
      await mockDelay(latencyMs)
      const items = read()
      const index = items.findIndex((n) => n.dedupeKey === dedupeKey)
      if (index < 0) throw new NotificationError('notFound')
      if (items[index].resolvedAt !== null) return items[index]
      const updated = { ...items[index], resolvedAt: now().toISOString() }
      write(items.map((n, i) => (i === index ? updated : n)))
      return updated
    },
  }
}
