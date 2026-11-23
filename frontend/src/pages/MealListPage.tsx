import { useMemo, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import MealListView from '../components/food/MealListView.tsx'
import { toLocalDate } from '../exercise/workoutModel.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import {
  clampToToday,
  groupRecordsByDate,
  shiftWeek,
} from '../food/mealHistory.ts'
import { useAllMealRecords } from '../food/useAllMealRecords.ts'

/**
 * D03 식단 리스트(`/records/meal/list`, 회원 전용). 기존 식단 기록(mealRecords)을 날짜별로 묶어 보여 준다.
 * 선택한 날짜는 주소(`?date=`)에 둬서 D03-1에서 돌아와도 같은 날짜가 선택된다. 처음 열면(날짜 없음) 오늘이다.
 * 올바르지 않거나 미래인 날짜는 오늘로 본다(미래 날짜는 고를 수 없다).
 */
export default function MealListPage() {
  const { user } = useAuth()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const [today] = useState<LocalDate>(() => toLocalDate(new Date()))
  const { state, reload } = useAllMealRecords(user?.id ?? null)
  const selected = clampToToday(params.get('date'), today)
  const byDate = useMemo(
    () => groupRecordsByDate(state.status === 'ready' ? state.records : []),
    [state],
  )

  function select(date: LocalDate) {
    setParams(date === today ? {} : { date }, {
      replace: true,
      state: location.state,
    })
  }

  return (
    <MealListView
      today={today}
      selected={selected}
      state={state}
      byDate={byDate}
      onSelect={select}
      onShiftWeek={(weeks) => select(shiftWeek(selected, weeks, today))}
      onRetry={reload}
    />
  )
}
