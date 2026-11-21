import type { RecordType } from './workoutDraftTypes.ts'

/**
 * 운동 기록 방식 5종의 타입·변환·구성값·카탈로그 메타데이터 검증(순수 함수, 화면·저장소와 무관).
 *
 * 두 가지 코드를 타입 수준에서 구분한다.
 * - CatalogRecordMode: 운동 카탈로그(exercises.json의 default_record_mode·allowed_record_modes)가 쓰는 코드. 중량+횟수형은 `weight_reps`.
 * - StoredRecordType(= RecordType): 저장된 목록·세션·기록(WorkoutListItem.recordType 등)이 쓰는 내부 코드. 중량+횟수형은 기존 값 `weight`를 그대로 쓴다.
 *   기존 저장 데이터의 `weight`를 바꾸지 않고(마이그레이션 없음) 카탈로그 쪽에서 toStoredRecordType으로 변환한다.
 * `weight`와 `weight_reps`는 같은 방식(중량+횟수)의 두 이름이지 서로 다른 방식이 아니다.
 *
 * 저장 모델이 5종을 읽고 쓸 수 있는 것(RECORD_TYPES)과 W14·W15가 5종을 진행·결과로 처리하는 것(RUNNABLE_RECORD_TYPES)은 다르다.
 * 복합 방식(time_reps·weight_time)은 W02·W11에서 목록으로 저장할 수 있지만, S4·S5가 끝날 때까지 운동을 시작할 수 없다.
 */

// ─── 코드 ──────────────────────────────────────────────────

export type CatalogRecordMode =
  'time' | 'reps' | 'weight_reps' | 'time_reps' | 'weight_time'

export const CATALOG_RECORD_MODES: readonly CatalogRecordMode[] = [
  'time',
  'reps',
  'weight_reps',
  'time_reps',
  'weight_time',
]

/** 저장 모델이 쓰는 내부 코드(5종). workoutDraftTypes.RecordType과 같은 타입이다. */
export type StoredRecordType = RecordType

export const STORED_RECORD_TYPES: readonly StoredRecordType[] = [
  'time',
  'reps',
  'weight',
  'time_reps',
  'weight_time',
]

export function isCatalogRecordMode(
  value: unknown,
): value is CatalogRecordMode {
  return (
    typeof value === 'string' &&
    (CATALOG_RECORD_MODES as readonly string[]).includes(value)
  )
}

export function isStoredRecordType(value: unknown): value is StoredRecordType {
  return (
    typeof value === 'string' &&
    (STORED_RECORD_TYPES as readonly string[]).includes(value)
  )
}

/** 카탈로그 코드를 내부 저장 코드로 바꾼다. `weight_reps`만 기존 값 `weight`로 바뀌고 나머지는 그대로다. */
export function toStoredRecordType(mode: CatalogRecordMode): StoredRecordType {
  return mode === 'weight_reps' ? 'weight' : mode
}

/**
 * W14(운동 진행)·W15(운동 결과)가 처리하는 방식. S5에서 W02~W15의 전체 흐름(복합 방식의 선택·목표·시작·진행·결과 편집·최종 저장·재조회)을
 * 실제 브라우저와 IndexedDB로 확인한 뒤 5종 모두로 넓혔다. 이 목록에 없는 방식이 목록에 있으면(예: 앞으로 추가될 방식)
 * 운동 시작이 차단된다(findUnrunnableItems·W01 시작 차단·저장소 startOrResume 거부는 그대로 남아 있다).
 */
export const RUNNABLE_RECORD_TYPES: readonly StoredRecordType[] = [
  'time',
  'reps',
  'weight',
  'time_reps',
  'weight_time',
]

export function isRunnableRecordType(type: StoredRecordType): boolean {
  return RUNNABLE_RECORD_TYPES.includes(type)
}

/** 목록 항목 중 지금 운동을 시작할 수 없는 방식(복합 방식)의 항목. 비어 있으면 시작할 수 있다. */
export function findUnrunnableItems<T extends { recordType: StoredRecordType }>(
  items: readonly T[],
): T[] {
  return items.filter((item) => !isRunnableRecordType(item.recordType))
}

// ─── 방식별 구성값 ─────────────────────────────────────────

/** 방식을 이루는 값. 시간(time)·횟수(reps)·중량(weight). */
export interface RecordComponents {
  time: boolean
  reps: boolean
  weight: boolean
}

