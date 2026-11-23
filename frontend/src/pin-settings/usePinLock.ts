import { useCallback, useEffect, useState } from 'react'

/**
 * 현재 번호 확인 5회 실패로 생긴 5분 잠금의 상태. P12(변경)와 P05(신체 정보 확인)가 같이 쓴다.
 * - `statusRetryAt`: 등록 여부 조회가 알려 준 잠금 해제 시각(없으면 null)
 * - `markLocked`: 저장소 오류가 알려 준 해제 시각을 기록한다(조회 결과보다 우선한다)
 * 시각이 지나면 타이머가 잠금을 풀어 준다. 잠금 규칙(횟수·시간) 자체는 저장소가 정하고 이 훅은 표시 상태만 맡는다.
 */
export function usePinLock(statusRetryAt: number | null): {
  locked: boolean
  retryAt: number | null
  markLocked: (retryAt: number | null | undefined) => void
} {
  // 오류가 알려 준 잠금 시각과, 시각이 지나 풀린 값을 구분해 둔다.
  const [errorRetryAt, setErrorRetryAt] = useState<number | null>(null)
  const [expiredAt, setExpiredAt] = useState<number | null>(null)
  const retryAt = errorRetryAt ?? statusRetryAt
  const locked = retryAt !== null && retryAt !== expiredAt

  useEffect(() => {
    if (retryAt === null) return
    const timer = window.setTimeout(
      () => setExpiredAt(retryAt),
      Math.max(0, retryAt - Date.now()),
    )
    return () => window.clearTimeout(timer)
  }, [retryAt])

  const markLocked = useCallback((value: number | null | undefined) => {
    setErrorRetryAt(value ?? null)
  }, [])

  return { locked, retryAt, markLocked }
}
