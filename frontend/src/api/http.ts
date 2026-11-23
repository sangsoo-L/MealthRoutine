import { ApiError, type HttpMethod } from './core.ts'
import {
  authSession,
  type ApiRequestOptions,
  type AuthMode,
} from './session.ts'

/**
 * 다른 파트가 쓰는 API 호출 공통 코드(F1). 사용법은 frontend/README.md "API 호출 공통 코드".
 *
 * - 경로는 `/api/v1` 뒤 부분만 쓴다: `apiRequest('GET', '/users/me')`.
 * - 성공하면 응답의 `data`를 돌려주고(204는 undefined), 실패하면 `ApiError`를 던진다.
 * - 로그인 토큰 붙이기, `TOKEN_EXPIRED` 재발급과 1회 재시도, 로그인 만료 처리는 여기서 한다. 호출하는 쪽은 토큰을 다루지 않는다.
 * - 네트워크 오류·500은 자동으로 다시 보내지 않는다(서버가 이미 처리했을 수 있다).
 */
export function apiRequest<T = unknown>(
  method: HttpMethod,
  path: string,
  options?: ApiRequestOptions,
): Promise<T> {
  return authSession.request<T>(method, path, options)
}

export { ApiError }
export type { ApiRequestOptions, AuthMode, HttpMethod }
