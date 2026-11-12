import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import {
  getExerciseDashboard,
  type ExerciseDashboardData,
} from './exerciseDashboardSource.ts'
import { toLocalDate } from './workoutModel.ts'

/**
 * 운동 대시보드(W01)의 영역별 상태. 데이터 출처는 exerciseDashboardSource이고 이 훅은 화면 상태만 가진다.
 * 지금은 조회할 데이터 소스가 없어 기본값은 모든 영역이 준비 중(unavailable)이며, 개발 서버에서만 `?sample=<이름>`으로 예시 상태를 쓴다.
 * reload는 영역의 다시 시도에 연결되어 있다. 지금은 임시 구현이다: 조회가 없어 같은 값을 다시 계산할 뿐이며, 실제 조회가 연결되면
 * 영역별 비동기 상태(조회·취소·재시도)를 가진 구조로 바꾼다.
 */
export function useExerciseDashboard(): ExerciseDashboardData & {
  reload: () => void
  today: string
} {
  const [today, setToday] = useState(() => toLocalDate(new Date()))
  // 자정을 넘기거나 탭으로 돌아오면 이번 주 범위와 오늘 표시를 갱신한다.
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
  const [params] = useSearchParams()
  const sampleParam = params.get('sample')
  const [attempt, setAttempt] = useState(0)

  const data = useMemo(() => {
    void attempt
    return getExerciseDashboard(sampleParam, today)
  }, [sampleParam, attempt, today])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  return { ...data, reload, today }
}
