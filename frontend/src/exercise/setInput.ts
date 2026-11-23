import { MAX_MEASURED_MS } from './workoutModel.ts'

/**
 * 세트 입력 숫자의 한계와 파서(순수 함수). 화면 입력(W14 입력 폼)·세트 완료(workoutProgress.completeSet)·신규 완료 검증
 * (completedSetValidation)이 같은 규칙을 쓰도록 한 곳에 둔다. workoutProgress가 그대로 다시 내보낸다.
 *
 * 입력 한계(횟수 1~999, 중량 0~999kg·소수점 첫째 자리)는 사용자가 입력하는 값에 적용한다. 모델 규칙(횟수 1 이상 정수, 중량 0 이상)보다 좁을 뿐 충돌하지 않는다.
 */

export const MIN_REPS = 1
export const MAX_REPS = 999
export const MIN_WEIGHT_KG = 0
export const MAX_WEIGHT_KG = 999

/** 사용자가 입력한 원문(문자열) 또는 숫자. */
export type NumberInput = string | number | null | undefined

export type RepsParse =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'format' | 'range' }

/** 실제 횟수: 1~999 정수. 숫자 외 글자·소수·빈 값은 거부한다. */
export function parseReps(raw: NumberInput): RepsParse {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' }
  let value: number
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || !Number.isInteger(raw)) {
      return { ok: false, reason: 'format' }
    }
    value = raw
  } else {
    const text = raw.trim()
    if (text === '') return { ok: false, reason: 'empty' }
    if (!/^\d+$/.test(text)) return { ok: false, reason: 'format' }
    value = Number(text)
  }
  if (value < MIN_REPS || value > MAX_REPS)
    return { ok: false, reason: 'range' }
  return { ok: true, value }
}

export type WeightParse =
  | { ok: true; value: number | undefined }
  | { ok: false; reason: 'format' | 'range' | 'decimals' }

/**
 * 실제 중량: 0~999kg, 소수점 첫째 자리까지. 비어 있으면 "중량 미입력"(value undefined)으로 허용한다(모델도 중량은 선택이다).
 * 음수·쉼표 소수·문자는 형식 오류, 소수 둘째 자리 이상은 자릿수 오류다.
 */
export function parseWeightKg(raw: NumberInput): WeightParse {
  if (raw === null || raw === undefined) return { ok: true, value: undefined }
  let value: number
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return { ok: false, reason: 'format' }
    value = raw
    if (value < MIN_WEIGHT_KG) return { ok: false, reason: 'range' }
    if (value > MAX_WEIGHT_KG) return { ok: false, reason: 'range' }
    if (Math.abs(value * 10 - Math.round(value * 10)) > 1e-9) {
      return { ok: false, reason: 'decimals' }
    }
    return { ok: true, value }
  }
  const text = raw.trim()
  if (text === '') return { ok: true, value: undefined }
  if (!/^\d+(\.\d+)?$/.test(text)) return { ok: false, reason: 'format' }
  value = Number(text)
  if (value > MAX_WEIGHT_KG) return { ok: false, reason: 'range' }
  const fraction = text.split('.')[1]
  if (fraction !== undefined && fraction.length > 1) {
    return { ok: false, reason: 'decimals' }
  }
  return { ok: true, value }
}

export type DurationParse =
  | { ok: true; value: number }
  | { ok: false; reason: 'empty' | 'format' | 'range' }

/**
 * 실제 측정 시간 입력(W15 편집)을 ms로 바꾼다. 초 단위 숫자("55", "55.5")와 분:초("1:05", "1:05.5")를 받는다.
 * 소수는 밀리초(셋째 자리)까지, 분:초의 초는 0~59다. 1ms 이상 24시간(MAX_MEASURED_MS) 이하만 허용한다(0·음수·상한 초과는 range).
 * 숫자(number)는 초로 본다. NaN·Infinity는 format이다.
 */
export function parseDurationInput(raw: NumberInput): DurationParse {
  if (raw === null || raw === undefined) return { ok: false, reason: 'empty' }
  let text: string
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return { ok: false, reason: 'format' }
    text = String(raw)
    if (/e/i.test(text)) return { ok: false, reason: 'format' }
  } else {
    text = raw.trim()
  }
  if (text === '') return { ok: false, reason: 'empty' }
  const match = /^(?:(\d{1,4}):(\d{1,2})|(\d{1,6}))(?:\.(\d{1,3}))?$/.exec(text)
  if (!match) return { ok: false, reason: 'format' }
  let seconds: number
  if (match[1] !== undefined) {
    const sec = Number(match[2])
    if (sec > 59) return { ok: false, reason: 'format' }
    seconds = Number(match[1]) * 60 + sec
  } else {
    seconds = Number(match[3])
  }
  const fraction = match[4] === undefined ? 0 : Number(match[4].padEnd(3, '0'))
  const ms = seconds * 1000 + fraction
  if (ms < 1 || ms > MAX_MEASURED_MS) return { ok: false, reason: 'range' }
  return { ok: true, value: ms }
}
