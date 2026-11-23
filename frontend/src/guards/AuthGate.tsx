import { useAuth } from '../auth/authContext.ts'
import GuestNoticeGate from './GuestNoticeGate.tsx'

/**
 * 인증 상태(AuthProvider)를 읽어 GuestNoticeGate에 넘기는 얇은 래퍼.
 * 현재 상태는 개발용 로그인에서 오며 실제 인증 결과가 아니다.
 */
export default function AuthGate() {
  const { status } = useAuth()
  return <GuestNoticeGate status={status} />
}
