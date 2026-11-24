import { authSession, type AuthSession, type MeData } from '../api/session.ts'
import {
  DEV_SESSION_KEY,
  type AuthBackend,
  type AuthUser,
  type ResumeResult,
} from './authTypes.ts'

/** nickname이 없을 때(프로필 미작성) 표시용 대체 문자열(F1-D8). 실명·이메일은 쓰지 않는다. */
export const NICKNAME_FALLBACK = '회원'

/** 서버 회원 정보를 화면용 AuthUser로 바꾼다. entitlement는 멤버십 API 연결 전 임시값이다. */
export function toAuthUser(me: MeData): AuthUser {
  return {
    id: String(me.userId),
    email: me.email ?? '',
    nickname: me.nickname ?? NICKNAME_FALLBACK,
    // TODO(팀장 확인 D2): 멤버십 API가 연결되면 서버 값으로 바꾼다. 표시용이며 권한 판단에 쓰지 않는다.
    entitlement: 'free',
  }
}

function removeDevSession(): void {
  try {
    sessionStorage.removeItem(DEV_SESSION_KEY)
  } catch {
    // 저장소를 쓸 수 없으면 지울 것도 없다.
  }
}

/** 실제 백엔드 인증(F1). 토큰·쿠키 순서·회원 확인은 세션 모듈(api/session.ts)이 한다. */
export function createServerBackend(session: AuthSession): AuthBackend {
  return {
    async login(email, password) {
      const outcome = await session.login(email, password)
      if (outcome.ok)
        return { ok: true, user: toAuthUser(outcome.me), gen: outcome.gen }
      return outcome.reason === 'suspended'
        ? { ok: false, reason: 'suspended', message: outcome.message }
        : { ok: false, reason: outcome.reason }
    },

    restore() {
      // 동기 복원은 하지 않는다(resume이 서버 확인 후 정한다). 개발용 세션이 남아 있으면 지운다.
      removeDevSession()
      return null
    },

    persist() {
      // 회원 ID 힌트는 세션 모듈이 확인 후에 저장한다. 여기서 따로 저장하지 않는다.
    },

    clear() {
      void session.logout()
    },

    resume() {
      const pending = session.resume()
      if (pending === null) return null
      return pending.then((outcome): ResumeResult =>
        outcome.ok
          ? {
              gen: outcome.gen,
              ok: true,
              user: toAuthUser(outcome.me),
              switchedAccount: outcome.switchedAccount,
              activate: outcome.activate,
            }
          : outcome,
      )
    },

    isCurrent: (gen) => session.isCurrent(gen),

    onSessionEnded: (listener) => session.onSessionEnded(listener),
  }
}

export const serverBackend: AuthBackend = createServerBackend(authSession)
