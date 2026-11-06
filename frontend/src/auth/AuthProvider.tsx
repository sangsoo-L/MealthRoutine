import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { clearAccountScopedData } from './accountScope.ts'
import { AuthContext, type AuthContextValue } from './authContext.ts'
import { authBackend } from './authBackend.ts'
import type { AuthUser, LoginResult } from './authTypes.ts'

/**
 * 인증 상태 제공자. 실제 인증 처리는 `authBackend`에 맡기고, 여기서는 상태와 정리 규약만 다룬다.
 * 현재 연결된 처리는 개발용이며 실제 인증이 아니다.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  // 초기 복원은 동기라 첫 렌더부터 로그인 상태가 정해진다.
  const [user, setUser] = useState<AuthUser | null>(() => authBackend.restore())
  // 로그인 처리 중이면 새 요청을 만들지 않고 진행 중인 요청을 돌려준다.
  const pendingRef = useRef<Promise<LoginResult> | null>(null)

  const login = useCallback((email: string, password: string) => {
    if (pendingRef.current) return pendingRef.current

    async function run(): Promise<LoginResult> {
      try {
        const result = await authBackend.login(email, password)
        if (result.ok) {
          // 이전 계정의 임시 데이터가 섞이지 않게 먼저 정리한다.
          clearAccountScopedData()
          authBackend.persist(result.user)
          setUser(result.user)
        }
        return result
      } catch {
        return { ok: false, reason: 'unavailable' }
      }
    }

    const task = run().finally(() => {
      pendingRef.current = null
    })
    pendingRef.current = task
    return task
  }, [])

  const logout = useCallback(() => {
    authBackend.clear()
    clearAccountScopedData()
    setUser(null)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: user ? 'authenticated' : 'unauthenticated',
      user,
      login,
      logout,
    }),
    [user, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