/**
 * 방식별 구성값: time 시간 / reps 횟수 / weight 중량+횟수 / time_reps 시간+횟수 / weight_time 중량+시간.
 * 목표값·실제값의 허용 필드와 검증이 이 표를 따른다(기존 3종의 규칙은 이 표로 표현해도 그대로다).
 */
export const RECORD_COMPONENTS: Record<StoredRecordType, RecordComponents> = {
  time: { time: true, reps: false, weight: false },
  reps: { time: false, reps: true, weight: false },
  weight: { time: false, reps: true, weight: true },
  time_reps: { time: true, reps: true, weight: false },
  weight_time: { time: true, reps: false, weight: true },
}

/** 세트의 실제 수행값 필드(PerformedSet·WorkoutRecordSet의 필드 이름). */
export type ActualField = 'actualReps' | 'actualWeightKg' | 'measuredMs'

export const ACTUAL_FIELDS: readonly ActualField[] = [
  'actualReps',
  'actualWeightKg',
  'measuredMs',
]

/**
 * 신규 완료 세트가 반드시 가져야 하는 실제 수행값(A안). 방식의 모든 구성값이 필수이고, 구성값이 아닌 필드는 가질 수 없다.
 * 기존 저장 데이터를 읽는 규칙(중량 미입력·시간 미측정 허용)과는 별개이며 그쪽에 소급 적용하지 않는다.
 * 목표값의 필수·선택은 다르다: 목표 중량은 선택이다(workoutDraftModel.validateDraft).
 */
export const REQUIRED_ACTUAL_FIELDS: Record<
  StoredRecordType,
  readonly ActualField[]
> = {
  time: ['measuredMs'],
  reps: ['actualReps'],
  weight: ['actualWeightKg', 'actualReps'],
  time_reps: ['measuredMs', 'actualReps'],
  weight_time: ['actualWeightKg', 'measuredMs'],
}

// ─── 카탈로그 메타데이터 검증 ──────────────────────────────

/** 운동 카탈로그의 기록 방식 메타데이터(기본 1개, 허용 목록). 카탈로그 코드 그대로 담는다. */
export interface CatalogRecordModes {
  default: CatalogRecordMode
  allowed: readonly CatalogRecordMode[]
}

export type RecordModeIssue =
  /** 기본 방식이 5종 중 하나가 아니다. */
  | 'defaultInvalid'
  /** 허용 방식이 배열이 아니다. */
  | 'allowedNotArray'
  /** 허용 배열이 비어 있다. */
  | 'allowedEmpty'
  /** 허용 배열에 5종이 아닌 값이 있다. */
  | 'allowedInvalidValue'
  /** 허용 배열에 같은 값이 두 번 이상 있다. */
  | 'allowedDuplicate'
  /** 기본 방식이 허용 목록에 없다. */
  | 'defaultNotAllowed'

export type RecordModesValidation =
  | { ok: true; value: CatalogRecordModes }
  | { ok: false; issues: readonly RecordModeIssue[] }

/**
 * 기본 방식과 허용 방식 목록을 검증한다. 원본은 바꾸지 않으며, 문제가 있으면 모두 모아 돌려준다.
 * 1) 기본이 5종 중 하나 2) 허용이 배열 3) 비어 있지 않음 4) 5종만 포함 5) 중복 없음 6) 기본이 허용에 포함
 */
export function validateRecordModes(
  defaultMode: unknown,
  allowedModes: unknown,
): RecordModesValidation {
  const issues: RecordModeIssue[] = []
  const defaultValid = isCatalogRecordMode(defaultMode)
  if (!defaultValid) issues.push('defaultInvalid')
  if (!Array.isArray(allowedModes)) {
    issues.push('allowedNotArray')
  } else {
    if (allowedModes.length === 0) issues.push('allowedEmpty')
    if (!allowedModes.every(isCatalogRecordMode)) {
      issues.push('allowedInvalidValue')
    }
    if (new Set(allowedModes).size !== allowedModes.length) {
      issues.push('allowedDuplicate')
    }
    if (defaultValid && !allowedModes.includes(defaultMode)) {
      issues.push('defaultNotAllowed')
    }
  }
  if (issues.length > 0) return { ok: false, issues }
  return {
    ok: true,
    value: {
      default: defaultMode as CatalogRecordMode,
      allowed: [...(allowedModes as readonly CatalogRecordMode[])],
    },
  }
}
