import { Link } from 'react-router'
import {
  bellAccessibleLabel,
  unreadBadgeText,
} from '../../notifications/notificationView.ts'
import { useNotificationUnread } from '../../notifications/useNotificationUnread.ts'
import Icon from '../icons/Icon.tsx'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 알림 목록(P08, `/notifications`)으로 가는 벨 아이콘 링크. 홈 인사 줄과 마이페이지 프로필 줄에 놓는다.
 *
 * - 읽지 않은 알림이 있으면 배지에 숫자(99 초과는 "99+")를 보이고, 링크의 접근 가능한 이름에도 개수를 글자로 넣는다
 *   (예: "알림, 읽지 않은 알림 3개"). 배지는 보조기기에는 숨겨 이름과 중복해서 읽히지 않게 한다.
 * - 개수를 모를 때(조회 중·실패·연결 전)는 배지 없이 "알림"이다. 0개로 단정하지 않는다. 항상 눌러서 P08에 갈 수 있다.
 * - `from`은 P08의 "이전"이 돌아갈 화면이다(진입한 화면). 알림 내용은 다루지 않는다. 터치 영역은 44px 이상이다.
 */
export default function NotificationBellLink({
  userId,
  from,
}: {
  userId: string
  from: string
}) {
  const { state } = useNotificationUnread(userId)
  const count = state.status === 'ready' ? state.count : null
  const badge = unreadBadgeText(count)

  return (
    <Link
      to="/notifications"
      state={{ from }}
      aria-label={bellAccessibleLabel(count)}
      className={`relative flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-brand motion-reduce:transition-none ${focusRing}`}
    >
      <Icon name="bell" />
      {badge ? (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-0 flex min-w-5 items-center justify-center rounded-full bg-danger px-1 text-support leading-5 font-semibold tabular-nums text-surface"
        >
          {badge}
        </span>
      ) : null}
    </Link>
  )
}
