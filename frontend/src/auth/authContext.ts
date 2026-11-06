import { createContext, useContext } from 'react'
import type { AuthUser, LoginResult } from './authTypes.ts'

export interface AuthContextValue {
  /** 'loading'은 쓰지 않는다. 개발용 세션은 동기로 복원한다. (guards/RequireAuth의 AuthStatus와 호환) */
  status: 'authenticated' | 'unauthenticated'
  user: AuthUser | null
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
