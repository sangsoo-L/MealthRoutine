/**
 * 운동 대시보드(W01)의 화면용 값(view-model). 화면을 그리는 데 필요한 모양만 담으며 백엔드 DTO나 최종 운동 기록 모델이 아니다.
 * 실제 데이터(운동 목록·수행 기록·루틴·운동 목표)는 아직 연결되지 않았고 API 계약도 확정되지 않았다(api-policy.md, exercise-domain-design.md §10).
 * 나중에 데이터를 연결하는 쪽이 이 모양으로 바꿔 넘기면 화면은 그대로 쓸 수 있다.
 */

/**
 * 영역 하나의 상태. 영역마다 독립이라 한 영역이 실패해도 다른 영역은 그대로 보인다.
 * - loading: 불러오는 중.
 * - unavailable: 데이터 소스가 연결되지 않았다. "기록 없음"이나 오류가 아니라 **준비 중**이다.
 * - error: 연결은 되어 있으나 불러오지 못했다.
 * - empty: 불러왔고 정말 비어 있다(예: 오늘 만든 운동 목록이 없다). 연결 전(unavailable)과 다르다.
 * - ready: 값이 있다.
 */
export type DashboardSlot<T> =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'empty' }
  | { status: 'ready'; data: T }

/**
 * 값이 없고 상태 안내만 가질 수 있는 영역의 상태(통계·다음 운동 준비). ready·empty는 타입으로 막아, 나중에 값을 연결하려면 이 타입을 먼저 바꾸게 한다.
 * (DashboardSlot<never>는 never 속성이 있는 멤버를 없애지 않아 ready·empty를 막지 못한다.)
 */
export type PendingOnlySlot = Extract<
  DashboardSlot<never>,
  { status: 'loading' | 'unavailable' | 'error' }
>

/** 운동 목표. 목표 모델(W01-1 · exercise-goals)이 확정되지 않아 표시 문장만 담는다. 건강관리 목표(운동·식단 비율)가 아니다. */
export interface ExerciseGoalView {
  /** 예: "주 3회 · 1회 30분의 시작 계획" (만드는 쪽이 표시 문장으로 바꿔 넘긴다) */
  summary: string
}

/** 오늘 운동 목록·기록의 한 줄. */
export interface TodayExerciseItem {
  name: string
  /** 예: "10회 · 8 kg × 2세트" */
  detail: string
  /** 줄 오른쪽에 붙는 짧은 표시(예: "중량형", "2세트 ✓") */
  trailing?: string
}

/**
 * 오늘의 운동. 목록이 하나라도 남아 있으면 planned(운동 전), 오늘 목록이 모두 끝나고 기록이 저장됐을 때만 completed(운동 후)다.
 * 목록과 요약을 동시에 보여 주지 않는다(명세 W01 data).
 */
export type TodayExerciseView =
  | {
      phase: 'planned'
      listName: string
      exerciseCount: number
      setCount: number
      items: readonly TodayExerciseItem[]
      /** 저장값이 손상되어 읽지 못한 목록 수. 있을 때만 값이 있고 화면이 한 줄로 알린다. */
      skippedCount?: number
      /** 저장된 목록의 식별자와 계획 날짜(운동 시작·이어하기 판단에 쓴다). 개발용 예시에는 없다. */
      listId?: string
      plannedDate?: string
      /** 목록에 진행(W14)·결과(W15)가 아직 처리하지 못하는 기록 방식(복합 방식)이 있어 운동을 시작할 수 없다. 있을 때만 true다. */
      startBlocked?: boolean
    }
  | {
      phase: 'completed'
      exerciseCount: number
      setCount: number
      /** 측정한 시간의 표시 문장(예: "12:30"). 측정한 기록이 없으면 null이며 "미측정"으로 보여 준다(0으로 보이지 않는다). */
      durationLabel: string | null
      items: readonly TodayExerciseItem[]
    }

export interface WorkoutRoutineView {
  count: number
}

/** 기기 로컬 날짜로 월요일부터 일요일까지 표시한다. */
export interface DashboardWeekDay {
  date: string
  weekday: string
  dayOfMonth: number
  isToday: boolean
  completedCount: number
}

export interface DashboardWeek {
  from: string
  to: string
  days: readonly DashboardWeekDay[]
}

/** 완료 기록만 집계한다. 목표 달성률·계획·AI 리포트는 포함하지 않는다. */
export interface WeeklyExerciseView extends DashboardWeek {
  completedCount: number
  activeDayCount: number
  skippedCount: number
}

export interface RecentWorkoutView {
  id: string
  /**
   * 완료 기록의 세션 id. 있으면 W15 읽기 전용 화면(`/records/exercise/result?session=`)으로 이어지는 링크를 보인다.
   * 저장된 실제 기록에서 온 항목에만 있고, 개발용 예시(`?sample=`)에는 없다(예시는 상세로 연결하지 않는다).
   */
  sessionId?: string
  performedDate: string
  title: string
  exerciseCount: number
  completedSetCount: number
  measuredMs: number | null
}

export interface RecentRecordsView {
  items: readonly RecentWorkoutView[]
  skippedCount: number
}

/**
 * 대시보드 전체의 영역별 상태.
 * weekly·recent는 완료 기록의 표시 영역이다. 개발 서버에서는 저장된 완료 기록(IndexedDB)을 조회해 채운다(useDashboardRecords). 운영 빌드는 저장소가 없어 준비 중이다.
 * statistics·next는 상세 통계·날짜별 계획·주간 리포트의 준비 상태다. PendingOnlySlot이라 ready·empty가 불가능하다.
 */
export interface ExerciseDashboardSlots {
  weekly: DashboardSlot<WeeklyExerciseView>
  recent: DashboardSlot<RecentRecordsView>
  goal: DashboardSlot<ExerciseGoalView>
  today: DashboardSlot<TodayExerciseView>
  routines: DashboardSlot<WorkoutRoutineView>
  statistics: PendingOnlySlot
  next: PendingOnlySlot
}
