import type { RecordType, WorkoutDraft } from './workoutDraftTypes.ts'
import type { WorkoutRoutine } from './workoutRoutineModel.ts'
import type {
  LocalDate,
  SessionProgressInput,
  WorkoutList,
  WorkoutRecord,
  WorkoutSession,
} from './workoutTypes.ts'

/**
 * 운동 목록·수행 세션·완료 기록의 데이터 경계. 화면(W11·W14·W15·W10·W01)은 이 인터페이스만 안다.
 * 지금 구현은 개발 서버와 운영 빌드가 함께 쓰는 IndexedDB(exercise/local/)이며, 서버 구현이 필요해지면 exercise/workoutSource.ts의 반환만 교체한다.
 *
 * 공통 규칙
 * - 저장소는 계정 id(ownerId)로 만든다. 모든 조회·쓰기는 그 계정의 데이터만 다룬다. 다른 계정의 데이터는 "없음"과 같다.
 * - id로 하나를 읽는 get은 없으면(다른 계정 것 포함) null이다. 그 밖의 실패는 WorkoutStoreError를 던진다(빈 값으로 바꾸지 않는다).
 * - 동작 대상이 없으면(완료·중단·저장 대상 세션 등) notFound 오류다.
 */

/**
 * 저장 계층 오류의 이유.
 * - unavailable: 이 환경에서 IndexedDB를 쓸 수 없다(미지원·차단·시크릿 모드 제한 등).
 * - blocked: 다른 탭이 이전 버전 연결을 닫지 않아 DB를 열 수 없다.
 * - versionChange: 다른 탭이 DB 버전을 바꿔 이 연결이 닫혔다. 페이지를 다시 열어야 한다.
 * - quota: 저장 공간이 부족해 쓰지 못했다.
 * - error: 그 밖의 읽기·쓰기 실패(트랜잭션 중단·손상된 저장값 포함).
 * - conflict: 동시 수정·상태 충돌(revision 불일치, 같은 요청 id에 다른 내용, 끝난 세션 수정 등).
 * - validation: 입력이 올바르지 않다.
 * - notFound: 동작 대상이 없다(다른 계정의 대상 포함).
 */
export type WorkoutStoreErrorReason =
  | 'unavailable'
  | 'blocked'
  | 'versionChange'
  | 'quota'
  | 'error'
  | 'conflict'
  | 'validation'
  | 'notFound'

/** 충돌·검증 오류의 세부 구분. 화면이 안내 문구를 고를 때 쓴다. */
export type WorkoutStoreErrorCode =
  | 'revisionMismatch'
  | 'requestConflict'
  | 'sessionNotInProgress'
  | 'sessionEnded'
  | 'uniqueConstraint'
  | 'invalidDraft'
  | 'invalidRequestId'
  | 'invalidProgress'
  | 'noCompletedSets'
  /** 목록에 W14·W15가 아직 진행할 수 없는 기록 방식(복합 방식)이 있어 세션을 만들지 않았다. */
  | 'unsupportedRecordType'
  | 'invalidOwner'
  /** 루틴 이름·소개가 올바르지 않다(이름 없음·너무 김). */
  | 'invalidRoutineMeta'
  /** 식단 기록의 날짜·끼니·양·음식 정보가 올바르지 않다. */
  | 'invalidMeal'
  /** 계획(식단·운동)의 날짜가 내일 이후가 아니다(이미 오늘이 되었거나 지난 계획 날짜는 만들거나 고칠 수 없다). */
  | 'invalidPlanDate'
  /** 같은 계획 날짜에 이미 계획이 있다(계정당 날짜별 1개). 교체는 확인을 받은 뒤 replace로 한다. */
  | 'planExists'
  | 'corruptRecord'
  | 'activeSessionCorrupt'

export class WorkoutStoreError extends Error {
  readonly reason: WorkoutStoreErrorReason
  readonly code?: WorkoutStoreErrorCode
  /** revisionMismatch일 때 저장소에 있는 현재 revision. 화면이 다시 읽을지 정할 때 쓴다. */
  readonly currentRevision?: number

