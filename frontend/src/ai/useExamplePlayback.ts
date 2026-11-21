import { useCallback, useEffect, useRef, useState } from 'react'

/** 모션 줄이기 설정인지(서버 렌더링·미지원 환경이면 false). */
export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * I02 예시 재생 상태. 프레임 번호와 재생·일시정지를 관리하고, 다음을 정리한다.
 * - 모션 줄이기 환경에서는 처음부터 정지(재생은 사용자가 눌러야 시작)이고, 재생 중 설정이 켜지면 멈춘다.
 * - 탭이 가려지면(백그라운드) 재생을 멈춘다. 돌아와도 자동으로 다시 재생하지 않는다.
 * - 화면을 떠나면(언마운트) 타이머와 이벤트 리스너를 모두 지운다.
 * 마지막 프레임이 끝나면 onCycleEnd를 부르고(다음 예시로 넘기는 등) 프레임을 처음으로 돌린다.
 */
export function useExamplePlayback({
  frameCount,
  durationOf,
  initialFrame,
  onCycleEnd,
}: {
  frameCount: number
  /** 프레임별 머무는 시간(ms) */
  durationOf: (frame: number) => number
  /** 모션 줄이기일 때 처음 보여 줄 정지 장면 */
  initialFrame: number
  onCycleEnd: () => void
}): {
  frame: number
  playing: boolean
  toggle: () => void
  jumpTo: (frame: number) => void
} {
  const [reduced] = useState(prefersReducedMotion)
  const [playing, setPlaying] = useState(!reduced)
  const [frame, setFrame] = useState(reduced ? initialFrame : 0)
  // 콜백·길이가 바뀌어도 타이머를 다시 만들지 않도록 최신 값만 담는다.
  const latest = useRef({ durationOf, onCycleEnd, frameCount })
  useEffect(() => {
    latest.current = { durationOf, onCycleEnd, frameCount }
  })

  useEffect(() => {
    if (!playing) return
    const timer = window.setTimeout(() => {
      const { onCycleEnd: end, frameCount: count } = latest.current
      if (frame >= count - 1) {
        setFrame(0)
        end()
      } else {
        setFrame(frame + 1)
      }
    }, latest.current.durationOf(frame))
    return () => window.clearTimeout(timer)
  }, [playing, frame])

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPlaying(false)
    }
    document.addEventListener('visibilitychange', onVisibility)
    const media =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
    const onMotion = (event: MediaQueryListEvent) => {
      if (event.matches) setPlaying(false)
    }
    media?.addEventListener('change', onMotion)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      media?.removeEventListener('change', onMotion)
    }
  }, [])

  const toggle = useCallback(() => setPlaying((value) => !value), [])
  const jumpTo = useCallback((next: number) => setFrame(next), [])
  return { frame, playing, toggle, jumpTo }
}
