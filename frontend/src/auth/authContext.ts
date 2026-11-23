import { createContext, useContext } from 'react'
import type { AuthUser, LoginResult } from './authTypes.ts'

export interface AuthContextValue {
  /**
   * 'loading'은 실제 서버 인증에서 앱 시작 확인이 끝나기 전이다(guards/RequireAuth의 AuthStatus와 호환).
   * 개발용 계정(`VITE_DEV_AUTH=true`)은 동기로 복원하므로 loading이 없다.
   */
  status: 'authenticated' | 'unauthenticated' | 'loading'
  user: AuthUser | null
  /** 앱 시작 확인이 서버 연결 실패로 끝났다(F1-D7). 로그인 화면이 연결 안내를 보여 준다. */
  connectionNotice: boolean
  login(email: string, password: string): Promise<LoginResult>
  logout(): void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  }
  return value
}
