import {
  HEIGHT_RANGE,
  WEIGHT_RANGE,
  isValidMeasurement,
} from './bodyValidation.ts'

/**
 * 신체 수치의 표시용 계산. P01이 PIN 열람 권한으로 읽은 값을 보여 줄 때만 쓴다.
 * BMI는 화면명세 v5.0 P01 규약대로 kg/(m²)이며 소수점 첫째 자리로 반올림한다. 의학적 판정(저체중·과체중 등)은 하지 않는다.
 */
export function calculateBmi(
  heightCm: number | null,
  weightKg: number | null,
): number | null {
  if (
    !isValidMeasurement(heightCm, HEIGHT_RANGE) ||
    !isValidMeasurement(weightKg, WEIGHT_RANGE)
  )
    return null
  const meters = heightCm / 100
  return Math.round((weightKg / (meters * meters)) * 10) / 10
}
