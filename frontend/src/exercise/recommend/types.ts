import type { ExerciseTool } from '../exerciseTaxonomy.ts'
import type { ExerciseCategory } from '../exerciseTypes.ts'
import type { StoredRecordType } from '../recordMode.ts'

/**
 * 초급 사용자 전용 맞춤 운동 구성(S7)의 데이터 계약. 규칙 기반(외부 LLM 호출 없음)이며 v5.0 AI 운동 플랜(I02/I02-1)과 별개다.
 * 이 파일은 타입만 담는다(React·저장소·카탈로그에 의존하지 않는다). 추천 목록을 만드는 엔진은 P2-2, WorkoutDraft 변환은 P2-3이다.
 */

/** 오늘의 운동 목표. 추천 작업 한 번에만 쓰며 회원정보·PIN 보호 목표(ExerciseGoal.purpose)를 읽거나 바꾸지 않는다. */
export type PlanPurpose = 'learn' | 'maintain' | 'lose'

/** 전체 자동 추천(automatic)과 직접 운동 선택 후 자동 설정(selected). */
export type PlanMode = 'automatic' | 'selected'

/** 자동 구성이 만들 수 있는 기록 방식(저장 코드). 중량·복합 방식은 이번 규칙에서 지원하지 않는다. */
export type PlanRecordType = Extract<StoredRecordType, 'reps' | 'time'>

// ─── 입력 ──────────────────────────────────────────────────

/**
 * 호출자(화면·훅)가 넘기는 검증 전 요청. 값은 모두 외부 입력으로 보고 validatePlanInput이 확인한다.
 * exerciseTier는 `loadKnowledgeLevels(userId)`의 `levels.exercise?.tier`다(식단 이해도는 쓰지 않는다).
 */
export interface BeginnerPlanRequest {
  exerciseTier: unknown
  purpose: unknown
  availableMinutes: unknown
  tools: unknown
  mode: unknown
  /** 직접 선택 모드에서만. 운동 id(문자열, 기존 WorkoutDraft와 같은 형식) 목록 */
  selectedExerciseIds?: unknown
  /** 다시 추천할 때 올리는 회전값(0 이상 정수). 같은 입력·같은 회전값이면 같은 결과가 나온다. 생략하면 0. */
  rotation?: unknown
}

/** 검증을 통과한 입력. 이 타입의 값은 초급 권한 확인을 이미 거쳤다(엔진은 이 타입만 받는다). */
export interface ValidatedPlanInput {
  tier: 'beginner'
  purpose: PlanPurpose
  /** 운동 계획의 상한(분). 반드시 채워야 하는 시간이 아니다. */
  availableMinutes: number
  /** 사용할 수 있는 도구. 맨몸은 도구가 필요 없으므로 항상 포함된다. */
  tools: readonly ExerciseTool[]
  mode: PlanMode
  /** 직접 선택 모드의 운동 id(중복 없음). 자동 모드에서는 빈 배열 */
  selectedExerciseIds: readonly string[]
  rotation: number
}

// ─── 실패 ──────────────────────────────────────────────────

/**
 * 추천 실패 코드. 사용자가 이해할 수 있는 한국어 문구는 rules.describePlanFailure가 만든다(임의의 값으로 대신 채우지 않는다).
 * 앞의 코드는 입력·권한 검증(P2-1), 뒤의 코드는 엔진(P2-2)이 쓴다.
 */
export type PlanFailureCode =
  | 'tierUnknown'
  | 'tierNotBeginner'
  | 'tierInvalid'
  | 'purposeInvalid'
  | 'minutesInvalid'
  | 'toolsInvalid'
  | 'modeInvalid'
  | 'selectionRequired'
  | 'selectionInvalid'
  | 'rotationInvalid'
  // 엔진(P2-2)
  | 'catalogUnavailable'
  | 'noCandidates'
  | 'ruleMissing'
  | 'noBasisForSelection'
  | 'timeInfeasible'

export type PlanFailureField =
  | 'tier'
  | 'purpose'
  | 'availableMinutes'
  | 'tools'
  | 'mode'
  | 'selectedExerciseIds'
  | 'rotation'

