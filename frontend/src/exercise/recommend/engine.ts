import type { ExerciseTool } from '../exerciseTaxonomy.ts'
import {
  BOOKEND_MIN_CAP,
  PURPOSE_CATEGORY_PRIORITY,
  classifyExercise,
  collectBeginnerEvidence,
  detectBodyPartSkew,
  estimateItemSeconds,
  estimateTotalSeconds,
  maxAutoExercises,
  planRoleOf,
  validatePlanInput,
  type BeginnerEvidence,
  type EvidenceSource,
  type PlanExerciseInfo,
} from './rules.ts'
import type {
  BeginnerPlanItem,
  BeginnerPlanRequest,
  PlanFailure,
  PlanFailureCode,
  PlanOutcome,
  PlanOvertime,
  PlanRecordType,
  PlanRole,
  PlanSet,
  PlanWarning,
  QuantityRule,
  UnsupportedSelection,
  ValidatedPlanInput,
} from './types.ts'
import { assertBeginnerPlanAccess } from './access.ts'

/**
 * 초급 사용자 전용 자동 운동 추천 엔진(순수 함수). 규칙 기반이며 외부 호출·무작위·시계에 의존하지 않는다.
 * 같은 입력(요청 + 같은 카탈로그)이면 항상 같은 결과를 돌려준다.
 *
 * - 권한·입력 검증은 rules.validatePlanInput(= access.checkBeginnerPlanAccess)을 그대로 쓴다. 초급이 아니면 아무것도 만들지 않는다.
 * - 운동별 사용 가능 여부와 수치 범위는 rules.classifyExercise·QUANTITY_RULES를 그대로 쓴다(중복 구현 없음).
 *   규칙 밖의 수치(횟수·시간·세트·휴식)와 중량 목표는 만들지 않는다. 세트 수는 규칙 기본값에서 시작해 줄이는 방향으로만 바꾼다.
 * - 운동 가능 시간은 상한이다. 시간을 채우려고 세트를 늘리거나 운동을 더하지 않는다(자동 모드는 시간대별 개수 상한도 있다).
 * - 이 파일은 WorkoutDraft 변환·저장을 하지 않는다(P2-3).
 */

/** 엔진이 읽는 카탈로그와 근거(시드 카탈로그에서 createPlanSource로 만든다). */
export interface PlanSource {
  exercises: readonly PlanExerciseInfo[]
  evidence: BeginnerEvidence
}

/** 시드 카탈로그 등으로 PlanSource를 만든다(읽기만 한다). */
export function createPlanSource(
  catalog: EvidenceSource & { getAllExercises(): readonly PlanExerciseInfo[] },
): PlanSource {
  return {
    exercises: catalog.getAllExercises(),
    evidence: collectBeginnerEvidence(catalog),
  }
}

interface Candidate {
  exercise: PlanExerciseInfo
  rule: QuantityRule
  recordType: PlanRecordType
  role: PlanRole
}

/** 운동 id 정렬: 둘 다 숫자 문자열이면 숫자로, 아니면 문자열로 비교한다(항상 같은 순서). */
function compareIds(a: string, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (/^\d+$/.test(a) && /^\d+$/.test(b) && na !== nb) return na - nb
  return a < b ? -1 : a > b ? 1 : 0
}

function setsOf(rule: QuantityRule, count: number): readonly PlanSet[] {
  const target = rule.target.default
  return Array.from({ length: count }, () =>
    rule.recordType === 'reps' ? { reps: target } : { targetSeconds: target },
  )
}

function makeItem(
  candidate: Candidate,
  setCount: number,
  reason: BeginnerPlanItem['reason'],
): BeginnerPlanItem {
  const { rule, exercise, recordType } = candidate
  return {
    exerciseId: exercise.id,
    name: exercise.name,
    category: exercise.category,
    recordType,
    role: candidate.role,
    sets: setsOf(rule, setCount),
    restSeconds: rule.restSeconds.default,
    estimatedSeconds: estimateItemSeconds({
      recordType,
      sets: setCount,
      target: rule.target.default,
      restSeconds: rule.restSeconds.default,
    }),
    reason,
  }
}

