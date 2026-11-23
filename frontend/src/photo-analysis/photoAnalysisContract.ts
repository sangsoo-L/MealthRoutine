/**
 * 음식 사진 분석(I04·I04-1)이 서버와 주고받을 값의 모양. **확정된 API 계약이 아니다.**
 *
 * 관련 API(README의 API 인수인계 #59~61): `POST /api/v1/ai/food-analyses`(분석 요청), `GET /api/v1/ai/food-analyses/{jobId}`(상태·결과),
 * `PATCH /api/v1/ai/food-analyses/{jobId}/results/{resultId}`(후보 수정·확정). 이미지 업로드 방식과 비동기 작업 상태값은 아직 정의되지 않았다
 * (API 정책 문서 §4). 그래서 화면은 아래 `PhotoAnalysisSource`만 알고, 실제 요청·작업 조회·응답 변환은 이 인터페이스를 구현하는 쪽에 둔다.
 * 화면은 "사진을 주면 결과 또는 없음을 돌려주고, 실패하면 던진다"는 것만 가정한다(작업 ID·폴링·상태값은 구현 안에서 처리한다).
 *
 * 서버가 주지 않은 값은 화면이 만들지 않는다. 모든 영양 값은 null(정보 없음, 0이 아니다)일 수 있고, 합계도 서버가 준 값만 보인다(프론트엔드는 계산하지 않는다).
 * API 주소·환경변수 설정은 공통 API 클라이언트가 생길 때 함께 정한다(지금 이 프로젝트에는 API 호출 코드와 환경변수가 없다).
 */

export interface AnalyzedFood {
  name: string
  /** 추정 양 표현(예: "1공기"). 없으면 null. */
  amountText: string | null
  /** 추정 열량(kcal). 없으면 null이며 0이 아니다. */
  kcal: number | null
}

export interface PhotoAnalysisResult {
  foods: readonly AnalyzedFood[]
  /** 서버가 준 합계 열량. 없으면 null(화면이 foods를 더해 만들지 않는다). */
  totalKcal: number | null
  /** 한 줄 설명. 없으면 null. */
  summary: string | null
  /** 일부 음식을 인식하지 못했는지(성공한 항목은 그대로 보인다). */
  partial: boolean
  /** 개발 서버 전용 예시 결과 표지. 실제 서버 결과에는 없다. */
  example?: boolean
}

/**
 * 서버 연결 경계. 사진을 분석해 결과를 돌려준다. 음식을 하나도 찾지 못하면 null이다(오류가 아니다). 실패는 예외로 던진다.
 * 요청은 AbortSignal로 취소·이탈 때 중단할 수 있어야 한다.
 */
export interface PhotoAnalysisSource {
  analyze(photo: File, signal: AbortSignal): Promise<PhotoAnalysisResult | null>
}

/**
 * 서버가 "AI 사용 횟수 소진(또는 권한 없음)"으로 분석 요청을 거절했을 때 `analyze`가 던지는 오류.
 * 화면은 일반 실패와 달리 다시 시도를 숨기고 멤버십 안내(P03)를 보인다. 서버가 어떤 응답(상태 코드·오류 코드)으로 알리는지는 미정이며,
 * 그 응답을 이 오류로 바꾸는 일은 연결 구현(`PhotoAnalysisSource`)의 몫이다. 화면은 사용량을 계산하거나 판정하지 않는다.
 */
export class PhotoAnalysisQuotaError extends Error {
  constructor(message = 'AI 사용 횟수를 모두 사용했어요') {
    super(message)
    this.name = 'PhotoAnalysisQuotaError'
  }
}

/**
 * 연결된 서버 구현. 사진 분석 API가 확정되기 전이라 항상 null이다(연결 전).
 * null이면 분석을 시작할 수 없고 화면은 "연결 전"을 보인다. 가짜 결과를 만들지 않는다.
 */
export function createPhotoAnalysisSource(): PhotoAnalysisSource | null {
  return null
}

/**
 * 분석 요청의 화면 상태.
 * - idle: 아직 요청하지 않았다. analyzing: 분석 중이다. unavailable: 서버 연결 전이다.
 * - empty: 사진에서 음식을 찾지 못했다. error: 요청에 실패했다. ready: 결과를 받았다.
 * - exhausted: 서버가 사용 횟수 소진(또는 권한 없음)으로 거절했다(`PhotoAnalysisQuotaError`). 다시 시도는 없다.
 */
export type AnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing' }
  | { status: 'unavailable' }
  | { status: 'empty' }
  | { status: 'error' }
  | { status: 'exhausted' }
  | { status: 'ready'; result: PhotoAnalysisResult }

export const IDLE_ANALYSIS: AnalysisState = { status: 'idle' }
