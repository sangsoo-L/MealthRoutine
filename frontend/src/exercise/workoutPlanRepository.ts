import type { RecordType, WorkoutDraft } from './workoutDraftTypes.ts'
import type { ListQueryResult } from './workoutRepositories.ts'
import type { WorkoutPlan } from './workoutPlanModel.ts'
import type { LocalDate } from './workoutTypes.ts'

/**
 * 내일 운동 계획 저장소(W11 저장, W10 조회·수정·삭제, W01 요약). 계정 id로 만들며 모든 조회·쓰기는 그 계정의 계획만 다룬다
 * (다른 계정의 계획은 "없음"과 같다). 운동 목록(WorkoutListRepository)·세션·기록·루틴 저장소와 **별개**이며 서로의 데이터를 읽거나 바꾸지 않는다.
 * 오류는 다른 운동 저장소와 같은 WorkoutStoreError(workoutRepositories.ts)를 던진다(같은 DB·같은 규칙).
 * 지금 구현은 개발 서버 전용 IndexedDB이며, 서버 연동이 정해지면 workoutPlanSource의 반환만 교체한다.
 *
 * 계정당 계획 날짜별 계획은 1개다. 같은 날짜에 새 계획을 만들면 conflict(planExists)이고, 교체는 사용자의 확인을 받은 뒤 replace로 한다.
 */

interface PlanDraftInput {
  /** W11이 만든 내일 초안(day가 tomorrow). 저장소가 기존 normalizeDraft로 검증·정규화한다(올바르지 않으면 validation). */
  draft: WorkoutDraft
  /** 운동 저장소에서 읽은 운동 id 모음. 여기에 없는 운동이 있으면 validation이다. */
  knownExerciseIds: ReadonlySet<string>
  /** 운동 id별 허용 기록 방식. 주면 저장 직전에 한 번 더 확인한다. */
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
}

export interface CreateWorkoutPlanInput extends PlanDraftInput {
  /**
   * 저장 요청 식별자(영문·숫자·`-`·`_`, 1~100자). 같은 요청을 다시 보내면(연타·재시도) 계획을 새로 만들지 않고 처음 저장한 계획을 돌려준다.
   * 같은 요청 id에 다른 구성이 오면 conflict(requestConflict)다.
   */
  requestId: string
  /** 계획 날짜. 저장소의 시계 기준 오늘보다 뒤여야 한다(아니면 validation, invalidPlanDate). */
  planDate: LocalDate
}

export interface SaveWorkoutPlanResult {
  plan: WorkoutPlan
  /** 이번 호출로 새로 만들었으면 true, 같은 요청으로 이미 저장된 계획이면 false. */
  created: boolean
}

export interface ReplaceWorkoutPlanInput extends PlanDraftInput {
  expectedRevision: number
}

export interface WorkoutPlanRepository {
  readonly kind: 'local'
  /** 새 계획을 만든다. 그 날짜에 이미 계획이 있으면 conflict(planExists)이고 아무것도 바뀌지 않는다. */
  create(input: CreateWorkoutPlanInput): Promise<SaveWorkoutPlanResult>
  /** 없으면(다른 계정의 계획 포함) null. */
  get(planId: string): Promise<WorkoutPlan | null>
  /**
   * 계획 날짜가 date **이상**인 이 계정의 계획(날짜 오름차순). 오늘이 된 계획과 앞으로의 계획을 보여 줄 때 쓴다.
   * 지난 날짜의 계획은 포함하지 않지만 지우지도 않는다. 손상 행은 건너뛰고 개수만 알린다(ListQueryResult). date가 올바르지 않으면 validation이다.
   */
  listFrom(date: LocalDate): Promise<ListQueryResult<WorkoutPlan>>
  /** 계획 날짜가 같은 계획(0개 또는 1개). 손상 행은 건너뛰고 개수만 알린다. */
  listByDate(planDate: LocalDate): Promise<ListQueryResult<WorkoutPlan>>
  /**
   * 운동 구성을 바꾼다(수정·교체). 없으면(다른 계정 포함) notFound, revision이 다르면 conflict(revisionMismatch), 초안이 올바르지 않으면 validation,
   * 계획 날짜가 이미 오늘이거나 지났으면 validation(invalidPlanDate)이며 아무것도 바뀌지 않는다.
   */
  replace(planId: string, input: ReplaceWorkoutPlanInput): Promise<WorkoutPlan>
  /**
   * 삭제한다. 같은 트랜잭션 안에서 소유자를 확인하므로 다른 계정의 계획은 지워지지 않고 notFound다(없는 계획도 notFound).
   * expectedRevision을 주면 다를 때 conflict다. 오늘이 된 계획도 지울 수 있다. 운동 목록·기록·루틴에는 영향이 없다.
   */
  delete(planId: string, options?: { expectedRevision?: number }): Promise<void>
}
