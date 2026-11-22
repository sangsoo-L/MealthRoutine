import assert from 'node:assert/strict'
import test from 'node:test'
import { doneSessionByList } from '../src/exercise/dashboardRecords.ts'
import {
  PATH_MY_EXERCISE,
  PATH_PREVIOUS_LISTS,
  RECORD_PAGE_SIZE,
  completedRangeFrom,
  completedRecordsSlotFrom,
  nextVisibleCount,
  visibleRecordCount,
} from '../src/exercise/myExercise.ts'
import { selectTodayList } from '../src/exercise/workoutListView.ts'

// S8-4B: W10 나의 운동의 완료한 운동 기록·오늘 대표 목록 순수 로직(저장소 조회 결과 → 화면 영역 상태).
// 화면 렌더링은 myPreviousUi.test.mjs, 저장소(listBefore)와 실제 이동은 Chrome(w10-my-exercise·w16-previous-lists)이 맡는다.
// 최근 1년 범위·계정 격리·정렬의 기본 규칙은 W01과 같은 함수를 쓰므로 dashboardRecords.test.mjs와 겹치는 세부는 다시 검증하지 않는다.

const OWNER = 'user-a'
const TODAY = '2026-11-17'

function record(id, performedDate, over = {}) {
  const completedAt = over.completedAt ?? `${performedDate}T12:00:00.000Z`
  return {
    id,
    ownerId: OWNER,
    schemaVersion: 1,
    sessionId: `session-${id}`,
    sourceListId: `list-${id}`,
    plannedDate: performedDate,
    performedDate,
    startedAt: `${performedDate}T11:00:00.000Z`,
    completedAt,
    createdAt: completedAt,
    catalogVersion: 'test',
    exercises: [
      {
        exerciseId: 'squat',
        exerciseNameSnapshot: '스쿼트',
        recordType: 'reps',
        plannedSetCount: 1,
        completedSets: [
          {
            setNumber: 1,
            target: { reps: 10 },
            actualReps: 10,
            measuredMs: null,
          },
        ],
      },
    ],
    totals: {
      exerciseCount: 1,
      completedSetCount: 1,
      plannedSetCount: 1,
      measuredMs: null,
    },
    ...over,
  }
}
const result = (items, skippedCount = 0) => ({ items, skippedCount })

function list(id, plannedDate, createdAt, over = {}) {
  return {
    id,
    ownerId: OWNER,
    schemaVersion: 1,
    plannedDate,
    items: [],
    catalogVersion: 'test',
    revision: 1,
    requestId: `req-${id}`,
    createdAt,
    updatedAt: createdAt,
    ...over,
  }
}

test('경로: W10·W16 임시 확정 URL', () => {
  assert.equal(PATH_MY_EXERCISE, '/records/exercise/my')
  assert.equal(PATH_PREVIOUS_LISTS, '/records/exercise/previous')
})

test('범위: 조회 시작일은 W01 최근 기록과 같은 1년 전 같은 월·일', () => {
  assert.equal(completedRangeFrom('2026-11-17'), '2025-11-17')
  assert.equal(completedRangeFrom('2028-02-29'), '2027-02-28')
})

test('완료 기록: 완료 시각 최신순으로 전체를 만들고 세션 id를 담는다(건수 제한 없음)', () => {
  const items = Array.from({ length: 25 }, (_, i) =>
    record(`r${String(i).padStart(2, '0')}`, '2026-11-10', {
      completedAt: `2026-11-10T${String(i % 24).padStart(2, '0')}:${String(i).padStart(2, '0')}:00.000Z`,
    }),
  )
  const slot = completedRecordsSlotFrom(result(items), TODAY, OWNER)
  assert.equal(slot.status, 'ready')
  assert.equal(slot.data.items.length, 25)
  const times = slot.data.items.map((it) => it.id)
  const sorted = items
    .toSorted(
      (a, b) =>
        Date.parse(b.completedAt) - Date.parse(a.completedAt) ||
        b.id.localeCompare(a.id),
    )
    .map((r) => r.id)
  assert.deepEqual(times, sorted)
  assert.ok(slot.data.items.every((it) => it.sessionId === `session-${it.id}`))
})

