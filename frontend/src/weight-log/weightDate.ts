/**
 * 몸무게 기록의 날짜 계산. 순수 함수만 둔다(저장소·화면에 의존하지 않는다).
 *
 * 날짜는 시간대가 없는 달력 날짜 문자열 'YYYY-MM-DD'로만 다룬다. 기준 시간대는 Asia/Seoul이다.
 * 달력 계산은 Date 객체를 쓰지 않고 정수로 한다. 기기의 시간대·서머타임·UTC 변환 때문에 하루가 밀리는 일을 막기 위해서다.
 * 시각(Date)을 날짜로 바꾸는 곳은 `seoulToday` 하나뿐이다.
 */

export const WEIGHT_LOG_TIME_ZONE = 'Asia/Seoul'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MIN_YEAR = 1900
const MAX_YEAR = 2200

export interface CalendarDate {
  year: number
  month: number
  day: number
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28
  return [4, 6, 9, 11].includes(month) ? 30 : 31
}

/** 'YYYY-MM-DD'를 엄격하게 해석한다. 형식이 다르거나 없는 날짜(2026-02-30 등)이면 null. */
export function parseIsoDate(value: unknown): CalendarDate | null {
  if (typeof value !== 'string') return null
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  if (month < 1 || month > 12) return null
  if (day < 1 || day > daysInMonth(year, month)) return null
  return { year, month, day }
}

export function isValidIsoDate(value: unknown): value is string {
  return parseIsoDate(value) !== null
}

export function formatIsoDate(date: CalendarDate): string {
  const pad = (n: number, width: number) => String(n).padStart(width, '0')
  return `${pad(date.year, 4)}-${pad(date.month, 2)}-${pad(date.day, 2)}`
}

/** 두 날짜 문자열 비교(사전순이 곧 달력순이다). 앞이 이르면 음수, 같으면 0, 늦으면 양수. 형식 검증은 호출자가 한다. */
export function compareIsoDates(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * 달력 기준으로 n개월 뒤 날짜. 해당 월에 같은 날짜가 없으면 그 달의 마지막 날로 보정한다.
 * 예) 1/31 + 1개월 = 2/28(윤년이면 2/29), 3/31 + 1개월 = 4/30, 12/15 + 1개월 = 다음 해 1/15.
 * 잘못된 날짜이면 null.
 */
export function addCalendarMonths(
  value: string,
  months: number,
): string | null {
  const date = parseIsoDate(value)
  if (!date || !Number.isInteger(months)) return null
  const index = date.year * 12 + (date.month - 1) + months
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  if (year < MIN_YEAR || year > MAX_YEAR) return null
  return formatIsoDate({
    year,
    month,
    day: Math.min(date.day, daysInMonth(year, month)),
  })
}

const seoulParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: WEIGHT_LOG_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 시각을 서울 기준 달력 날짜로 바꾼다. 기기의 시간대와 무관하다. 잘못된 Date이면 null. */
export function seoulToday(now: Date): string | null {
  if (!Number.isFinite(now.getTime())) return null
  const parts = seoulParts.formatToParts(now)
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const result = `${get('year')}-${get('month')}-${get('day')}`
  return isValidIsoDate(result) ? result : null
}
