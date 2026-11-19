import { Link } from 'react-router'
import Icon from '../../icons/Icon.tsx'
import {
  dashboardDateLabel,
  dashboardWeek,
} from '../../../exercise/dashboardSelectors.ts'
import type {
  DashboardSlot,
  WeeklyExerciseView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import {
  DashboardSection,
  SlotError,
  dashboardFocusRing,
} from './DashboardParts.tsx'

const TITLE_ID = 'dashboard-weekly-title'

/**
 * 날짜 칸은 조회·이동 버튼이 아닌 활동 표시다. 오늘과 운동한 날을 모양·문장으로도 구분한다.
 * 흰 카드에 숫자·완료한 날·오늘만 운동색으로 강조한다(완료: 채운 원 + 아래 점, 오늘: 바깥 링 + 굵은 요일, 보조기기용 문장은 그대로).
 */
export default function WeeklyExerciseSection({
  slot,
  today,
  sharedUnavailable,
  onRetry,
  reportTo,
}: {
  slot: DashboardSlot<WeeklyExerciseView>
  today: string
  sharedUnavailable: boolean
  onRetry: () => void
  /** 주간 리포트(I05) 경로. 없으면(개발용 예시 `?sample=`) 링크를 그리지 않는다. */
  reportTo?: string
}) {
  const view = slot.status === 'ready' ? slot.data : null
  const week = view ?? dashboardWeek(today)
  const known = view !== null || slot.status === 'empty'
  const allCorrupt = view?.completedCount === 0 && view.skippedCount > 0
  const count = allCorrupt ? null : (view?.completedCount ?? (known ? 0 : null))
  // 알 수 없는 상태를 0회나 기록 없음으로 단정하지 않고, 상태별 짧은 문구로 알린다.
  const unknownLabel =
    slot.status === 'loading'
      ? '확인 중'
      : slot.status === 'unavailable'
        ? '기록 연결 전'
        : '확인할 수 없어요'
  // 기록 여부를 판단할 수 있을 때만 범례를 보여 준다.
  const showLegend = known && !allCorrupt

  return (
    <DashboardSection labelId={TITLE_ID}>
      <div className="rounded-card border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <h2
            id={TITLE_ID}
            className="text-section-title font-semibold text-content"
          >
            이번 주 운동
          </h2>
          <p className="text-support font-normal tabular-nums text-muted">
            {dashboardDateLabel(week.from)} – {dashboardDateLabel(week.to)}
          </p>
        </div>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {count === null ? (
            <p className="text-section-title leading-tight font-semibold text-content">
              {unknownLabel}
              <span className="sr-only">
                {' '}
                (이번 주 완료 횟수를 아직 알 수 없어요)
              </span>
            </p>
          ) : (
            <>
              <p className="text-metric leading-none font-semibold tabular-nums text-exercise">
                {count}
                <span className="ml-1 text-body">회</span>
              </p>
              <p className="text-support font-normal text-muted">완료한 운동</p>
            </>
          )}
          {view && !allCorrupt ? (
            <p className="ml-auto text-support font-normal text-muted">
              {view.activeDayCount}일 운동했어요
            </p>
          ) : null}
        </div>
        <ol
          role="list"
          aria-label="월요일부터 일요일까지 운동한 날"
          className="mt-4 grid grid-cols-7 gap-1.5 border-t border-line pt-3"
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
                className="flex min-w-0 flex-col items-center gap-1.5"
              >
                <span className="sr-only">
                  {dashboardDateLabel(day.date)} {day.weekday}요일
                  {day.isToday ? ', 오늘' : ''}, {state}
                </span>
                <span
                  aria-hidden="true"
                  className={`text-support tabular-nums ${day.isToday ? 'font-semibold text-exercise' : 'font-normal text-muted'}`}
                >
                  {day.weekday}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex aspect-square w-full max-w-9 items-center justify-center rounded-full text-body font-semibold tabular-nums ${active ? 'bg-exercise text-surface' : 'bg-page text-muted'} ${day.isToday ? 'ring-2 ring-exercise ring-offset-2 ring-offset-surface' : ''}`}
                >
                  {day.dayOfMonth}
                </span>
                {/* 완료 표시는 채움(색)과 아래 점(모양) 두 가지로 알린다. 원 밖이라 오늘 링과 겹치지 않는다. */}
                <span
                  aria-hidden="true"
                  className={`size-1.5 rounded-full ${active ? 'bg-exercise' : 'bg-transparent'}`}
                />
              </li>
            )
          })}
        </ol>
        {showLegend ? (
          <p
            aria-hidden="true"
            className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-support font-normal text-muted"
          >
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-exercise" />
              운동 완료한 날
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-full bg-page ring-2 ring-exercise ring-offset-1 ring-offset-surface" />
              오늘
            </span>
          </p>
        ) : null}
        {slot.status === 'unavailable' ? (
          <p
            role="status"
            className="mt-3 border-t border-line pt-3 text-support leading-relaxed font-normal text-muted"
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
          <p className="mt-3 border-t border-line pt-3 text-support leading-relaxed font-normal text-muted">
            읽을 수 없는 기록 {view.skippedCount}건이 있어요. 확인 가능한 기록만
            표시해요.
          </p>
        ) : null}
        {reportTo && slot.status !== 'unavailable' ? (
          <Link
            to={reportTo}
            state={{ from: '/records/exercise' }}
            className={`mt-3 -mb-1 flex min-h-11 items-center justify-between gap-2 border-t border-line pt-3 text-support font-semibold text-exercise ${dashboardFocusRing}`}
          >
            주간 리포트 보기
            <Icon name="chevron-right" size={18} />
          </Link>
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
