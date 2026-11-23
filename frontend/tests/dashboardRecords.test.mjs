import assert from 'node:assert/strict'
import test from 'node:test'
import {
  RECENT_RECORD_LIMIT,
  doneSessionByList,
  recentRangeFrom,
  recentSlotFrom,
  weeklySlotFrom,
} from '../src/exercise/dashboardRecords.ts'

// S8-2: W01 주간 활동·최근 기록·오늘 완료 기록 연결의 순수 로직(저장소 조회 결과 → 화면 영역 상태).
// 저장소 조회와 화면 렌더링은 dashboardRecordsUi.test.mjs와 Chrome 검증(p82-verify)이 맡는다.

const OWNER = 'user-a'

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

// ── 최근 1년 범위 ───────────────────────────────────────────
test('최근 1년의 시작일은 1년 전 같은 월·일이고 윤일은 그 달 마지막 날이다', () => {
  assert.equal(recentRangeFrom('2026-11-16'), '2025-11-16')
  assert.equal(recentRangeFrom('2026-01-01'), '2025-01-01')
  assert.equal(recentRangeFrom('2027-03-01'), '2026-03-01')
  assert.equal(recentRangeFrom('2028-02-29'), '2027-02-28')
  assert.equal(recentRangeFrom('2028-03-01'), '2027-03-01')
  assert.throws(() => recentRangeFrom('2026-13-01'), RangeError)
})

// ── 주간 활동 ───────────────────────────────────────────────
test('주간: 월~일 경계 안의 기록만 집계한다(2026-11-16은 월요일)', () => {
  const today = '2026-11-18'
  const slot = weeklySlotFrom(
    result([
      record('prev-sun', '2026-11-15'), // 지난 주 일요일
      record('mon', '2026-11-16'),
      record('sun', '2026-11-22'),
      record('next-mon', '2026-11-23'), // 다음 주 월요일
    ]),
    today,
    OWNER,
  )
  assert.equal(slot.status, 'ready')
  assert.equal(slot.data.from, '2026-11-16')
  assert.equal(slot.data.to, '2026-11-22')
  assert.equal(slot.data.completedCount, 2)
  assert.equal(slot.data.activeDayCount, 2)
  assert.deepEqual(
    slot.data.days.filter((d) => d.completedCount > 0).map((d) => d.date),
    ['2026-11-16', '2026-11-22'],
  )
})

test('주간: 하루에 여러 건을 완료해도 활동일은 1일이다', () => {
  const slot = weeklySlotFrom(
    result([
      record('a', '2026-11-17', { completedAt: '2026-11-17T01:00:00.000Z' }),
      record('b', '2026-11-17', { completedAt: '2026-11-17T09:00:00.000Z' }),
      record('c', '2026-11-17', { completedAt: '2026-11-17T10:00:00.000Z' }),
    ]),
    '2026-11-18',
    OWNER,
  )
  assert.equal(slot.data.completedCount, 3)
  assert.equal(slot.data.activeDayCount, 1)
  assert.equal(
    slot.data.days.find((d) => d.date === '2026-11-17').completedCount,
    3,
  )
})

test('주간: 연·월 경계 주(2026-12-28~2027-01-03)도 달력 날짜로 센다', () => {
  const slot = weeklySlotFrom(
    result([record('x', '2026-12-31'), record('y', '2027-01-02')]),
    '2027-01-01',
    OWNER,
  )
  assert.equal(slot.data.from, '2026-12-28')
  assert.equal(slot.data.activeDayCount, 2)
})

test('주간: 기록이 없어도 ready(0회)이고 읽을 수 없는 기록 수를 전달한다', () => {
  const slot = weeklySlotFrom(result([], 2), '2026-11-18', OWNER)
  assert.equal(slot.status, 'ready')
  assert.equal(slot.data.completedCount, 0)
  assert.equal(slot.data.skippedCount, 2)
})

// ── 최근 기록 ───────────────────────────────────────────────
test('최근: 완료 시각 최신순 3건만, 세션 id를 담는다', () => {
  const slot = recentSlotFrom(
    result([
      record('old', '2026-11-01', { completedAt: '2026-11-01T10:00:00.000Z' }),
      record('new', '2026-11-10', { completedAt: '2026-11-10T10:00:00.000Z' }),
      record('mid', '2026-11-05', { completedAt: '2026-11-05T10:00:00.000Z' }),
      record('mid2', '2026-11-07', { completedAt: '2026-11-07T10:00:00.000Z' }),
    ]),
    '2026-11-16',
    OWNER,
  )
  assert.equal(RECENT_RECORD_LIMIT, 3)
  assert.equal(slot.status, 'ready')
  assert.deepEqual(
    slot.data.items.map((i) => i.id),
    ['new', 'mid2', 'mid'],
  )
  assert.deepEqual(
    slot.data.items.map((i) => i.sessionId),
    ['session-new', 'session-mid2', 'session-mid'],
  )
})

