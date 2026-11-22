import { TOOLS, type ExerciseTool } from '../exerciseTaxonomy.ts'
import type { Exercise, ExerciseCategory } from '../exerciseTypes.ts'
import { MAX_ITEMS } from '../workoutDraftModel.ts'
import { checkBeginnerPlanAccess } from './access.ts'
import type {
  BeginnerPlanRequest,
  PlanWarningCode,
  UnsupportedSelection,
  ExerciseClassification,
  ExerciseExclusion,
  NumberRange,
  PlanFailure,
  PlanFailureCode,
  PlanMode,
  PlanPurpose,
  PlanRecordType,
  PlanRole,
  PlanValidation,
  QuantityRule,
} from './types.ts'

/**
 * 초급 맞춤 운동 구성의 규칙(순수 데이터·함수). 추천 목록을 만들지 않는다(엔진은 P2-2).
 *
 * ## 수치의 성격
 * 아래 수치는 **검증된 운동 처방이 아니다.** 프로젝트의 가상 루틴 시드(33개, 99항목: "가상 루틴"으로 설명된 개발용 데이터)에서
 * 난이도 초급 루틴의 항목이 보여 주는 값을 알고리즘 검증용 초기 가정값으로 옮긴 것이다. 의학·전문가 검수를 거치지 않았고,
 * 체중 감량 효과나 안전을 보장하지 않는다. 그래서 다음 원칙을 지킨다.
 * - 수치는 시드에서 관찰된 값의 범위 안에서만 쓴다(범위를 넓혀 추정하지 않는다). 예외는 세트 수의 아래쪽(1세트까지) 하나뿐이며, 시간이 모자랄 때
 *   운동량을 **줄이는** 방향의 허용이라 관찰값보다 많은 운동량을 만들지 않는다. 시드 대비 일치는 테스트가 계속 확인한다.
 * - 규칙 묶음 안에서도 **그 운동 자신의 초급 루틴 항목이 시드에 있을 때만** 적용한다(없으면 noExerciseEvidence로 제외).
 * - 중량이 필요한 운동·복합 방식·초급이 아닌 운동·근거 묶음이 없는 운동에는 수치를 만들지 않는다.
 */

// ─── 입력 선택지 ───────────────────────────────────────────

export const PLAN_PURPOSES: readonly PlanPurpose[] = [
  'learn',
  'maintain',
  'lose',
]

/** 목표 이름(화면 표시). 의학적 진단·치료 목적의 처방이 아니다. */
export const PLAN_PURPOSE_LABEL: Record<PlanPurpose, string> = {
  learn: '운동 습관 · 기초 익히기',
  maintain: '현재 운동 습관 유지',
  lose: '체중 관리',
}

/**
 * 목표별로 큰 분류를 고르는 우선순위(엔진이 순서대로 돌려 가며 고른다). **UX 설계 가정이며 근거 자료가 없다.**
 * 효과를 주장하지 않고, 목표에 따라 구성이 달라 보이도록 하는 정렬 기준일 뿐이다.
 * - learn: 기본 움직임(하체·상체·코어)을 폭넓게 익히는 순서
 * - maintain: 상체·하체·코어를 고르게 도는 순서
 * - lose: 큰 근육과 전신 활동(걷기 등)을 먼저 두는 순서
 */
export const PURPOSE_CATEGORY_PRIORITY: Record<
  PlanPurpose,
  readonly ExerciseCategory[]
> = {
  learn: ['하체', '상체', '코어', '전신'],
  maintain: ['상체', '하체', '코어', '전신'],
  lose: ['전신', '하체', '코어', '상체'],
}

export const PLAN_MODES: readonly PlanMode[] = ['automatic', 'selected']

/** 운동 가능 시간의 유효 범위(분). 기존 운동 목표(`minutesPerSession`)와 같은 5~180이다. */
export const PLAN_MINUTES_MIN = 5
export const PLAN_MINUTES_MAX = 180
/** 운동 목표 요약을 읽을 수 없을 때 보여 주는 선택지(분). */
export const PLAN_MINUTES_PRESETS: readonly number[] = [10, 20, 30]

export function isValidPlanMinutes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= PLAN_MINUTES_MIN &&
    value <= PLAN_MINUTES_MAX
  )
}

