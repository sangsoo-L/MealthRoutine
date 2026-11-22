/**
 * 로그인 후 돌아갈 앱 내부 경로. 로그인 안내(LoginRequiredNotice)가 로그인 링크의 history state(`returnTo`)로 원래 경로를 넘긴다.
 * history state는 이 앱만 쓰지만, 값이 이상하면 쓰지 않도록 다음만 허용한다(그 밖에는 null → 기본 목적지 /home).
 * - 문자열이고 "/"로 시작하는 같은 출처의 경로(검색 파라미터 포함). "//"(다른 호스트)·"\"·제어 문자는 거부한다.
 * - 인증 화면(/login·/signup) 자신으로는 돌아가지 않는다(로그인 후 다시 로그인 화면이 되는 순환 방지).
 * 해시(#)는 쓰지 않는 앱이라 넘기지 않는다. 인증 방식 자체(실제 인증 API)는 이 함수와 무관하다.
 */
const MAX_LENGTH = 2048

export function safeReturnTo(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const value = (state as Record<string, unknown>).returnTo
  if (typeof value !== 'string' || value.length === 0) return null
  if (value.length > MAX_LENGTH) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  // 역슬래시·제어 문자·공백은 브라우저가 다른 호스트로 해석할 여지가 있어 거부한다.
  if (/[\\\s\u0000-\u001f\u007f]/.test(value)) return null
  let url: URL
  try {
    url = new URL(value, 'https://app.invalid')
  } catch {
    return null
  }
  if (url.origin !== 'https://app.invalid') return null
  const path = url.pathname
  // 라우터는 대소문자를 가리지 않고 인코딩을 풀어 비교하므로(/Login·/%6Cogin도 로그인 화면) 같은 기준으로 확인한다.
  let routePath: string
  try {
    routePath = decodeURIComponent(path).toLowerCase()
  } catch {
    return null
  }
  if (
    routePath === '/login' ||
    routePath.startsWith('/login/') ||
    routePath === '/signup' ||
    routePath.startsWith('/signup/')
  ) {
    return null
  }
  return `${path}${url.search}`
}
