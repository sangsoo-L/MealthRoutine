import type { KnowledgeTier } from './mypageTypes.ts'

/** 단계 순서. 인덱스가 곧 내부 등급 값이다(beginner = 0, intermediate = 1, advanced = 2). */
const TIER_ORDER: readonly KnowledgeTier[] = [
  'beginner',
  'intermediate',
  'advanced',
]

/**
 * 마이페이지 표시용 종합 이해도 등급. 운동·식단 이해도 확인 결과를 하나의 대표 등급으로 합친다.
 *
 * 규칙(사용자 승인): 종합 = Math.round((운동 등급 값 + 식단 등급 값) / 2). 값은 beginner 0, intermediate 1, advanced 2이며
 * 0은 초보, 1은 중급, 2는 고급이다. 반올림이라 두 등급 사이의 .5는 높은 쪽이 된다(초보+중급 → 중급, 중급+고급 → 고급).
 * 한 영역이라도 결과가 없으면(null) 임의로 계산하지 않고 null("미확인")을 돌려준다.
 *
 * 표시용 값일 뿐이다. 운동·식단 개별 결과(KnowledgeLevels)는 그대로 유지되며, 맞춤형 서비스는 개별 결과를 쓴다.
 * 회원 유형·활동 레벨·포인트는 이 계산에 쓰지 않는다. 채점(onboarding-assessment/mock/scoring.ts)과도 무관하다.
 */
export function summarizeKnowledgeTier(
  exercise: KnowledgeTier | null,
  meal: KnowledgeTier | null,
): KnowledgeTier | null {
  if (exercise === null || meal === null) return null
  const average = (TIER_ORDER.indexOf(exercise) + TIER_ORDER.indexOf(meal)) / 2
  return TIER_ORDER[Math.round(average)] ?? null
}
