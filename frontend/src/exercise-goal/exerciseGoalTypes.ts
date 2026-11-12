import type { HealthManagementGoal } from '../health-goal/goalTypes.ts'
import type { AssessmentLevelCode } from '../onboarding-assessment/assessmentTypes.ts'
import type { BeginnerBodyweightActivityId } from './exerciseGoalActivity.ts'

export type ExerciseGoalPurpose = 'lose' | 'learn' | 'maintain' | 'bulk'
export type ExerciseGoalMode = 'simple' | 'detailed'

/** 목표 계산용 자기 입력 정보. 본인인증 결과로 취급하지 않는다. PIN 확인 뒤에만 조회한다. */
export interface ExerciseGoalProfile {
  age: number
  sex: 'male' | 'female'
  heightCm: number
  weightKg: number
  updatedAt: string
}

export interface ExerciseGoalContext {
  healthGoal: HealthManagementGoal
  exerciseTier: AssessmentLevelCode | null
  knowledgeSource: 'assessment' | 'dev-initial' | 'unknown'
}

export interface ExerciseGoalDraft {
  purpose: ExerciseGoalPurpose | ''
  targetWeightKg: string
  daysPerWeek: string
  minutesPerSession: string
  activityId?: BeginnerBodyweightActivityId | ''
}

/** 체중·신체 정보가 포함되어 있으므로 보호된 조회에서만 반환한다. */
export interface ExerciseGoal {
  v: 1
  /** 1~3번은 이전 목표, 4번은 맨몸 활동량 참고와 초급 감량 시작 계획이다. */
  calculationVersion?: 1 | 2 | 3 | 4
  purpose: ExerciseGoalPurpose
  mode: ExerciseGoalMode
  targetWeightKg: number
  daysPerWeek: number
  minutesPerSession: number
  weeklyMinutes: number
  activityId?: BeginnerBodyweightActivityId
  context: ExerciseGoalContext
  profile: ExerciseGoalProfile
  updatedAt: string
}

/** 대시보드는 신체 수치와 목표 체중을 받지 않는다. */
export interface ExerciseGoalSummary {
  daysPerWeek: number
  minutesPerSession: number
  mode: ExerciseGoalMode
  updatedAt: string
}

export interface GoalAuthorization {
  token: string
  expiresAt: number
}

export type ExerciseGoalErrorCode =
  | 'unavailable'
  | 'load'
  | 'save'
  | 'corrupt'
  | 'pinFormat'
  | 'pinMismatch'
  | 'pinExists'
  | 'pinMissing'
  | 'pinWrong'
  | 'locked'
  | 'expired'
  | 'validation'
  | 'contextChanged'

export class ExerciseGoalError extends Error {
  readonly code: ExerciseGoalErrorCode
  readonly retryAt?: number
  constructor(code: ExerciseGoalErrorCode, retryAt?: number) {
    super(`exercise goal ${code}`)
    this.name = 'ExerciseGoalError'
    this.code = code
    this.retryAt = retryAt
  }
}

export interface ExerciseGoalRepository {
  readonly kind: 'local'
  getPinStatus(): Promise<{ configured: boolean; retryAt: number | null }>
  registerPin(pin: string, confirmation: string): Promise<void>
  unlock(pin: string): Promise<GoalAuthorization>
  lock(access: GoalAuthorization): void
  getProfile(access: GoalAuthorization): Promise<ExerciseGoalProfile | null>
  getProfilePrefill(
    access: GoalAuthorization,
  ): Promise<Partial<ExerciseGoalProfile>>
  saveProfile(
    access: GoalAuthorization,
    profile: Omit<ExerciseGoalProfile, 'updatedAt'>,
  ): Promise<ExerciseGoalProfile>
  getGoal(access: GoalAuthorization): Promise<ExerciseGoal | null>
  saveGoal(
    access: GoalAuthorization,
    draft: ExerciseGoalDraft,
    expectedContext: ExerciseGoalContext,
    expectedProfile: ExerciseGoalProfile,
  ): Promise<ExerciseGoal>
  getSummary(): Promise<ExerciseGoalSummary | null>
}
