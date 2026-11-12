/**
 * 운동 목록 편집 초안(W02)의 화면용 모델. 편집 중인 값이며 백엔드 DTO나 최종 운동 목록·수행 기록 모델이 아니다.
 * 운동 기록·루틴의 영구 저장 계약은 확정되지 않았다(exercise-domain-design.md §10). 이 모델은 임시 저장(계정별 sessionStorage)과 화면 편집에만 쓴다.
 */

/** 기록 방식. reps 횟수형, weight 중량형(횟수 + 중량), time 시간형(목표 시간). */
export type RecordType = 'reps' | 'weight' | 'time'

export const RECORD_TYPES: readonly RecordType[] = ['time', 'weight', 'reps']

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  time: '시간형',
  weight: '중량형',
  reps: '횟수형',
}

/**
 * 세트 하나. 필드는 모두 "입력되어 있을 때만" 있다. 값이 비어 있으면 필드가 없다(undefined).
 * 기록 방식과 관계없는 필드도 편집 중에는 보존한다(방식을 바꿨다 돌아와도 입력이 유지되도록). 최종 검토에서 정규화할 때 걸러 낸다.
 * 편집 중에는 검증을 통과하지 못하는 유한한 숫자(0, 2.5, -1 등)도 담길 수 있으며, 올바른지는 validateDraft가 판정한다.
 */
export interface DraftSet {
  reps?: number
  weightKg?: number
  targetSeconds?: number
}

/**
 * 초안의 운동 한 줄. 운동 객체를 복사하지 않고 운동 식별자(exerciseId)만 참조한다.
 * name은 화면 표시용 스냅샷이며 운동 데이터의 정본이 아니다. itemId는 순서 변경·세트 편집에서 안정적인 화면용 식별자다.
 */
export interface DraftItem {
  itemId: string
  exerciseId: string
  name: string
  recordType: RecordType
  sets: DraftSet[]
}

export interface WorkoutDraft {
  /** 저장 스키마 버전 */
  v: 1
  /** 이번 MVP는 오늘 운동만 지원한다. 날짜(YYYY-MM-DD)는 저장하지 않는다(날짜 기준·시간대는 미확정). */
  day: 'today'
  items: DraftItem[]
  /** ISO 8601. 편집할 때마다 갱신된다. */
  updatedAt: string
  /** 이미 만든 목록을 고치는 중일 때의 목록 id(W11 연동 이후에 쓴다). 지금은 쓰지 않는다. */
  editingListId?: string
}

/** 검증 오류가 가리키는 입력. */
export type DraftIssueField =
  | 'items'
  | 'exercise'
  | 'recordType'
  | 'sets'
  | 'reps'
  | 'weightKg'
  | 'targetSeconds'

export interface DraftIssue {
  /** 오류가 있는 운동. 초안 전체의 오류(운동 없음)면 없다. */
  itemId?: string
  /** 오류가 있는 세트(0부터). 운동 단위 오류면 없다. */
  setIndex?: number
  field: DraftIssueField
  message: string
}

export type DraftValidation =
  { ok: true } | { ok: false; issues: readonly DraftIssue[] }

/** 최종 검토용으로 기록 방식에 맞게 걸러 낸 세트. 기록 방식과 관계없는 필드는 없다. */
export type NormalizedSet =
  | { reps: number }
  | { reps: number; weightKg?: number }
  | { targetSeconds: number }

export interface NormalizedItem {
  exerciseId: string
  name: string
  recordType: RecordType
  sets: readonly NormalizedSet[]
}
