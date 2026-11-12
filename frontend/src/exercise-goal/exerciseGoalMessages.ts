import { ExerciseGoalError } from './exerciseGoalTypes.ts'

export function exerciseGoalMessage(error: unknown): string {
  if (!(error instanceof ExerciseGoalError))
    return '정보를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  switch (error.code) {
    case 'pinFormat':
      return '2차 비밀번호는 숫자 6자리로 입력해 주세요.'
    case 'pinMismatch':
      return '두 비밀번호가 일치하지 않아요.'
    case 'pinWrong':
      return '비밀번호가 일치하지 않아요. 5회 틀리면 5분 동안 확인할 수 없어요.'
    case 'locked':
      return '비밀번호 확인이 5분 동안 제한돼요. 잠시 후 다시 시도해 주세요.'
    case 'pinExists':
      return '이미 등록된 비밀번호가 있어요. 기존 비밀번호로 확인해 주세요.'
    case 'pinMissing':
      return '먼저 2차 비밀번호를 등록해 주세요.'
    case 'expired':
      return '열람 시간이 끝났어요. 2차 비밀번호를 다시 확인해 주세요.'
    case 'save':
      return '저장하지 못했어요. 입력한 내용은 유지되며 기존 목표는 바뀌지 않았어요.'
    case 'corrupt':
      return '저장된 정보를 읽을 수 없어요. 다른 정보로 덮어쓰지 않았어요.'
    case 'contextChanged':
      return '건강 목표나 신체 정보가 바뀌었어요. 화면을 다시 불러온 뒤 목표를 확인해 주세요.'
    case 'validation':
      return '목적·목표 체중·신체 정보를 확인해 주세요.'
    case 'unavailable':
      return '현재는 목표 설정을 연결할 수 없어요.'
    default:
      return '정보를 불러오지 못했어요. 다시 시도해 주세요.'
  }
}
