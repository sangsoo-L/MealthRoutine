import type {
  AssessmentAnswers,
  AssessmentAttempt,
  AssessmentResult,
} from './assessmentTypes.ts'

/** 제출이 거절된 이유 */
export type AssessmentSubmitErrorReason =
  'unknown-session' | 'incomplete' | 'invalid-answer'

export class AssessmentSubmitError extends Error {
  readonly reason: AssessmentSubmitErrorReason

  constructor(reason: AssessmentSubmitErrorReason) {
    super(`assessment submit rejected: ${reason}`)
    this.name = 'AssessmentSubmitError'
    this.reason = reason
  }
}

/**
 * 이해도 확인의 데이터 경계. 화면은 이 인터페이스만 안다.
 *
 * 출제·채점·결과 저장은 모두 이쪽(서버) 책임이다. 화면은 정답을 갖지 않고, 답안을 보내면 단계만 돌려받는다.
 * 개발 환경의 Mock 구현(mock/mockAssessmentRepository.ts)과 나중에 만들 API 구현을 이 인터페이스로 교체한다.
 * 서버 계약 조건(구현 시 지킬 것): 보기 ID는 출제(세션)마다 서버가 발급하는 예측 불가능한 값이어야 하고, 문항 ID·보기 ID·보기
 * 위치에서 정답을 유추할 수 없어야 한다. (개발용 Mock은 보기 ID가 a~d 고정이고 정답 위치가 문항 순번에서 정해져 공개 ID로 정답을
 * 역산할 수 있다. 문항 은행이 개발 번들에 있는 Mock에서만 허용되며 API 구현체는 이를 따라 하면 안 된다.)
 * 제출이 "모르는 출제"(unknown-session)로 거절되면 같은 답안을 다시 보내도 소용없으므로, 화면은 새 출제로 처음부터 다시 시작한다.
 * 실제 API 계약(엔드포인트·응답 구조)은 아직 없다. 명세서의 "초보자 유형 설문"(POST /users/me/type-assessments,
 * GET .../latest)이 이 기능에 해당하는지도 확인되지 않아 연결하지 않는다.
 */
export interface AssessmentRepository {
  /** 'mock'이면 개발용 예시이며 화면에 그 사실을 표시한다. */
  readonly kind: 'mock' | 'api'

  /**
   * 이 계정의 응시 상태를 가져온다. 이미 완료했으면 결과를, 아니면 열려 있는 출제를 돌려준다.
   * 열려 있는 출제가 없으면 새로 만들고, 있으면 같은 출제를 다시 돌려준다(세션 안에서 고정). 여러 번 불러도 같은 결과다.
   */
  loadAttempt(): Promise<AssessmentAttempt>

  /**
   * 이 계정의 완료된 결과만 읽는다. 없으면 null이다. loadAttempt와 달리 출제를 만들거나 저장소에 아무것도 쓰지 않는다.
   * 마이페이지처럼 결과를 보여 주기만 하는 화면이 쓴다. 실제 API에서는 "가장 최근 결과 조회"에 해당한다(계약 미확정).
   * 저장된 값이 현재 문항 은행 버전·형식과 맞지 않으면 없는 것(null)으로 본다.
   */
  getResult(): Promise<AssessmentResult | null>

  /**
   * 답안을 채점하고 결과를 저장한다. 같은 출제에 여러 번 보내도 한 번만 채점하고 같은 결과를 돌려준다(멱등).
   * 모든 문항에 답하지 않았거나 문항에 없는 보기를 보내면 AssessmentSubmitError를 던진다.
   */
  submit(
    sessionId: string,
    answers: AssessmentAnswers,
  ): Promise<AssessmentResult>
}
