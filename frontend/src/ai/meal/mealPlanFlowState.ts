import type { LocalDate } from '../../exercise/workoutTypes.ts'
import type { MealType } from '../../food/mealModel.ts'
import {
  EMPTY_SELECTION,
  INITIAL_CONDITIONS,
  hasAnyCondition,
  setFoodType,
  toggleAllMeals,
  toggleExcluded,
  toggleExcludedGroup,
  toggleKind,
  toggleMeal,
  type ExcludedFoodGroup,
  type FoodTypeChoice,
  type MealPlanSelection,
  type PlanStep,
} from './mealPlanFlow.ts'
import { IDLE_REQUEST, type PlanRequestState } from './mealPlanContract.ts'

/**
 * AI 식단 플랜 흐름의 공유 상태(앱 수준 Provider가 가진다)와 그 변경 규칙(순수 함수).
 * 메모리에만 둔다: 새로고침하면 사라지고, 화면은 앞 입력이 없으면 앞 단계로 돌려보낸다. 주소·저장소에는 아무것도 쓰지 않는다.
 *
 * 무효화 규칙(입력과 추천 요청 맥락이 어긋나지 않게 한다):
 * - 계정이 바뀌면(owner) 처음 상태로 돌아간다.
 * - 식단 목표가 바뀌면(goalStamp) 선택과 요청을 비우고 안내한다.
 * - 날짜가 바뀌면(자정) 선택과 요청을 비우고 안내한다.
 * - 끼니·음식 조건이 실제로 바뀌면 요청 상태를 idle로 돌린다(이전 요청의 결과를 새 조건의 결과처럼 보이지 않는다). 바뀐 것이 없으면 그대로 둔다.
 * - 진행 중 요청은 번호(activeRequestId)로 식별한다. 위 어떤 이유로든 요청이 무효가 되면 번호가 지워져 늦게 도착한 결과(finishRequest)를 버린다
 *   (렌더 뒤에 실행되는 abort 효과의 타이밍에 기대지 않는다).
 */
export interface FlowState {
  /** 이 상태가 속한 사용자 id. 비회원이면 null. */
  owner: string | null
  /** 흐름이 시작될 때 본 식단 목표의 시점(updatedAt). 아직 보지 않았으면 null. */
  goalStamp: string | null
  selection: MealPlanSelection
  targetCalories: string | null
  request: PlanRequestState
  /** 지금 진행 중인(결과를 받아도 되는) 요청 번호. 진행 중인 요청이 없으면 null. */
  activeRequestId: number | null
  /** 화면이 알려야 하는 짧은 안내(충돌·초기화). 다음 조작 때 지운다. */
  notice: string | null
  /** 안내를 보일 단계. null이면 어느 단계에서나 보인다(목표·날짜 변경처럼 흐름 전체에 해당하는 안내). */
  noticeStep: PlanStep | null
}

export function initialFlowState(owner: string | null): FlowState {
  return {
    owner,
    goalStamp: null,
    selection: EMPTY_SELECTION,
    targetCalories: null,
    request: IDLE_REQUEST,
    activeRequestId: null,
    notice: null,
    noticeStep: null,
  }
}

export type FlowAction =
  | { type: 'toggleMeal'; meal: MealType; date: LocalDate }
  | { type: 'toggleAllMeals'; date: LocalDate }
  | { type: 'setFoodType'; value: FoodTypeChoice }
  | { type: 'toggleKind'; kind: string }
  | { type: 'toggleExcluded'; foodId: string }
  | { type: 'toggleExcludedGroup'; group: ExcludedFoodGroup }
  | { type: 'resetConditions' }
  | { type: 'setTargetCalories'; value: string }
  | { type: 'syncGoal'; stamp: string }
  | { type: 'syncDate'; date: LocalDate }
  /** 서버 요청을 시작한다(번호는 Provider가 매긴다). */
  | { type: 'beginRequest'; id: number }
  /** 서버 요청의 결과. 번호가 지금 진행 중인 요청과 다르면 버린다. */
  | { type: 'finishRequest'; id: number; request: PlanRequestState }
  /** 서버 없이 정해지는 상태(연결 전)나 취소(요청 전). 진행 중이던 요청은 무효가 된다. */
  | { type: 'setRequest'; request: PlanRequestState }
  | { type: 'dismissNotice' }
  | { type: 'reset'; owner: string | null }

export const GOAL_CHANGED_NOTICE =
  '식단 목표가 바뀌어서 끼니와 음식 조건을 처음부터 다시 골라 주세요.'