  constructor(
    reason: WorkoutStoreErrorReason,
    options?: {
      code?: WorkoutStoreErrorCode
      currentRevision?: number
      cause?: unknown
    },
  ) {
    super(
      `workout store ${reason}${options?.code ? ` (${options.code})` : ''}`,
      { cause: options?.cause },
    )
    this.name = 'WorkoutStoreError'
    this.reason = reason
    this.code = options?.code
    this.currentRevision = options?.currentRevision
  }
}

export function isWorkoutStoreError(
  value: unknown,
): value is WorkoutStoreError {
  return value instanceof WorkoutStoreError
}

/**
 * 목록 조회 결과. 저장값이 손상되어 읽을 수 없는 행은 items에서 빼고 개수만 skippedCount로 알린다(자동으로 지우거나 고치지 않는다).
 * - 정상 0건: items 비어 있음, skippedCount 0.
 * - 전부 손상: items 비어 있음, skippedCount > 0 (정상적인 빈 목록과 구분한다).
 * - skippedCount는 limit과 무관하게 이 조회 범위(이 계정의 해당 목록·날짜·기간) 전체의 손상 행 수다.
 * 손상으로 건너뛰는 것은 저장값 검증에 실패한 행뿐이다. 저장소 연결·트랜잭션 오류 등은 건너뛰지 않고 WorkoutStoreError로 던진다.
 * id로 하나를 읽는 get은 기존처럼 손상이면 error/corruptRecord를 던진다.
 */
export interface ListQueryResult<T> {
  items: readonly T[]
  skippedCount: number
}

// ─── 운동 목록 ──────────────────────────────────────────────

export interface SaveListFromDraftInput {
  /**
   * 저장 요청 식별자(영문·숫자·`-`·`_`, 1~100자). 같은 요청을 다시 보내면(연타·재시도·저장 후 새로고침 재전송) 목록을 새로 만들지 않고
   * 처음 저장한 목록을 돌려준다. 호출하는 화면(W11)이 한 번의 "저장 시도"마다 안정적으로 만들어 보존해야 한다.
   * 같은 요청 id에 다른 내용이 오면 conflict(requestConflict)다.
   */
  requestId: string
  /** W02 초안. 저장소가 기존 normalizeDraft로 검증·정규화한다(올바르지 않으면 validation). */
  draft: WorkoutDraft
  /** 운동 저장소에서 읽은 운동 id 모음. 여기에 없는 운동이 있으면 validation이다. */
  knownExerciseIds: ReadonlySet<string>
  /**
   * 운동 id별 허용 기록 방식(카탈로그 메타데이터에서 만든 표). 주면 저장소가 저장 직전에 한 번 더 확인하고, 허용하지 않는 방식이 있으면
   * validation(invalidDraft)이다. 주지 않으면 확인하지 않는다(기존 호출). 이미 저장된 목록에는 소급 적용하지 않는다.
   */
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
}

export interface SaveListResult {
  list: WorkoutList
  /** 이번 호출로 새로 만들었으면 true, 같은 요청으로 이미 저장된 목록이면 false. */
  created: boolean
}

export interface WorkoutListRepository {
  readonly kind: 'local'
  /** 오늘(로컬 날짜) 운동 목록으로 저장한다. 세션은 만들지 않는다. */
  saveFromDraft(input: SaveListFromDraftInput): Promise<SaveListResult>
  get(listId: string): Promise<WorkoutList | null>
  /** 최근에 저장·수정한 순서로 최대 limit개(1~100, 기본 20). 손상 행은 개수에 넣지 않고 건너뛴다(ListQueryResult). */
  listRecent(limit?: number): Promise<ListQueryResult<WorkoutList>>
  /** 계획 날짜가 같은 목록(저장 순서). */
  listByDate(plannedDate: LocalDate): Promise<ListQueryResult<WorkoutList>>
  /**
   * 계획 날짜가 date보다 **이전**인 이 계정의 모든 목록(W16 이전 운동 리스트). 개수를 임의로 제한하지 않는다.
   * 계획 날짜 내림차순이고, 같은 날짜는 나중에 저장한 목록이 먼저다(저장 시각이 같으면 id가 큰 쪽). date 당일·이후 목록은 포함하지 않는다.
   * 읽기 전용이다(저장·교체·삭제를 하지 않는다). 손상 행은 건너뛰고 개수만 알린다(ListQueryResult). date가 올바른 로컬 날짜가 아니면 validation이다.
   */
  listBefore(date: LocalDate): Promise<ListQueryResult<WorkoutList>>
}

