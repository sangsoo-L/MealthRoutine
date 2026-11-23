import { useEffect } from 'react'
import { Outlet } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import LoginRequiredNotice from '../components/auth/LoginRequiredNotice.tsx'
import { flushSignupExperienceEnd } from '../signup-experience/signupExperience.ts'
import { useSignupExperienceActive } from '../signup-experience/useOnboardingSubject.ts'

/**
 * 로그인한 회원 또는 개발용 가입 체험 중인 사용자만 통과시키는 가드. 이해도 확인 화면(/onboarding/assessment)에만 쓴다.
 *
 * - 로그인 여부(status)는 AuthGate와 같이 AuthProvider에서 읽는다. 이 가드는 인증 상태를 만들거나 바꾸지 않는다.
 * - 가입 체험은 개발 서버에서만 켜질 수 있다(signup-experience/signupExperience.ts). 운영 빌드에서는 항상 꺼져 있어
 *   이 가드는 AuthGate와 똑같이 동작한다(비회원에게 로그인 안내). 운영의 인증 보호는 약해지지 않는다.
 * - 체험 표지는 이 라우트만 열어 준다. 마이페이지·기록처럼 AuthGate 뒤에 있는 화면은 체험 중에도 막혀 있다.
 *
 * 실제 가입·로그인이 연결되면 가입 직후 인증 상태가 만들어지므로 이 가드를 AuthGate로 되돌린다.
 */
export default function AuthOrExperienceGate() {
  const { status } = useAuth()
  const experienceActive = useSignupExperienceActive()

  // 이 게이트가 사라질 때(= 이 화면을 실제로 떠났을 때) 예약된 체험 종료를 실행한다.
  // 이동 중에는 체험이 유지되어 접근 제한 안내가 깜빡이지 않는다. 예약이 없으면 아무 일도 하지 않는다.
  useEffect(() => flushSignupExperienceEnd, [])

  if (status === 'authenticated' || experienceActive) return <Outlet />
  return <LoginRequiredNotice />
}
