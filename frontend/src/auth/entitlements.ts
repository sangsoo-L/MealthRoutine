import type { Entitlement } from './authTypes.ts'

/**
 * 멤버십 상품 유형의 표시 이름(통합 AI 멤버십). 표시 전용이며 기능 사용 권한을 정하지 않는다.
 * AI 기능 사용 가능 여부는 서버가 확인한 통합 AI 사용량으로 정한다(`membership/aiAccess.ts`).
 */
export const ENTITLEMENT_LABEL: Record<Entitlement, string> = {
  free: '일반 회원',
  basic: '베이직 멤버십 회원',
  pro: '프로 멤버십 회원',
}
