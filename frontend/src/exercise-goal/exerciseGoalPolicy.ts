import { parseStoredGoal } from '../health-goal/goalPolicy.ts'
import {
  beginnerLossPlan,
  isBeginnerActivityId,
} from './exerciseGoalActivity.ts'
import type {
  ExerciseGoal,
  ExerciseGoalContext,
  ExerciseGoalDraft,
  ExerciseGoalMode,
  ExerciseGoalProfile,
  ExerciseGoalPurpose,
} from './exerciseGoalTypes.ts'

export const PURPOSE_LABEL: Record<ExerciseGoalPurpose, string> = {
  lose: '체중 감량',
  learn: '운동 알아가기',
  maintain: '체중 유지',
  bulk: '벌크업 · 근육 키우기',
}
export const TIER_LABEL = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
} as const

/** 한국 성인 정상 참고 범위의 중앙값이다. 인구 평균이나 의료 처방값이 아니다. */
export const KOREAN_BMI_MIN = 18.5
export const KOREAN_BMI_MAX_EXCLUSIVE = 23
export const REFERENCE_BMI = (KOREAN_BMI_MIN + KOREAN_BMI_MAX_EXCLUSIVE) / 2
export const LOSS_REFERENCE_BMI = REFERENCE_BMI - 1.5
export const LEARN_BMI_REDUCTION = 0.1
export const INITIAL_LOSS_FRACTION = 0.05

const ceilTenth = (value: number) => Math.ceil(value * 10) / 10

/** 목표 숫자는 운동 효과의 예상값이 아닌 사용자가 선택할 참고값이다. */
export function beginnerBmiGoals(
  profile: ExerciseGoalProfile,
  version: 2 | 3 = 3,
) {
  const heightSquared = (profile.heightCm / 100) ** 2
  const currentBmi = profile.weightKg / heightSquared
  const lowerWeight = Math.max(25, KOREAN_BMI_MIN * heightSquared)
  const learnTargetWeightKg = Math.min(
    profile.weightKg,
    ceilTenth(
      Math.max(
        lowerWeight,
        profile.weightKg - LEARN_BMI_REDUCTION * heightSquared,
      ),
    ),
  )
  const lossTargetWeightKg = ceilTenth(
    Math.max(
      lowerWeight,
      LOSS_REFERENCE_BMI * heightSquared,
      // 기존 고정 BMI 목표는 읽을 때만 재현한다. 새 첫 목표는 현재 체중의 5% 이내다.
      version === 3 ? profile.weightKg * (1 - INITIAL_LOSS_FRACTION) : 0,
    ),
  )
  return {
    currentBmi,
    learnTargetWeightKg,
    lossTargetWeightKg,
    canMaintain:
      currentBmi >= KOREAN_BMI_MIN && currentBmi < KOREAN_BMI_MAX_EXCLUSIVE,
    // 현재보다 낮고, 학습 목표보다 감량 폭이 큰 경우에만 감량 선택지를 제공한다.
    canLose: lossTargetWeightKg < learnTargetWeightKg,
  }
}

export function exerciseGoalMode(
  tier: ExerciseGoalContext['exerciseTier'],
): ExerciseGoalMode {
  return tier === 'intermediate' || tier === 'advanced' ? 'detailed' : 'simple'
}
export function goalPurposes(
  mode: ExerciseGoalMode,
  profile: ExerciseGoalProfile,
  version: 2 | 3 = 3,
): readonly ExerciseGoalPurpose[] {
  const bmi = beginnerBmiGoals(profile, version)
  const purposes: readonly ExerciseGoalPurpose[] =
    mode === 'simple'
      ? ['learn', 'maintain', 'lose']
      : ['lose', 'bulk', 'maintain']
  return purposes.filter(
    (purpose) =>
      (purpose !== 'maintain' || bmi.canMaintain) &&
      (mode !== 'simple' || purpose !== 'lose' || bmi.canLose),
  )
}

export function validGoalProfile(value: unknown): value is ExerciseGoalProfile {
  if (typeof value !== 'object' || value === null) return false
  const p = value as Record<string, unknown>
  const tenth = (x: unknown, min: number, max: number): x is number =>
    typeof x === 'number' &&
    Number.isFinite(x) &&
    x >= min &&
    x <= max &&
    Math.abs(x * 10 - Math.round(x * 10)) < 1e-8
  return (
    typeof p.age === 'number' &&
    Number.isInteger(p.age) &&
    p.age >= 18 &&
    p.age <= 100 &&
    (p.sex === 'male' || p.sex === 'female') &&
    tenth(p.heightCm, 100, 230) &&
    tenth(p.weightKg, 25, 250) &&
    typeof p.updatedAt === 'string' &&
    Number.isFinite(Date.parse(p.updatedAt))
  )
}

/** 관리 비중은 운동 강도가 아니다. 수치는 사용자가 확인할 서비스 시작 계획의 예시다. */
export function startingPlan(
  context: ExerciseGoalContext,
  purpose: ExerciseGoalPurpose,
  age: number,
) {
  return {
    daysPerWeek:
      purpose === 'learn' ? 3 : context.healthGoal.focus === 'meal' ? 2 : 3,
    minutesPerSession: purpose === 'learn' || age >= 65 ? 10 : 20,
  }
}

