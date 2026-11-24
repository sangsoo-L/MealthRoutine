import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '../../auth/authContext.ts'
import type { LocalDate } from '../../exercise/workoutTypes.ts'
import type { MealType } from '../../food/mealModel.ts'
import {
  createMealPlanSource,
  runPlanRequest,
  type MealPlanRequest,
  type MealPlanSource,
} from './mealPlanContract.ts'
import { isRequestReady, suggestedSelectedCalories, type ExcludedFoodGroup, type FoodTypeChoice } from './mealPlanFlow.ts'
import {
  MealPlanFlowContext,
  type MealPlanFlowValue,
} from './mealPlanFlowContext.ts'
import { flowReducer, initialFlowState } from './mealPlanFlowState.ts'

/**
 * AI 식단 플랜(I03~I03-3)의 단계 입력과 추천 요청 상태를 가진 앱 수준 Provider.
 * 4개 화면이 별도 라우트이고 경로가 바뀌면 화면이 다시 마운트되므로(RouteTransition의 key), 입력은 화면 밖에 둔다(WorkoutDraftProvider와 같은 방식).
 *
 * - 메모리에만 둔다(저장소·주소에 쓰지 않는다). 새로고침하면 사라지고 화면이 앞 단계로 돌려보낸다.
 * - 비회원이면 아무것도 하지 않는다. 사용자가 바뀌면 지난 사용자의 상태를 렌더 중에 바로 버린다.
 * - 추천 요청은 서버 연결(`MealPlanSource`)이 있을 때만 보낸다. 연결이 없으면 요청하지 않고 "연결 전"으로 둔다(가짜 결과를 만들지 않는다).
 * - 진행 중 요청은 번호로 식별한다: 조건·목표·날짜·계정이 바뀌거나 취소하면 번호가 무효가 되어, 늦게 도착한 결과는 reducer가 버린다
 *   (진행하던 서버 요청도 효과에서 중단한다). 이 Provider는 앱 수준이라 화면을 떠나도 해제되지 않는다: I03-3의 "이전"·"조건 변경"·취소는
 *   진행 중 요청을 취소하지만, 하단 탭 등으로 흐름 밖으로 나가면 진행 중 요청은 계속되고 결과는 이 메모리에 남는다(이탈 시 취소 여부는 정책 확인 필요).
 *   체험 횟수는 다루지 않는다.
 */
