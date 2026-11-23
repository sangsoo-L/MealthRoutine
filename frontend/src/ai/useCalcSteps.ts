import { useEffect, useState } from 'react'

/** 명세의 "약 2초 계산" 연출 길이와 단계 전환 시점(ms). 실제 계산은 즉시 끝나며 이 값은 화면 연출에만 쓴다. */
export const CALC_TOTAL_MS = 2000
export const CALC_STEP_MS = [0, 650, 1300] as const

/**
 * 계산 연출의 진행 단계(1~3)와 완료 여부. 화면을 떠나면(언마운트) 타이머를 모두 정리한다.
 * 재마운트(다른 주·다시 평가하기)할 때마다 처음부터 다시 시작한다.
 */
export function useCalcSteps(): { step: number; done: boolean } {
  const [step, setStep] = useState(1)
  const [done, setDone] = useState(false)
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStep(2), CALC_STEP_MS[1]),
      window.setTimeout(() => setStep(3), CALC_STEP_MS[2]),
      window.setTimeout(() => setDone(true), CALC_TOTAL_MS),
    ]
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [])
  return { step, done }
}
