import { useEffect, useState } from 'react'

/**
 * 현재 시각. active가 true인 동안에만 intervalMs마다 갱신한다(타이머 화면의 남은 시간 표시용).
 * 값 자체는 표시에만 쓰고, 기록에 남는 측정 시간은 세트를 완료하는 순간 컨트롤러가 시각 차이로 한 번 정한다.
 * 갱신이 멈춰 있을 때(정지·대기)는 표시가 현재 시각에 의존하지 않는다.
 */
export function useNow(active: boolean, intervalMs = 250): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setNow(new Date()), intervalMs)
    return () => window.clearInterval(timer)
  }, [active, intervalMs])
  return now
}
