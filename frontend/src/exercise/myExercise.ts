import { recentRangeFrom } from './dashboardRecords.ts'
import { selectRecentRecords } from './dashboardSelectors.ts'
import type {
  DashboardSlot,
  RecentRecordsView,
  TodayExerciseView,
} from './exerciseDashboardTypes.ts'
import type { LocalDate, WorkoutRecord } from './workoutTypes.ts'

/**
 * W10 "나의 운동"의 완료한 운동 기록 영역에 쓰는 순수 함수. 저장소 조회 결과(`listByDateRange`)를 화면 상태로 바꾼다.
 * 집계·정렬·요약 문구는 W01과 같은 `selectRecentRecords`를 쓰고, 여기서는 범위(최근 1년)·계정 확인·표시 건수만 더한다.
 * 저장소·React를 부르지 않는다(조회는 useCompletedRecords가 한다).
 */

/** W10 나의 운동의 경로(임시 확정). W15(완료 기록 상세)의 "이전"이 이 화면으로 돌아오도록 `state.from`에 넘긴다. */
export const PATH_MY_EXERCISE = '/records/exercise/my'
/** W16 이전 운동 리스트의 경로(임시 확정). */
export const PATH_PREVIOUS_LISTS = '/records/exercise/previous'

/** W10 하단 이동 링크 중 어느 것을 그릴지. 오늘의 운동 카드가 이미 같은 곳(W12 운동 목록 구성 방법 선택)으로 가는 링크를 그리면 같은 동작의 링크를 한 번 더 두지 않는다. */
export interface MyNavLinks {
  /** "새 운동 목록 만들기"(W12). */
  create: boolean
  /** "이전 운동 리스트 보기"(W16). */
  previous: boolean
}

/**
 * W10 하단 이동 링크 결정(순수 함수).
 * - 저장소가 없거나 이 브라우저에서 쓸 수 없으면(오늘의 운동 영역이 unavailable) 저장된 목록·기록이 없어 쓸 수 없는 이동이므로 두 링크 모두 그리지 않는다.
 *   (카드의 "운동 목록 만들기"는 비활성 버튼과 이유 안내가 대신한다. W01 "전체 기록 보기"를 숨기는 규칙과 같다.)
 * - 오늘의 운동 카드는 운동 목록이 없고 초안도 없을 때 "운동 목록 만들기"(empty), 오늘 계획 목록이 있을 때 "목록 다시 구성하기"(planned)로
 *   W12에 이미 연결한다. 이때는 "새 운동 목록 만들기"를 중복으로 두지 않는다. 불러오는 중에는 카드가 아직 링크를 그리지 않았으므로 자리가
 *   뒤늦게 사라져 화면이 움직이지 않도록 이 링크를 그리지 않는다. 오늘 운동을 마쳤거나 초안을 이어 구성하는 카드이거나 조회가 실패했을 때만 둔다.
 */
export function myNavLinks(
  today: DashboardSlot<TodayExerciseView>,
  draftCount: number,
): MyNavLinks {
  if (today.status === 'unavailable') return { create: false, previous: false }
  const cardLinksToCreate =
    (today.status === 'ready' && today.data.phase === 'planned') ||
    (today.status === 'empty' && draftCount === 0)
  return {
    create: today.status !== 'loading' && !cardLinksToCreate,
    previous: true,
  }
}

/** 한 번에 보여 주는 완료 기록 건수. "더 보기"를 누를 때마다 이만큼 늘어난다. */
export const RECORD_PAGE_SIZE = 20

/** 완료 기록의 조회 시작일(포함). W01 최근 기록과 같은 "오늘과 월·일이 같은 1년 전"이다. */
export function completedRangeFrom(today: LocalDate): LocalDate {
  return recentRangeFrom(today)
}

/** 저장소 조회 결과의 모양(ListQueryResult와 같다). */
export interface CompletedQueryResult {
  items: readonly WorkoutRecord[]
  skippedCount: number
}

/**
 * 완료한 운동 기록: 최근 1년(오늘 포함) 안의 완료 기록 전체를 완료 시각 최신순으로 만든다(건수 제한 없음, 화면이 나눠 보여 준다).
 * - 이 계정의 기록만 남긴다. 다른 계정의 기록이 섞여 오면 보이지 않고 읽을 수 없는 기록으로 센다.
 * - 조회 범위와 같은 범위를 한 번 더 적용해, 범위 밖(미래 포함) 기록이 섞여도 보이지 않게 한다.
 * - 기록이 없으면 empty다(읽을 수 없는 기록만 있으면 ready + 건수).
 * - 입력은 저장된 완료 기록뿐이라 진행 중인 세션·저장 전 결과는 들어올 수 없다.
 * 각 항목에 W15 읽기 전용 화면으로 가는 세션 id를 담는다.
 */
export function completedRecordsSlotFrom(
  result: CompletedQueryResult,
  today: LocalDate,
  ownerId: string,
): DashboardSlot<RecentRecordsView> {
  const from = completedRangeFrom(today)
  const owned = result.items.filter((record) => record.ownerId === ownerId)
  const skippedCount =
    result.skippedCount + (result.items.length - owned.length)
  const inRange = owned.filter(
    (record) => record.performedDate >= from && record.performedDate <= today,
  )
  if (inRange.length === 0 && skippedCount === 0) return { status: 'empty' }
  const view = selectRecentRecords(inRange, inRange.length, skippedCount)
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

/** 지금까지 보여 줄 건수가 전체를 넘지 않게 맞춘다. */
export function visibleRecordCount(shown: number, total: number): number {
  const safe = Number.isInteger(shown) && shown > 0 ? shown : RECORD_PAGE_SIZE
  return Math.min(safe, total)
}

/** "더 보기"를 누른 뒤 보여 줄 건수(RECORD_PAGE_SIZE씩 늘고 전체를 넘지 않는다). */
export function nextVisibleCount(shown: number, total: number): number {
  return visibleRecordCount(shown + RECORD_PAGE_SIZE, total)
}
