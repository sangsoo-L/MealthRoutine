import { createContext, useContext } from 'react'
import type { AuthUser, LoginResult } from './authTypes.ts'

/**
 * 닉네임 저장 한 번에 묶인 로그인 작업 표식(F3-R1·C1·C2). 저장을 시작할 때 `beginNicknameSave()`로 받는다.
 * - isCurrent: 시작 때의 로그인 작업이 아직 유효한지(그 사이 로그인 시작·로그인/시작 확인 완료·로그아웃·세션 종료가 없었는지).
 * - commit: 유효하면 서버가 저장한 닉네임을 로그인 정보에 반영하고 true. 무효면 아무것도 바꾸지 않고 false.
 *   화면은 false면 결과를 버린다(저장 기준·성공 표시를 바꾸지 않는다). 판정은 동기로 끝나며 React 상태 반영을 기다리지 않는다.
 */
export interface NicknameSaveGuard {
  isCurrent(): boolean
  commit(nickname: string): boolean
}

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
  /** 닉네임 저장을 시작할 때 지금 로그인 작업에 묶인 표식을 받는다(F3-D3·R1). 로그인 상태가 아니면 null. */
  beginNicknameSave(): NicknameSaveGuard | null
}

/** 로그인 작업 표식의 React 밖 판단(테스트용으로 분리). commit은 반영할 새 user를 돌려주고, 무효면 null이다. */
export interface LoginWorkGuard {
  isCurrent(): boolean
  commit(nickname: string): AuthUser | null
}

export interface LoginWork {
  /** 지금 로그인 정보(React 상태보다 먼저, 동기로 바뀐다) */
  readonly user: AuthUser | null
  /** 로그인 정보가 바뀜: 로그인·시작 확인 완료, 로그아웃, 세션 종료. 이전 작업은 모두 무효가 된다. */
  replaceUser(next: AuthUser | null): void
  /** 새 로그인 시도가 시작됨. 결과가 성공이든 실패든 이전 작업은 다시 유효해지지 않는다(번호는 되돌리지 않는다). */
  startLogin(): void
  /** 지금 로그인 작업에 묶인 표식. 로그인 상태가 아니면 null */
  beginNicknameSave(): LoginWorkGuard | null
}

/**
 * 로그인 작업 번호(F3-R1·C1). 세션 모듈의 세대와 같은 시점(로그인 시작·로그인/시작 확인 결과 반영·로그아웃·세션 종료)에 올린다.
 * 세션 세대는 밖에서 읽을 수 없어(isCurrent만 공개) AuthProvider가 같은 의미의 번호를 따로 둔다.
 * user 객체 비교만으로는 "로그인 시작~응답 사이"를 구분하지 못하므로(Codex C1) 이 번호로 판정한다.
 * 닉네임 반영(commit)은 같은 로그인 작업 안의 변경이라 번호를 올리지 않는다.
 */
export function createLoginWork(initial: AuthUser | null): LoginWork {
  let work = 0
  let user = initial
  return {
    get user() {
      return user
    },
    replaceUser(next) {
      work += 1
      user = next
    },
    startLogin() {
      work += 1
    },
    beginNicknameSave() {
      const started = user
      if (started === null) return null
      const myWork = work
      const isCurrent = () =>
        work === myWork && user !== null && user.id === started.id
      return {
        isCurrent,
        commit(nickname) {
          if (!isCurrent() || user === null) return null
          if (user.nickname !== nickname) user = { ...user, nickname }
          return user
        },
      }
    },
  }
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext)
  if (value === null) {
    throw new Error('useAuth는 AuthProvider 안에서만 사용할 수 있습니다.')
  }
  return value
}
