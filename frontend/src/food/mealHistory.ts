import { isLocalDate, toLocalDate } from '../exercise/workoutModel.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import {
  mealNutrition,
  MEAL_TYPES,
  type MealRecord,
  type MealType,
} from './mealModel.ts'
import { summarizeMeals } from './mealView.ts'

/**
 * 식단 리스트(D03)·이전 식단 상세(D03-1)·D01의 기록한 날 수가 쓰는 순수 함수. 저장소·React를 부르지 않는다.
 * 날짜는 기기 로컬 날짜(YYYY-MM-DD)이고, 영양값은 기록에 저장된 스냅샷으로 계산한다(음식 데이터가 바뀌어도 과거 합계는 그대로).
 */

export const WEEKDAY_LABELS = [
  '월',
  '화',
  '수',
  '목',
  '금',
  '토',
  '일',
] as const

function dateOf(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  // 정오로 만들어 일광 절약 시간 같은 경계에서도 날짜가 밀리지 않게 한다.
  return new Date(y, m - 1, d, 12)
}

export function addDays(date: LocalDate, days: number): LocalDate {
  const next = dateOf(date)
  next.setDate(next.getDate() + days)
  return toLocalDate(next)
}

/** 날짜가 속한 주의 월요일. */
export function mondayOf(date: LocalDate): LocalDate {
  const day = dateOf(date).getDay() // 0=일 … 6=토
  return addDays(date, -((day + 6) % 7))
}

/** 월~일 7개 날짜. */
export function weekDates(date: LocalDate): LocalDate[] {
  const monday = mondayOf(date)
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i))
}

/**
 * "2026년 11월 3주차": 월요일이 속한 달 기준이다. 그 달의 몇 번째 월요일이 이 주의 월요일인가가 주차이며,
 * 달을 넘기는 주는 월요일이 속한 달의 마지막 주로 남는다(화면명세 D03).
 */
export function weekLabel(date: LocalDate): string {
  const monday = dateOf(mondayOf(date))
  const nth = Math.ceil(monday.getDate() / 7)
  return `${monday.getFullYear()}년 ${monday.getMonth() + 1}월 ${nth}주차`
}

/** "11.16 ~ 11.22". */
export function weekPeriod(date: LocalDate): string {
  const days = weekDates(date)
  const short = (d: LocalDate) => {
    const x = dateOf(d)
    return `${x.getMonth() + 1}.${x.getDate()}`
  }
  return `${short(days[0])} ~ ${short(days[6])}`
}

/** "11월 18일 (수)". */
export function dateText(date: LocalDate): string {
  const x = dateOf(date)
  const weekday = WEEKDAY_LABELS[(x.getDay() + 6) % 7]
  return `${x.getMonth() + 1}월 ${x.getDate()}일 (${weekday})`
}

/** 주소 등에서 온 날짜를 쓸 수 있는 값으로 바꾼다. 올바른 날짜가 아니거나 오늘 이후면 today다(미래 날짜는 고를 수 없다). */
export function clampToToday(
  value: string | null | undefined,
  today: LocalDate,
): LocalDate {
  return isLocalDate(value) && value <= today ? value : today
}

/** 이전·다음 주로 옮긴 날짜: 같은 요일을 유지하고, 미래가 되면 오늘이다. */
export function shiftWeek(
  date: LocalDate,
  weeks: number,
  today: LocalDate,
): LocalDate {
  const next = addDays(date, weeks * 7)
  return next > today ? today : next
}

export type RecordsByDate = ReadonlyMap<LocalDate, readonly MealRecord[]>

/** 날짜별로 묶는다. 각 날짜의 기록은 들어온 순서(등록 순서)를 유지한다. */
export function groupRecordsByDate(
  records: readonly MealRecord[],
): RecordsByDate {
  const map = new Map<LocalDate, MealRecord[]>()
  for (const record of records) {
    const list = map.get(record.localDate)
    if (list) list.push(record)
    else map.set(record.localDate, [record])
  }
  return map
}

/** 기록이 있는 날짜(오름차순). */
export function recordedDates(byDate: RecordsByDate): LocalDate[] {
  return [...byDate.keys()].sort()
}

/** 오늘보다 앞선 날(지난 날) 중 기록이 있는 날짜(오름차순). */
export function pastRecordedDates(
  byDate: RecordsByDate,
  today: LocalDate,
): LocalDate[] {
  return recordedDates(byDate).filter((d) => d < today)
}

/** 기준 날짜보다 앞·뒤에서 가장 가까운 날짜. 없으면 null이다. dates는 오름차순이다. */
export function adjacentDates(
  dates: readonly LocalDate[],
  current: LocalDate,
): { previous: LocalDate | null; next: LocalDate | null } {
  let previous: LocalDate | null = null
  let next: LocalDate | null = null
  for (const d of dates) {
    if (d < current) previous = d
    else if (d > current && next === null) next = d
  }
  return { previous, next }
}

export interface WeekSummary {
  /** 오늘까지 중 기록이 있는 날 수 */
  recordedDays: number
  /**
   * 하루 평균 열량. 열량 합계를 계산할 수 있는 날만 평균한다(영양값이 없는 날은 제외, 모두 없으면 null).
   * 목표가 없어 "목표 대비 %"는 만들지 않는다.
   */
  averageKcal: number | null
}

export function weekSummary(
  byDate: RecordsByDate,
  days: readonly LocalDate[],
  today: LocalDate,
): WeekSummary {
  const recorded = days.filter((d) => d <= today && byDate.has(d))
  const kcals: number[] = []
  for (const d of recorded) {
    const kcal = summarizeMeals(byDate.get(d) ?? []).totals.kcal
    if (kcal !== null) kcals.push(kcal)
  }
  return {
    recordedDays: recorded.length,
    averageKcal:
      kcals.length === 0
        ? null
        : kcals.reduce((a, b) => a + b, 0) / kcals.length,
  }
}

export interface MealKcalShareItem {
  meal: MealType
  kcal: number
  /** 정수 %. 항목들의 합이 100이다. */
  percent: number
}

/**
 * 끼니별 열량 비율(D03-1 둘째 그래프). 열량을 계산할 수 있는 끼니만 쓰고(값이 없는 끼니는 0으로 채우지 않고 제외),
 * 합이 0이면 null이다. 백분율은 합이 100이 되도록 가장 큰 나머지 순으로 맞춘다.
 */
export function mealKcalShare(
  records: readonly MealRecord[],
): { items: MealKcalShareItem[]; totalKcal: number } | null {
  const known = MEAL_TYPES.map((meal) => {
    const kcal = summarizeMeals(records.filter((r) => r.mealType === meal))
      .totals.kcal
    return { meal, kcal }
  }).filter((x): x is { meal: MealType; kcal: number } => x.kcal !== null)
  const total = known.reduce((a, b) => a + b.kcal, 0)
  if (known.length === 0 || total <= 0) return null
  const exact = known.map((x) => (x.kcal / total) * 100)
  const floors = exact.map((e) => Math.floor(e))
  let rest = 100 - floors.reduce((a, b) => a + b, 0)
  const order = exact
    .map((e, index) => ({ index, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index)
  for (const { index } of order) {
    if (rest <= 0) break
    floors[index] += 1
    rest -= 1
  }
  return {
    items: known.map((x, i) => ({
      meal: x.meal,
      kcal: x.kcal,
      percent: floors[i],
    })),
    totalKcal: total,
  }
}

/** 기록 한 건의 열량(없으면 null). 끼니 카드의 음식 줄에 쓴다. */
export function recordKcal(record: MealRecord): number | null {
  return mealNutrition(record).kcal
}