/**
 * 운동 가능 시간의 초기값. 운동 목표 요약(`ExerciseGoalSummary.minutesPerSession`)이 유효하면 그 값, 아니면 null이다.
 * null이면 화면이 PLAN_MINUTES_PRESETS(10·20·30분)에서 고르게 한다. 값을 임의로 채우지 않는다.
 * 사용자가 오늘만 바꾼 값은 이 추천 작업에만 쓰고 회원정보를 덮어쓰지 않는다.
 */
export function initialAvailableMinutes(
  summaryMinutes: number | null | undefined,
): number | null {
  return isValidPlanMinutes(summaryMinutes) ? summaryMinutes : null
}

/** 도구가 필요 없는 운동(맨몸)은 도구와 무관하게 항상 쓸 수 있다. */
export const BODYWEIGHT_TOOL: ExerciseTool = '맨몸'
export const PLAN_DEFAULT_TOOLS: readonly ExerciseTool[] = [BODYWEIGHT_TOOL]

export function isPlanTool(value: unknown): value is ExerciseTool {
  return (
    typeof value === 'string' && (TOOLS as readonly string[]).includes(value)
  )
}

// ─── 수치 규칙 ────────────────────────────────────────────

const range = (min: number, def: number, max: number): NumberRange => ({
  min,
  default: def,
  max,
})

/**
 * 규칙 묶음 4개. 각 범위는 해당 묶음 운동의 초급 루틴 시드 항목에서 관찰된 값이며(tests/beginnerPlanRules.test.mjs가 시드와 대조한다),
 * 관찰값 밖으로 넓히지 않았다(세트 수의 최솟값 1만 줄이는 방향의 예외). 그래서 범위가 좁다(예: 횟수 8회 고정). 시간이 모자랄 때 줄이는 것은 세트 수뿐이다.
 */
export const QUANTITY_RULES: readonly QuantityRule[] = [
  {
    id: 'strength-reps',
    recordType: 'reps',
    appliesTo: {
      parts: [
        '등',
        '가슴',
        '어깨',
        '팔',
        '엉덩이',
        '허벅지',
        '종아리',
        '복부',
        '허리',
      ],
      tools: ['맨몸', '밴드'],
    },
    // 초급 루틴의 횟수형 항목은 모두 2세트 · 8회 · 휴식 60초였다.
    sets: range(1, 2, 2),
    target: range(8, 8, 8),
    restSeconds: range(60, 60, 60),
  },
  {
    id: 'core-hold',
    recordType: 'time',
    appliesTo: { parts: ['복부'], tools: ['맨몸'] },
    // 초급 루틴의 플랭크: 2세트 · 20초 · 휴식 60초
    sets: range(1, 2, 2),
    target: range(20, 20, 20),
    restSeconds: range(60, 60, 60),
  },
  {
    id: 'stretch-hold',
    recordType: 'time',
    appliesTo: { parts: ['스트레칭'], tools: ['맨몸'] },
    // 초급 루틴의 맨몸 스트레칭 3개: 모두 2세트 · 20초 · 휴식 60초
    sets: range(1, 2, 2),
    target: range(20, 20, 20),
    restSeconds: range(60, 60, 60),
  },
  {
    id: 'walk-cardio',
    recordType: 'time',
    appliesTo: { parts: ['유산소'], tools: ['맨몸'] },
    // 초급 루틴의 제자리 걷기: 1세트 · 60초 또는 120초 · 휴식 30초
    sets: range(1, 1, 1),
    target: range(60, 60, 120),
    restSeconds: range(30, 30, 30),
  },
]

// ─── 시드 근거 수집·운동별 판정 ───────────────────────────

/** 시드 초급 루틴에서 관찰한 한 항목의 목표값(운동별 근거). */
export interface PlanObservation {
  sets: number
  reps: number | null
  seconds: number | null
  /** 시드에 휴식 값이 없으면 null(그 관찰값은 규칙 근거로 쓰지 않는다). */
  restSeconds: number | null
}

/** 운동 id → 그 운동의 초급 루틴 시드 관찰값. */
export type BeginnerEvidence = ReadonlyMap<string, readonly PlanObservation[]>

/** 근거 수집에 필요한 카탈로그의 최소 모양(시드 카탈로그가 만족한다). */
export interface EvidenceSource {
  getAllRoutines(): readonly { id: string; difficulty: string }[]
  getRoutineItems(routineId: string):
    | readonly {
        exerciseId: string
        targetSets: number
        targetReps: number | null
        targetDurationSeconds: number | null
        restSeconds: number | null
      }[]
    | null
}

