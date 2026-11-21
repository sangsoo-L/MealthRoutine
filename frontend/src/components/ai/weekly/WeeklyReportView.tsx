import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import type {
  ExercisePart,
  GoalPart,
  MealPart,
} from '../../../ai/useWeeklyReport.ts'
import {
  MAX_WEEKS_BACK,
  changeFromPrevious,
  weekdayFullName,
  type ExerciseWeek,
  type MealWeek,
  type WeekRange,
} from '../../../ai/weeklyReport.ts'
import { SCORE_RULE } from '../../../ai/weeklyScore.ts'
import { MEAL_LABEL, MEAL_TYPES } from '../../../food/mealModel.ts'
import Icon from '../../icons/Icon.tsx'
import {
  wCard,
  wChip,
  wFocusRing,
  wPrimaryButton,
  wSecondaryButton,
  wSectionTitle,
} from './weeklyStyles.ts'

/** 다시 시도: 버튼이 사라져도 포커스가 문서 처음으로 빠지지 않게 감싼 영역(tabIndex=-1)으로 먼저 옮긴다. */
function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.currentTarget.closest<HTMLElement>('[data-retry-focus]')?.focus()
        onRetry()
      }}
      className={`mt-3 w-full ${wSecondaryButton}`}
    >
      다시 시도
    </button>
  )
}

