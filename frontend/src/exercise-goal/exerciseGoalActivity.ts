import type { ExerciseGoalContext } from './exerciseGoalTypes.ts'

/** 2024 Compendium의 분류값이다. 개별 동작이나 개인의 실측 소모량으로 해석하지 않는다. */
export const BEGINNER_BODYWEIGHT_ACTIVITIES = [
  {
    id: 'light-core',
    label: '가벼운 코어 운동',
    description: '가벼운 플랭크·크런치 계열',
    met: 2.8,
    code: '02024',
  },
  {
    id: 'bodyweight-strength',
    label: '맨몸 근력 운동',
    description: '스쿼트·런지 등 맨몸 근력 계열',
    met: 3.0,
    code: '02056',
  },
  {
    id: 'light-circuit',
    label: '가벼운 순환 운동',
    description: '쉬운 동작을 번갈아 하는 낮은 강도 운동',
    met: 3.5,
    code: '02034',
  },
] as const

export type BeginnerBodyweightActivityId =
  (typeof BEGINNER_BODYWEIGHT_ACTIVITIES)[number]['id']
export const ACTIVITY_REFERENCE_WEEKS = 4
export const ENERGY_EQUIVALENT_KCAL_PER_KG = 7700

export function isBeginnerActivityId(
  value: unknown,
): value is BeginnerBodyweightActivityId {
  return BEGINNER_BODYWEIGHT_ACTIVITIES.some(
    (activity) => activity.id === value,
  )
}

/** 휴식 1 MET를 뺀 추가 소모량의 산술 예시다. 실제 감량 예측이나 열량 처방이 아니다. */
export function activityEnergyReference(
  weightKg: number,
  daysPerWeek: number,
  minutesPerSession: number,
  activityId: unknown,
) {
  const activity = BEGINNER_BODYWEIGHT_ACTIVITIES.find(
    (item) => item.id === activityId,
  )
  if (
    !activity ||
    !Number.isFinite(weightKg) ||
    weightKg < 25 ||
    weightKg > 250 ||
    !Number.isInteger(daysPerWeek) ||
    daysPerWeek < 1 ||
    daysPerWeek > 7 ||
    !Number.isInteger(minutesPerSession) ||
    minutesPerSession < 5 ||
    minutesPerSession > 180
  )
    return null
  const weeklyMinutes = daysPerWeek * minutesPerSession
  const weeklyNetKcal = ((activity.met - 1) * weightKg * weeklyMinutes) / 60
  const periodNetKcal = weeklyNetKcal * ACTIVITY_REFERENCE_WEEKS
  return {
    activity,
    weeks: ACTIVITY_REFERENCE_WEEKS,
    weeklyMinutes,
    weeklyNetKcal,
    periodNetKcal,
    energyEquivalentKg: periodNetKcal / ENERGY_EQUIVALENT_KCAL_PER_KG,
  }
}

/** 초급자가 확인할 시작 예시다. 목표 체중에서 필요한 운동량을 역산한 처방이 아니다. */
export function beginnerLossPlan(context: ExerciseGoalContext, age: number) {
  const minutesPerSession =
    age >= 65 || context.exerciseTier === null
      ? 10
      : context.healthGoal.focus === 'meal'
        ? 15
        : 20
  const sessionMinutes = [
    ...new Set([minutesPerSession, Math.min(30, minutesPerSession + 10), 30]),
  ]
  return sessionMinutes.map((minutes) => ({
    daysPerWeek: 3,
    minutesPerSession: minutes,
    weeklyMinutes: 3 * minutes,
  }))
}
