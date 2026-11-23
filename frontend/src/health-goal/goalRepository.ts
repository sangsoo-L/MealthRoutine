import type { HealthGoalInput, HealthManagementGoal } from './goalTypes.ts'

/** 저장이 거절된 이유 */
export type GoalSaveErrorReason = 'invalid' | 'failed'

export class GoalSaveError extends Error {
  readonly reason: GoalSaveErrorReason

  constructor(reason: GoalSaveErrorReason) {
    super(`health goal save rejected: ${reason}`)
    this.name = 'GoalSaveError'
    this.reason = reason
  }
}

/**
 * 건강관리 목표의 데이터 경계. 화면은 이 인터페이스만 안다. 조회·저장 책임은 화면이 아니라 이쪽(서버)에 있다.
 *
 * 실제 API(`POST/GET/PATCH /api/v1/health/goals`)의 요청·응답 구조는 아직 없다(api-policy.md §4). 운동·식단 비율 필드가 이 API에
 * 있는지도 확인되지 않아 연결하지 않았다(백엔드 확인 사항). 개발 환경의 Mock 구현(mock/mockGoalRepository.ts)과 나중에 만들
 * API 구현을 이 인터페이스로 교체한다. 서버도 같은 검증(합 100, 관리 방향·비율 일치, 정책별 허용 범위, 10:0·0:10 금지)을 해야 한다.
 */
export interface HealthGoalRepository {
  /** 'mock'이면 개발용 저장소이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'api'

  /** 저장된 목표. 아직 없으면 null이다. 조회가 실패하면 예외를 던진다. */
  getGoal(): Promise<HealthManagementGoal | null>

  /**
   * 목표를 저장하고(처음이면 생성, 있으면 수정) 저장된 목표를 돌려준다. 정책에 맞지 않으면 GoalSaveError('invalid'),
   * 저장에 실패하면 GoalSaveError('failed')를 던진다. 실패하면 기존 목표는 그대로다.
   */
  saveGoal(input: HealthGoalInput): Promise<HealthManagementGoal>
}