function skewWarnings(items: readonly BeginnerPlanItem[]): PlanWarning[] {
  const skew = detectBodyPartSkew(items.map((item) => item.category))
  return skew ? [{ code: 'bodyPartSkew', category: skew.category }] : []
}

function candidatesOf(
  exercises: readonly PlanExerciseInfo[],
  tools: readonly ExerciseTool[],
  evidence: BeginnerEvidence,
): Candidate[] {
  const list: Candidate[] = []
  for (const exercise of exercises) {
    const result = classifyExercise(exercise, { tools, evidence })
    if (result.eligible) {
      list.push({
        exercise,
        rule: result.rule,
        recordType: result.recordType,
        role: planRoleOf(exercise, result.rule),
      })
    }
  }
  return list.sort((a, b) => compareIds(a.exercise.id, b.exercise.id))
}

// ─── 전체 자동 추천 ────────────────────────────────────────

const rotate = <T>(list: readonly T[], offset: number): T[] =>
  list.length === 0
    ? []
    : [
        ...list.slice(offset % list.length),
        ...list.slice(0, offset % list.length),
      ]

/**
 * 전체 자동 추천. 구성 순서는 시작 운동 → 주요 운동 → 마무리 운동이다.
 * - 운동 개수는 시간대별 UX 상한(maxAutoExercises) 이하다. 상한을 채우려고 운동을 더하지 않는다.
 * - 상한이 BOOKEND_MIN_CAP(4) 이상이면 시작 운동과 마무리 운동을 각각 하나까지 상한 안에 넣는다(카탈로그에서 역할이 확인되는
 *   운동이 있을 때만. 없으면 건너뛰고 추천은 그대로 가능하다). 10분 이하(상한 3)는 주요 운동만 구성한다.
 * - 주요 운동은 목표별 큰 분류 우선순위(PURPOSE_CATEGORY_PRIORITY)대로 분류를 돌며 한 개씩 고르고, 분류 안에서는 id 순서를
 *   회전값만큼 돌려 시작한다. 시작·마무리 운동도 같은 회전값으로 후보를 돌려 고른다.
 * - 시작·마무리 운동의 시간을 먼저 확보하고 주요 운동을 채운다. 기본 세트로 넣었을 때 상한을 넘는 운동은 건너뛴다
 *   (세트를 줄여 끼워 넣거나 늘려 채우지 않는다).
 */
