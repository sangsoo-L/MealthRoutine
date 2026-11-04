import { createBrowserRouter, type RouteObject } from 'react-router'
import AppShell from '../layouts/AppShell.tsx'
import PagePlaceholder, {
  NotFoundPlaceholder,
} from '../pages/PagePlaceholder.tsx'
import type { RouteHandle } from './routeHandle.ts'

/** 임시 화면 라우트 설정. 임시 화면은 화면 ID를 표시하므로 screenId가 반드시 있다. */
type PlaceholderRouteConfig = { path?: string; index?: true } & RouteHandle & {
    screenId: string
  }

/**
 * 대표 경로 라우트 생성. handle과 임시 화면이 같은 값을 쓰도록 한 곳에서 만든다.
 */
function placeholderRoute({
  path,
  index,
  ...handle
}: PlaceholderRouteConfig): RouteObject {
  const element = (
    <PagePlaceholder screenId={handle.screenId} name={handle.title} />
  )
  return index ? { index, element, handle } : { path, element, handle }
}

const notFoundHandle: RouteHandle = {
  screenId: null,
  title: '페이지를 찾을 수 없습니다',
  tab: null,
  focus: false,
  domain: 'brand',
  parent: '/',
}

// 근거: 기획 단계에서 확정된 화면 명세 (대표 경로만 정의)
export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      placeholderRoute({
        index: true,
        screenId: 'H01',
        title: '홈',
        tab: 'home',
        focus: false,
        domain: 'brand',
        parent: null,
      }),
      placeholderRoute({
        path: 'login',
        screenId: 'A01',
        title: '로그인',
        tab: 'home',
        focus: true,
        domain: 'brand',
        parent: '/',
      }),
      placeholderRoute({
        path: 'exercises',
        screenId: 'E01',
        title: '운동 탐색',
        tab: 'explore',
        focus: false,
        domain: 'exercise',
        parent: '/',
      }),
      placeholderRoute({
        path: 'foods',
        screenId: 'F01',
        title: '음식 검색',
        tab: 'explore',
        focus: false,
        domain: 'meal',
        parent: '/',
      }),
      placeholderRoute({
        path: 'records/exercise',
        screenId: 'R01',
        title: '운동 기록 대시보드',
        tab: 'records',
        focus: false,
        domain: 'exercise',
        parent: '/',
      }),
      placeholderRoute({
        path: 'records/meal',
        screenId: 'R03',
        title: '식단 기록 대시보드',
        tab: 'records',
        focus: false,
        domain: 'meal',
        parent: '/',
      }),
      placeholderRoute({
        path: 'ai',
        screenId: 'I01',
        title: 'AI 서비스 안내',
        tab: 'ai',
        focus: false,
        domain: 'brand',
        parent: '/',
      }),
      placeholderRoute({
        path: 'mypage',
        screenId: 'P01',
        title: '마이페이지',
        tab: 'my',
        focus: false,
        domain: 'brand',
        parent: '/',
      }),
      placeholderRoute({
        path: 'support',
        screenId: 'S01',
        title: '고객지원',
        tab: 'my',
        focus: false,
        domain: 'brand',
        parent: '/mypage',
      }),
      {
        // 404 임시 최소 처리. 정식 디자인은 확정 후 반영한다.
        path: '*',
        element: <NotFoundPlaceholder />,
        handle: notFoundHandle,
      },
    ],
  },
])
