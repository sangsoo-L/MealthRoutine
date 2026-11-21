import { isLocalDate, toLocalDate } from './workoutModel.ts'
import type { LocalDate, WorkoutRecord } from './workoutTypes.ts'

/**
 * 운동 기록 통계(`/records/exercise/stats`)의 기간 계산과 집계. 순수 함수이며 저장소·React를 부르지 않는다.
 *
 * 집계 기준(사용자 승인)
 * - 입력은 **저장된 완료 기록(WorkoutRecord)뿐**이다. 진행 중 세션·미완료·계획만 저장된 목록은 들어올 수 없어 통계에 들어가지 않는다.
 * - 운동 횟수 = 기간 안의 완료 세션(기록) 수.
 * - 운동한 날짜 수 = 완료 세션이 있는 서로 다른 실제 수행 날짜(performedDate) 수. 하루에 여러 번 해도 1일이다.
 * - 운동별 수행 횟수 = 그 운동을 완료 세트 1개 이상으로 수행한 세션 수(한 세션에 한 번만 센다).
 * - 운동 시간 = 실제 측정값이 있는 기록의 합. 측정한 기록이 하나도 없으면 null이며 0으로 보이지 않는다.
 * - 기간은 기기 로컬 날짜 기준이다. 주간은 월~일, 월간은 그 달의 1일~말일이다.
 */

export type StatsPeriod = 'week' | 'month'

/** 앞으로 거슬러 갈 수 있는 한계(주 단위 104주, 월 단위 24개월). */
export const MAX_WEEK_BACK = 104
export const MAX_MONTH_BACK = 24

export interface StatsRange {
  period: StatsPeriod
  /** 0이 이번 기간, -1이 직전 기간… (미래로 가지 않는다) */
  offset: number
  from: LocalDate
  to: LocalDate
  /** 큰 제목: "이번 주"·"지난주"·"3주 전", "이번 달"·"지난달"·"2026년 9월" */
  label: string
  /** 작은 제목: 날짜 범위("11월 16일 ~ 11월 22일", "2026년 11월") */
  sub: string
}

export interface StatsBucket {
  key: string
  /** 막대 아래 글자: 주간은 요일("월"), 월간은 "1주차" */
  label: string
  /** 보조기기가 읽는 이름: "월요일(11월 16일)" · "1주차(11월 1일~11월 2일)" */
  spoken: string
  from: LocalDate
  to: LocalDate
  sessions: number
}

export interface ExerciseCountRow {
  exerciseId: string
  name: string
  /** 수행한 세션 수 */
  sessions: number
  /** 완료한 세트 수의 합 */
  completedSets: number
}

export interface ExerciseStats {
  range: StatsRange
  sessionCount: number
  activeDays: number
  /** 측정한 시간의 합(ms). 측정한 기록이 없으면 null */
  measuredMs: number | null
  /** 측정한 시간이 있는 기록 수 */
  measuredRecordCount: number
  byExercise: readonly ExerciseCountRow[]
  buckets: readonly StatsBucket[]
}

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] as const
const monthDay = new Intl.DateTimeFormat('ko-KR', {
  month: 'long',
  day: 'numeric',
})

/** YYYY-MM-DD를 UTC로 해석하지 않는다. 정오를 써서 일광 절약 시간 경계도 달력 날짜로 계산한다. */
function noon(date: LocalDate): Date {
  if (!isLocalDate(date)) throw new RangeError('Invalid local date')
  return new Date(`${date}T12:00:00`)
}

function addDays(date: LocalDate, days: number): LocalDate {
  const value = noon(date)
  value.setDate(value.getDate() + days)
  return toLocalDate(value)
}

function labelDay(date: LocalDate): string {
  return monthDay.format(noon(date))
}

/** 월요일 시작 주의 월요일. */
function mondayOf(date: LocalDate): LocalDate {
  const value = noon(date)
  return addDays(date, -((value.getDay() + 6) % 7))
}

/** 오프셋을 허용 범위(미래 금지, 한계 이전 금지)로 맞춘다. 정수가 아니면 0. */
export function clampOffset(period: StatsPeriod, offset: number): number {
  if (!Number.isInteger(offset)) return 0
  const min = -(period === 'week' ? MAX_WEEK_BACK : MAX_MONTH_BACK)
  return Math.min(0, Math.max(min, offset))
}

