/**
 * 계정별 임시 데이터 정리 규약.
 * 계정에 속한 임시 데이터를 sessionStorage에 저장할 때는 반드시 `accountScopedKey`로 만든 키를 쓴다.
 * 로그인·로그아웃이 `clearAccountScopedData`를 호출해 이전 계정의 데이터가 다음 계정에 섞이지 않게 한다.
 * 메모리에만 있는 상태는 `registerAccountCleanup`으로 정리를 등록한다.
 */
export const ACCOUNT_SCOPE_PREFIX = 'mealthroutine.account.'

export function accountScopedKey(userId: string, name: string): string {
  return `${ACCOUNT_SCOPE_PREFIX}${userId}.${name}`
}

const cleanups = new Set<() => void>()

/**
 * 로그인·로그아웃 때 함께 실행할 정리 함수를 등록한다. 저장소가 아니라 메모리에만 있는 계정별 상태(개발용 PIN 열람 권한 등)를 위한 것이다.
 * 정리 함수가 던져도 다른 정리를 막지 않는다.
 */
export function registerAccountCleanup(cleanup: () => void): void {
  cleanups.add(cleanup)
}

/** 계정별 키 접두어로 시작하는 sessionStorage 항목만 모두 지운다. 등록된 메모리 정리도 함께 실행한다. */
export function clearAccountScopedData(): void {
  cleanups.forEach((cleanup) => {
    try {
      cleanup()
    } catch {
      // 한 정리가 실패해도 나머지 정리는 계속한다.
    }
  })
  try {
    const keys: string[] = []
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const key = sessionStorage.key(i)
      if (key !== null && key.startsWith(ACCOUNT_SCOPE_PREFIX)) keys.push(key)
    }
    // 길이가 변하므로 먼저 모은 뒤 지운다.
    keys.forEach((key) => sessionStorage.removeItem(key))
  } catch {
    // 저장소를 쓸 수 없으면 지울 데이터도 없다.
  }
}
