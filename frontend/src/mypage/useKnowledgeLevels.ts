import { useCallback, useEffect, useState } from 'react'
import { loadKnowledgeLevels } from './knowledgeSource.ts'
import type { KnowledgeState } from './mypageTypes.ts'

interface Loaded {
  /** 어떤 계정·몇 번째 시도의 결과인지. 현재 키와 다르면 지난 계정·시도의 값이라 쓰지 않는다. */
  key: string
  state: KnowledgeState
}

/**
 * 마이페이지의 이해도 상태. 계정이 바뀌거나 다시 시도하면 이전 값을 버리고 불러오는 중으로 돌아간다
 * (이전 계정의 값이 잠깐이라도 보이지 않는다). 화면이 마운트될 때마다 새로 조회하므로 이해도 확인을 마친 직후
 * 마이페이지에 들어오면 가장 최근 결과가 보인다.
 */
export function useKnowledgeLevels(userId: string): {
  state: KnowledgeState
  retry: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const key = `${userId}#${attempt}`

  useEffect(() => {
    let cancelled = false
    loadKnowledgeLevels(userId).then(
      (levels) => {
        if (cancelled) return
        setLoaded({
          key,
          state: levels
            ? { status: 'ready', levels }
            : { status: 'unavailable' },
        })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, key])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const state: KnowledgeState =
    loaded && loaded.key === key ? loaded.state : { status: 'loading' }
  return { state, retry }
}
