import type { MouseEvent } from 'react'
import { Link } from 'react-router'
import type { ExercisePart, MealPart } from '../../../ai/useWeeklyReport.ts'
import {
  weekdayFullName,
  type ExerciseWeek,
  type MealWeek,
  type WeekRange,
} from '../../../ai/weeklyReport.ts'
import {
  SCORE_RULE,
  formatPoints,
  suggestionFor,
  type WeeklyScore,
} from '../../../ai/weeklyScore.ts'
import Icon from '../../icons/Icon.tsx'
import {
  wCard,
  wChip,
  wFocusRing,
  wPrimaryButton,
  wSecondaryButton,
  wSectionTitle,
} from './weeklyStyles.ts'

/** 계산 단계 이름(명세: 운동 기록 · 식단 기록 · 점수 계산). */
const CALC_STEPS = ['운동 기록', '식단 기록', '점수 계산'] as const

const GRADE_TONE: Record<WeeklyScore['grade'], string> = {
  '아주 꾸준해요': 'text-success',
  '잘하고 있어요': 'text-brand',
  '조금만 더 힘내요': 'text-warning',
  '다시 시작해요': 'text-muted',
}

/** 0~100 점수 원형 링. 숫자와 보조기기용 문장을 함께 둔다(색에만 의존하지 않는다). */
export function ScoreRing({ total }: { total: number }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  return (
    <div
      role="img"
      aria-label={`기록 점수 100점 만점에 ${total}점`}
      data-score-ring={total}
      className="relative size-36 shrink-0"
    >
      <svg
        viewBox="0 0 128 128"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          className="stroke-line"
        />
        <circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - total / 100)}
          className="stroke-brand"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center leading-none font-semibold tabular-nums text-content"
      >
        <span className="text-metric">{total}</span>
        <span className="mt-1 text-support font-normal text-muted">
          / 100점
        </span>
      </span>
    </div>
  )
}