export const DATE_CHANGED_NOTICE =
  '날짜가 바뀌어서 끼니와 음식 조건을 처음부터 다시 골라 주세요.'

/** 선택이 실제로 바뀐 경우에만 새 상태를 만든다(같은 선택이면 진행 중 요청과 안내를 건드리지 않는다). */
function withSelection(
  state: FlowState,
  selection: MealPlanSelection,
  notice: string | null = null,
  noticeStep: PlanStep | null = null,
): FlowState {
  if (
    selection === state.selection ||
    sameSelection(state.selection, selection)
  ) {
    return state
  }
  return {
    ...state,
    selection,
    targetCalories:
      sameList(state.selection.meals, selection.meals) &&
      state.selection.targetDate === selection.targetDate
        ? state.targetCalories
        : null,
    request: IDLE_REQUEST,
    activeRequestId: null,
    notice,
    noticeStep: notice === null ? null : noticeStep,
  }
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index])
}

function sameSelection(a: MealPlanSelection, b: MealPlanSelection): boolean {
  return (
    a.targetDate === b.targetDate &&
    sameList(a.meals, b.meals) &&
    a.conditions.type === b.conditions.type &&
    sameList(a.conditions.kinds, b.conditions.kinds) &&
    sameList(a.conditions.excludedFoodIds, b.conditions.excludedFoodIds) &&
    sameList(
      a.conditions.excludedFoodGroups ?? [],
      b.conditions.excludedFoodGroups ?? [],
    )
  )
}

function clearedFlow(
  state: FlowState,
  notice: string,
  goalStamp: string | null,
): FlowState {
  return {
    ...state,
    goalStamp,
    selection: EMPTY_SELECTION,
    targetCalories: null,
    request: IDLE_REQUEST,
    activeRequestId: null,
    notice,
    noticeStep: null,
  }
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'toggleMeal':
      return withSelection(
        state,
        toggleMeal(state.selection, action.meal, action.date),
      )
    case 'toggleAllMeals':
      return withSelection(state, toggleAllMeals(state.selection, action.date))
    case 'setFoodType': {
      const change = setFoodType(state.selection.conditions, action.value)
      const notice =
        change.droppedKinds.length > 0
          ? `식품 구분을 바꿔서 맞지 않는 음식 종류(${change.droppedKinds.join(', ')})는 해제했어요.`
          : null
      return withSelection(
        state,
        { ...state.selection, conditions: change.conditions },
        notice,
        'foods',
      )
    }
    case 'toggleKind':
      return withSelection(state, {
        ...state.selection,
        conditions: toggleKind(state.selection.conditions, action.kind),
      })
    case 'toggleExcluded':
      return withSelection(state, {
        ...state.selection,
        conditions: toggleExcluded(state.selection.conditions, action.foodId),
      })
    case 'toggleExcludedGroup':
      return withSelection(state, {
        ...state.selection,
        conditions: toggleExcludedGroup(
          state.selection.conditions,
          action.group,
        ),
      })
    case 'setTargetCalories':
      return state.targetCalories === action.value
        ? state
        : {
            ...state,
            targetCalories: action.value,
            request: IDLE_REQUEST,
            activeRequestId: null,
          }
    case 'resetConditions':
      return hasAnyCondition(state.selection.conditions)
        ? withSelection(state, {
            ...state.selection,
            conditions: INITIAL_CONDITIONS,
          })
        : state
    case 'syncGoal': {
      if (state.goalStamp === null) {
        return { ...state, goalStamp: action.stamp }
      }
      if (state.goalStamp === action.stamp) return state
      return clearedFlow(state, GOAL_CHANGED_NOTICE, action.stamp)
    }
    case 'syncDate': {
      const { targetDate } = state.selection
      if (targetDate === null || targetDate === action.date) return state
      return clearedFlow(state, DATE_CHANGED_NOTICE, state.goalStamp)
    }
    case 'beginRequest':
      return {
        ...state,
        request: { status: 'analyzing' },
        activeRequestId: action.id,
      }
    case 'finishRequest':
      // 지금 진행 중인 요청이 아니면(조건·목표·날짜·계정이 바뀌었거나 취소됨) 늦게 도착한 결과를 버린다.
      return state.activeRequestId === action.id
        ? { ...state, request: action.request, activeRequestId: null }
        : state
    case 'setRequest':
      return { ...state, request: action.request, activeRequestId: null }
    case 'dismissNotice':
      return state.notice === null
        ? state
        : { ...state, notice: null, noticeStep: null }
    case 'reset':
      return initialFlowState(action.owner)
  }
}
