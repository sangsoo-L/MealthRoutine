import type { AuthUser, LoginResult, ResumeResult } from './authTypes.ts'

/**
 * AuthProvider가 인증 결과를 화면 상태에 반영하는 규칙(F1 계획 2.4). React와 분리해 호출 순서를 테스트로 확인한다.
 * 결과의 세대가 지금도 유효할 때만 반영한다(판정은 세션 모듈의 isCurrent 하나로만 한다).
 */
export interface AuthStateActions {
  isCurrent(gen: number): boolean
  /** 이전 계정의 임시 데이터(계정별 키·등록된 메모리 상태·기록 탭 기억)를 지운다 */
  clearAccountData(): void
  setUser(user: AuthUser | null): void
  setBooting(booting: boolean): void
  setConnectionNotice(visible: boolean): void
}

/**
 * 앱 시작 확인 결과 반영.
 * 오래된 결과(그 사이 로그인·로그아웃이 시작됨)는 loading을 포함해 **아무것도 바꾸지 않는다**(Codex R3).
 * 그 경우 loading은 새 의도를 시작한 쪽이 끝낸다: 로그아웃은 즉시, 수동 로그인은 결과(성공·실패·예외)가 나올 때.
 */
export function applyResumeResult(
  result: ResumeResult,
  actions: AuthStateActions,
): void {
  if (!actions.isCurrent(result.gen)) return
  if (result.ok) {
    // F1-D10 ①: 다른 회원(B)으로 바뀌었으면 이전 계정(A)의 데이터를 지운 **뒤에** B를 확정(activate)하고 화면에 올린다.
    // activate 전에는 세션이 B 토큰을 공개하지 않아 업무 요청이 나가지 않는다(Codex R1).
    // 기존 안내 방식(전역 안내)이 없어 따로 알리지 않는다(알려진 한계, 새 UI를 만들지 않음).
    if (result.switchedAccount) actions.clearAccountData()
    if (!result.activate()) return
    actions.setUser(result.user)
    actions.setConnectionNotice(false)
  } else if (result.kind === 'ended') {
    actions.clearAccountData()
    actions.setUser(null)
  } else {
    // F1-D7: 서버에 연결하지 못함. 로그아웃 상태로 보이되 로그인 화면에 연결 안내를 띄운다. 힌트는 세션 모듈이 남겨 둔다.
    actions.setConnectionNotice(true)
  }
  actions.setBooting(false)
}

/**
 * 로그인 결과 반영. 오래된 결과(그 사이 로그아웃·새 로그인)는 반영하지 않고 unavailable로 돌려준다.
 * 수동 로그인은 진행 중이던 앱 시작 확인을 대체하므로, 실패해도 loading을 끝낸다(Codex R3). 예외는 AuthProvider가 같은 처리를 한다.
 */
export function applyLoginResult(
  result: LoginResult,
  actions: AuthStateActions & {
    clearAccountScopedData(): void
    persist(user: AuthUser): void
  },
): LoginResult {
  if (!result.ok) {
    actions.setBooting(false)
    return result
  }
  if (result.gen !== undefined && !actions.isCurrent(result.gen))
    return { ok: false, reason: 'unavailable' }
  // 이전 계정의 임시 데이터가 섞이지 않게 먼저 정리한다(기존 동작 유지).
  actions.clearAccountScopedData()
  actions.persist(result.user)
  actions.setUser(result.user)
  actions.setConnectionNotice(false)
  actions.setBooting(false)
  return result
}

/** 세션 종료 통지(만료·정지·다른 계정 감지) 반영. 서버 logout은 하지 않는다(logout()을 부르지 않는다). */
export function applySessionEnded(actions: AuthStateActions): void {
  actions.clearAccountData()
  actions.setUser(null)
}
