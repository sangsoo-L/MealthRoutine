import assert from 'node:assert/strict'
import test from 'node:test'
import {
  dashboardWeek,
  measuredDurationLabel,
  selectRecentRecords,
  selectWeeklyExercise,
} from '../src/exercise/dashboardSelectors.ts'

function record(
  id,
  performedDate,
  completedAt = `${performedDate}T12:00:00.000Z`,
) {
  return {
    id,
    ownerId: 'test',
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
  }
}

test('월요일부터 일요일까지 표시하고 오늘을 한 번만 표시한다', () => {
  const week = dashboardWeek('2026-11-12')
  assert.equal(week.from, '2026-11-09')
  assert.equal(week.to, '2026-11-15')
  assert.equal(week.days.length, 7)
  assert.deepEqual(
    week.days.filter((day) => day.isToday).map((day) => day.date),
    ['2026-11-12'],
  )
})

test('일요일은 다음 주로 넘어가지 않는다', () => {
  assert.equal(dashboardWeek('2026-11-15').from, '2026-11-09')
})

test('연도·월 경계를 달력 날짜로 계산한다', () => {
  const week = dashboardWeek('2027-01-01')
  assert.equal(week.from, '2026-12-28')
  assert.equal(week.to, '2027-01-03')
  assert.throws(() => dashboardWeek('2026-02-30'), RangeError)
})

test('같은 날 두 번 완료하면 2회·운동한 날 1일이다', () => {
  const result = selectWeeklyExercise(
    [
      record('a', '2026-11-12'),
      record('b', '2026-11-12'),
      record('previous', '2026-11-08'),
      record('next', '2026-11-16'),
    ],
    '2026-11-12',
  )
  assert.equal(result.completedCount, 2)
  assert.equal(result.activeDayCount, 1)
  assert.equal(
    result.days.find((day) => day.date === '2026-11-12').completedCount,
    2,
  )
})

test('일요일 시작·월요일 완료는 시작한 날의 주에 포함한다', () => {
  const result = selectWeeklyExercise(
    [
      {
        ...record('boundary', '2026-11-08', '2026-11-09T00:20:00.000Z'),
        plannedDate: '2026-11-09',
      },
    ],
    '2026-11-12',
  )
  assert.equal(result.completedCount, 0)
})

test('최근 기록은 주간 범위와 무관하게 완료 시각 최신순 최대 3건이다', () => {
  const input = [
    record('older', '2026-10-01'),
    record('newest', '2026-11-12'),
    record('second', '2026-11-11'),
    record('third', '2026-10-31'),
  ]
  const before = structuredClone(input)
  assert.deepEqual(
    selectRecentRecords(input).items.map((item) => item.id),
    ['newest', 'second', 'third'],
  )
  assert.deepEqual(input, before)
})

test('완료 시각은 문자열이 아닌 실제 시각으로 비교한다', () => {
  const result = selectRecentRecords([
    record('later', '2026-11-12', '2026-11-12T00:30:00Z'),
    record('earlier', '2026-11-12', '2026-11-12T09:00:00+09:00'),
  ])
  assert.equal(result.items[0].id, 'later')
})

test('미완료 운동은 최근 기록 제목에 사용하지 않는다', () => {
  const saved = record('a', '2026-11-12')
  saved.exercises.unshift({
    exerciseId: 'unfinished',
    exerciseNameSnapshot: '미완료 운동',
    recordType: 'reps',
    plannedSetCount: 1,
    completedSets: [],
  })
  assert.equal(selectRecentRecords([saved]).items[0].title, '스쿼트')
})

test('손상 건수는 정상 0건과 별개로 보존한다', () => {
  assert.equal(selectWeeklyExercise([], '2026-11-12', 2).skippedCount, 2)
  assert.deepEqual(selectRecentRecords([], 3, 2), {
    items: [],
    skippedCount: 2,
  })
})

test('미측정 시간과 측정된 0초를 구분한다', () => {
  assert.equal(measuredDurationLabel(null), null)
  assert.equal(measuredDurationLabel(0), '0초')
  assert.equal(measuredDurationLabel(76_900), '1분 16초')
  assert.equal(measuredDurationLabel(120_000), '2분')
})

test('최근 기록 개수의 잘못된 입력을 거부한다', () => {
  assert.deepEqual(selectRecentRecords([], 0).items, [])
  assert.throws(() => selectRecentRecords([], -1), RangeError)
})
