import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import { getMyPageSummary } from './mypageSource.ts'
import type { MyPageSummary } from './mypageTypes.ts'

/**
 * 마이페이지(P01)가 그릴 데이터. 출처와 개발용 값 규칙은 mypageSource.ts에 있다.
 * 값은 로그인한 계정 id로 고르므로 계정을 바꾸면 그 계정의 값이 바로 따라온다.
 * 검색 파라미터만 바뀌는 이동은 화면 전환이 없고 화면이 다시 마운트되지 않으므로, 예시 전환도 이 훅이 바로 따른다.
 */
export function useMyPageSummary(): MyPageSummary {
  const [params] = useSearchParams()
  const { user } = useAuth()
  const sampleParam = params.get('sample')
  const userId = user?.id ?? null
  return useMemo(
    () => getMyPageSummary(sampleParam, userId),
    [sampleParam, userId],
  )
}
