/**
 * 신체 정보 입력 검증. 화면 명세 v5.0 P06의 데이터 규약을 따른다: 소수점 첫째 자리, 키 1~300cm, 몸무게 1~500kg.
 * 의학적 정상 범위를 강제하지 않고 "유한한 양수 + 명세의 입력 범위"만 확인한다.
 * 같은 검증을 화면과 저장소(서버를 흉내 내는 Mock)가 함께 쓴다. 실제 서비스에서는 서버도 같은 검증을 해야 한다.
 */

export interface MeasurementRange {
  min: number
  max: number
}

export const HEIGHT_RANGE: MeasurementRange = { min: 1, max: 300 }
export const WEIGHT_RANGE: MeasurementRange = { min: 1, max: 500 }

export type MeasurementError = 'empty' | 'format' | 'range'

export type ParsedMeasurement =
  { ok: true; value: number } | { ok: false; reason: MeasurementError }

/** 숫자 + 선택적 소수점 첫째 자리(예: 170, 170.5). 지수 표기·부호·공백·소수점 둘째 자리는 허용하지 않는다. */
const DECIMAL_PATTERN = /^\d+(\.\d)?$/

/** 입력 문자열을 검증해 숫자로 바꾼다. */
export function parseMeasurement(
  text: string,
  range: MeasurementRange,
): ParsedMeasurement {
  const trimmed = text.trim()
  if (trimmed === '') return { ok: false, reason: 'empty' }
  if (!DECIMAL_PATTERN.test(trimmed)) return { ok: false, reason: 'format' }
  const value = Number(trimmed)
  if (!Number.isFinite(value) || value < range.min || value > range.max) {
    return { ok: false, reason: 'range' }
  }
  return { ok: true, value }
}

/** 이미 숫자인 값이 유효한 키·몸무게인가(저장소가 저장된 값과 요청 값을 검증할 때 쓴다). */
export function isValidMeasurement(
  value: unknown,
  range: MeasurementRange,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= range.min &&
    value <= range.max &&
    Math.abs(value * 10 - Math.round(value * 10)) < 1e-9 // 소수점 첫째 자리까지만(부동소수점 오차 허용)
  )
}
