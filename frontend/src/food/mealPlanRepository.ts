import type { ListQueryResult } from '../exercise/workoutRepositories.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import type { Portion } from './foodNutrition.ts'
import type { MealFoodInput, MealType } from './mealModel.ts'
import type { MealPlan } from './mealPlanModel.ts'

/**
 * 내일 식단 계획 저장소(D02-1). 계정 id로 만들며 모든 조회·쓰기는 그 계정의 계획만 다룬다(다른 계정의 계획은 "없음"과 같다).
 * 실제 섭취 기록(MealRecordRepository)과 **별개의 저장소**이며 서로의 데이터를 읽거나 바꾸지 않는다.
 * 오류는 운동·식단 기록 저장소와 같은 WorkoutStoreError(exercise/workoutRepositories.ts)를 던진다(같은 DB·같은 규칙).
 * 지금 구현은 개발 서버 전용 IndexedDB이며, 서버 연동이 정해지면 mealPlanSource의 반환만 교체한다.
 */

export interface CreateMealPlanInput {
  /**
   * 저장 요청 식별자(영문·숫자·`-`·`_`, 1~100자). 같은 요청을 다시 보내면(연타·재시도) 계획을 새로 만들지 않고 처음 저장한 계획을 돌려준다.
   * 같은 요청 id에 다른 내용이 오면 conflict(requestConflict)다.
   */
  requestId: string
  /** 계획 날짜. 저장소의 시계 기준 오늘보다 뒤여야 한다(아니면 validation, invalidPlanDate). */
  planDate: LocalDate
  mealType: MealType
  food: MealFoodInput
  portion: Portion
}

export interface SaveMealPlanResult {
  plan: MealPlan
  /** 이번 호출로 새로 만들었으면 true, 같은 요청으로 이미 저장된 계획이면 false. */
  created: boolean
}

export interface MealPlanRepository {
  readonly kind: 'local'
  create(input: CreateMealPlanInput): Promise<SaveMealPlanResult>
  /** 없으면(다른 계정의 계획 포함) null. */
  get(planId: string): Promise<MealPlan | null>
  /** 이 계정의 해당 계획 날짜의 계획(등록 순서). 손상 행은 빼고 개수만 알린다(ListQueryResult). 날짜가 올바르지 않으면 validation이다. */
  listByDate(planDate: LocalDate): Promise<ListQueryResult<MealPlan>>
  /**
   * 양을 고친다. 없으면(다른 계정의 계획 포함) notFound, revision이 다르면 conflict(revisionMismatch), 양 구분이 올바르지 않으면 validation,
   * 계획 날짜가 이미 오늘이거나 지났으면 validation(invalidPlanDate)이며 아무것도 바뀌지 않는다. 영양 스냅샷과 출처는 저장 당시 값 그대로다.
   */
  update(
    planId: string,
    input: { expectedRevision: number; portion: Portion },
  ): Promise<MealPlan>
  /**
   * 삭제한다. 같은 트랜잭션 안에서 소유자를 확인하므로 다른 계정의 계획은 지워지지 않고 notFound다(없는 계획도 notFound).
   * expectedRevision을 주면 다를 때 conflict다. 실제 섭취 기록과 운동 데이터에는 영향이 없다.
   */
  delete(planId: string, options?: { expectedRevision?: number }): Promise<void>
}
