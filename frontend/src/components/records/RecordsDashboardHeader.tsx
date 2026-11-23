import type { ReactNode } from 'react'
import { formatRecordsDate } from './recordsDate.ts'

/**
 * 운동 기록(W01)·식단 기록(D01) 대시보드의 공통 머리말. 위에 운동/식단 전환(children), 아래에 화면 제목(h1)과 오늘 날짜를 같은 줄에 둔다.
 * 날짜는 한국어 형식으로 보여 주고 기계 판독값은 time의 dateTime(YYYY-MM-DD)으로 준다.
 */
export default function RecordsDashboardHeader({
  title,
  today,
  children,
}: {
  title: string
  /** 기기 로컬 날짜(YYYY-MM-DD) */
  today: string
  /** 운동/식단 대시보드 전환 */
  children: ReactNode
}) {
  return (
    <header>
      {children}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {title}
        </h1>
        <time
          dateTime={today}
          className="text-support font-normal tabular-nums text-muted"
        >
          {formatRecordsDate(today)}
        </time>
      </div>
    </header>
  )
}
