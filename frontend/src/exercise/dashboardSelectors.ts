import type {
  DashboardWeek,
  RecentRecordsView,
  WeeklyExerciseView,
} from './exerciseDashboardTypes.ts'
import { isLocalDate, toLocalDate } from './workoutModel.ts'
import type { WorkoutRecord } from './workoutTypes.ts'

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const shortDate = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
})

/** YYYY-MM-DD를 UTC로 해석하지 않는다. 정오를 사용해 일광 절약 시간 경계도 달력 날짜로 계산한다. */
function localNoon(date: string): Date {
  if (!isLocalDate(date)) throw new RangeError('Invalid local date')
  return new Date(`${date}T12:00:00`)
}

export function dashboardWeek(today: string): DashboardWeek {
  const monday = localNoon(today)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const days = WEEKDAYS.map((weekday, index) => {
    const day = new Date(monday)
    day.setDate(day.getDate() + index)
    const date = toLocalDate(day)
    return {
      date,
      weekday,
      dayOfMonth: day.getDate(),
      isToday: date === today,
      completedCount: 0,
    }
  })
  return { from: days[0].date, to: days[6].date, days }
}

/** 저장된 완료 기록만 입력받는다. 같은 날 두 번 완료했으면 2회·활동일 1일이다. */
export function selectWeeklyExercise(
  records: readonly WorkoutRecord[],
  today: string,
  skippedCount = 0,
): WeeklyExerciseView {
  const week = dashboardWeek(today)
  const counts = new Map<string, number>()
  for (const record of records) {
    if (record.performedDate < week.from || record.performedDate > week.to)
      continue
    counts.set(
      record.performedDate,
      (counts.get(record.performedDate) ?? 0) + 1,
    )
  }
  const days = week.days.map((day) => ({
    ...day,
    completedCount: counts.get(day.date) ?? 0,
  }))
  return {
    ...week,
    days,
    completedCount: days.reduce((sum, day) => sum + day.completedCount, 0),
    activeDayCount: counts.size,
    skippedCount,
  }
}

/** 주간 범위와 독립적인 전체 조회 결과를 받는다. 입력 배열을 변경하지 않는다. */
export function selectRecentRecords(
  records: readonly WorkoutRecord[],
  limit = 3,
  skippedCount = 0,
): RecentRecordsView {
  if (!Number.isInteger(limit) || limit < 0)
    throw new RangeError('Invalid recent record limit')
  const items = records
    .toSorted(
      (a, b) =>
        Date.parse(b.completedAt) - Date.parse(a.completedAt) ||
        b.id.localeCompare(a.id),
    )
    .slice(0, limit)
    .map((record) => {
      const exercises = record.exercises.filter(
        (exercise) => exercise.completedSets.length > 0,
      )
      const first = exercises[0]?.exerciseNameSnapshot ?? '운동 기록'
      return {
        id: record.id,
        performedDate: record.performedDate,
        title:
          exercises.length > 1
            ? `${first} 외 ${exercises.length - 1}개`
            : first,
        exerciseCount: record.totals.exerciseCount,
        completedSetCount: record.totals.completedSetCount,
        measuredMs: record.totals.measuredMs,
      }
    })
  return { items, skippedCount }
}

export function dashboardDateLabel(date: string): string {
  return shortDate.format(localNoon(date))
}

/** 미측정(null)을 0초로 바꾸지 않는다. */
export function measuredDurationLabel(
  measuredMs: number | null,
): string | null {
  if (measuredMs === null) return null
  const seconds = Math.floor(measuredMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  if (minutes === 0) return `${remaining}초`
  return remaining === 0 ? `${minutes}분` : `${minutes}분 ${remaining}초`
}
