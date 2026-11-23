import { useAuth } from '../auth/authContext.ts'
import GuestLandingPage from './GuestLandingPage.tsx'
import MemberHomePage from './MemberHomePage.tsx'

/**
 * /home. 로그인 상태에 따라 화면을 나눈다.
 * - 로그인함: 회원 홈(MemberHomePage)
 * - 로그인하지 않음: 비회원 랜딩 H01(GuestLandingPage)
 * - 확인 중(loading, 실제 서버 인증의 앱 시작 확인): 아무것도 그리지 않는다(비회원 랜딩이 잠깐 보이지 않게)
 */
export default function HomePage() {
  const { status } = useAuth()
  if (status === 'loading') return null
  return status === 'authenticated' ? <MemberHomePage /> : <GuestLandingPage />
}