function buildAutomatic(
  input: ValidatedPlanInput,
  source: PlanSource,
): PlanOutcome {
  const candidates = candidatesOf(
    source.exercises,
    input.tools,
    source.evidence,
  )
  if (candidates.length === 0) {
    return { ok: false, failures: [{ code: 'noCandidates' }] }
  }
  const limitSeconds = input.availableMinutes * 60
  const cap = maxAutoExercises(input.availableMinutes)
  const asItem = (c: Candidate) =>
    makeItem(c, c.rule.sets.default, 'purposeFit')

  const mains = candidates.filter((c) => c.role === 'main')
  const warmups = rotate(
    candidates.filter((c) => c.role === 'warmup'),
    input.rotation,
  )
  const cooldowns = rotate(
    candidates.filter((c) => c.role === 'cooldown'),
    input.rotation,
  )

  /** 주요 운동 후보 순서(분류 라운드 로빈). 같은 입력이면 항상 같다. */
  const mainSequence = (): Candidate[] => {
    const queues: Candidate[][] = []
    for (const category of PURPOSE_CATEGORY_PRIORITY[input.purpose]) {
      const queue = mains.filter((c) => c.exercise.category === category)
      if (queue.length > 0) queues.push(rotate(queue, input.rotation))
    }
    const sequence: Candidate[] = []
    for (let round = 0; queues.some((q) => round < q.length); round += 1) {
      for (const queue of queues) {
        if (round < queue.length) sequence.push(queue[round])
      }
    }
    return sequence
  }

  const assemble = (withBookends: boolean) => {
    const warm = withBookends ? warmups[0] : undefined
    const cool = withBookends ? cooldowns[0] : undefined
    const mainTarget = cap - (warm ? 1 : 0) - (cool ? 1 : 0)
    const picked: Candidate[] = []
    for (const candidate of mainSequence()) {
      if (picked.length >= mainTarget) break
      const withCandidate = [warm, ...picked, candidate, cool].filter(
        (c): c is Candidate => c !== undefined,
      )
      if (estimateTotalSeconds(withCandidate.map(asItem)) <= limitSeconds) {
        picked.push(candidate)
      }
    }
    return { warm, cool, picked, mainTarget }
  }

  let plan = assemble(cap >= BOOKEND_MIN_CAP)
  // 시간이 모자라 주요 운동이 하나도 들어가지 않으면 시작·마무리를 빼고 다시 구성한다.
  if (plan.picked.length === 0 && (plan.warm || plan.cool)) {
    plan = assemble(false)
  }
  const ordered = [plan.warm, ...plan.picked, plan.cool].filter(
    (c): c is Candidate => c !== undefined,
  )
  if (ordered.length === 0) {
    return { ok: false, failures: [{ code: 'timeInfeasible' }] }
  }
  const items = ordered.map(asItem)
  const estimatedTotalSeconds = estimateTotalSeconds(items)

  const warnings: PlanWarning[] = [...skewWarnings(items)]
  // 쓸 수 있는 주요 운동을 모두 넣었는데도 상한에 못 미치면 후보가 모자란 것이다.
  if (
    plan.picked.length === mains.length &&
    plan.picked.length < plan.mainTarget
  ) {
    warnings.push({ code: 'limitedCandidates' })
  }

  return {
    ok: true,
    plan: {
      mode: 'automatic',
      purpose: input.purpose,
      availableMinutes: input.availableMinutes,
      limitSeconds,
      items,
      estimatedTotalSeconds,
      isEstimate: true,
      warnings,
      unsupported: [],
      overtime: null,
      confirmable: true,
      blockers: [],
    },
  }
}

// ─── 직접 선택 후 자동 설정 ────────────────────────────────

/**
 * 선택한 운동 순서와 개수를 그대로 둔다. 운동마다 규칙 기본 세트로 시작하고, 상한을 넘으면 가장 많은 세트를 가진 운동(동률이면 뒤쪽 운동)부터
 * 한 세트씩 줄인다. 모두 최소 세트여도 넘으면 운동을 지우지 않고 초과 정보(overtime)와 확정 불가를 돌려준다.
 * 자동 구성을 할 수 없는 운동이 하나라도 있으면 나머지를 확정 가능한 결과로 돌려주지 않는다(confirmable:false).
 */
