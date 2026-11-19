import type { NotificationType } from './notificationTypes.ts'

/** 알림 화면의 표시 규칙(순수 함수). */

export const NOTIFICATION_TYPE_LABEL: Record<NotificationType, string> = {
  body: '신체정보',
  exercise: '운동',
  system: '시스템',
}

/** 벨 배지에 보이는 숫자. 99를 넘으면 "99+". 0 이하는 배지가 없다(null). */
export function unreadBadgeText(count: number | null): string | null {
  if (count === null || !Number.isFinite(count) || count <= 0) return null
  return count > 99 ? '99+' : String(Math.floor(count))
}

/** 벨 링크의 접근 가능한 이름. 숫자를 글자로도 알린다(색·배지만으로 전하지 않는다). 개수를 모르면 "알림"만이다. */
export function bellAccessibleLabel(count: number | null): string {
  const badge = unreadBadgeText(count)
  return badge === null
    ? '알림'
    : `알림, 읽지 않은 알림 ${count! > 99 ? '99개 이상' : `${count}개`}`
}

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * 알림 시각 표시(서울 기준). 올해가 아니면 연도를 붙인다. 형식이 잘못된 시각이면 빈 문자열.
 * 예) "11월 13일 12:30", "2025년 12월 5일 09:05"
 */
export function formatNotificationTime(iso: string, now: Date): string {
  const at = new Date(iso)
  if (!Number.isFinite(at.getTime()) || !Number.isFinite(now.getTime()))
    return ''
  const pick = (date: Date, type: string) =>
    parts.formatToParts(date).find((part) => part.type === type)?.value ?? ''
  const year = pick(at, 'year')
  const prefix = year === pick(now, 'year') ? '' : `${year}년 `
  // 월·일은 0을 붙이지 않는 숫자로, 시·분은 두 자리로 보인다.
  return `${prefix}${Number(pick(at, 'month'))}월 ${Number(pick(at, 'day'))}일 ${pick(at, 'hour')}:${pick(at, 'minute')}`
}

/** 목록이 비었을 때의 안내. 읽지 않음 필터에서는 "전체에 알림이 있는지"와 무관하게 읽지 않은 알림이 없다는 뜻이다. */
export function emptyMessage(filter: 'all' | 'unread'): string {
  return filter === 'unread'
    ? '읽지 않은 알림이 없어요.'
    : '아직 받은 알림이 없어요.'
}
