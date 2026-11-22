import {
  MEAL_GOAL_ADULT_AGE,
  MEAL_GOAL_MAX_AGE,
  MEAL_GOAL_MIN_AGE,
  findPolicy,
  mealGoalFormMode,
  type MealGoalPolicyInfo,
} from './mealGoalPolicy.ts'
import {
  validateDraft,
  validRatio,
  type GoalDraft,
} from './mealGoalValidation.ts'
import type {
  MealGoalActivity,
  MealGoalInput,
  MealGoalLevel,
  MealGoalPurpose,
  MealGoalRatio,
} from './mealGoalTypes.ts'

/**
 * 식단 목표 계산(순수 함수). 저장소·React를 부르지 않는다.
 *
 * ## 이 파일의 상수는 모두 "검증되지 않은 시안 예시"다
 * 아래 `SIHAN_CONSTANTS_V1`은 스토리보드 v5.0 `storyboard.html`의 식단 목표 시안 코드를 **값 그대로** 옮긴 것이다(시안 주석: "서비스 적용 전 전문가 검토 필요").
 * 서비스 정책으로 확정된 값이 아니며, 이 파일은 값을 고치거나 새 권장값을 만들지 않는다. 정책이 검증되기 전까지 계산 결과는 어디에도 저장하지 않는다.
 * - Mifflin–St Jeor 기초대사량, 활동계수 1.2 / 1.375 / 1.55, 초급·고급의 기본 활동량 가정(가볍게 움직임)
 * - 체중 감량 −500kcal, 기초대사량 하한, 10kcal 반올림, 목적별 탄단지 비율
 * - 에너지 환산 4·4·9 kcal/g(탄수화물·단백질·지방)은 D01-1 명세에 있는 값이다.
 *
 * ## 결과 상태(CalculationResult.status)
 * - insufficientInput: 목적·신체 정보·활동량 중 빠진 것이 있다.
 * - notCalculable: 나이·신체 정보가 계산 범위 밖이거나(14세 미만, 14~17세 미성년자, 100세 초과, 키·몸무게 범위 밖) 이 정책으로 계산하지 않는 목적(감량)이다.
 * - policyPending: 계산 정책이 전문가 검증 전이라 값을 만들지 않는다(운영 빌드의 기본).
 * - devExample: 개발 환경에서만 보여 주는 "검증되지 않은 시안 계산 예시". 저장할 수 없고 실제 권장값이 아니다.
 * - verified: 검증을 마친 정책의 결과. **현재는 검증을 마친 정책이 없어 나오지 않는다.**
 */

export interface CalculationProfile {
  age: number
  sex: 'male' | 'female'
  heightCm: number
  weightKg: number
}

export interface CalculationInput {
  purpose: MealGoalPurpose | null
  level: MealGoalLevel | null
  /** 중급 폼에서 고른 평소 활동량. 다른 폼에서는 null */
  activity: MealGoalActivity | null
  profile: CalculationProfile | null
}

export interface CalculatedGoal {
  kcal: number
  ratio: MealGoalRatio
  /** 비율을 그램으로 환산한 값(반올림이라 합이 kcal과 정확히 맞지 않을 수 있다) */
  grams: { carb: number; protein: number; fat: number }
  /** 계산에 쓴 활동량(고르지 않은 폼은 정책의 기본 가정) */
  activity: MealGoalActivity
  /** 활동량을 사용자가 골랐는가(false면 정책의 기본 가정) */
  activityChosen: boolean
}

export type NotCalculableReason =
  | 'ageTooLow'
  | 'minor'
  | 'ageTooHigh'
  | 'bodyOutOfRange'
  /** 체중 감량의 열량 조정 기준이 검증되지 않아 계산하지 않는다. */
  | 'losePending'

export type CalculationResult =
  | {
      status: 'insufficientInput'
      missing: readonly ('purpose' | 'profile' | 'activity')[]
    }
  | { status: 'notCalculable'; reason: NotCalculableReason }
  | { status: 'policyPending' }
  | { status: 'devExample'; version: number; example: CalculatedGoal }
  | { status: 'verified'; version: number; result: CalculatedGoal }

interface PolicyConstants {
  activityFactor: Record<MealGoalActivity, number>
  /** 활동량을 묻지 않는 폼(초급·고급·미확인)의 기본 가정 */
  assumedActivity: MealGoalActivity
  purposeDelta: Record<MealGoalPurpose, number>
  ratio: Record<MealGoalPurpose, MealGoalRatio>
  heightRange: { min: number; max: number }
  weightRange: { min: number; max: number }
  /**
   * 고급 직접 조정의 열량 허용 범위. 시안의 800~5000kcal은 안전 기준으로 검증되지 않아 옮기지 않았다.
   * 값이 없는 정책은 직접 조정한 열량을 저장할 수 없다(범위 정책이 확정될 때 채운다).
   */
  customKcalRange?: { min: number; max: number }
}

