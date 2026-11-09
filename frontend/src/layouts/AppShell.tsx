import { Outlet, ScrollRestoration, useMatches } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import { useAuth } from '../auth/authContext.ts'
import AppBar from '../components/layout/AppBar.tsx'
import BottomNav from '../components/layout/BottomNav.tsx'
import RouteTransition from '../components/layout/RouteTransition.tsx'

/**
 * 모든 화면이 공유하는 단일 레이아웃(AppBar + 본문 + BottomNav).
 * 가장 마지막 매치의 `handle`로 제목, 뒤로가기, 활성 탭, 하단탭 노출을 결정한다.
 */
export default function AppShell() {
  const matches = useMatches()
  const handle = getRouteHandle(matches.at(-1)?.handle)
  // 인트로 스플래시: AppBar 없이 본문을 화면 정중앙에 두고, 앱 영역과 바깥 배경을 같은 색으로 맞춘다.
  const isSplash = handle.splash === true
  // 비회원 랜딩(H01): 화면이 자체 헤더를 가지므로 AppBar와 하단 탭을 렌더링하지 않는다. 본문 배치·여백은 일반 화면과 같다.
  // 로그인한 회원에게는 같은 라우트도 일반 화면이다.
  const { status } = useAuth()
  const isGuestLanding = handle.landing === true && status !== 'authenticated'

  // 회원가입(A03): AppBar만 그리지 않는다. 본문 배치·하단 탭 노출은 handle 그대로다.
  const hideAppBar = isSplash || isGuestLanding || handle.hideAppBar === true

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
        {hideAppBar ? null : (
          <AppBar
            title={handle.title ?? ''}
            parent={handle.bodyBack === true ? null : (handle.parent ?? null)}
            brand={handle.brandHeader === true}
          />
        )}
        {/* 화면 전환은 RouteTransition이 공통으로 처리한다. AppBar·BottomNav는 전환 대상이 아니다. */}
        <RouteTransition
          className={
            isSplash
              ? 'flex flex-1 items-center justify-center px-6'
              : 'flex-1 px-5 py-5'
          }
          transition={handle.transition}
        >
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
