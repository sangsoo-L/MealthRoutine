import type {
  MealGoalActivity,
  MealGoalLevel,
  MealGoalPurpose,
  MealGoalState,
} from './mealGoalTypes.ts'

/**
 * 식단 목표 정책. 값(화면 문구·허용 집합·정책 상태)과 단순 판정만 둔다. 계산식은 mealGoalCalculation.ts, 입력 검증은 mealGoalValidation.ts다.
 *
 * ## 계산 정책의 검증 상태
 * 하루 열량·탄단지 비율을 계산하는 상수(활동계수, 감량 증감, 기초대사량 하한, 반올림, 목적별 비율, 직접 입력 범위)는
 * 스토리보드 시안의 예시값이며 서비스 정책으로 확정되지 않았다(시안 주석: "서비스 적용 전 전문가 검토 필요").
 * 그래서 **검증을 마친 정책 버전이 하나도 없고**, 어떤 계산 결과도 실제 목표로 확정·저장하지 않는다.
 * 전문가 검토가 끝나 정책이 확정되면 `MEAL_GOAL_POLICIES`에 새 버전을 `verified`로 추가한다(이 파일과 계산 상수표만 바뀌고 화면은 그대로다).
 */

export type MealGoalPolicyStatus = 'pendingExpertReview' | 'verified'

export interface MealGoalPolicyInfo {
  version: number
  status: MealGoalPolicyStatus
}

/** 정책 버전별 검증 상태. 현재 버전 1은 시안 예시값뿐이라 검증 대기다. */
export const MEAL_GOAL_POLICIES: readonly MealGoalPolicyInfo[] = [
  { version: 1, status: 'pendingExpertReview' },
]

export const CURRENT_POLICY_VERSION = 1

export function findPolicy(version: number): MealGoalPolicyInfo | null {
  return MEAL_GOAL_POLICIES.find((policy) => policy.version === version) ?? null
}

/** 이 버전의 계산 정책이 전문가 검증을 마쳤는가. 알 수 없는 버전은 검증되지 않은 것이다. */
export function isPolicyVerified(version: number): boolean {
  return findPolicy(version)?.status === 'verified'
}

/** 현재 정책으로 목표를 저장할 수 있는가(검증을 마친 정책이 있을 때만). */
export function isMealGoalSaveEnabled(): boolean {
  return isPolicyVerified(CURRENT_POLICY_VERSION)
}

export const PURPOSES: readonly MealGoalPurpose[] = [
  'lose',
  'improve',
  'maintain',
]
export const ACTIVITIES: readonly MealGoalActivity[] = [
  'sedentary',
  'light',
  'active',
]
export const LEVELS: readonly MealGoalLevel[] = [
  'beginner',
  'intermediate',
  'advanced',
]

export const PURPOSE_LABEL: Record<MealGoalPurpose, string> = {
  lose: '체중 감량',
  improve: '식습관 개선',
  maintain: '체중 유지',
}

export const PURPOSE_HINT: Record<MealGoalPurpose, string> = {
  lose: '조금씩 줄여 건강하게 체중을 낮춰요',
  improve: '세 끼를 고르게 먹고 영양 균형을 맞춰요',
  maintain: '지금 체중을 유지하며 탄단지 비율을 지켜요',
}

export const ACTIVITY_LABEL: Record<MealGoalActivity, string> = {
  sedentary: '거의 앉아서 생활해요',
  light: '가볍게 움직여요',
  active: '자주 움직여요',
}

export const LEVEL_LABEL: Record<MealGoalLevel, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
}

export function isPurpose(value: unknown): value is MealGoalPurpose {
  return (PURPOSES as readonly unknown[]).includes(value)
}
export function isActivity(value: unknown): value is MealGoalActivity {
  return (ACTIVITIES as readonly unknown[]).includes(value)
}
export function isLevel(value: unknown): value is MealGoalLevel {
  return (LEVELS as readonly unknown[]).includes(value)
}

/**
 * 폼 구성. 초급과 이해도 미확인은 간편 폼(목적만), 중급은 목적 + 평소 활동량, 고급은 목적 + 직접 조정이다.
 * 미확인(null)을 초급으로 바꿔 저장하지 않는다. 폼만 가장 적게 묻는 쪽을 쓴다(운동 목표와 같은 규칙).
 */
export type MealGoalFormMode = 'simple' | 'activity' | 'advanced'

export function mealGoalFormMode(
  level: MealGoalLevel | null,
): MealGoalFormMode {
  return level === 'intermediate'
    ? 'activity'
    : level === 'advanced'
      ? 'advanced'
      : 'simple'
}

/** 나이 범위. 14세 미만은 입력을 받지 않고, 상한은 기존 운동 목표 정책과 같은 100세다. */
export const MEAL_GOAL_MIN_AGE = 14
export const MEAL_GOAL_MAX_AGE = 100
/** 성인용 자동 계산을 적용하는 나이. 기존 운동 목표 신체 정보(PIN 보호 프로필)가 18세부터만 저장을 허용한다. */
export const MEAL_GOAL_ADULT_AGE = 18

/** 목표가 아직 없는가(조회를 마치고 목표가 null일 때만 true). 로딩·오류·저장소 없음은 미설정이 아니다. */
export function isMealGoalMissing(state: MealGoalState): boolean {
  return state.status === 'ready' && state.goal === null
}

/** 목표가 있는가. */
export function hasMealGoal(state: MealGoalState): boolean {
  return state.status === 'ready' && state.goal !== null
}

/** 반환 경로로 허용하는 앱 내부 경로. 외부 주소·임의 경로로 보내지 않는다. */
const RETURN_PATHS: readonly string[] = ['/records/meal', '/ai', '/ai/meal']

/** 검증된 반환 경로만 돌려준다. 허용 목록에 없거나 형식이 올바르지 않으면 fallback이다(쿼리·해시가 붙은 값도 허용하지 않는다). */
export function safeReturnPath(value: unknown, fallback: string): string {
  return typeof value === 'string' && RETURN_PATHS.includes(value)
    ? value
    : fallback
}
