import {
  NotificationError,
  type AppNotification,
  type NotificationDraft,
  type NotificationTarget,
  type NotificationType,
} from './notificationTypes.ts'

/** 알림 내용·저장 데이터 검증과 정렬·조회 위치(cursor) 규칙. 순수 함수만 둔다(저장소·화면에 의존하지 않는다). */

const TYPES: readonly NotificationType[] = ['body', 'exercise', 'system']
export const MAX_TITLE_LENGTH = 100
export const MAX_BODY_LENGTH = 500
const DEDUPE_KEY = /^[A-Za-z0-9:_.-]{1,200}$/
/**
 * 신체 수치(예: "64.5kg", "170 cm")처럼 보이는 표현. 알림에는 몸무게·키를 담지 않는다는 정책의 방어 장치다.
 * 문장 전체를 이해해 막는 검사가 아니므로, 알림을 만드는 쪽이 수치를 넣지 않는 것이 먼저다.
 */
const BODY_NUMBER = /\d+(\.\d+)?\s?(kg|㎏|cm|㎝|킬로)/i

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value))

/**
 * 앱 안의 경로인지. 외부 주소로 이동하지 않도록 "/"로 시작하고 "//"로 시작하지 않으며, 역슬래시·제어 문자가 없는 문자열만 허용한다.
 * (components/layout/useBackTarget.ts의 규칙과 같다.)
 */
export function isInternalRoute(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 300) return false
  if (!value.startsWith('/') || value.startsWith('//')) return false
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f || ch === '\\') return false
  }
  return true
}

function parseTarget(value: unknown): NotificationTarget | null | undefined {
  if (value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return undefined
  const route = (value as Record<string, unknown>).route
  return isInternalRoute(route) ? { route } : undefined
}

/** 새 알림의 내용을 검증한다. 규칙을 어기면 NotificationError('invalidInput'). 문자열은 앞뒤 공백을 제거한 값을 돌려준다. */
export function validateDraft(draft: unknown): NotificationDraft {
  if (typeof draft !== 'object' || draft === null)
    throw new NotificationError('invalidInput')
  const d = draft as Record<string, unknown>
  const title = typeof d.title === 'string' ? d.title.trim() : ''
  const body = typeof d.body === 'string' ? d.body.trim() : ''
  const target = parseTarget(d.target)
  if (
    !TYPES.includes(d.type as NotificationType) ||
    title === '' ||
    title.length > MAX_TITLE_LENGTH ||
    body === '' ||
    body.length > MAX_BODY_LENGTH ||
    typeof d.dedupeKey !== 'string' ||
    !DEDUPE_KEY.test(d.dedupeKey) ||
    target === undefined ||
    BODY_NUMBER.test(title) ||
    BODY_NUMBER.test(body)
  )
    throw new NotificationError('invalidInput')
  return {
    type: d.type as NotificationType,
    title,
    body,
    dedupeKey: d.dedupeKey,
    target,
  }
}

/**
 * 저장된 알림(JSON을 해석한 값)을 검증한다. 하나라도 어긋나면 전체를 손상으로 보고 null을 돌려준다
 * (일부만 골라 쓰거나 고쳐서 이어 쓰지 않는다). 다른 계정의 알림이 섞여 있어도 손상이다.
 */
export function parseStoredNotifications(
  value: unknown,
  userId: string,
): AppNotification[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null
  const stored = value as Record<string, unknown>
  if (stored.v !== 1 || stored.ownerId !== userId) return null
  if (!Array.isArray(stored.items)) return null
  const ids = new Set<string>()
  const keys = new Set<string>()
  const items: AppNotification[] = []
  for (const raw of stored.items) {
    if (typeof raw !== 'object' || raw === null) return null
    const n = raw as Record<string, unknown>
    const target = parseTarget(n.target)
    if (
      typeof n.id !== 'string' ||
      n.id === '' ||
      ids.has(n.id) ||
      n.userId !== userId ||
      !TYPES.includes(n.type as NotificationType) ||
      typeof n.title !== 'string' ||
      n.title === '' ||
      typeof n.body !== 'string' ||
      n.body === '' ||
      !isDate(n.createdAt) ||
      !(n.readAt === null || isDate(n.readAt)) ||
      !(n.resolvedAt === null || isDate(n.resolvedAt)) ||
      typeof n.dedupeKey !== 'string' ||
      !DEDUPE_KEY.test(n.dedupeKey) ||
      keys.has(n.dedupeKey) ||
      target === undefined
    )
      return null
    ids.add(n.id)
    keys.add(n.dedupeKey)
    items.push({
      id: n.id,
      userId: n.userId,
      type: n.type as NotificationType,
      title: n.title,
      body: n.body,
      createdAt: n.createdAt,
      readAt: n.readAt as string | null,
      resolvedAt: n.resolvedAt as string | null,
      dedupeKey: n.dedupeKey,
      target,
    })
  }
  return items
}

/** 최신순 비교: 생성 시각이 늦은 것이 앞, 같으면 id가 큰 것이 앞. 음수면 a가 앞이다. */
export function compareNewestFirst(
  a: Pick<AppNotification, 'createdAt' | 'id'>,
  b: Pick<AppNotification, 'createdAt' | 'id'>,
): number {
  const byTime = Date.parse(b.createdAt) - Date.parse(a.createdAt)
  if (byTime !== 0) return byTime
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** 마지막으로 받은 알림에서 만든 조회 위치. 형식은 저장소의 내부 약속이다. */
export function encodeCursor(
  item: Pick<AppNotification, 'createdAt' | 'id'>,
): string {
  return `${item.createdAt}|${item.id}`
}

export function decodeCursor(
  cursor: string,
): Pick<AppNotification, 'createdAt' | 'id'> {
  const index = cursor.indexOf('|')
  const createdAt = cursor.slice(0, index)
  const id = cursor.slice(index + 1)
  if (index <= 0 || id === '' || !isDate(createdAt))
    throw new NotificationError('invalidCursor')
  return { createdAt, id }
}
