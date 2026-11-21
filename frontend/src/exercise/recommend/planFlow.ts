import type { ExerciseTool } from '../exerciseTaxonomy.ts'
import {
  PLAN_DEFAULT_TOOLS,
  PLAN_MINUTES_MAX,
  PLAN_MINUTES_MIN,
  PLAN_PURPOSES,
  isPlanTool,
  isValidPlanMinutes,
} from './rules.ts'
import type {
  BeginnerPlanItem,
  BeginnerPlanRequest,
  BeginnerPlanResult,
  PlanMode,
  PlanPurpose,
} from './types.ts'

/**
 * 초급 운동 추천 화면(S7 P2-4)의 순수 로직: 화면이 들고 있는 "입력 상태"와 그 변경, 추천 요청 만들기, 사용자 문구.
 * React·저장소·시계에 의존하지 않는다. 추천 결과는 상태에 저장하지 않는다 — 입력(요청)만 두고 결과는 엔진으로 다시 계산한다
 * (결과를 직접 고치면 planToDraft의 재계산 대조에서 거부되므로, 모든 수정은 새 입력으로 새 요청을 만드는 방식이다).
 */

export const PATH_PLAN = '/records/exercise/plan'
export const PATH_REVIEW = '/records/exercise/review'

/** 화면의 단계. mode: 구성 방법 선택, conditions: 조건 입력, pick: 운동 고르기(W13 재사용), result: 추천 결과. */
export type PlanStep = 'mode' | 'conditions' | 'pick' | 'result'

/** 사용자가 정한 값(= 추천 요청의 재료). 아직 고르지 않은 값은 null이다(임의로 채우지 않는다). */
export interface PlanInputs {
  mode: PlanMode
  purpose: PlanPurpose | null
  minutes: number | null
  tools: readonly ExerciseTool[]
  /** 직접 선택 모드의 운동 id(선택 순서, 문자열) */
  selectedIds: readonly string[]
  /** 다시 추천할 때 올리는 값(0 이상 정수) */
  rotation: number
}

export const INITIAL_INPUTS: PlanInputs = {
  mode: 'automatic',
  purpose: null,
  minutes: null,
  tools: PLAN_DEFAULT_TOOLS,
  selectedIds: [],
  rotation: 0,
}

export function initialInputs(mode: PlanMode): PlanInputs {
  return { ...INITIAL_INPUTS, mode }
}

/** 추천을 만들 수 있을 만큼 입력했는지(목표·시간, 직접 선택은 운동 1개 이상). */
export function isReadyForPlan(inputs: PlanInputs): boolean {
  return (
    inputs.purpose !== null &&
    isValidPlanMinutes(inputs.minutes) &&
    (inputs.mode === 'automatic' || inputs.selectedIds.length > 0)
  )
}

/**
 * 엔진에 넘길 요청을 만든다. exerciseTier는 호출자가 방금 확인한 현재 운동 이해도다(화면이 임의로 'beginner'를 적지 않는다).
 * 아직 고르지 않은 목표·시간은 그대로 null로 넘기며 엔진의 검증이 거부한다.
 */
export function toRequest(
  inputs: PlanInputs,
  exerciseTier: unknown,
): BeginnerPlanRequest {
  return {
    exerciseTier,
    purpose: inputs.purpose,
    availableMinutes: inputs.minutes,
    tools: [...inputs.tools],
    mode: inputs.mode,
    ...(inputs.mode === 'selected'
      ? { selectedExerciseIds: [...inputs.selectedIds] }
      : {}),
    rotation: inputs.rotation,
  }
}

// ─── 입력 변경(불변) ───────────────────────────────────────

/** 도구를 켜고 끈다. 맨몸은 항상 포함되어 끌 수 없다. */
export function toggleTool(
  tools: readonly ExerciseTool[],
  tool: ExerciseTool,
): readonly ExerciseTool[] {
  if (tool === '맨몸') return tools
  return tools.includes(tool)
    ? tools.filter((t) => t !== tool)
    : [...tools, tool]
}

/** 고른 운동을 끝에 더한다(이미 있는 운동은 건너뛴다. 입력 순서 유지). */
export function appendSelected(
  ids: readonly string[],
  added: readonly string[],
): { ids: readonly string[]; skipped: number } {
  const next = [...ids]
  let skipped = 0
  for (const id of added) {
    if (next.includes(id)) skipped += 1
    else next.push(id)
  }
  return { ids: next, skipped }
}

/** 사용자가 직접 누른 "빼기". 다른 운동의 순서는 그대로다. */
export function removeSelected(
  ids: readonly string[],
  id: string,
): readonly string[] {
  return ids.filter((x) => x !== id)
}

