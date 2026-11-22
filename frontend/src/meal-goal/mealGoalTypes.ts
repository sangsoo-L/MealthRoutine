/**
 * 식단 목표(D01-4)의 타입. 하루 열량과 탄수화물·단백질·지방 비율의 **최종 목표**만 담는다.
 *
 * 나이·성별·키·몸무게·기초대사량은 이 모델에 없다. 그 값은 기존 운동 목표의 PIN 보호 프로필에서 필요한 순간에만 읽고, 목표 저장소에 복사하지 않는다.
 * 백엔드 `POST/GET/PATCH /api/v1/diet-goals`의 요청·응답 구조는 아직 정의되지 않았다(api-status.md). 이 타입은 화면이 필요로 하는 값만 담은
 * 임시 형태이며 API 계약이 아니다. 구조가 확정되면 변환을 저장소 구현에 둔다.
 */

export type MealGoalPurpose = 'lose' | 'improve' | 'maintain'

/** 식단 이해도 단계 코드(회원가입 후 이해도 확인 결과의 meal 값과 같은 코드). 미확인은 null로 두고 추정하지 않는다. */
export type MealGoalLevel = 'beginner' | 'intermediate' | 'advanced'

export type MealGoalActivity = 'sedentary' | 'light' | 'active'

export interface MealGoalRatio {
  /** 탄수화물 에너지 비율(정수 %) */
  carb: number
  /** 단백질 에너지 비율(정수 %) */
  protein: number
  /** 지방 에너지 비율(정수 %) */
  fat: number
}

export interface MealGoal {
  v: 1
  /** 계산 정책(상수표) 버전. 어떤 정책으로 만든 값인지 구분하는 용도이며, 저장된 kcal·비율의 의미를 바꾸지 않는다. */
  calculationVersion: number
  /** calculated: 자동 계산 결과를 그대로 저장, custom: 고급 회원이 직접 조정 */
  source: 'calculated' | 'custom'
  purpose: MealGoalPurpose
  /** 입력 당시의 식단 이해도. 미확인이면 null이며 초급으로 바꿔 저장하지 않는다. */
  level: MealGoalLevel | null
  /** 중급에서 고른 평소 활동량. 받지 않은 경우 null */
  activity: MealGoalActivity | null
  /** 하루 목표 열량(정수 kcal) */
  kcal: number
  ratio: MealGoalRatio
  /** 계산에 쓴 신체 정보의 갱신 시각(ISO 8601). 수치가 아니라 "신체 정보가 바뀌었는지" 안내에만 쓴다. */
  basis: { profileUpdatedAt: string }
  /** 저장할 때마다 1씩 오르는 값(다른 탭의 동시 수정 감지) */
  revision: number
  /** ISO 8601 */
  updatedAt: string
}

/** 대시보드가 받는 요약. 신체 수치가 없다. */
export interface MealGoalSummary {
  kcal: number
  ratio: MealGoalRatio
  purpose: MealGoalPurpose
  source: MealGoal['source']
  updatedAt: string
}

/** 저장 요청의 목표 부분(revision·updatedAt은 저장소가 정한다). */
export type MealGoalInput = Omit<MealGoal, 'revision' | 'updatedAt'>

export interface SaveMealGoalRequest {
  goal: MealGoalInput
  /** 화면이 읽은 시점의 revision. 목표가 없던 상태에서 처음 저장하면 null. 저장소의 현재 값과 다르면 conflict다. */
  expectedRevision: number | null
}

export type MealGoalErrorCode =
  /** 저장 수단이 없다(운영 빌드·API 연결 전·개발용 스위치) */
  | 'unavailable'
  /** 읽는 중 오류(목표가 없다는 뜻이 아니다) */
  | 'load'
  /** 쓰는 중 오류. 기존 목표는 바뀌지 않았다. */
  | 'save'
  /** 저장된 값이 손상됐거나 다른 회원의 값이다. 덮어쓰지 않는다. */
  | 'corrupt'
  | 'validation'
  /** 계산 정책이 아직 검증되지 않아 저장할 수 없다. */
  | 'policyPending'
  /** 다른 탭에서 목표가 바뀌었다. */
  | 'conflict'

export class MealGoalError extends Error {
  readonly code: MealGoalErrorCode
  constructor(code: MealGoalErrorCode) {
    super(`meal goal ${code}`)
    this.name = 'MealGoalError'
    this.code = code
  }
}

export interface MealGoalRepository {
  readonly kind: 'local'
  /** 목표가 없으면 null. 읽지 못하면 null이 아니라 MealGoalError를 던진다. 신체 정보가 없어 PIN이 필요 없다. */
  getGoal(): Promise<MealGoal | null>
  saveGoal(request: SaveMealGoalRequest): Promise<MealGoal>
}

/**
 * 목표를 불러오는 상태.
 * - loading: 불러오는 중
 * - error: 조회 실패(목표 없음이 아니다)
 * - unavailable: 저장 수단이 없다(운영 빌드·API 연결 전)
 * - ready: 조회를 마침. goal이 null이면 아직 설정하지 않은 것이다.
 */
export type MealGoalState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; goal: MealGoal | null }
