import { useRef, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { formatKcal } from '../../food/foodNutrition.ts'
import {
  PATH_MEAL,
  PATH_MEAL_RECORD,
  mealPreviousPath,
} from '../../food/foodPaths.ts'
import {
  WEEKDAY_LABELS,
  dateText,
  weekDates,
  weekLabel,
  weekPeriod,
  weekSummary,
  type RecordsByDate,
} from '../../food/mealHistory.ts'
import {
  MEAL_LABEL,
  MEAL_TYPES,
  type MealRecord,
} from '../../food/mealModel.ts'
import {
  incompleteNotice,
  summarizeMeals,
  totalKcalText,
} from '../../food/mealView.ts'
import type { AllMealRecordsState } from '../../food/useAllMealRecords.ts'
import Icon from '../icons/Icon.tsx'
import MacroShareBar from './MacroShareBar.tsx'
import {
  mealCard,
  mealChip,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  mealSectionTitle,
} from './foodStyles.ts'

const weekButton = `flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-body font-semibold text-content hover:bg-page aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${mealFocusRing}`

/** 선택한 날짜 카드 안의 끼니별 음식 줄. 기록 없는 끼니는 "기록 없음"이다. */
function MealRows({ records }: { records: readonly MealRecord[] }) {
  return (
    <dl className="flex flex-col gap-2">
      {MEAL_TYPES.map((meal) => {
        const list = records.filter((r) => r.mealType === meal)
        const kcal = summarizeMeals(list).totals.kcal
        return (
          <div key={meal} data-meal-row={meal} className="flex gap-3">
            <dt className="w-10 shrink-0 text-support leading-snug font-semibold text-content">
              {MEAL_LABEL[meal]}
            </dt>
            <dd className="min-w-0 flex-1 text-support leading-snug font-normal text-muted">
              {list.length === 0 ? (
                '기록 없음'
              ) : (
                <>
                  <span className="text-content">
                    {list.map((r) => r.foodName).join(', ')}
                  </span>
                  <span className="ml-2 tabular-nums">
                    {formatKcal(kcal) ?? '열량 미산정'}
                  </span>
                </>
              )}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** 선택한 날의 총 열량·탄단지 비율·끼니별 음식. */
function DayContent({ records }: { records: readonly MealRecord[] }) {
  const summary = summarizeMeals(records)
  return (
    <>
      <p
        data-day-kcal
        className="mt-2 text-app-title leading-none font-semibold tabular-nums text-content"
      >
        {totalKcalText(summary.totals)}
      </p>
      {incompleteNotice(summary.totals) ? (
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          {incompleteNotice(summary.totals)}
        </p>
      ) : null}
      {summary.share ? (
        <div className="mt-3">
          <MacroShareBar share={summary.share} />
        </div>
      ) : (
        <p className="mt-3 text-support leading-relaxed font-normal text-muted">
          탄수화물·단백질·지방 정보가 모두 있는 기록이 없어 비율은 보여 드리지
          않아요.
        </p>
      )}
      <div className="mt-4">
        <MealRows records={records} />
      </div>
    </>
  )
}

/**
 * D03 식단 리스트 본문(주간 선택 → 요일 버튼 → 주간 요약 → 선택한 날짜의 식단). 화면명세 v5.0 D03을 따른다.
 * - 이전 주·다음 주로 옮기면 같은 요일을 유지하고, 미래가 되면 오늘이다. 다음 주는 이번 주면 비활성이다. 미래 요일은 비활성이다(좌우 방향키로 이동).
 * - 지난 날은 카드 전체가 D03-1로 가는 링크이고, 오늘은 카드 아래 버튼으로 D02로 간다. 기록 없는 날은 안내 한 줄이다.
 * - 목표가 없어 "목표 대비 %"는 보여 주지 않는다. 등록한 식단이 하나도 없으면 주간 선택을 숨기고 등록 안내를 보인다.
 */
export default function MealListView({
  today,
  selected,
  state,
  byDate,
  onSelect,
  onShiftWeek,
  onRetry,
}: {
  today: LocalDate
  selected: LocalDate
  state: AllMealRecordsState
  byDate: RecordsByDate
  onSelect: (date: LocalDate) => void
  onShiftWeek: (weeks: number) => void
  onRetry: () => void
}) {
  const dayRefs = useRef<Partial<Record<LocalDate, HTMLButtonElement>>>({})
  const days = weekDates(selected)
  const summary = weekSummary(byDate, days, today)
  const records = byDate.get(selected) ?? []
  const isToday = selected === today
  const nextDisabled = days[6] >= today
  const hasAny = state.status === 'ready' && state.records.length > 0

  function handleKey(event: KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    for (let i = index + step; i >= 0 && i < days.length; i += step) {
      if (days[i] <= today) {
        onSelect(days[i])
        dayRefs.current[days[i]]?.focus()
        return
      }
    }
  }

  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <p className="mb-1">
          <span className={mealChip}>기록한 식단</span>
        </p>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          식단 리스트
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          날짜를 골라 하루 열량과 끼니별 음식을 다시 확인해요.
        </p>
      </header>

      {state.status === 'loading' ? (
        <p role="status" className={`${mealCard} text-body text-muted`}>
          식단 기록을 불러오는 중이에요…
        </p>
      ) : state.status === 'unavailable' ? (
        <div className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            식단 기록을 준비 중이에요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            기록 저장이 아직 연결되지 않아 식단 리스트를 보여 드릴 수 없어요.
          </p>
        </div>
      ) : state.status === 'error' ? (
        <div role="alert" className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            식단 기록을 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 w-full ${mealSecondaryButton}`}
          >
            다시 시도
          </button>
        </div>
      ) : !hasAny ? (
        <div
          role="status"
          className={`${mealCard} flex flex-col items-center gap-2 py-8 text-center`}
        >
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-meal-soft text-meal"
          >
            <Icon name="utensils" size={30} />
          </span>
          <p className="text-body leading-snug font-semibold text-content">
            아직 등록된 식단이 없어요
          </p>
          <p className="text-support leading-relaxed font-normal text-muted">
            먹은 음식을 기록하면 날짜별로 모아 보여 드려요.
          </p>
          <Link
            to={PATH_MEAL_RECORD}
            state={{ from: '/records/meal/list' }}
            className={`mt-2 w-full ${mealPrimaryButton}`}
          >
            식단 등록하기
          </Link>
        </div>
      ) : (
        <>
          <section aria-label="주간 선택" className={mealCard}>
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="이전 주"
                onClick={() => onShiftWeek(-1)}
                className={weekButton}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <div className="min-w-0 text-center">
                <p
                  data-week-label
                  className="text-section-title leading-snug font-semibold text-content"
                >
                  {weekLabel(selected)}
                </p>
                <p className="text-support leading-snug font-normal tabular-nums text-muted">
                  {weekPeriod(selected)}
                </p>
              </div>
              <button
                type="button"
                aria-label="다음 주"
                aria-disabled={nextDisabled || undefined}
                onClick={() => {
                  if (!nextDisabled) onShiftWeek(1)
                }}
                className={weekButton}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <ul role="list" className="mt-3 grid grid-cols-7 gap-1">
              {days.map((date, index) => {
                const future = date > today
                const chosen = date === selected
                const recorded = byDate.has(date)
                const day = Number(date.slice(8))
                return (
                  <li key={date}>
                    <button
                      ref={(node) => {
                        if (node) dayRefs.current[date] = node
                      }}
                      type="button"
                      data-day={date}
                      aria-pressed={chosen}
                      aria-disabled={future || undefined}
                      aria-label={`${dateText(date)}${date === today ? ' 오늘' : ''}${recorded ? ', 기록 있음' : ''}${future ? ', 선택할 수 없음' : ''}`}
                      tabIndex={chosen ? 0 : -1}
                      onClick={() => {
                        if (!future) onSelect(date)
                      }}
                      onKeyDown={(event) => handleKey(event, index)}
                      className={`flex min-h-14 w-full cursor-pointer flex-col items-center justify-center rounded-control border px-0 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 ${mealFocusRing} ${
                        chosen
                          ? 'border-meal bg-meal text-surface'
                          : date === today
                            ? 'border-meal bg-surface text-content'
                            : 'border-line bg-surface text-content hover:bg-page'
                      }`}
                    >
                      <span className="text-support leading-none font-normal">
                        {WEEKDAY_LABELS[index]}
                      </span>
                      <span className="mt-1 text-section-title leading-none font-semibold tabular-nums">
                        {day}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`mt-1 size-1.5 rounded-full ${recorded ? (chosen ? 'bg-surface' : 'bg-meal') : 'bg-transparent'}`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-3">
              <p
                data-week-summary
                className="min-w-0 text-support leading-relaxed font-normal text-muted"
              >
                기록한 날 {summary.recordedDays}일
                {summary.averageKcal !== null
                  ? ` · 하루 평균 ${Math.round(summary.averageKcal)}kcal`
                  : ''}
              </p>
              <button
                type="button"
                onClick={() => onSelect(today)}
                className={`shrink-0 px-3 ${mealSecondaryButton}`}
              >
                오늘로 이동
              </button>
            </div>
          </section>

          <section aria-labelledby="meal-day-title">
            {records.length > 0 && !isToday ? (
              <Link
                to={mealPreviousPath(selected)}
                state={{ from: `/records/meal/list?date=${selected}` }}
                data-day-card={selected}
                className={`block ${mealCard} hover:border-meal/40 ${mealFocusRing}`}
              >
                <DayHeader id="meal-day-title" date={selected} today={today} />
                <DayContent records={records} />
                <p className="mt-3 flex items-center justify-end gap-1 text-support font-semibold text-meal">
                  상세 보기
                  <Icon name="chevron-right" size={18} />
                </p>
              </Link>
            ) : (
              <div
                data-day-card={selected}
                className={`${mealCard} ${isToday ? 'border-meal' : ''}`}
              >
                <DayHeader id="meal-day-title" date={selected} today={today} />
                {records.length > 0 ? (
                  <DayContent records={records} />
                ) : (
                  <p className="mt-2 text-body leading-relaxed font-normal text-muted">
                    {isToday
                      ? '오늘은 아직 기록한 식단이 없어요.'
                      : '이 날은 기록한 식단이 없어요'}
                  </p>
                )}
              </div>
            )}
            {isToday ? (
              <Link
                to={PATH_MEAL_RECORD}
                state={{ from: '/records/meal/list' }}
                className={`mt-3 ${mealPrimaryButton}`}
              >
                {records.length > 0
                  ? '오늘 식단 이어서 기록하기'
                  : '오늘 식단 기록하기'}
              </Link>
            ) : null}
            {state.status === 'ready' && state.skippedCount > 0 ? (
              <p className="mt-3 text-support leading-relaxed font-normal text-muted">
                읽을 수 없는 기록 {state.skippedCount}개를 제외했어요.
              </p>
            ) : null}
          </section>
        </>
      )}

      <Link to={PATH_MEAL} className={mealSecondaryButton}>
        식단 대시보드로
      </Link>
    </div>
  )
}

function DayHeader({
  id,
  date,
  today,
}: {
  id: string
  date: LocalDate
  today: LocalDate
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 id={id} className={mealSectionTitle}>
        {dateText(date)}
      </h2>
      {date === today ? <span className={mealChip}>오늘</span> : null}
    </div>
  )
}
