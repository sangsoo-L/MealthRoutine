import { useLocation } from 'react-router'

/** 이전 링크가 돌아갈 화면에 넘기는 라우터 state. 진입한 화면의 경로만 담는다. */
export interface BackState {
  from: string
}

/** 이전 링크가 이동할 곳과, 그곳에 함께 넘길 state(없으면 undefined). */
export interface BackNavigation {
  to: string
  state: BackState | undefined
}

/**
 * 앱 안의 경로인지. 외부 주소로 이동하지 않도록 "/"로 시작하고, "//"·"/\\"(브라우저가 "//"처럼 해석한다)로 시작하지 않으며,
 * 역슬래시·제어 문자가 하나도 없는 문자열만 허용한다. 올바른 앱 경로에는 이런 문자가 없다(특수 문자는 %로 인코딩된다).
 */
function isInternalPath(value: unknown): value is string {
  if (typeof value !== 'string') return false
  if (!value.startsWith('/') || value.startsWith('//')) return false
  for (const ch of value) {
    const code = ch.charCodeAt(0)
    if (code <= 0x1f || code === 0x7f || ch === '\\') return false
  }
  return true
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

/**
 * 링크가 `state={{ from: '/경로' }}`로 알려 준 "진입한 화면"을 앱 안의 경로일 때만 돌려준다.
 * 같은 화면(예: 운동 탐색)이라도 탐색에서 왔는지 홈에서 왔는지에 따라 뒤로가기 목적지를 다르게 하려는 용도다.
 */
function readFrom(state: unknown): string | null {
  const from = asRecord(state)?.from
  return isInternalPath(from) ? from : null
}

/**
 * `state.fromState`(= 진입한 화면이 자신의 "이전" 목적지를 되돌려 받기 위해 맡겨 둔 state)를 검증해 돌려준다.
 * 모양이 `{ from: 앱 안의 경로 }`가 아니면 버린다. 한 단계만 읽고 더 깊이 중첩된 값은 따라가지 않는다.
 */
function readReturnState(state: unknown): BackState | undefined {
  const from = readFrom(asRecord(state)?.fromState)
  return from ? { from } : undefined
}

/**
 * 뒤로가기 목적지. 진입 경로를 알면 그곳으로, 모르면(주소 직접 입력·홈 바로가기 등) 정의된 상위 화면(parent)으로 돌아간다.
 * AppShell이 그리는 본문 뒤로가기(BackLink)와, 뒤로가기를 직접 그리는 화면(handle.bodyBack)이 같은 규칙을 쓰도록 한곳에 둔다. parent가 없으면 null이다.
 */
export function useBackTarget(parent: string | null): string | null {
  const { state } = useLocation()
  return parent ? (readFrom(state) ?? parent) : null
}

/**
 * useBackTarget과 같은 목적지에, 목적지 화면이 자기 "이전"을 잃지 않도록 맡겨 둔 state(`fromState`)를 함께 돌려준다.
 * 예) 운동 탐색 결과 → 운동 상세 → "이전"으로 결과에 돌아올 때, 결과 화면의 "이전"이 처음 진입한 화면(탐색)을 계속 가리키게 한다.
 * `fromState`를 맡긴 화면이 없거나 `from`이 유효하지 않으면 state는 undefined라서 지금까지의 동작과 같다.
 */
export function useBackNavigation(
  parent: string | null,
): BackNavigation | null {
  const { state } = useLocation()
  if (!parent) return null
  const from = readFrom(state)
  return {
    to: from ?? parent,
    // fromState는 `from`으로 돌아갈 때 그 화면에 돌려주려고 맡긴 값이다. `from`을 못 쓰고 parent로 대체할 때는 넘기지 않는다.
    state: from ? readReturnState(state) : undefined,
  }
}