/** 기간과 오프셋으로 조회 범위와 제목을 만든다. today는 기기 로컬 오늘. */
export function statsRange(
  period: StatsPeriod,
  offset: number,
  today: LocalDate,
): StatsRange {
  const at = clampOffset(period, offset)
  if (period === 'week') {
    const from = addDays(mondayOf(today), at * 7)
    const to = addDays(from, 6)
    return {
      period,
      offset: at,
      from,
      to,
      label: at === 0 ? '이번 주' : at === -1 ? '지난주' : `${-at}주 전`,
      sub: `${labelDay(from)} ~ ${labelDay(to)}`,
    }
  }
  const base = noon(today)
  const first = new Date(base.getFullYear(), base.getMonth() + at, 1, 12)
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12)
  const year = first.getFullYear()
  const month = first.getMonth() + 1
  return {
    period,
    offset: at,
    from: toLocalDate(first),
    to: toLocalDate(last),
    label: at === 0 ? '이번 달' : at === -1 ? '지난달' : `${year}년 ${month}월`,
    sub: `${year}년 ${month}월`,
  }
}

/** 추이 막대의 구간. 주간은 요일 7칸, 월간은 월요일 시작 주를 달 안으로 잘라 낸 주차 칸이다. */
export function statsBuckets(range: StatsRange): StatsBucket[] {
  if (range.period === 'week') {
    return WEEKDAYS.map((weekday, index) => {
      const date = addDays(range.from, index)
      return {
        key: date,
        label: weekday,
        spoken: `${weekday}요일(${labelDay(date)})`,
        from: date,
        to: date,
        sessions: 0,
      }
    })
  }
  const buckets: StatsBucket[] = []
  let cursor = range.from
  let n = 1
  while (cursor <= range.to) {
    const weekEnd = addDays(mondayOf(cursor), 6)
    const end = weekEnd < range.to ? weekEnd : range.to
    buckets.push({
      key: cursor,
      label: `${n}주차`,
      spoken: `${n}주차(${labelDay(cursor)}${cursor === end ? '' : `~${labelDay(end)}`})`,
      from: cursor,
      to: end,
      sessions: 0,
    })
    cursor = addDays(end, 1)
    n += 1
  }
  return buckets
}

/**
 * 완료 기록으로 통계를 계산한다. 기간 밖의 기록과 ownerId가 다른 기록은 무시한다(조회 범위가 섞여 와도 이 계정의 이 기간만 센다).
 * 입력은 바꾸지 않는다.
 */
export function computeStats(
  records: readonly WorkoutRecord[],
  range: StatsRange,
  ownerId?: string,
): ExerciseStats {
  const inRange = records.filter(
    (record) =>
      record.performedDate >= range.from &&
      record.performedDate <= range.to &&
      (ownerId === undefined || record.ownerId === ownerId),
  )
  const days = new Set<LocalDate>()
  let measuredMs = 0
  let measuredRecordCount = 0
  const rows = new Map<string, ExerciseCountRow>()
  const buckets = statsBuckets(range)
  for (const record of inRange) {
    days.add(record.performedDate)
    if (record.totals.measuredMs !== null) {
      measuredMs += record.totals.measuredMs
      measuredRecordCount += 1
    }
    for (const exercise of record.exercises) {
      if (exercise.completedSets.length === 0) continue
      const row = rows.get(exercise.exerciseId)
      if (row) {
        row.sessions += 1
        row.completedSets += exercise.completedSets.length
      } else {
        rows.set(exercise.exerciseId, {
          exerciseId: exercise.exerciseId,
          name: exercise.exerciseNameSnapshot,
          sessions: 1,
          completedSets: exercise.completedSets.length,
        })
      }
    }
    const bucket = buckets.find(
      (b) => record.performedDate >= b.from && record.performedDate <= b.to,
    )
    if (bucket) bucket.sessions += 1
  }
  return {
    range,
    sessionCount: inRange.length,
    activeDays: days.size,
    measuredMs: measuredRecordCount > 0 ? measuredMs : null,
    measuredRecordCount,
    byExercise: [...rows.values()].sort(
      (a, b) =>
        b.sessions - a.sessions ||
        b.completedSets - a.completedSets ||
        a.name.localeCompare(b.name, 'ko'),
    ),
    buckets,
  }
}
