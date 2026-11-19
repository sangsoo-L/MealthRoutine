import {
  WEIGHT_RANGE,
  isValidMeasurement,
} from '../body-measurements/bodyValidation.ts'
import {
  addCalendarMonths,
  compareIsoDates,
  isValidIsoDate,
  seoulToday,
} from './weightDate.ts'
import {
  WeightLogError,
  type WeightCheckStatus,
  type WeightEntry,
  type WeightEntryKind,
} from './weightLogTypes.ts'

/** 확인 안내 간격: 마지막 기록일의 달력 기준 1개월 뒤 */
export const WEIGHT_CHECK_INTERVAL_MONTHS = 1

const KINDS: readonly WeightEntryKind[] = [
  'initial',
  'recorded',
  'same-as-last',
]

/**
 * 저장된 이력(JSON을 해석한 값)을 검증한다. 하나라도 형식이 어긋나면 이력 전체를 손상으로 보고 null을 돌려준다
 * (일부만 골라 쓰거나 고쳐서 이어 쓰지 않는다). 다른 계정의 기록이 섞여 있어도 손상이다.
 * 몸무게는 신체 정보 입력과 같은 기준(1~500kg, 소수점 첫째 자리)이다.
 */
export function parseStoredWeightLog(
  value: unknown,
  userId: string,
): WeightEntry[] | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null
  const stored = value as Record<string, unknown>
  if (stored.v !== 1 || stored.ownerId !== userId) return null
  if (!Array.isArray(stored.entries)) return null
  const ids = new Set<string>()
  const entries: WeightEntry[] = []
  for (const item of stored.entries) {
    if (typeof item !== 'object' || item === null) return null
    const e = item as Record<string, unknown>
    if (
      typeof e.id !== 'string' ||
      e.id === '' ||
      ids.has(e.id) ||
      e.userId !== userId ||
      !isValidIsoDate(e.recordedOn) ||
      !isValidMeasurement(e.weightKg, WEIGHT_RANGE) ||
      !KINDS.includes(e.kind as WeightEntryKind) ||
      typeof e.createdAt !== 'string' ||
      !Number.isFinite(Date.parse(e.createdAt))
    )
      return null
    ids.add(e.id)
    entries.push({
      id: e.id,
      userId: e.userId,
      recordedOn: e.recordedOn,
      weightKg: e.weightKg,
      kind: e.kind as WeightEntryKind,
      createdAt: e.createdAt,
    })
  }
  return entries
}

/** 가장 최근 기록: 기록일 → 생성 시각 → 저장 순서 순으로 늦은 것. 이력이 없으면 null. */
export function latestWeightEntry(
  entries: readonly WeightEntry[],
): WeightEntry | null {
  let latest: WeightEntry | null = null
  for (const entry of entries) {
    if (
      latest === null ||
      compareIsoDates(entry.recordedOn, latest.recordedOn) > 0 ||
      (entry.recordedOn === latest.recordedOn &&
        Date.parse(entry.createdAt) >= Date.parse(latest.createdAt))
    )
      latest = entry
  }
  return latest
}

/**
 * 수치 없는 확인 상태를 계산한다.
 * - 오늘은 서울 기준 날짜다. 다음 확인일은 마지막 기록일의 달력 기준 1개월 뒤(말일 보정)이고, 오늘이 그날이거나 지났으면 확인이 필요하다.
 * - 이력이 없으면 확인 안내를 만들지 않는다(기존 몸무게의 기록일을 알 수 없으므로 임의로 정하지 않는다).
 * - 마지막 기록일이 오늘보다 늦으면(기기 시계 오류 등) 다음 확인일을 계산하지 않는다.
 * currentWeightKg는 신체 정보의 현재 몸무게(유효하지 않거나 없으면 null)이며 일치 여부 판단에만 쓰고 결과에 담지 않는다.
 */
export function computeWeightCheckStatus(args: {
  entries: readonly WeightEntry[]
  currentWeightKg: number | null
  now: Date
}): WeightCheckStatus {
  const today = seoulToday(args.now)
  if (today === null) throw new WeightLogError('invalidDate')
  const last = latestWeightEntry(args.entries)
  if (last === null) {
    return {
      today,
      lastRecordedOn: null,
      nextDueOn: null,
      needsCheck: false,
      reason: 'no-history',
      legacyWeightUndated: args.currentWeightKg !== null,
      consistent: true,
    }
  }
  const consistent =
    args.currentWeightKg !== null &&
    Math.abs(args.currentWeightKg - last.weightKg) < 1e-9
  if (compareIsoDates(last.recordedOn, today) > 0) {
    return {
      today,
      lastRecordedOn: last.recordedOn,
      nextDueOn: null,
      needsCheck: false,
      reason: 'future-date',
      legacyWeightUndated: false,
      consistent,
    }
  }
  const nextDueOn = addCalendarMonths(
    last.recordedOn,
    WEIGHT_CHECK_INTERVAL_MONTHS,
  )
  const due = nextDueOn !== null && compareIsoDates(today, nextDueOn) >= 0
  return {
    today,
    lastRecordedOn: last.recordedOn,
    nextDueOn,
    needsCheck: due,
    reason: due ? 'due' : 'not-due',
    legacyWeightUndated: false,
    consistent,
  }
}
