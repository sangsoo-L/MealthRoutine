import { useAuth } from '../auth/authContext.ts'
import GuestLandingPage from './GuestLandingPage.tsx'
import MemberHomePage from './MemberHomePage.tsx'

/**
 * /home. 로그인 상태에 따라 화면을 나눈다. 로그인은 현재 UI 개발용이며 실제 인증이 아니다.
 * - 로그인함: 회원 홈(MemberHomePage)
 * - 로그인하지 않음: 비회원 랜딩 H01(GuestLandingPage)
 */
export default function HomePage() {
  const { status } = useAuth()
  return status === 'authenticated' ? <MemberHomePage /> : <GuestLandingPage />
}
