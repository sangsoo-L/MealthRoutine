import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import {
  getExerciseDashboard,
  type ExerciseDashboardData,
} from './exerciseDashboardSource.ts'
import { useDashboardRecords } from './useDashboardRecords.ts'
import { useLocalToday } from './useLocalToday.ts'
import { useTodayWorkoutList } from './useTodayWorkoutList.ts'

/**
 * 운동 대시보드(W01)의 영역별 상태. 데이터 출처는 exerciseDashboardSource이고 이 훅은 화면 상태만 가진다.
 *
 * - "오늘의 운동"(today)은 저장된 운동 목록(IndexedDB)에서(useTodayWorkoutList), "이번 주 운동"(weekly)과 "최근 운동 기록"(recent)은
 *   저장된 완료 기록(IndexedDB)에서 조회한다(useDashboardRecords). 나머지 영역(루틴·통계·다음 운동)은 조회할 데이터 소스가 아직 없어
 *   준비 중(unavailable)이며, 목표 배너는 자체 훅이 목표 요약을 읽는다.
 * - 개발 서버에서만 `?sample=<이름>`으로 예시 상태를 쓸 수 있다. 예시를 쓰는 중에는 모든 영역이 예시이며 저장소를 조회하지 않는다(섞지 않는다).
 * - reload는 영역의 다시 시도에 연결되어 있다. 오늘의 운동과 완료 기록 영역은 다시 조회하고, 나머지 영역은 임시 구현이라 같은 값을 다시 계산할 뿐이다.
 */
export function useExerciseDashboard(): ExerciseDashboardData & {
  reload: () => void
  today: string
  /** 오늘 완료한 기록의 "목록 id → 세션 id". 완료한 목록의 W15 읽기 전용 상세 링크에 쓴다. 예시를 쓰는 중이거나 조회 전·실패면 비어 있다. */
  doneSessionByList: ReadonlyMap<string, string>
} {
  const today = useLocalToday()
  const { user } = useAuth()
  const [params] = useSearchParams()
  const sampleParam = params.get('sample')
  const [attempt, setAttempt] = useState(0)

  const data = useMemo(() => {
    void attempt
    return getExerciseDashboard(sampleParam, today)
  }, [sampleParam, attempt, today])

  const usingSample = data.sampleNotice !== null
  const todayList = useTodayWorkoutList(user?.id ?? null, today, !usingSample)
  const records = useDashboardRecords(user?.id ?? null, today, !usingSample)
  const reloadToday = todayList.reload
  const reloadRecords = records.reload

  const reload = useCallback(() => {
    setAttempt((n) => n + 1)
    reloadToday()
    reloadRecords()
  }, [reloadToday, reloadRecords])

  // 개발용 예시(?sample=)를 쓰는 중에는 예시만 보이고 저장된 기록은 조회하지 않는다(섞지 않는다).
  const slots = usingSample
    ? data.slots
    : {
        ...data.slots,
        today: todayList.slot,
        weekly: records.weekly,
        recent: records.recent,
      }
  return {
    ...data,
    slots,
    reload,
    today,
    doneSessionByList: usingSample ? NO_DONE : records.doneSessionByList,
  }
}

const NO_DONE: ReadonlyMap<string, string> = new Map()