/** 난이도 초급 루틴의 항목에서 운동별 관찰값을 모은다. 읽기만 하고 시드를 바꾸지 않는다. */
export function collectBeginnerEvidence(
  source: EvidenceSource,
): BeginnerEvidence {
  const evidence = new Map<string, PlanObservation[]>()
  for (const routine of source.getAllRoutines()) {
    if (routine.difficulty !== '초급') continue
    for (const item of source.getRoutineItems(routine.id) ?? []) {
      const list = evidence.get(item.exerciseId) ?? []
      list.push({
        sets: item.targetSets,
        reps: item.targetReps,
        seconds: item.targetDurationSeconds,
        restSeconds: item.restSeconds,
      })
      evidence.set(item.exerciseId, list)
    }
  }
  return evidence
}

const inRange = (value: number, r: NumberRange) =>
  value >= r.min && value <= r.max

/** 관찰값이 규칙 범위 안에 있는지(횟수·시간은 규칙의 기록 방식에 해당하는 쪽만 본다). */
function observationFits(rule: QuantityRule, obs: PlanObservation): boolean {
  const target = rule.recordType === 'reps' ? obs.reps : obs.seconds
  return (
    target !== null &&
    obs.restSeconds !== null &&
    inRange(obs.sets, rule.sets) &&
    inRange(target, rule.target) &&
    inRange(obs.restSeconds, rule.restSeconds)
  )
}

/** 운동 판정에 필요한 필드만 가진 모양(Exercise가 만족한다). */
export type PlanExerciseInfo = Pick<
  Exercise,
  | 'id'
  | 'name'
  | 'category'
  | 'targetMuscles'
  | 'difficulty'
  | 'equipment'
  | 'recordModes'
  | 'summary'
>

export interface ClassifyContext {
  /** 사용할 수 있는 도구(맨몸은 항상 사용 가능) */
  tools: readonly ExerciseTool[]
  evidence: BeginnerEvidence
}

function isPlanRecordType(value: string): value is PlanRecordType {
  return value === 'reps' || value === 'time'
}

/**
 * 운동 하나를 자동 구성에서 쓸 수 있는지 판정한다. 이유가 하나라도 있으면 수치를 만들지 않는다.
 * 확인 순서: 기록 방식 메타데이터 → 중량 운동 → 지원 방식(reps·time) → 초급 난이도 → 규칙 묶음 → 운동별 근거 → 도구.
 * 중량 운동은 기본 방식이 weight_reps·weight_time이면 허용 방식에 time이 있어도 제외한다.
 */
export function classifyExercise(
  exercise: PlanExerciseInfo,
  context: ClassifyContext,
): ExerciseClassification {
  const modes = exercise.recordModes
  if (!modes) return { eligible: false, reason: 'noRecordModeMeta' }
  if (modes.default === 'weight_reps' || modes.default === 'weight_time') {
    return { eligible: false, reason: 'weightExercise' }
  }
  if (!isPlanRecordType(modes.default)) {
    return { eligible: false, reason: 'unsupportedRecordMode' }
  }
  const recordType = modes.default
  if (exercise.difficulty !== '초급') {
    return { eligible: false, reason: 'notBeginnerDifficulty' }
  }
  const part = exercise.targetMuscles[0]
  const rule = QUANTITY_RULES.find(
    (r) =>
      r.recordType === recordType &&
      part !== undefined &&
      r.appliesTo.parts.includes(part) &&
      exercise.equipment.every((tool) => r.appliesTo.tools.includes(tool)),
  )
  if (!rule) return { eligible: false, reason: 'noRuleGroup' }
  const observations = (context.evidence.get(exercise.id) ?? []).filter(
    (obs) => (recordType === 'reps' ? obs.reps : obs.seconds) !== null,
  )
  if (
    observations.length === 0 ||
    !observations.every((obs) => observationFits(rule, obs))
  ) {
    return { eligible: false, reason: 'noExerciseEvidence' }
  }
  const toolsOk = exercise.equipment.every(
    (tool) => tool === BODYWEIGHT_TOOL || context.tools.includes(tool),
  )
  if (!toolsOk) return { eligible: false, reason: 'toolUnavailable' }
  return { eligible: true, recordType, rule }
}

