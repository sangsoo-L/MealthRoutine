import {
  WEIGHT_RANGE,
  isValidMeasurement,
} from '../../body-measurements/bodyValidation.ts'
import { mockDelay, mockFlag, mockKey } from '../../dev-mock/devMockStorage.ts'
import { seoulToday, compareIsoDates } from '../weightDate.ts'
import {
  computeWeightCheckStatus,
  latestWeightEntry,
  parseStoredWeightLog,
} from '../weightLogStatus.ts'
import {
  WeightLogError,
  type WeightEntry,
  type WeightLogInput,
  type WeightLogRepository,
} from '../weightLogTypes.ts'

/**
 * [개발 전용] 몸무게 기록 Mock 저장소. 서버가 맡을 보관·정합성을 개발 환경에서 흉내 낸다. 개발 서버에서만 불러온다(weightLogSource.ts).
 *
 * 저장 위치(localStorage, 계정 id가 키에 들어간다. 다른 계정의 키는 읽지 않는다)
 * - 이력: `mealthroutine.dev.mock.weightLog.<사용자 id>` = { v: 1, ownerId, entries: [...] } (개수 제한 없음)
 * - 현재 몸무게: 기존 신체 정보 `mealthroutine.dev.mock.body.<사용자 id>`의 weightKg·updatedAt. 다른 필드(heightCm, exerciseGoalProfile 등)는 이어받는다.
 *
 * 정합성(원자적 갱신이 불가능한 이유와 대응)
 * - 이력과 신체 정보는 서로 다른 localStorage 키라 한 번에 쓸 수 없다. 그래서 "이력 → 신체 정보" 순서로 쓴다.
 * - 신체 정보 쓰기가 실패하면, 방금 쓴 이력만 쓰기 전 값으로 되돌린다(이 기록이 만든 변경에 한정한 되돌림이다). 되돌림까지 실패하면
 *   'partialSave'를 던지고 더 이상 손대지 않는다.
 * - 읽을 때 마지막 이력의 몸무게와 현재 몸무게가 다르면 상태의 consistent가 false다. 이를 자동으로 고치지 않는다.
 *   불일치 상태에서 "지난번과 같아요"는 무엇을 복사해야 할지 알 수 없으므로 'inconsistent'로 거부한다.
 * - 손상된 이력·신체 정보 위에는 쓰지 않는다('corrupt').
 *
 * 기존 신체 정보에 기록 날짜가 없는 몸무게가 있어도 이력을 자동으로 만들지 않는다(상태의 legacyWeightUndated로만 알린다).
 * 이력의 수치를 읽는 메서드는 없다(PIN 보호). 몸무게 수치·저장 내용은 오류 메시지나 콘솔에 쓰지 않는다. 운동 목표는 건드리지 않는다.
 * 짧은 지연을 둔다. 개발·검수용 스위치(mockFlag)의 `weightLog` 도메인으로 조회·저장 실패를 재현할 수 있다.
 */

export interface MockWeightLogOptions {
  userId: string
  latencyMs?: number
  /** 기록일·생성 시각의 기준 시각. 테스트에서 시간을 고정한다. */
  now?: () => Date
  newId?: () => string
}

