import { Outlet, ScrollRestoration, useMatches } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import { useAuth } from '../auth/authContext.ts'
import BackLink from '../components/layout/BackLink.tsx'
import BottomNav from '../components/layout/BottomNav.tsx'
import RouteTransition from '../components/layout/RouteTransition.tsx'
import { hasShellBack } from '../components/layout/shellBack.ts'

/**
 * 모든 화면이 공유하는 단일 레이아웃(본문 + BottomNav). 상단 바(AppBar)는 두지 않는다.
 * 가장 마지막 매치의 `handle`로 뒤로가기, 보조기기용 제목, 활성 탭, 하단탭 노출을 결정한다.
 *
 * - 뒤로가기: 상위 화면(parent)이 있는 상세 화면만 본문 맨 위에 "이전"을 그린다(BackLink). 하단 탭의 대표 화면은
 *   parent가 없어 그리지 않는다. 화면이 직접 다루는 경우는 handle.bodyBack으로 알린다.
 * - 제목: 눈에 보이는 제목 바가 없으므로, 화면이 자체 h1을 갖지 않는 화면(handle.ownH1이 아님)에는 handle.title을
 *   보조기기용 h1(sr-only)로 넣는다. 인트로·비회원 랜딩은 각자의 h1을 가진다.
 * - 안전 영역: viewport-fit=cover를 쓰지 않아 브라우저가 노치·상태 표시줄 영역을 피해 주므로 별도 여백이 필요 없다.
 */
export default function AppShell() {
  const matches = useMatches()
  const handle = getRouteHandle(matches.at(-1)?.handle)
  // 인트로 스플래시: 본문을 화면 정중앙에 두고, 앱 영역과 바깥 배경을 같은 색으로 맞춘다.
  const isSplash = handle.splash === true
  // 비회원 랜딩(H01): 화면이 자체 헤더와 h1을 가지므로 하단 탭과 공통 h1을 렌더링하지 않는다. 본문 배치·여백은 일반 화면과 같다.
  // 로그인한 회원에게는 같은 라우트도 일반 화면이다.
  const { status } = useAuth()
  const isGuestLanding = handle.landing === true && status !== 'authenticated'
  const needsHeading = !isSplash && !isGuestLanding && handle.ownH1 !== true

  return (
    <div
      // 모바일(640px 미만)은 앱이 화면 전체를 차지하므로 바깥·안쪽 배경이 같은 색이다.
      // 640px 이상(PC)은 바깥에 연한 브랜드 블루 배경을 깔고, 앱 영역에 1px 경계선(ring)과 약한 그림자를 둔다.
      // 경계선은 border가 아니라 ring이라 앱 폭(390px)과 내부 정렬에 영향을 주지 않는다.
      className={`${isSplash ? 'min-h-dvh bg-surface' : 'min-h-screen bg-page'} font-sans text-body font-normal text-content sm:bg-brand-soft`}
    >
      <div
        className={`${isSplash ? 'min-h-dvh bg-surface' : 'min-h-screen bg-page'} mx-auto flex max-w-app flex-col sm:shadow-app sm:ring-1 sm:ring-line`}
      >
        {/* 화면 전환은 RouteTransition이 공통으로 처리한다. BottomNav는 전환 대상이 아니다. */}
        <RouteTransition
          className={
            isSplash
              ? 'flex flex-1 items-center justify-center px-6'
              : 'flex-1 px-5 py-5'
          }
          transition={handle.transition}
        >
          {hasShellBack(handle) ? (
            <div className="mb-1">
              <BackLink parent={handle.parent ?? null} />
            </div>
          ) : null}
          {needsHeading ? (
            <h1 className="sr-only">{handle.title ?? ''}</h1>
          ) : null}
          <Outlet />
        </RouteTransition>
        {handle.focus === true || isGuestLanding ? null : (
          <BottomNav activeTab={handle.tab ?? null} />
        )}
      </div>
      <ScrollRestoration />
    </div>
  )
}
