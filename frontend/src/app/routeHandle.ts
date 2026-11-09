/**
 * 라우트 `handle` 메타데이터 구조와 하단 탭 정의.
 * 화면 ID·화면명의 근거는 documents/화면명세_v5.0.json이고, 프로젝트 URL은 frontend/docs/screen-route-map.md이다.
 */

import type { IconName } from '../components/icons/iconTypes.ts'

export type TabKey = 'home' | 'explore' | 'records' | 'ai' | 'my'

export type Domain = 'brand' | 'exercise' | 'meal'

/** 화면 전환 유형. slide: Fade + Slide Up(기본), fade: Fade만(최상위 화면 도착) */
export type RouteTransitionKind = 'slide' | 'fade'

export interface RouteHandle {
  /** 화면 ID (예: 'H01'). 화면명세에 없는 임시 화면은 null */
  screenId: string | null
  /** AppBar 중앙에 표시할 화면 제목 */
  title: string
  /** 활성화할 하단 탭. 활성 탭이 없으면 null */
  tab: TabKey | null
  /** true이면 하단 탭(BottomNav)을 렌더하지 않음. 비회원 랜딩의 하단 탭 숨김은 `landing`이 따로 처리한다. */
  focus: boolean
  /** true이면 AppBar를 숨기고 본문을 화면 중앙에 렌더. 인트로 스플래시 전용 (없으면 false) */
  splash?: boolean
  /**
   * true이면 비회원일 때만 자체 헤더를 쓰는 랜딩이라 AppBar와 하단 탭을 숨긴다. 로그인한 회원에게는 일반 화면이다.
   * 비회원 홈(H01) 전용이다. splash와 달리 본문 배치는 그대로다. (없으면 false)
   */
  landing?: boolean
  /**
   * true이면 AppBar 중앙의 제목 글자 대신 MealthRoutine 로고(심볼 + 이름)를 보이고 우측 고객지원(도움말) 링크를 숨긴다.
   * 로그인 회원의 홈(/home) 전용이다. 비회원일 때 같은 라우트는 AppBar 없이 랜딩 헤더를 쓴다. (없으면 false)
   */
  brandHeader?: boolean
  /**
   * true이면 AppBar를 렌더링하지 않는다(숨기는 것이 아니라 그리지 않는다). 본문 배치와 하단 탭 노출은 그대로다.
   * 화면이 자체 상단 영역을 갖는 경우에 쓴다. 회원가입(A03)과 통합검색(/search)이 쓴다. (없으면 false)
   */
  hideAppBar?: boolean
  /**
   * true이면 AppBar에 뒤로가기를 그리지 않고(그 자리는 비운다) 화면 본문이 직접 그린다. 이동 목적지는 `parent`와 같은 규칙이다.
   * 운동 탐색(E01)이 쓴다. (없으면 false)
   */
  bodyBack?: boolean
  /** 도메인색 구분 */
  domain: Domain
  /** 상위 화면 경로. 있을 때만 AppBar 뒤로가기를 표시하고 이 경로로 이동 */
  parent: string | null
  /**
   * 이 화면에 도착할 때의 전환 유형. 없으면 'slide'(일반 이동).
   * 하단 탭의 대표 화면 같은 최상위 화면만 'fade'로 선언한다. 브라우저 뒤로가기·앞으로가기는 이 값과 상관없이 짧은 fade다.
   */
  transition?: RouteTransitionKind
}

export interface TabDefinition {
  key: TabKey
  label: string
  to: string
  icon: IconName
}

/**
 * 하단 탭 정의. BottomNav 렌더링과 `handle.tab` 값이 같은 `key`를 공유한다.
 */
export const TABS: readonly TabDefinition[] = [
  { key: 'home', label: '홈', to: '/home', icon: 'home' },
  { key: 'explore', label: '탐색', to: '/explore', icon: 'search' },
  { key: 'records', label: '기록', to: '/records/exercise', icon: 'clipboard' },
  { key: 'ai', label: 'AI', to: '/ai', icon: 'sparkle' },
  { key: 'my', label: '마이', to: '/mypage', icon: 'user' },
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