/**
 * 추천 화면이 도구 선택지로 보여 줄 도구: 도구를 모두 쓸 수 있다고 가정했을 때 자동 구성에 쓸 수 있는 운동이 하나 이상 있는 도구.
 * 맨몸은 항상 앞에 둔다. (예: 덤벨은 초급 덤벨 운동이 모두 중량 운동이라 선택지가 되지 않는다.)
 */
export function listEligibleTools(
  exercises: readonly PlanExerciseInfo[],
  evidence: BeginnerEvidence,
): readonly ExerciseTool[] {
  const tools = new Set<ExerciseTool>([BODYWEIGHT_TOOL])
  for (const exercise of exercises) {
    const result = classifyExercise(exercise, { tools: TOOLS, evidence })
    if (!result.eligible) continue
    for (const tool of exercise.equipment) tools.add(tool)
  }
  return TOOLS.filter((tool) => tools.has(tool))
}

// ─── 자동 추천의 운동 개수 상한 · 구성 역할 ─────────────────

/**
 * 전체 자동 추천의 운동 개수 상한(UX 정책). 초급 사용자 화면이 복잡해지지 않도록 정한 값이며 의학적 운동 처방 기준이 아니다.
 * 상한은 채워야 하는 개수가 아니다(시간·후보가 모자라면 더 적게 추천한다). 직접 선택에는 적용하지 않는다.
 */
export const AUTO_EXERCISE_CAPS: readonly {
  maxMinutes: number
  maxExercises: number
}[] = [
  { maxMinutes: 10, maxExercises: 3 },
  { maxMinutes: 20, maxExercises: 4 },
  { maxMinutes: 30, maxExercises: 5 },
  { maxMinutes: 60, maxExercises: 6 },
  { maxMinutes: PLAN_MINUTES_MAX, maxExercises: 8 },
]

/** 운동 가능 시간(분)에 따른 자동 추천 최대 운동 개수. 유효한 시간(5~180 정수)이 아니면 RangeError. */
export function maxAutoExercises(minutes: number): number {
  if (!isValidPlanMinutes(minutes)) {
    throw new RangeError(`운동 가능 시간이 올바르지 않아요: ${minutes}`)
  }
  const cap = AUTO_EXERCISE_CAPS.find((c) => minutes <= c.maxMinutes)
  return (cap as { maxExercises: number }).maxExercises
}

/** 시작 운동·마무리 운동을 따로 두는 최소 운동 개수 상한. 이보다 작으면(10분 이하) 주요 운동만 구성한다. */
export const BOOKEND_MIN_CAP = 4

/**
 * 시작 운동(warmup)의 근거 문구: 운동 설명(summary)에 "서서히"가 있고(점진적으로 강도를 높이는 활동임을 설명이 밝힌 경우),
 * 유산소 분류의 걷기 규칙(walk-cardio) 운동일 때만 시작 운동이다. 운동 이름으로 추측하지 않는다.
 */
export const WARMUP_SUMMARY_PHRASE = '서서히'

export const PLAN_ROLE_LABEL: Record<PlanRole, string> = {
  warmup: '시작 운동',
  main: '주요 운동',
  cooldown: '마무리 운동',
}

/**
 * 운동의 구성 역할. 카탈로그 메타데이터(부위 분류 = exercise_type)와 설명으로 확인되는 경우만 시작·마무리다.
 * - 마무리(cooldown): 부위 분류가 스트레칭이고 스트레칭 규칙(stretch-hold)이 적용되는 운동
 * - 시작(warmup): 부위 분류가 유산소이고 걷기 규칙(walk-cardio)이 적용되며 설명에 WARMUP_SUMMARY_PHRASE가 있는 운동
 * - 그 밖과 근거가 부족한 운동은 모두 주요 운동(main)이다. 역할의 전문적 효과를 주장하지 않는다.
 */
export function planRoleOf(
  exercise: PlanExerciseInfo,
  rule: QuantityRule,
): PlanRole {
  const part = exercise.targetMuscles[0]
  if (rule.id === 'stretch-hold' && part === '스트레칭') return 'cooldown'
  if (
    rule.id === 'walk-cardio' &&
    part === '유산소' &&
    (exercise.summary ?? '').includes(WARMUP_SUMMARY_PHRASE)
  ) {
    return 'warmup'
  }
  return 'main'
}

// ─── 예상 시간 ────────────────────────────────────────────

