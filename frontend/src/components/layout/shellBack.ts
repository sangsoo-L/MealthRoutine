import type { RouteHandle } from '../../app/routeHandle.ts'

/** 본문 위 뒤로가기 한 줄의 높이(rem). BackLink의 min-h-11(2.75rem) + 아래 여백(mb-1, 0.25rem). */
export const SHELL_BACK_HEIGHT_REM = 3

/**
 * AppShell이 본문 위에 뒤로가기를 그리는지. 상위 화면(parent)이 있고 화면이 직접 뒤로가기를 다루지 않을 때(bodyBack)만이다.
 * 같은 규칙을 높이 계산이 필요한 화면(LoginRequiredNotice)도 쓰도록 한곳에 둔다.
 */
export function hasShellBack(handle: Partial<RouteHandle>): boolean {
  return Boolean(handle.parent) && handle.bodyBack !== true
}
