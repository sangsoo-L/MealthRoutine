/**
 * [개발 전용] Mock 저장소 공통 도구. 개발 서버에서만 불러온다(각 *Source.ts가 import.meta.env.DEV로 동적 import).
 * 운영 빌드에는 포함되지 않으며, 운영에서는 Mock 저장소가 없어 신체 정보·건강 목표를 로컬 저장소에 저장하지 않는다.
 *
 * 왜 계정별 sessionStorage(auth/accountScope.ts)가 아니라 localStorage인가:
 * 계정별 sessionStorage는 로그인·로그아웃 때 모두 지워진다. 신체 정보·건강 목표는 서버가 보관하는 값이라 "다음 로그인에서도 남아 있어야"
 * 하므로, 실제 서버의 보관을 흉내 내려면 로그아웃에도 남는 저장소가 필요하다. 값은 개발용 가짜 계정(example.com)의 임시 값이다.
 * 계정 분리는 키에 사용자 id를 넣어 보장한다(다른 계정의 키는 읽지 않는다).
 */

const PREFIX = 'mealthroutine.dev.mock.'

export type MockKind = 'body' | 'goal' | 'exercise' | 'exerciseFavorite'

/** 저장 키. 종류와 사용자 id로만 만든다. 계정과 무관한 공용 데이터(exercise)는 키를 만들지 않는다(저장하는 것이 없다). */
export function mockKey(
  kind: 'body' | 'goal' | 'exerciseFavorite',
  userId: string,
): string {
  return `${PREFIX}${kind}.${userId}`
}

export type MockFlagName = 'unavailable' | 'failLoad' | 'failSave'

/**
 * 개발·검수용 스위치. 실패·미연결 상태를 재현한다. 값은 `all` 또는 `body`·`goal`·`exercise`·`exerciseFavorite`(쉼표로 여러 개)이다.
 * 예) localStorage.setItem('mealthroutine.dev.mock.flag.failSave', 'body')
 *   - unavailable: 이 도메인의 API가 연결되지 않은 상태(저장소가 없는 것과 같다)
 *   - failLoad: 조회가 실패한다
 *   - failSave: 저장이 실패한다
 */
export function mockFlag(name: MockFlagName, kind: MockKind): boolean {
  try {
    const value = window.localStorage.getItem(`${PREFIX}flag.${name}`)
    if (!value) return false
    return value
      .split(',')
      .map((v) => v.trim())
      .some((v) => v === 'all' || v === kind)
  } catch {
    return false
  }
}

/** 저장된 JSON을 읽는다. 값이 없거나 깨졌으면 null이다. 저장소에 접근할 수 없으면 예외를 던진다(조회 실패로 다룬다). */
export function readMockJson(key: string): unknown {
  const text = window.localStorage.getItem(key)
  if (text === null) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** JSON을 저장한다. 저장소에 쓸 수 없으면 예외를 던진다(저장 실패로 다룬다). */
export function writeMockJson(key: string, value: unknown): void {
  window.localStorage.setItem(key, JSON.stringify(value))
}

/** 네트워크 지연을 흉내 낸다(중복 제출·로딩 상태를 실제처럼 확인하기 위함). */
export function mockDelay(ms = 300): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
