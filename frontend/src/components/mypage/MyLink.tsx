import { Link } from 'react-router'
import type { MyDestination } from '../../mypage/destinations.ts'
import Icon from '../icons/Icon.tsx'
import { focusRing } from './myStyles.ts'

interface MyLinkProps {
  destination: MyDestination
  children: string
}

/**
 * 마이페이지의 이동 요소. 경로가 있을 때만 링크로 그리고, 아직 화면(경로)이 없으면 아무것도 그리지 않는다.
 * 준비 중인 이동을 "준비 중" 글자로 늘어놓지 않고(화면이 길어지고 눌러지는 것처럼 보일 수 있다), 이동 대상 정의(MY_DESTINATIONS)는
 * 그대로 두어 화면이 만들어져 `to`가 채워지면 같은 자리에 링크가 자동으로 나타난다(향후 연결 지점 유지).
 * 링크는 높이 44px 이상의 터치 영역을 가진다. 위계를 낮추려고 굵은 파란 글자 + 작은 화살표만 쓴다.
 */
export default function MyLink({ destination, children }: MyLinkProps) {
  if (destination.to === null) return null
  return (
    <Link
      to={destination.to}
      className={`inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand transition-colors hover:text-brand-hover motion-reduce:transition-none ${focusRing}`}
    >
      {children}
      <Icon name="chevron-right" size={18} />
    </Link>
  )
}
