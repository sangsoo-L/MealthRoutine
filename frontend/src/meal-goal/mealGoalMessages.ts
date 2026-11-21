import { exerciseGoalMessage } from '../exercise-goal/exerciseGoalMessages.ts'
import { ExerciseGoalError } from '../exercise-goal/exerciseGoalTypes.ts'
import { MealGoalError } from './mealGoalTypes.ts'

/**
 * 식단 목표 화면의 오류 안내. 식단 목표 저장소의 오류는 여기서, PIN·신체 정보 오류(운동 목표 저장소가 던진다)는 운동 목표 문구에서
 * 식단 목표에 맞게 고쳐 쓴다. 사용자 수치·저장값은 문구에 담지 않는다.
 */
export function mealGoalMessage(error: unknown): string {
  if (error instanceof MealGoalError) {
    switch (error.code) {
      case 'unavailable':
        return '현재는 식단 목표를 연결할 수 없어요.'
      case 'load':
        return '식단 목표를 불러오지 못했어요. 목표가 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.'
      case 'save':
        return '저장하지 못했어요. 입력한 내용은 유지되며 기존 목표는 바뀌지 않았어요.'
      case 'corrupt':
        return '저장된 식단 목표를 읽을 수 없어요. 다른 값으로 덮어쓰지 않았어요.'
      case 'conflict':
        return '다른 화면에서 식단 목표가 바뀌었어요. 화면을 다시 불러온 뒤 확인해 주세요.'
      case 'policyPending':
        return '목표 계산 기준의 검증이 아직 끝나지 않아 지금은 식단 목표를 저장할 수 없어요.'
      case 'validation':
        return '입력한 식단 목표를 확인해 주세요.'
    }
  }
  if (error instanceof ExerciseGoalError) {
    // 신체 정보 저장·PIN 오류. 운동 목표 전용 문구를 식단 목표 맥락으로 바꾼다.
    if (error.code === 'validation')
      return '신체 정보를 확인해 주세요. 성인은 나이 18~100세, 키 100~230cm, 몸무게 25~250kg 범위에서 저장할 수 있어요.'
    if (error.code === 'contextChanged')
      return '신체 정보가 바뀌었어요. 화면을 다시 불러온 뒤 확인해 주세요.'
    if (error.code === 'unavailable')
      return '현재는 신체 정보를 연결할 수 없어요.'
  }
  return exerciseGoalMessage(error)
}