/** 시안 값 그대로(검증되지 않음). 수정하지 않는다. */
export const SIHAN_CONSTANTS_V1: PolicyConstants = {
  activityFactor: { sedentary: 1.2, light: 1.375, active: 1.55 },
  assumedActivity: 'light',
  purposeDelta: { lose: -500, improve: 0, maintain: 0 },
  ratio: {
    lose: { carb: 55, protein: 20, fat: 25 },
    improve: { carb: 60, protein: 15, fat: 25 },
    maintain: { carb: 55, protein: 20, fat: 25 },
  },
  heightRange: { min: 100, max: 230 },
  weightRange: { min: 25, max: 250 },
}

const CONSTANTS_BY_VERSION: Record<number, PolicyConstants> = {
  1: SIHAN_CONSTANTS_V1,
}

export interface CalculateOptions {
  /** 개발 환경에서만 true. 검증 전 정책의 시안 계산 예시를 보여 줄지 정한다(운영 빌드는 false). */
  allowDevExample: boolean
  /** 계산에 쓸 정책 버전과 검증 상태. 기본은 현재 정책. 테스트가 검증된 정책을 주입할 수 있다. */
  policy: MealGoalPolicyInfo
}

/** 에너지 환산(D01-1): 탄수화물·단백질 4kcal/g, 지방 9kcal/g. */
export function ratioToGrams(
  kcal: number,
  ratio: MealGoalRatio,
): CalculatedGoal['grams'] {
  return {
    carb: Math.round((kcal * ratio.carb) / 100 / 4),
    protein: Math.round((kcal * ratio.protein) / 100 / 4),
    fat: Math.round((kcal * ratio.fat) / 100 / 9),
  }
}

function compute(
  input: CalculationInput & {
    purpose: MealGoalPurpose
    profile: CalculationProfile
  },
  constants: PolicyConstants,
): CalculatedGoal {
  const { purpose, profile } = input
  const chosen = input.activity !== null
  const activity = input.activity ?? constants.assumedActivity
  const bmr =
    10 * profile.weightKg +
    6.25 * profile.heightCm -
    5 * profile.age +
    (profile.sex === 'male' ? 5 : -161)
  const tdee = bmr * constants.activityFactor[activity]
  const kcal =
    Math.round(Math.max(tdee + constants.purposeDelta[purpose], bmr) / 10) * 10
  const ratio = { ...constants.ratio[purpose] }
  return {
    kcal,
    ratio,
    grams: ratioToGrams(kcal, ratio),
    activity,
    activityChosen: chosen,
  }
}

const within = (value: number, range: { min: number; max: number }) =>
  value >= range.min && value <= range.max

export function calculateMealGoal(
  input: CalculationInput,
  options: CalculateOptions,
): CalculationResult {
  const mode = mealGoalFormMode(input.level)
  const constants = CONSTANTS_BY_VERSION[options.policy.version]
  if (!constants) return { status: 'policyPending' }

  // 신체 정보가 있으면 목적을 고르기 전에도 나이·범위 제한을 먼저 알린다(미성년자에게는 계산 결과를 만들지 않는다).
  const given = input.profile
  if (given !== null) {
    if (given.age < MEAL_GOAL_MIN_AGE)
      return { status: 'notCalculable', reason: 'ageTooLow' }
    // 14~17세에는 성인과 같은 자동 열량 산식을 적용하지 않는다.
    if (given.age < MEAL_GOAL_ADULT_AGE)
      return { status: 'notCalculable', reason: 'minor' }
    if (given.age > MEAL_GOAL_MAX_AGE)
      return { status: 'notCalculable', reason: 'ageTooHigh' }
    if (
      !within(given.heightCm, constants.heightRange) ||
      !within(given.weightKg, constants.weightRange)
    )
      return { status: 'notCalculable', reason: 'bodyOutOfRange' }
  }

  const missing: ('purpose' | 'profile' | 'activity')[] = []
  if (input.purpose === null) missing.push('purpose')
  if (input.profile === null) missing.push('profile')
  if (mode === 'activity' && input.activity === null) missing.push('activity')
  if (missing.length > 0) return { status: 'insufficientInput', missing }
  const purpose = input.purpose as MealGoalPurpose
  const profile = input.profile as CalculationProfile

  // 액티비티는 중급 폼에서만 받는다. 다른 폼에서 들어온 값은 쓰지 않는다.
  const calcInput = {
    ...input,
    purpose,
    profile,
    activity: mode === 'activity' ? input.activity : null,
  }

  if (options.policy.status === 'verified') {
    return {
      status: 'verified',
      version: options.policy.version,
      result: compute(calcInput, constants),
    }
  }
  // 검증 전 정책: 운영 빌드는 값을 만들지 않는다. 개발 환경의 예시도 감량(열량 조정)은 계산하지 않는다.
  if (!options.allowDevExample) return { status: 'policyPending' }
  if (purpose === 'lose')
    return { status: 'notCalculable', reason: 'losePending' }
  return {
    status: 'devExample',
    version: options.policy.version,
    example: compute(calcInput, constants),
  }
}

