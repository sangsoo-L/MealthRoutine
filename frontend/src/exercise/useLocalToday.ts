import { useEffect, useState } from 'react'
import { toLocalDate } from './workoutModel.ts'
import type { LocalDate } from './workoutTypes.ts'

/**
 * 이 기기의 오늘 날짜(로컬, YYYY-MM-DD). 자정을 넘기거나 탭·창으로 돌아오면 갱신한다(60초마다, 포커스·탭 복귀 때).
 * 날짜 기준은 기기 시계와 시간대이며 서버 기준이 아니다(서버 날짜 기준은 미확정).
 */
export function useLocalToday(): LocalDate {
  const [today, setToday] = useState(() => toLocalDate(new Date()))
  useEffect(() => {
    const refreshDate = () => setToday(toLocalDate(new Date()))
    const timer = window.setInterval(refreshDate, 60_000)
    window.addEventListener('focus', refreshDate)
    document.addEventListener('visibilitychange', refreshDate)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshDate)
      document.removeEventListener('visibilitychange', refreshDate)
    }
  }, [])
  return today
}
