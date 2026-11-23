import { createAssessmentRepository } from '../onboarding-assessment/assessmentSource.ts'
import type { AssessmentResult } from '../onboarding-assessment/assessmentTypes.ts'
import { getDevInitialKnowledge } from './mypageSource.ts'
import type { KnowledgeEntry, KnowledgeLevels } from './mypageTypes.ts'

/**
 * 마이페이지(P01)의 이해도(운동·식단) 조회. 값은 영역마다 독립으로 다음 순서로 정한다.
 *
 * 1) 이 계정의 유효한 이해도 확인 결과(onboarding-assessment의 저장소. 결과는 운동·식단 단계를 함께 담는다)
 * 2) 결과가 없을 때, 개발용 임시 회원(member.free / member.full)에 한해 개발용 초기값(source: 'dev-initial')
 * 3) 둘 다 없으면 null → 화면에 "미확인". 초보 등 임의의 값으로 채우지 않는다.
 *
 * 응시 기록을 만들지 않는다: 읽기 전용 `getResult()`만 호출하고(출제 세션을 만들거나 쓰지 않는다), 초기값은 결과 저장소에
 * 쓰지 않는다. 조회 키는 로그인한 계정 id뿐이라 개발용 가입 체험(subject id `signup-experience`)의 결과는 읽지 않는다.
 *
 * 조회 수단이 없는 빌드(운영, 이해도 API 연결 전)에서는 값을 알 수 없으므로 null을 돌려준다(화면은 "연결 전").
 * 저장소 조회가 실패하면 예외를 그대로 던져 화면이 오류 상태와 다시 시도를 보여 주게 한다(초기값으로 덮지 않는다).
 */
export async function loadKnowledgeLevels(
  userId: string,
): Promise<KnowledgeLevels | null> {
  const repository = createAssessmentRepository(userId)
  if (!repository) return null

  const result = await repository.getResult()
  const initial = getDevInitialKnowledge(userId)

  return {
    exercise: result
      ? fromResult(result, 'exercise')
      : (initial?.exercise ?? null),
    meal: result ? fromResult(result, 'meal') : (initial?.meal ?? null),
  }
}

function fromResult(
  result: AssessmentResult,
  domain: 'exercise' | 'meal',
): KnowledgeEntry {
  return { tier: result[domain], source: 'assessment' }
}
