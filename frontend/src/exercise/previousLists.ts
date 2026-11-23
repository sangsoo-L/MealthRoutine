import type { DashboardSlot } from './exerciseDashboardTypes.ts'
import {
  buildSetSlides,
  describeSets,
  summarizeItems,
  type SetSlide,
} from './workoutListView.ts'
import type { RecordType } from './workoutDraftTypes.ts'
import type { LocalDate, WorkoutList, WorkoutRecord } from './workoutTypes.ts'

/**
 * W16 "이전 운동 리스트"의 표시 값을 만드는 순수 함수. 저장소 조회 결과(`listBefore`·`listByDateRange`)를 화면 상태로 바꾼다.
 * 지난 날짜에 **구성한 계획**(WorkoutList)만 다룬다. 실제 수행 결과가 아니며, 연결된 완료 기록은 W15 읽기 전용으로 가는 링크 정보로만 담는다.
 * 원본 목록을 바꾸거나 복제하지 않는다. 저장소·React를 부르지 않는다(조회는 usePreviousLists가 한다).
 */

export interface PreviousExerciseView {
  name: string
  recordType: RecordType
  /** 한 줄 요약(W01·W11과 같은 문구). 예: "10회 × 3세트" */
  detail: string
  /** 세트별 목표(W11 슬라이드와 같은 계산). 모든 세트가 같으면 한 장이다. */
  slides: readonly SetSlide[]
}

/** 목록에 연결된(sourceListId가 같은) 저장된 완료 기록. W15 읽기 전용으로 이동하는 데 쓴다. */
export interface PreviousRecordLink {
  recordId: string
  sessionId: string
  performedDate: LocalDate
  completedAt: string
}

export interface PreviousListView {
  id: string
  plannedDate: LocalDate
  /** 예: "푸시업 외 2개". 저장 모델에 목록 이름이 없어 첫 운동으로 만든다. */
  title: string
  exerciseCount: number
  setCount: number
  exercises: readonly PreviousExerciseView[]
  /** 연결된 완료 기록(완료 시각 최신순). 없으면 빈 배열이고 화면은 "저장한 수행 기록 보기"를 그리지 않는다. */
  records: readonly PreviousRecordLink[]
}

export interface PreviousDateGroup {
  date: LocalDate
  lists: readonly PreviousListView[]
}

export interface PreviousListsView {
  /** 계획 날짜 내림차순 날짜 그룹. 같은 날짜의 목록은 모두 들어 있다(저장 시각이 늦은 쪽이 먼저). */
  groups: readonly PreviousDateGroup[]
  listCount: number
  /** 읽을 수 없는 목록 수(손상·다른 계정). 정상 목록은 숨기지 않는다. */
  skippedCount: number
  /** 연결 기록을 조회하지 못했다. 목록은 보이고 "저장한 수행 기록 보기"만 없다. */
  recordsUnavailable: boolean
}

export interface PreviousListsQueryResult {
  items: readonly WorkoutList[]
  skippedCount: number
}

export interface PreviousRecordsQueryResult {
  items: readonly WorkoutRecord[]
  skippedCount: number
}

function byNewestList(a: WorkoutList, b: WorkoutList): number {
  if (a.plannedDate !== b.plannedDate)
    return a.plannedDate < b.plannedDate ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

function byNewestRecord(a: WorkoutRecord, b: WorkoutRecord): number {
  const diff = Date.parse(b.completedAt) - Date.parse(a.completedAt)
  if (diff !== 0) return diff
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/** 목록의 제목. 운동이 하나면 그 이름, 여럿이면 "첫 운동 외 N개". */
export function previousListTitle(list: WorkoutList): string {
  const first = list.items[0]?.exerciseNameSnapshot ?? '운동 목록'
  return list.items.length > 1
    ? `${first} 외 ${list.items.length - 1}개`
    : first
}

/**
 * 이전 운동 리스트의 영역 상태.
 * - 이 계정의 목록 중 계획 날짜가 오늘보다 이전인 것만 쓴다(오늘·내일·미래는 조회 범위와 무관하게 한 번 더 걸러 낸다).
 * - 다른 계정의 목록·기록이 섞여 와도 보이지 않는다. 목록은 읽을 수 없는 목록으로 세고, 기록은 연결하지 않는다.
 * - 연결 기록은 sourceListId로만 찾으며 이 계정의 기록만 쓴다. 기록 조회 결과가 null이면(조회 실패) 목록만 보이고 recordsUnavailable이 켜진다.
 * - 목록이 없으면 empty다(읽을 수 없는 목록만 있으면 ready + 건수).
 */
export function previousListsSlotFrom(
  lists: PreviousListsQueryResult,
  records: PreviousRecordsQueryResult | null,
  today: LocalDate,
  ownerId: string,
): DashboardSlot<PreviousListsView> {
  const owned = lists.items.filter((list) => list.ownerId === ownerId)
  const skippedCount = lists.skippedCount + (lists.items.length - owned.length)
  const past = owned
    .filter((list) => list.plannedDate < today)
    .sort(byNewestList)
  if (past.length === 0 && skippedCount === 0) return { status: 'empty' }

  const recordsByList = new Map<string, WorkoutRecord[]>()
  for (const record of records?.items ?? []) {
    if (record.ownerId !== ownerId) continue
    const bucket = recordsByList.get(record.sourceListId)
    if (bucket) bucket.push(record)
    else recordsByList.set(record.sourceListId, [record])
  }

  const groups: PreviousDateGroup[] = []
  for (const list of past) {
    const summary = summarizeItems(list.items)
    const view: PreviousListView = {
      id: list.id,
      plannedDate: list.plannedDate,
      title: previousListTitle(list),
      exerciseCount: summary.exerciseCount,
      setCount: summary.setCount,
      exercises: list.items.map((item) => ({
        name: item.exerciseNameSnapshot,
        recordType: item.recordType,
        detail: describeSets(item.recordType, item.sets),
        slides: buildSetSlides(item.recordType, item.sets),
      })),
      records: (recordsByList.get(list.id) ?? [])
        .toSorted(byNewestRecord)
        .map((record) => ({
          recordId: record.id,
          sessionId: record.sessionId,
          performedDate: record.performedDate,
          completedAt: record.completedAt,
        })),
    }
    const last = groups[groups.length - 1]
    if (last && last.date === list.plannedDate) {
      groups[groups.length - 1] = {
        date: last.date,
        lists: [...last.lists, view],
      }
    } else {
      groups.push({ date: list.plannedDate, lists: [view] })
    }
  }
  return {
    status: 'ready',
    data: {
      groups,
      listCount: past.length,
      skippedCount,
      recordsUnavailable: records === null,
    },
  }
}

/** 연결 기록을 조회할 날짜 범위. 가장 이른 계획 날짜부터 오늘까지(수행은 계획 날짜 이후에 시작한다). 목록이 없으면 null이다. */
export function linkedRecordRange(
  lists: readonly WorkoutList[],
  today: LocalDate,
): { from: LocalDate; to: LocalDate } | null {
  if (lists.length === 0) return null
  const from = lists.reduce(
    (min, list) => (list.plannedDate < min ? list.plannedDate : min),
    lists[0].plannedDate,
  )
  return from <= today ? { from, to: today } : null
}
