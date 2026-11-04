/**
 * 라우트 `handle` 메타데이터 구조와 하단 탭 정의.
 * 화면 목록과 경로는 기획 단계에서 확정된 화면 명세를 기준으로 한다.
 */

export type TabKey = 'home' | 'explore' | 'records' | 'ai' | 'my'

export type Domain = 'brand' | 'exercise' | 'meal'

export interface RouteHandle {
  /** 화면 ID (예: 'H01'). 화면명세에 없는 임시 화면은 null */
  screenId: string | null
  /** AppBar 중앙에 표시할 화면 제목 */
  title: string
  /** 활성화할 하단 탭. 활성 탭이 없으면 null */
  tab: TabKey | null
  /** true이면 하단 탭(BottomNav)을 렌더하지 않음 */
  focus: boolean
  /** 도메인색 구분 */
  domain: Domain
  /** 상위 화면 경로. 있을 때만 AppBar 뒤로가기를 표시하고 이 경로로 이동 */
  parent: string | null
}

export interface TabDefinition {
  key: TabKey
  label: string
  to: string
  glyph: string
}

/**
 * 하단 탭 정의. BottomNav 렌더링과 `handle.tab` 값이 같은 `key`를 공유한다.
 */
export const TABS: readonly TabDefinition[] = [
  { key: 'home', label: '홈', to: '/', glyph: '⌂' },
  { key: 'explore', label: '탐색', to: '/exercises', glyph: '⌕' },
  { key: 'records', label: '기록', to: '/records/exercise', glyph: '▤' },
  { key: 'ai', label: 'AI', to: '/ai', glyph: '✧' },
  { key: 'my', label: '마이', to: '/mypage', glyph: '○' },
]

/**
 * `useMatches()`의 `handle`은 unknown이므로 객체일 때만 RouteHandle로 읽는다.
 * handle이 없는 라우트(루트 레이아웃 등)는 빈 객체를 돌려준다.
 */
export function getRouteHandle(handle: unknown): Partial<RouteHandle> {
  return typeof handle === 'object' && handle !== null
    ? (handle as Partial<RouteHandle>)
    : {}
}
