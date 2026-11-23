import { WeightLogError } from './weightLogTypes.ts'

/**
 * 몸무게 기록 오류의 사용자 안내. 몸무게 수치나 저장 내용은 문구에 넣지 않는다.
 * partialSave는 성공처럼 들리지 않게 쓰고, 상태를 다시 확인하도록 안내한다.
 */
export function weightLogMessage(error: unknown): string {
  if (!(error instanceof WeightLogError))
    return '몸무게 기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
  switch (error.code) {
    case 'invalidWeight':
      return '몸무게는 1~500kg 사이에서 소수점 첫째 자리까지 입력해 주세요.'
    case 'invalidInput':
      return '입력을 확인해 주세요.'
    case 'invalidDate':
      return '기기의 날짜를 확인할 수 없어 기록하지 못했어요. 날짜 설정을 확인한 뒤 다시 시도해 주세요.'
    case 'noPrevious':
      return '이전 기록이 없어 같은 값으로 기록할 수 없어요. 몸무게를 직접 입력해 주세요.'
    case 'inconsistent':
      return '등록된 몸무게와 마지막 기록이 달라서 이 방법은 사용할 수 없어요. 현재 몸무게를 직접 입력해 주세요.'
    case 'save':
      return '저장하지 못했어요. 입력한 값은 그대로 있으니 다시 시도해 주세요.'
    case 'partialSave':
      return '기록이 일부만 저장됐을 수 있어요. 저장에 성공한 것이 아니니, 닫고 홈에서 안내를 다시 확인해 주세요.'
    case 'corrupt':
      return '저장된 몸무게 기록을 읽을 수 없어요. 다른 정보로 덮어쓰지 않았어요.'
    default:
      return '몸무게 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.'
  }
}
