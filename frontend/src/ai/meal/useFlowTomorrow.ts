import { useEffect } from 'react'
import { tomorrowOf } from '../../exercise/workoutPlanModel.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { useLocalToday } from '../../exercise/useLocalToday.ts'
import { useMealPlanFlow } from './mealPlanFlowContext.ts'

/**
 * 이 기기의 "내일" 날짜(기기 로컬 날짜, 서버 날짜 기준은 미확정). 자정을 넘기면 갱신된다.
 * 선택해 둔 날짜와 달라지면 흐름이 선택을 비우도록 Provider에 알려, 끼니 선택·추천 요청의 날짜가 어긋나지 않게 한다.
 */
export function useFlowTomorrow(): LocalDate {
  const { syncDate } = useMealPlanFlow()
  const tomorrow = tomorrowOf(useLocalToday())
  useEffect(() => {
    syncDate(tomorrow)
  }, [tomorrow, syncDate])
  return tomorrow
}
