import { Navigate, Outlet, useLocation } from 'react-router'

export type AuthStatus = 'authenticated' | 'unauthenticated' | 'loading'

interface RequireAuthProps {
  status: AuthStatus
}

/**
 * 인증 가드 인터페이스. 현재 어떤 라우트에도 연결되어 있지 않다.
 * 실제 인증 시스템과 인증 상태 출처(Context/hook)가 정해지기 전까지 동작을 가정하지 않는다.
 */
export default function RequireAuth({ status }: RequireAuthProps) {
  const location = useLocation()

  if (status === 'authenticated') return <Outlet />
  if (status === 'loading') return null

  // 임시, 확정 전: 로그인 후 복귀 방식은 미확정이다.
  // 원래 경로를 state.returnTo로만 전달하며, 실제 복귀 처리는 정해지면 구현한다.
  return (
    <Navigate
      to="/login"
      replace
      state={{ returnTo: location.pathname + location.search }}
    />
  )
}
