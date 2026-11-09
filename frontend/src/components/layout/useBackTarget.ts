import { useLocation } from 'react-router'

/**
 * 링크가 `state={{ from: '/경로' }}`로 알려 준 "진입한 화면"을 앱 안의 경로일 때만 돌려준다.
 * 같은 화면(예: 운동 탐색)이라도 탐색에서 왔는지 홈에서 왔는지에 따라 뒤로가기 목적지를 다르게 하려는 용도다.
 */
function readFrom(state: unknown): string | null {
  if (typeof state !== 'object' || state === null) return null
  const from = (state as { from?: unknown }).from
  return typeof from === 'string' &&
    from.startsWith('/') &&
    !from.startsWith('//')
    ? from
    : null
}

/**
 * 뒤로가기 목적지. 진입 경로를 알면 그곳으로, 모르면(주소 직접 입력·홈 바로가기 등) 정의된 상위 화면(parent)으로 돌아간다.
 * AppBar와, 뒤로가기를 본문에 그리는 화면(handle.bodyBack)이 같은 규칙을 쓰도록 한곳에 둔다. parent가 없으면 null이다.
 */
export function useBackTarget(parent: string | null): string | null {
  const { state } = useLocation()
  return parent ? (readFrom(state) ?? parent) : null
}