function buildSelected(
  input: ValidatedPlanInput,
  source: PlanSource,
): PlanOutcome {
  const byId = new Map(source.exercises.map((e) => [e.id, e]))
  const limitSeconds = input.availableMinutes * 60

  const supported: Candidate[] = []
  const unsupported: UnsupportedSelection[] = []
  input.selectedExerciseIds.forEach((exerciseId, index) => {
    const exercise = byId.get(exerciseId)
    if (!exercise) {
      unsupported.push({ exerciseId, index, name: null, reason: 'notFound' })
      return
    }
    const result = classifyExercise(exercise, {
      tools: input.tools,
      evidence: source.evidence,
    })
    if (result.eligible) {
      supported.push({
        exercise,
        rule: result.rule,
        recordType: result.recordType,
        role: planRoleOf(exercise, result.rule),
      })
    } else {
      unsupported.push({
        exerciseId,
        index,
        name: exercise.name,
        reason: result.reason,
      })
    }
  })

  const counts = supported.map((c) => c.rule.sets.default)
  const build = (): BeginnerPlanItem[] =>
    supported.map((c, i) => makeItem(c, counts[i], 'userSelected'))
  let items = build()
  while (estimateTotalSeconds(items) > limitSeconds) {
    let pick = -1
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] <= supported[i].rule.sets.min) continue
      // 가장 많은 세트를 가진 운동, 동률이면 뒤쪽 운동
      if (pick === -1 || counts[i] >= counts[pick]) pick = i
    }
    if (pick === -1) break
    counts[pick] -= 1
    items = build()
  }

  const estimatedTotalSeconds = estimateTotalSeconds(items)
  let overtime: PlanOvertime | null = null
  if (items.length > 0 && estimatedTotalSeconds > limitSeconds) {
    // 이 시점의 세트 수가 모두 최소다(더 줄일 수 없었다).
    let fits = 0
    for (let k = items.length; k >= 1; k -= 1) {
      if (estimateTotalSeconds(items.slice(0, k)) <= limitSeconds) {
        fits = k
        break
      }
    }
    overtime = {
      limitSeconds,
      minimumTotalSeconds: estimatedTotalSeconds,
      excessSeconds: estimatedTotalSeconds - limitSeconds,
      fitsExerciseCount: fits,
      minutesNeeded: Math.ceil(estimatedTotalSeconds / 60),
    }
  }

  const warnings: PlanWarning[] = []
  for (const entry of unsupported) {
    warnings.push({
      code:
        entry.reason === 'toolUnavailable'
          ? 'toolMismatch'
          : entry.reason === 'weightExercise'
            ? 'weightExercise'
            : 'noBasis',
      exerciseId: entry.exerciseId,
    })
  }
  if (overtime) warnings.push({ code: 'overTime' })
  // 선택한 운동 전체(구성할 수 없는 운동 포함)의 분류로 편중을 본다. 정보 제공용이라 확정을 막지 않는다.
  const categories = input.selectedExerciseIds.flatMap((id) => {
    const exercise = byId.get(id)
    return exercise ? [exercise.category] : []
  })
  const skew = detectBodyPartSkew(categories)
  if (skew) warnings.push({ code: 'bodyPartSkew', category: skew.category })

  const blockers: PlanFailureCode[] = []
  if (unsupported.length > 0) blockers.push('noBasisForSelection')
  if (overtime) blockers.push('timeInfeasible')
  if (items.length === 0 && unsupported.length === 0)
    blockers.push('noCandidates')

  return {
    ok: true,
    plan: {
      mode: 'selected',
      purpose: input.purpose,
      availableMinutes: input.availableMinutes,
      limitSeconds,
      items,
      estimatedTotalSeconds,
      isEstimate: true,
      warnings,
      unsupported,
      overtime,
      confirmable: blockers.length === 0 && items.length > 0,
      blockers,
    },
  }
}

// ─── 진입점 ────────────────────────────────────────────────

/**
 * 추천을 만든다. 요청을 검증(권한 포함)하고 모드에 따라 자동 추천 또는 직접 선택 자동 설정을 실행한다.
 * 입력·권한이 올바르지 않거나 카탈로그가 없거나 자동 모드에서 만들 수 있는 구성이 없으면 ok:false(failures)를 돌려준다.
 * 직접 선택은 사용자의 선택을 유지하므로 구성할 수 없는 운동·시간 초과가 있어도 ok:true이며 confirmable:false와 blockers로 알린다.
 */
export function buildBeginnerPlan(
  request: BeginnerPlanRequest,
  source: PlanSource,
): PlanOutcome {
  const validation = validatePlanInput(request)
  if (!validation.ok) return { ok: false, failures: validation.failures }
  // 검증을 우회해 만든 입력이 들어오는 경우를 대비해 한 번 더 확인한다(권한이 없으면 던진다).
  assertBeginnerPlanAccess(validation.input.tier)
  if (!Array.isArray(source.exercises) || source.exercises.length === 0) {
    const failures: PlanFailure[] = [{ code: 'catalogUnavailable' }]
    return { ok: false, failures }
  }
  return validation.input.mode === 'automatic'
    ? buildAutomatic(validation.input, source)
    : buildSelected(validation.input, source)
}
