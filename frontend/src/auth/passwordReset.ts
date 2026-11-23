/**
 * A04 비밀번호 재설정의 입력 검증과 서버 연결 경계.
 *
 * 비밀번호 재설정 요청 API(`POST /api/v1/auth/password/reset-requests`, README의 API 인수인계 #6)는 요청·응답 구조가 정의되지 않았다.
 * 화면은 이 경계(`PasswordResetSource`)만 알고, 연결된 구현이 생기기 전(`createPasswordResetSource`가 null)에는 요청을 보내지 않고
 * "연결 전"을 알린다. 실제 메일이 발송됐다고 보이지 않으며, "요청 완료"는 서버의 성공 응답이 있을 때만 나온다.
 * 명세: 계정 존재 여부는 노출하지 않는다(어떤 이메일이든 같은 안내). 그래서 이 파일은 계정을 조회하지 않는다.
 */

export const MAX_EMAIL_LENGTH = 254

export type EmailError = 'empty' | 'format'

export const EMAIL_ERROR_MESSAGE: Record<EmailError, string> = {
  empty: '이메일을 입력해 주세요.',
  format: '이메일 형식이 올바르지 않아요. 예: name@example.com',
}

/**
 * 이메일 입력 형식 검증(앞뒤 공백은 무시). 형식만 본다: 계정이 있는지는 판단하지 않는다.
 * 공백 없는 `로컬@도메인.최상위` 모양과 최대 길이만 확인한다.
 */
export function validateResetEmail(
  value: string,
): { ok: true; email: string } | { ok: false; error: EmailError } {
  const email = value.trim()
  if (email === '') return { ok: false, error: 'empty' }
  if (
    email.length > MAX_EMAIL_LENGTH ||
    !/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(email)
  ) {
    return { ok: false, error: 'format' }
  }
  return { ok: true, email }
}

/** 서버 연결. 요청이 서버에 접수되면 resolve하고, 접수하지 못하면 reject한다(성공 응답이 없으면 완료로 보지 않는다). */
export interface PasswordResetSource {
  requestReset(email: string, signal: AbortSignal): Promise<void>
}

/** 연결된 서버 구현. API 계약이 확정되기 전이라 항상 null(연결 전)이다. */
export function createPasswordResetSource(): PasswordResetSource | null {
  return null
}

/**
 * 화면의 처리 상태.
 * idle 초기 · invalid 입력 오류 · preparing 요청 준비 · unavailable API 미연결 · requesting 요청 중 · failed 요청 실패 · done 요청 완료
 */
export type ResetPhase =
  | 'idle'
  | 'invalid'
  | 'preparing'
  | 'unavailable'
  | 'requesting'
  | 'failed'
  | 'done'

/** 요청 한 번의 결과. 연결이 없으면 요청하지 않고 unavailable, 서버가 접수하면 done, 예외는 failed다. */
export async function runResetRequest(
  source: PasswordResetSource | null,
  email: string,
  signal: AbortSignal,
): Promise<'unavailable' | 'failed' | 'done'> {
  if (source === null) return 'unavailable'
  try {
    await source.requestReset(email, signal)
    return 'done'
  } catch {
    return 'failed'
  }
}

/** 상태별 안내 문구. 완료 문구는 계정이 있는지 알리지 않는다. */
export const RESET_MESSAGES = {
  preparing: '요청을 준비하고 있어요…',
  requesting: '재설정 안내를 요청하고 있어요…',
  unavailable:
    '비밀번호 재설정 요청 기능이 아직 서버에 연결되지 않았어요. 안내 메일은 발송되지 않았고, 입력한 이메일은 그대로 남아 있어요.',
  failed:
    '요청을 처리하지 못했어요. 입력한 이메일은 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
  done: '입력한 이메일로 가입된 계정이 있다면 재설정 안내를 보냈어요. 메일이 보이지 않으면 스팸함을 확인해 주세요.',
} as const
