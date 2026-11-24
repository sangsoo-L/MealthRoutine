import type { LocalDate } from '../../exercise/workoutTypes.ts'
import { createLocalMealPlanSource } from './mealPlanApi.ts'
import type { MealType } from '../../food/mealModel.ts'

/**
 * AI 식단 플랜(I03~I03-3)이 서버와 주고받을 값의 모양. **확정된 API 계약이 아니다.**
 * 식단 추천 API(`POST /api/v1/ai/diet-recommendations` 등, README의 API 인수인계 #65~69)의 요청·응답 구조는 아직 정의되지 않았다.
 * 이 타입은 화면이 받을 수 있는 값을 정리한 것이며, 실제 필드명·필수 여부는 API 문서가 확정된 뒤 변환을 `MealPlanSource` 구현에 둔다.
 *
 * 서버가 주지 않은 값은 화면이 만들지 않는다: 모든 영양 값은 null(정보 없음, 0이 아니다)일 수 있고,
 * 목표량·합계·후보 수·추천은 서버가 계산한 값만 보여 준다(프론트엔드는 계산하지 않는다).
 */

/** 영양 값. null은 서버가 주지 않은 값이며 0과 다르다. */
export type NutrientAmount = number | null

export interface MealPlanNutrients {
  kcal: NutrientAmount
  carbG: NutrientAmount
  proteinG: NutrientAmount
  fatG: NutrientAmount
}

/** 추천 요청. AI 목표 열량은 끼니당 값이며 각 끼니별로 별도 호출한다. goalUpdatedAt은 화면이 본 저장된 목표 시점이다. */
export interface MealPlanRequest {
  targetDate: LocalDate
  meals: readonly MealType[]
  foodType: string | null
  foodKinds: readonly string[]
  excludedFoodIds: readonly string[]
  /** 기호상 피하고 싶은 넓은 음식 범주(메뉴명 기준, 알레르기 검증 아님). */
  excludedFoodGroups?: readonly string[]
  goalUpdatedAt: string
  /** 끼니당 목표 열량. 선택한 각 끼니의 별도 AI 요청에 동일하게 적용됩니다. */
  targetCaloriesKcal?: number
}

/** 끼니별 목표량과 후보 수를 물을 때 쓰는 입력(요청에서 음식 조건만 뺀 것). */
export interface MealPlanTargetsQuery {
  targetDate: LocalDate
  meals: readonly MealType[]
  goalUpdatedAt: string
  /** 끼니당 목표 열량. */
  targetCaloriesKcal?: number
}

/** I03-1: 끼니별 목표량(서버 계산 값). */
export interface MealPlanTargets {
  meals: readonly { meal: MealType; target: MealPlanNutrients }[]
}

/** I03-2: 조건에 맞는 계산 가능한 후보 수(서버 계산 값). */
export interface MealPlanCandidateCount {
  count: number | null
}

export interface MealPlanItem {
  foodId: string
  foodName: string
  quantity: number | null
  unit: string | null
  nutrients: MealPlanNutrients | null
  /** 알레르기·원재료 관련 안내 문구. 없으면 null이며 "알레르기 없음"을 뜻하지 않는다. */
  allergenNotes: string | null
  /** 추천 근거. 없으면 null. */
  reason: string | null
}

export interface MealPlanMealResult {
  meal: MealType
  target: MealPlanNutrients | null
  items: readonly MealPlanItem[]
  /** 서버가 계산한 끼니 합계. 화면이 항목을 더해 만들지 않는다. */
  totals: MealPlanNutrients | null
}

export interface MealPlanResult {
  requestId: string
  targetDate: LocalDate
  meals: readonly MealPlanMealResult[]
}

/**
 * 서버 연결 경계. 화면은 이 인터페이스만 안다. `createMealPlanSource`가 연결된 구현을 돌려줄 때까지 화면은 "연결 전"을 보인다.
 * 요청 메서드는 AbortSignal을 받아 취소·이탈 때 중단할 수 있어야 한다.
 */
export interface MealPlanSource {
  getTargets(
    query: MealPlanTargetsQuery,
    signal: AbortSignal,
  ): Promise<MealPlanTargets>
  countCandidates(
    request: MealPlanRequest,
    signal: AbortSignal,
  ): Promise<MealPlanCandidateCount>
  /** 추천을 요청한다. 계산할 수 있는 결과가 없으면 null이다(오류가 아니다). */
  requestPlan(
    request: MealPlanRequest,
    signal: AbortSignal,
  ): Promise<MealPlanResult | null>
}

/**
 * 로컬 개발에서는 FastAPI 직접 연결을 사용하고 운영 빌드에서는 Spring 중계 작업 전까지 null이다.
 * null이면 모든 단계 화면이 서버 값 대신 "연결 대기"를 보이고 추천 요청은 "연결 전" 상태가 된다. 가짜 결과를 만들지 않는다.
 */
export function createMealPlanSource(): MealPlanSource | null {
  return import.meta.env.DEV ? createLocalMealPlanSource() : null
}

/**
 * 추천 요청의 화면 상태.
 * - idle: 아직 요청하지 않았다. preparing: 요청 전 확인 중. analyzing: 서버가 분석 중.
 * - empty: 계산할 수 있는 결과가 없다. error: 요청에 실패했다. unavailable: 서버 연결 전이다.
 * - ready: 결과를 받았다.
 */
export type PlanRequestState =
  | { status: 'idle' }
  | { status: 'preparing' }
  | { status: 'analyzing' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; result: MealPlanResult }

export const IDLE_REQUEST: PlanRequestState = { status: 'idle' }

/** 서버에서 읽는 보조 정보(끼니별 목표량·후보 수)의 화면 상태. 연결 전이면 unavailable이다. */
export type ServerInfoState<T> =
  | { status: 'unavailable' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; value: T }

/**
 * 추천 요청 한 번을 실행해 결과 상태를 돌려준다. 서버 연결이 없으면 요청하지 않고 unavailable이다.
 * 취소(abort)되면 호출한 쪽이 결과를 버린다. 예외는 error로 바꾼다(결과 없음과 구분).
 */
export async function runPlanRequest(
  source: MealPlanSource | null,
  request: MealPlanRequest,
  signal: AbortSignal,
): Promise<PlanRequestState> {
  if (source === null) return { status: 'unavailable' }
  try {
    const result = await source.requestPlan(request, signal)
    if (result === null || result.meals.length === 0) {
      return { status: 'empty' }
    }
    return { status: 'ready', result }
  } catch {
    return { status: 'error' }
  }
}
