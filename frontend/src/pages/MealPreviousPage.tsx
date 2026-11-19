import { useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import MealPreviousView from '../components/food/MealPreviousView.tsx'
import { mealCard, mealSecondaryButton } from '../components/food/foodStyles.ts'
import { isLocalDate, toLocalDate } from '../exercise/workoutModel.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import { PATH_MEAL_LIST } from '../food/foodPaths.ts'
import {
  adjacentDates,
  groupRecordsByDate,
  pastRecordedDates,
} from '../food/mealHistory.ts'
import { mealTypeFromParam, type MealType } from '../food/mealModel.ts'
import { useAllMealRecords } from '../food/useAllMealRecords.ts'

/**
 * D03-1 이전 식단 상세(`/records/meal/previous/:date?`, 회원 전용, 읽기 전용). 날짜가 없으면 가장 최근 지난 기록을 연다.
 * 지난 날짜(오늘보다 앞)만 보여 준다. 올바르지 않은 날짜나 오늘·미래 날짜는 안내하고 D03으로 보낸다.
 * 끼니는 `?meal=`에 둔다(기본 아침). 이전·다음 기록은 기록한 지난 날짜 사이를 옮긴다.
 */
export default function MealPreviousPage() {
  const { user } = useAuth()
  const location = useLocation()
  const { date: dateParam } = useParams()
  const [params, setParams] = useSearchParams()
  const [today] = useState<LocalDate>(() => toLocalDate(new Date()))
  const { state, reload } = useAllMealRecords(user?.id ?? null)
  const meal: MealType =
    mealTypeFromParam(params.get('meal') ?? undefined) ?? 'breakfast'
  const byDate = useMemo(
    () => groupRecordsByDate(state.status === 'ready' ? state.records : []),
    [state],
  )
  const past = useMemo(() => pastRecordedDates(byDate, today), [byDate, today])

  if (
    dateParam !== undefined &&
    !(isLocalDate(dateParam) && dateParam < today)
  ) {
    return (
      <div className="flex flex-col gap-5 break-keep wrap-anywhere">
        <h1 className="text-app-title leading-snug font-semibold text-content">
          이전 식단
        </h1>
        <div role="status" className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            지난 날짜의 식단만 볼 수 있어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            주소의 날짜가 올바르지 않거나 오늘 이후예요. 식단 리스트에서 날짜를
            골라 주세요.
          </p>
        </div>
        <Link to={PATH_MEAL_LIST} className={mealSecondaryButton}>
          식단 리스트로
        </Link>
      </div>
    )
  }

  const date: LocalDate | null = dateParam ?? past.at(-1) ?? null
  const { previous, next } = date
    ? adjacentDates(past, date)
    : { previous: null, next: null }

  return (
    <MealPreviousView
      date={date}
      state={state}
      records={date ? (byDate.get(date) ?? []) : []}
      meal={meal}
      previous={previous}
      next={next}
      onMealChange={(next) =>
        setParams(next === 'breakfast' ? {} : { meal: next }, {
          replace: true,
          state: location.state,
        })
      }
      onRetry={reload}
    />
  )
}
