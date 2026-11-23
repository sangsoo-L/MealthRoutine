import { useState, type KeyboardEvent } from 'react'
import { Link } from 'react-router'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { formatKcal, portionLabel } from '../../food/foodNutrition.ts'
import {
  PATH_MEAL_LIST,
  PATH_MEAL_RECORD,
  mealListPath,
  mealPreviousPath,
} from '../../food/foodPaths.ts'
import { dateText, mealKcalShare, recordKcal } from '../../food/mealHistory.ts'
import {
  MEAL_LABEL,
  MEAL_TYPES,
  groupByMeal,
  mealNutrition,
  type MealRecord,
  type MealType,
} from '../../food/mealModel.ts'
import {
  incompleteNotice,
  nutritionPieces,
  summarizeMeals,
  totalKcalText,
} from '../../food/mealView.ts'
import type { AllMealRecordsState } from '../../food/useAllMealRecords.ts'
import MacroShareBar from './MacroShareBar.tsx'
import {
  mealCard,
  mealChip,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  mealSectionTitle,
} from './foodStyles.ts'

/** 끼니별 열량 원형 그래프의 조각 색. 영양소 색 토큰이 승인 전이라 식단 토큰(meal)의 농도만 달리하고, 이름·kcal·%는 범례에 글자로 둔다. */
const MEAL_SLICE: Record<MealType, string> = {
  breakfast: 'stroke-meal/30',
  lunch: 'stroke-meal/60',
  dinner: 'stroke-meal',
}
const MEAL_DOT: Record<MealType, string> = {
  breakfast: 'bg-meal/30',
  lunch: 'bg-meal/60',
  dinner: 'bg-meal',
}

const pageLink = `flex min-h-13 min-w-0 flex-1 flex-col justify-center rounded-control border border-line bg-surface px-3 hover:bg-page ${mealFocusRing}`