/** 횟수형 1회 수행 시간의 추정치(초). 실제 측정값이나 안전 기준이 아니다. 화면에는 "약"·"예상"으로 표기한다. */
export const ASSUMED_SECONDS_PER_REP = 3
/** 운동 사이 전환 시간의 추정치(초). 실제 측정값이나 안전 기준이 아니다. */
export const ASSUMED_TRANSITION_SECONDS = 30

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${name}은(는) 1 이상의 정수여야 해요: ${value}`)
  }
}

/**
 * 운동 하나의 예상 시간(초) = 세트 수행 시간 합 + 세트 사이 휴식((세트 수 − 1) × 휴식).
 * 횟수형 한 세트는 목표 횟수 × 추정 1회 시간, 시간형 한 세트는 목표 시간이다. 마지막 세트 뒤에는 휴식을 더하지 않는다.
 */
export function estimateItemSeconds(input: {
  recordType: PlanRecordType
  sets: number
  /** 목표 횟수(reps) 또는 목표 시간(초, time) */
  target: number
  restSeconds: number
}): number {
  assertPositiveInteger(input.sets, '세트 수')
  assertPositiveInteger(input.target, '목표 값')
  if (!Number.isInteger(input.restSeconds) || input.restSeconds < 0) {
    throw new RangeError(
      `휴식 시간은 0 이상의 정수여야 해요: ${input.restSeconds}`,
    )
  }
  const perSet =
    input.recordType === 'reps'
      ? input.target * ASSUMED_SECONDS_PER_REP
      : input.target
  return input.sets * perSet + (input.sets - 1) * input.restSeconds
}

/** 예상 총 시간(초) = 운동별 예상 시간 합 + 운동 사이 전환((운동 수 − 1) × 전환 시간). 운동이 없으면 0. */
export function estimateTotalSeconds(
  items: readonly { estimatedSeconds: number }[],
): number {
  if (items.length === 0) return 0
  const sum = items.reduce((total, item) => total + item.estimatedSeconds, 0)
  return sum + (items.length - 1) * ASSUMED_TRANSITION_SECONDS
}

// ─── 구성 균형 안내 기준(UX 안내용) ───────────────────────

/** 한 큰 분류가 이 비율 이상이면 편중 안내 후보다. 임상적 위험 기준이 아닌 UX 안내용 초기값이다. */
export const SKEW_RATIO = 0.7
/** 운동이 이 개수보다 적으면 편중 안내를 하지 않는다(1~2개는 비율이 의미 없다). */
export const SKEW_MIN_ITEMS = 3

/** 큰 분류 표시·동률 정렬 순서(고정). */
const CATEGORY_ORDER: readonly ExerciseCategory[] = [
  '상체',
  '하체',
  '코어',
  '전신',
]

/**
 * 한 큰 분류가 전체의 SKEW_RATIO 이상이면 그 분류와 비율을 돌려준다(운동이 SKEW_MIN_ITEMS개 미만이면 null).
 * UX 안내용 판정이며 의학적 위험 판정이 아니다. 추천을 막는 데 쓰지 않는다.
 */
export function detectBodyPartSkew(
  categories: readonly ExerciseCategory[],
): { category: ExerciseCategory; ratio: number } | null {
  if (categories.length < SKEW_MIN_ITEMS) return null
  for (const category of CATEGORY_ORDER) {
    const ratio =
      categories.filter((c) => c === category).length / categories.length
    if (ratio >= SKEW_RATIO) return { category, ratio }
  }
  return null
}

// ─── 입력 검증 ────────────────────────────────────────────

const TIER_FAILURE: Record<
  'unknown' | 'notBeginner' | 'invalid',
  PlanFailureCode
> = {
  unknown: 'tierUnknown',
  notBeginner: 'tierNotBeginner',
  invalid: 'tierInvalid',
}

/**
 * 추천 요청을 검증한다. 권한(초급)과 모든 입력을 한 번에 확인하고 실패를 모두 모아 돌려준다. 값을 고쳐 쓰거나 대신 채우지 않는다.
 * - 권한: 운동 이해도가 beginner가 아니면 tierUnknown·tierNotBeginner·tierInvalid
 * - 목표: learn·maintain·lose만. 운동 가능 시간: 5~180 정수. 모드: automatic·selected
 * - 도구: 배열(비어 있어도 됨, 맨몸은 자동 포함)이며 카탈로그 도구 이름만. 중복은 합친다.
 * - 직접 선택: 운동 id는 비어 있지 않은 문자열이고 중복이 없으며 1개 이상(최대 MAX_ITEMS). 자동 모드에서는 선택 id를 받지 않는다.
 * - 회전값: 생략하면 0, 있으면 0 이상의 정수
 */
export function validatePlanInput(
  request: BeginnerPlanRequest,
): PlanValidation {
  const failures: PlanFailure[] = []
  const access = checkBeginnerPlanAccess(request.exerciseTier)
  if (!access.ok) {
    failures.push({ code: TIER_FAILURE[access.reason], field: 'tier' })
  }

  const purpose = request.purpose
  const purposeOk =
    typeof purpose === 'string' &&
    (PLAN_PURPOSES as readonly string[]).includes(purpose)
  if (!purposeOk) failures.push({ code: 'purposeInvalid', field: 'purpose' })

  if (!isValidPlanMinutes(request.availableMinutes)) {
    failures.push({ code: 'minutesInvalid', field: 'availableMinutes' })
  }

  let tools: ExerciseTool[] = []
  if (
    !Array.isArray(request.tools) ||
    !request.tools.every((tool: unknown) => isPlanTool(tool))
  ) {
    failures.push({ code: 'toolsInvalid', field: 'tools' })
  } else {
    tools = [
      BODYWEIGHT_TOOL,
      ...new Set(
        (request.tools as ExerciseTool[]).filter(
          (tool) => tool !== BODYWEIGHT_TOOL,
        ),
      ),
    ]
  }

  const mode = request.mode
  const modeOk =
    typeof mode === 'string' && (PLAN_MODES as readonly string[]).includes(mode)
  if (!modeOk) failures.push({ code: 'modeInvalid', field: 'mode' })

  const ids = request.selectedExerciseIds
  let selected: string[] = []
  if (mode === 'selected') {
    if (
      ids === undefined ||
      ids === null ||
      (Array.isArray(ids) && ids.length === 0)
    ) {
      failures.push({ code: 'selectionRequired', field: 'selectedExerciseIds' })
    } else if (
      !Array.isArray(ids) ||
      ids.length > MAX_ITEMS ||
      !ids.every((id: unknown) => typeof id === 'string' && id.trim() !== '') ||
      new Set(ids).size !== ids.length
    ) {
      failures.push({ code: 'selectionInvalid', field: 'selectedExerciseIds' })
    } else {
      selected = [...(ids as string[])]
    }
  } else if (
    modeOk &&
    ids !== undefined &&
    ids !== null &&
    !(Array.isArray(ids) && ids.length === 0)
  ) {
    // 자동 모드에서 선택 운동을 받으면 어느 쪽을 따라야 할지 모호하므로 거부한다.
    failures.push({ code: 'selectionInvalid', field: 'selectedExerciseIds' })
  }

  const rotationRaw = request.rotation
  const rotation = rotationRaw === undefined ? 0 : rotationRaw
  if (
    typeof rotation !== 'number' ||
    !Number.isInteger(rotation) ||
    rotation < 0
  ) {
    failures.push({ code: 'rotationInvalid', field: 'rotation' })
  }

  if (failures.length > 0) return { ok: false, failures }
  return {
    ok: true,
    input: {
      tier: 'beginner',
      purpose: purpose as PlanPurpose,
      availableMinutes: request.availableMinutes as number,
      tools,
      mode: mode as PlanMode,
      selectedExerciseIds: selected,
      rotation: rotation as number,
    },
  }
}

// ─── 사용자 안내 문구(한국어) ─────────────────────────────

const FAILURE_MESSAGE: Record<PlanFailureCode, string> = {
  tierUnknown:
    '운동 이해도를 확인하지 못했어요. 이해도 확인을 마치면 맞춤 운동 구성을 쓸 수 있어요.',
  tierNotBeginner:
    '맞춤 운동 구성은 운동 이해도가 초급인 회원을 위한 기능이에요. 운동 목록은 직접 구성할 수 있어요.',
  tierInvalid:
    '운동 이해도 정보가 올바르지 않아 맞춤 운동 구성을 쓸 수 없어요.',
  purposeInvalid: '오늘의 운동 목표를 골라 주세요.',
  minutesInvalid: `운동 가능 시간은 ${PLAN_MINUTES_MIN}~${PLAN_MINUTES_MAX}분 사이로 정해 주세요.`,
  toolsInvalid: '사용할 수 있는 운동 도구를 다시 확인해 주세요.',
  modeInvalid: '운동 구성 방법을 골라 주세요.',
  selectionRequired: '직접 구성하려면 운동을 하나 이상 골라 주세요.',
  selectionInvalid:
    '선택한 운동 목록이 올바르지 않아요. 같은 운동이 겹치지 않는지 확인해 주세요.',
  rotationInvalid:
    '다시 추천 요청이 올바르지 않아요. 잠시 후 다시 시도해 주세요.',
  catalogUnavailable:
    '운동 정보를 불러오지 못해 추천할 수 없어요. 잠시 후 다시 시도해 주세요.',
  noCandidates:
    '지금 조건에 맞는 운동이 없어요. 도구를 바꾸거나 직접 운동을 골라 보세요.',
  ruleMissing:
    '이 조건에는 안전하게 정할 수 있는 운동량 기준이 아직 없어 추천하지 않았어요.',
  noBasisForSelection:
    '고른 운동 중에는 운동량을 정할 근거가 없어 자동으로 구성할 수 없는 운동이 있어요. 다른 운동으로 바꿔 보세요.',
  timeInfeasible:
    '운동 가능 시간 안에 구성하기 어려워요. 시간을 늘리거나 운동 수를 줄여 보세요.',
}

export function describePlanFailure(code: PlanFailureCode): string {
  return FAILURE_MESSAGE[code]
}

const EXCLUSION_MESSAGE: Record<ExerciseExclusion, string> = {
  noRecordModeMeta: '운동 방식 정보가 없어 자동으로 구성할 수 없어요.',
  weightExercise:
    '중량이 필요한 운동이라 자동으로 구성하지 않아요. 다른 운동으로 바꿔 보세요.',
  unsupportedRecordMode: '이 운동은 아직 자동 구성을 지원하지 않아요.',
  notBeginnerDifficulty:
    '초급이 아닌 운동은 운동량을 정할 근거가 없어 자동으로 구성하지 않아요.',
  noRuleGroup:
    '이 운동은 운동량을 정할 기준이 아직 없어 자동으로 구성하지 않아요.',
  noExerciseEvidence:
    '이 운동은 운동량을 정할 참고 값이 없어 자동으로 구성하지 않아요.',
  toolUnavailable: '선택하지 않은 운동 도구가 필요한 운동이에요.',
}

export function describeExclusion(reason: ExerciseExclusion): string {
  return EXCLUSION_MESSAGE[reason]
}

const WARNING_MESSAGE: Record<PlanWarningCode, string> = {
  overTime:
    '선택한 운동을 가장 적은 세트로 해도 운동 가능 시간을 넘어요. 운동 수를 줄이거나 시간을 늘려 보세요.',
  bodyPartSkew:
    '고른 운동이 한 부위에 몰려 있어요. 다른 부위 운동을 섞어도 좋아요. (안내용이에요)',
  toolMismatch: '선택하지 않은 운동 도구가 필요한 운동이에요.',
  noBasis: '이 운동은 운동량을 정할 근거가 없어 자동으로 구성하지 않아요.',
  weightExercise: '중량이 필요한 운동이라 자동으로 구성하지 않아요.',
  limitedCandidates:
    '지금 조건에서 쓸 수 있는 운동을 모두 넣었어요. 도구를 추가하면 더 다양하게 구성할 수 있어요.',
}

export function describePlanWarning(code: PlanWarningCode): string {
  return WARNING_MESSAGE[code]
}

/** 직접 선택한 운동을 자동으로 구성할 수 없는 이유 문구(카탈로그에 없는 운동 포함). */
export function describeUnsupportedReason(
  reason: UnsupportedSelection['reason'],
): string {
  return reason === 'notFound'
    ? '운동 정보를 찾을 수 없어 자동으로 구성할 수 없어요.'
    : describeExclusion(reason)
}

const ITEM_REASON_MESSAGE = {
  purposeFit: '오늘의 운동 목표와 가능 시간에 맞춰 골랐어요.',
  userSelected: '직접 고른 운동이에요. 운동량을 자동으로 정했어요.',
} as const

export function describeItemReason(
  reason: keyof typeof ITEM_REASON_MESSAGE,
): string {
  return ITEM_REASON_MESSAGE[reason]
}
