import {
  dashboardDateLabel,
  dashboardWeek,
} from '../../../exercise/dashboardSelectors.ts'
import type {
  DashboardSlot,
  WeeklyExerciseView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import Icon from '../../icons/Icon.tsx'
import { DashboardSection, SlotError } from './DashboardParts.tsx'

const TITLE_ID = 'dashboard-weekly-title'

/** 날짜 칸은 조회·이동 버튼이 아닌 활동 표시다. 오늘과 운동한 날을 모양·문장으로도 구분한다. */
export default function WeeklyExerciseSection({
  slot,
  today,
  sharedUnavailable,
  onRetry,
}: {
  slot: DashboardSlot<WeeklyExerciseView>
  today: string
  sharedUnavailable: boolean
  onRetry: () => void
}) {
  const view = slot.status === 'ready' ? slot.data : null
  const week = view ?? dashboardWeek(today)
  const known = view !== null || slot.status === 'empty'
  const allCorrupt = view?.completedCount === 0 && view.skippedCount > 0
  const count = allCorrupt ? null : (view?.completedCount ?? (known ? 0 : null))

  return (
    <DashboardSection labelId={TITLE_ID}>
      <div className="rounded-card bg-exercise p-4 text-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2 id={TITLE_ID} className="text-section-title font-semibold">
            이번 주 운동
          </h2>
          <p className="text-support font-normal tabular-nums">
            {dashboardDateLabel(week.from)} – {dashboardDateLabel(week.to)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <p className="text-metric leading-none font-semibold tabular-nums">
            {count === null ? (
              <span aria-label="아직 알 수 없음">—</span>
            ) : (
              count
            )}
            {count !== null ? <span className="ml-1 text-body">회</span> : null}
          </p>
          <p className="text-support font-normal">
            {slot.status === 'loading' ? '불러오는 중…' : '완료한 운동'}
          </p>
          {view && !allCorrupt ? (
            <p className="ml-auto text-support font-normal">
              {view.activeDayCount}일 운동했어요
            </p>
          ) : null}
        </div>
        <ol
          role="list"
          aria-label="월요일부터 일요일까지 운동한 날"
          className="mt-4 grid grid-cols-7 gap-1 border-t border-surface/20 pt-3"
        >
          {week.days.map((day) => {
            const active = known && !allCorrupt && day.completedCount > 0
            const state =
              known && !allCorrupt
                ? active
                  ? `운동 ${day.completedCount}회 완료`
                  : '저장된 완료 기록 없음'
                : '기록 확인 전'
            return (
              <li
                key={day.date}
                aria-current={day.isToday ? 'date' : undefined}
                className="flex min-w-0 flex-col items-center gap-2"
              >
                <span className="sr-only">
                  {dashboardDateLabel(day.date)} {day.weekday}요일
                  {day.isToday ? ', 오늘' : ''}, {state}
                </span>
                <span aria-hidden="true" className="text-support font-normal">
                  {day.weekday}
                </span>
                <span
                  aria-hidden="true"
                  className={`relative flex aspect-square w-full max-w-9 items-center justify-center rounded-full text-body font-semibold tabular-nums ${active ? 'bg-surface text-exercise' : 'bg-surface/10 text-surface'} ${day.isToday ? 'ring-2 ring-surface ring-offset-2 ring-offset-exercise' : ''}`}
                >
                  {day.dayOfMonth}
                  {active ? (
                    <span className="absolute -bottom-1 flex size-3 items-center justify-center rounded-full bg-surface text-support leading-none text-exercise">
                      ✓
                    </span>
                  ) : null}
                </span>
              </li>
            )
          })}
        </ol>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-support font-normal">
          <span className="inline-flex items-center gap-1">
            <Icon name="clipboard-check" size={18} />
            운동한 날
          </span>
          <span>테두리는 오늘</span>
        </div>
        {slot.status === 'unavailable' ? (
          <p
            role="status"
            className="mt-3 border-t border-surface/20 pt-3 text-support leading-relaxed font-normal"
          >
            {sharedUnavailable
              ? '운동 기록을 준비 중이에요.'
              : '이번 주 운동 기록을 준비 중이에요.'}
          </p>
        ) : slot.status === 'loading' ? (
          <p role="status" className="sr-only">
            이번 주 운동 기록을 불러오는 중이에요…
          </p>
        ) : null}
        {view && view.skippedCount > 0 ? (
          <p className="mt-3 border-t border-surface/20 pt-3 text-support leading-relaxed font-normal">
            읽을 수 없는 기록 {view.skippedCount}건이 있어요. 확인 가능한 기록만
            표시해요.
          </p>
        ) : null}
      </div>
      {slot.status === 'error' ? (
        <div className="mt-3">
          <SlotError
            title="이번 주 운동을 불러오지 못했어요"
            onRetry={onRetry}
          />
        </div>
      ) : null}
    </DashboardSection>
  )
}