export function initialGoalDraft(
  context: ExerciseGoalContext,
  profile: ExerciseGoalProfile,
  saved: ExerciseGoal | null,
): ExerciseGoalDraft {
  const allowed = goalPurposes(exerciseGoalMode(context.exerciseTier), profile)
  const purpose = saved && allowed.includes(saved.purpose) ? saved.purpose : ''
  const plan = startingPlan(context, purpose || 'maintain', profile.age)
  return {
    purpose,
    activityId: saved?.activityId ?? '',
    targetWeightKg: String(saved?.targetWeightKg ?? profile.weightKg),
    daysPerWeek: String(saved?.daysPerWeek ?? plan.daysPerWeek),
    minutesPerSession: String(
      saved?.minutesPerSession ?? plan.minutesPerSession,
    ),
  }
}

export type GoalIssue = {
  field: keyof ExerciseGoalDraft | 'profile'
  message: string
}
export type GoalCalculation =
  { ok: true; goal: ExerciseGoal } | { ok: false; issues: readonly GoalIssue[] }

export function calculateExerciseGoal(
  draft: ExerciseGoalDraft,
  context: ExerciseGoalContext,
  profile: ExerciseGoalProfile,
  now = new Date(),
): GoalCalculation {
  return calculateGoalByVersion(draft, context, profile, now, 4)
}

/** 기존 목표는 저장 당시의 계산 버전으로 검증해 읽고, 자동으로 새 목표로 바꾸지 않는다. */
function calculateGoalByVersion(
  draft: ExerciseGoalDraft,
  context: ExerciseGoalContext,
  profile: ExerciseGoalProfile,
  now: Date,
  version: 1 | 2 | 3 | 4,
): GoalCalculation {
  const issues: GoalIssue[] = []
  if (!validGoalProfile(profile))
    return {
      ok: false,
      issues: [
        { field: 'profile', message: '성인 회원의 신체 정보를 확인해 주세요.' },
      ],
    }
  const mode = exerciseGoalMode(context.exerciseTier)
  const allowed: readonly ExerciseGoalPurpose[] =
    version === 1
      ? mode === 'simple'
        ? ['learn', 'maintain', 'lose']
        : ['lose', 'bulk', 'maintain']
      : goalPurposes(mode, profile, version === 4 ? 3 : version)
  if (!draft.purpose || !allowed.includes(draft.purpose))
    return {
      ok: false,
      issues: [{ field: 'purpose', message: '운동 목적을 선택해 주세요.' }],
    }
  const purpose = draft.purpose
  const usesActivity =
    version === 4 &&
    mode === 'simple' &&
    (purpose === 'learn' || purpose === 'lose')
  if (usesActivity && !isBeginnerActivityId(draft.activityId))
    return {
      ok: false,
      issues: [
        {
          field: 'activityId',
          message: '계산에 사용할 맨몸 운동 종류를 선택해 주세요.',
        },
      ],
    }
  const metersSquared = (profile.heightCm / 100) ** 2
  const bmi = profile.weightKg / metersSquared
  let targetWeightKg: number
  const plan =
    version === 1
      ? {
          daysPerWeek: context.healthGoal.focus === 'meal' ? 2 : 3,
          minutesPerSession: purpose === 'learn' || profile.age >= 65 ? 10 : 20,
        }
      : version === 4 && mode === 'simple' && purpose === 'lose'
        ? beginnerLossPlan(context, profile.age)[0]
        : startingPlan(context, purpose, profile.age)
  let { daysPerWeek, minutesPerSession } = plan
  if (mode === 'simple' && version !== 1) {
    const targets = beginnerBmiGoals(profile, version === 4 ? 3 : version)
    targetWeightKg =
      purpose === 'lose'
        ? targets.lossTargetWeightKg
        : purpose === 'learn'
          ? version === 4
            ? profile.weightKg
            : targets.learnTargetWeightKg
          : profile.weightKg
  } else if (mode === 'simple') {
    // 5%는 과체중 성인을 위한 첫 목표 예시다. 운동 학습·유지를 감량으로 바꾸지 않는다.
    targetWeightKg =
      purpose === 'lose'
        ? Math.max(
            25,
            Math.round(profile.weightKg * 0.95 * 10) / 10,
            Math.ceil(18.5 * metersSquared * 10) / 10,
          )
        : profile.weightKg
    if (purpose === 'lose' && (bmi < 25 || targetWeightKg >= profile.weightKg))
      issues.push({
        field: 'purpose',
        message:
          '현재 신체 정보에서는 감량 목표를 자동 제안하지 않아요. 운동 알아가기나 체중 유지를 선택해 주세요.',
      })
  } else {
    targetWeightKg = Number(draft.targetWeightKg)
    if (
      !/^\d+(\.\d)?$/.test(draft.targetWeightKg) ||
      targetWeightKg < 25 ||
      targetWeightKg > 250
    )
      issues.push({
        field: 'targetWeightKg',
        message:
          '목표 체중은 25~250kg 사이에서 소수점 첫째 자리까지 입력해 주세요.',
      })
    else if (
      purpose === 'lose' &&
      (targetWeightKg >= profile.weightKg ||
        targetWeightKg / metersSquared < 18.5)
    )
      issues.push({
        field: 'targetWeightKg',
        message:
          '감량 목표는 현재보다 낮고 참고 BMI 18.5 이상인 체중으로 입력해 주세요.',
      })
    else if (purpose === 'bulk' && targetWeightKg <= profile.weightKg)
      issues.push({
        field: 'targetWeightKg',
        message: '벌크업 목표는 현재 체중보다 높게 입력해 주세요.',
      })
    else if (
      purpose === 'maintain' &&
      Math.abs(targetWeightKg - profile.weightKg) > 1 + 1e-8
    )
      issues.push({
        field: 'targetWeightKg',
        message: '유지 목표는 현재 체중에서 ±1kg 범위로 입력해 주세요.',
      })
    daysPerWeek = Number(draft.daysPerWeek)
    minutesPerSession = Number(draft.minutesPerSession)
    if (!/^[1-7]$/.test(draft.daysPerWeek))
      issues.push({
        field: 'daysPerWeek',
        message: '주간 운동 횟수는 1~7회로 입력해 주세요.',
      })
    if (
      !/^\d+$/.test(draft.minutesPerSession) ||
      minutesPerSession < 5 ||
      minutesPerSession > 180 ||
      minutesPerSession % 5 !== 0
    )
      issues.push({
        field: 'minutesPerSession',
        message: '회당 시간은 5~180분 사이에서 5분 단위로 입력해 주세요.',
      })
  }
  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    goal: {
      v: 1,
      calculationVersion: version,
      purpose,
      mode,
      targetWeightKg,
      daysPerWeek,
      minutesPerSession,
      weeklyMinutes: daysPerWeek * minutesPerSession,
      ...(usesActivity && isBeginnerActivityId(draft.activityId)
        ? { activityId: draft.activityId }
        : {}),
      context,
      profile,
      updatedAt: now.toISOString(),
    },
  }
}

