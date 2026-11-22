import { useMemo } from 'react'
import { useAuth } from '../auth/authContext.ts'
import MealDashboardView from '../components/food/MealDashboardView.tsx'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { addDays, groupRecordsByDate } from '../food/mealHistory.ts'
import { useAllMealRecords } from '../food/useAllMealRecords.ts'
import { useMealPlans } from '../food/useMealPlans.ts'
import { useMealGoal } from '../meal-goal/useMealGoal.ts'
import type { MealRecordsState } from '../food/useMealRecords.ts'

/**
 * D01 식단 기록 대시보드(`/records/meal`, 회원 전용). 이 계정의 식단 기록을 한 번 읽어 오늘의 합계·끼니 카드와
 * 기록한 날 수(내 식단 리스트 D03 진입 카드)를 함께 보여 준다. 식단 목표(D01-4)는 목표 조회 상태(없음·조회 실패·저장 수단 없음 포함)를 "식단 관리"의 목표 행에 따로 보여 준다.
 * 오늘 합계에는 오늘 실제 섭취 기록만 쓴다(내일 계획은 따로 표시하고 합산하지 않는다).
 *
 * 오늘 날짜는 운동 대시보드(W01)와 같은 useLocalToday로 정한다(자정이 지나거나 탭·창으로 돌아오면 갱신). 날짜가 바뀌면
 * 오늘 기록은 새 날짜로 다시 묶고, 내일 계획은 새 내일 날짜로 다시 읽는다. 지난 날짜가 된 계획은 이 화면에 보이지 않을 뿐
 * 저장소의 수정 차단·삭제 규칙은 그대로이며, 오늘이 된 계획을 실제 섭취에 더하지 않는다.
 */
export default function MealDashboardPage() {
  const { user } = useAuth()
  const localDate = useLocalToday()
  const { state, reload } = useAllMealRecords(user?.id ?? null)
  // 내일 계획은 계획 전용 저장소에서 따로 읽는다(실제 섭취 합계와 섞지 않는다). 계획만 실패해도 오늘 섭취는 그대로 보인다.
  const plans = useMealPlans(user?.id ?? null, addDays(localDate, 1))
  // 식단 목표는 신체 정보 없이 읽는 별도 저장소다. 조회 실패·저장 수단 없음은 "목표 없음"이 아니며 오늘 섭취 표시에는 영향이 없다.
  const goal = useMealGoal(user?.id ?? null)
  const byDate = useMemo(
    () => groupRecordsByDate(state.status === 'ready' ? state.records : []),
    [state],
  )
  const today: MealRecordsState =
    state.status === 'ready'
      ? {
          status: 'ready',
          records: byDate.get(localDate) ?? [],
          skippedCount: state.skippedCount,
        }
      : state
  return (
    <MealDashboardView
      localDate={localDate}
      records={today}
      recordedDays={state.status === 'ready' ? byDate.size : null}
      plans={plans.state}
      onRetry={reload}
      onRetryPlans={plans.reload}
      goal={{ state: goal.state, onRetry: goal.reload }}
    />
  )
}
