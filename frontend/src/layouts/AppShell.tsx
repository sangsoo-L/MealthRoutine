import { Outlet, ScrollRestoration, useMatches } from 'react-router'
import { getRouteHandle } from '../app/routeHandle.ts'
import AppBar from '../components/layout/AppBar.tsx'
import BottomNav from '../components/layout/BottomNav.tsx'

/**
 * 모든 화면이 공유하는 단일 레이아웃(AppBar + 본문 + BottomNav).
 * 가장 마지막 매치의 `handle`로 제목, 뒤로가기, 활성 탭, 하단탭 노출을 결정한다.
 */
export default function AppShell() {
  const matches = useMatches()
  const handle = getRouteHandle(matches.at(-1)?.handle)

  return (
    <div className="min-h-screen bg-page font-sans text-body font-normal text-content">
      <div className="mx-auto flex min-h-screen max-w-app flex-col">
        <AppBar title={handle.title ?? ''} parent={handle.parent ?? null} />
        <main className="flex-1 px-5 py-5">
          <Outlet />
        </main>
        {handle.focus === true ? null : (
          <BottomNav activeTab={handle.tab ?? null} />
        )}
      </div>
      <ScrollRestoration />
    </div>
  )
}
