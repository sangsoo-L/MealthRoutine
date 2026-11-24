import { useCallback, useEffect, useState } from 'react'
import {
  runGetProfile,
  type ProfileRead,
  type ProfileSource,
  type ProfileState,
} from './profile.ts'

/**
 * 내 프로필 조회(읽기 전용). 서버 연결(source)이 없으면 조회하지 않고 unavailable이다("정보 없음"이 아니다).
 * 화면을 떠나면 진행 중 조회를 중단하고, 다시 시도(reload)는 같은 조회를 다시 한다.
 * 계정이 바뀌면 호출한 화면이 key로 새로 마운트해 이전 계정의 상태가 남지 않는다.
 *
 * PR #29 P2-03:
 * - `beginRead`: 조회를 시작할 때 불러 판정(`createReadGate`)을 받는다. 도착 때 거짓이면(그 사이 로그인 작업이 바뀜,
 *   저장 성공이 반영됨) 결과를 버리고 **다시 조회**한다. 다시 조회하는 동안 이미 보이던 결과(같은 로그인 작업의 ready)는 그대로 보이고,
 *   없을 때만 "불러오는 중"이다(계획 v2). 버리려면 그 사이 변화가 또 있어야 하므로 변화가 멈추면 다음 조회에서 끝난다.
 *   반영한 결과에는 시작 때의 저장 버전(`readVersion`)을 붙여 편집기가 적용 순간에 한 번 더 확인한다(같은 턴 경합).
 * - `resetKey`: 바뀌면(같은 계정의 새 로그인 작업) 새로 조회한다. 이전 조회는 중단된다.
 */
/** 반영된 조회 한 번(조회 번호·로그인 작업 번호·결과). */
export interface LoadedProfile {
  attempt: number
  resetKey: number
  state: Exclude<ProfileState, { status: 'loading' }>
}

/**
 * 지금 보일 조회 상태(React와 분리해 시험한다). 같은 로그인 작업(resetKey)의 결과만 보인다.
 * 지금 조회 번호의 결과면 그대로, 오래된 조회를 버리고 다시 읽는 중(silentAttempt)이면 이미 보이던 ready를 유지, 그 밖은 loading.
 */
export function shownProfileState(
  loaded: LoadedProfile | null,
  attempt: number,
  silentAttempt: number | null,
  resetKey: number,
): ProfileState {
  if (loaded === null || loaded.resetKey !== resetKey)
    return { status: 'loading' }
  if (loaded.attempt === attempt) return loaded.state
  if (silentAttempt === attempt && loaded.state.status === 'ready')
    return loaded.state
  return { status: 'loading' }
}

export function useProfile(
  source: ProfileSource | null,
  {
    beginRead,
    resetKey = 0,
  }: { beginRead?: () => ProfileRead; resetKey?: number } = {},
): {
  state: ProfileState
  reload: () => void
} {
  const [attempt, setAttempt] = useState(0)
  // 오래된 조회를 버리고 다시 조회하는 번호. 이 번호의 조회 동안에는 이미 보이던 결과를 그대로 보인다.
  const [silentAttempt, setSilentAttempt] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<LoadedProfile | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const read = beginRead ? beginRead() : null
    void runGetProfile(source, controller.signal).then((state) => {
      if (controller.signal.aborted) return
      // 오래된 조회: 반영하지 않고 지금 기준으로 다시 읽는다(보이던 결과는 유지).
      if (read !== null && !read.fresh()) {
        setSilentAttempt(attempt + 1)
        setAttempt(attempt + 1)
        return
      }
      setLoaded({
        attempt,
        resetKey,
        state:
          state.status === 'ready' && read !== null
            ? { ...state, readVersion: read.version }
            : state,
      })
    })
    return () => controller.abort()
  }, [source, attempt, resetKey, beginRead])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  return {
    state: shownProfileState(loaded, attempt, silentAttempt, resetKey),
    reload,
  }
}
