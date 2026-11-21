import { useMemo, useSyncExternalStore } from 'react'
import { useAuth } from '../auth/authContext.ts'
import {
  EXPERIENCE_SUBJECT_ID,
  isSignupExperienceActive,
  subscribeSignupExperience,
} from './signupExperience.ts'

/** 가입 흐름 화면(설문·이해도 확인)이 임시 데이터를 저장·조회할 때 쓰는 주체 */
export interface OnboardingSubject {
  id: string
  /** user: 로그인한 회원(개발용 로그인 포함), experience: 개발용 가입 체험(인증된 사용자가 아니다) */
  kind: 'user' | 'experience'
}

/** 개발용 가입 체험이 켜져 있는지. 켜진 상태가 바뀌면 다시 그려진다. 운영 빌드에서는 항상 false다. */
export function useSignupExperienceActive(): boolean {
  return useSyncExternalStore(
    subscribeSignupExperience,
    isSignupExperienceActive,
    () => false,
  )
}

/**
 * 가입 흐름 화면의 저장 주체. 로그인한 회원이 있으면 그 계정이 우선이고(두 가지를 섞지 않는다),
 * 없을 때만 가입 체험이 켜져 있으면 체험 주체를 쓴다. 둘 다 없으면 null이다.
 * 이 값은 인증 상태가 아니다. 화면 접근 권한을 정하는 것은 라우터의 게이트다.
 */
export function useOnboardingSubject(): OnboardingSubject | null {
  const { user } = useAuth()
  const experienceActive = useSignupExperienceActive()
  const userId = user?.id ?? null

  return useMemo(() => {
    if (userId !== null) return { id: userId, kind: 'user' }
    if (experienceActive)
      return { id: EXPERIENCE_SUBJECT_ID, kind: 'experience' }
    return null
  }, [userId, experienceActive])
}
