/**
 * 하단 "기록" 탭의 목적지. 기록 탭에는 운동 기록(W01)과 식단 기록(D01) 두 대시보드가 있어서,
 * - 식단 화면(/records/meal…)에서 누르면 식단 기록으로, 운동 화면(/records/exercise…)에서 누르면 운동 기록으로 간다(현재 맥락 유지).
 * - 다른 탭에서 누르면 이 탭(브라우저 탭)에서 마지막으로 본 기록 대시보드로 돌아간다. 처음이면 운동 기록(기존 기본값)이다.
 *
 * 기억하는 값은 화면 종류('exercise' | 'meal') 하나뿐이며 sessionStorage(이 브라우저 탭)에만 둔다. 기록 내용·날짜 같은 건강 데이터는 저장하지 않는다.
 * 저장소를 쓸 수 없으면(사생활 보호 모드 등) 기억하지 않고 기본값을 쓴다.
 */

export type RecordsDomain = 'exercise' | 'meal'

const STORAGE_KEY = 'mealthroutine.recordsTab'

export const RECORDS_PATH: Record<RecordsDomain, string> = {
  exercise: '/records/exercise',
  meal: '/records/meal',
}

/** 경로가 어느 기록 대시보드에 속하는지. 기록 화면이 아니면 null. */
export function recordsDomainOf(pathname: string): RecordsDomain | null {
  if (pathname === '/records/meal' || pathname.startsWith('/records/meal/'))
    return 'meal'
  if (
    pathname === '/records/exercise' ||
    pathname.startsWith('/records/exercise/')
  )
    return 'exercise'
  return null
}

function readRemembered(): RecordsDomain | null {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY)
    return value === 'exercise' || value === 'meal' ? value : null
  } catch {
    return null
  }
}

/** 지금 보고 있는 기록 화면의 종류를 기억한다(기록 화면이 아니면 아무것도 하지 않는다). */
export function rememberRecordsDomain(pathname: string): void {
  const domain = recordsDomainOf(pathname)
  if (!domain) return
  try {
    window.sessionStorage.setItem(STORAGE_KEY, domain)
  } catch {
    // 저장할 수 없으면 기억하지 않는다(기본값 사용).
  }
}

/** 기억한 화면 종류를 지운다(로그아웃 시: 다음 계정이 앞 계정의 선택을 이어받지 않게). 운동·식단 데이터는 건드리지 않는다. */
export function clearRememberedRecordsDomain(): void {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // 지울 수 없으면 아무것도 하지 않는다.
  }
}

/** 하단 "기록" 탭이 가리킬 경로. */
export function recordsTabPath(pathname: string): string {
  const domain =
    recordsDomainOf(pathname) ??
    (typeof window === 'undefined' ? null : readRemembered())
  return RECORDS_PATH[domain ?? 'exercise']
}