export default function MealPlanFlowProvider({
  source: injectedSource,
  children,
}: {
  /** 서버 연결. 생략하면 `createMealPlanSource()`(지금은 연결 전). 시험에서만 값을 넣는다. */
  source?: MealPlanSource | null
  children: ReactNode
}) {
  const { status: authStatus, user } = useAuth()
  const userId = authStatus === 'authenticated' && user ? user.id : null
  // 서버 연결 객체는 한 번만 만든다(렌더마다 새 객체가 되면 아래 조회 훅이 매번 다시 요청한다).
  const [defaultSource] = useState(() => createMealPlanSource())
  const source = injectedSource !== undefined ? injectedSource : defaultSource

  const [state, dispatch] = useReducer(flowReducer, userId, initialFlowState)
  // null이면 하루 목표로 끼니당 기본 열량을 제안한다. 사용자 수정값은 유지한다.
  const [targetCalories, setTargetCaloriesValue] = useState<string | null>(null)
  const setTargetCalories = useCallback((value: string) => {
    setTargetCaloriesValue(value)
    dispatch({ type: 'setRequest', request: { status: 'idle' } })
  }, [])
  // 사용자가 바뀌면 지난 사용자의 상태를 렌더 중에 바로 버린다(React가 곧바로 다시 그려 지난 사용자의 값이 보이지 않는다).
  if (state.owner !== userId) dispatch({ type: 'reset', owner: userId })

  const active = useRef<{ id: number; controller: AbortController } | null>(
    null,
  )
  const counter = useRef(0)

  // 진행 중인 요청이 무효가 되면(번호가 지워지면) 서버 요청을 중단한다. 결과 폐기는 reducer가 번호로 이미 처리한다.
  useEffect(() => {
    if (state.activeRequestId === null && active.current) {
      active.current.controller.abort()
      active.current = null
    }
  }, [state.activeRequestId])
  // 앱이 내려갈 때(Provider 해제) 진행 중 요청을 중단한다.
  useEffect(
    () => () => {
      active.current?.controller.abort()
      active.current = null
    },
    [],
  )

  const startRequest = useCallback(
    (goalUpdatedAt: string, dailyGoalKcal: number) => {
      if (userId === null) return
      const { selection, request } = state
      // 진행 중이거나 이미 결과가 있으면(선택이 그대로) 새로 요청하지 않는다. 조건이 바뀌면 reducer가 요청 전으로 돌린다.
      if (
        request.status === 'analyzing' ||
        request.status === 'preparing' ||
        request.status === 'ready' ||
        active.current !== null
      ) {
        return
      }
      const kcal = targetCalories === null
        ? suggestedSelectedCalories(dailyGoalKcal, selection.meals.length)
        : Number(targetCalories)
      if (!isRequestReady(selection) || selection.targetDate === null ||
          !Number.isInteger(kcal) || kcal < 1 || kcal > 8000) return
      if (source === null) {
        dispatch({ type: 'setRequest', request: { status: 'unavailable' } })
        return
      }
      const controller = new AbortController()
      const id = ++counter.current
      active.current = { id, controller }
      dispatch({ type: 'beginRequest', id })
      const payload: MealPlanRequest = {
        targetDate: selection.targetDate,
        meals: selection.meals,
        foodType: selection.conditions.type,
        foodKinds: selection.conditions.kinds,
        excludedFoodIds: selection.conditions.excludedFoodIds,
        excludedFoodGroups: selection.conditions.excludedFoodGroups,
        goalUpdatedAt,
        targetCaloriesKcal: kcal,
      }
      void runPlanRequest(source, payload, controller.signal).then((next) => {
        // 성공/실패 모두 완료 시 ref를 비워야 '다시 요청하기'가 막히지 않는다.
        // 오래된 요청 완료가 새 요청을 지우지 않도록 번호를 확인한다.
        if (active.current?.id !== id) return
        active.current = null
        if (!controller.signal.aborted) {
          dispatch({ type: 'finishRequest', id, request: next })
        }
      })
    },
    [state, source, userId, targetCalories],
  )

  const cancelRequest = useCallback(() => {
    active.current?.controller.abort()
    active.current = null
    dispatch({ type: 'setRequest', request: { status: 'idle' } })
  }, [])

  // 조작 함수는 dispatch만 쓰므로 한 번만 만든다(상태가 바뀌어도 이 함수들을 쓰는 효과가 다시 실행되지 않는다).
  const actions = useMemo(
    () => ({
      toggleMeal: (meal: MealType, date: LocalDate) => {
        setTargetCaloriesValue(null) // 끼니가 달라지면 이전 끼니의 수동 입력은 초기화
        dispatch({ type: 'toggleMeal', meal, date })
      },
      toggleAllMeals: (date: LocalDate) => {
        setTargetCaloriesValue(null)
        dispatch({ type: 'toggleAllMeals', date })
      },
      setFoodType: (value: FoodTypeChoice) =>
        dispatch({ type: 'setFoodType', value }),
      toggleKind: (kind: string) => dispatch({ type: 'toggleKind', kind }),
      toggleExcluded: (foodId: string) =>
        dispatch({ type: 'toggleExcluded', foodId }),
      toggleExcludedGroup: (group: ExcludedFoodGroup) =>
        dispatch({ type: 'toggleExcludedGroup', group }),
      resetConditions: () => dispatch({ type: 'resetConditions' }),
      syncGoal: (stamp: string) => dispatch({ type: 'syncGoal', stamp }),
      syncDate: (date: LocalDate) => dispatch({ type: 'syncDate', date }),
      dismissNotice: () => dispatch({ type: 'dismissNotice' }),
    }),
    [],
  )

  const value = useMemo<MealPlanFlowValue>(
    () => ({
      selection: state.selection,
      request: state.request,
      notice: state.notice,
      noticeStep: state.noticeStep,
      source,
      targetCalories,
      setTargetCalories,
      ...actions,
      startRequest,
      cancelRequest,
    }),
    [state, source, targetCalories, setTargetCalories, actions, startRequest, cancelRequest],
  )

  return (
    <MealPlanFlowContext.Provider value={value}>
      {children}
    </MealPlanFlowContext.Provider>
  )
}
