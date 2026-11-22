import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router'
import {
  MEAL_LABEL,
  MEAL_TYPES,
  groupByMeal,
  type MealRecord,
  type MealType,
} from '../../food/mealModel.ts'
import {
  foodSummary,
  incompleteNotice,
  summarizeMeals,
  totalKcalText,
} from '../../food/mealView.ts'
import {
  PATH_MEAL,
  PATH_MEAL_LIST,
  PATH_MEAL_PLAN,
  PATH_MEAL_RECORD,
  mealDetailPath,
  recordMealPath,
} from '../../food/foodPaths.ts'
import {
  formatKcal,
  formatMacro,
  type MacroShare,
  type NutritionTotals,
} from '../../food/foodNutrition.ts'
import { PATH_WEEKLY_REPORT } from '../../ai/aiPaths.ts'
import type { MealGoalState } from '../../meal-goal/mealGoalTypes.ts'
import MealGoalRow from '../meal/goal/MealGoalRow.tsx'
import { addDays } from '../../food/mealHistory.ts'
import type { MealPlansState } from '../../food/useMealPlans.ts'
import type { MealRecordsState } from '../../food/useMealRecords.ts'
import Icon from '../icons/Icon.tsx'
import RecordsDashboardHeader from '../records/RecordsDashboardHeader.tsx'
import { formatRecordsDate } from '../records/recordsDate.ts'
import {
  mealCard,
  mealChip,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  mealSectionTitle,
} from './foodStyles.ts'

/**
 * 카드 안에 꽉 차는 행 링크의 포커스 윤곽선. 카드가 모서리를 위해 overflow-hidden이라 바깥 윤곽선은 잘리므로 안쪽에 그린다(BottomNav와 같은 방식).
 */
const insetFocusRing =
  'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-meal'