/** 카드 영역 하나의 틀. 제목(h2)과 연결되고 다시 시도 뒤 포커스를 받을 수 있다. */
function Area({
  id,
  icon,
  title,
  iconClass,
  children,
}: {
  id: string
  icon: 'dumbbell' | 'utensils'
  title: string
  iconClass: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={id}
      tabIndex={-1}
      data-retry-focus=""
      className={`${wCard} min-w-0 ${wFocusRing}`}
    >
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-9 shrink-0 items-center justify-center rounded-control ${iconClass}`}
        >
          <Icon name={icon} size={20} />
        </span>
        <h2 id={id} className={wSectionTitle}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  )
}

function Status({
  state,
  retry,
  loading,
  failed,
  unavailable,
}: {
  state: 'loading' | 'unavailable' | 'error'
  retry: () => void
  loading: string
  failed: string
  unavailable: string
}) {
  return state === 'loading' ? (
    <p
      role="status"
      className="mt-3 text-body leading-relaxed font-normal text-muted"
    >
      {loading}
    </p>
  ) : state === 'unavailable' ? (
    <p className="mt-3 text-body leading-relaxed font-normal text-muted">
      {unavailable}
    </p>
  ) : (
    <div role="alert" className="mt-3">
      <p className="text-body leading-snug font-semibold text-content">
        {failed}
      </p>
      <p className="mt-1 text-support leading-relaxed font-normal text-muted">
        기록은 지우지 않았어요. 잠시 후 다시 시도해 주세요.
      </p>
      <RetryButton onRetry={retry} />
    </div>
  )
}

/** 지난주보다 늘거나 줄었는지(비교할 지난주 기록이 있을 때만). */
function ChangeText({ change, unit }: { change: number | null; unit: string }) {
  if (change === null) return null
  return (
    <p className="mt-1 text-support leading-snug font-normal tabular-nums text-muted">
      {change === 0
        ? '지난주와 같아요'
        : `지난주보다 ${change > 0 ? '+' : '−'}${Math.abs(change)}${unit}`}
    </p>
  )
}

function LastRecord({
  range,
  lastDate,
  days,
  dayLabel,
}: {
  range: WeekRange
  lastDate: string | null
  days: number
  dayLabel: string
}) {
  return (
    <p className="mt-3 text-support leading-relaxed font-normal text-muted">
      {dayLabel} {days}일
      {lastDate ? ` · 최근 기록 ${weekdayFullName(lastDate, range.from)}` : ''}
    </p>
  )
}

/** 운동 요일별 막대. 기록이 없는 날은 0이 아니라 "–"와 "기록 없음"이다. */
function ExerciseDayBars({
  range,
  week,
  today,
}: {
  range: WeekRange
  week: ExerciseWeek
  today: string
}) {
  const max = Math.max(1, ...week.days.map((day) => day.count))
  return (
    <ol role="list" className="mt-4 grid grid-cols-7 gap-1.5">
      {week.days.map((day) => {
        const name = weekdayFullName(day.date, range.from)
        const future = day.date > today
        return (
          <li
            key={day.date}
            data-exercise-day={day.date}
            className="flex min-w-0 flex-col items-center gap-1"
          >
            <span className="sr-only">
              {name}{' '}
              {day.count > 0
                ? `운동 ${day.count}회`
                : future
                  ? '아직 오지 않은 날'
                  : '기록 없음'}
            </span>
            <span
              aria-hidden="true"
              className="text-support leading-none font-semibold tabular-nums text-content"
            >
              {day.count > 0 ? day.count : '–'}
            </span>
            <span
              aria-hidden="true"
              className="flex h-12 w-full max-w-7 items-end rounded-control bg-page"
            >
              <span
                className="w-full rounded-control bg-exercise"
                style={{
                  height: day.count > 0 ? `${(day.count / max) * 100}%` : '0%',
                }}
              />
            </span>
            <span
              aria-hidden="true"
              className={`text-support leading-none ${day.date === today ? 'font-semibold text-exercise' : 'font-normal text-muted'}`}
            >
              {day.weekday}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

function ExerciseCard({
  range,
  part,
  goal,
  today,
  onRetry,
}: {
  range: WeekRange
  part: ExercisePart
  goal: GoalPart
  today: string
  onRetry: () => void
}) {
  return (
    <Area
      id="weekly-exercise-title"
      icon="dumbbell"
      title="운동 기록"
      iconClass="bg-exercise-soft text-exercise"
    >
      {part.status !== 'ready' ? (
        <Status
          state={part.status}
          retry={onRetry}
          loading="운동 기록을 불러오는 중이에요…"
          failed="운동 기록을 불러오지 못했어요"
          unavailable="운동 기록 저장이 아직 연결되지 않아 주간 운동 기록을 보여 드릴 수 없어요."
        />
      ) : (
        <>
          <p
            data-exercise-count={part.current.count}
            className="mt-3 text-metric leading-none font-semibold tabular-nums text-content"
          >
            {part.current.count}
            <span className="ml-1 text-body font-normal">회</span>
          </p>
          <ChangeText
            change={changeFromPrevious(
              part.current.count,
              part.previous.count > 0 ? part.previous.count : null,
            )}
            unit="회"
          />
          {goal.status === 'ready' ? (
            <div data-goal-progress className="mt-3">
              <div
                role="progressbar"
                aria-label="개인 운동 목표 대비(운동한 날)"
                aria-valuemin={0}
                aria-valuemax={goal.daysPerWeek}
                aria-valuenow={Math.min(
                  part.current.activeDays,
                  goal.daysPerWeek,
                )}
                aria-valuetext={`${Math.min(part.current.activeDays, goal.daysPerWeek)}일 / 목표 ${goal.daysPerWeek}일`}
                className="h-2 w-full overflow-hidden rounded-full bg-line"
              >
                <div
                  className="h-full rounded-full bg-exercise"
                  style={{
                    width: `${Math.min(100, (part.current.activeDays / goal.daysPerWeek) * 100)}%`,
                  }}
                />
              </div>
              <p className="mt-1.5 text-support leading-snug font-normal text-muted">
                개인 목표 주 {goal.daysPerWeek}일 · 운동한 날{' '}
                {part.current.activeDays}일 ·{' '}
                {part.current.activeDays >= goal.daysPerWeek
                  ? '목표 달성'
                  : `목표까지 ${goal.daysPerWeek - part.current.activeDays}일`}
              </p>
            </div>
          ) : null}
          {part.current.count === 0 ? (
            <div className="mt-3">
              <p className="text-body leading-relaxed font-normal text-muted">
                {range.offset === 0
                  ? '아직 이번 주 운동 기록이 없어요. 한 번 기록해 보세요.'
                  : '이 주에는 운동 기록이 없어요.'}
              </p>
              {range.offset === 0 ? (
                <Link
                  to="/records/exercise"
                  state={{ from: '/ai/weekly-report' }}
                  className={`mt-3 ${wSecondaryButton}`}
                >
                  운동 기록하러 가기
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <ExerciseDayBars
                range={range}
                week={part.current}
                today={today}
              />
              <LastRecord
                range={range}
                lastDate={part.current.lastDate}
                days={part.current.activeDays}
                dayLabel="운동한 날"
              />
            </>
          )}
          {part.skippedCount > 0 ? (
            <p className="mt-2 text-support leading-relaxed font-normal text-muted">
              읽을 수 없는 기록 {part.skippedCount}건을 제외했어요.
            </p>
          ) : null}
        </>
      )}
    </Area>
  )
}

function MealSlot({ recorded, label }: { recorded: boolean; label: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-6 items-center justify-center rounded-full text-support leading-none font-semibold ${recorded ? 'bg-meal text-surface' : 'border border-line bg-surface text-muted'}`}
      data-slot-label={label}
    >
      {recorded ? '✓' : '–'}
    </span>
  )
}