// ─── 수행 세션 ──────────────────────────────────────────────

/**
 * 세션 시작 결과.
 * - started: 새 세션을 만들었다.
 * - resumed: 같은 목록의 진행 중 세션이 있어 그것을 돌려준다.
 * - activeSessionConflict: 다른 목록의 진행 중 세션이 있다(계정당 진행 중 세션은 하나). 아무것도 만들지 않았다.
 *   화면은 "기존 운동 이어하기"(그 세션으로 이동) 또는 "기존 운동 그만두고 새로 시작"(abandon 후 다시 시작)을 고르게 한다.
 */
export type StartSessionResult =
  | { kind: 'started'; session: WorkoutSession }
  | { kind: 'resumed'; session: WorkoutSession }
  | {
      kind: 'activeSessionConflict'
      activeSessionId: string
      activeListId: string
    }

export interface CompleteSessionResult {
  session: WorkoutSession
  record: WorkoutRecord
  /** 이번 호출로 기록을 만들었으면 true, 이미 완료된 세션이라 기존 기록을 돌려주면 false. */
  created: boolean
}

export interface WorkoutSessionRepository {
  readonly kind: 'local'
  /**
   * 저장된 목록으로 세션을 시작하거나 같은 목록의 진행 중 세션을 이어 간다. 목록이 없으면 notFound.
   * 목록에 복합 기록 방식(time_reps·weight_time)이 있으면 validation(unsupportedRecordType)이며 세션을 만들지 않는다(S4·S5가 끝날 때까지).
   * 화면(W01)의 시작 버튼 차단과 별개로 이 경로에서도 막는다.
   * 이 계정의 진행 중 세션이 손상되어 있으면 어느 목록이든 새 세션을 만들지 않고 error/activeSessionCorrupt를 던진다.
   * 정상적인 다른 목록의 진행 중 세션은 activeSessionConflict 결과다(오류가 아니다).
   */
  startOrResume(listId: string): Promise<StartSessionResult>
  get(sessionId: string): Promise<WorkoutSession | null>
  /**
   * 이 계정의 진행 중 세션(없으면 null). 진행 중 세션이 손상되어 있으면 error/activeSessionCorrupt를 던진다
   * (건너뛰거나 지우지 않는다. 일반 손상 corruptRecord와 구분한다).
   */
  getActive(): Promise<WorkoutSession | null>
  /**
   * 진행 상태를 저장하고 저장된 세션(revision + 1)을 돌려준다. 성공해야만 확정 상태다.
   * revision이 다르면 conflict(revisionMismatch, currentRevision 포함), 끝난 세션이면 conflict(sessionNotInProgress),
   * 값이 올바르지 않으면 validation(invalidProgress)이며 아무것도 바뀌지 않는다.
   */
  saveProgress(
    sessionId: string,
    input: SessionProgressInput,
  ): Promise<WorkoutSession>
  /**
   * 세션을 완료하고 완료 기록을 만든다(하나의 트랜잭션). 이미 완료된 세션이면 기존 기록을 돌려준다(멱등).
   * expectedRevision을 주면 다를 때 conflict다(이미 완료된 세션에는 적용하지 않는다).
   * 완료한 세트가 없으면 validation(noCompletedSets), 중단·취소된 세션이면 conflict(sessionEnded).
   */
  complete(
    sessionId: string,
    options?: { expectedRevision?: number },
  ): Promise<CompleteSessionResult>
  /**
   * 기록을 저장하지 않고 그만둔다. 완료한 세트가 있으면 interrupted, 없으면 cancelled다.
   * 이미 중단·취소된 세션이면 그대로 돌려주고(멱등), 완료된 세션이면 conflict(sessionEnded)다.
   */
  abandon(
    sessionId: string,
    options?: { expectedRevision?: number },
  ): Promise<WorkoutSession>
}

// ─── 완료 기록 ──────────────────────────────────────────────