/** 운동 하나를 다른 운동으로 바꾼다(같은 자리). 바꿀 운동이 목록에 없거나 새 운동이 이미 목록에 있으면 null. */
export function replaceSelected(
  ids: readonly string[],
  oldId: string,
  newId: string,
): readonly string[] | null {
  const index = ids.indexOf(oldId)
  if (index === -1 || (newId !== oldId && ids.includes(newId))) return null
  return ids.map((id, i) => (i === index ? newId : id))
}

export function nextRotation(rotation: number): number {
  return rotation + 1
}

// ─── 사용자 문구 ───────────────────────────────────────────

/** "약 10분". 1분 미만도 최소 1분으로 올림해서 보인다(추정치라 "약"을 붙인다). */
export function approxMinutesLabel(seconds: number): string {
  return `약 ${Math.max(1, Math.ceil(seconds / 60))}분`
}

/** 결과 요약 한 줄. 예: "최대 30분 가능 · 추천 운동 약 10분" */
export function summaryLine(
  plan: Pick<BeginnerPlanResult, 'availableMinutes' | 'estimatedTotalSeconds'>,
): string {
  return `최대 ${plan.availableMinutes}분 가능 · 추천 운동 ${approxMinutesLabel(plan.estimatedTotalSeconds)}`
}

/** "2세트 · 한 세트에 8번" / "1세트 · 한 세트에 60초". 내부 기록 방식 코드는 노출하지 않는다. */
export function setsLine(
  item: Pick<BeginnerPlanItem, 'recordType' | 'sets'>,
): string {
  const first = item.sets[0]
  const amount =
    item.recordType === 'reps'
      ? `${first?.reps ?? 0}번`
      : `${first?.targetSeconds ?? 0}초`
  return `${item.sets.length}세트 · 한 세트에 ${amount}`
}

/** 세트가 2개 이상일 때만 휴식 안내가 있다(1세트면 세트 사이 휴식이 없다). */
export function restLine(
  item: Pick<BeginnerPlanItem, 'sets' | 'restSeconds'>,
): string | null {
  return item.sets.length > 1
    ? `세트 사이 약 ${item.restSeconds}초 쉬어요`
    : null
}

export const PLAN_TEXT = {
  safety:
    '추천 세트와 횟수는 운동을 시작할 때 참고할 수 있는 값이며, 개인의 체력이나 건강 상태에 맞춘 전문 운동 처방은 아니에요. 운동 중 통증이나 어지러움 등 이상 증상이 느껴지면 바로 멈추고 쉬어 주세요.',
  restNote:
    '쉬는 시간은 이 화면에서만 알려 드려요. 운동 진행 화면에서 자동으로 재 주지는 않아요.',
  estimateNote:
    '예상 시간은 대략적인 추정이에요. 실제 운동 시간과 다를 수 있어요.',
  timeNote: '운동 가능 시간은 최대 시간이에요. 꼭 채우지 않아도 괜찮아요.',
  switchedToSelected:
    '직접 고른 운동 목록으로 바뀌었어요. 고른 운동은 순서 그대로 유지돼요.',
} as const

export const MINUTES_RANGE_TEXT = `${PLAN_MINUTES_MIN}~${PLAN_MINUTES_MAX}분`

/** 입력 목표 목록(화면 표시 순서). */
export const PURPOSE_CHOICES: readonly {
  value: PlanPurpose
  label: string
  hint: string
}[] = [
  {
    value: 'learn',
    label: '운동 습관 만들기',
    hint: '기본 동작을 가볍게 익혀요.',
  },
  {
    value: 'maintain',
    label: '현재 운동 습관 유지',
    hint: '지금 하는 운동을 이어 가요.',
  },
  {
    value: 'lose',
    label: '체중 관리',
    hint: '몸을 많이 쓰는 동작부터 시작해요.',
  },
]
// 목표 선택지가 엔진이 지원하는 목표와 같은지 개발 중에 바로 확인할 수 있게 한다.
export const PURPOSE_CHOICE_VALUES: readonly PlanPurpose[] =
  PURPOSE_CHOICES.map((choice) => choice.value)
export const SUPPORTED_PURPOSES = PLAN_PURPOSES

/** 저장소에서 읽은 도구 값 중 유효한 것만(알 수 없는 값은 버린다). */
export function validTools(value: unknown): readonly ExerciseTool[] | null {
  if (!Array.isArray(value) || !value.every((tool) => isPlanTool(tool))) {
    return null
  }
  const tools = new Set<ExerciseTool>(['맨몸'])
  for (const tool of value as ExerciseTool[]) tools.add(tool)
  return [...tools]
}
