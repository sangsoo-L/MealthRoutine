import { useCallback, useEffect, useState } from 'react'
import {
  runGetProfile,
  type ProfileSource,
  type ProfileState,
} from './profile.ts'

/**
 * 내 프로필 조회(읽기 전용). 서버 연결(source)이 없으면 조회하지 않고 unavailable이다("정보 없음"이 아니다).
 * 화면을 떠나면 진행 중 조회를 중단하고, 다시 시도(reload)는 같은 조회를 다시 한다.
 * 계정이 바뀌면 호출한 화면이 key로 새로 마운트해 이전 계정의 상태가 남지 않는다.
 */
export function useProfile(source: ProfileSource | null): {
  state: ProfileState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<{
    attempt: number
    state: Exclude<ProfileState, { status: 'loading' }>
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    void runGetProfile(source, controller.signal).then((state) => {
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