export interface PlanFailure {
  code: PlanFailureCode
  field?: PlanFailureField
  /** 특정 운동 때문에 실패했을 때의 운동 id */
  exerciseId?: string
}

export type PlanValidation =
  | { ok: true; input: ValidatedPlanInput }
  | { ok: false; failures: readonly PlanFailure[] }

// ─── 운동별 추천 가능 여부 ─────────────────────────────────

/**
 * 운동을 자동 구성에서 쓸 수 없는 이유. 하나라도 있으면 그 운동에는 수치를 만들지 않는다.
 * - noRecordModeMeta: 기록 방식 메타데이터가 없다.
 * - weightExercise: 중량이 필요한 운동(기본 방식이 weight_reps·weight_time)이다.
 * - unsupportedRecordMode: 기본 방식이 reps·time이 아니다(복합 방식 포함).
 * - notBeginnerDifficulty: 초급 난이도가 아니다.
 * - noRuleGroup: 이 운동에 맞는 수치 규칙 묶음이 없다(예: 이완 도구 운동, 스트레칭 횟수형).
 * - noExerciseEvidence: 규칙 묶음은 있지만 이 운동 자체의 참고 수치(초급 루틴 시드)가 없다.
 * - toolUnavailable: 사용할 수 없는 도구가 필요하다.
 */
export type ExerciseExclusion =
  | 'noRecordModeMeta'
  | 'weightExercise'
  | 'unsupportedRecordMode'
  | 'notBeginnerDifficulty'
  | 'noRuleGroup'
  | 'noExerciseEvidence'
  | 'toolUnavailable'

/** 수치 범위(양 끝 포함). default는 min~max 안에 있다. */
export interface NumberRange {
  min: number
  default: number
  max: number
}

/**
 * 운동 묶음별 수치 규칙. 수치는 "검증된 운동 처방"이 아니라 알고리즘 검증용 초기 가정값이며,
 * 프로젝트 초급 가상 루틴 시드에서 관찰한 값의 범위 안으로만 제한한다(범위 밖 값을 만들지 않는다).
 */
export interface QuantityRule {
  id: 'strength-reps' | 'core-hold' | 'stretch-hold' | 'walk-cardio'
  recordType: PlanRecordType
  /** 적용 대상: 기록 방식 + 세부 부위(Exercise.targetMuscles[0]) + 필요 도구 */
  appliesTo: {
    parts: readonly string[]
    tools: readonly ExerciseTool[]
  }
  sets: NumberRange
  /** 목표 횟수(reps) 또는 목표 시간(초, time) */
  target: NumberRange
  /** 세트 사이 휴식(초). 표시와 예상 시간 계산에만 쓰고 저장하지 않는다. */
  restSeconds: NumberRange
}

/** 규칙 묶음 id. 개발자용 근거(ruleEvidence.ts)가 같은 id로 규칙을 가리킨다. */
export type QuantityRuleId = QuantityRule['id']

export type ExerciseClassification =
  | {
      eligible: true
      recordType: PlanRecordType
      rule: QuantityRule
    }
  | { eligible: false; reason: ExerciseExclusion }

// ─── 추천 결과(엔진 P2-2가 채운다. P2-1은 계약만 정의) ──────

export interface PlanSet {
  /** 목표 횟수(reps) */
  reps?: number
  /** 목표 시간(초, time) */
  targetSeconds?: number
}

export type PlanWarningCode =
  /** 직접 선택: 최소 세트로도 운동 가능 시간을 넘는다. */
  | 'overTime'
  /** 한 큰 분류가 70% 이상(운동 3개 이상). 정보 제공용이며 추천을 막지 않는다. */
  | 'bodyPartSkew'
  | 'toolMismatch'
  | 'noBasis'
  | 'weightExercise'
  /** 자동 추천: 쓸 수 있는 운동을 모두 넣어도 운동 가능 시간이 남는다(후보 부족). */
  | 'limitedCandidates'

export interface PlanWarning {
  code: PlanWarningCode
  exerciseId?: string
  /** bodyPartSkew일 때 몰린 큰 분류 */
  category?: ExerciseCategory
}

