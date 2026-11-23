import { useCallback, useEffect, useState } from 'react'
import type { HistoryState } from './historyState.ts'

/**
 * 내역 조회(읽기 전용). `run`은 조회 한 번을 수행하는 함수(연결이 없으면 unavailable을 돌려준다)이고, 화면을 떠나면 진행 중 조회를 중단한다.
 * 다시 시도(reload)는 같은 조회를 다시 한다. 계정이 바뀌면 호출한 화면이 key로 새로 마운트해 이전 계정의 상태가 남지 않는다.
 * `run`은 모듈 수준의 고정 함수여야 한다(렌더마다 바뀌면 다시 조회한다).
 */
export function useHistory<T>(
  run: (
    signal: AbortSignal,
  ) => Promise<Exclude<HistoryState<T>, { status: 'loading' }>>,
): { state: HistoryState<T>; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    attempt: number
    state: Exclude<HistoryState<T>, { status: 'loading' }>
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void run(controller.signal).then((state) => {
      if (!controller.signal.aborted) setLoaded({ attempt, state })
    })
    return () => controller.abort()
  }, [run, attempt])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return {
    state:
      loaded !== null && loaded.attempt === attempt
        ? loaded.state
        : { status: 'loading' },
    reload,
  }
}
