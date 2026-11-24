import type { ListQueryResult } from '../exercise/workoutRepositories.ts'
import type { LocalDate } from '../exercise/workoutTypes.ts'
import type { Portion } from './foodNutrition.ts'
import type { MealFoodInput, MealRecord, MealType } from './mealModel.ts'

/**
 * 식단 기록 저장소(D01·D01-1~3·D02). 계정 id로 만들며 모든 조회·쓰기는 그 계정의 기록만 다룬다(다른 계정의 기록은 "없음"과 같다).
 * 오류는 운동 저장소와 같은 WorkoutStoreError(exercise/workoutRepositories.ts)를 던진다(같은 DB·같은 규칙).
 * 지금 구현은 개발 서버 전용 IndexedDB이며, 서버 연동(`/api/v1/meal-records`)이 정해지면 mealSource의 반환만 교체한다.
 */

export interface CreateMealInput {
  /**
   * 저장 요청 식별자(영문·숫자·`-`·`_`, 1~100자). 같은 요청을 다시 보내면(연타·재시도) 기록을 새로 만들지 않고 처음 저장한 기록을 돌려준다.
   * 같은 요청 id에 다른 내용이 오면 conflict(requestConflict)다. 화면이 등록 시도마다 안정적으로 만들어 보존한다.
   */
  requestId: string
  localDate: LocalDate
  mealType: MealType
  food: MealFoodInput
  portion: Portion
}

export interface SaveMealResult {
  record: MealRecord
  /** 이번 호출로 새로 만들었으면 true, 같은 요청으로 이미 저장된 기록이면 false. */
  created: boolean
}

export interface MealRecordRepository {
  readonly kind: 'local' | 'server'
  create(input: CreateMealInput): Promise<SaveMealResult>
  /** 없으면(다른 계정의 기록 포함) null. */
  get(recordId: string): Promise<MealRecord | null>
  /** 이 계정의 해당 날짜 기록(등록 순서). 손상 행은 빼고 개수만 알린다(ListQueryResult). 날짜가 올바르지 않으면 validation이다. */
  listByDate(localDate: LocalDate): Promise<ListQueryResult<MealRecord>>
  /**
   * 이 계정의 모든 날짜의 기록(날짜순·등록순은 호출한 쪽이 정리한다). D03·D03-1의 날짜별 조회와 D01의 "기록한 날 수"가 쓴다.
   * 손상 행은 빼고 개수만 알린다(ListQueryResult).
   */
  listAll(): Promise<ListQueryResult<MealRecord>>
  /**
   * 양을 고친다. 없으면(다른 계정의 기록 포함) notFound, revision이 다르면 conflict(revisionMismatch), 양 구분이 올바르지 않으면 validation이며
   * 아무것도 바뀌지 않는다. 영양 스냅샷과 출처는 저장 당시 값 그대로다.
   */
  update(
    recordId: string,
    input: { expectedRevision: number; portion: Portion },
  ): Promise<MealRecord>
  /**
   * 삭제한다. 같은 트랜잭션 안에서 소유자를 확인하므로 다른 계정의 기록은 지워지지 않고 notFound다(없는 기록도 notFound).
   * expectedRevision을 주면 다를 때 conflict다. 운동 데이터에는 영향이 없다.
   */
  delete(
    recordId: string,
    options?: { expectedRevision?: number },
  ): Promise<void>
}
