import assert from 'node:assert/strict'
import test from 'node:test'
import {
  linkedRecordRange,
  previousListTitle,
  previousListsSlotFrom,
} from '../src/exercise/previousLists.ts'

// S8-4B: W16 이전 운동 리스트의 순수 로직(저장소 조회 결과 → 날짜 그룹·연결 기록). 지난 날짜의 "계획"만 다루며 완료 기록은 W15 링크 정보로만 쓴다.
// 저장소의 listBefore(IndexedDB 키 범위)는 Node에서 실행할 수 없어 Chrome 스크립트(w16-previous-lists)가 실제 IndexedDB로 검증한다.

const OWNER = 'user-a'
const TODAY = '2026-11-17'

const reps = (name, sets = [{ reps: 10 }, { reps: 10 }]) => ({
  exerciseId: `id-${name}`,
  exerciseNameSnapshot: name,
  recordType: 'reps',
  sets,
})

function list(id, plannedDate, over = {}) {
  const createdAt = over.createdAt ?? `${plannedDate}T08:00:00.000Z`
  return {
    id,
    ownerId: OWNER,
    schemaVersion: 1,
    plannedDate,
    items: [reps('푸시업'), reps('스쿼트', [{ reps: 12 }])],
    catalogVersion: 'test',
    revision: 1,
    requestId: `req-${id}`,
    createdAt,
    updatedAt: createdAt,
    ...over,
  }
}

function record(id, sourceListId, completedAt, over = {}) {
  return {
    id,
    ownerId: OWNER,
    schemaVersion: 1,
    sessionId: `session-${id}`,
    sourceListId,
    plannedDate: completedAt.slice(0, 10),
    performedDate: completedAt.slice(0, 10),
    startedAt: completedAt,
    completedAt,
    createdAt: completedAt,
    catalogVersion: 'test',
    exercises: [],
    totals: {
      exerciseCount: 1,
      completedSetCount: 1,
      plannedSetCount: 1,
      measuredMs: null,
    },
    ...over,
  }
}
const q = (items, skippedCount = 0) => ({ items, skippedCount })
const ids = (slot) => slot.data.groups.flatMap((g) => g.lists.map((l) => l.id))

test('날짜가 오늘보다 이전인 목록만, 날짜 내림차순으로 날짜별로 묶는다', () => {
  const slot = previousListsSlotFrom(
    q([
      list('old', '2026-11-01'),
      list('yday', '2026-11-16'),
      list('mid', '2026-11-10'),
    ]),
    q([]),
    TODAY,
    OWNER,
  )
  assert.equal(slot.status, 'ready')
  assert.deepEqual(
    slot.data.groups.map((g) => g.date),
    ['2026-11-16', '2026-11-10', '2026-11-01'],
  )
  assert.equal(slot.data.listCount, 3)
})

