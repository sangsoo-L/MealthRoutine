import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import type { AuthUser } from '../auth/authTypes.ts'
import { fetchServerRewardSlots, getMyPageSummary } from './mypageSource.ts'
import type { MyPageSummary } from './mypageTypes.ts'

type ServerSlots = Pick<MyPageSummary, 'level' | 'points'>

/** 한 번의 조회 결과. session은 조회할 때의 로그인 세션(로그인마다 새 user 객체), slots가 null이면 실패. */
export interface RewardFetchResult {
  session: AuthUser
  slots: ServerSlots | null
}

/**
 * 지금 화면에 쓸 서버 레벨·포인트. 지금 세션의 조회 결과이고 성공했을 때만 쓴다.
 * 다른 세션(같은 id로 다시 로그인한 경우 포함)의 결과나 실패한 조회는 쓰지 않아 이전 값이 남지 않는다.
 */
export function currentRewardSlots(
  result: RewardFetchResult | null,
  session: AuthUser | null,
): ServerSlots | null {
  if (session === null || result === null || result.session !== session)
    return null
  return result.slots
}

/**
 * 마이페이지(P01)가 그릴 데이터. 출처와 개발용 값 규칙은 mypageSource.ts에 있다.
 * 값은 로그인한 계정 id로 고르므로 계정을 바꾸면 그 계정의 값이 바로 따라온다.
 * 검색 파라미터만 바뀌는 이동은 화면 전환이 없고 화면이 다시 마운트되지 않으므로, 예시 전환도 이 훅이 바로 따른다.
 * 예시·개발용 값이 없는 로그인 계정은 레벨·포인트를 GET /users/me/rewards로 채운다.
 * 로그인할 때마다 다시 조회하고(같은 id 재로그인 포함), 조회에 실패하면 이전 값 대신 "연결 전"으로 둔다.
 */
export function useMyPageSummary(): MyPageSummary {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const sampleParam = params.get('sample')
  const userId = user?.id ?? null
  const base = useMemo(
    () => getMyPageSummary(sampleParam, userId),
    [sampleParam, userId],
  )
  // 예시·개발용 값이 이미 채운 경우는 서버를 부르지 않는다
  const useServer = user !== null && base.level.state === 'unavailable'
  const [result, setResult] = useState<RewardFetchResult | null>(null)

  useEffect(() => {
    if (!useServer || user === null) return
    let alive = true // 세션이 바뀌거나 화면을 떠나면 늦게 온 응답은 버린다
    void fetchServerRewardSlots().then((slots) => {
      if (alive) setResult({ session: user, slots }) // 실패(null)도 기록해 이전 성공 값을 지운다
    })
    return () => {
      alive = false
    }
  }, [useServer, user])

  const slots = useServer ? currentRewardSlots(result, user) : null
  return slots ? { ...base, ...slots } : base
}
