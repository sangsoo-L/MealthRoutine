import type { AssessmentLevelCode } from '../onboarding-assessment/assessmentTypes.ts'
import type {
  GoalPolicy,
  HealthGoalFocus,
  HealthGoalInput,
  HealthManagementGoal,
} from './goalTypes.ts'

/** 직접 설정 범위: 운동 20~80%(식단 80~20%), 10% 단위. 10:0·0:10은 허용하지 않는다. */
export const CUSTOM_MIN = 20
export const CUSTOM_MAX = 80
export const CUSTOM_STEP = 10

/** 관리 방향의 표시 이름 */
export const FOCUS_LABEL: Record<HealthGoalFocus, string> = {
  exercise: '운동 중심',
  meal: '식단 중심',
  balanced: '균형 관리',
}

/** 간편 선택지. 비율은 정책으로 정해진 값이고 설명은 초보자도 알기 쉬운 말이다. */
export const SIMPLE_OPTIONS: readonly {
  focus: HealthGoalFocus
  exerciseRatio: number
  description: string
}[] = [
  {
    focus: 'exercise',
    exerciseRatio: 70,
    description: '운동에 조금 더 집중하고 싶어요.',
  },
  {
    focus: 'meal',
    exerciseRatio: 30,
    description: '식단을 조금 더 꼼꼼하게 관리하고 싶어요.',
  },
  {
    focus: 'balanced',
    exerciseRatio: 50,
    description: '운동과 식단을 골고루 관리하고 싶어요.',
  },
]

/** 간편 선택에서 미리 골라 두는 추천값(균형 관리 50:50). 사용자가 저장하기 전에는 저장된 목표가 아니다. */
export const SIMPLE_RECOMMENDED_RATIO = 50

/**
 * 종합 이해도 등급에 따른 설정 방식. 중급·고급은 직접 설정, 초보와 이해도 확인 전(null)은 간편 선택이다.
 * 확인 전을 초보로 저장하거나 취급하지 않는다. 설정 방식만 간편 선택으로 정할 뿐 등급 값은 만들지 않는다.
 */
export function policyForTier(tier: AssessmentLevelCode | null): GoalPolicy {
  return tier === 'intermediate' || tier === 'advanced' ? 'custom' : 'simple'
}

/** 운동 비율로 관리 방향을 정한다: 50 초과 운동 중심, 50 미만 식단 중심, 50 균형 관리. */
export function focusOf(exerciseRatio: number): HealthGoalFocus {
  if (exerciseRatio > 50) return 'exercise'
  if (exerciseRatio < 50) return 'meal'
  return 'balanced'
}

/** 정책이 허용하는 운동 비율인가. */
export function isAllowedRatio(
  exerciseRatio: unknown,
  policy: GoalPolicy,
): exerciseRatio is number {
  if (typeof exerciseRatio !== 'number' || !Number.isInteger(exerciseRatio)) {
    return false
  }
  if (policy === 'simple') {
    return SIMPLE_OPTIONS.some((o) => o.exerciseRatio === exerciseRatio)
  }
  return (
    exerciseRatio >= CUSTOM_MIN &&
    exerciseRatio <= CUSTOM_MAX &&
    exerciseRatio % CUSTOM_STEP === 0
  )
}

/** 저장 요청을 검증하고 저장할 목표를 만든다. 정책에 맞지 않으면 null이다(서버도 같은 검증을 해야 한다). */
export function buildGoal(
  input: HealthGoalInput,
  now: Date = new Date(),
): HealthManagementGoal | null {
  if (!isAllowedRatio(input.exerciseRatio, input.policy)) return null
  return {
    focus: focusOf(input.exerciseRatio),
    exerciseRatio: input.exerciseRatio,
    mealRatio: 100 - input.exerciseRatio,
    updatedAt: now.toISOString(),
  }
}

/**
 * 저장소에서 읽은 값이 유효한 목표인가. 합이 100이고, 관리 방향이 비율과 일치하며, 비율이 허용 범위(20~80, 10 단위) 안이어야 한다.
 * 유효하면 검증한 필드만 새 객체로 돌려주고, 아니면 null(저장된 목표가 없는 것으로 본다)이다.
 */
export function parseStoredGoal(raw: unknown): HealthManagementGoal | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  if (
    !isAllowedRatio(v.exerciseRatio, 'custom') ||
    v.mealRatio !== 100 - v.exerciseRatio ||
    v.focus !== focusOf(v.exerciseRatio) ||
    typeof v.updatedAt !== 'string'
  ) {
    return null
  }
  return {
    focus: focusOf(v.exerciseRatio),
    exerciseRatio: v.exerciseRatio,
    mealRatio: v.mealRatio,
    updatedAt: v.updatedAt,
  }
}