function ScoreBar({
  label,
  detail,
  points,
  max,
  barClass,
  name,
}: {
  label: string
  detail: string
  /** 반올림 전 원점수 */
  points: number
  max: number
  barClass: string
  name: string
}) {
  return (
    <li data-score-part={name}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-body leading-snug font-semibold text-content">
          {label}
        </span>
        <span className="text-body leading-snug font-semibold tabular-nums text-content">
          {formatPoints(points)}
          <span className="font-normal text-muted">/{max}점</span>
        </span>
      </div>
      <p className="mt-0.5 text-support leading-snug font-normal tabular-nums text-muted">
        {detail}
      </p>
      <div
        role="progressbar"
        aria-label={`${label} 점수`}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Number(points.toFixed(1))}
        aria-valuetext={`${formatPoints(points)}점 / ${max}점`}
        className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${(points / max) * 100}%` }}
        />
      </div>
    </li>
  )
}

/** 요일별 기록 점(운동·식단). 기록이 있으면 채운 점, 없으면 빈 점이며 글자로도 알린다. */
function DayDots({
  range,
  exercise,
  meal,
  today,
}: {
  range: WeekRange
  exercise: ExerciseWeek
  meal: MealWeek
  today: string
}) {
  const rows = [
    { key: 'exercise', label: '운동', fill: 'bg-exercise' },
    { key: 'meal', label: '식단', fill: 'bg-meal' },
  ] as const
  return (
    <div>
      <ol
        role="list"
        aria-label="요일별 기록"
        className="grid grid-cols-7 gap-1.5"
      >
        {exercise.days.map((day, index) => {
          const mealDay = meal.days[index]
          const name = weekdayFullName(day.date, range.from)
          const future = day.date > today
          const parts = [
            day.count > 0 ? '운동 기록' : null,
            mealDay.count > 0 ? '식단 기록' : null,
          ].filter(Boolean)
          return (
            <li
              key={day.date}
              data-score-day={day.date}
              className="flex min-w-0 flex-col items-center gap-1.5"
            >
              <span className="sr-only">
                {name}{' '}
                {parts.length > 0
                  ? parts.join('·')
                  : future
                    ? '아직 오지 않은 날'
                    : '기록 없음'}
              </span>
              <span
                aria-hidden="true"
                className={`text-support leading-none ${day.date === today ? 'font-semibold text-brand' : 'font-normal text-muted'}`}
              >
                {day.weekday}
              </span>
              <span
                aria-hidden="true"
                className={`size-3 rounded-full ${day.count > 0 ? rows[0].fill : 'border border-line bg-surface'}`}
              />
              <span
                aria-hidden="true"
                className={`size-3 rounded-full ${mealDay.count > 0 ? rows[1].fill : 'border border-line bg-surface'}`}
              />
            </li>
          )
        })}
      </ol>
      <p
        aria-hidden="true"
        className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-support font-normal text-muted"
      >
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-exercise" />
          운동(위)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-full bg-meal" />
          식단(아래)
        </span>
      </p>
    </div>
  )
}

/** 계산 중 화면. 리포트 아이콘이 돌고(모션 줄이기에서는 멈춘다) 단계 3개가 차례로 끝난다. 실제 계산은 즉시 끝나며 이 연출은 명세의 약 2초 표시다. */
export function ScoreCalculating({ step }: { step: number }) {
  return (
    <section
      aria-labelledby="score-calc-title"
      data-score-calculating=""
      className={`${wCard} flex flex-col items-center py-8 text-center`}
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-full bg-brand-soft text-brand"
      >
        <Icon
          name="chart"
          size={30}
          className="animate-spin motion-reduce:animate-none"
        />
      </span>
      <h2
        id="score-calc-title"
        role="status"
        className="mt-4 text-section-title leading-snug font-semibold text-content"
      >
        주간 기록을 평가하고 있어요
      </h2>
      <p className="mt-1 text-body leading-relaxed font-normal text-muted">
        AI 없이 기록 수로 계산해요.
      </p>
      <ol role="list" className="mt-5 flex w-full max-w-60 flex-col gap-2">
        {CALC_STEPS.map((name, index) => {
          const done = step > index + 1
          const active = step === index + 1
          return (
            <li
              key={name}
              data-calc-step={done ? 'done' : active ? 'active' : 'wait'}
              className={`flex items-center gap-3 rounded-control px-3 py-2 text-body leading-snug ${active ? 'bg-brand-soft font-semibold text-brand' : done ? 'font-normal text-content' : 'font-normal text-muted'}`}
            >
              <span aria-hidden="true" className="w-4 text-center">
                {done ? '✓' : active ? '…' : '·'}
              </span>
              {name}
              <span className="sr-only">
                {done ? ' 완료' : active ? ' 진행 중' : ' 대기'}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function CalcError({
  exercise,
  meal,
  onRetryExercise,
  onRetryMeal,
}: {
  exercise: ExercisePart
  meal: MealPart
  onRetryExercise: () => void
  onRetryMeal: () => void
}) {
  const failed = exercise.status === 'error' || meal.status === 'error'
  return (
    <section
      aria-labelledby="score-error-title"
      tabIndex={-1}
      data-retry-focus=""
      data-score-error=""
      className={`${wCard} ${wFocusRing}`}
    >
      <h2
        id="score-error-title"
        role="alert"
        className="text-section-title leading-snug font-semibold text-content"
      >
        {failed ? '기록을 불러오지 못했어요' : '점수를 계산할 수 없어요'}
      </h2>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        {failed
          ? '운동·식단 기록을 모두 읽어야 점수를 계산할 수 있어요. 기록은 지우지 않았어요.'
          : '기록 저장이 아직 연결되지 않아 이 환경에서는 점수를 계산할 수 없어요.'}
      </p>
      {exercise.status === 'error' ? (
        <RetryButton label="운동 기록 다시 시도" onRetry={onRetryExercise} />
      ) : null}
      {meal.status === 'error' ? (
        <RetryButton label="식단 기록 다시 시도" onRetry={onRetryMeal} />
      ) : null}
    </section>
  )
}

function RetryButton({
  label,
  onRetry,
}: {
  label: string
  onRetry: () => void
}) {
  return (
    <button
      type="button"
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.currentTarget.closest<HTMLElement>('[data-retry-focus]')?.focus()
        onRetry()
      }}
      className={`mt-3 w-full ${wSecondaryButton}`}
    >
      {label}
    </button>
  )
}

export type ScorePhase =
  /** 계산 연출 중이거나 기록을 읽는 중 */
  | { kind: 'calculating'; step: number }
  | { kind: 'error' }
  | {
      kind: 'result'
      score: WeeklyScore
      exercise: ExerciseWeek
      meal: MealWeek
    }

/**
 * I05-1 주간 기록 점수 본문(`/ai/weekly-report/score`). 계산 중 → 결과(점수 링·등급·구성·요일별 기록·다음 주 제안) 순서다.
 * 점수 계산은 weeklyScore.ts의 순수 함수가 하고 이 컴포넌트는 표시만 한다. AI 심층 코칭은 "준비 중" 안내만 있고 눌 수 있는 버튼이 없다.
 */
export default function WeeklyScoreView({
  range,
  today,
  phase,
  exercise,
  meal,
  onRetryExercise,
  onRetryMeal,
  reportTo,
  reportState,
}: {
  range: WeekRange
  today: string
  phase: ScorePhase
  exercise: ExercisePart
  meal: MealPart
  onRetryExercise: () => void
  onRetryMeal: () => void
  reportTo: string
  /** 리포트로 돌아갈 때 함께 넘기는 state(리포트가 처음 진입한 화면을 잃지 않게 한다). */
  reportState?: { from: string }
}) {
  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            주간 기록 점수
          </h1>
          <span className={wChip}>무료</span>
        </div>
        <p className="mt-1 text-support leading-relaxed font-normal tabular-nums text-muted">
          {range.label} · {range.period}
        </p>
      </header>

      {phase.kind === 'calculating' ? (
        <ScoreCalculating step={phase.step} />
      ) : phase.kind === 'error' ? (
        <CalcError
          exercise={exercise}
          meal={meal}
          onRetryExercise={onRetryExercise}
          onRetryMeal={onRetryMeal}
        />
      ) : (
        <ResultBody range={range} today={today} phase={phase} />
      )}

      {phase.kind === 'result' ? (
        <section aria-labelledby="score-ai-title" className={wCard}>
          <div className="flex items-center justify-between gap-3">
            <h2 id="score-ai-title" className={wSectionTitle}>
              AI 심층 코칭
            </h2>
            <span className={wChip}>준비 중</span>
          </div>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            기록 흐름을 더 깊이 살펴보는 AI 심층 코칭은 아직 준비 중이에요. 유료
            기능이며, 지금 받은 기록 점수는 AI 없이 무료로 계산한 값이에요.
          </p>
        </section>
      ) : null}

      <Link
        to={reportTo}
        state={reportState}
        className={phase.kind === 'result' ? wPrimaryButton : wSecondaryButton}
      >
        주간 리포트로 돌아가기
      </Link>
    </div>
  )
}

function ResultBody({
  range,
  today,
  phase,
}: {
  range: WeekRange
  today: string
  phase: Extract<ScorePhase, { kind: 'result' }>
}) {
  const { score, exercise, meal } = phase
  const noRecords = exercise.count === 0 && meal.slotCount === 0
  return (
    <>
      {range.inProgress ? (
        <p
          role="note"
          data-score-in-progress=""
          className="rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-semibold text-brand"
        >
          아직 진행 중인 주예요. 지금까지의 기록 기준으로 계산했어요.
        </p>
      ) : null}

      <section
        aria-labelledby="score-total-title"
        className={`${wCard} flex flex-col items-center text-center`}
      >
        <h2 id="score-total-title" className="sr-only">
          기록 점수
        </h2>
        <ScoreRing total={score.total} />
        <p
          data-score-grade={score.grade}
          className={`mt-3 text-app-title leading-snug font-semibold ${GRADE_TONE[score.grade]}`}
        >
          {score.grade}
        </p>
        {noRecords ? (
          <p
            data-score-empty=""
            className="mt-2 rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
          >
            이 주에는 운동·식단 기록이 없어 0점이에요. 기록이 없는 것이지
            실천하지 않았다는 뜻은 아니에요.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="score-parts-title" className={wCard}>
        <h2 id="score-parts-title" className={wSectionTitle}>
          점수 구성
        </h2>
        <ul role="list" className="mt-3 flex flex-col gap-4">
          <ScoreBar
            name="exercise"
            label="운동"
            detail={`운동 ${exercise.count}회 / ${SCORE_RULE.exerciseTarget}회${exercise.count > SCORE_RULE.exerciseTarget ? ` (${SCORE_RULE.exerciseTarget}회까지 반영)` : ''}`}
            points={score.exerciseRaw}
            max={SCORE_RULE.exerciseMax}
            barClass="bg-exercise"
          />
          <ScoreBar
            name="meal"
            label="식단"
            detail={`식단 ${meal.slotCount}끼 / ${SCORE_RULE.mealTarget}끼`}
            points={score.mealRaw}
            max={SCORE_RULE.mealMax}
            barClass="bg-meal"
          />
        </ul>
        <p
          data-score-rounding-note=""
          className="mt-3 text-support leading-relaxed font-normal text-muted"
        >
          구성 점수는 소수 첫째 자리까지 보여 줘요. 총점은 두 원점수를 더한 뒤
          한 번 반올림해서, 표시된 구성 점수의 합과 조금 다를 수 있어요.
        </p>
      </section>

      <section aria-labelledby="score-days-title" className={wCard}>
        <h2 id="score-days-title" className={`${wSectionTitle} mb-3`}>
          요일별 기록
        </h2>
        <DayDots range={range} exercise={exercise} meal={meal} today={today} />
      </section>

      <section
        aria-labelledby="score-next-title"
        data-score-suggestion=""
        className={wCard}
      >
        <h2 id="score-next-title" className={wSectionTitle}>
          다음 주 한 가지 제안
        </h2>
        <p className="mt-2 text-body leading-relaxed font-normal text-content">
          {suggestionFor(score)}
        </p>
      </section>
    </>
  )
}
