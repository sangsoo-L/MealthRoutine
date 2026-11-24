/**
 * 신체 정보(키·몸무게)의 타입.
 *
 * 화면이 필요로 하는 값만 담은 형태다. 서버 계약(`/api/v1/health/*`)과의 변환은 `serverBodySource.ts`가 한다(F5).
 * 신체 정보 조회는 2차 비밀번호(PIN) 인증 후에만 가능해, 화면은 PIN 없이 수치를 읽지 않는다.
 * 모의 모드는 "등록 여부"(BodyMeasurementStatus)를 알고, 실제 모드는 등록 여부도 모른다(`protected`).
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

/**
 * PIN 열람 권한으로 읽은 신체 수치(P05 확인 뒤 P01). 등록되지 않았거나 유효하지 않은 항목은 null이다.
 * 이 값은 화면의 메모리에만 두고 열람 권한이 끝나면 곧바로 버린다(저장·URL·라우터 state·로그에 넣지 않는다).
 */
export interface BodyMeasurementValues {
  heightCm: number | null
  weightKg: number | null
}

/** 저장 요청. 입력한 항목만 담는다(이미 등록된 항목은 보내지 않는다). */
export interface BodyMeasurementInput {
  heightCm?: number
  weightKg?: number
}

/**
 * 서버가 계산한 지표(`GET /api/v1/health/metrics`, F5-D2·D3). PIN 확인 뒤 열람 중에만 화면 메모리에 있다.
 * 키·몸무게는 각각 가장 최근 값이다(서로 다른 측정일 수 있다). BMI·BMR·TDEE는 서버 계산 추정값이며 프론트에서 다시 계산하지 않는다.
 * - missingFields: 계산에 필요한데 없는 입력(heightCm·weightKg·birthDate·gender 중)
 * - notCalculableFields: 입력은 다 있지만 계산할 수 없는 값(bmr·tdee). 0은 정상 계산 결과일 수 있다(HEALTH8-16)
 */
export interface BodyServerMetrics {
  bmi: number | null
  bmr: number | null
  tdee: number | null
  missingFields: readonly string[]
  notCalculableFields: readonly string[]
}

/**
 * 등록 여부를 불러오는 상태.
 * - loading: 불러오는 중
 * - error: 불러오지 못함(신체 정보 누락으로 보지 않는다)
 * - unavailable: 조회 수단이 없음(모의 모드의 연결 전 재현 등. 누락으로 보지 않는다)
 * - protected: 서버 연결(실제 모드). 서버에는 PIN 없이 등록 여부를 알려 주는 API가 없어(HEALTH8-15) 등록 여부를 모른다.
 *   누락으로 보지 않고, 저장한 뒤에도 등록 여부를 추측하지 않는다(F5-D1). 저장은 할 수 있다.
 * - ready: 조회를 마침. height·weight 중 하나라도 false면 누락이다.
 */
export type BodyMeasurementState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'protected' }
  | { status: 'ready'; value: BodyMeasurementStatus }

/**
 * 화면용 저장 결과(F5 계획 8.8.3). 상태 훅의 `save`가 돌려주고 입력 폼·P01·P06·홈 카드가 받는다.
 * 모의 저장소의 계약(`BodyMeasurementRepository.save`)은 바꾸지 않고 훅이 감싼다.
 * - stale: 응답이 왔을 때 이미 다른 로그인 작업이거나 화면이 바뀌었다. 아무것도 반영하지 않는다.
 * - saved / invalid(서버·저장소가 값을 거절) / failed(저장되지 않음) / uncertain(서버가 저장했는지 알 수 없음. 다시 보내지 않는다)
 * - isCurrent: **반영하기 바로 앞에서** 다시 부른다. 훅이 결과를 돌려준 뒤에도 await 사이에 로그인이 바뀔 수 있다.
 */
export type BodySaveOutcome =
  | { kind: 'stale' }
  | {
      kind: 'saved' | 'invalid' | 'failed' | 'uncertain'
      isCurrent: () => boolean
    }

/** 지금 반영해도 되는 결과인지(stale이 아니고 시작 때의 작업이 아직 유효). 부작용 바로 앞에서 부른다. */
export function isLiveSaveOutcome(
  outcome: BodySaveOutcome,
): outcome is Exclude<BodySaveOutcome, { kind: 'stale' }> {
  return outcome.kind !== 'stale' && outcome.isCurrent()
}

/** 누락된 항목이 하나라도 있는가(조회를 마친 상태에서만 true가 될 수 있다). */
export function hasMissingBodyInfo(state: BodyMeasurementState): boolean {
  return (
    state.status === 'ready' && (!state.value.height || !state.value.weight)
  )
}
