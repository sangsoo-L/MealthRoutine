import type { AssessmentRepository } from './assessmentRepository.ts'

/**
 * 운동·식단 이해도 확인의 데이터 출처. 지금은 개발 서버에서만 Mock 저장소를 쓰고, 그 외(운영 빌드)에는 null이다.
 * null은 "이 빌드에서는 출제·채점을 할 수 없다"는 뜻이며, 화면은 이용할 수 없다는 안내를 보여 준다.
 * 운영 환경에서는 서버가 문항 출제·채점·결과 저장을 맡아야 하므로, 프론트엔드에 문항 은행과 채점 코드를 두지 않는다.
 *
 * import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와 Mock 청크(문항 은행·출제·채점)가 제거된다
 * (auth/authBackend.ts, mypage/mypageSource.ts와 같은 방식).
 *
 * 실제 API가 정해지면 AssessmentRepository를 구현한 객체를 만들어 아래 반환을 교체한다.
 */
const mockModule = import.meta.env.DEV
  ? await import('./mock/mockAssessmentRepository.ts')
  : null

export function createAssessmentRepository(
  userId: string,
): AssessmentRepository | null {
  return mockModule
    ? mockModule.createMockAssessmentRepository({ userId })
    : null
}
