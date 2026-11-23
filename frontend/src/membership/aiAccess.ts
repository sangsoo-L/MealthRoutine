import type { MembershipState } from './membership.ts'

/**
 * AI 신규 요청을 할 수 있는지의 화면 상태(통합 AI 멤버십 정책). 멤버십 상품 유형이 아니라 **서버가 확인한 통합 AI 사용량**에서만 나온다.
 *
 * - available: 서버가 확인한 잔여 횟수가 1회 이상이다. 무료 회원(최초 5회)도 잔여가 있으면 같다.
 * - exhausted: 서버가 확인한 잔여 횟수가 0이다. AI 신규 요청은 제한되고, 운동·식단 기록과 조회는 계속 쓸 수 있다.
 * - unknown: 서버 미연결·조회 중·조회 실패·사용량 없음·계약 불일치. **권한을 부여하지 않는다**(허용도 제한도 단정하지 않는다).
 *   실제 AI 요청은 서버 연결 없이는 시작할 수 없고, 이 앱 안의 로컬 예시·미리보기처럼 AI 요청이 아닌 동작만 그대로 둔다.
 *
 * 프론트엔드는 사용량을 계산·차감·저장하지 않고 서버 값을 그대로 구분만 한다. 권한의 최종 판정은 서버가 한다.
 */
export type AiAccess = 'unknown' | 'available' | 'exhausted'

/** 멤버십 조회 상태에서 AI 사용 상태를 구분한다. 확인하지 못했으면 항상 unknown이다. */
export function aiAccessFromState(state: MembershipState): AiAccess {
  if (state.status !== 'ready') return 'unknown'
  const usage = state.info.usage
  if (usage == null) return 'unknown'
  return usage.remaining > 0 ? 'available' : 'exhausted'
}

/**
 * 서버가 확인한 잔여 횟수(표시용). 확인하지 못했으면 null이며 숫자를 만들지 않는다. 계산·차감·저장 없이 서버 값을 그대로 돌려준다.
 */
export function aiUsageRemaining(state: MembershipState): number | null {
  if (state.status !== 'ready') return null
  return state.info.usage?.remaining ?? null
}

/** 사용 횟수 소진으로 AI 신규 요청이 제한됐을 때의 안내(I02-1·I04 공통). */
export const AI_EXHAUSTED_TEXT = {
  title: 'AI 사용 횟수를 모두 사용했어요',
  body: '운동 AI와 식단 AI는 공통 사용 횟수를 함께 써요. 지금은 새로운 AI 요청을 할 수 없어요. 운동·식단 기록과 조회는 횟수와 상관없이 계속 쓸 수 있어요.',
  link: '멤버십과 사용 횟수 보기',
} as const

/** 확인하지 못한 상태(unknown)에서 AI 사용 횟수 규칙을 알리는 한 줄. 남은 횟수 숫자는 만들지 않는다. */
export const AI_USAGE_NOTE =
  '운동 AI와 식단 AI는 공통 사용 횟수를 함께 써요. 무료 AI 체험은 최초 5회이고 월간 초기화는 없어요. 남은 횟수는 서버가 연결되면 보여 드려요.'
