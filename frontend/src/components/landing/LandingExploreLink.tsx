import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import { LANDING_EXPLORE_ID } from './landingContent.ts'

interface LandingExploreLinkProps {
  className: string
  children: ReactNode
}

/**
 * "둘러보기" 섹션으로 가는 앵커(헤더·히어로 공통). 키보드 사용자의 다음 Tab이 그 섹션의 첫 링크로 이어지도록 포커스를 옮긴다.
 *
 * - 라우터의 해시 이동과 URL은 그대로 두고, 스크롤도 라우터에 맡긴다(preventScroll). 부드러운 스크롤을 따로 쓰지 않으므로 reduced-motion에 영향이 없다.
 * - 이 링크에서만 동작하는 지역 처리다. 전역 포커스 로직이 아니다.
 * - 새 탭으로 여는 보조 키 클릭은 현재 화면의 포커스를 옮기지 않는다.
 */
export default function LandingExploreLink({
  className,
  children,
}: LandingExploreLinkProps) {
  function focusExploreSection(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    document.getElementById(LANDING_EXPLORE_ID)?.focus({ preventScroll: true })
  }

  return (
    <Link
      to={{ hash: `#${LANDING_EXPLORE_ID}` }}
      onClick={focusExploreSection}
      className={className}
    >
      {children}
    </Link>
  )
}
