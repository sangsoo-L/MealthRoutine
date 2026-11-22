import {
  selectRecentRecords,
  selectWeeklyExercise,
} from './dashboardSelectors.ts'
import type {
  DashboardSlot,
  RecentRecordsView,
  WeeklyExerciseView,
} from './exerciseDashboardTypes.ts'
import { isLocalDate, toLocalDate } from './workoutModel.ts'
import type { LocalDate, WorkoutRecord } from './workoutTypes.ts'

/**
 * W01의 주간 활동·최근 기록·오늘 완료 기록 연결에 쓰는 순수 함수. 저장소 조회 결과(`listByDateRange`)를 화면 영역의 상태로 바꾼다.
 * 집계·정렬은 기존 `dashboardSelectors`를 그대로 쓰고, 여기서는 범위(최근 1년)와 계정 확인, 상세 링크 대상 선택만 더한다.
 * 저장소·React를 부르지 않는다(조회는 useDashboardRecords가 한다).
 */

/** 최근 운동 기록에 보여 주는 최대 건수. */
export const RECENT_RECORD_LIMIT = 3

/** 저장소 조회 결과의 모양(ListQueryResult와 같다). */
export interface RecordQueryResult {
  items: readonly WorkoutRecord[]
  skippedCount: number
}

/**
 * 최근 기록의 조회 시작일(포함): 오늘과 월·일이 같은 1년 전. 1년 전 같은 날이 없으면(윤일) 그 달의 마지막 날이다.
 * 날짜는 기기 로컬 날짜로 계산한다(UTC로 해석하지 않는다).
 */
export function recentRangeFrom(today: LocalDate): LocalDate {
  if (!isLocalDate(today)) throw new RangeError('Invalid local date')
  const [year, month, day] = today.split('-').map(Number)
  const sameDay = new Date(year - 1, month - 1, day, 12)
  const target =
    sameDay.getMonth() === month - 1
      ? sameDay
      : new Date(year - 1, month, 0, 12) // 윤일: 2월 29일 → 2월 28일
  return toLocalDate(target)
}

/** 이 계정의 기록만 남긴다. 다른 계정의 기록이 섞여 오면 보여 주지 않고 읽을 수 없는 기록으로 센다. */
function ownedOnly(
  result: RecordQueryResult,
  ownerId: string,
): { items: readonly WorkoutRecord[]; skippedCount: number } {
  const items = result.items.filter((record) => record.ownerId === ownerId)
  return {
    items,
    skippedCount: result.skippedCount + (result.items.length - items.length),
  }
}

/** 이번 주(월~일) 활동. 현재 주간 밖의 기록은 집계에 들어가지 않는다. 같은 날 여러 건은 활동일 1일이다. */
export function weeklySlotFrom(
  result: RecordQueryResult,
  today: LocalDate,
  ownerId: string,
): DashboardSlot<WeeklyExerciseView> {
  const { items, skippedCount } = ownedOnly(result, ownerId)
  return {
    status: 'ready',
    data: selectWeeklyExercise(items, today, skippedCount),
  }
}

/**
 * 최근 운동 기록: 최근 1년(오늘 포함) 안의 완료 기록을 완료 시각 최신순으로 최대 RECENT_RECORD_LIMIT건.
 * 조회 범위와 같은 범위를 한 번 더 적용해, 범위 밖 기록이 섞여도 보이지 않게 한다. 기록이 없으면 empty다(읽을 수 없는 기록만 있으면 ready).
 * 각 항목에 W15 읽기 전용 화면으로 가는 세션 id를 담는다(저장된 완료 기록만 입력으로 받으므로 진행 중 세션·저장 전 결과는 들어올 수 없다).
 */
export function recentSlotFrom(
  result: RecordQueryResult,
  today: LocalDate,
  ownerId: string,
): DashboardSlot<RecentRecordsView> {
  const from = recentRangeFrom(today)
  const { items, skippedCount } = ownedOnly(result, ownerId)
  const inRange = items.filter(
    (record) => record.performedDate >= from && record.performedDate <= today,
  )
  if (inRange.length === 0 && skippedCount === 0) return { status: 'empty' }
  const view = selectRecentRecords(inRange, RECENT_RECORD_LIMIT, skippedCount)
  const sessionById = new Map(inRange.map((r) => [r.id, r.sessionId]))
  return {
    status: 'ready',
    data: {
      ...view,
      items: view.items.map((item) => ({
        ...item,
        sessionId: sessionById.get(item.id),
      })),
    },
  }
}

/**
 * 오늘(기기 로컬 날짜) 완료한 기록의 "목록 id → 세션 id". 같은 목록의 기록이 둘이면 완료 시각이 늦은 쪽이다.
 * W01의 오늘의 운동이 보여 주는 목록과 같은 목록의 기록만 상세로 연결하려고 목록 id로 찾는다(다른 목록의 기록으로 잘못 연결하지 않는다).
 */
export function doneSessionByList(
  result: RecordQueryResult,
  today: LocalDate,
  ownerId: string,
): ReadonlyMap<string, string> {
  const latest = new Map<string, WorkoutRecord>()
  for (const record of ownedOnly(result, ownerId).items) {
    if (record.performedDate !== today) continue
    const current = latest.get(record.sourceListId)
    if (
      !current ||
      Date.parse(record.completedAt) > Date.parse(current.completedAt) ||
      (Date.parse(record.completedAt) === Date.parse(current.completedAt) &&
        record.id > current.id)
    ) {
      latest.set(record.sourceListId, record)
    }
  }
  return new Map([...latest].map(([listId, r]) => [listId, r.sessionId]))
}
