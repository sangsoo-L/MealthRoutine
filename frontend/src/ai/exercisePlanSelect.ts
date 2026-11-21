import {
  DIFFICULTIES,
  TOOLS,
  type ExerciseDifficulty,
  type ExerciseTool,
} from '../exercise/exerciseTaxonomy.ts'
import type { Exercise, ExerciseCategory } from '../exercise/exerciseTypes.ts'
import {
  estimateItemSeconds,
  estimateTotalSeconds,
} from '../exercise/recommend/rules.ts'
import {
  evidenceFor,
  type EvidenceIssue,
  type LevelEvidence,
  type UsableEvidence,
} from './exercisePlanEvidence.ts'

/**
 * I02-1 로컬 예시 추천의 후보 선정·플랜 구성(순수 함수). 실제 AI가 아니며 W01-2 추천 엔진(exercise/recommend)을 바꾸거나 쓰지 않는다
 * (예상 시간 계산 함수 estimateItemSeconds·estimateTotalSeconds만 읽어 쓴다).
 *
 * 후보 조건(사용자 확정, 자동 완화 없음):
 * - 난이도는 운동의 난이도와 정확히 같아야 한다.
 * - 부위는 선택한 부위(상체·하체·코어·전신) 중 하나에 해당해야 한다.
 * - 도구는 그 운동이 필요한 도구가 **모두** 사용자가 고른 도구 안에 있어야 한다. 맨몸도 고른 경우에만 포함된다.
 * 등록 가능한 플랜에는 같은 난이도 루틴에 일관된 운동량 근거가 있는 후보만 넣는다(exercisePlanEvidence). 나머지 후보는 이유와 함께 "후보만" 보여 준다.
 *
 * 구성: 선택한 부위를 순서대로 돌며 부위마다 운동 하나씩 고른다. 같은 입력·같은 rotation이면 같은 결과이고, rotation을 올리면 후보 순서가 바뀐다.
 * 운동 수 상한은 10분 3개·20분 4개·30분 5개이며, 예상 총 시간(운동 사이 전환 포함)이 고른 시간 이하일 때만 담는다.
 * 세트·횟수·시간·휴식은 근거 그대로이고 바꾸지 않으며, 시간이 남아도 근거 없는 운동은 더하지 않는다. 중량은 만들지 않는다.
 */

export type PlanMinutes = 10 | 20 | 30
export const PLAN_MINUTES_CHOICES: readonly PlanMinutes[] = [10, 20, 30]

/** 시간별 운동 수 상한(사용자 확정). */
export const MAX_ITEMS_BY_MINUTES: Record<PlanMinutes, number> = {
  10: 3,
  20: 4,
  30: 5,
}

export const PLAN_PARTS: readonly ExerciseCategory[] = [
  '상체',
  '하체',
  '코어',
  '전신',
]

export interface PlanConditions {
  difficulty: ExerciseDifficulty
  parts: readonly ExerciseCategory[]
  tools: readonly ExerciseTool[]
  minutes: PlanMinutes
}

/** 화면에서 모은 조건이 올바른지 확인한다(올바르지 않으면 이유 코드). */
export function validateConditions(
  value: Partial<{
    difficulty: unknown
    parts: unknown
    tools: unknown
    minutes: unknown
  }>,
): { ok: true; conditions: PlanConditions } | { ok: false; field: string } {
  const { difficulty, parts, tools, minutes } = value
  if (!(DIFFICULTIES as readonly unknown[]).includes(difficulty))
    return { ok: false, field: 'difficulty' }
  if (
    !Array.isArray(parts) ||
    parts.length === 0 ||
    !parts.every((part: unknown) =>
      (PLAN_PARTS as readonly unknown[]).includes(part),
    )
  )
    return { ok: false, field: 'parts' }
  if (
    !Array.isArray(tools) ||
    tools.length === 0 ||
    !tools.every((tool: unknown) =>
      (TOOLS as readonly unknown[]).includes(tool),
    )
  )
    return { ok: false, field: 'tools' }
  if (!(PLAN_MINUTES_CHOICES as readonly unknown[]).includes(minutes))
    return { ok: false, field: 'minutes' }
  return {
    ok: true,
    conditions: {
      difficulty: difficulty as ExerciseDifficulty,
      parts: PLAN_PARTS.filter((part) => parts.includes(part)),
      tools: TOOLS.filter((tool) => tools.includes(tool)),
      minutes: minutes as PlanMinutes,
    },
  }
}

export type PlanExerciseInput = Pick<
  Exercise,
  'id' | 'name' | 'category' | 'difficulty' | 'equipment' | 'recordModes'