/** 끼니별 열량 비율 원형 그래프(위에서 시계 방향). 보이는 값은 범례의 글자와 같다. */
export function MealKcalPie({
  share,
}: {
  share: NonNullable<ReturnType<typeof mealKcalShare>>
}) {
  // 각 조각이 시작하는 위치(앞 조각들의 % 합). 렌더 중 변수를 바꾸지 않고 미리 계산한다.
  const starts = share.items.map((_, index) =>
    share.items.slice(0, index).reduce((sum, item) => sum + item.percent, 0),
  )
  return (
    <div data-meal-pie className="flex items-center gap-4">
      <svg
        viewBox="0 0 36 36"
        role="img"
        aria-label={`끼니별 열량 비율 ${share.items.map((i) => `${MEAL_LABEL[i.meal]} ${i.percent}%`).join(', ')}`}
        className="size-28 shrink-0 -rotate-90"
      >
        <circle
          cx="18"
          cy="18"
          r="15.9155"
          fill="none"
          strokeWidth="6"
          className="stroke-line"
        />
        {share.items.map((item, index) =>
          item.percent > 0 ? (
            <circle
              key={item.meal}
              cx="18"
              cy="18"
              r="15.9155"
              fill="none"
              strokeWidth="6"
              pathLength={100}
              strokeDasharray={`${item.percent} ${100 - item.percent}`}
              strokeDashoffset={-starts[index]}
              className={MEAL_SLICE[item.meal]}
            />
          ) : null,
        )}
      </svg>
      <ul role="list" className="flex min-w-0 flex-1 flex-col gap-1.5">
        {share.items.map((item) => (
          <li
            key={item.meal}
            className="flex items-center justify-between gap-2 text-support leading-snug font-normal text-content"
          >
            <span className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${MEAL_DOT[item.meal]}`}
              />
              {MEAL_LABEL[item.meal]}
            </span>
            <span className="tabular-nums text-muted">
              {Math.round(item.kcal)}kcal ·{' '}
              <span className="font-semibold text-content">
                {item.percent}%
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 음식 카드 한 장(읽기 전용: 수정·삭제 없음). 이름·양·열량·탄단지(g)이며 값이 없는 영양소는 "정보 없음"이다. */
function FoodCard({ record }: { record: MealRecord }) {
  const kcal = recordKcal(record)
  const macros = nutritionPieces(mealNutrition(record)).slice(1)
  return (
    <li
      data-meal-record={record.id}
      className="rounded-card border border-line bg-surface py-3.5 px-4"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 text-body leading-snug font-semibold text-content">
          {record.foodName}
        </p>
        <p className="shrink-0 text-body leading-snug font-semibold tabular-nums text-content">
          {formatKcal(kcal) ?? '열량 정보 없음'}
        </p>
      </div>
      <p className="mt-0.5 text-support leading-snug font-normal text-muted">
        {portionLabel(record.portion, record.weightGrams)}
      </p>
      <p className="mt-1 text-support leading-relaxed font-normal tabular-nums text-muted">
        {macros.join(' · ')}
      </p>
    </li>
  )
}

/**
 * D03-1 이전 식단 상세 본문(읽기 전용). 이전·다음 기록 이동, 하루 영양 요약(그래프 2장: 탄단지 비율 / 끼니별 열량 비율), 끼니 버튼(고른 끼니만 표시),
 * 선택한 끼니의 음식 카드 순서다(화면명세 v5.0 D03-1). 영양값은 기록의 저장 당시 스냅샷으로 계산한다.
 * - 과거 기록의 수정·삭제 정책이 명세에 없어 읽기 전용이다. 목표가 없어 "목표 대비 %"는 보여 주지 않는다.
 * - 끼니는 주소(`?meal=`)에 두고 날짜를 옮겨도 유지한다(기본 아침). "이전"은 D03(고른 날짜 유지)으로 돌아간다.
 */
export default function MealPreviousView({
  date,
  state,
  records,
  meal,
  previous,
  next,
  onMealChange,
  onRetry,
}: {
  /** 보여 줄 날짜. 지난 기록이 하나도 없으면 null이다. */
  date: LocalDate | null
  state: AllMealRecordsState
  /** 이 날짜의 기록 */
  records: readonly MealRecord[]
  meal: MealType
  /** 이 날짜보다 앞·뒤에서 가장 가까운 지난 기록 날짜 */
  previous: LocalDate | null
  next: LocalDate | null
  onMealChange: (meal: MealType) => void
  onRetry: () => void
}) {
  const [slide, setSlide] = useState<0 | 1>(0)
  const grouped = groupByMeal(records)
  const summary = summarizeMeals(records)
  const mealShare = mealKcalShare(records)
  const fromList = date ? mealListPath(date) : PATH_MEAL_LIST
  const listHeader = (
    <header>
      <p className="mb-1">
        <span className={mealChip}>지난 식단</span>
      </p>
      <h1 className="text-app-title leading-snug font-semibold text-content">
        {date ? `${dateText(date)} 식단` : '이전 식단'}
      </h1>
      {date ? (
        <p className="mt-1 text-support leading-relaxed font-normal tabular-nums text-muted">
          {date}
        </p>
      ) : null}
    </header>
  )

  function handleMealKey(event: KeyboardEvent, index: number) {
    const step =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const target = (index + step + MEAL_TYPES.length) % MEAL_TYPES.length
    onMealChange(MEAL_TYPES[target])
    document.getElementById(`prev-meal-${MEAL_TYPES[target]}`)?.focus()
  }

  if (state.status !== 'ready') {
    return (
      <div className="flex flex-col gap-5 break-keep wrap-anywhere">
        {listHeader}
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
              기록 저장이 아직 연결되지 않았어요.
            </p>
          </div>
        ) : (
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
        )}
        <Link to={PATH_MEAL_LIST} className={mealSecondaryButton}>
          식단 리스트로
        </Link>
      </div>
    )
  }

  if (date === null) {
    return (
      <div className="flex flex-col gap-5 break-keep wrap-anywhere">
        {listHeader}
        <div role="status" className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            지난 기록이 없어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            어제까지 기록한 식단이 생기면 이곳에서 다시 볼 수 있어요.
          </p>
        </div>
        <Link
          to={PATH_MEAL_RECORD}
          state={{ from: PATH_MEAL_LIST }}
          className={mealPrimaryButton}
        >
          식단 기록하기
        </Link>
      </div>
    )
  }

  const mealRecords = grouped[meal]
  const mealSummary = summarizeMeals(mealRecords)
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      {listHeader}

      {previous || next ? (
        <nav aria-label="기록한 날 이동" className="flex gap-2">
          {previous ? (
            <Link
              to={mealPreviousPath(previous, meal)}
              replace
              state={{ from: mealListPath(previous) }}
              className={pageLink}
            >
              <span className="text-body leading-snug font-semibold text-content">
                <span aria-hidden="true">‹ </span>이전 기록
              </span>
              <span className="text-support leading-snug font-normal tabular-nums text-muted">
                {dateText(previous)}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
          {next ? (
            <Link
              to={mealPreviousPath(next, meal)}
              replace
              state={{ from: mealListPath(next) }}
              className={`${pageLink} items-end text-right`}
            >
              <span className="text-body leading-snug font-semibold text-content">
                다음 기록<span aria-hidden="true"> ›</span>
              </span>
              <span className="text-support leading-snug font-normal tabular-nums text-muted">
                {dateText(next)}
              </span>
            </Link>
          ) : (
            <span className="flex-1" />
          )}
        </nav>
      ) : null}

      {records.length === 0 ? (
        <>
          <div role="status" className={mealCard}>
            <p className="text-body leading-snug font-semibold text-content">
              이 날은 기록한 식단이 없어요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              다른 날짜로 이동하거나 식단 리스트에서 날짜를 골라 주세요.
            </p>
          </div>
          <Link to={fromList} className={mealSecondaryButton}>
            식단 리스트로
          </Link>
        </>
      ) : (
        <>
          <section aria-labelledby="prev-summary-title" className={mealCard}>
            <h2 id="prev-summary-title" className={mealSectionTitle}>
              하루 영양 요약
            </h2>
            <p
              data-day-kcal
              className="mt-2 text-metric leading-none font-semibold tabular-nums text-content"
            >
              {totalKcalText(summary.totals)}
            </p>
            {incompleteNotice(summary.totals) ? (
              <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                {incompleteNotice(summary.totals)}
              </p>
            ) : null}
            <div className="mt-4" data-slide={slide}>
              {slide === 0 ? (
                summary.share ? (
                  <MacroShareBar share={summary.share} />
                ) : (
                  <p className="text-support leading-relaxed font-normal text-muted">
                    탄수화물·단백질·지방 정보가 모두 있는 기록이 없어 비율은
                    보여 드리지 않아요.
                  </p>
                )
              ) : mealShare ? (
                <MealKcalPie share={mealShare} />
              ) : (
                <p className="text-support leading-relaxed font-normal text-muted">
                  열량 정보가 있는 끼니가 없어 끼니별 비율은 보여 드리지 않아요.
                </p>
              )}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <button
                type="button"
                aria-label="이전 그래프"
                onClick={() => setSlide(0)}
                aria-disabled={slide === 0 || undefined}
                className={`min-w-11 px-3 ${mealSecondaryButton}`}
              >
                <span aria-hidden="true">‹</span>
              </button>
              <p
                role="status"
                className="flex items-center gap-2 text-support font-normal text-muted"
              >
                <span aria-hidden="true" className="flex gap-1.5">
                  {[0, 1].map((i) => (
                    <span
                      key={i}
                      className={`size-2 rounded-full ${slide === i ? 'bg-meal' : 'bg-line'}`}
                    />
                  ))}
                </span>
                {slide === 0 ? '탄수화물·단백질·지방 비율' : '끼니별 열량 비율'}
                <span className="sr-only"> ({slide + 1}/2)</span>
              </p>
              <button
                type="button"
                aria-label="다음 그래프"
                onClick={() => setSlide(1)}
                aria-disabled={slide === 1 || undefined}
                className={`min-w-11 px-3 ${mealSecondaryButton}`}
              >
                <span aria-hidden="true">›</span>
              </button>
            </div>
          </section>

          <section
            aria-labelledby="prev-meals-title"
            className="flex flex-col gap-3"
          >
            <h2 id="prev-meals-title" className="sr-only">
              끼니별 식단
            </h2>
            <div
              role="radiogroup"
              aria-label="끼니"
              className="grid grid-cols-3 gap-1 rounded-card border border-line bg-page p-1"
            >
              {MEAL_TYPES.map((type, index) => {
                const chosen = type === meal
                const kcal = summarizeMeals(grouped[type]).totals.kcal
                return (
                  <button
                    key={type}
                    id={`prev-meal-${type}`}
                    type="button"
                    role="radio"
                    aria-checked={chosen}
                    tabIndex={chosen ? 0 : -1}
                    onClick={() => onMealChange(type)}
                    onKeyDown={(event) => handleMealKey(event, index)}
                    className={`flex min-h-12 cursor-pointer flex-col items-center justify-center rounded-control px-1 ${mealFocusRing} ${
                      chosen
                        ? 'bg-surface font-semibold text-meal'
                        : 'font-normal text-muted hover:text-content'
                    }`}
                  >
                    <span className="text-support leading-snug">
                      {MEAL_LABEL[type]}
                    </span>
                    <span className="text-support leading-snug tabular-nums">
                      {grouped[type].length === 0
                        ? '–'
                        : (formatKcal(kcal) ?? '미산정')}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-baseline justify-between gap-2">
              <h3 className={mealSectionTitle}>{MEAL_LABEL[meal]}</h3>
              <p className="text-support leading-snug font-normal tabular-nums text-muted">
                음식 {mealRecords.length}개
                {mealRecords.length > 0
                  ? ` · ${totalKcalText(mealSummary.totals)}`
                  : ''}
              </p>
            </div>
            {mealRecords.length === 0 ? (
              <p
                role="status"
                className={`${mealCard} text-body font-normal text-muted`}
              >
                이 끼니는 기록하지 않았어요.
              </p>
            ) : (
              <ul role="list" className="flex flex-col gap-2">
                {mealRecords.map((record) => (
                  <FoodCard key={record.id} record={record} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}
