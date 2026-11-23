import { dashboardWeek } from '../exercise/dashboardSelectors.ts'
import { isLocalDate } from '../exercise/workoutModel.ts'
import { resultPathFor } from '../exercise/useWorkoutResult.ts'
import type { LocalDate, WorkoutRecord } from '../exercise/workoutTypes.ts'
import { mealDetailPath, mealPreviousPath } from '../food/foodPaths.ts'
import { MEAL_LABEL, isMealType, type MealRecord } from '../food/mealModel.ts'

/**
 * 회원 홈(H01)의 "이번 주 나의 활동"·"오늘의 기록"·"최근 활동"이 함께 쓰는 집계 규칙(순수 함수). 조회·표시와 분리되어 있다.
 *
 * 입력은 운동·식단 기록 조회 결과다. 각 영역(운동·식단)은 조회 중(loading)·저장 수단 없음(unavailable)·조회 실패(error)·읽음(ready) 중 하나이며,
 * **읽지 못한 영역을 0일이나 "기록 없음"으로 바꾸지 않는다.** 운동과 식단은 서로 독립이라 한쪽만 읽어도 그쪽 값은 보인다.
 *
 * 집계 기준(정책):
 * - 날짜는 기기의 로컬 날짜(`YYYY-MM-DD`)다. 운동은 실제 수행 날짜(performedDate), 식단은 기록한 끼니의 날짜(localDate)다.
 * - 이번 주는 월요일부터 일요일까지다(W01 대시보드와 같은 `dashboardWeek`).
 * - 기록일은 날짜 수다. 같은 날 기록이 여러 건이어도 1일이다. 운동과 식단은 각각 따로 센다.
 * - 오늘보다 뒤 날짜의 기록은 완료한 활동으로 세지 않는다(기존 정책이 없어 보수적으로 제외). 읽을 수 없는 기록으로도 세지 않는다.
 * - 다른 계정의 기록·날짜가 올바르지 않은 기록은 세지 않고 "읽을 수 없는 기록"(unreadable)으로 센다. 읽을 수 없는 기록이 있으면
 *   그 영역의 "기록 없음"은 확인할 수 없다.
 * - 이 집계는 주간 리포트(I05)와 정의가 다를 수 있다. 같은 지표라고 안내하지 않는다.
 *
 * 최근 활동 정렬: 기록 날짜(운동 수행일·식단 날짜) 최신순 → 같은 날은 운동 완료 시각·식단 등록 시각 최신순 → 같으면 id 순.
 * 시각이 올바르지 않은 기록은 같은 날 안에서 뒤로 가며, 날짜가 올바르지 않은 기록은 목록에 넣지 않는다(현재 날짜로 대체하지 않는다).
 */

export type Fact<T> =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; value: T }

export type ActivityKind = 'exercise' | 'meal'

/** 최근 활동 후보 한 건. 화면에는 title·meta·to만 쓴다. */
export interface RecentCandidate {
  id: string
  kind: ActivityKind
  date: LocalDate
  /** 같은 날 안의 정렬용 시각(ms). 올바르지 않으면 null */
  timestamp: number | null
  title: string
  /** 보조 문구(날짜·끼니·시각) */
  meta: string
  /** 상세 화면 경로 */
  to: string
}

/** 한 영역의 정규화된 기록. */
export interface DomainActivity {
  /** 기록이 있는 날짜(오늘 이하, 중복 없음, 오름차순) */
  dates: readonly LocalDate[]
  /** 오늘 날짜의 기록 건수 */
  todayCount: number
  /** 읽을 수 없는 기록 수(다른 계정·잘못된 날짜·손상 행) */
  unreadable: number
  recent: readonly RecentCandidate[]
}

