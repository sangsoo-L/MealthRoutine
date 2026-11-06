import { Outlet } from 'react-router'
import LoginRequiredNotice from '../components/auth/LoginRequiredNotice.tsx'
import type { AuthStatus } from './RequireAuth.tsx'

interface GuestNoticeGateProps {
  status: AuthStatus
}

/**
 * 임시 비로그인 안내 가드(개발용 UI).
 *
 * 전달받은 status만 따르며 로그인 상태를 만들거나 저장하지 않는다. status는 AuthGate가 AuthProvider에서 읽어 넘긴다.
 * 현재 로그인은 UI 개발용이며 실제 인증이 아니다. URL은 바꾸지 않고 같은 경로에서 안내만 보여 준다.
 *
 * RequireAuth(로그인 화면으로 이동시키는 실제 인증 가드)와 역할이 다르다. 인증 API가 연결되면
 * 비회원 처리 방식에 맞춰 이 가드를 RequireAuth로 교체할 수 있다.
 */
export default function GuestNoticeGate({ status }: GuestNoticeGateProps) {
  if (status === 'authenticated') return <Outlet />
  // 인증 상태 확인 중의 화면은 인증 연결 시 정한다.
  if (status === 'loading') return null
  return <LoginRequiredNotice />
}
