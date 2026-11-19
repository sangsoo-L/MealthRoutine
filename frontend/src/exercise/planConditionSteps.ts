import { TOOLS, type ExerciseTool } from './exerciseTaxonomy.ts'
import {
  toggleTool,
  type PlanInputs,
  type PlanStep,
} from './recommend/planFlow.ts'
import { BODYWEIGHT_TOOL, isValidPlanMinutes } from './recommend/rules.ts'
import type { PlanMode } from './recommend/types.ts'

/**
 * 초급 운동 추천(W01-2)의 "조건 설정" 단계 화면(S8-UI-1)의 순수 로직: 단계 번호·이동·유효성·진행 문구·버튼 문구.
 * 추천 엔진(`recommend/`)과 입력 계약(PlanInputs)은 건드리지 않는다. 이 모듈은 화면이 어느 질문을 보여 줄지만 정하고,
 * 고른 값은 기존 PlanInputs 그대로 엔진에 전달된다(값을 보정하거나 바꾸지 않는다).
 * React·저장소에 의존하지 않는다.
 *
 * 단계: 1 운동 목표 → 2 운동 시간 → 3 사용할 도구 → (직접 선택 모드만) 4 운동 고르기.
 * 직접 선택 모드의 운동 고르기는 선택한 도구에 따라 "자동으로 구성할 수 있는지"가 달라지므로 도구 뒤에 둔다(기존 입력 항목, 새 기능 아님).
 */

export type ConditionStep = 1 | 2 | 3 | 4

/** 전체 단계 수. 전체 자동 추천은 3단계, 직접 선택은 운동 고르기가 더해져 4단계다. */
export function totalSteps(mode: PlanMode): 3 | 4 {
  return mode === 'selected' ? 4 : 3
}

/** 모드에 없는 단계 번호는 마지막 단계로 맞춘다(자동 추천에는 4단계가 없다). */
export function clampStep(step: ConditionStep, mode: PlanMode): ConditionStep {
  return step > totalSteps(mode) ? (totalSteps(mode) as ConditionStep) : step
}

/**
 * 이 단계에서 "다음"으로 갈 수 있는지. 엔진이 허용하는 값만 통과시킨다.
 * 도구는 맨몸이 기본이라 고르지 않아도 되므로 항상 통과한다(필수 입력으로 바꾸지 않는다).
 */
export function stepIsValid(step: ConditionStep, inputs: PlanInputs): boolean {
  switch (step) {
    case 1:
      return inputs.purpose !== null
    case 2:
      return isValidPlanMinutes(inputs.minutes)
    case 3:
      return true
    case 4:
      return inputs.selectedIds.length > 0
  }
}

/** 다음 단계. 마지막 단계면 null(= 추천/자동 설정을 만든다). */
export function nextStep(
  step: ConditionStep,
  mode: PlanMode,
): ConditionStep | null {
  return step >= totalSteps(mode) ? null : ((step + 1) as ConditionStep)
}

/** 이전 단계. 첫 단계면 null. */
export function prevStep(step: ConditionStep): ConditionStep | null {
  return step <= 1 ? null : ((step - 1) as ConditionStep)
}

/**
 * 화면을 새로 열 때(새로고침 복원) 보여 줄 단계. 마지막 위치를 따로 저장하지 않으므로 입력한 값에서 이어 간다:
 * 목표가 없으면 1, 시간이 없으면 2, 직접 선택에서 이미 고른 운동이 있으면 4, 그 밖에는 3.
 * 직접 선택에서 운동을 고르는 화면(pick)을 보다가 새로고침했다면 그 화면은 4단계에서 열었던 것이므로 돌아올 곳도 4단계다
 * (고른 운동이 아직 없어도 3단계로 되돌리지 않는다).
 */
export function restoredStep(
  inputs: PlanInputs,
  sessionStep?: PlanStep,
): ConditionStep {
  if (inputs.purpose === null) return 1
  if (!isValidPlanMinutes(inputs.minutes)) return 2
  if (
    inputs.mode === 'selected' &&
    (sessionStep === 'pick' || inputs.selectedIds.length > 0)
  )
    return 4
  return 3
}

/** 단계 표시 문구. 예: "1/3단계" */
export function progressLabel(step: ConditionStep, mode: PlanMode): string {
  return `${step}/${totalSteps(mode)}단계`
}

/** 보조기기용 진행 문구. 예: "3단계 중 1단계" */
export function progressSpeech(step: ConditionStep, mode: PlanMode): string {
  return `${totalSteps(mode)}단계 중 ${step}단계`
}

/** 주요 버튼 문구. 전체 자동 추천의 마지막 단계는 추천을 만든다. */
export function ctaLabel(step: ConditionStep, mode: PlanMode): string {
  if (step < totalSteps(mode)) return '다음'
  return mode === 'selected' ? '세트와 목표 자동으로 정하기' : '운동 추천받기'
}

