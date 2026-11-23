import type { KnowledgeLevels } from '../../mypage/mypageTypes.ts'

/**
 * 초급 사용자 전용 자동 운동 구성의 권한 판별(순수 함수).
 *
 * - 기준은 **운동 이해도**(`loadKnowledgeLevels(userId)`의 `levels.exercise.tier`)뿐이다. 식단 이해도(`levels.meal`)는 읽지도 않는다.
 * - 허용은 `beginner` 하나다. 중급·고급, 값이 없음(null·undefined, 미확인), 알 수 없는 값은 모두 막는다.
 * - 운동 이해도는 기능 제공 여부를 정하는 값이며 실제 운동 수행 능력으로 추정하지 않는다.
 * - AI 운동 플랜(I02-1)의 AI 사용 상태(membership/aiAccess)와 별개이며 서로 호출하지 않는다.
 *
 * 이 판별은 화면 진입·추천 엔진·WorkoutDraft 변환 모두에서 호출한다(버튼을 숨기는 것만으로는 충분하지 않다).
 */

export type BeginnerPlanDenied =
  /** 이해도를 알 수 없다(결과 없음·조회 수단 없음). 초급으로 가정하지 않는다. */
  | 'unknown'
  /** 중급 또는 고급이다. 기존 직접 설정 화면을 쓴다. */
  | 'notBeginner'
  /** 알 수 없는 값이다(손상·잘못된 호출). */
  | 'invalid'

export type BeginnerPlanAccess =
  { ok: true; tier: 'beginner' } | { ok: false; reason: BeginnerPlanDenied }

/** 운동 이해도 단계 값으로 판별한다. 문자열이 아닌 값·알 수 없는 문자열은 invalid다. */
export function checkBeginnerPlanAccess(tier: unknown): BeginnerPlanAccess {
  if (tier === null || tier === undefined) {
    return { ok: false, reason: 'unknown' }
  }
  if (tier === 'beginner') return { ok: true, tier: 'beginner' }
  if (tier === 'intermediate' || tier === 'advanced') {
    return { ok: false, reason: 'notBeginner' }
  }
  return { ok: false, reason: 'invalid' }
}

/**
 * 이해도 조회 결과(KnowledgeLevels)로 판별한다. 운동 영역(`exercise`)만 보고 식단 영역(`meal`)은 보지 않는다.
 * 조회 결과 자체가 없으면(null·undefined) 알 수 없음이다.
 */
export function checkBeginnerPlanAccessFromLevels(
  levels: Pick<KnowledgeLevels, 'exercise'> | null | undefined,
): BeginnerPlanAccess {
  return checkBeginnerPlanAccess(levels?.exercise?.tier)
}

export function canUseBeginnerPlan(tier: unknown): boolean {
  return checkBeginnerPlanAccess(tier).ok
}

/** 권한이 없는데 추천 실행·변환이 호출됐을 때 던지는 오류(화면 우회·직접 호출 방어). */
export class BeginnerPlanAccessError extends Error {
  readonly reason: BeginnerPlanDenied
  constructor(reason: BeginnerPlanDenied) {
    super(`beginner plan access denied: ${reason}`)
    this.name = 'BeginnerPlanAccessError'
    this.reason = reason
  }
}

/** 초급이 아니면 BeginnerPlanAccessError를 던진다. 엔진(P2-2)·WorkoutDraft 변환(P2-3)의 첫 줄에서 호출한다. */
export function assertBeginnerPlanAccess(tier: unknown): 'beginner' {
  const access = checkBeginnerPlanAccess(tier)
  if (!access.ok) throw new BeginnerPlanAccessError(access.reason)
  return access.tier
}
