import { summarizeItems } from './workoutListView.ts'
import type { WorkoutListItem } from './workoutTypes.ts'

const createdFormat = new Intl.DateTimeFormat('ko-KR', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
})

/** 등록 날짜 표시("2026. 11. 18. 등록"). 시각을 알 수 없으면 "등록일 미확인"이다(없는 날짜를 만들지 않는다). */
export function routineCreatedLabel(createdAt: string): string {
  const date = new Date(createdAt)
  return Number.isNaN(date.getTime())
    ? '등록일 미확인'
    : `${createdFormat.format(date)} 등록`
}

/** "운동 3개 · 6세트". */
export function routineSummaryText(
  items: readonly Pick<WorkoutListItem, 'recordType' | 'sets'>[],
): string {
  const summary = summarizeItems(items)
  return `운동 ${summary.exerciseCount}개 · ${summary.setCount}세트`
}
