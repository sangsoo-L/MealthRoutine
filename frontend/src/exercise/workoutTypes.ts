import type { NormalizedSet, RecordType } from './workoutDraftTypes.ts'

/**
 * 운동 목록·수행 세션·완료 기록의 저장 모델(로컬 MVP). 개발 서버의 IndexedDB(exercise/local/)에 저장하는 값의 모양이다.
 *
 * - 백엔드 DTO가 아니며 API 계약이 아니다(api_exercise_v1.0.md는 미확정 초안). 서버 연동 시 서버 어댑터가 이 모양으로 바꿔 넘긴다.
 * - 운동은 운동 id(Exercise.id, 불투명 문자열)로만 가리키고, 운동 이름은 저장 당시의 스냅샷이다(정본은 운동 저장소).
 * - 세트 목표는 W02 초안을 기존 normalizeDraft로 정규화한 값(NormalizedSet)을 그대로 쓴다. 새 목표 모양을 만들지 않는다.
 * - 날짜는 기기 로컬 날짜의 YYYY-MM-DD, 시각은 ISO 8601(UTC)이다. 서버의 날짜·시간대 기준은 미확정(G9)이다.
 */

/** 저장 레코드의 스키마 버전. 모양을 바꾸면 올리고 exercise/local/exerciseDb.ts의 업그레이드에서 옮긴다. */
export const WORKOUT_SCHEMA_VERSION = 1

/** 개발용 Mock 운동 데이터(15종)의 카탈로그 식별자. 운영 카탈로그가 아니다. */
export const DEV_CATALOG_VERSION = 'dev-mock-1'

/** 로컬 날짜(YYYY-MM-DD). */
export type LocalDate = string

// ─── 운동 목록 ──────────────────────────────────────────────

/** 저장된 운동 목록의 운동 한 줄. 배열 순서가 운동 순서다. */
export interface WorkoutListItem {
  exerciseId: string
  /** 저장 당시의 운동 이름(표시용 스냅샷). 운동 정보가 바뀌거나 사라져도 그대로 남는다. */
  exerciseNameSnapshot: string
  recordType: RecordType
  /** 세트별 목표(W02 normalizeDraft 결과). */
  sets: readonly NormalizedSet[]
}

/**
 * W11에서 저장하는 최종 운동 목록. 수행 기록이 아니며(계획), 저장해도 세션을 만들지 않는다.
 * plannedDate는 "오늘" 운동 목록의 로컬 날짜다(W02의 오늘만 구성 정책. 내일 계획은 만들지 않는다).
 */
export interface WorkoutList {
  id: string
  ownerId: string
  schemaVersion: typeof WORKOUT_SCHEMA_VERSION
  plannedDate: LocalDate
  items: readonly WorkoutListItem[]
  catalogVersion: string
  /** 저장할 때마다 1씩 오르는 값. 세션이 어떤 판의 목록으로 시작했는지 남긴다. */
  revision: number
  /** 저장 요청 식별자. 같은 계정에서 같은 요청을 반복해도 목록이 하나만 생긴다(중복 저장 방지). */
  requestId: string
  createdAt: string
  updatedAt: string
}

// ─── 수행 세션 ──────────────────────────────────────────────

/**
 * 세션 상태(API 초안의 값 중 시작 이후의 네 가지). 전환은 in_progress → completed | interrupted | cancelled 뿐이고 되돌리지 않는다
 * (중단된 세션의 재개는 정책이 불명확해(G5) 허용하지 않는다).
 * - completed: 완료 처리되어 완료 기록이 저장됐다.
 * - interrupted: 완료한 세트가 하나 이상 있는 상태에서 기록을 저장하지 않고 그만뒀다.
 * - cancelled: 완료한 세트 없이 그만뒀다.
 */
export type WorkoutSessionStatus =
  'in_progress' | 'completed' | 'interrupted' | 'cancelled'

export const WORKOUT_SESSION_STATUSES: readonly WorkoutSessionStatus[] = [
  'in_progress',
  'completed',
  'interrupted',
  'cancelled',
]

/** 세션을 시작할 때 동결한 목록 사본. 원본 목록이 바뀌어도 진행 중 세션의 목표는 바뀌지 않는다. */
export interface WorkoutListSnapshot {
  plannedDate: LocalDate
  items: readonly WorkoutListItem[]
  catalogVersion: string
}

