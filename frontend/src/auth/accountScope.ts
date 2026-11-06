/**
 * 계정별 임시 데이터 정리 규약.
 * 계정에 속한 임시 데이터를 sessionStorage에 저장할 때는 반드시 `accountScopedKey`로 만든 키를 쓴다.
 * 로그인·로그아웃이 `clearAccountScopedData`를 호출해 이전 계정의 데이터가 다음 계정에 섞이지 않게 한다.
 * 아직 이 키를 쓰는 데이터는 없다.
 */
export const ACCOUNT_SCOPE_PREFIX = 'mealthroutine.account.'

export function accountScopedKey(userId: string, name: string): string {
  return `${ACCOUNT_SCOPE_PREFIX}${userId}.${name}`
}

/** 계정별 키 접두어로 시작하는 sessionStorage 항목만 모두 지운다. */
export function clearAccountScopedData(): void {
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
