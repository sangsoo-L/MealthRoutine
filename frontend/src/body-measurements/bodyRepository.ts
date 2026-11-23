import type { GoalAuthorization } from '../exercise-goal/exerciseGoalTypes.ts'
import type {
  BodyMeasurementInput,
  BodyMeasurementStatus,
  BodyMeasurementValues,
} from './bodyTypes.ts'

/** 저장이 거절된 이유 */
export type BodySaveErrorReason = 'invalid' | 'failed'

export class BodySaveError extends Error {
  readonly reason: BodySaveErrorReason

  constructor(reason: BodySaveErrorReason) {
    super(`body measurement save rejected: ${reason}`)
    this.name = 'BodySaveError'
    this.reason = reason
  }
}

/**
 * 신체 정보의 데이터 경계. 화면은 이 인터페이스만 안다.
 *
 * 보안 원칙(API 정책 문서 §3-3): 신체 정보 조회(GET /api/v1/health/measurements)는 2차 비밀번호(PIN) 인증 후에만 가능하도록 기획되어 있다.
 * 그래서 이 인터페이스는 실제 수치를 읽는 메서드를 두지 않는다. 화면(홈 안내, 마이페이지 마스킹)이 필요한 것은 "등록 여부"뿐이다.
 * PIN 확인 뒤 수치를 보여 주는 기능(P05)이 생기면 PIN 인증 결과를 받는 별도 조회 메서드를 추가한다. PIN 인증 결과의 전달·검증 방식은
 * 아직 미정의라서(API 정책 문서 §4의 12번) 지금은 만들지 않는다.
 *
 * 실제 API 계약(요청·응답 구조, 등록 여부를 수치 없이 알려 주는 방법)은 아직 없다. 개발 환경의 Mock 구현(mock/mockBodyRepository.ts)과
 * 나중에 만들 API 구현을 이 인터페이스로 교체한다.
 */
export interface BodyMeasurementRepository {
  /** 'mock'이면 개발용 저장소이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'api'

  /**
   * 이 계정의 키·몸무게 등록 여부. 값이 없거나 유효하지 않으면(0, 음수, NaN, 범위 밖) 등록되지 않은 것이다. 조회가 실패하면 예외를 던진다.
   */
  getStatus(): Promise<BodyMeasurementStatus>

  /**
   * 입력한 항목을 저장하고 저장 뒤의 등록 여부를 돌려준다. 입력하지 않은 항목은 기존 값을 그대로 둔다.
   * 유효하지 않은 값이면 BodySaveError('invalid'), 저장에 실패하면 BodySaveError('failed')를 던진다. 실패하면 아무것도 바뀌지 않는다.
   */
  save(input: BodyMeasurementInput): Promise<BodyMeasurementStatus>

  /**
   * 2차 비밀번호(PIN) 열람 권한으로 키·몸무게 수치를 읽는다(P05 확인 뒤 P01). 이 메서드가 이 인터페이스에서 수치를 읽는 유일한 길이다.
   * 구현은 호출 때마다 권한을 다시 확인해야 한다: 현재 계정의 권한인지, 만료되지 않았는지, 발급 뒤 PIN이 바뀌지 않았는지.
   * 어긋나면 `ExerciseGoalError('expired')`를 던지고 값을 돌려주지 않는다. 화면 상태(Provider)만으로 접근을 허용하지 않는다.
   * 실제 API 계약(PIN 인증 증명의 전달·검증 방식)은 아직 없어(API 정책 문서 §4의 12번) 개발용 Mock만 구현한다.
   */
  getMeasurements(access: GoalAuthorization): Promise<BodyMeasurementValues>
}