test('완료 기록: 같은 날짜의 여러 기록이 각각 나오고 완료 시각이 늦은 쪽이 먼저다', () => {
  const slot = completedRecordsSlotFrom(
    result([
      record('a', '2026-11-16', { completedAt: '2026-11-16T09:00:00.000Z' }),
      record('b', '2026-11-16', { completedAt: '2026-11-16T20:00:00.000Z' }),
      record('c', '2026-11-16', { completedAt: '2026-11-16T14:00:00.000Z' }),
    ]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(
    slot.data.items.map((it) => it.id),
    ['b', 'c', 'a'],
  )
  assert.ok(slot.data.items.every((it) => it.performedDate === '2026-11-16'))
})

test('완료 기록: 같은 완료 시각이면 id가 큰 쪽이 먼저(항상 같은 순서)', () => {
  const at = '2026-11-16T09:00:00.000Z'
  const slot = completedRecordsSlotFrom(
    result([
      record('a', '2026-11-16', { completedAt: at }),
      record('z', '2026-11-16', { completedAt: at }),
    ]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(
    slot.data.items.map((it) => it.id),
    ['z', 'a'],
  )
})

test('완료 기록: 측정 시간은 있는 기록에만 값이 있고 없으면 null(0이 아니다)', () => {
  const timed = record('t', '2026-11-16', {
    totals: {
      exerciseCount: 1,
      completedSetCount: 1,
      plannedSetCount: 1,
      measuredMs: 65_000,
    },
    exercises: [
      {
        exerciseId: 'plank',
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        plannedSetCount: 1,
        completedSets: [
          { setNumber: 1, target: { targetSeconds: 60 }, measuredMs: 65_000 },
        ],
      },
    ],
  })
  const slot = completedRecordsSlotFrom(
    result([timed, record('n', '2026-11-15')]),
    TODAY,
    OWNER,
  )
  const byId = Object.fromEntries(slot.data.items.map((it) => [it.id, it]))
  assert.equal(byId.t.measuredMs, 65_000)
  assert.equal(byId.n.measuredMs, null)
})

test('완료 기록: 1년 경계(1년 전 같은 날 포함, 하루 전 제외)와 미래 날짜 제외', () => {
  const slot = completedRecordsSlotFrom(
    result([
      record('in', '2025-11-17'),
      record('out', '2025-11-16'),
      record('future', '2026-11-18'),
      record('today', '2026-11-17'),
    ]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(slot.data.items.map((it) => it.id).toSorted(), [
    'in',
    'today',
  ])
})

test('계정 격리: 다른 계정의 기록은 보이지 않고 읽을 수 없는 기록 수로 센다', () => {
  const slot = completedRecordsSlotFrom(
    result(
      [
        record('mine', '2026-11-16'),
        record('theirs', '2026-11-16', { ownerId: 'user-b' }),
      ],
      1,
    ),
    TODAY,
    OWNER,
  )
  assert.deepEqual(
    slot.data.items.map((it) => it.id),
    ['mine'],
  )
  assert.equal(slot.data.skippedCount, 2)
  // 다른 계정의 기록만 있으면 정상 기록이 없어도 비어 있다고 말하지 않는다(읽을 수 없는 기록 1건).
  const onlyOther = completedRecordsSlotFrom(
    result([record('theirs', '2026-11-16', { ownerId: 'user-b' })]),
    TODAY,
    OWNER,
  )
  assert.equal(onlyOther.status, 'ready')
  assert.equal(onlyOther.data.items.length, 0)
  assert.equal(onlyOther.data.skippedCount, 1)
})

test('빈 상태: 기록이 없으면 empty, 손상 기록만 있으면 ready(0건 + 건수)', () => {
  assert.deepEqual(completedRecordsSlotFrom(result([]), TODAY, OWNER), {
    status: 'empty',
  })
  const corrupt = completedRecordsSlotFrom(result([], 3), TODAY, OWNER)
  assert.equal(corrupt.status, 'ready')
  assert.equal(corrupt.data.items.length, 0)
  assert.equal(corrupt.data.skippedCount, 3)
})

test('손상 기록이 있어도 정상 기록은 숨기지 않는다', () => {
  const slot = completedRecordsSlotFrom(
    result([record('ok', '2026-11-16')], 2),
    TODAY,
    OWNER,
  )
  assert.equal(slot.data.items.length, 1)
  assert.equal(slot.data.skippedCount, 2)
})

test('20건 더 보기: 처음 20건, 누를 때마다 20건씩, 전체를 넘지 않는다', () => {
  assert.equal(RECORD_PAGE_SIZE, 20)
  assert.equal(visibleRecordCount(RECORD_PAGE_SIZE, 45), 20)
  assert.equal(nextVisibleCount(20, 45), 40)
  assert.equal(nextVisibleCount(40, 45), 45)
  assert.equal(nextVisibleCount(45, 45), 45)
  assert.equal(visibleRecordCount(20, 7), 7)
  assert.equal(visibleRecordCount(20, 0), 0)
  // 올바르지 않은 값은 기본 건수로 본다.
  assert.equal(visibleRecordCount(-5, 30), 20)
  assert.equal(visibleRecordCount(Number.NaN, 30), 20)
})

test('오늘 대표 목록: 같은 날짜에 여러 목록이면 가장 최근 저장본 하나(교체된 이전 목록은 대표가 아니다)', () => {
  const older = list('l1', TODAY, '2026-11-17T08:00:00.000Z')
  const newer = list('l2', TODAY, '2026-11-17T09:30:00.000Z')
  const yesterday = list('l0', '2026-11-16', '2026-11-16T23:00:00.000Z')
  const tomorrow = list('l3', '2026-11-18', '2026-11-17T10:00:00.000Z')
  assert.equal(
    selectTodayList([older, newer, yesterday, tomorrow], TODAY)?.id,
    'l2',
  )
  assert.equal(selectTodayList([newer, older], TODAY)?.id, 'l2')
  assert.equal(selectTodayList([yesterday, tomorrow], TODAY), null)
})

test('오늘 완료 기록 링크: 대표 목록의 오늘 기록만 연결한다(W10도 W01과 같은 함수)', () => {
  const records = [
    record('r1', TODAY, { sourceListId: 'l2' }),
    record('r2', '2026-11-16', { sourceListId: 'l2' }),
    record('r3', TODAY, { sourceListId: 'other', ownerId: 'user-b' }),
  ]
  const map = doneSessionByList(result(records), TODAY, OWNER)
  assert.equal(map.get('l2'), 'session-r1')
  assert.equal(map.has('other'), false)
})
