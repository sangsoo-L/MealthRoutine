import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import { PinConnectError } from './pinSource.ts'
import { PIN_MAX_ATTEMPTS, type PinFieldName } from './pinSettingsPolicy.ts'

/** 모의 모드(개발용 저장소, 5분 잠금)의 잠금 안내. P01(BodyInfoSummary)도 쓴다. */
export const PIN_LOCKED_MESSAGE =
  '확인이 5회 일치하지 않아 잠시 제한됐어요. 5분 뒤 다시 시도해 주세요.'

/**
 * 서버 모드의 잠금 안내(F4-D4). 해제 시각을 계산하지 않으므로 "10분 뒤"로 단정하지 않는다
 * (조회로 알게 된 잠금은 이미 몇 분 지났을 수 있다). 서버 잠금은 10분이다.
 */
export const PIN_SERVER_LOCKED_MESSAGE =
  '확인이 5회 일치하지 않아 잠겼어요. 잠금이 풀리면 다시 시도할 수 있어요(최대 10분).'

/** 잠금 오류인지(문구 대신 화면이 받은 잠금 안내를 쓰기 위해). 모의·서버 모두 `locked` 코드다. */
export function isPinLockedError(error: unknown): boolean {
  return error instanceof ExerciseGoalError && error.code === 'locked'
}

/** 서버 모드 전용 실패의 안내. 결과 미확인은 기존 `save` 문구("바뀌지 않았어요")를 쓰지 않는다(R4). */
function connectMessage(error: PinConnectError): string {
  switch (error.code) {
    case 'connection':
      return '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'
    case 'uncertainRegister':
      return '등록 결과를 확인하지 못했어요. 화면을 다시 열어 현재 상태를 확인해 주세요.'
    case 'uncertainChange':
      return '변경 결과를 확인하지 못했어요. 화면을 다시 열어 현재 상태를 확인해 주세요.'
    case 'rateLimited':
      return error.retryAfter === undefined
        ? '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.'
        : `요청이 너무 많아요. ${error.retryAfter}초 뒤 다시 시도해 주세요.`
  }
}

/** 저장소·서버 오류를 P11·P12의 안내 문구로 바꾼다. 입력한 번호는 문구에 담지 않는다. */
export function pinSettingsMessage(error: unknown): string {
  if (error instanceof PinConnectError) return connectMessage(error)
  if (!(error instanceof ExerciseGoalError))
    return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  switch (error.code) {
    case 'pinFormat':
      return '숫자 6자리로 입력해 주세요.'
    case 'pinMismatch':
      return '새 비밀번호 확인이 일치하지 않아요.'
    case 'pinSame':
      return '현재와 다른 새 비밀번호를 입력해 주세요.'
    case 'pinExists':
      return '이미 등록된 번호가 있어요. 변경 화면을 이용해 주세요.'
    case 'pinMissing':
      return '먼저 2차 비밀번호를 등록해 주세요.'
    case 'pinWrong': {
      // 남은 횟수를 알면 지금까지 틀린 횟수(n/5)를 보여 준다.
      const used =
        error.remaining === undefined
          ? null
          : PIN_MAX_ATTEMPTS - error.remaining
      return used === null
        ? '현재 2차 비밀번호가 일치하지 않아요.'
        : `현재 2차 비밀번호가 일치하지 않아요. (${used}/${PIN_MAX_ATTEMPTS})`
    }
    case 'locked':
      return PIN_LOCKED_MESSAGE
    case 'contextChanged':
      return '다른 곳에서 2차 비밀번호가 바뀌었어요. 화면을 다시 열어 확인해 주세요.'
    case 'save':
      return '저장하지 못했어요. 기존 2차 비밀번호는 바뀌지 않았어요.'
    case 'corrupt':
      return '저장된 정보를 읽을 수 없어요. 기존 정보를 바꾸지 않았어요.'
    case 'expired':
      return '열람 시간이 끝났어요. 2차 비밀번호를 다시 확인해 주세요.'
    case 'unavailable':
      return '현재는 2차 비밀번호를 연결할 수 없어요.'
    default:
      return '처리하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}

/** 오류가 가리키는 입력칸. 포커스를 보낼 곳이다. */
export function pinErrorField(error: unknown): PinFieldName {
  if (error instanceof ExerciseGoalError) {
    switch (error.code) {
      case 'pinWrong':
      case 'locked':
        return 'current'
      case 'pinMismatch':
        return 'confirm'
      default:
        return 'new'
    }
  }
  return 'new'
}