function monthDay(date: LocalDate): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}월 ${day}일`
}

function dateLabel(date: LocalDate, today: LocalDate): string {
  return date === today ? '오늘' : monthDay(date)
}

function timeLabel(iso: unknown): { label: string; ms: number } | null {
  if (typeof iso !== 'string') return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const at = new Date(ms)
  const hh = String(at.getHours()).padStart(2, '0')
  const mm = String(at.getMinutes()).padStart(2, '0')
  return { label: `${hh}:${mm}`, ms }
}

function exerciseTitle(record: WorkoutRecord): string {
  const exercises = Array.isArray(record.exercises)
    ? record.exercises.filter(
        (exercise) =>
          Array.isArray(exercise?.completedSets) &&
          exercise.completedSets.length > 0,
      )
    : []
  const first = exercises[0]?.exerciseNameSnapshot
  const name = typeof first === 'string' && first !== '' ? first : '운동 기록'
  return exercises.length > 1 ? `${name} 외 ${exercises.length - 1}개` : name
}

function countOf(skippedCount: number): number {
  return Number.isInteger(skippedCount) && skippedCount > 0 ? skippedCount : 0
}

export function normalizeExerciseActivity(
  records: readonly WorkoutRecord[],
  skippedCount: number,
  today: LocalDate,
  ownerId: string,
): DomainActivity {
  const dates = new Set<LocalDate>()
  const recent: RecentCandidate[] = []
  let todayCount = 0
  let unreadable = countOf(skippedCount)
  for (const record of records) {
    if (
      !record ||
      record.ownerId !== ownerId ||
      !isLocalDate(record.performedDate) ||
      typeof record.id !== 'string'
    ) {
      unreadable += 1
      continue
    }
    if (record.performedDate > today) continue // 앞으로의 날짜는 완료한 활동이 아니다
    dates.add(record.performedDate)
    if (record.performedDate === today) todayCount += 1
    const time = timeLabel(record.completedAt)
    const sessionId = record.sessionId
    recent.push({
      id: record.id,
      kind: 'exercise',
      date: record.performedDate,
      timestamp: time?.ms ?? null,
      title: exerciseTitle(record),
      meta: time
        ? `${dateLabel(record.performedDate, today)} ${time.label} 완료`
        : dateLabel(record.performedDate, today),
      // 완료한 기록의 읽기 전용 결과 화면(W15). 세션 id가 없으면 운동 기록 허브로 보낸다(없는 상세 경로를 만들지 않는다).
      to:
        typeof sessionId === 'string' && sessionId !== ''
          ? resultPathFor(sessionId)
          : '/records/exercise/my',
    })
  }
  return {
    dates: [...dates].sort(),
    todayCount,
    unreadable,
    recent,
  }
}

export function normalizeMealActivity(
  records: readonly MealRecord[],
  skippedCount: number,
  today: LocalDate,
  ownerId: string,
): DomainActivity {
  const dates = new Set<LocalDate>()
  const recent: RecentCandidate[] = []
  let todayCount = 0
  let unreadable = countOf(skippedCount)
  for (const record of records) {
    if (
      !record ||
      record.ownerId !== ownerId ||
      !isLocalDate(record.localDate) ||
      typeof record.id !== 'string' ||
      !isMealType(record.mealType)
    ) {
      unreadable += 1
      continue
    }
    if (record.localDate > today) continue
    dates.add(record.localDate)
    if (record.localDate === today) todayCount += 1
    const time = timeLabel(record.createdAt)
    const name =
      typeof record.foodName === 'string' && record.foodName !== ''
        ? record.foodName
        : '식단 기록'
    recent.push({
      id: record.id,
      kind: 'meal',
      date: record.localDate,
      timestamp: time?.ms ?? null,
      title: name,
      meta: `${dateLabel(record.localDate, today)} · ${MEAL_LABEL[record.mealType]}`,
      // 오늘 기록은 끼니 상세(D01-1~3), 지난 날짜는 이전 식단 상세(D03-1)로 연다.
      to:
        record.localDate === today
          ? mealDetailPath(record.mealType)
          : mealPreviousPath(record.localDate, record.mealType),
    })
  }
  return { dates: [...dates].sort(), todayCount, unreadable, recent }
}

// ── 이번 주 나의 활동 ────────────────────────────────────────────────────

/** 하루의 한 영역 표시: 기록함·기록 없음(확인됨)·앞으로의 날짜·확인 불가 */
export type DayMark = 'recorded' | 'none' | 'future' | 'unknown'

export interface WeekDayView {
  date: LocalDate
  weekday: string
  dayOfMonth: number
  isToday: boolean
  exercise: DayMark
  meal: DayMark
}

/** 한 영역의 주간 요약. error는 조회 실패이거나 "없음"을 확인할 수 없는 경우다(0일이 아니다). */
export type DomainWeek =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'ready'; recordedDays: number }

export interface WeeklyActivityView {
  from: LocalDate
  to: LocalDate
  /** 예: "11월 16일 ~ 22일", 달이 다르면 "11월 30일 ~ 12월 6일" */
  rangeLabel: string
  days: readonly WeekDayView[]
  exercise: DomainWeek
  meal: DomainWeek
}

function weekRangeLabel(from: LocalDate, to: LocalDate): string {
  const [, fromMonth] = from.split('-').map(Number)
  const [, toMonth, toDay] = to.split('-').map(Number)
  return fromMonth === toMonth
    ? `${monthDay(from)} ~ ${toDay}일`
    : `${monthDay(from)} ~ ${toMonth}월 ${toDay}일`
}

function markOf(
  fact: Fact<DomainActivity>,
  date: LocalDate,
  today: LocalDate,
): DayMark {
  if (date > today) return 'future'
  if (fact.status !== 'ready') return 'unknown'
  if (fact.value.dates.includes(date)) return 'recorded'
  // 읽을 수 없는 기록이 있으면 이 날 기록이 없다고 확인할 수 없다.
  return fact.value.unreadable > 0 ? 'unknown' : 'none'
}

function domainWeek(
  fact: Fact<DomainActivity>,
  from: LocalDate,
  to: LocalDate,
): DomainWeek {
  if (fact.status !== 'ready') return { status: fact.status }
  const recordedDays = fact.value.dates.filter(
    (date) => date >= from && date <= to,
  ).length
  // 기록이 하나도 없는데 읽을 수 없는 기록이 있으면 0일이라고 말할 수 없다.
  if (recordedDays === 0 && fact.value.unreadable > 0)
    return { status: 'error' }
  return { status: 'ready', recordedDays }
}

/** 이번 주 요약. 오늘 날짜가 올바르지 않으면 null이다(주를 정할 수 없다). */
export function buildWeeklyActivity(
  today: LocalDate,
  exercise: Fact<DomainActivity>,
  meal: Fact<DomainActivity>,
): WeeklyActivityView | null {
  if (!isLocalDate(today)) return null
  const week = dashboardWeek(today)
  return {
    from: week.from,
    to: week.to,
    rangeLabel: weekRangeLabel(week.from, week.to),
    days: week.days.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      dayOfMonth: day.dayOfMonth,
      isToday: day.isToday,
      exercise: markOf(exercise, day.date, today),
      meal: markOf(meal, day.date, today),
    })),
    exercise: domainWeek(exercise, week.from, week.to),
    meal: domainWeek(meal, week.from, week.to),
  }
}

// ── 오늘의 기록 ──────────────────────────────────────────────────────────

/** 오늘의 기록 한 줄의 상태. none은 기록이 없다고 확인된 경우에만 쓴다. */
export type TodayStatus =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'none' }
  | { status: 'some'; count: number }

export function todayStatusOf(fact: Fact<DomainActivity>): TodayStatus {
  if (fact.status !== 'ready') return { status: fact.status }
  if (fact.value.todayCount > 0)
    return { status: 'some', count: fact.value.todayCount }
  // 읽을 수 없는 기록이 있으면 오늘 기록이 없다고 확인할 수 없다.
  return fact.value.unreadable > 0 ? { status: 'error' } : { status: 'none' }
}

// ── 최근 활동 ────────────────────────────────────────────────────────────

export const RECENT_ACTIVITY_LIMIT = 3

export type RecentActivityView =
  | { status: 'loading' | 'unavailable' | 'error' }
  | { status: 'empty' }
  | {
      status: 'ready'
      items: readonly RecentCandidate[]
      /** 읽지 못한 영역(있으면 목록이 일부일 수 있다는 안내를 한다) */
      missing: readonly ActivityKind[]
    }

function compareRecent(a: RecentCandidate, b: RecentCandidate): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  const at = a.timestamp ?? -Infinity
  const bt = b.timestamp ?? -Infinity
  if (at !== bt) return at < bt ? 1 : -1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * 운동·식단 기록을 합쳐 최신순 최대 3건. 한 영역을 읽지 못해도 읽은 영역의 기록은 보여 주되 `missing`으로 알린다.
 * 두 영역 모두 읽지 못하면 목록을 만들지 않고, 읽은 영역에 기록이 없고 다른 영역을 읽지 못했다면 "없음"으로 말하지 않는다.
 */
export function buildRecentActivity(
  exercise: Fact<DomainActivity>,
  meal: Fact<DomainActivity>,
  limit = RECENT_ACTIVITY_LIMIT,
): RecentActivityView {
  const facts: [ActivityKind, Fact<DomainActivity>][] = [
    ['exercise', exercise],
    ['meal', meal],
  ]
  // 한 영역이라도 읽는 중이면 둘 다 읽을 때까지 기다린다(목록이 도중에 바뀌어 순서가 흔들리지 않게 한다).
  if (facts.some(([, f]) => f.status === 'loading'))
    return { status: 'loading' }
  const ready = facts.flatMap(([, fact]) =>
    fact.status === 'ready' ? [fact.value] : [],
  )
  if (ready.length === 0) {
    // 실패가 있으면 실패, 모두 저장 수단이 없으면 연결 전이다.
    if (facts.some(([, f]) => f.status === 'error')) return { status: 'error' }
    return { status: 'unavailable' }
  }
  const missing = facts.flatMap(([kind, fact]) =>
    fact.status === 'ready' ? [] : [kind],
  )
  const unreadable = ready.some((activity) => activity.unreadable > 0)
  const items = ready
    .flatMap((activity) => activity.recent)
    .toSorted(compareRecent)
    .slice(0, limit)
  if (items.length === 0) {
    // 기록이 없다는 사실은 두 영역을 모두 읽었고 읽을 수 없는 기록도 없을 때만 확인된다.
    if (missing.length > 0 || unreadable) return { status: 'error' }
    return { status: 'empty' }
  }
  return { status: 'ready', items, missing }
}
