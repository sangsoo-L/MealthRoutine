import {
  DEV_SESSION_KEY,
  type AuthBackend,
  type AuthUser,
} from '../authTypes.ts'
import { DEV_ACCOUNTS, type DevAccount } from './devAccounts.ts'

/** 개발용 지연(ms). 처리 중 표시를 확인할 수 있게 둔 값이며 실제 서버 응답 시간과 무관하다. */
const DEV_LOGIN_DELAY_MS = 300

/** 세션에 저장하는 형태 버전 */
const SESSION_VERSION = 1

function toAuthUser(account: DevAccount): AuthUser {
  return {
    id: account.id,
    email: account.email,
    nickname: account.nickname,
    entitlement: account.entitlement,
  }
}

function removeSession(): void {
  try {
    sessionStorage.removeItem(DEV_SESSION_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

/**
 * 개발 빌드 전용 인증 처리. 등록된 개발용 계정과 정확히 일치할 때만 로그인에 성공한다.
 * 실제 인증이 아니며, 어느 입력이 틀렸는지 구분하지 않는다.
 */
export const devBackend: AuthBackend = {
  async login(email, password) {
    await new Promise<void>((resolve) =>
      setTimeout(resolve, DEV_LOGIN_DELAY_MS),
    )
    const normalizedEmail = email.trim().toLowerCase()
    const account = DEV_ACCOUNTS.find(
      (item) => item.email === normalizedEmail && item.password === password,
    )
    return account
      ? { ok: true, user: toAuthUser(account) }
      : { ok: false, reason: 'invalid' }
  },

  restore() {
    try {
      const raw = sessionStorage.getItem(DEV_SESSION_KEY)
      if (raw === null) return null
      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        'v' in parsed &&
        'accountId' in parsed &&
        parsed.v === SESSION_VERSION &&
        typeof parsed.accountId === 'string'
      ) {
        // 권한은 저장값이 아니라 등록된 계정 데이터에서 가져온다.
        const account = DEV_ACCOUNTS.find(
          (item) => item.id === parsed.accountId,
        )
        if (account) return toAuthUser(account)
      }
    } catch {
      // 파싱 실패나 저장소 접근 오류는 복원하지 않고 아래에서 정리한다.
    }
    removeSession()
    return null
  },

  persist(user) {
    try {
      // 계정 식별자만 저장한다. 비밀번호·이메일·권한은 저장하지 않는다.
      sessionStorage.setItem(
        DEV_SESSION_KEY,
        JSON.stringify({ v: SESSION_VERSION, accountId: user.id }),
      )
    } catch {
      // 저장하지 못하면 새로고침 때 로그인이 유지되지 않을 뿐이다.
    }
  },

  clear() {
    removeSession()
  },
}