/** 운동/식단 대시보드 전환(식단이 선택된 상태). 운동 쪽 ExerciseMealSwitch와 같은 모양이다. */
function MealExerciseSwitch() {
  return (
    <nav
      aria-label="운동·식단 대시보드 전환"
      className="grid grid-cols-2 gap-1 rounded-card border border-line bg-surface p-1"
    >
      <Link
        to="/records/exercise"
        className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control px-4 text-body font-normal text-muted transition-colors hover:bg-page hover:text-content motion-reduce:transition-none ${mealFocusRing}`}
      >
        <Icon name="dumbbell" size={20} />
        운동<span className="sr-only"> 대시보드</span>
      </Link>
      <Link
        to="/records/meal"
        aria-current="page"
        className={`flex min-h-11 min-w-0 items-center justify-center gap-2 rounded-control bg-meal px-4 text-body font-semibold text-surface ${mealFocusRing}`}
      >
        <Icon name="utensils" size={20} />
        <span>식단</span>
        <span className="sr-only"> 대시보드</span>
      </Link>
    </nav>
  )
}

/** 다시 시도: 버튼이 상태 변화로 사라져도 포커스가 문서 처음으로 빠지지 않게, 먼저 감싼 영역(tabIndex=-1)으로 포커스를 옮긴다. */
function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={(event: MouseEvent<HTMLButtonElement>) => {
        event.currentTarget.closest<HTMLElement>('[data-retry-focus]')?.focus()
        onRetry()
      }}
      className={`mt-3 w-full ${mealSecondaryButton}`}
    >
      다시 시도
    </button>
  )
}

/** 대시보드 영역 하나의 틀. 제목(h2)과 연결되고, 다시 시도 후 포커스를 받을 수 있다(눈에 보이는 윤곽선은 키보드 포커스일 때만). */
function DashboardArea({
  labelId,
  className = '',
  children,
}: {
  labelId: string
  className?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={labelId}
      tabIndex={-1}
      data-retry-focus=""
      className={`min-w-0 rounded-card ${mealFocusRing} ${className}`}
    >
      {children}
    </section>
  )
}

function PendingBadge() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-meal-soft px-2.5 py-1 text-support leading-none font-normal text-meal">
      준비 중
    </span>
  )
}

/** 아직 연결되지 않은 관리 항목(이동하지 않는 정적 안내). */
function Pending({ title, children }: { title: string; children: string }) {
  return (
    <div role="group" aria-label={title} className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body leading-snug font-semibold text-content">
            {title}
          </p>
          <p className="mt-0.5 text-support leading-relaxed font-normal text-muted">
            {children}
          </p>
        </div>
        <PendingBadge />
      </div>
    </div>
  )
}

/** 이동할 화면이 하나뿐인 관리 행. 행 전체가 하나의 링크이고 오른쪽에 이동 글자와 화살표를 둔다(안에 다른 링크·버튼이 없다). */
function LinkRow({
  title,
  description,
  to,
  linkLabel,
}: {
  title: string
  description: string
  to: string
  linkLabel: string
}) {
  return (
    <div role="group" aria-label={title}>
      <Link
        to={to}
        state={{ from: PATH_MEAL }}
        className={`flex min-h-11 items-center justify-between gap-3 p-4 hover:bg-page ${insetFocusRing}`}
      >
        <span className="min-w-0">
          <span className="block text-body leading-snug font-semibold text-content">
            {title}
          </span>
          <span className="mt-0.5 block text-support leading-relaxed font-normal tabular-nums text-muted">
            {description}
          </span>
        </span>
        <span className="flex shrink-0 items-center gap-1 text-support font-semibold text-meal">
          {linkLabel}
          <Icon name="chevron-right" size={18} />
        </span>
      </Link>
    </div>
  )
}

/** 끼니를 기록한 수(아침·점심·저녁 3끼 기준). 같은 끼니의 여러 기록은 한 끼로 센다. */
function recordedMealCount(grouped: Record<MealType, readonly unknown[]>) {
  return MEAL_TYPES.filter((meal) => grouped[meal].length > 0).length
}

const MEAL_TOTAL = MEAL_TYPES.length

/**
 * 3끼 기록 현황 원형 게이지. 목표가 아니라 실제로 기록한 끼니 수(0~3)만 보여 주며 목표 수치를 만들지 않는다.
 * 숫자와 보조기기용 문장을 함께 둔다.
 */
function MealGauge({ done }: { done: number }) {
  const radius = 22
  const circumference = 2 * Math.PI * radius
  return (
    <div
      role="img"
      aria-label={`${MEAL_TOTAL}끼 중 ${done}끼 기록`}
      data-meal-gauge={done}
      className="relative size-16 shrink-0"
    >
      <svg
        viewBox="0 0 56 56"
        className="size-full -rotate-90"
        aria-hidden="true"
      >
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-line"
        />
        <circle
          cx="28"
          cy="28"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - done / MEAL_TOTAL)}
          className="stroke-meal"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute inset-0 flex flex-col items-center justify-center text-support leading-none font-semibold tabular-nums text-content"
      >
        {done}/{MEAL_TOTAL}
        <span className="mt-0.5 font-normal text-muted">끼</span>
      </span>
    </div>
  )
}

const MACRO_ROWS = [
  { key: 'carb', label: '탄수화물', bar: 'bg-meal' },
  { key: 'protein', label: '단백질', bar: 'bg-brand' },
  { key: 'fat', label: '지방', bar: 'bg-warning' },
] as const

/**
 * 탄수화물·단백질·지방 진행 막대. 막대 길이는 세 영양소의 열량 비율(%)이며 목표 대비가 아니다(목표가 없어 달성률·남은 양을 만들지 않는다).
 * 영양값이 없으면 막대는 비우고 "정보 없음"으로 적는다.
 */
function MacroBars({
  totals,
  share,
}: {
  totals: NutritionTotals
  share: MacroShare | null
}) {
  const percent = share
    ? {
        carb: share.carbPercent,
        protein: share.proteinPercent,
        fat: share.fatPercent,
      }
    : null
  return (
    <div data-macro-bars>
      <ul role="list" className="flex flex-col gap-3">
        {MACRO_ROWS.map((row) => {
          const grams = formatMacro(totals[row.key])
          const value = percent ? percent[row.key] : null
          return (
            <li key={row.key}>
              <div className="flex items-baseline justify-between gap-3 text-support leading-snug">
                <span className="flex items-center gap-2 font-normal text-content">
                  <span
                    aria-hidden="true"
                    className={`size-2.5 rounded-full ${row.bar}`}
                  />
                  {row.label}
                </span>
                <span className="tabular-nums text-muted">
                  <span className="text-body font-semibold text-content">
                    {grams ?? '정보 없음'}
                  </span>
                  {value !== null ? ` · ${value}%` : ''}
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${row.label} 열량 비율`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value ?? undefined}
                aria-valuetext={value !== null ? `${value}%` : '정보 없음'}
                className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-line"
              >
                <div
                  className={`h-full rounded-full ${row.bar}`}
                  style={{ width: `${value ?? 0}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-support leading-relaxed font-normal text-muted">
        막대는 탄수화물·단백질·지방의 열량 비율이에요. 목표와 비교하지 않아요.
      </p>
    </div>
  )
}

/** 오늘 섭취(실제 기록 합계). 불러오는 중·오류·준비 중·기록 없음·기록 있음·일부 누락을 서로 다른 문장으로 구분하고, 확인 전 값을 0이나 기록 없음으로 보이지 않는다. */
function IntakeSection({
  records,
  onRetry,
}: {
  records: MealRecordsState
  onRetry: () => void
}) {
  const list = records.status === 'ready' ? records.records : []
  const summary = summarizeMeals(list)
  const t = summary.totals
  const recorded = list.length > 0
  return (
    <DashboardArea labelId="meal-today-total" className={mealCard}>
      <div className="flex items-start justify-between gap-3">
        <h2 id="meal-today-total" className={mealSectionTitle}>
          오늘 섭취
        </h2>
        {records.status === 'ready' ? (
          <span className={mealChip}>
            {recorded ? '오늘 기록함' : '아직 기록 없음'}
          </span>
        ) : null}
      </div>
      {records.status === 'loading' ? (
        <p
          role="status"
          className="mt-2 text-body leading-relaxed font-normal text-muted"
        >
          오늘 기록을 불러오는 중이에요…
        </p>
      ) : records.status === 'unavailable' ? (
        <>
          <p className="mt-2 text-body leading-snug font-semibold text-content">
            식단 기록을 준비 중이에요
          </p>
          <p className="mt-1 text-body leading-relaxed font-normal text-muted">
            기록 저장이 아직 연결되지 않아 오늘의 식단을 보여 드릴 수 없어요.
          </p>
        </>
      ) : records.status === 'error' ? (
        <div role="alert">
          <p className="mt-2 text-body leading-snug font-semibold text-content">
            오늘 기록을 불러오지 못했어요
          </p>
          <p className="mt-1 text-body leading-relaxed font-normal text-muted">
            기록은 지우지 않았어요. 잠시 후 다시 시도해 주세요.
          </p>
          <RetryButton onRetry={onRetry} />
        </div>
      ) : recorded ? (
        <>
          <div className="mt-2 flex items-center justify-between gap-3">
            <p
              data-today-kcal
              className="text-metric leading-none font-semibold tabular-nums text-content"
            >
              {totalKcalText(t)}
            </p>
            <MealGauge done={recordedMealCount(groupByMeal(list))} />
          </div>
          <div className="mt-4">
            <MacroBars totals={t} share={summary.share} />
          </div>
          {incompleteNotice(t) ? (
            <p className="mt-2 text-support leading-relaxed font-normal text-muted">
              {incompleteNotice(t)}
            </p>
          ) : null}
        </>
      ) : (
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          한 끼부터 기록해 보세요. 오늘 먹은 음식을 기록하면 열량과 영양 합계를
          보여 드려요.
        </p>
      )}
      {records.status === 'ready' && records.skippedCount > 0 ? (
        <p className="mt-3 rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning">
          읽을 수 없는 기록 {records.skippedCount}개가 있어 합계와 끼니에서
          제외했어요. 읽을 수 있는 기록만 보여 드려요.
        </p>
      ) : null}
      {records.status !== 'unavailable' ? (
        <Link
          to={PATH_WEEKLY_REPORT}
          state={{ from: PATH_MEAL }}
          className={`mt-3 -mb-1 flex min-h-11 items-center justify-between gap-2 border-t border-line pt-3 text-support font-semibold text-meal ${mealFocusRing}`}
        >
          주간 리포트 보기
          <Icon name="chevron-right" size={18} />
        </Link>
      ) : null}
    </DashboardArea>
  )
}

/** 끼니 카드의 아이콘 칸. 기록 완료는 채운 완료 아이콘, 그 밖에는 연한 식사 아이콘이다(색만으로 알리지 않고 글자도 함께 둔다). */
function MealIcon({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`flex size-9 shrink-0 items-center justify-center rounded-full ${done ? 'bg-meal text-surface' : 'bg-meal-soft text-meal'}`}
    >
      <Icon name={done ? 'clipboard-check' : 'utensils'} size={20} />
    </span>
  )
}

const MEAL_CARD_BASE =
  'flex h-full min-h-28 flex-col items-center gap-1 rounded-card border border-line bg-surface p-3 text-center'

/** 상태를 확인하기 전(불러오는 중·오류·준비 중)의 끼니 칸. 이동하지 않고, "아직 기록하지 않았어요"로 단정하지 않는다. */
function UnknownMealCard({ meal, text }: { meal: MealType; text: string }) {
  return (
    <li data-meal-card={meal} className="min-w-0">
      <div className={MEAL_CARD_BASE}>
        <MealIcon done={false} />
        <span className="text-body leading-snug font-semibold text-content">
          {MEAL_LABEL[meal]}
        </span>
        <span className="text-support leading-snug font-normal break-keep text-muted">
          {text}
        </span>
        <span
          aria-hidden="true"
          className="mt-auto text-body leading-snug font-semibold text-muted"
        >
          –
        </span>
      </div>
    </li>
  )
}

/**
 * 끼니 카드(아침·점심·저녁 가로 3개). 기록이 있으면 끼니 상세(D01-1~3)로, 실제로 확인된 빈 끼니는 그 끼니가 골라진 식단 기록(D02)으로 바로 이동한다.
 * 같은 끼니의 여러 기록은 열량을 합산해 보인다. D02의 "이전"·하단 버튼은 식단 대시보드로 돌아온다(state.from).
 */
function MealCard({
  meal,
  records,
}: {
  meal: MealType
  records: readonly MealRecord[]
}) {
  const label = MEAL_LABEL[meal]
  if (records.length === 0) {
    return (
      <li data-meal-card={meal} className="min-w-0">
        <Link
          to={recordMealPath({ meal })}
          state={{ from: PATH_MEAL }}
          aria-label={`${label} 기록하기 (아직 기록하지 않았어요)`}
          className={`${MEAL_CARD_BASE} hover:border-meal/40 ${mealFocusRing}`}
        >
          <MealIcon done={false} />
          <span className="text-body leading-snug font-semibold text-content">
            {label}
          </span>
          <span className="sr-only">아직 기록하지 않았어요</span>
          <span
            aria-hidden="true"
            className="text-support leading-snug font-normal text-muted"
          >
            미기록
          </span>
          <span
            aria-hidden="true"
            className="mt-auto flex items-center gap-0.5 text-support font-semibold text-meal"
          >
            기록 추가
            <Icon name="chevron-right" size={18} />
          </span>
        </Link>
      </li>
    )
  }
  const summary = summarizeMeals(records)
  return (
    <li data-meal-card={meal} className="min-w-0">
      <Link
        to={mealDetailPath(meal)}
        className={`${MEAL_CARD_BASE} hover:border-meal/40 ${mealFocusRing}`}
      >
        <MealIcon done />
        <span className="text-body leading-snug font-semibold text-content">
          {label}
        </span>
        <span className="text-support leading-snug font-semibold text-meal">
          기록함
        </span>
        <span className="line-clamp-1 w-full text-support leading-snug font-normal break-all text-muted">
          {foodSummary(records)}
        </span>
        <span className="mt-auto text-body leading-snug font-semibold tabular-nums text-content">
          {totalKcalText(summary.totals)}
        </span>
      </Link>
    </li>
  )
}

function MealCardsSection({ records }: { records: MealRecordsState }) {
  const grouped = groupByMeal(records.status === 'ready' ? records.records : [])
  // 확인 전 상태의 칸 문구(오류의 다시 시도는 위 오늘 섭취 영역에 한 번만 둔다).
  const unknownText =
    records.status === 'loading'
      ? '확인하는 중이에요'
      : records.status === 'error'
        ? '불러오지 못했어요'
        : '기록 연결 전이에요'
  return (
    <section aria-labelledby="meal-cards-title" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="meal-cards-title" className={mealSectionTitle}>
          끼니별 식단
        </h2>
        {records.status === 'ready' ? (
          <span className="text-support font-normal tabular-nums text-muted">
            {MEAL_TOTAL}끼 중 {recordedMealCount(grouped)}끼 기록
          </span>
        ) : null}
      </div>
      <ul
        role="list"
        className="grid grid-cols-[repeat(auto-fit,minmax(5.5rem,1fr))] gap-2"
      >
        {MEAL_TYPES.map((meal) =>
          records.status === 'ready' ? (
            <MealCard key={meal} meal={meal} records={grouped[meal]} />
          ) : (
            <UnknownMealCard key={meal} meal={meal} text={unknownText} />
          ),
        )}
      </ul>
      {records.status === 'error' ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          끼니별 기록을 확인하지 못했어요. 위의 다시 시도로 다시 불러올 수
          있어요.
        </p>
      ) : null}
      {records.status === 'ready' && records.skippedCount > 0 ? (
        <p className="text-support leading-relaxed font-normal text-muted">
          읽을 수 없는 기록 {records.skippedCount}개를 제외했어요.
        </p>
      ) : null}
    </section>
  )
}

/** 내일 계획의 개수·예상 열량. 확인한 계획으로만 만들고, 열량 정보가 없으면 0으로 대신하지 않고 "미산정"이라고 적는다. */
function planSummaryText(plans: Extract<MealPlansState, { status: 'ready' }>) {
  const totals = summarizeMeals(plans.records).totals
  const kcal = formatKcal(totals.kcal)
  return `계획 ${plans.records.length}개 · ${kcal !== null ? `예상 ${kcal}` : '예상 열량 미산정'}`
}

/**
 * 다음 식사 준비의 내일 식단 계획 카드(D02-1). 계획 확인 중·조회 실패(계획 전용 다시 시도)·준비 중·계획 없음·계획 있음을 따로 보여 준다.
 * 계획은 실제 섭취가 아니며 오늘 섭취 합계에 더하지 않는다. 계획만 실패해도 위의 오늘 섭취는 그대로다.
 */
function PlanCard({
  plans,
  planDate,
  onRetry,
}: {
  plans: MealPlansState
  planDate: string
  onRetry: () => void
}) {
  const dateText = formatRecordsDate(planDate)
  if (plans.status === 'unavailable') {
    return (
      <div data-meal-plan="unavailable">
        <Pending title="내일 식단 계획">
          내일 먹을 음식을 미리 계획하는 기능은 준비 중이에요.
        </Pending>
      </div>
    )
  }
  if (plans.status === 'loading') {
    return (
      <div
        data-meal-plan="loading"
        role="group"
        aria-label="내일 식단 계획"
        className="p-4"
      >
        <p className="text-body leading-snug font-semibold text-content">
          내일 식단 계획
        </p>
        <p
          role="status"
          className="mt-0.5 text-support leading-relaxed font-normal text-muted"
        >
          내일 계획을 확인하는 중이에요…
        </p>
      </div>
    )
  }
  if (plans.status === 'error') {
    return (
      <div
        data-meal-plan="error"
        role="group"
        aria-label="내일 식단 계획"
        className="p-4"
      >
        <div role="alert">
          <p className="text-body leading-snug font-semibold text-content">
            내일 계획을 불러오지 못했어요
          </p>
          <p className="mt-0.5 text-support leading-relaxed font-normal text-muted">
            오늘 섭취 기록에는 영향이 없어요. 잠시 후 다시 시도해 주세요.
          </p>
        </div>
        <RetryButton onRetry={onRetry} />
      </div>
    )
  }
  const has = plans.records.length > 0
  const totals = summarizeMeals(plans.records).totals
  return (
    <div data-meal-plan={has ? 'filled' : 'empty'}>
      <div role="group" aria-label="내일 식단 계획">
        <Link
          to={PATH_MEAL_PLAN}
          state={{ from: PATH_MEAL }}
          className={`flex min-h-11 items-center justify-between gap-3 p-4 hover:bg-page ${insetFocusRing}`}
        >
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-body leading-snug font-semibold text-content">
                내일 식단 계획
              </span>
              <span className={mealChip}>실제 섭취 아님</span>
            </span>
            <span className="mt-1 block text-support leading-relaxed font-normal tabular-nums text-muted">
              <time dateTime={planDate}>{dateText}</time> ·{' '}
              {has ? planSummaryText(plans) : '아직 계획한 음식이 없어요'}
            </span>
            {/* 아침·점심·저녁 3끼 기준 계획 상태(글자와 기호로 알린다). 실제 섭취가 아니다. */}
            <span
              data-plan-meals
              className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-support leading-snug"
            >
              {MEAL_TYPES.map((meal) => {
                const planned = plans.records.some((r) => r.mealType === meal)
                return (
                  <span
                    key={meal}
                    data-plan-meal={meal}
                    className={`inline-flex items-center gap-1 ${planned ? 'font-semibold text-meal' : 'font-normal text-muted'}`}
                  >
                    <span aria-hidden="true">{planned ? '✓' : '–'}</span>
                    {MEAL_LABEL[meal]} {planned ? '계획함' : '미계획'}
                  </span>
                )
              })}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-1 text-support font-semibold text-meal">
            {has ? '계획 보기' : '내일 계획하기'}
            <Icon name="chevron-right" size={18} />
          </span>
        </Link>
      </div>
      {has && totals.kcalIncomplete ? (
        <p className="px-4 pb-3 text-support leading-relaxed font-normal text-muted">
          열량 정보가 없는 계획은 예상 열량에서 빠졌어요.
        </p>
      ) : null}
      {plans.skippedCount > 0 ? (
        <p className="px-4 pb-3 text-support leading-relaxed font-normal text-muted">
          읽을 수 없는 계획 {plans.skippedCount}개를 제외했어요.
        </p>
      ) : null}
    </div>
  )
}

/**
 * D01 식단 기록 대시보드 본문. 운동/식단 전환과 제목·날짜, 오늘 실제 섭취(열량·탄단지) → 식단 기록하기(D02) → 끼니별 식단(D01-1~3, 빈 끼니는 D02)
 * → 다음 식사 준비(내일 식단 계획 D02-1) → 식단 관리(목표 준비 중·내 식단 리스트·즐겨찾는 음식) 순서다.
 * 합계는 영양값이 있는 기록만 더하고, 비어 있는 기록이 있으면 불완전하다고 알린다. 목표 열량·남은 열량·달성률은 식단 목표(D01-4)가 없어 만들지 않으며,
 * 준비 중 안내는 식단 관리 한 곳에만 둔다.
 * 개발 서버에서 쓰는 기록은 이 브라우저에만 있는 개발용 로컬 데이터다(운영 빌드는 저장소가 없어 준비 중 안내).
 *
 * 다른 페이지와 같은 앱 폭과 한 열 배치를 사용한다. 오늘 섭취·기록하기·끼니별 뒤에 계획·관리를 둔다.
 */
export default function MealDashboardView({
  localDate,
  records,
  recordedDays,
  plans,
  onRetry,
  onRetryPlans,
  goal,
}: {
  localDate: string
  /** 오늘의 기록 */
  records: MealRecordsState
  /** 기록한 날 수(모든 날짜). 아직 읽지 못했으면 null이다. */
  recordedDays: number | null
  /** 내일 식단 계획(계획 전용 저장소). 오늘 섭취 합계와 별개이며 어떤 합계에도 더하지 않는다. */
  plans: MealPlansState
  onRetry: () => void
  /** 내일 계획만 다시 읽는다(오늘 섭취는 그대로). */
  onRetryPlans: () => void
  /**
   * 식단 목표 조회 상태(D01-4). 없으면(개발용 예시 등) 식단 목표는 기존처럼 준비 중 안내다.
   * 목표 조회 실패·저장 수단 없음은 "목표 없음"이 아니다.
   */
  goal?: { state: MealGoalState; onRetry: () => void }
}) {
  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <RecordsDashboardHeader title="식단 기록" today={localDate}>
        <MealExerciseSwitch />
      </RecordsDashboardHeader>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-6">
          <IntakeSection records={records} onRetry={onRetry} />

          {/* 새 기록은 조회 상태와 별개로 할 수 있다(불러오는 중·오류여도 막지 않는다). */}
          <Link
            to={PATH_MEAL_RECORD}
            state={{ from: PATH_MEAL }}
            className={mealPrimaryButton}
          >
            식단 기록하기
          </Link>

          <MealCardsSection records={records} />
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <DashboardArea
            labelId="meal-next-title"
            className="overflow-hidden border border-line bg-surface"
          >
            <h2
              id="meal-next-title"
              className={`${mealSectionTitle} px-4 pt-4`}
            >
              다음 식사 준비
            </h2>
            <PlanCard
              plans={plans}
              planDate={addDays(localDate, 1)}
              onRetry={onRetryPlans}
            />
          </DashboardArea>

          <section
            aria-labelledby="meal-manage-title"
            className="overflow-hidden rounded-card border border-line bg-surface"
          >
            <h2
              id="meal-manage-title"
              className={`${mealSectionTitle} px-4 pt-4`}
            >
              식단 관리
            </h2>
            <div className="divide-y divide-line">
              {goal ? (
                <MealGoalRow state={goal.state} onRetry={goal.onRetry} />
              ) : (
                <Pending title="식단 목표">
                  목표 설정은 준비 중이에요. 목표가 없어 남은 열량·달성률은 보여
                  드리지 않아요.
                </Pending>
              )}
              <LinkRow
                title="내 식단 리스트"
                description={
                  recordedDays === null
                    ? '날짜별로 기록한 식단을 다시 볼 수 있어요.'
                    : `기록한 날 ${recordedDays}일`
                }
                to={PATH_MEAL_LIST}
                linkLabel="식단 리스트 보기"
              />
              <LinkRow
                title="즐겨찾는 음식"
                description="즐겨찾기한 음식을 보고 바로 기록할 수 있어요."
                to="/favorites?tab=food"
                linkLabel="즐겨찾기 보기"
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