/**
 * 세트 하나의 실제 수행 값. 목표값은 listSnapshot에 있고 여기에는 실제 값만 둔다.
 * - 횟수형·중량형: actualReps(1 이상 정수), 중량형은 actualWeightKg(0 이상)도 쓸 수 있다. 완료한 세트는 actualReps가 있어야 한다.
 * - 시간형: measuredMs(측정한 실제 시간). 타이머를 쓰지 않았으면 없다(미측정, 0이 아니다).
 * 완료하지 않은 세트(completed=false)는 입력 중인 값이 있어도 완료로 보지 않는다.
 */
export interface PerformedSet {
  completed: boolean
  actualReps?: number
  actualWeightKg?: number
  measuredMs?: number
}

/** 지금 진행 중인 세트의 위치(0부터). */
export interface SessionCursor {
  itemIndex: number
  setIndex: number
}

/**
 * 현재 세트의 측정 타이머. runningSince가 있으면 그 시각부터 측정 중이다.
 * 새로고침·이탈 뒤 복원할 때 확인되지 않은 경과 시간은 더하지 않는다(workoutModel.restoreTimer).
 */
export interface SessionTimer {
  accumulatedMs: number
  runningSince: string | null
}

export interface WorkoutSession {
  id: string
  ownerId: string
  schemaVersion: typeof WORKOUT_SCHEMA_VERSION
  listId: string
  listRevision: number
  listSnapshot: WorkoutListSnapshot
  status: WorkoutSessionStatus
  cursor: SessionCursor
  /** performed[운동][세트]. listSnapshot의 운동·세트와 같은 모양이다. */
  performed: readonly (readonly PerformedSet[])[]
  timer: SessionTimer
  /** 저장할 때마다 1씩 오르는 값(낙관적 동시성 제어). */
  revision: number
  /** 세션 생성 시각(= 운동 시작 시각). */
  startedAt: string
  lastSavedAt: string
  /** completed가 된 시각. 그 밖의 상태에서는 null이다. */
  completedAt: string | null
  /** 끝난 시각(completed·interrupted·cancelled). 진행 중이면 null이다. */
  endedAt: string | null
  /** 완료 기록 id. completed일 때만 있다. */
  recordId: string | null
}

/** 진행 저장 입력. 화면이 가진 현재 값 전체를 보낸다. */
export interface SessionProgressInput {
  /** 화면이 마지막으로 읽은 세션의 revision. 다르면 다른 탭이 먼저 저장한 것이라 충돌이다. */
  expectedRevision: number
  cursor: SessionCursor
  performed: readonly (readonly PerformedSet[])[]
  timer: SessionTimer
}

// ─── 완료 기록 ──────────────────────────────────────────────

/** 완료 기록의 완료 세트 하나(목표 스냅샷 + 실제 값). */
export interface WorkoutRecordSet {
  /** 목록에서의 세트 번호(1부터). 완료한 세트만 남기므로 번호가 건너뛸 수 있다. */
  setNumber: number
  target: NormalizedSet
  actualReps?: number
  actualWeightKg?: number
  /** 측정한 시간. 측정하지 않았으면 null(0이 아니다). */
  measuredMs: number | null
}

export interface WorkoutRecordExercise {
  exerciseId: string
  exerciseNameSnapshot: string
  recordType: RecordType
  /** 목록에 있던 세트 수(목표 대비 비교용). */
  plannedSetCount: number
  /** 완료한 세트만. 비어 있을 수 있다(그 운동은 하나도 완료하지 않았다). */
  completedSets: readonly WorkoutRecordSet[]
}

/** 저장된 완료 세트만으로 계산한 합계. */
export interface WorkoutRecordTotals {
  /** 완료한 세트가 하나 이상인 운동 수 */
  exerciseCount: number
  completedSetCount: number
  plannedSetCount: number
  /** 측정한 시간의 합. 측정한 세트가 하나도 없으면 null(0이 아니다). */
  measuredMs: number | null
}

/** 운동 완료 기록. 과거 사실의 불변 스냅샷이며 목록·카탈로그가 바뀌어도 그대로다. */
export interface WorkoutRecord {
  id: string
  ownerId: string
  schemaVersion: typeof WORKOUT_SCHEMA_VERSION
  sessionId: string
  sourceListId: string
  /** 계획 날짜(목록의 plannedDate). 실제 수행 날짜와 구분한다. */
  plannedDate: LocalDate
  /** 실제 수행 날짜: 운동을 시작한 시각의 로컬 날짜. */
  performedDate: LocalDate
  startedAt: string
  completedAt: string
  exercises: readonly WorkoutRecordExercise[]
  totals: WorkoutRecordTotals
  catalogVersion: string
  createdAt: string
}
