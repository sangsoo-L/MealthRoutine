/**
 * 신체 정보(키·몸무게)의 타입.
 *
 * 실제 API(`POST/GET /api/v1/health/measurements`)의 요청·응답 구조는 확정되지 않았다(api-policy.md §4). 이 타입은 화면이 필요로 하는
 * 값만 담은 임시 형태다. 신체 정보 조회(GET)는 2차 비밀번호(PIN) 인증 후에만 가능하도록 기획되어 있어, 화면은 실제 수치를 읽지 않고
 * "등록 여부"(BodyMeasurementStatus)만 안다. 값은 저장소 안에서만 존재한다.
 */

/** 저장되는 신체 정보. 저장소(서버)만 가진다. 화면 코드는 이 값을 읽지 않는다. */
export interface BodyMeasurements {
  /** 키(cm) */
  heightCm: number
  /** 몸무게(kg) */
  weightKg: number
  /** ISO 8601 */
  updatedAt: string
}

/**
 * 등록 여부. 값이 없거나 유효하지 않으면(0, 음수, NaN, 범위 밖) 등록되지 않은 것으로 본다.
 * 수치를 담지 않으므로 이 값은 PIN 없이 읽어도 신체 정보가 노출되지 않는다.
 */
export interface BodyMeasurementStatus {
  height: boolean
  weight: boolean
}

/** 저장 요청. 입력한 항목만 담는다(이미 등록된 항목은 보내지 않는다). */
export interface BodyMeasurementInput {
  heightCm?: number
  weightKg?: number
}

/**
 * 등록 여부를 불러오는 상태.
 * - loading: 불러오는 중
 * - error: 불러오지 못함(신체 정보 누락으로 보지 않는다)
 * - unavailable: 조회 수단이 없음(운영 빌드, API 연결 전. 누락으로 보지 않는다)
 * - ready: 조회를 마침. height·weight 중 하나라도 false면 누락이다.
 */
export type BodyMeasurementState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; value: BodyMeasurementStatus }

/** 누락된 항목이 하나라도 있는가(조회를 마친 상태에서만 true가 될 수 있다). */
export function hasMissingBodyInfo(state: BodyMeasurementState): boolean {
  return (
    state.status === 'ready' && (!state.value.height || !state.value.weight)
  )
}
