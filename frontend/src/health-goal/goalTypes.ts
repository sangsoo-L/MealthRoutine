/**
 * 건강관리 목표(운동·식단 관리 비중)의 타입.
 *
 * 운동 중심·식단 중심은 한쪽만 이용한다는 뜻이 아니다. 운동과 식단을 모두 관리하되 선택한 영역의 비중을 조금 더 높이는 구조이며,
 * 10:0·0:10은 쓰지 않는다. 이 비율은 서비스 안의 관리 콘텐츠·목표·추천 우선순위의 비중일 뿐 운동 강도나 식사량을 계산하는 값이 아니다.
 *
 * 실제 API(`POST/GET/PATCH /api/v1/health/goals`)의 요청·응답 구조는 확정되지 않았다(api-policy.md §4). 이 타입은 화면이 필요로 하는
 * 값만 담은 임시 형태이며, 구조가 확정되면 변환을 저장소 구현에 둔다. (이전의 초기설문 건강 목표 유형 HealthGoalType은 이 모델로 대체했다.)
 */

/** 관리 방향. 운동 비율이 50보다 높으면 exercise, 낮으면 meal, 같으면 balanced다. */
export type HealthGoalFocus = 'exercise' | 'meal' | 'balanced'

/** 저장된 건강관리 목표. 운동 비율 + 식단 비율은 항상 100이다. */
export interface HealthManagementGoal {
  focus: HealthGoalFocus
  /** 운동 비율(%) */
  exerciseRatio: number
  /** 식단 비율(%) */
  mealRatio: number
  /** ISO 8601 */
  updatedAt: string
}

/**
 * 설정 방식.
 * - simple: 간편 선택(운동 중심 70:30 · 식단 중심 30:70 · 균형 관리 50:50). 초보 회원과 이해도 확인 전 회원이 쓴다.
 * - custom: 직접 설정(운동 20~80%, 10% 단위). 중급·고급 회원이 쓴다.
 */
export type GoalPolicy = 'simple' | 'custom'

/** 저장 요청. 식단 비율과 관리 방향은 운동 비율에서 계산한다(합 100·방향 일치가 항상 보장된다). */
export interface HealthGoalInput {
  exerciseRatio: number
  policy: GoalPolicy
}

/**
 * 건강 목표를 불러오는 상태.
 * - loading: 불러오는 중
 * - error: 불러오지 못함(목표가 없는 것으로 보지 않는다)
 * - unavailable: 조회 수단이 없음(운영 빌드, API 연결 전)
 * - ready: 조회를 마침. goal이 null이면 아직 설정하지 않은 것이다.
 */
export type HealthGoalState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; goal: HealthManagementGoal | null }
