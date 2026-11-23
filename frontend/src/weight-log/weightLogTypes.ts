/**
 * 월간 몸무게 기록의 타입. 화면·알림이 쓰는 값(WeightCheckStatus)에는 몸무게 수치가 없다.
 *
 * 몸무게 수치는 PIN 보호 대상이다(API 정책 문서 §3-3). 이 모듈의 인터페이스는 이력의 수치를 읽는 메서드를 두지 않는다.
 * PIN 인증 결과의 전달·검증 방식이 정해지면(API 정책 문서 §4) 인증 결과를 받는 별도 조회 메서드를 추가한다.
 */

/**
 * 기록 유형.
 * - initial: 이력이 비어 있을 때의 첫 기록
 * - recorded: 사용자가 몸무게를 입력한 기록
 * - same-as-last: 마지막 기록과 같은 값으로 다시 남긴 기록(저장소가 값을 복사한다. 화면은 이전 값을 읽지 않는다)
 */
export type WeightEntryKind = 'initial' | 'recorded' | 'same-as-last'

/** 이력의 한 줄. 수치를 담으므로 보호된 조회에서만 반환할 수 있다(지금은 반환하는 메서드가 없다). */
export interface WeightEntry {
  id: string
  /** 이 기록의 주인. 저장소가 계정별로 분리하고, 읽을 때도 다시 확인한다. */
  userId: string
  /** 서울 기준 달력 날짜 'YYYY-MM-DD' */
  recordedOn: string
  weightKg: number
  kind: WeightEntryKind
  /** ISO 8601. 같은 날 여러 건의 순서를 정한다. */
  createdAt: string
}

/**
 * 확인 필요 여부의 판단 이유.
 * - no-history: 이력이 없다. 기존 몸무게가 있어도 기록일을 알 수 없으므로 확인 안내를 만들지 않는다.
 * - not-due: 다음 확인일 전이다.
 * - due: 다음 확인일이 되었거나 지났다.
 * - future-date: 마지막 기록일이 오늘(서울)보다 늦다(기기 시계 오류 등). 다음 확인일을 계산하지 않는다.
 */
export type WeightCheckReason = 'no-history' | 'not-due' | 'due' | 'future-date'

/** 홈·알림이 읽는 값. 몸무게 수치가 없다. */
export interface WeightCheckStatus {
  /** 오늘(서울 기준). 판단에 쓴 날짜라 화면이 따로 계산하지 않아도 된다. */
  today: string
  lastRecordedOn: string | null
  /** 마지막 기록일의 달력 기준 1개월 뒤. 기록이 없거나 날짜가 잘못되면 null. */
  nextDueOn: string | null
  /** reason이 'due'일 때만 true. 알림을 읽거나 닫는 것으로는 바뀌지 않는다. */
  needsCheck: boolean
  reason: WeightCheckReason
  /**
   * 이력은 없는데 신체 정보에 유효한 몸무게가 있다(기록 날짜를 모르는 기존 값). 이력을 자동으로 만들지 않는다.
   * 이 값이 true여도 needsCheck는 false다.
   */
  legacyWeightUndated: boolean
  /**
   * 마지막 이력의 몸무게와 신체 정보의 현재 몸무게가 같은가(수치는 알리지 않는다).
   * 이력이 없으면 true. false이면 이력을 거치지 않고 몸무게가 바뀐 것이거나 기록 도중 일부만 저장된 것이다. 자동으로 고치지 않는다.
   */
  consistent: boolean
}

export type WeightLogInput = { weightKg: number } | { sameAsLast: true }

export type WeightLogErrorCode =
  /** 몸무게 값이 허용 범위(1~500kg, 소수점 첫째 자리)가 아니다 */
  | 'invalidWeight'
  /** 입력 형태가 잘못됐다 */
  | 'invalidInput'
  /** 기기 시각을 날짜로 바꿀 수 없다 */
  | 'invalidDate'
  /** "지난번과 같아요"인데 복사할 마지막 기록이 없다 */
  | 'noPrevious'
  /** 마지막 이력과 현재 몸무게가 달라 무엇을 복사해야 할지 알 수 없다 */
  | 'inconsistent'
  /** 이력을 저장하지 못했다. 기존 데이터는 그대로다 */
  | 'save'
  /** 저장 도중 일부만 반영됐고 되돌리지도 못했다. 수동 확인이 필요하다 */
  | 'partialSave'
  /** 저장된 이력이나 신체 정보가 손상됐다. 덮어쓰지 않는다 */
  | 'corrupt'
  | 'load'
  | 'unavailable'

/** 메시지에 몸무게 수치나 저장 내용을 담지 않는다. */
export class WeightLogError extends Error {
  readonly code: WeightLogErrorCode

  constructor(code: WeightLogErrorCode) {
    super(`weight log ${code}`)
    this.name = 'WeightLogError'
    this.code = code
  }
}

/**
 * 몸무게 기록의 데이터 경계. 화면은 이 인터페이스만 안다.
 * 구현은 계정 하나에 묶여 있고 다른 계정의 기록에 접근하지 않는다.
 */
export interface WeightLogRepository {
  /** 'mock'이면 개발용 저장소이며 개발 서버에서만 쓴다. */
  readonly kind: 'mock' | 'api'

  /** 마지막 기록일과 다음 확인일. 수치가 없다. 이력이 손상됐으면 'corrupt'를 던진다. */
  getCheckStatus(): Promise<WeightCheckStatus>

  /**
   * 새 기록을 이력에 추가하고 현재 몸무게를 같은 값으로 갱신한 뒤 저장 뒤의 상태를 돌려준다.
   * 같은 값이어도 새 이력을 추가한다. 기록일은 저장소가 서울 기준 오늘로 정한다(호출자가 날짜를 넘기지 않는다).
   * 실패하면 기존 이력·신체 정보는 그대로다. 일부만 반영되고 되돌리지 못하면 'partialSave'를 던지며 자동으로 고치지 않는다.
   * 운동 목표는 바꾸지 않는다.
   */
  logWeight(input: WeightLogInput): Promise<WeightCheckStatus>
}
