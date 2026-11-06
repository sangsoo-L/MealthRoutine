import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigationType } from 'react-router'
import type { RouteTransitionKind } from '../../app/routeHandle.ts'

type Played = 'slide' | 'fade' | 'pop'

/** 전환 유형별 애니메이션. 시간·거리는 global.css의 --animate-route-* 토큰이 정한다. */
const ANIMATION_CLASS: Record<Played, string> = {
  slide: 'animate-route-slide',
  fade: 'animate-route-fade',
  pop: 'animate-route-pop',
}

/** 전환이 끝나지 않아도 클리핑을 풀기까지 기다리는 최대 시간(ms). 전환 시간(최대 220ms)보다 길게 둔다. */
const CLIP_FAILSAFE_MS = 500

interface RouteTransitionProps {
  /** `<main>`에 줄 클래스. 레이아웃(여백·정렬)은 AppShell이 정한다. */
  className: string
  /** 도착 화면 handle의 전환 유형. 없으면 slide */
  transition: RouteTransitionKind | undefined
  children: ReactNode
}

/**
 * 모든 화면 전환의 공통 처리. AppShell의 본문(`<main>`)을 렌더하고 그 안의 화면을 전환한다.
 *
 * - pathname이 바뀔 때만 재생한다. 처음 열기·새로고침·같은 경로 이동(검색 파라미터 변경 포함)은 재생하지 않는다.
 * - 브라우저 뒤로가기·앞으로가기(POP)는 짧은 fade, 그 외는 도착 화면 handle의 유형을 따른다.
 * - `key={pathname}`으로 경로마다 새로 그린다. 같은 컴포넌트를 쓰는 경로 사이에서도 전환이 재생되고 화면 상태가 초기화된다.
 * - 애니메이션 대상은 본문뿐이다. AppBar·BottomNav는 AppShell 소속이라 움직이지 않는다.
 * - 이동 거리(10px)만큼 세로 넘침이 생겨 스크롤바가 나타나지 않도록, 전환이 진행되는 동안에만 본문을 잘라 낸다(overflow-clip).
 *   평소에는 자르지 않으므로 드롭다운·툴팁 같은 오버레이가 잘리지 않는다.
 *
 * 화면 안에서 직접 진입 애니메이션을 만들지 않는다. 화면 내부 전환(설문 질문 이동 등)은 이 전환이 끝난 뒤의 상호작용이다.
 */
export default function RouteTransition({
  className,
  transition,
  children,
}: RouteTransitionProps) {
  const { pathname } = useLocation()
  const navigationType = useNavigationType()
  const [state, setState] = useState<{
    pathname: string
    played: Played | null
  }>({ pathname, played: null })
  const [clipping, setClipping] = useState(false)

  // 렌더 중 파생 상태 갱신: pathname이 바뀐 이번 렌더에서 곧바로 전환 유형을 정한다.
  if (state.pathname !== pathname) {
    setState({
      pathname,
      played:
        navigationType === 'POP'
          ? 'pop'
          : transition === 'fade'
            ? 'fade'
            : 'slide',
    })
    setClipping(true)
  }

  useEffect(() => {
    if (!clipping) return
    // animationend가 오지 않는 경우(모션 줄이기, 전환 도중 이동)를 위한 안전장치
    const timerId = window.setTimeout(
      () => setClipping(false),
      CLIP_FAILSAFE_MS,
    )
    return () => window.clearTimeout(timerId)
  }, [clipping, state.pathname])

  return (
    <main
      className={`${className} ${clipping ? 'overflow-clip motion-reduce:overflow-visible' : ''}`}
    >
      <div
        key={pathname}
        className={
          state.played
            ? `${ANIMATION_CLASS[state.played]} motion-reduce:animate-none`
            : undefined
        }
        onAnimationEnd={(event) => {
          // 화면 안의 다른 애니메이션(설문 카드 등)이 끝날 때 클리핑을 풀지 않는다.
          if (event.target === event.currentTarget) setClipping(false)
        }}
      >
        {children}
      </div>
    </main>
  )
}
