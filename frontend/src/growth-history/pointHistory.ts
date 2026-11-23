import {
  isCount,
  runHistory,
  type HistorySource,
  type HistoryState,
} from './historyState.ts'

/**
 * 포인트 내역(P16)의 서버 계약과 표시 규칙. 포인트(P)는 보유 재화이며 경험치와 완전히 별도다(합치거나 서로 계산하지 않는다).
 *
 * 포인트 적립 기준·사용처·유효기간은 명세에서 미확정이고 API 구조도 없다. 아래 모양은 **확정된 API가 아니라** 화면이 받을 값의 모양이며
 * 연결된 구현(`createPointHistorySource`)은 지금 항상 null(연결 전)이다. 이 앱은 포인트를 적립·차감·사용하지 않고 서버가 준 내역만 보여 준다.
 * 명세의 "보유 320P·총 적립 420P·총 사용 100P"와 거래 예시는 시안 예시(memberPointExamples)라 실제 내역처럼 만들어 보이지 않는다.
 * 거래 후 잔액은 서버가 준 값만 보이고 이 앱이 내역을 누적해 계산하지 않는다.
 */

export type PointKind = 'earn' | 'use'

/** 포인트 거래 한 건. `amount`는 변동 크기(0 이상의 정수)이고 적립·사용은 `kind`로 구분한다. */
export interface PointEntry {
  id: string
  /** ISO 8601. 없거나 올바르지 않으면 "날짜 미기록". */
  occurredAt: string | null
  kind: PointKind
  /** 적립·사용 사유(서버가 준 글자). */
  reason: string
  amount: number
  /** 거래 후 잔액(서버 값). 없으면 null이며 표시하지 않는다. */
  balanceAfter: number | null
}

/** 서버가 준 포인트 내역. `totals`(총 적립·총 사용)는 서버 값이며 없으면 null이다(이 앱이 계산하지 않는다 — 목록이 일부일 수 있다). */
export interface PointHistory {
  entries: readonly PointEntry[]
  totals: { earned: number; used: number } | null
}

export type PointHistorySource = HistorySource<unknown>
export type PointHistoryState = HistoryState<PointHistory>

/** 연결된 서버 구현. API가 정해지기 전이라 항상 null(연결 전)이다. */
export function createPointHistorySource(): PointHistorySource | null {
  return null
}

/** 서버 값이 화면이 아는 모양이면 그 값을, 아니면 null(조회 실패)을 돌려준다. 모르는 항목을 건너뛰거나 값을 채워 넣지 않는다. */
export function parsePointHistory(raw: unknown): PointHistory | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  if (!Array.isArray(v.entries)) return null
  const entries: PointEntry[] = []
  for (const item of v.entries as unknown[]) {
    if (typeof item !== 'object' || item === null) return null
    const e = item as Record<string, unknown>
    if (
      typeof e.id !== 'string' ||
      (e.kind !== 'earn' && e.kind !== 'use') ||
      typeof e.reason !== 'string' ||
      e.reason.trim() === '' ||
      !isCount(e.amount) ||
      (e.occurredAt !== null &&
        e.occurredAt !== undefined &&
        typeof e.occurredAt !== 'string') ||
      (e.balanceAfter !== null &&
        e.balanceAfter !== undefined &&
        !isCount(e.balanceAfter))
    )
      return null
    entries.push({
      id: e.id,
      occurredAt: typeof e.occurredAt === 'string' ? e.occurredAt : null,
      kind: e.kind,
      reason: e.reason.trim(),
      amount: e.amount,
      balanceAfter: isCount(e.balanceAfter) ? e.balanceAfter : null,
    })
  }
  const t = v.totals
  const totals =
    typeof t === 'object' &&
    t !== null &&
    isCount((t as Record<string, unknown>).earned) &&
    isCount((t as Record<string, unknown>).used)
      ? {
          earned: (t as { earned: number }).earned,
          used: (t as { used: number }).used,
        }
      : null
  return { entries, totals }
}

export function runPointHistory(
  source: PointHistorySource | null,
  signal: AbortSignal,
) {
  return runHistory(
    source,
    parsePointHistory,
    (data) => data.entries.length,
    signal,
  )
}

/** 필터(명세 P16: 전체·적립·사용). 필터를 바꿔도 잔액·합계는 전체 기준 그대로다. */
export type PointFilter = 'all' | 'earn' | 'use'
export const POINT_FILTERS: readonly PointFilter[] = ['all', 'earn', 'use']
export const POINT_FILTER_LABEL: Record<PointFilter, string> = {
  all: '전체',
  earn: '적립',
  use: '사용',
}

export function pointFilterCounts(
  entries: readonly PointEntry[],
): Record<PointFilter, number> {
  return {
    all: entries.length,
    earn: entries.filter((e) => e.kind === 'earn').length,
    use: entries.filter((e) => e.kind === 'use').length,
  }
}

export function filterPointEntries(
  entries: readonly PointEntry[],
  filter: PointFilter,
): readonly PointEntry[] {
  return filter === 'all' ? entries : entries.filter((e) => e.kind === filter)
}

/** 변동량 표시: 적립 "+20 P", 사용 "−10 P". 색이 아니라 부호와 유형 글자로 구분한다. */
export function pointAmountLabel(entry: PointEntry): string {
  const sign = entry.kind === 'earn' ? '+' : '−'
  return `${sign}${entry.amount.toLocaleString('ko-KR')} P`
}

/** P16 경로(명세 v5.0에 URL이 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_POINT_HISTORY = '/mypage/points'
