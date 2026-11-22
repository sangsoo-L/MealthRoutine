import type { MouseEvent } from 'react'
import { Link } from 'react-router'
import type { AppNotification } from '../../notifications/notificationTypes.ts'
import {
  NOTIFICATION_TYPE_LABEL,
  formatNotificationTime,
} from '../../notifications/notificationView.ts'
import Icon from '../icons/Icon.tsx'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const rowClass = `flex w-full items-start gap-3 rounded-card border bg-surface p-4 text-left transition-colors hover:border-brand/40 motion-reduce:transition-none ${focusRing}`

/**
 * 알림 한 건. 연결 대상이 있으면 링크, 없으면 눌러서 읽음 처리하는 버튼이다. 둘 다 카드 전체가 눌리는 영역(44px 이상)이다.
 *
 * - 읽지 않은 알림은 점과 "읽지 않음" 글자, 진한 테두리로 구분한다(색만으로 전하지 않는다). 처리 완료(resolvedAt)는 읽음과 별개라
 *   "처리 완료" 글자로 따로 알린다.
 * - 링크는 보통 클릭에서 읽음 처리를 마친 뒤 이동한다(홈 벨 숫자가 이동 직후 낡은 값이 되지 않게). 새 탭 열기 등 보조 클릭은 브라우저 기본 동작을 따른다.
 * - 알림 내용(title·body)은 만든 쪽이 신체 수치를 넣지 않도록 저장소가 막는다. 여기서는 받은 글을 그대로 보여 준다.
 */
export default function NotificationItem({
  notification,
  now,
  onOpen,
}: {
  notification: AppNotification
  now: Date
  /** 알림을 열 때 호출한다. 이동은 호출한 쪽이 맡는다(event.preventDefault 이후). */
  onOpen: (notification: AppNotification, event: MouseEvent) => void
}) {
  const n = notification
  const unread = n.readAt === null
  const content = (
    <>
      <span
        aria-hidden="true"
        className={`mt-1.5 size-2.5 shrink-0 rounded-full ${unread ? 'bg-brand' : 'bg-transparent ring-1 ring-line'}`}
      />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-support leading-snug font-normal text-muted">
          <span className="font-semibold text-content">
            {NOTIFICATION_TYPE_LABEL[n.type]}
          </span>
          <time dateTime={n.createdAt} className="tabular-nums">
            {formatNotificationTime(n.createdAt, now)}
          </time>
          {unread ? (
            <span className="font-semibold text-brand">읽지 않음</span>
          ) : null}
          {n.resolvedAt ? <span>처리 완료</span> : null}
        </span>
        <span
          className={`mt-1 block text-body leading-snug text-content ${unread ? 'font-semibold' : 'font-normal'}`}
        >
          {n.title}
        </span>
        <span className="mt-1 block text-body leading-relaxed font-normal text-muted">
          {n.body}
        </span>
      </span>
      {n.target ? (
        <span aria-hidden="true" className="mt-1 shrink-0 text-muted">
          <Icon name="chevron-right" size={18} />
        </span>
      ) : null}
    </>
  )
  const className = `${rowClass} ${unread ? 'border-brand/40' : 'border-line'}`

  return (
    <li>
      {n.target ? (
        <Link
          to={n.target.route}
          state={{ from: '/notifications' }}
          data-notification-id={n.id}
          onClick={(event) => onOpen(n, event)}
          className={className}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          data-notification-id={n.id}
          onClick={(event) => onOpen(n, event)}
          className={`${className} cursor-pointer`}
        >
          {content}
        </button>
      )}
    </li>
  )
}
