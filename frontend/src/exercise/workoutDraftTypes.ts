/**
 * 운동 목록 편집 초안(W02)의 화면용 모델. 편집 중인 값이며 백엔드 DTO나 최종 운동 목록·수행 기록 모델이 아니다.
 * 운동 기록·루틴의 영구 저장 계약은 확정되지 않았다(운동 도메인 설계 메모 §10). 이 모델은 임시 저장(계정별 sessionStorage)과 화면 편집에만 쓴다.
 */

/**
 * 기록 방식(저장 코드) 5종. reps 횟수형, weight 중량+횟수형, time 시간형, time_reps 시간+횟수형, weight_time 중량+시간형.
 * 카탈로그 코드(`weight_reps`)와 다르다: 중량+횟수형의 저장 코드는 기존 값 `weight`다(recordMode.ts의 toStoredRecordType).
 * W14·W15가 진행·결과로 처리하는 것은 time·reps·weight뿐이다(recordMode.isRunnableRecordType). 복합 방식(time_reps·weight_time)은
 * 목록으로 저장할 수 있지만 운동을 시작할 수 없다(S4·S5가 끝날 때까지).
 */
export type RecordType =
  'reps' | 'weight' | 'time' | 'time_reps' | 'weight_time'

export const RECORD_TYPES: readonly RecordType[] = [
  'time',
  'weight',
  'reps',
  'time_reps',
  'weight_time',
]

export const RECORD_TYPE_LABEL: Record<RecordType, string> = {
  time: '시간형',
  weight: '중량+횟수형',
  reps: '횟수형',
  time_reps: '시간+횟수형',
  weight_time: '중량+시간형',
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

/**
 * 초안이 어느 날의 운동 구성인가. today는 오늘의 운동 목록(W11이 workoutLists로 저장), tomorrow는 내일 운동 계획(W11이 workoutPlans로 저장)이다.
 * 두 초안은 서로 다른 임시 저장 키와 다른 공유 상태(WorkoutDraftProvider)를 가져 서로 덮어쓰지 않는다. 날짜(YYYY-MM-DD)는 초안에 저장하지 않는다
 * (내일 계획의 날짜는 화면을 연 시점의 다음 날로 W11이 정한다).
 */
export type DraftDay = 'today' | 'tomorrow'

export interface WorkoutDraft {
  /** 저장 스키마 버전 */
  v: 1
  day: DraftDay
  items: DraftItem[]
  /** ISO 8601. 편집할 때마다 갱신된다. */
  updatedAt: string
  /** 이미 만든 목록을 고치는 중일 때의 목록 id(W11 연동 이후에 쓴다). 지금은 쓰지 않는다. */
  editingListId?: string
  /**
   * 저장된 내일 운동 계획을 고치는 중일 때의 계획 id와 그 계획의 revision(day가 tomorrow일 때만). 저장하면 이 revision으로 충돌을 확인한다.
   * 둘은 함께 있거나 함께 없다.
   */
  editingPlanId?: string
  editingPlanRevision?: number
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
  /** 시간+횟수형: 목표 시간과 목표 횟수가 모두 있다. */
  | { reps: number; targetSeconds: number }
  /** 중량+시간형: 목표 시간은 있고 목표 중량은 선택이다. */
  | { targetSeconds: number; weightKg?: number }

export interface NormalizedItem {
  exerciseId: string
  name: string
  recordType: RecordType
  sets: readonly NormalizedSet[]
}