/** 현재 정책(기본값)으로 계산한다. 정책 정보가 없으면(알 수 없는 버전) policyPending이다. */
export function calculateWithCurrentPolicy(
  input: CalculationInput,
  allowDevExample: boolean,
  version: number,
): CalculationResult {
  const policy = findPolicy(version)
  if (!policy) return { status: 'policyPending' }
  return calculateMealGoal(input, { allowDevExample, policy })
}

export const NOT_CALCULABLE_MESSAGE: Record<NotCalculableReason, string> = {
  ageTooLow: '14세 이상부터 식단 목표를 정할 수 있어요.',
  minor:
    '14~17세에는 성인용 자동 열량 계산을 적용하지 않아요. 성장기 식단 목표는 지금 정해 드릴 수 없어요.',
  ageTooHigh: '나이는 100세까지 입력할 수 있어요.',
  bodyOutOfRange:
    '키·몸무게가 계산할 수 있는 범위(키 100~230cm, 몸무게 25~250kg)를 벗어났어요. 신체 정보를 확인해 주세요.',
  losePending:
    '체중 감량 목표의 열량 조정 기준은 아직 전문가 검증 전이라 계산하지 않아요.',
}

// ── 저장 결정 ─────────────────────────────────────────────

export type SaveBlockReason =
  /** 폼 입력이 구조 검증을 통과하지 못했다. */
  | 'invalidInput'
  /** 목적·신체 정보·활동량이 부족하다. */
  | 'insufficientInput'
  /** 나이·신체 정보 범위 밖이거나 계산하지 않는 목적이다. */
  | 'notCalculable'
  /** 계산 정책이 전문가 검증 전이다(현재 모든 정책). */
  | 'policyPending'
  /** 직접 조정한 열량의 허용 범위 정책이 없거나 범위를 벗어났다. */
  | 'customRangePending'

export type SaveDecision =
  { ok: true; goal: MealGoalInput } | { ok: false; reason: SaveBlockReason }

export interface SaveDecisionParams {
  draft: GoalDraft
  level: MealGoalLevel | null
  profile: CalculationProfile | null
  /** 계산에 쓴 신체 정보의 갱신 시각 */
  profileUpdatedAt: string | null
  policy: MealGoalPolicyInfo
}

/**
 * 지금 입력을 목표로 저장해도 되는가. 개발용 계산 예시는 저장 근거가 되지 않는다(예시를 허용하지 않고 계산한다).
 * 계산 정책이 검증되지 않았으면 어떤 입력도 저장할 수 없다(policyPending). 검증된 정책이라도 직접 조정한 열량은 그 정책에 허용 범위가 있어야 저장한다.
 */
export function decideSave(params: SaveDecisionParams): SaveDecision {
  const mode = mealGoalFormMode(params.level)
  if (validateDraft(params.draft, mode).length > 0)
    return { ok: false, reason: 'invalidInput' }
  const result = calculateMealGoal(
    {
      purpose: params.draft.purpose as MealGoalPurpose,
      level: params.level,
      activity:
        mode === 'activity'
          ? (params.draft.activity as MealGoalActivity)
          : null,
      profile: params.profile,
    },
    { allowDevExample: false, policy: params.policy },
  )
  if (result.status === 'insufficientInput')
    return { ok: false, reason: 'insufficientInput' }
  if (result.status === 'notCalculable')
    return { ok: false, reason: 'notCalculable' }
  if (result.status !== 'verified' || params.profileUpdatedAt === null)
    return { ok: false, reason: 'policyPending' }

  let kcal = result.result.kcal
  let ratio = result.result.ratio
  let source: MealGoalInput['source'] = 'calculated'
  if (mode === 'advanced') {
    const range = CONSTANTS_BY_VERSION[result.version]?.customKcalRange
    const customKcal = Number(params.draft.kcal.trim())
    const customRatio = {
      carb: Number(params.draft.carb.trim()),
      protein: Number(params.draft.protein.trim()),
      fat: Number(params.draft.fat.trim()),
    }
    if (!range || customKcal < range.min || customKcal > range.max)
      return { ok: false, reason: 'customRangePending' }
    if (!validRatio(customRatio)) return { ok: false, reason: 'invalidInput' }
    kcal = customKcal
    ratio = customRatio
    source = 'custom'
  }
  return {
    ok: true,
    goal: {
      v: 1,
      calculationVersion: result.version,
      source,
      purpose: params.draft.purpose as MealGoalPurpose,
      level: params.level,
      activity: mode === 'activity' ? result.result.activity : null,
      kcal,
      ratio: { ...ratio },
      basis: { profileUpdatedAt: params.profileUpdatedAt },
    },
  }
}

export const SAVE_BLOCK_MESSAGE: Record<SaveBlockReason, string> = {
  invalidInput: '입력한 내용을 확인해 주세요.',
  insufficientInput: '목적과 신체 정보를 모두 입력해 주세요.',
  notCalculable: '지금 입력으로는 목표를 계산할 수 없어요.',
  policyPending:
    '목표 계산 기준의 검증이 아직 끝나지 않아 지금은 식단 목표를 저장할 수 없어요.',
  customRangePending:
    '직접 조정한 열량의 허용 범위 기준이 아직 정해지지 않아 저장할 수 없어요.',
}
