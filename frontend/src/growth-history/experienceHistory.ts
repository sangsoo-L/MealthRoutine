import {
  isCount,
  runHistory,
  type HistorySource,
  type HistoryState,
} from './historyState.ts'

/**
 * 경험치 내역(P14)의 서버 계약과 표시 규칙. 경험치(EXP)는 활동 레벨을 정하는 값이며 포인트와 완전히 별도다(합치거나 서로 계산하지 않는다).
 *
 * 경험치 적립·승급 정책은 명세에서 미확정이고 API 구조도 없다. 아래 모양은 **확정된 API가 아니라** 화면이 받을 값의 모양이며
 * 연결된 구현(`createExperienceHistorySource`)은 지금 항상 null(연결 전)이다. 이 앱은 경험치를 적립·차감·산정하지 않고 서버가 준 내역만 보여 준다.
 * 명세의 "합계 320 EXP"·6건 내역은 시안 예시(memberExperienceExamples)라 실제 내역처럼 만들어 보이지 않는다.
 */

/** 경험치 적립 한 건. 적립량은 0 이상의 정수 EXP다(내역은 적립만 다룬다). */
export interface ExperienceEntry {
  id: string
  /** ISO 8601. 없거나 올바르지 않으면 "날짜 미기록". */
  occurredAt: string | null
  /** 적립한 활동(서버가 준 글자). */
  activity: string
  /** 적립한 EXP */
  amount: number
}

/** 서버가 준 경험치 내역. `total`은 서버가 준 합계이며 없으면 null(합계를 이 앱이 계산하지 않는다 — 목록이 일부일 수 있다). */
export interface ExperienceHistory {
  entries: readonly ExperienceEntry[]
  total: number | null
}

export type ExperienceHistorySource = HistorySource<unknown>
export type ExperienceHistoryState = HistoryState<ExperienceHistory>

/** 연결된 서버 구현. API가 정해지기 전이라 항상 null(연결 전)이다. */
export function createExperienceHistorySource(): ExperienceHistorySource | null {
  return null
}

/** 서버 값이 화면이 아는 모양이면 그 값을, 아니면 null(조회 실패)을 돌려준다. 모르는 항목을 건너뛰거나 값을 채워 넣지 않는다. */
export function parseExperienceHistory(raw: unknown): ExperienceHistory | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  if (!Array.isArray(v.entries)) return null
  const entries: ExperienceEntry[] = []
  for (const item of v.entries as unknown[]) {
    if (typeof item !== 'object' || item === null) return null
    const e = item as Record<string, unknown>
    if (
      typeof e.id !== 'string' ||
      typeof e.activity !== 'string' ||
      e.activity.trim() === '' ||
      !isCount(e.amount) ||
      (e.occurredAt !== null &&
        e.occurredAt !== undefined &&
        typeof e.occurredAt !== 'string')
    )
      return null
    entries.push({
      id: e.id,
      occurredAt: typeof e.occurredAt === 'string' ? e.occurredAt : null,
      activity: e.activity.trim(),
      amount: e.amount,
    })
  }
  return {
    entries,
    total: isCount(v.total) ? v.total : null,
  }
}

export function runExperienceHistory(
  source: ExperienceHistorySource | null,
  signal: AbortSignal,
) {
  return runHistory(
    source,
    parseExperienceHistory,
    (data) => data.entries.length,
    signal,
  )
}

/** 적립량 표시: "+20 EXP". 적립 내역이라 항상 +이다. */
export function experienceAmountLabel(amount: number): string {
  return `+${amount.toLocaleString('ko-KR')} EXP`
}

/** P14 경로(명세 v5.0에 URL이 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_EXPERIENCE_HISTORY = '/mypage/experience'