/**
 * 운동의 구성 역할(자동 추천의 순서 정책용). 카탈로그 메타데이터와 설명으로 확인되는 경우에만 warmup·cooldown이고,
 * 근거가 없으면 main(일반 운동)이다. 운동 효과를 주장하는 분류가 아니다.
 */
export type PlanRole = 'warmup' | 'main' | 'cooldown'

export interface BeginnerPlanItem {
  /** 기존 WorkoutDraft와 같은 문자열 id */
  exerciseId: string
  name: string
  category: ExerciseCategory
  /** 기존 저장 코드(reps·time). 화면에는 내부 코드명을 보이지 않는다. */
  recordType: PlanRecordType
  /** 구성 역할(시작·주요·마무리). 직접 선택 모드에서도 계산하지만 순서를 바꾸는 데 쓰지 않는다. */
  role: PlanRole
  sets: readonly PlanSet[]
  /** 세트 사이 휴식(초). 표시 전용이며 WorkoutDraft로 변환하지 않는다. */
  restSeconds: number
  /** 이 운동의 예상 시간(초, 수행 + 세트 사이 휴식) */
  estimatedSeconds: number
  /** 추천 이유 코드(문구는 화면이 만든다) */
  reason: 'purposeFit' | 'userSelected'
}

/** 직접 선택한 운동 중 자동 구성을 할 수 없는 운동. 사용자가 교체·제외를 정해야 하며 엔진이 대신 지우거나 바꾸지 않는다. */
export interface UnsupportedSelection {
  exerciseId: string
  /** 선택한 목록에서의 위치(0부터) */
  index: number
  /** 운동 이름. 카탈로그에 없는 id면 null */
  name: string | null
  reason: ExerciseExclusion | 'notFound'
}

/** 최소 허용 세트로도 운동 가능 시간을 넘을 때의 정보(직접 선택). */
export interface PlanOvertime {
  limitSeconds: number
  /** 모든 운동을 최소 세트로 했을 때의 예상 총 시간(초) */
  minimumTotalSeconds: number
  excessSeconds: number
  /** 선택 순서대로 앞에서부터 최소 세트로 넣었을 때 시간 안에 들어가는 운동 수(0일 수 있다) */
  fitsExerciseCount: number
  /** 최소 세트로 모두 하려면 필요한 시간(분, 올림) */
  minutesNeeded: number
}

export interface BeginnerPlanResult {
  mode: PlanMode
  purpose: PlanPurpose
  availableMinutes: number
  /** 운동 가능 시간(초) = availableMinutes × 60. 채워야 하는 시간이 아니라 상한이다. */
  limitSeconds: number
  /**
   * 추천 운동. 자동 모드는 추천 순서, 직접 선택 모드는 선택한 순서(자동 구성을 할 수 없는 운동은 unsupported에 있고 여기에 없다).
   */
  items: readonly BeginnerPlanItem[]
  /** 예상 총 시간(초). 항상 추정치다. */
  estimatedTotalSeconds: number
  isEstimate: true
  warnings: readonly PlanWarning[]
  /** 직접 선택에서 자동 구성을 할 수 없는 운동(자동 모드에서는 항상 빈 배열) */
  unsupported: readonly UnsupportedSelection[]
  /** 직접 선택에서 최소 세트로도 시간을 넘을 때만 값이 있다. */
  overtime: PlanOvertime | null
  /**
   * 이 결과를 그대로 확정(운동 목록으로 변환)해도 되는지. blockers가 비어 있고 운동이 1개 이상일 때만 true다.
   * false이면 사용자가 교체·시간 변경 등을 해야 하며, 일부만 조용히 확정할 수 없다.
   */
  confirmable: boolean
  /** confirmable이 false인 이유(noBasisForSelection·timeInfeasible·noCandidates). 확정 가능하면 빈 배열 */
  blockers: readonly PlanFailureCode[]
}

/** 엔진의 반환. ok:false는 입력·권한·카탈로그 문제이거나 자동 모드에서 만들 수 있는 구성이 없는 경우다(수치를 만들지 않는다). */
export type PlanOutcome =
  | { ok: true; plan: BeginnerPlanResult }
  | { ok: false; failures: readonly PlanFailure[] }
