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
  /**
   * 화면 제목. 상단 바(AppBar)는 없으므로 화면 안에 눈에 보이는 제목이 없는 화면은 AppShell이 이 값을
   * 보조기기용 h1(sr-only)로 넣는다. 눈에 보이는 제목을 화면이 가지면 `ownH1`로 알린다.
   */
  title: string
  /** 활성화할 하단 탭. 활성 탭이 없으면 null */
  tab: TabKey | null
  /** true이면 하단 탭(BottomNav)을 렌더하지 않음. 비회원 랜딩의 하단 탭 숨김은 `landing`이 따로 처리한다. */
  focus: boolean
  /** true이면 본문을 화면 정중앙에 렌더. 인트로 스플래시 전용 (없으면 false) */
  splash?: boolean
  /**
   * true이면 비회원일 때만 자체 헤더(LandingHeader)를 쓰는 랜딩이라 하단 탭을 숨기고 공통 h1도 넣지 않는다.
   * 로그인한 회원에게는 일반 화면이다. 비회원 홈(H01) 전용이다. (없으면 false)
   */
  landing?: boolean
  /**
   * true이면 화면이 자체 h1(보이는 제목이든 보조기기용이든)을 가지고 있다는 뜻이라 AppShell이 공통 h1을 넣지 않는다.
   * 통합검색, 이해도 확인, 상세 설정이 쓴다. (없으면 false)
   */
  ownH1?: boolean
  /**
   * true이면 AppShell이 뒤로가기를 그리지 않는다. 화면이 직접 그리거나(운동·음식 탐색, 로그인) 아예 두지 않는 화면(회원가입,
   * 통합검색)이다. 직접 그리는 화면은 `parent`와 같은 규칙(useBackTarget)을 쓴다. (없으면 false)
   */
  bodyBack?: boolean
  /** 도메인색 구분 */
  domain: Domain
  /**
   * 상위 화면 경로. 있고 `bodyBack`이 아니면 AppShell이 본문 위에 "이전" 뒤로가기를 그리고 이 경로로 이동한다(상세 화면용).
   * 하단 탭의 대표 화면은 하단 탭이 이동을 맡으므로 null로 둔다.
   */
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