>

/** 후보 조건(난이도·부위·도구)을 모두 만족하는 운동만 고른다. 입력 순서를 바꾸지 않는다. */
export function filterCandidates(
  exercises: readonly PlanExerciseInput[],
  conditions: PlanConditions,
): PlanExerciseInput[] {
  return exercises.filter(
    (exercise) =>
      exercise.difficulty === conditions.difficulty &&
      conditions.parts.includes(exercise.category) &&
      exercise.equipment.every((tool) => conditions.tools.includes(tool)),
  )
}

/** 표시용 기록 방식(저장 코드와 같은 이름). weight는 중량+횟수형이다. */
export type PlanItemRecordType = 'reps' | 'time' | 'weight'

export interface PlanItem {
  exerciseId: string
  name: string
  category: ExerciseCategory
  tools: readonly ExerciseTool[]
  recordType: PlanItemRecordType
  sets: number
  reps: number | null
  seconds: number | null
  restSeconds: number
  /** 중량을 사용자가 직접 입력해야 하는 운동(중량은 자동으로 정하지 않는다) */
  needsWeight: boolean
  /** 이 운동의 예상 시간(초, 세트 사이 휴식 포함) */
  estimatedSeconds: number
}

export interface ExcludedCandidate {
  exerciseId: string
  name: string
  category: ExerciseCategory
  tools: readonly ExerciseTool[]
  reason: EvidenceIssue
}

export type PlanStatus =
  /** 조건 오류 */
  | 'invalid'
  /** 조건에 맞는 운동이 하나도 없다 */
  | 'noCandidates'
  /** 후보는 있지만 운동량 근거가 있는 운동이 없다 */
  | 'noPlannable'
  /** 근거가 있는 운동은 있지만 선택한 시간 안에 들어가는 것이 없다 */
  | 'timeShort'
  | 'ok'

export interface PlanResult {
  status: PlanStatus
  conditions: PlanConditions | null
  rotation: number
  items: PlanItem[]
  /** 플랜 항목의 예상 총 시간(초, 운동 사이 전환 포함). 항목이 없으면 null(허위 시간을 만들지 않는다). */
  totalSeconds: number | null
  /** 선택한 시간의 상한(초) */
  limitSeconds: number | null
  /** 후보 중 근거가 없거나 충돌해 플랜에 넣지 않은 운동("후보만") */
  excluded: ExcludedCandidate[]
  /** 조건에 맞는 후보 수 */
  candidateCount: number
  /** 근거가 있는 후보 수 */
  plannableCount: number
  /** 근거가 있지만 이번 구성(개수·시간 상한)에 들지 않은 후보 수 */
  notSelectedCount: number
}

const EMPTY: Omit<PlanResult, 'status' | 'conditions' | 'rotation'> = {
  items: [],
  totalSeconds: null,
  limitSeconds: null,
  excluded: [],
  candidateCount: 0,
  plannableCount: 0,
  notSelectedCount: 0,
}

/** 운동 id 정렬(항상 같은 순서): 둘 다 숫자 문자열이면 숫자로, 아니면 문자열로 비교한다. */
function compareIds(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  return Number.isInteger(na) && Number.isInteger(nb) && String(na) === a
    ? na - nb
    : a < b
      ? -1
      : a > b
        ? 1
        : 0
}

function toItem(
  exercise: PlanExerciseInput,
  evidence: UsableEvidence,
): PlanItem {
  const mode = exercise.recordModes?.default
  const time = mode === 'time'
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    category: exercise.category,
    tools: exercise.equipment,
    recordType: time ? 'time' : mode === 'weight_reps' ? 'weight' : 'reps',
    sets: evidence.sets,
    reps: evidence.reps,
    seconds: evidence.seconds,
    restSeconds: evidence.restSeconds,
    needsWeight: mode === 'weight_reps',
    // 횟수형(중량 포함)은 횟수 × 추정 1회 시간, 시간형은 목표 시간으로 센다(근거 값 그대로, 중량 입력 시간은 반영하지 않는다).
    estimatedSeconds: estimateItemSeconds({
      recordType: time ? 'time' : 'reps',
      sets: evidence.sets,
      target: (time ? evidence.seconds : evidence.reps) as number,
      restSeconds: evidence.restSeconds,
    }),
  }
}

/**
 * 로컬 예시 플랜을 만든다. 조건이 올바르지 않으면 invalid, 후보가 없으면 noCandidates, 근거 있는 후보가 없으면 noPlannable이다
 * (어느 경우에도 조건을 완화하거나 다른 운동으로 채우지 않는다).
 */