function defaultId(): string {
  const uuid = globalThis.crypto?.randomUUID?.()
  return (
    uuid ??
    `w-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  )
}

export function createMockWeightLogRepository(
  options: MockWeightLogOptions,
): WeightLogRepository {
  const { userId, latencyMs = 300 } = options
  const now = options.now ?? (() => new Date())
  const newId = options.newId ?? defaultId
  if (!userId || userId.length > 200) throw new WeightLogError('invalidInput')
  const logKey = mockKey('weightLog', userId)
  const bodyKey = mockKey('body', userId)

  function getRaw(key: string): string | null {
    try {
      return window.localStorage.getItem(key)
    } catch {
      throw new WeightLogError('load')
    }
  }
  function parseJson(raw: string): unknown {
    try {
      return JSON.parse(raw)
    } catch {
      throw new WeightLogError('corrupt')
    }
  }
  function readEntries(): { entries: WeightEntry[]; raw: string | null } {
    if (mockFlag('failLoad', 'weightLog')) throw new WeightLogError('load')
    const raw = getRaw(logKey)
    if (raw === null) return { entries: [], raw }
    const entries = parseStoredWeightLog(parseJson(raw), userId)
    if (!entries) throw new WeightLogError('corrupt')
    return { entries, raw }
  }
  /** 신체 정보 객체(없으면 null). 객체가 아니거나 버전이 다르면 손상이다. */
  function readBody(): Record<string, unknown> | null {
    if (mockFlag('failLoad', 'body')) throw new WeightLogError('load')
    const raw = getRaw(bodyKey)
    if (raw === null) return null
    const value = parseJson(raw)
    if (
      typeof value !== 'object' ||
      value === null ||
      Array.isArray(value) ||
      (value as Record<string, unknown>).v !== 1
    )
      throw new WeightLogError('corrupt')
    return value as Record<string, unknown>
  }
  const currentWeightOf = (body: Record<string, unknown> | null) =>
    body && isValidMeasurement(body.weightKg, WEIGHT_RANGE)
      ? body.weightKg
      : null

  return {
    kind: 'mock',

    async getCheckStatus() {
      await mockDelay(latencyMs)
      const { entries } = readEntries()
      return computeWeightCheckStatus({
        entries,
        currentWeightKg: currentWeightOf(readBody()),
        now: now(),
      })
    },

    async logWeight(input: WeightLogInput) {
      await mockDelay(latencyMs)
      // 입력 형태를 먼저 확인한다(null·문자열 등에서 예외가 나지 않게).
      if (typeof input !== 'object' || input === null)
        throw new WeightLogError('invalidInput')
      const sameAsLast = 'sameAsLast' in input && input.sameAsLast === true
      if (!sameAsLast && !('weightKg' in input))
        throw new WeightLogError('invalidInput')
      if (
        !sameAsLast &&
        !isValidMeasurement(
          (input as { weightKg: unknown }).weightKg,
          WEIGHT_RANGE,
        )
      )
        throw new WeightLogError('invalidWeight')
      const at = now()
      const today = seoulToday(at)
      if (today === null) throw new WeightLogError('invalidDate')

      // 쓰기 전에 읽고 검증한다. 어느 하나라도 손상됐으면 아무것도 쓰지 않는다.
      const { entries, raw: previousLogRaw } = readEntries()
      const body = readBody()
      const last = latestWeightEntry(entries)
      // 마지막 기록일이 오늘보다 늦으면 새 기록이 "마지막"이 될 수 없어 이력과 현재 몸무게가 어긋난다. 기록하지 않는다.
      if (last && compareIsoDates(last.recordedOn, today) > 0)
        throw new WeightLogError('invalidDate')

      let weightKg: number
      if (sameAsLast) {
        if (!last) throw new WeightLogError('noPrevious')
        const current = currentWeightOf(body)
        if (current === null || Math.abs(current - last.weightKg) >= 1e-9)
          throw new WeightLogError('inconsistent')
        weightKg = last.weightKg
      } else {
        weightKg = (input as { weightKg: number }).weightKg
      }

      const createdAt = at.toISOString()
      const entry: WeightEntry = {
        id: newId(),
        userId,
        recordedOn: today,
        weightKg,
        kind:
          entries.length === 0
            ? 'initial'
            : sameAsLast
              ? 'same-as-last'
              : 'recorded',
        createdAt,
      }
      const nextEntries = [...entries, entry]

      if (mockFlag('failSave', 'weightLog')) throw new WeightLogError('save')
      // 1) 이력. 실패해도 아직 아무것도 바뀌지 않았다.
      try {
        window.localStorage.setItem(
          logKey,
          JSON.stringify({ v: 1, ownerId: userId, entries: nextEntries }),
        )
      } catch {
        throw new WeightLogError('save')
      }
      // 2) 현재 몸무게. 다른 필드(키, exerciseGoalProfile 등)는 이어받는다.
      try {
        if (mockFlag('failSave', 'body')) throw new Error('mock save failure')
        window.localStorage.setItem(
          bodyKey,
          JSON.stringify({ ...body, v: 1, weightKg, updatedAt: createdAt }),
        )
      } catch {
        // 이 기록이 방금 쓴 이력만 되돌린다. 되돌림이 실패하면 더 손대지 않고 알린다.
        try {
          if (previousLogRaw === null) window.localStorage.removeItem(logKey)
          else window.localStorage.setItem(logKey, previousLogRaw)
          if (getRaw(logKey) !== previousLogRaw)
            throw new WeightLogError('partialSave')
        } catch {
          throw new WeightLogError('partialSave')
        }
        throw new WeightLogError('save')
      }
      return computeWeightCheckStatus({
        entries: nextEntries,
        currentWeightKg: weightKg,
        now: at,
      })
    },
  }
}