test('오늘·내일·미래 목록은 조회 결과에 섞여 와도 제외한다(날짜 미지정 값은 저장 모델에 없다)', () => {
  const slot = previousListsSlotFrom(
    q([
      list('today', TODAY),
      list('tomorrow', '2026-11-18'),
      list('future', '2027-01-01'),
      list('past', '2026-11-16'),
    ]),
    q([]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(ids(slot), ['past'])
})

test('같은 날짜에 목록이 여럿이면 모두 한 날짜 그룹에 나오고 나중에 저장한 목록이 먼저다', () => {
  const slot = previousListsSlotFrom(
    q([
      list('a', '2026-11-16', { createdAt: '2026-11-16T08:00:00.000Z' }),
      list('c', '2026-11-16', { createdAt: '2026-11-16T20:00:00.000Z' }),
      list('b', '2026-11-16', { createdAt: '2026-11-16T12:00:00.000Z' }),
    ]),
    q([]),
    TODAY,
    OWNER,
  )
  assert.equal(slot.data.groups.length, 1)
  assert.deepEqual(ids(slot), ['c', 'b', 'a'])
  assert.equal(slot.data.listCount, 3)
})

test('저장 시각이 같으면 id가 큰 쪽이 먼저(항상 같은 순서)', () => {
  const at = '2026-11-16T08:00:00.000Z'
  const slot = previousListsSlotFrom(
    q([
      list('a', '2026-11-16', { createdAt: at }),
      list('z', '2026-11-16', { createdAt: at }),
    ]),
    q([]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(ids(slot), ['z', 'a'])
})

test('계정 격리: 다른 계정의 목록은 보이지 않고 읽을 수 없는 목록 수로 센다', () => {
  const slot = previousListsSlotFrom(
    q(
      [
        list('mine', '2026-11-16'),
        list('theirs', '2026-11-16', { ownerId: 'user-b' }),
      ],
      1,
    ),
    q([]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(ids(slot), ['mine'])
  assert.equal(slot.data.skippedCount, 2)
})

test('계정 격리: 목록 id가 같아도 다른 계정의 기록은 연결하지 않는다', () => {
  const slot = previousListsSlotFrom(
    q([list('l1', '2026-11-16')]),
    q([
      record('mine', 'l1', '2026-11-16T10:00:00.000Z'),
      record('theirs', 'l1', '2026-11-16T11:00:00.000Z', { ownerId: 'user-b' }),
    ]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(
    slot.data.groups[0].lists[0].records.map((r) => r.recordId),
    ['mine'],
  )
})

test('연결 기록: sourceListId가 같은 기록만 붙고, 없으면 records가 비어 있다(링크를 그리지 않는다)', () => {
  const slot = previousListsSlotFrom(
    q([list('l1', '2026-11-16'), list('l2', '2026-11-15')]),
    q([
      record('r1', 'l1', '2026-11-16T10:00:00.000Z'),
      record('x', 'unknown', '2026-11-16T10:00:00.000Z'),
    ]),
    TODAY,
    OWNER,
  )
  const byId = Object.fromEntries(
    slot.data.groups.flatMap((g) => g.lists).map((l) => [l.id, l]),
  )
  assert.deepEqual(
    byId.l1.records.map((r) => r.sessionId),
    ['session-r1'],
  )
  assert.deepEqual(byId.l2.records, [])
})

test('연결 기록이 여러 개면 모두 접근할 수 있고 완료 시각이 늦은 쪽이 먼저다', () => {
  const slot = previousListsSlotFrom(
    q([list('l1', '2026-11-16')]),
    q([
      record('r1', 'l1', '2026-11-16T09:00:00.000Z'),
      record('r2', 'l1', '2026-11-17T01:00:00.000Z', {
        performedDate: '2026-11-16',
      }),
      record('r3', 'l1', '2026-11-16T15:00:00.000Z'),
    ]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(
    slot.data.groups[0].lists[0].records.map((r) => r.recordId),
    ['r2', 'r3', 'r1'],
  )
})

test('연결 기록 조회 실패(null)면 목록은 그대로 보이고 recordsUnavailable만 켜진다', () => {
  const slot = previousListsSlotFrom(
    q([list('l1', '2026-11-16')]),
    null,
    TODAY,
    OWNER,
  )
  assert.equal(slot.status, 'ready')
  assert.equal(slot.data.recordsUnavailable, true)
  assert.deepEqual(slot.data.groups[0].lists[0].records, [])
  const ok = previousListsSlotFrom(
    q([list('l1', '2026-11-16')]),
    q([]),
    TODAY,
    OWNER,
  )
  assert.equal(ok.data.recordsUnavailable, false)
})

test('목록 표시 값: 제목·운동 수·세트 수·세트별 목표 슬라이드', () => {
  const slot = previousListsSlotFrom(
    q([list('l1', '2026-11-16')]),
    q([]),
    TODAY,
    OWNER,
  )
  const view = slot.data.groups[0].lists[0]
  assert.equal(view.title, '푸시업 외 1개')
  assert.equal(view.exerciseCount, 2)
  assert.equal(view.setCount, 3)
  assert.equal(view.exercises[0].detail, '10회 × 2세트')
  assert.equal(view.exercises[0].slides.length, 1)
  assert.equal(view.exercises[0].slides[0].repeat, 2)
  assert.match(view.exercises[0].slides[0].spoken, /목표 10회/)
  assert.equal(
    previousListTitle(list('x', '2026-11-16', { items: [reps('플랭크')] })),
    '플랭크',
  )
})

test('세트마다 목표가 다르면 세트별 슬라이드로 펼친다', () => {
  const slot = previousListsSlotFrom(
    q([
      list('l1', '2026-11-16', {
        items: [reps('스쿼트', [{ reps: 10 }, { reps: 12 }, { reps: 8 }])],
      }),
    ]),
    q([]),
    TODAY,
    OWNER,
  )
  const slides = slot.data.groups[0].lists[0].exercises[0].slides
  assert.deepEqual(
    slides.map((s) => s.heading),
    ['1세트', '2세트', '3세트'],
  )
  assert.deepEqual(
    slides.map((s) => s.main),
    ['10', '12', '8'],
  )
})

test('빈 상태: 지난 목록이 없으면 empty(오늘·내일 목록만 있어도 empty)', () => {
  assert.deepEqual(previousListsSlotFrom(q([]), q([]), TODAY, OWNER), {
    status: 'empty',
  })
  assert.deepEqual(
    previousListsSlotFrom(
      q([list('t', TODAY), list('n', '2026-11-18')]),
      q([]),
      TODAY,
      OWNER,
    ),
    { status: 'empty' },
  )
})

test('손상 목록만 있으면 ready(0개 + 건수), 정상 목록이 있으면 손상 때문에 숨기지 않는다', () => {
  const corrupt = previousListsSlotFrom(q([], 2), q([]), TODAY, OWNER)
  assert.equal(corrupt.status, 'ready')
  assert.equal(corrupt.data.listCount, 0)
  assert.equal(corrupt.data.skippedCount, 2)
  const mixed = previousListsSlotFrom(
    q([list('ok', '2026-11-16')], 1),
    q([]),
    TODAY,
    OWNER,
  )
  assert.deepEqual(ids(mixed), ['ok'])
  assert.equal(mixed.data.skippedCount, 1)
})

test('입력 배열과 원본 목록을 바꾸지 않는다', () => {
  const lists = [list('a', '2026-11-01'), list('b', '2026-11-16')]
  const frozen = lists.map((l) => structuredClone(l))
  const input = q(lists)
  previousListsSlotFrom(input, q([]), TODAY, OWNER)
  assert.deepEqual(lists, frozen)
  assert.deepEqual(
    input.items.map((l) => l.id),
    ['a', 'b'],
  )
})

test('연결 기록 조회 범위: 가장 이른 계획 날짜부터 오늘까지, 목록이 없으면 null', () => {
  assert.equal(linkedRecordRange([], TODAY), null)
  assert.deepEqual(
    linkedRecordRange(
      [list('a', '2026-11-10'), list('b', '2026-11-01')],
      TODAY,
    ),
    { from: '2026-11-01', to: TODAY },
  )
  assert.equal(linkedRecordRange([list('f', '2027-01-01')], TODAY), null)
})