export function buildLocalPlan(input: {
  conditions: unknown
  rotation?: number
  exercises: readonly PlanExerciseInput[]
  evidence: LevelEvidence
}): PlanResult {
  const parsed = validateConditions(
    (input.conditions ?? {}) as Parameters<typeof validateConditions>[0],
  )
  const rotation =
    Number.isInteger(input.rotation) && (input.rotation as number) >= 0
      ? (input.rotation as number)
      : 0
  if (!parsed.ok) {
    return { ...EMPTY, status: 'invalid', conditions: null, rotation }
  }
  const { conditions } = parsed
  const limitSeconds = conditions.minutes * 60
  const candidates = filterCandidates(input.exercises, conditions)
  const plannable: { exercise: PlanExerciseInput; item: PlanItem }[] = []
  const excluded: ExcludedCandidate[] = []
  for (const exercise of candidates) {
    const result = evidenceFor(exercise, input.evidence)
    if (result.ok) {
      plannable.push({ exercise, item: toItem(exercise, result.evidence) })
    } else {
      excluded.push({
        exerciseId: exercise.id,
        name: exercise.name,
        category: exercise.category,
        tools: exercise.equipment,
        reason: result.issue,
      })
    }
  }
  excluded.sort((a, b) => compareIds(a.exerciseId, b.exerciseId))
  const base = {
    conditions,
    rotation,
    limitSeconds,
    excluded,
    candidateCount: candidates.length,
    plannableCount: plannable.length,
  }
  if (candidates.length === 0) {
    return { ...EMPTY, ...base, status: 'noCandidates' }
  }
  if (plannable.length === 0) {
    return { ...EMPTY, ...base, status: 'noPlannable', notSelectedCount: 0 }
  }

  // 부위별 줄: 선택한 부위 순서, 부위 안은 id 순서를 rotation만큼 돌린다.
  const lanes = conditions.parts
    .map((part) => {
      const inPart = plannable
        .filter((entry) => entry.exercise.category === part)
        .sort((a, b) => compareIds(a.exercise.id, b.exercise.id))
      const shift = inPart.length === 0 ? 0 : rotation % inPart.length
      return [...inPart.slice(shift), ...inPart.slice(0, shift)]
    })
    .filter((lane) => lane.length > 0)

  const maxItems = MAX_ITEMS_BY_MINUTES[conditions.minutes]
  const items: PlanItem[] = []
  while (items.length < maxItems && lanes.some((lane) => lane.length > 0)) {
    for (const lane of lanes) {
      if (items.length >= maxItems) break
      // 이 부위에서 시간 안에 들어가는 첫 운동을 고른다. 들어가지 않는 운동은 이번 구성에서 건너뛴다.
      while (lane.length > 0) {
        const entry = lane.shift()
        if (!entry) break
        const total = estimateTotalSeconds([...items, entry.item])
        if (total <= limitSeconds) {
          items.push(entry.item)
          break
        }
      }
    }
  }
  if (items.length === 0) {
    return {
      ...EMPTY,
      ...base,
      status: 'timeShort',
      notSelectedCount: plannable.length,
    }
  }
  return {
    ...base,
    status: 'ok',
    items,
    totalSeconds: estimateTotalSeconds(items),
    notSelectedCount: plannable.length - items.length,
  }
}

/**
 * 같은 조건에서 후보 순서가 바뀌는 다음 rotation을 찾는다. 지금 구성과 운동 순서가 다른 결과가 나오는 가장 가까운 rotation이고,
 * 바꿀 수 있는 다른 구성이 없으면 null이다(같은 결과를 "다시 추천"이라고 보여 주지 않으려는 것이다).
 */
export function nextRotation(
  input: Parameters<typeof buildLocalPlan>[0],
  current: PlanResult,
): number | null {
  if (current.status !== 'ok') return null
  const key = (plan: PlanResult) =>
    plan.items.map((i) => i.exerciseId).join(',')
  const currentKey = key(current)
  const limit = Math.max(1, current.plannableCount)
  for (let step = 1; step <= limit; step += 1) {
    const rotation = current.rotation + step
    if (key(buildLocalPlan({ ...input, rotation })) !== currentKey) {
      return rotation
    }
  }
  return null
}

/** 예상 시간을 "약 N분"으로 읽기 좋게 만든다(올림하지 않고 가장 가까운 분, 최소 1분). 값이 없으면 null. */
export function approxMinutes(seconds: number | null): number | null {
  if (seconds === null) return null
  return Math.max(1, Math.round(seconds / 60))
}
