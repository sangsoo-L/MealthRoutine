/**
 * P05 → P01 복귀 때 P01에 알릴 일의 종류. 라우터 state에는 이 표지(문자열 하나)만 담는다.
 * PIN·열람 권한 토큰·신체 수치는 어떤 형태로도 담지 않는다.
 */
const KEY = 'pinNotice'

/** 5회 불일치로 확인이 5분 동안 제한됐을 때 P01로 돌아가며 넘기는 state. */
export const PIN_LOCKED_STATE = { [KEY]: 'locked' } as const

/** 라우터 state가 "잠금 안내" 표지인지. 모양이 다르면 false다. */
export function isPinLockedState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as Record<string, unknown>)[KEY] === 'locked'
  )
}
