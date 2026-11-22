import type { SaveError } from '../../../exercise/useWorkoutListSave.ts'
import { summarizeItems } from '../../../exercise/workoutListView.ts'
import type { WorkoutList } from '../../../exercise/workoutTypes.ts'

/** W11이 이동하는 경로. 구성 수정은 W02, 방법 선택은 W12, 저장 뒤에는 W01로 간다. */
export const PATH_COMPOSE = '/records/exercise/compose'
export const PATH_METHOD = '/records/exercise/new'
export const PATH_DASHBOARD = '/records/exercise'

/** 저장된 목록의 요약 문구. 예: "운동 3개 · 8세트" */
export function listSummaryText(list: WorkoutList): string {
  const summary = summarizeItems(list.items)
  return `운동 ${summary.exerciseCount}개 · ${summary.setCount}세트`
}

/** 저장 실패 후 같은 버튼으로 다시 시도해도 되는 오류인지. 구성을 고쳐야 하는 오류는 아니다. */
export function isRetryable(error: SaveError | null): boolean {
  if (!error) return false
  if (error.kind === 'dateMismatch' || error.kind === 'invalid') return false
  return error.reason !== 'requestConflict' && error.reason !== 'invalidDraft'
}
