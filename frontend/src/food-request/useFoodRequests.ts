import { useCallback, useEffect, useState } from 'react'
import {
  runListRequests,
  type FoodRequestSource,
  type RequestListState,
} from './foodRequest.ts'

/**
 * 내 요청 목록 조회(읽기 전용). 서버 연결(source)이 없으면 조회하지 않고 unavailable이다("요청 없음"이 아니다).
 * 화면을 떠나면 진행 중 조회를 중단하고, 다시 시도(reload)는 같은 조회를 다시 한다.
 */
export function useFoodRequests(source: FoodRequestSource | null): {
  state: RequestListState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    attempt: number
    state: Exclude<RequestListState, { status: 'loading' }>
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void runListRequests(source, controller.signal).then((state) => {
      if (!controller.signal.aborted) setLoaded({ attempt, state })
    })
    return () => controller.abort()
  }, [source, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return {
    state:
      loaded !== null && loaded.attempt === attempt
        ? loaded.state
        : { status: 'loading' },
    reload,
  }
}