export function sameGoalContext(
  a: ExerciseGoalContext,
  b: ExerciseGoalContext,
): boolean {
  return (
    a.exerciseTier === b.exerciseTier &&
    a.knowledgeSource === b.knowledgeSource &&
    a.healthGoal.updatedAt === b.healthGoal.updatedAt &&
    a.healthGoal.exerciseRatio === b.healthGoal.exerciseRatio &&
    a.healthGoal.mealRatio === b.healthGoal.mealRatio &&
    a.healthGoal.focus === b.healthGoal.focus
  )
}

/** 손상된 저장값을 정상 목표로 표시하거나 자동으로 덮어쓰지 않는다. */
export function parseExerciseGoal(value: unknown): ExerciseGoal | null {
  if (typeof value !== 'object' || value === null) return null
  const g = value as Record<string, unknown>
  if (
    g.v !== 1 ||
    !validGoalProfile(g.profile) ||
    typeof g.updatedAt !== 'string' ||
    !Number.isFinite(Date.parse(g.updatedAt)) ||
    typeof g.context !== 'object' ||
    g.context === null
  )
    return null
  const c = g.context as Record<string, unknown>
  const healthGoal = parseStoredGoal(c.healthGoal)
  if (
    !healthGoal ||
    !(
      c.exerciseTier === null ||
      c.exerciseTier === 'beginner' ||
      c.exerciseTier === 'intermediate' ||
      c.exerciseTier === 'advanced'
    ) ||
    !(
      c.knowledgeSource === 'assessment' ||
      c.knowledgeSource === 'dev-initial' ||
      c.knowledgeSource === 'unknown'
    )
  )
    return null
  const context: ExerciseGoalContext = {
    healthGoal,
    exerciseTier: c.exerciseTier,
    knowledgeSource: c.knowledgeSource,
  }
  const version = g.calculationVersion === undefined ? 1 : g.calculationVersion
  if (version !== 1 && version !== 2 && version !== 3 && version !== 4)
    return null
  const result = calculateGoalByVersion(
    {
      purpose: g.purpose as ExerciseGoalPurpose,
      targetWeightKg: String(g.targetWeightKg),
      daysPerWeek: String(g.daysPerWeek),
      minutesPerSession: String(g.minutesPerSession),
      activityId: g.activityId as ExerciseGoalDraft['activityId'],
    },
    context,
    g.profile,
    new Date(g.updatedAt),
    version,
  )
  if (!result.ok) return null
  const goal = result.goal
  if (
    goal.mode !== g.mode ||
    goal.targetWeightKg !== g.targetWeightKg ||
    goal.daysPerWeek !== g.daysPerWeek ||
    goal.minutesPerSession !== g.minutesPerSession ||
    goal.weeklyMinutes !== g.weeklyMinutes ||
    (version === 4 && goal.activityId !== g.activityId)
  )
    return null
  return goal
}
