import {
  aiAccessFromState,
  aiUsageRemaining,
  type AiAccess,
} from './aiAccess.ts'
import { MEMBERSHIP_SOURCE } from './membership.ts'
import { useMembership } from './useMembership.ts'

/**
 * AI 신규 요청 가능 상태(서버가 확인한 통합 AI 사용량 기준). 서버 연결 전에는 항상 'unknown'이며 권한을 부여하지 않는다.
 * 조회는 읽기 전용이고 이 앱은 사용량을 차감·갱신·저장하지 않는다.
 */
export function useAiAccess(): AiAccess {
  return aiAccessFromState(useMembership(MEMBERSHIP_SOURCE).state)
}

/**
 * AI 신규 요청 가능 상태와 서버가 확인한 잔여 횟수(표시용). 잔여는 서버 값 그대로이고 확인 전·연결 전에는 null이다(숫자를 만들지 않는다).
 */
export function useAiAccessInfo(): {
  access: AiAccess
  remaining: number | null
} {
  const { state } = useMembership(MEMBERSHIP_SOURCE)
  return {
    access: aiAccessFromState(state),
    remaining: aiUsageRemaining(state),
  }
}
