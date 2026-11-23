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
  | 'pinSame'
  | 'locked'
  | 'expired'
  | 'validation'
  | 'contextChanged'

export class ExerciseGoalError extends Error {
  readonly code: ExerciseGoalErrorCode
  readonly retryAt?: number
  /** `pinWrong`에서만 채운다. 잠기기까지 남은 확인 횟수다. 다른 코드에서는 없다(기존 호출부는 읽지 않는다). */
  readonly remaining?: number
  constructor(
    code: ExerciseGoalErrorCode,
    retryAt?: number,
    remaining?: number,
  ) {
    super(`exercise goal ${code}`)
    this.name = 'ExerciseGoalError'
    this.code = code
    this.retryAt = retryAt
    this.remaining = remaining
  }
}

export interface ExerciseGoalRepository {
  readonly kind: 'local'
  getPinStatus(): Promise<{ configured: boolean; retryAt: number | null }>
  registerPin(pin: string, confirmation: string): Promise<void>
  /**
   * 현재 PIN을 확인한 뒤 새 PIN으로 바꾼다(P12). 현재 PIN 확인은 `unlock`과 같은 실패 횟수·잠금을 쓴다.
   * 형식·확인 불일치·동일 번호는 횟수에 넣지 않는다. 성공하면 이 계정의 열람 권한을 모두 무효화하고, 실패하면 기존 PIN을 바꾸지 않는다.
   */
  changePin(
    currentPin: string,
    newPin: string,
    confirmation: string,
  ): Promise<void>
  unlock(pin: string): Promise<GoalAuthorization>
  lock(access: GoalAuthorization): void
  /**
   * 열람 권한이 지금도 유효한지 확인한다(P05 신체 정보 열람). 소유 계정·만료 시각·발급 뒤 PIN이 바뀌지 않았는지(다른 탭의 변경 포함)를
   * 매번 저장소에서 다시 확인하며, 하나라도 어긋나면 그 권한을 지우고 `expired`를 던진다. 값을 돌려주지 않는다.
   */
  verifyAccess(access: GoalAuthorization): void
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
