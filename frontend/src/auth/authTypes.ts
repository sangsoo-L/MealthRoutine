/**
 * 인증 영역의 공통 타입.
 *
 * 기본 인증 처리는 실제 백엔드(serverBackend: POST /api/v1/auth/login, refresh 쿠키, GET /users/me)다.
 * 개발 서버에서 `VITE_DEV_AUTH=true`일 때만 개발용 계정(dev/devBackend)을 쓴다(F1-D3).
 */

/**
 * 멤버십 상품 유형(통합 AI 멤버십). free: 무료(일반 회원), basic: 베이직, pro: 프로.
 * 운동·식단별 멤버십 상품 구분은 없다(옛 값 exercise·meal·full은 없어졌다).
 *
 * 이 값은 표시용 상품 유형일 뿐 **AI 기능 사용 권한이 아니다.** AI 사용 가능 여부와 잔여 횟수는 서버가 확인한 통합 AI 사용량
 * (`membership/membership.ts`의 `MembershipInfo.usage`)이 기준이고, 이 값으로 기능 접근을 허용하거나 막지 않는다.
 * 실제 서버 로그인에서는 멤버십 API가 아직 연결되지 않아 임시로 `free`다(F1-D2). 권한 판단에 쓰지 않는다.
 */
export type Entitlement = 'free' | 'basic' | 'pro'

export interface AuthUser {
  id: string
  email: string
  nickname: string
  entitlement: Entitlement
}

/**
 * 로그인 결과. invalid: 입력 불일치, suspended: 정지 계정(message는 서버 문구), unavailable: 서버에 연결할 수 없거나 처리할 수 없음.
 * gen은 실제 서버 로그인의 세대 번호다. 결과를 화면에 반영하기 전에 `AuthBackend.isCurrent(gen)`로 오래된 결과인지 확인한다.
 */
export type LoginResult =
  | { ok: true; user: AuthUser; gen?: number }
  | {
      ok: false
      reason: 'invalid' | 'suspended' | 'unavailable'
      message?: string
    }

/**
 * 앱 시작 확인 결과(실제 서버 인증에만 있다).
 * - ok: 서버가 확인한 회원. switchedAccount면 이 탭이 기억하던 회원과 다른 회원(다른 탭에서 로그인)으로 바뀐 것이다(F1-D10 ①).
 * - ended: 로그인이 끝났다(쿠키 만료·정지 등). transient: 서버에 연결하지 못했다(F1-D7, 다음 새로고침에서 다시 확인).
 */
export type ResumeResult =
  | {
      gen: number
      ok: true
      user: AuthUser
      switchedAccount: boolean
      /**
       * 결과를 공용 세션으로 확정한다(세대가 유효할 때만 true). switchedAccount면 이전 계정 데이터를 정리한 **뒤에** 부른다 —
       * 그 전에는 새 회원의 토큰으로 업무 요청이 나가지 않는다.
       */
      activate(): boolean
    }
  | { gen: number; ok: false; kind: 'ended' | 'transient' }

export type SessionEndReason = 'expired' | 'suspended' | 'accountChanged'

/**
 * 인증 처리 경계. AuthProvider는 이 인터페이스만 안다.
 * 선택 메서드(resume·isCurrent·onSessionEnded)는 실제 서버 인증(serverBackend)만 구현한다.
 */
export interface AuthBackend {
  login(email: string, password: string): Promise<LoginResult>
  /** 앞선 로그인을 동기로 복원한다(개발용 계정). 복원할 수 없으면 null */
  restore(): AuthUser | null
  persist(user: AuthUser): void
  /** 로그아웃. 실제 서버 인증에서는 서버 logout을 순서대로 보낸다(기다리지 않음). */
  clear(): void
  /** 앱 시작 확인. 확인할 로그인이 없으면 null. 같은 페이지에서 여러 번 불러도 같은 작업을 돌려준다. */
  resume?(): Promise<ResumeResult> | null
  /** 결과의 세대가 지금도 유효한지 */
  isCurrent?(gen: number): boolean
  /** 로그인 만료·정지·다른 계정 감지로 세션이 끝났을 때의 통지(서버 logout은 하지 않은 상태). 구독 해제 함수를 돌려준다. */
  onSessionEnded?(listener: (reason: SessionEndReason) => void): () => void
}

/**
 * 개발용 세션 sessionStorage 키. 비밀 값이 아니다.
 * 실제 서버 인증(serverBackend)이 남아 있는 개발 세션을 지우는 데도 쓰므로 개발 전용 파일에 두지 않는다.
 */
export const DEV_SESSION_KEY = 'mealthroutine.dev.session'
