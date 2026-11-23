import type { ReactNode } from 'react'
import { secondaryButtonClass } from '../../auth/authStyles.ts'
import { cardClass } from '../myStyles.ts'

/** 문구는 화면(경험치·포인트)마다 다르고 상태 모양만 공통이다. */
export interface HistoryNoticeText {
  /** 불러오는 중 */
  loading: string
  /** 서버 연결 전 제목·설명 */
  unavailableTitle: string
  unavailableBody: string
  /** 조회 실패 제목·설명 */
  errorTitle: string
  errorBody: string
}

/**
 * 내역 목록 대신 보이는 상태 안내(조회 중·서버 연결 전·조회 실패). 세 상태는 문구가 다르고, 어느 것도 "내역 없음"과 같지 않다.
 * 서버 연결 전과 조회 실패는 내역이 없다는 뜻이 아니라고 분명히 알린다. 값을 만들어 채우지 않는다.
 */
export function HistoryNotice({
  status,
  text,
  onRetry,
}: {
  status: 'loading' | 'unavailable' | 'error'
  text: HistoryNoticeText
  onRetry: () => void
}) {
  if (status === 'loading')
    return (
      <p
        role="status"
        data-history-state="loading"
        className={`${cardClass} text-body font-normal text-muted`}
      >
        {text.loading}
      </p>
    )
  if (status === 'unavailable')
    return (
      <div role="status" data-history-state="unavailable" className={cardClass}>
        <p className="text-section-title leading-snug font-semibold text-content">
          {text.unavailableTitle}
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {text.unavailableBody}
        </p>
      </div>
    )
  return (
    <div className="flex flex-col gap-2">
      <div role="alert" data-history-state="error" className={cardClass}>
        <p className="text-section-title leading-snug font-semibold text-content">
          {text.errorTitle}
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {text.errorBody}
        </p>
      </div>
      <button
        type="button"
        data-history-retry=""
        onClick={onRetry}
        className={secondaryButtonClass}
      >
        다시 시도
      </button>
    </div>
  )
}

/** 내역이 0건이거나 선택한 조건에 맞는 내역이 없을 때의 빈 안내(연결 전·조회 실패와 구분한다). */
export function HistoryEmpty({
  kind,
  title,
  children,
}: {
  kind: 'empty' | 'filtered'
  title: string
  children: string
}) {
  return (
    <div role="status" data-history-state={kind} className={cardClass}>
      <p className="text-section-title leading-snug font-semibold text-content">
        {title}
      </p>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        {children}
      </p>
    </div>
  )
}

/** 날짜별 묶음 목록(최신순). 날짜가 제목이고 항목은 목록 항목이라 보조기기가 개수를 읽어 준다. */
export function DayGroups({
  label,
  groups,
  children,
}: {
  label: string
  groups: readonly { day: string; items: readonly ReactNode[] }[]
  children?: ReactNode
}) {
  return (
    <section
      aria-label={label}
      data-history-list=""
      className="flex flex-col gap-4"
    >
      {children}
      {groups.map((group) => (
        <div key={group.day} data-history-day={group.day}>
          <h3 className="px-1 text-support leading-snug font-semibold text-muted">
            {group.day}
          </h3>
          <ul className="mt-1.5 divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
            {group.items.map((item, index) => (
              <li key={index} className="px-4 py-3">
                {item}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}