/** 식단 요일별 기록: 아침·점심·저녁 3칸. 기록이 없는 칸은 "–"이고 0으로 세지 않는다. */
function MealDayRows({
  range,
  week,
  today,
}: {
  range: WeekRange
  week: MealWeek
  today: string
}) {
  // 글자를 크게 키워 폭이 아주 좁아지면 페이지가 아니라 이 영역 안에서만 가로로 움직인다(키보드로도 스크롤할 수 있게 포커스를 받는다).
  return (
    <div
      role="group"
      aria-label="요일별 식단 기록"
      tabIndex={0}
      className={`mt-4 overflow-x-auto rounded-control ${wFocusRing}`}
    >
      <div className="min-w-60">
        <div
          aria-hidden="true"
          className="grid grid-cols-[2.5rem_repeat(3,1fr)_3rem] items-center gap-2 text-support leading-none font-normal text-muted"
        >
          <span />
          {MEAL_TYPES.map((meal) => (
            <span key={meal} className="text-center">
              {MEAL_LABEL[meal]}
            </span>
          ))}
          <span className="text-right">끼니</span>
        </div>
        <ol role="list" className="mt-2 flex flex-col gap-1.5">
          {week.days.map((day) => {
            const name = weekdayFullName(day.date, range.from)
            const future = day.date > today
            const recorded = MEAL_TYPES.filter((meal) => day.meals[meal]).map(
              (meal) => MEAL_LABEL[meal],
            )
            return (
              <li
                key={day.date}
                data-meal-day={day.date}
                className="grid grid-cols-[2.5rem_repeat(3,1fr)_3rem] items-center gap-2"
              >
                <span className="sr-only">
                  {name}{' '}
                  {recorded.length > 0
                    ? `${recorded.join('·')} 기록`
                    : future
                      ? '아직 오지 않은 날'
                      : '기록 없음'}
                </span>
                <span
                  aria-hidden="true"
                  className={`text-support leading-none ${day.date === today ? 'font-semibold text-meal' : 'font-normal text-muted'}`}
                >
                  {day.weekday}
                </span>
                {MEAL_TYPES.map((meal) => (
                  <span key={meal} className="flex justify-center">
                    <MealSlot recorded={day.meals[meal]} label={meal} />
                  </span>
                ))}
                <span
                  aria-hidden="true"
                  className="text-right text-support leading-none font-semibold tabular-nums text-content"
                >
                  {day.count > 0 ? `${day.count}끼` : '–'}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}

function MealCard({
  range,
  part,
  today,
  onRetry,
}: {
  range: WeekRange
  part: MealPart
  today: string
  onRetry: () => void
}) {
  return (
    <Area
      id="weekly-meal-title"
      icon="utensils"
      title="식단 기록"
      iconClass="bg-meal-soft text-meal"
    >
      {part.status !== 'ready' ? (
        <Status
          state={part.status}
          retry={onRetry}
          loading="식단 기록을 불러오는 중이에요…"
          failed="식단 기록을 불러오지 못했어요"
          unavailable="식단 기록 저장이 아직 연결되지 않아 주간 식단 기록을 보여 드릴 수 없어요."
        />
      ) : (
        <>
          <p
            data-meal-count={part.current.slotCount}
            className="mt-3 text-metric leading-none font-semibold tabular-nums text-content"
          >
            {part.current.slotCount}
            <span className="ml-1 text-body font-normal">끼</span>
            <span className="ml-2 text-body font-normal text-muted">
              / 주 최대 {SCORE_RULE.mealTarget}끼
            </span>
          </p>
          <ChangeText
            change={changeFromPrevious(
              part.current.slotCount,
              part.previous.slotCount > 0 ? part.previous.slotCount : null,
            )}
            unit="끼"
          />
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            같은 날 같은 끼니는 기록이 여러 개여도 1끼로 세요. 식단 목표가 없어
            목표와 비교하지 않아요.
          </p>
          {part.current.slotCount === 0 ? (
            <div className="mt-3">
              <p className="text-body leading-relaxed font-normal text-muted">
                {range.offset === 0
                  ? '아직 이번 주 식단 기록이 없어요. 한 끼부터 기록해 보세요.'
                  : '이 주에는 식단 기록이 없어요.'}
              </p>
              {range.offset === 0 ? (
                <Link
                  to="/records/meal/record"
                  state={{ from: '/ai/weekly-report' }}
                  className={`mt-3 ${wSecondaryButton}`}
                >
                  식단 기록하러 가기
                </Link>
              ) : null}
            </div>
          ) : (
            <>
              <MealDayRows range={range} week={part.current} today={today} />
              <LastRecord
                range={range}
                lastDate={part.current.lastDate}
                days={part.current.recordedDays}
                dayLabel="기록한 날"
              />
            </>
          )}
          {part.skippedCount > 0 ? (
            <p className="mt-2 text-support leading-relaxed font-normal text-muted">
              읽을 수 없는 기록 {part.skippedCount}개를 제외했어요.
            </p>
          ) : null}
        </>
      )}
    </Area>
  )
}

/**
 * I05 주간 기록 리포트 본문(`/ai/weekly-report`, 회원 전용). 주간 이동, 운동·식단 기록 카드, 평가 기준 안내와 하단 고정 "평가하기"(→ I05-1)다.
 * 기록 수만 보여 주며 AI·점수 산식을 여기서 계산하지 않는다(점수는 I05-1). 기록이 없는 날을 0이나 미실천으로 쓰지 않는다.
 */
export default function WeeklyReportView({
  range,
  today,
  exercise,
  meal,
  goal,
  onOffsetChange,
  onRetryExercise,
  onRetryMeal,
  scoreTo,
  entryFrom,
}: {
  range: WeekRange
  today: string
  exercise: ExercisePart
  meal: MealPart
  goal: GoalPart
  onOffsetChange: (offset: number) => void
  onRetryExercise: () => void
  onRetryMeal: () => void
  scoreTo: string
  /** 이 화면에 들어온 화면의 경로(W01·D01 등). 점수 화면을 거쳐 돌아와도 "이전"이 처음 진입한 화면을 가리키게 넘긴다. */
  entryFrom?: string
}) {
  const atStart = range.offset <= -MAX_WEEKS_BACK
  const atEnd = range.offset >= 0
  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            주간 리포트
          </h1>
          <span className={wChip}>무료</span>
        </div>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          이번 주 기록을 돌아봐요. AI 없이 기록 수로 보여 드려요.
        </p>
      </header>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-disabled={atStart || undefined}
          aria-label="이전 주"
          onClick={() => {
            if (!atStart) onOffsetChange(range.offset - 1)
          }}
          className={`${wSecondaryButton} min-w-11 aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted`}
        >
          ‹
        </button>
        <div className="min-w-0 text-center" aria-live="polite">
          <p className="text-section-title leading-snug font-semibold text-content">
            {range.label}
          </p>
          <p className="text-support leading-snug font-normal tabular-nums text-muted">
            {range.period}
            {range.inProgress ? ' · 진행 중' : ''}
          </p>
        </div>
        <button
          type="button"
          aria-disabled={atEnd || undefined}
          aria-label="다음 주"
          onClick={() => {
            if (!atEnd) onOffsetChange(range.offset + 1)
          }}
          className={`${wSecondaryButton} min-w-11 aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted`}
        >
          ›
        </button>
      </div>

      <ExerciseCard
        range={range}
        part={exercise}
        goal={goal}
        today={today}
        onRetry={onRetryExercise}
      />
      <MealCard range={range} part={meal} today={today} onRetry={onRetryMeal} />

      <section aria-labelledby="weekly-rule-title" className={wCard}>
        <h2 id="weekly-rule-title" className={wSectionTitle}>
          이렇게 평가해요
        </h2>
        <ul
          role="list"
          className="mt-3 flex flex-col gap-2 text-body leading-relaxed font-normal text-content"
        >
          <li>
            운동 주 {SCORE_RULE.exerciseTarget}회{' '}
            <span className="font-semibold tabular-nums">
              {SCORE_RULE.exerciseMax}점
            </span>
          </li>
          <li>
            식단 주 {SCORE_RULE.mealTarget}끼{' '}
            <span className="font-semibold tabular-nums">
              {SCORE_RULE.mealMax}점
            </span>
          </li>
        </ul>
        <p className="mt-3 text-support leading-relaxed font-normal text-muted">
          AI 없이 기록 수로 계산해요. 개인 운동 목표와 별개의 기준이에요.
        </p>
      </section>

      <div className="sticky bottom-0 z-10 -mx-5 border-t border-line bg-surface px-5 py-3">
        <Link
          to={scoreTo}
          state={{
            from:
              range.offset === 0
                ? '/ai/weekly-report'
                : `/ai/weekly-report?offset=${range.offset}`,
            ...(entryFrom ? { fromState: { from: entryFrom } } : {}),
          }}
          className={wPrimaryButton}
        >
          평가하기
        </Link>
      </div>
    </div>
  )
}
