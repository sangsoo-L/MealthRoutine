import { useCallback, useEffect, useMemo, useState } from 'react'
import type { DashboardSlot } from './exerciseDashboardTypes.ts'
import {
  linkedRecordRange,
  previousListsSlotFrom,
  type PreviousListsView,
  type PreviousRecordsQueryResult,
} from './previousLists.ts'
import { isWorkoutStoreError } from './workoutRepositories.ts'
import {
  createWorkoutListRepository,
  createWorkoutRecordRepository,
} from './workoutSource.ts'
import type { LocalDate } from './workoutTypes.ts'

interface Loaded {
  /** 어떤 계정·날짜·몇 번째 조회의 결과인지. 현재 키와 다르면 지난 조회의 값이라 쓰지 않는다. */
  key: string
  slot: DashboardSlot<PreviousListsView>
}

/**
 * W16 "이전 운동 리스트"의 데이터. 계획 날짜가 오늘보다 이전인 목록(listBefore)과, 그 목록에 연결된 저장된 완료 기록(listByDateRange)을 읽는다.
 *
 * - 읽기 전용이다. 목록·기록을 저장·수정·삭제·복제하지 않는다.
 * - 저장소가 없으면(운영 빌드·계정 없음) unavailable(준비 중). 조회 중 loading, 목록 조회 실패 error(reload로 다시 시도).
 *   이 브라우저가 IndexedDB를 쓸 수 없으면 오류가 아니라 unavailable이다.
 * - 연결 기록 조회만 실패하면 목록은 그대로 보이고 기록 링크만 없다(정상 목록을 숨기지 않는다).
 * - 계정·날짜가 바뀌면 지난 값을 버리고 다시 조회한다. 저장소는 계정 id로만 만들고, 순수 함수가 다른 계정의 값을 한 번 더 걸러 낸다.
 */
export function usePreviousLists(
  userId: string | null,
  today: LocalDate,
): { slot: DashboardSlot<PreviousListsView>; reload: () => void } {
  const [attempt, setAttempt] = useState(0)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const lists = useMemo(
    () => (userId ? createWorkoutListRepository(userId) : null),
    [userId],
  )
  const records = useMemo(
    () => (userId ? createWorkoutRecordRepository(userId) : null),
    [userId],
  )
  const key = `${userId ?? ''}#${today}#${attempt}`

  useEffect(() => {
    if (!lists || !records || !userId) return
    let cancelled = false
    async function load(): Promise<DashboardSlot<PreviousListsView>> {
      if (!lists || !records || !userId) return { status: 'unavailable' }
      const found = await lists.listBefore(today)
      const past = found.items.filter(
        (list) => list.ownerId === userId && list.plannedDate < today,
      )
      const range = linkedRecordRange(past, today)
      let linked: PreviousRecordsQueryResult | null = {
        items: [],
        skippedCount: 0,
      }
      if (range) {
        try {
          linked = await records.listByDateRange(range.from, range.to)
        } catch {
          linked = null
        }
      }
      return previousListsSlotFrom(found, linked, today, userId)
    }
    load().then(
      (slot) => {
        if (!cancelled) setLoaded({ key, slot })
      },
      (error: unknown) => {
        if (cancelled) return
        const unavailable =
          isWorkoutStoreError(error) && error.reason === 'unavailable'
        setLoaded({
          key,
          slot: { status: unavailable ? 'unavailable' : 'error' },
        })
      },
    )
    return () => {
      cancelled = true
    }
  }, [lists, records, userId, today, key])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const slot: DashboardSlot<PreviousListsView> =
    !lists || !records
      ? { status: 'unavailable' }
      : loaded && loaded.key === key
        ? loaded.slot
        : { status: 'loading' }
  return { slot, reload }
}
