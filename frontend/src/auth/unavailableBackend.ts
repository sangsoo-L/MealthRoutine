import { DEV_SESSION_KEY, type AuthBackend } from './authTypes.ts'

/** 개발 세션 키를 지운다. 저장소 접근이 막힌 환경(시크릿 모드 등)에서도 오류 없이 넘어간다. */
function removeDevSession(): void {
  try {
    sessionStorage.removeItem(DEV_SESSION_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

/**
 * 운영 빌드용 인증 처리. 개발용 계정 데이터를 갖지 않는다.
 * 실제 인증 API가 연결되기 전까지 로그인은 항상 실패하며, 성공으로 대체하지 않는다.
 */
export const unavailableBackend: AuthBackend = {
  login() {
    return Promise.resolve({ ok: false, reason: 'unavailable' })
  },
  restore() {
    // 개발 빌드에서 남은 세션이 있어도 복원하지 않고 정리한다.
    removeDevSession()
    return null
  },
  persist() {
    removeDevSession()
  },
  clear() {
    removeDevSession()
  },
}
