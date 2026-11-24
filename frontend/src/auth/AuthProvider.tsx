import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { clearRememberedRecordsDomain } from '../app/recordsTab.ts'
import { clearAccountScopedData } from './accountScope.ts'
import { AuthContext, type AuthContextValue } from './authContext.ts'
import { authBackend } from './authBackend.ts'
import {
  applyLoginResult,
  applyResumeResult,
  applySessionEnded,
  type AuthStateActions,
} from './authResults.ts'
import type { AuthUser, LoginResult } from './authTypes.ts'

/** 로그아웃·세션 종료·계정 전환 때 지우는 이전 계정 데이터 */
function clearAccountData(): void {
  clearAccountScopedData()
  clearRememberedRecordsDomain()
}

/**
 * 인증 상태 제공자. 실제 인증 처리는 `authBackend`에 맡기고, 여기서는 상태와 정리 규약만 다룬다.
 *
 * - 실제 서버 인증: 첫 화면은 `loading`이다. 앱 시작 확인(resume: refresh + GET /users/me)이 끝난 뒤 로그인 상태가 정해진다.
 *   확인 전에는 보호 화면이 열리지 않는다. 확인 중에도 로그인 화면에서 직접 로그인할 수 있다(그러면 시작 확인 결과는 버려진다).
 * - 개발용 계정(`VITE_DEV_AUTH=true`): 기존처럼 동기로 복원한다.
 * - 결과 반영 규칙은 authResults.ts에 있다(세대가 지금도 유효할 때만 반영).
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => authBackend.restore())
  // StrictMode에서 초기화가 두 번 불려도 세션 모듈이 같은 작업을 돌려주므로 시작 확인은 한 번만 일어난다.
  const [resumeTask] = useState(() => authBackend.resume?.() ?? null)
  const [booting, setBooting] = useState(resumeTask !== null)
  const [connectionNotice, setConnectionNotice] = useState(false)
  // 로그인 처리 중이면 새 요청을 만들지 않고 진행 중인 요청을 돌려준다.
  const pendingRef = useRef<Promise<LoginResult> | null>(null)

  const actions = useMemo<AuthStateActions>(
    () => ({
      isCurrent: (gen) => authBackend.isCurrent?.(gen) ?? true,
      clearAccountData,
      setUser,
      setBooting,
      setConnectionNotice,
    }),
    [],
  )

  // 시작 확인 결과만 구독한다. 정리 함수는 구독 해제뿐이며 서버 logout을 보내지 않는다.
  useEffect(() => {
    if (!resumeTask) return
    let active = true
    resumeTask.then(
      (result) => {
        if (active) applyResumeResult(result, actions)
      },
      () => {
        if (active) setBooting(false)
      },
    )
    return () => {
      active = false
    }
  }, [resumeTask, actions])

  // 로그인 만료·정지·다른 계정 감지: 서버 logout 없이 이 탭의 계정 데이터만 정리한다.
  useEffect(
    () => authBackend.onSessionEnded?.(() => applySessionEnded(actions)),
    [actions],
  )

  const login = useCallback(
    (email: string, password: string) => {
      if (pendingRef.current) return pendingRef.current

      async function run(): Promise<LoginResult> {
        try {
          const result = await authBackend.login(email, password)
          return applyLoginResult(result, {
            ...actions,
            clearAccountScopedData,
            persist: (loggedIn) => authBackend.persist(loggedIn),
          })
        } catch {
          // 수동 로그인이 시작 확인을 대체했으므로 예외에서도 loading을 끝낸다(applyLoginResult의 실패 처리와 같음).
          actions.setBooting(false)
          return { ok: false, reason: 'unavailable' }
        }
      }

      const task = run().finally(() => {
        // 자기 작업일 때만 비운다(그 사이 로그아웃 뒤 새 로그인이 들어왔을 수 있다).
        if (pendingRef.current === task) pendingRef.current = null
      })
      pendingRef.current = task
      return task
    },
    [actions],
  )

  const dismissConnectionNotice = useCallback(() => {
    setConnectionNotice(false)
  }, [])

  const logout = useCallback(() => {
    pendingRef.current = null
    authBackend.clear()
    clearAccountData()
    setUser(null)
    setBooting(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status: user ? 'authenticated' : booting ? 'loading' : 'unauthenticated',
      user,
      connectionNotice,
      dismissConnectionNotice,
      login,
      logout,
    }),
    [user, booting, connectionNotice, dismissConnectionNotice, login, logout],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}