test('최근: 같은 날 여러 건도 완료 시각 순서로 각각 나온다', () => {
  const slot = recentSlotFrom(
    result([
      record('a', '2026-11-10', { completedAt: '2026-11-10T01:00:00.000Z' }),
      record('b', '2026-11-10', { completedAt: '2026-11-10T08:00:00.000Z' }),
    ]),
    '2026-11-16',
    OWNER,
  )
  assert.deepEqual(
    slot.data.items.map((i) => i.id),
    ['b', 'a'],
  )
})

test('최근 1년 경계: 1년 전 같은 날은 포함, 하루 더 전은 제외, 미래 날짜는 제외', () => {
  const today = '2026-11-16'
  const slot = recentSlotFrom(
    result([
      record('edge', '2025-11-16'),
      record('too-old', '2025-11-15'),
      record('future', '2026-11-17'),
      record('today', '2026-11-16'),
    ]),
    today,
    OWNER,
  )
  assert.deepEqual(slot.data.items.map((i) => i.id).sort(), ['edge', 'today'])
  // 윤일 경계
  const leap = recentSlotFrom(
    result([record('a', '2027-02-28'), record('b', '2027-02-27')]),
    '2028-02-29',
    OWNER,
  )
  assert.deepEqual(
    leap.data.items.map((i) => i.id),
    ['a'],
  )
})

test('최근: 기록이 없으면 empty, 읽을 수 없는 기록만 있으면 ready(0건 + 건수)', () => {
  assert.deepEqual(recentSlotFrom(result([]), '2026-11-16', OWNER), {
    status: 'empty',
  })
  const corrupt = recentSlotFrom(result([], 3), '2026-11-16', OWNER)
  assert.equal(corrupt.status, 'ready')
  assert.equal(corrupt.data.items.length, 0)
  assert.equal(corrupt.data.skippedCount, 3)
  // 범위 밖 기록뿐이어도 정상적인 빈 상태다
  assert.deepEqual(
    recentSlotFrom(result([record('old', '2020-01-01')]), '2026-11-16', OWNER),
    { status: 'empty' },
  )
})

// ── 계정 격리 ───────────────────────────────────────────────
test('계정 격리: 다른 계정의 기록은 주간·최근·완료 링크 어디에도 나오지 않고 읽을 수 없는 기록으로 센다', () => {
  const today = '2026-11-16'
  const mixed = result([
    record('mine', '2026-11-16'),
    record('theirs', '2026-11-16', { ownerId: 'user-b' }),
  ])
  const weekly = weeklySlotFrom(mixed, today, OWNER)
  assert.equal(weekly.data.completedCount, 1)
  assert.equal(weekly.data.skippedCount, 1)
  const recent = recentSlotFrom(mixed, today, OWNER)
  assert.deepEqual(
    recent.data.items.map((i) => i.id),
    ['mine'],
  )
  assert.equal(recent.data.skippedCount, 1)
  assert.deepEqual(
    [...doneSessionByList(mixed, today, OWNER).values()],
    ['session-mine'],
  )
  // 다른 계정 기준으로 보면 반대다
  assert.deepEqual(
    recentSlotFrom(mixed, today, 'user-b').data.items.map((i) => i.id),
    ['theirs'],
  )
  // 모두 다른 계정의 기록이면 보여 줄 것이 없다
  assert.equal(
    weeklySlotFrom(result([record('x', today, { ownerId: 'z' })]), today, OWNER)
      .data.completedCount,
    0,
  )
})

// ── 오늘 완료 기록 상세 링크 대상 ───────────────────────────
test('완료 기록 링크: 오늘 완료한 기록만, 목록 id로 찾는다', () => {
  const today = '2026-11-16'
  const map = doneSessionByList(
    result([
      record('t1', today, { sourceListId: 'L1' }),
      record('y1', '2026-11-15', { sourceListId: 'L2' }), // 어제
    ]),
    today,
    OWNER,
  )
  assert.equal(map.get('L1'), 'session-t1')
  assert.equal(map.has('L2'), false) // 어제 기록은 오늘의 운동 링크가 아니다
  assert.equal(map.get('다른-목록'), undefined) // 보여 주는 목록의 기록이 없으면 링크 없음
})

test('완료 기록 링크: 같은 목록의 기록이 여럿이면 완료 시각이 늦은 쪽(같으면 id가 큰 쪽)', () => {
  const today = '2026-11-16'
  const map = doneSessionByList(
    result([
      record('a', today, {
        sourceListId: 'L1',
        completedAt: '2026-11-16T01:00:00.000Z',
      }),
      record('b', today, {
        sourceListId: 'L1',
        completedAt: '2026-11-16T05:00:00.000Z',
      }),
      record('c', today, {
        sourceListId: 'L2',
        completedAt: '2026-11-16T03:00:00.000Z',
      }),
    ]),
    today,
    OWNER,
  )
  assert.equal(map.get('L1'), 'session-b')
  assert.equal(map.get('L2'), 'session-c')
  const tie = doneSessionByList(
    result([
      record('a', today, { sourceListId: 'L1' }),
      record('b', today, { sourceListId: 'L1' }),
    ]),
    today,
    OWNER,
  )
  assert.equal(tie.get('L1'), 'session-b')
})

test('빈 입력은 빈 결과(링크 없음)', () => {
  assert.equal(doneSessionByList(result([]), '2026-11-16', OWNER).size, 0)
})
