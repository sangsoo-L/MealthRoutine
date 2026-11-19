import { useRef, useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import NotificationItem from '../components/notifications/NotificationItem.tsx'
import type {
  AppNotification,
  NotificationFilter,
} from '../notifications/notificationTypes.ts'
import { emptyMessage } from '../notifications/notificationView.ts'
import { useNotificationList } from '../notifications/useNotificationList.ts'
import { useWeightNotificationSync } from '../weight-notification/useWeightNotificationSync.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const cardClass = 'rounded-card border border-line bg-surface p-4'
const actionClass = `flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`

const FILTERS: readonly { value: NotificationFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'unread', label: '읽지 않음' },
]

function isModifiedClick(event: MouseEvent): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
}

function NotificationsBody({ userId }: { userId: string }) {
  const {
    filter,
    setFilter,
    state,
    unread,
    reload,
    loadMore,
    markRead,
    markAll,
    markAllRead,
  } = useNotificationList(userId)
  // 확인일이 된 월간 몸무게 알림이 있어야 하면 목록을 보기 전에 맞춘다(바뀌면 목록이 스스로 다시 조회한다).
  useWeightNotificationSync(userId)
  const navigate = useNavigate()
  const listRef = useRef<HTMLUListElement>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 화면이 열린 시각. 알림 시각 표시의 "올해" 판단에만 쓴다.
  const [now] = useState(() => new Date())

  async function open(notification: AppNotification, event: MouseEvent) {
    setNotice(null)
    const modified = isModifiedClick(event)
    // 연결 대상이 있는 링크는 보통 클릭에서 읽음 처리를 마친 뒤 이동한다. 새 탭 열기 같은 보조 클릭은 브라우저가 처리하게 두고 읽음만 처리한다.
    if (notification.target && !modified) event.preventDefault()
    if (notification.readAt === null) {
      try {
        await markRead(notification.id)
      } catch {
        // 읽음 처리에 실패해도 사용자가 가려던 곳은 막지 않는다. 연결 대상이 없는 알림이면 실패를 알린다.
        if (!notification.target)
          setNotice('읽음 처리를 하지 못했어요. 잠시 후 다시 시도해 주세요.')
      }
    }
    if (notification.target && !modified)
      void navigate(notification.target.route, {
        state: { from: '/notifications' },
      })
  }

  async function more() {
    const firstNew = await loadMore()
    // 더 보기 버튼이 사라져도 포커스가 문서 처음으로 빠지지 않게 새로 붙은 첫 알림으로 옮긴다.
    if (firstNew)
      requestAnimationFrame(() =>
        listRef.current
          ?.querySelector<HTMLElement>(`[data-notification-id="${firstNew}"]`)
          ?.focus(),
      )
  }

  // 읽지 않은 알림이 없다고 확실할 때(0개)와 처리 중, 목록을 아직 못 받았을 때는 누를 수 없다. 개수를 모르면(조회 실패) 누를 수 있다.
  const markAllDisabled =
    markAll === 'running' || state.status !== 'ready' || unread === 0
  const markAllLabel =
    markAll === 'running'
      ? '처리 중…'
      : markAll === 'error'
        ? '다시 시도'
        : '모두 읽기'

  return (
    <div className="flex min-w-0 flex-col gap-5 break-keep wrap-anywhere">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            알림
          </h1>
          <p
            role="status"
            aria-live="polite"
            className="mt-1 text-body leading-relaxed font-normal text-muted"
          >
            {unread === null
              ? ' '
              : unread > 0
                ? `읽지 않은 알림 ${unread}개`
                : '읽지 않은 알림이 없어요'}
          </p>
        </div>
        {/* disabled 대신 aria-disabled를 쓴다: 누른 직후 비활성이 되어도 포커스가 문서 처음으로 빠지지 않는다. */}
        <button
          type="button"
          aria-disabled={markAllDisabled}
          aria-label={markAll === 'error' ? '모두 읽기 다시 시도' : undefined}
          onClick={() => {
            if (markAllDisabled) return
            setNotice(null)
            void markAllRead()
          }}
          className={`flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing} aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted aria-disabled:hover:bg-surface`}
        >
          {markAllLabel}
        </button>
      </header>

      {markAll === 'error' ? (
        <p
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger"
        >
          모두 읽기를 하지 못했어요. 알림은 바뀌지 않았어요. 다시 시도해 주세요.
        </p>
      ) : null}

      <div
        role="group"
        aria-label="알림 필터"
        className="grid grid-cols-2 gap-1 rounded-card border border-line bg-surface p-1"
      >
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            onClick={() => {
              setNotice(null)
              setFilter(item.value)
            }}
            className={`flex min-h-11 min-w-0 cursor-pointer items-center justify-center rounded-control px-4 text-body transition-colors motion-reduce:transition-none ${focusRing} ${filter === item.value ? 'bg-brand font-semibold text-surface' : 'font-normal text-muted hover:bg-page hover:text-content'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {notice ? (
        <p
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger"
        >
          {notice}
        </p>
      ) : null}

      {state.status === 'loading' ? (
        <p role="status" className={`${cardClass} text-body text-muted`}>
          알림을 불러오는 중이에요…
        </p>
      ) : state.status === 'unavailable' ? (
        <p role="status" className={`${cardClass} text-body text-muted`}>
          알림은 아직 사용할 수 없어요. 연결되면 이곳에서 확인할 수 있어요.
        </p>
      ) : state.status === 'error' ? (
        <div role="alert" className={cardClass}>
          <p className="text-body leading-relaxed font-semibold text-content">
            알림을 불러오지 못했어요
          </p>
          <p className="mt-1 text-body leading-relaxed text-muted">
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={reload}
            className={`mt-3 ${actionClass}`}
          >
            다시 시도
          </button>
        </div>
      ) : state.items.length === 0 ? (
        <p role="status" className={`${cardClass} text-body text-muted`}>
          {emptyMessage(filter)}
        </p>
      ) : (
        <>
          <ul ref={listRef} className="flex flex-col gap-2">
            {state.items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                now={now}
                onOpen={(n, event) => void open(n, event)}
              />
            ))}
          </ul>
          {state.more === 'error' ? (
            <p
              role="alert"
              className="text-support leading-relaxed text-danger"
            >
              알림을 더 불러오지 못했어요. 다시 시도해 주세요.
            </p>
          ) : null}
          {state.nextCursor !== null ? (
            <button
              type="button"
              aria-disabled={state.more === 'loading'}
              onClick={() => {
                if (state.more !== 'loading') void more()
              }}
              className={`${actionClass} aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted aria-disabled:hover:bg-surface`}
            >
              {state.more === 'loading'
                ? '불러오는 중…'
                : state.more === 'error'
                  ? '다시 시도'
                  : '더 보기'}
            </button>
          ) : null}
        </>
      )}
    </div>
  )
}

/**
 * P08 알림 목록(`/notifications`). 회원 전용이다(라우터의 AuthGate가 비회원에게 로그인 안내를 보여 준다).
 * 전체 / 읽지 않음 필터, 최신순 목록, 읽지 않은 알림 구분, 알림을 열면 읽음 처리 후 연결 대상으로 이동, 빈 목록·조회 실패·재시도, 더 보기를 제공한다.
 * 알림 데이터는 개발 서버의 Mock 저장소뿐이고(운영 빌드는 "사용할 수 없어요"), 알림을 만드는 곳은 아직 없다(다음 단계에서 연결).
 * 계정이 바뀌면 key로 화면을 새로 시작해 이전 계정의 목록·필터가 남지 않는다.
 */
export default function NotificationsPage() {
  const { user } = useAuth()
  return user ? <NotificationsBody key={user.id} userId={user.id} /> : null
}