export interface WorkoutRecordRepository {
  readonly kind: 'local'
  get(recordId: string): Promise<WorkoutRecord | null>
  /** 실제 수행 날짜가 from~to(포함)인 기록. 완료 시각 순서. */
  listByDateRange(
    from: LocalDate,
    to: LocalDate,
  ): Promise<ListQueryResult<WorkoutRecord>>
  getBySession(sessionId: string): Promise<WorkoutRecord | null>
}

// ─── 운동 루틴 ──────────────────────────────────────────────

/** 루틴 내용 입력. 운동 구성은 W02와 같은 초안 모양을 받아 저장소가 기존 normalizeDraft로 검증·정규화한다. */
export interface RoutineContentInput {
  name: string
  description: string
  draft: WorkoutDraft
  /** 운동 저장소에서 읽은 운동 id 모음. 주면 여기에 없는 운동이 있을 때 validation이다. */
  knownExerciseIds?: ReadonlySet<string>
  /** 운동 id별 허용 기록 방식. 주면 허용하지 않는 방식이 있을 때 validation(invalidDraft)이다. */
  allowedRecordTypes?: ReadonlyMap<string, readonly RecordType[]>
}

export interface CreateRoutineInput extends RoutineContentInput {
  /**
   * 저장 요청 식별자(영문·숫자·`-`·`_`, 1~100자). 같은 요청을 다시 보내면(연타·재시도) 루틴을 새로 만들지 않고 처음 저장한 루틴을 돌려준다.
   * 같은 요청 id에 다른 내용이 오면 conflict(requestConflict)다. 화면(W08)이 저장 시도마다 안정적으로 만들어 보존한다.
   */
  requestId: string
}

export interface UpdateRoutineInput extends RoutineContentInput {
  /** 화면이 마지막으로 읽은 루틴의 revision. 다르면 다른 곳에서 먼저 수정한 것이라 conflict(revisionMismatch)다. */
  expectedRevision: number
  /**
   * 초안 항목 id → 그 항목이 수정 전 루틴(expectedRevision 때)의 몇 번째 항목에서 왔는지(0부터). 새로 넣은 항목은 없다.
   * 서버 저장소가 앱 모델에 없는 값(휴식 시간)을 남긴 줄에 그대로 붙이는 데 쓴다. 같은 운동이 두 줄이어도 줄을 구분한다.
   * 로컬 저장소는 쓰지 않는다.
   */
  sourceItemIndexes?: ReadonlyMap<string, number>
}

export interface SaveRoutineResult {
  routine: WorkoutRoutine
  /** 이번 호출로 새로 만들었으면 true, 같은 요청으로 이미 저장된 루틴이면 false. */
  created: boolean
}

/**
 * 운동 루틴 저장소(W06~W08). 계정 id로 만들며 모든 조회·쓰기는 그 계정의 루틴만 다룬다(다른 계정의 루틴은 "없음"과 같다).
 * 개발 서버는 IndexedDB(kind 'local'), 운영 빌드는 루틴 API(`/api/v1/workout-routines`, kind 'api') 구현을 쓴다(workoutSource.ts).
 */
export interface WorkoutRoutineRepository {
  readonly kind: 'local' | 'api'
  create(input: CreateRoutineInput): Promise<SaveRoutineResult>
  /** 없으면(다른 계정의 루틴 포함) null. */
  get(routineId: string): Promise<WorkoutRoutine | null>
  /** 이 계정의 모든 루틴. 최근에 저장·수정한 순서. 손상 행은 빼고 개수만 알린다(ListQueryResult). */
  list(): Promise<ListQueryResult<WorkoutRoutine>>
  /** 수정한다. 없으면(다른 계정의 루틴 포함) notFound, revision이 다르면 conflict, 입력이 올바르지 않으면 validation이며 아무것도 바뀌지 않는다. */
  update(routineId: string, input: UpdateRoutineInput): Promise<WorkoutRoutine>
  /**
   * 삭제한다. 같은 트랜잭션 안에서 소유자를 확인하므로 다른 계정의 루틴은 지워지지 않고 notFound다(없는 루틴도 notFound).
   * expectedRevision을 주면 다를 때 conflict다. 운동 목록·세션·완료 기록에는 영향이 없다.
   */
  delete(
    routineId: string,
    options?: { expectedRevision?: number },
  ): Promise<void>
}
