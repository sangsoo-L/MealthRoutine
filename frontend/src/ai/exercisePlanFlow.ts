import {
  DIFFICULTIES,
  TOOLS,
  type ExerciseDifficulty,
  type ExerciseTool,
} from '../exercise/exerciseTaxonomy.ts'
import type { ExerciseCategory } from '../exercise/exerciseTypes.ts'
import {
  PLAN_MINUTES_CHOICES,
  PLAN_PARTS,
  type PlanMinutes,
} from './exercisePlanSelect.ts'

/**
 * I02-1 조건 입력 흐름의 상태와 판정(순수 함수). 한 번에 한 질문: 난이도 → 부위 → 도구 → 시간 → 결과.
 * 이전 단계로 돌아가도 고른 값을 유지한다. 조건을 자동으로 채우거나 완화하지 않는다(도구는 고르지 않으면 비어 있고, 맨몸도 직접 골라야 한다).
 */
export type PlanStep = 'difficulty' | 'parts' | 'tools' | 'minutes' | 'result'

export const INPUT_STEP_ORDER: readonly Exclude<PlanStep, 'result'>[] = [
  'difficulty',
  'parts',
  'tools',
  'minutes',
]

export interface PlanInputs {
  difficulty: ExerciseDifficulty | null
  parts: readonly ExerciseCategory[]
  tools: readonly ExerciseTool[]
  minutes: PlanMinutes | null
}

export const INITIAL_PLAN_INPUTS: PlanInputs = {
  difficulty: null,
  parts: [],
  tools: [],
  minutes: null,
}

export const STEP_TITLE: Record<Exclude<PlanStep, 'result'>, string> = {
  difficulty: '난이도를 골라요',
  parts: '운동 부위를 골라요',
  tools: '사용할 도구를 골라요',
  minutes: '운동 시간을 골라요',
}

/** 다중 선택 토글. 목록 순서는 기준 순서(order)를 따라 항상 같다. */
export function toggleValue<T>(
  list: readonly T[],
  value: T,
  order: readonly T[],
): T[] {
  const next = list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value]
  return order.filter((item) => next.includes(item))
}

export const toggleTool = (list: readonly ExerciseTool[], tool: ExerciseTool) =>
  toggleValue(list, tool, TOOLS)

export const togglePart = (
  list: readonly ExerciseCategory[],
  part: ExerciseCategory,
) => toggleValue(list, part, PLAN_PARTS)

/** 이 단계의 값이 채워져 다음으로 갈 수 있는가(부위·도구는 최소 1개). */
export function canProceed(
  step: Exclude<PlanStep, 'result'>,
  inputs: PlanInputs,
): boolean {
  switch (step) {
    case 'difficulty':
      return inputs.difficulty !== null
    case 'parts':
      return inputs.parts.length > 0
    case 'tools':
      return inputs.tools.length > 0
    case 'minutes':
      return inputs.minutes !== null
  }
}

export function isComplete(inputs: PlanInputs): boolean {
  return INPUT_STEP_ORDER.every((step) => canProceed(step, inputs))
}

export function previousStep(
  step: Exclude<PlanStep, 'result'>,
): Exclude<PlanStep, 'result'> | null {
  const index = INPUT_STEP_ORDER.indexOf(step)
  return index > 0 ? INPUT_STEP_ORDER[index - 1] : null
}

export function nextStep(step: Exclude<PlanStep, 'result'>): PlanStep {
  const index = INPUT_STEP_ORDER.indexOf(step)
  return index < INPUT_STEP_ORDER.length - 1
    ? INPUT_STEP_ORDER[index + 1]
    : 'result'
}

export const DIFFICULTY_CHOICES = DIFFICULTIES
export const MINUTES_CHOICES = PLAN_MINUTES_CHOICES
export const PART_CHOICES = PLAN_PARTS
export const TOOL_CHOICES = TOOLS
