import type { Entitlement } from './authTypes.ts'

export const ENTITLEMENT_LABEL: Record<Entitlement, string> = {
  free: '일반 회원',
  exercise: '운동 멤버십 회원',
  meal: '식단 멤버십 회원',
  full: '종합 멤버십 회원',
}

/**
 * AI 기능 이용 구분.
 * paid: 유료 권한으로 이용, trial: 일반 회원의 합산 체험 대상, unspecified: 명세에 체험 적용 여부가 없음
 */
export type AiAccess = 'paid' | 'trial' | 'unspecified'

/**
 * AI 운동 플랜(I02-1). 근거: documents/화면명세_v5.0.json I02-1의 접근 정의
 * "유료 운동 또는 종합 권한 · 무료 회원: AI 운동·식단·사진·주간 코칭 합산 5회 체험".
 * 식단 멤버십 회원에게 체험이 적용되는지는 명세에 없어 임의로 정하지 않고 'unspecified'로 둔다.
 */
export function getExercisePlanAccess(entitlement: Entitlement): AiAccess {
  if (entitlement === 'exercise' || entitlement === 'full') return 'paid'
  if (entitlement === 'free') return 'trial'
  return 'unspecified'
}

/**
 * 사진 음식 분석(I04). 근거: documents/화면명세_v5.0.json I04의 접근 정의
 * "유료 식단 또는 종합 권한 · 무료 회원 합산 5회 체험".
 * 운동 멤버십 회원에게 체험이 적용되는지는 명세에 없어 임의로 정하지 않고 'unspecified'로 둔다.
 */
export function getPhotoAnalysisAccess(entitlement: Entitlement): AiAccess {
  if (entitlement === 'meal' || entitlement === 'full') return 'paid'
  if (entitlement === 'free') return 'trial'
  return 'unspecified'
}