/** 다음으로 갈 수 없을 때의 안내. 갈 수 있으면 null. */
export function invalidMessage(
  step: ConditionStep,
  inputs: PlanInputs,
): string | null {
  if (stepIsValid(step, inputs)) return null
  switch (step) {
    case 1:
      return '운동 목표를 골라 주세요.'
    case 2:
      return '운동 가능 시간을 골라 주세요.'
    case 3:
      return null
    case 4:
      return '운동을 하나 이상 골라 주세요.'
  }
}

/** 단계별 질문과 보조 문구. */
export const STEP_TEXT: Readonly<
  Record<ConditionStep, { title: string; hint: string }>
> = {
  1: {
    title: '어떤 목표로 운동하고 싶으세요?',
    hint: '목표에 맞춰 운동을 추천해 드릴게요.',
  },
  2: {
    title: '오늘은 얼마나 운동할 수 있나요?',
    hint: '부담 없이 운동할 수 있는 시간을 선택해 주세요.',
  },
  3: {
    title: '사용할 수 있는 운동 도구가 있나요?',
    hint: '가지고 있는 도구를 선택하면 가능한 운동을 찾아드려요.',
  },
  4: {
    title: '어떤 운동으로 구성할까요?',
    hint: '하고 싶은 운동을 고르면 세트와 목표를 자동으로 정해 드려요.',
  },
}

// ─── 3단계: 도구 선택지 ───────────────────────────────────

/**
 * 도구 카드 한 장의 상태.
 * - always: 맨몸. 도구가 필요 없는 운동이라 항상 포함되고 끌 수 없다.
 * - selectable: 고르면 추천에 쓸 수 있는 운동이 있는 도구(엔진의 listEligibleTools).
 * - unavailable: 운동 탐색(E01)에는 있지만 초급 자동 추천 엔진이 쓸 수 있는 운동이 없는 도구. 고를 수 없고 이유를 글자로 보여 준다.
 */
export type ToolChoiceState = 'always' | 'selectable' | 'unavailable'

export interface ToolChoice {
  tool: ExerciseTool
  state: ToolChoiceState
}

/**
 * 도구 선택지 목록. 목록과 순서는 운동 탐색(E01)의 운동 도구 필터와 같은 공통 정의(exerciseTaxonomy.TOOLS)이고, 이름을 따로 적지 않는다.
 * 추천 엔진이 실제로 쓸 수 있는 도구(selectable, 엔진의 listEligibleTools 결과)만 고를 수 있다.
 * 엔진이 쓸 수 없는 도구를 고를 수 있게 하면 선택은 되는데 추천 결과에는 반영되지 않으므로, 그런 도구는 숨기지 않고 고를 수 없음을 보여 준다.
 * 엔진의 규칙·운동 데이터는 바꾸지 않는다(추천 가능한 운동이 늘어나면 이 목록이 자동으로 따라간다).
 */
export function describeToolChoices(
  selectable: readonly ExerciseTool[],
  all: readonly ExerciseTool[] = TOOLS,
): readonly ToolChoice[] {
  return all.map((tool) => ({
    tool,
    state:
      tool === BODYWEIGHT_TOOL
        ? 'always'
        : selectable.includes(tool)
          ? 'selectable'
          : 'unavailable',
  }))
}

/** 도구를 고르거나 푼다. 고를 수 없는 도구는 받지 않고 같은 배열을 돌려준다. 맨몸은 기존 규칙대로 바뀌지 않는다. */
export function toggleSelectableTool(
  tools: readonly ExerciseTool[],
  tool: ExerciseTool,
  selectable: readonly ExerciseTool[],
): readonly ExerciseTool[] {
  if (tool !== BODYWEIGHT_TOOL && !selectable.includes(tool)) return tools
  return toggleTool(tools, tool)
}

/** 고를 수 없는 도구 카드에 보이는 이유. */
export const TOOL_UNAVAILABLE_TEXT =
  '초급 자동 추천에 쓸 수 있는 운동이 아직 없어요'

/**
 * 도구 카드의 접근성 연결용 ID(이름 요소·설명 요소). `aria-labelledby`·`aria-describedby`는 **공백으로 구분된 ID 목록**이라 ID에 공백이 있으면
 * 둘로 쪼개져 참조가 끊긴다(예: 도구명 "풀업 바"로 만든 ID). 그래서 도구명은 ID에 쓰지 않고, 컴포넌트마다 유일한 `useId` 값과 카드 순번으로만 만든다.
 * `baseId`는 React `useId()` 값이다(버전에 따라 ":", "«", "_" 같은 문자가 들어갈 수 있어 영문·숫자·밑줄·하이픈만 남긴다).
 */
export function toolControlIds(
  baseId: string,
  index: number,
): { name: string; note: string } {
  const safe = baseId.replace(/[^A-Za-z0-9_-]/g, '')
  return {
    name: `plan-tool-${safe}-${index}-name`,
    note: `plan-tool-${safe}-${index}-note`,
  }
}
