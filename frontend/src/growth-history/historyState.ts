/**
 * 경험치 내역(P14)과 포인트 내역(P16)이 함께 쓰는 조회 상태·날짜 묶음. 두 값의 의미(경험치는 활동 레벨, 포인트는 보유 재화)는 서로 다르며
 * 이 파일은 의미를 합치지 않는다 — 조회 상태 모양과 날짜별 묶음 규칙만 공통이다. 타입·문구·계산은 각 파일(experienceHistory.ts·pointHistory.ts)이 가진다.
 *
 * 서버 계약은 확정된 API가 아니다. 포인트·경험치 API(`GET /api/v1/users/me/rewards`, `/point-transactions`)는 API 명세서에 경로만 있고
 * 요청·응답 구조가 정의돼 있지 않다(API 정책 문서 §4). 연결된 구현은 지금 항상 null(연결 전)이다.
 */

/** 서버 연결 경계. `load`는 내역을 읽기 전용으로 조회한다(적립·차감·사용 호출은 이 경계에 없다). */
export interface HistorySource<T> {
  load(signal: AbortSignal): Promise<T>
}

/**
 * 조회 상태(조회 전·로딩은 loading으로 보인다).
 * - unavailable: 서버 연결 전. "내역 없음"이 아니다.
 * - error: 조회 실패 또는 모르는 모양의 응답. "내역 없음"이 아니다(다시 시도할 수 있다).
 * - empty: 서버가 내역이 0건이라고 알렸다.
 */
export type HistoryState<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; data: T }

/**
 * 조회 한 번의 결과. 연결이 없으면 조회하지 않고 unavailable이다. `parse`가 null을 돌려주면(모르는 모양) error, 건수가 0이면 empty다.
 */
export async function runHistory<T>(
  source: HistorySource<unknown> | null,
  parse: (raw: unknown) => T | null,
  count: (data: T) => number,
  signal: AbortSignal,
): Promise<Exclude<HistoryState<T>, { status: 'loading' }>> {
  if (source === null) return { status: 'unavailable' }
  try {
    const data = parse(await source.load(signal))
    if (data === null) return { status: 'error' }
    return count(data) === 0 ? { status: 'empty' } : { status: 'ready', data }
  } catch {
    return { status: 'error' }
  }
}

function timeOf(value: string | null): number {
  const time = value === null ? NaN : Date.parse(value)
  return Number.isNaN(time) ? 0 : time
}

const dayFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  weekday: 'short',
})
const timeFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** 날짜(한국 시간) 묶음 제목. 없거나 올바르지 않으면 "날짜 미기록". */
export function dayLabel(value: string | null): string {
  return timeOf(value) === 0
    ? '날짜 미기록'
    : dayFormat.format(new Date(value as string))
}

/** 시각(한국 시간). 없거나 올바르지 않으면 null이다(시각을 지어내지 않는다). */
export function timeLabel(value: string | null): string | null {
  return timeOf(value) === 0
    ? null
    : timeFormat.format(new Date(value as string))
}

/** 최신순으로 정렬하고(날짜가 없는 항목은 맨 아래, 같으면 받은 순서 유지) 같은 날짜끼리 묶는다. */
export function groupByDay<T extends { occurredAt: string | null }>(
  entries: readonly T[],
): readonly { day: string; entries: readonly T[] }[] {
  const sorted = [...entries].sort(
    (a, b) => timeOf(b.occurredAt) - timeOf(a.occurredAt),
  )
  const groups: { day: string; entries: T[] }[] = []
  for (const entry of sorted) {
    const day = dayLabel(entry.occurredAt)
    const last = groups.at(-1)
    if (last && last.day === day) last.entries.push(entry)
    else groups.push({ day, entries: [entry] })
  }
  return groups
}

/** 유한한 0 이상의 정수인가(수량 검증). */
export function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}
