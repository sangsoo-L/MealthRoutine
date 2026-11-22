/**
 * 운동·식단 이해도 확인(최초 회원가입 후 지식 진단)의 타입.
 *
 * 이 기능은 정답이 있는 별도의 평가이며 의료적 진단이 아니다. A02 초기설문(목표·생활환경 프로필 설문),
 * 서비스 내 운동·식단 학습 퀴즈(H02)와 데이터·평가·화면을 공유하지 않는다.
 *
 * 이 파일의 타입은 "화면이 받는 데이터"만 담는다. 정답·해설·난이도처럼 채점에 쓰는 데이터는
 * 서버(개발 환경에서는 mock/)만 알며 화면 코드에는 존재하지 않는다.
 * 실제 API 응답 구조는 아직 확정되지 않았으므로 이 타입은 화면이 필요로 하는 값만 담은 임시 형태다.
 */

/** 평가 영역 */
export type AssessmentDomain = 'exercise' | 'meal'

/**
 * 이해도 단계 코드. 내부에서는 이 영문 코드로만 관리하고 한국어 표시는 assessmentLabels.ts가 맡는다.
 * (P01 마이페이지의 KnowledgeTier와 같은 코드 값이지만 도메인을 나누려고 따로 정의했다.)
 */
export type AssessmentLevelCode = 'beginner' | 'intermediate' | 'advanced'

export interface PublicChoice {
  /** 문항 안에서 고유한 보기 ID. 정답 판정은 보기 위치가 아니라 이 ID로 한다. */
  id: string
  label: string
}

/** 화면에 내려가는 문항. 정답·해설·난이도·세부 주제는 포함하지 않는다. */
export interface PublicQuestion {
  id: string
  domain: AssessmentDomain
  prompt: string
  /** 사용자(세션)별로 섞인 순서 */
  choices: readonly PublicChoice[]
}

/** 출제 결과. 한 번 만들어지면 세션 안에서 문항·보기 순서가 고정된다. */
export interface AssessmentSession {
  sessionId: string
  /** 사용자(세션)별로 섞인 순서 */
  questions: readonly PublicQuestion[]
}

/** 문항 ID → 고른 보기 ID */
export type AssessmentAnswers = Readonly<Record<string, string>>

/** 채점 결과. 정답·해설은 담지 않고 영역별 단계만 담는다. */
export interface AssessmentResult {
  sessionId: string
  exercise: AssessmentLevelCode
  meal: AssessmentLevelCode
  /** ISO 8601 */
  completedAt: string
}

/** 이 계정의 응시 상태. 재응시는 지원하지 않으므로 완료되면 결과만 조회한다. */
export type AssessmentAttempt =
  | { state: 'open'; session: AssessmentSession }
  | { state: 'completed'; result: AssessmentResult }
