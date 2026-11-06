import { Link } from 'react-router'
import logoMarkUrl from '../../assets/images/logo/mealthroutine-logo-mark-header.webp'
import { focusRing } from '../home/homeStyles.ts'
import LandingExploreLink from './LandingExploreLink.tsx'
import { LANDING_HEADER } from './landingContent.ts'

/**
 * 랜딩 전용 헤더(Section 01). 워드마크, 서비스 둘러보기 앵커, 로그인 링크만 둔다. 햄버거 메뉴는 없다.
 *
 * 브랜드 로고 + 워드마크. 로고는 공식 로고 SVG(mealthroutine-logo-icon.svg, PNG를 그대로 담은 416KB)에서 투명 여백만 자르고
 * 크기만 줄인 헤더용 WebP(240×163, 약 7.8KB)다. 형태·색은 그대로이고 원본 SVG는 인트로가 그대로 쓴다.
 * (형태·색은 원본과 같다)
 * 로고는 옆의 글자(MealthRoutine)가 이름을 대신하므로 장식(alt="")이다. 종횡비를 지키도록 높이만 정한다(h-7 = 28px, 폭 약 41px).
 * 브랜드 라벨이라 굵기는 600이고, 색은 brand 토큰이다.
 *
 * 본문(`main`)은 좌우 20px 여백이 있으므로 -mx-5·-mt-5로 화면 폭 끝까지 펼친다. (AppShell 본문 여백이 바뀌면 함께 확인)
 * 360px 이상에서는 한 줄이다(390px 기준 헤더 높이 56px). 폭이 모자라면(320px, 글자 확대) 메뉴가 아래 줄로 내려가고 오른쪽에 붙는다.
 * 화면 위에 고정(sticky)하지 않는다: 글자를 크게 키우면 헤더가 두세 줄로 접혀 화면 위쪽을 크게 덮고,
 * 키보드로 이동할 때 포커스된 버튼이 헤더 밑에 숨기 때문이다(WCAG 2.2 포커스 가림). 로그인은 맨 위, 가입은 히어로·마지막 CTA에 있다.
 * 앵커는 같은 화면 안의 이동이라 pathname이 같고, 공통 화면 전환은 재생되지 않는다.
 */
export default function LandingHeader() {
  return (
    <header className="-mx-5 -mt-5 flex min-h-14 flex-wrap items-center justify-between gap-x-2 border-b border-line bg-surface px-[20px]">
      <p className="flex min-h-11 flex-wrap items-center gap-x-2 text-section-title font-semibold text-brand">
        <img
          src={logoMarkUrl}
          width={240}
          height={163}
          alt=""
          decoding="async"
          className="h-7 w-auto shrink-0"
        />
        {LANDING_HEADER.brand}
      </p>
      {/* nav가 아니라 이름 붙은 그룹: 사이트 전체 내비게이션(하단 탭)만 nav 랜드마크로 남기는 앱 규약을 따른다. */}
      <div
        role="group"
        aria-label="랜딩 메뉴"
        className="ml-auto flex flex-wrap items-center gap-1"
      >
        <LandingExploreLink
          className={`flex min-h-11 items-center rounded-control px-2 text-body font-normal text-content transition-colors hover:text-brand motion-reduce:transition-none ${focusRing}`}
        >
          {LANDING_HEADER.exploreLabel}
        </LandingExploreLink>
        <Link
          to={LANDING_HEADER.loginTo}
          className={`flex min-h-11 items-center rounded-control border border-brand px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`}
        >
          {LANDING_HEADER.loginLabel}
        </Link>
      </div>
    </header>
  )
}
