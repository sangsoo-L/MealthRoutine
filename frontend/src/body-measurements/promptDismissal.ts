import { accountScopedKey } from '../auth/accountScope.ts'

/**
 * 홈의 신체 정보 안내를 "나중에 입력하기"로 닫았는지. 같은 로그인 세션에서만 유효하다.
 *
 * 계정별 sessionStorage 키(accountScopedKey)에 저장하므로 로그인·로그아웃 때 자동으로 지워진다. 그래서 같은 로그인 세션에서 홈에
 * 다시 들어오면 반복해서 띄우지 않고, 다음 로그인에서 여전히 신체 정보가 없으면 다시 안내한다.
 * 닫았다는 사실은 "입력했다"가 아니다(이 값은 신체 정보와 무관하며 신체 정보 등록 여부를 바꾸지 않는다).
 * sessionStorage를 쓸 수 없을 때만 메모리에 둔다(그 경우 새로고침하면 다시 안내될 수 있다).
 */
const NAME = 'body-prompt.dismissed'
const memoryFallback = new Set<string>()

export function isBodyPromptDismissed(userId: string): boolean {
  try {
    return sessionStorage.getItem(accountScopedKey(userId, NAME)) === '1'
  } catch {
    return memoryFallback.has(userId)
  }
}

export function markBodyPromptDismissed(userId: string): void {
  try {
    sessionStorage.setItem(accountScopedKey(userId, NAME), '1')
  } catch {
    memoryFallback.add(userId)
  }
}
