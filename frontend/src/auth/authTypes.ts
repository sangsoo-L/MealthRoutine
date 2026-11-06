/**
 * 인증 영역의 공통 타입.
 *
 * 현재 로그인은 UI 개발용이며 실제 인증(POST /api/v1/auth/login)과 연결되어 있지 않다.
 * 응답 구조가 정해지지 않아 `AuthUser`는 화면 개발에 필요한 최소 필드만 가진 임시 형태다.
 */

/** 회원 유형. free: 일반 회원, exercise: 운동 멤버십, meal: 식단 멤버십, full: 종합 멤버십 */
export type Entitlement = 'free' | 'exercise' | 'meal' | 'full'

export interface AuthUser {
  id: string
  email: string
  nickname: string
  entitlement: Entitlement
}

/** 로그인 결과. invalid: 입력 불일치, unavailable: 이 빌드에서 로그인을 처리할 수 없음 */
export type LoginResult =
  | { ok: true; user: AuthUser }
  | { ok: false; reason: 'invalid' | 'unavailable' }

/**
 * 인증 처리 경계. AuthProvider는 이 인터페이스만 안다.
 * 실제 인증 API가 정해지면 이 인터페이스를 구현한 객체로 `authBackend.ts`의 연결을 교체한다.
 */
export interface AuthBackend {
  login(email: string, password: string): Promise<LoginResult>
  /** 앞선 로그인을 복원한다. 복원할 수 없으면 null */
  restore(): AuthUser | null
  persist(user: AuthUser): void
  clear(): void
}

/**
 * 개발용 세션 sessionStorage 키. 비밀 값이 아니다.
 * 운영 빌드의 unavailableBackend가 남아 있는 개발 세션을 지우는 데도 쓰므로 개발 전용 파일에 두지 않는다.
 */
export const DEV_SESSION_KEY = 'mealthroutine.dev.session'
