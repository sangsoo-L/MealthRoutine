import type { LocalDate } from '../exercise/workoutTypes.ts'
import {
  addDays,
  mondayOf,
  weekLabel,
  weekPeriod,
} from '../food/mealHistory.ts'
import { MEAL_TYPES, type MealType } from '../food/mealModel.ts'

/**
 * I05 주간 기록 리포트의 집계(순수 함수). 읽어 온 기록 배열만 받고 저장소·화면을 모른다.
 * 서버 리포트 API(GET /reports/weekly)가 생기면 이 모양의 결과만 맞춰 교체한다.
 *
 * 기준(사용자 확정):
 * - 주는 월요일~일요일, 날짜는 기기 로컬 날짜다.
 * - 운동: WorkoutRecord.performedDate 기준, 완료 기록 1건 = 1회(같은 날 2건이면 2회).
 * - 식단: MealRecord.localDate·mealType 기준, 아침·점심·저녁 3끼만, 같은 날짜·같은 끼니는 기록이 여러 건이어도 1끼(주 최대 21끼).
 * - 기록이 없는 날은 0으로 단정하지 않고 "기록 없음"으로만 다룬다(미실천으로 간주하지 않는다).
 */
export const WEEKDAY_NAMES = ['월', '화', '수', '목', '금', '토', '일'] as const

export const MAX_WEEKS_BACK = 104

export interface WeekRange {
  /** 0이 이번 주, -1이 지난주… (미래로 가지 않는다) */
  offset: number
  from: LocalDate
  to: LocalDate
  /** "2026년 11월 3주차" */
  label: string
  /** "11.16 ~ 11.22" */
  period: string
  /** 아직 끝나지 않은 주(오늘이 이 주 안이거나 이 주가 오늘 이후까지 이어짐) */
  inProgress: boolean
  /** 오늘이 주 안에 있을 때의 오늘(아니면 null) */
  today: LocalDate | null
}

/** 주소 등에서 온 값을 쓸 수 있는 오프셋으로 만든다(정수가 아니면 0, 이번 주를 넘지 않고 104주를 넘지 않는다). */
export function clampWeekOffset(value: unknown): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n)) return 0
  return Math.min(0, Math.max(-MAX_WEEKS_BACK, n))
}

export function weekRangeFor(today: LocalDate, offset: number): WeekRange {
  const at = clampWeekOffset(offset)
  const from = addDays(mondayOf(today), at * 7)
  const to = addDays(from, 6)
  return {
    offset: at,
    from,
    to,
    label: weekLabel(from),
    period: weekPeriod(from),
    inProgress: to >= today,
    today: today >= from && today <= to ? today : null,
  }
}

export interface ExerciseDay {
  date: LocalDate
  weekday: (typeof WEEKDAY_NAMES)[number]
  /** 그날 완료한 운동 기록 수 */
  count: number
}

export interface ExerciseWeek {
  /** 이 주의 완료 운동 기록 수(1건 = 1회) */
  count: number
  days: ExerciseDay[]
  /** 기록이 있는 날 수 */
  activeDays: number
  /** 가장 늦게 기록한 날(없으면 null) */
  lastDate: LocalDate | null
}

export interface MealDay {
  date: LocalDate
  weekday: (typeof WEEKDAY_NAMES)[number]
  /** 그날 기록한 끼니(아침·점심·저녁) */
  meals: Record<MealType, boolean>
  /** 그날 기록한 끼니 수(0~3) */
  count: number
}

export interface MealWeek {
  /** 이 주에 기록한 끼니 수(날짜×끼니 칸, 0~21) */
  slotCount: number
  days: MealDay[]
  /** 기록한 끼니가 있는 날 수 */
  recordedDays: number
  lastDate: LocalDate | null
}

function weekDays(range: Pick<WeekRange, 'from'>): LocalDate[] {
  return WEEKDAY_NAMES.map((_, index) => addDays(range.from, index))
}

/** 운동 기록을 이 주로 집계한다. 주 밖의 기록은 무시한다. */
export function summarizeExerciseWeek(
  range: Pick<WeekRange, 'from' | 'to'>,
  records: readonly { performedDate: LocalDate }[],
): ExerciseWeek {
  const counts = new Map<LocalDate, number>()
  for (const record of records) {
    if (record.performedDate < range.from || record.performedDate > range.to)
      continue
    counts.set(
      record.performedDate,
      (counts.get(record.performedDate) ?? 0) + 1,
    )
  }
  const days = weekDays(range).map((date, index) => ({
    date,
    weekday: WEEKDAY_NAMES[index],
    count: counts.get(date) ?? 0,
  }))
  const active = days.filter((day) => day.count > 0)
  return {
    count: days.reduce((sum, day) => sum + day.count, 0),
    days,
    activeDays: active.length,
    lastDate: active.length > 0 ? active[active.length - 1].date : null,
  }
}

/**
 * 식단 기록을 이 주로 집계한다. 같은 날짜·같은 끼니의 여러 기록은 1끼다. 아침·점심·저녁이 아닌 값이 들어 있어도 세지 않는다
 * (저장소가 세 끼니만 받지만 읽은 값을 믿지 않는다). 주 밖의 기록은 무시한다.
 */
export function summarizeMealWeek(
  range: Pick<WeekRange, 'from' | 'to'>,
  records: readonly { localDate: LocalDate; mealType: string }[],
): MealWeek {
  const slots = new Map<LocalDate, Set<MealType>>()
  for (const record of records) {
    if (record.localDate < range.from || record.localDate > range.to) continue
    if (!(MEAL_TYPES as readonly string[]).includes(record.mealType)) continue
    const set = slots.get(record.localDate) ?? new Set<MealType>()
    set.add(record.mealType as MealType)
    slots.set(record.localDate, set)
  }
  const days = weekDays(range).map((date, index) => {
    const set = slots.get(date)
    const meals = {
      breakfast: set?.has('breakfast') ?? false,
      lunch: set?.has('lunch') ?? false,
      dinner: set?.has('dinner') ?? false,
    }
    return {
      date,
      weekday: WEEKDAY_NAMES[index],
      meals,
      count: MEAL_TYPES.filter((meal) => meals[meal]).length,
    }
  })
  const recorded = days.filter((day) => day.count > 0)
  return {
    slotCount: days.reduce((sum, day) => sum + day.count, 0),
    days,
    recordedDays: recorded.length,
    lastDate: recorded.length > 0 ? recorded[recorded.length - 1].date : null,
  }
}

/**
 * 지난주와의 증감. 비교할 지난주 기록이 하나도 없으면(비교 데이터 부족) null이라 증감을 보이지 않는다.
 * 지난주 값이 0이면 "0에서 늘었다"고 단정하지 않는다.
 */
export function changeFromPrevious(
  current: number,
  previous: number | null,
): number | null {
  if (previous === null || previous <= 0) return null
  return current - previous
}

/** 요일 글자와 날짜: "월요일" 같은 읽는 이름. */
export function weekdayFullName(date: LocalDate, from: LocalDate): string {
  const index = weekDays({ from }).indexOf(date)
  return index < 0 ? '' : `${WEEKDAY_NAMES[index]}요일`
}
