import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// W11·W01이 함께 쓰는 순수 함수 검증. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let view
let model

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  view = await server.ssrLoadModule('/src/exercise/workoutListView.ts')
  model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
})
after(async () => {
  await server?.close()
})

const list = (id, plannedDate, createdAt, items = []) => ({
  id,
  ownerId: 'u',
  schemaVersion: 1,
  plannedDate,
  items,
  catalogVersion: 'dev-mock-1',
  revision: 1,
  requestId: `r-${id}`,
  createdAt,
  updatedAt: createdAt,
})
const item = (recordType, sets, name = '운동', exerciseId = 'e1') => ({
  exerciseId,
  exerciseNameSnapshot: name,
  recordType,
  sets,
})

// ── 요청 ID ─────────────────────────────────────────────────────────
test('요청 ID는 w11-날짜-초안 시각 형식이고 저장소의 형식 규칙을 통과한다', () => {
  const id = view.makeSaveRequestId('2026-11-13', '2026-11-13T09:30:00.123Z')
  assert.equal(id, 'w11-20261113-20261113T093000123Z')
  assert.ok(model.isValidRequestId(id))
  assert.ok(id.length <= 100)
})

test('같은 날짜·초안 버전은 같은 ID, 초안 수정·날짜 변경은 다른 ID', () => {
  const a = view.makeSaveRequestId('2026-11-13', '2026-11-13T09:30:00.123Z')
  assert.equal(
    a,
    view.makeSaveRequestId('2026-11-13', '2026-11-13T09:30:00.123Z'),
  )
  assert.notEqual(
    a,
    view.makeSaveRequestId('2026-11-13', '2026-11-13T09:30:00.124Z'),
  )
  assert.notEqual(
    a,
    view.makeSaveRequestId('2026-11-14', '2026-11-13T09:30:00.123Z'),
  )
})

test('요청 ID에는 사용자 식별 정보와 운동 내용이 들어가지 않는다', () => {
  const id = view.makeSaveRequestId('2026-11-13', '2026-11-13T09:30:00.123Z')
  assert.match(id, /^w11-\d{8}-[0-9A-Za-z]+$/)
  // 입력은 날짜와 초안 시각뿐이다. 형식이 맞지 않는 값이 들어와도 규칙을 어긴 ID를 만들지 않는다.
  assert.equal(view.makeSaveRequestId('2026-11-13', '!!!'), null)
  assert.equal(view.makeSaveRequestId('2026-11-13', 'x'.repeat(200)), null)
})

test('초안은 저장한 버전과 같을 때만 비운다', () => {
  assert.equal(view.shouldClearDraft('t1', 't1'), true)
  assert.equal(view.shouldClearDraft('t2', 't1'), false)
})

// ── 세트 표시 ───────────────────────────────────────────────────────
test('세트 요약: 같은 목표는 한 줄, 다르면 세트 수와 범위', () => {
  assert.equal(
    view.describeSets('reps', [{ reps: 10 }, { reps: 10 }, { reps: 10 }]),
    '10회 × 3세트',
  )
  assert.equal(
    view.describeSets('reps', [{ reps: 10 }, { reps: 12 }, { reps: 8 }]),
    '3세트 · 8~12회',
  )
  assert.equal(
    view.describeSets('weight', [
      { reps: 10, weightKg: 8 },
      { reps: 10, weightKg: 8 },
    ]),
    '10회 · 8 kg × 2세트',
  )
  assert.equal(
    view.describeSets('weight', [{ reps: 10 }, { reps: 10 }]),
    '10회 × 2세트',
  )
  assert.equal(
    view.describeSets('time', [{ targetSeconds: 60 }, { targetSeconds: 60 }]),
    '1분 × 2세트',
  )
  assert.equal(
    view.describeSets('time', [{ targetSeconds: 45 }]),
    '45초 × 1세트',
  )
  assert.equal(
    view.describeSets('time', [{ targetSeconds: 30 }, { targetSeconds: 90 }]),
    '2세트 · 30초~1분 30초',
  )
  assert.equal(view.describeSets('reps', []), '세트 없음')
})

test('시간 표시: 말로 / 분:초', () => {
  assert.equal(view.formatTargetSeconds(45), '45초')
  assert.equal(view.formatTargetSeconds(60), '1분')
  assert.equal(view.formatTargetSeconds(90), '1분 30초')
  assert.equal(view.formatClock(45), '0:45')
  assert.equal(view.formatClock(90), '1:30')
  assert.equal(view.formatClock(3600), '60:00')
})

test('슬라이드: 같은 목표는 한 장(동일 목표 × 세트), 다르면 세트마다 한 장', () => {
  const same = view.buildSetSlides('reps', [
    { reps: 10 },
    { reps: 10 },
    { reps: 10 },
  ])
  assert.equal(same.length, 1)
  assert.equal(same[0].repeat, 3)
  assert.equal(same[0].main, '10')
  assert.equal(same[0].unit, '회')
  const diff = view.buildSetSlides('weight', [
    { reps: 10, weightKg: 8 },
    { reps: 8 },
  ])
  assert.equal(diff.length, 2)
  assert.equal(diff[0].extra, '8 kg')
  assert.equal(diff[1].extra, '중량 미입력')
  assert.equal(diff[0].repeat, null)
  const time = view.buildSetSlides('time', [{ targetSeconds: 90 }])
  assert.equal(time[0].main, '1:30')
  assert.equal(time[0].unit, '분:초')
  assert.match(time[0].spoken, /1분 30초/)
  assert.deepEqual(view.buildSetSlides('reps', []), [])
})

test('요약: 운동 수·총 세트 수·포함된 기록 방식(시간·중량·횟수 순서)', () => {
  const summary = view.summarizeItems([
    { recordType: 'reps', sets: [1, 2] },
    { recordType: 'time', sets: [1] },
    { recordType: 'reps', sets: [1] },
  ])
  assert.equal(summary.exerciseCount, 3)
  assert.equal(summary.setCount, 4)
  assert.deepEqual(summary.recordTypes, ['time', 'reps'])
})

// ── 목록 선택 ───────────────────────────────────────────────────────
test('오늘의 목록은 그날 가장 최근에 저장한 목록이고 다른 날짜는 쓰지 않는다', () => {
  const lists = [
    list('a', '2026-11-13', '2026-11-13T01:00:00.000Z'),
    list('b', '2026-11-13', '2026-11-13T03:00:00.000Z'),
    list('c', '2026-11-12', '2026-11-12T23:00:00.000Z'),
    list('d', '2026-11-14', '2026-11-14T00:30:00.000Z'),
  ]
  assert.equal(view.selectTodayList(lists, '2026-11-13').id, 'b')
  assert.equal(view.selectTodayList(lists, '2026-11-12').id, 'c')
  assert.equal(view.selectTodayList(lists, '2026-11-15'), null)
  assert.equal(view.selectTodayList([], '2026-11-13'), null)
})

test('저장 시각이 같으면 id 순으로 정해 항상 같은 결과를 낸다', () => {
  const a = list('a', '2026-11-13', '2026-11-13T01:00:00.000Z')
  const b = list('b', '2026-11-13', '2026-11-13T01:00:00.000Z')
  assert.equal(view.selectTodayList([a, b], '2026-11-13').id, 'b')
  assert.equal(view.selectTodayList([b, a], '2026-11-13').id, 'b')
})

test('목록 선택은 입력을 바꾸지 않는다(이전 목록 보존)', () => {
  const lists = [
    list('a', '2026-11-13', '2026-11-13T01:00:00.000Z', [
      item('reps', [{ reps: 5 }]),
    ]),
    list('b', '2026-11-13', '2026-11-13T03:00:00.000Z'),
  ]
  const before = JSON.stringify(lists)
  view.selectTodayList(lists, '2026-11-13')
  assert.equal(JSON.stringify(lists), before)
})

// ── W01 표시 값 ─────────────────────────────────────────────────────
test('저장된 목록은 W01 오늘의 운동 표시 값으로 바뀐다', () => {
  const view1 = view.todayViewFromList(
    list('a', '2026-11-13', '2026-11-13T01:00:00.000Z', [
      item(
        'weight',
        [
          { reps: 10, weightKg: 8 },
          { reps: 10, weightKg: 8 },
        ],
        '덤벨 스쿼트',
        'e1',
      ),
      item('time', [{ targetSeconds: 60 }], '플랭크', 'e2'),
    ]),
  )
  assert.equal(view1.phase, 'planned')
  assert.equal(view1.listName, view.TODAY_LIST_NAME)
  assert.equal(view1.exerciseCount, 2)
  assert.equal(view1.setCount, 3)
  assert.deepEqual(view1.items, [
    {
      name: '덤벨 스쿼트',
      detail: '10회 · 8 kg × 2세트',
      trailing: '중량+횟수형',
    },
    { name: '플랭크', detail: '1분 × 1세트', trailing: '시간형' },
  ])
  assert.equal('skippedCount' in view1, false)
})

test('W01 영역 상태: 목록 있음·없음·손상', () => {
  const ok = list('a', '2026-11-13', '2026-11-13T01:00:00.000Z', [
    item('reps', [{ reps: 5 }]),
  ])
  const ready = view.todaySlotFromLists(
    { items: [ok], skippedCount: 0 },
    '2026-11-13',
  )
  assert.equal(ready.status, 'ready')
  assert.equal(ready.data.exerciseCount, 1)
  // 다른 날짜만 있으면 비어 있다.
  assert.equal(
    view.todaySlotFromLists({ items: [ok], skippedCount: 0 }, '2026-11-14')
      .status,
    'empty',
  )
  assert.equal(
    view.todaySlotFromLists({ items: [], skippedCount: 0 }, '2026-11-13')
      .status,
    'empty',
  )
  // 유효한 목록 없이 손상 행만 있으면 비어 있다고 말하지 않는다.
  assert.equal(
    view.todaySlotFromLists({ items: [], skippedCount: 2 }, '2026-11-13')
      .status,
    'error',
  )
  // 유효한 목록이 있고 손상 행도 있으면 목록을 보이고 개수를 알린다.
  const mixed = view.todaySlotFromLists(
    { items: [ok], skippedCount: 1 },
    '2026-11-13',
  )
  assert.equal(mixed.status, 'ready')
  assert.equal(mixed.data.skippedCount, 1)
})

// ── 같은 구성 비교 ──────────────────────────────────────────────────
test('정규화한 초안은 저장 모양으로 바꿔 저장된 목록과 구성을 비교할 수 있다', () => {
  const normalized = [
    {
      exerciseId: 'e1',
      name: '스쿼트',
      recordType: 'reps',
      sets: [{ reps: 10 }, { reps: 10 }],
    },
  ]
  const items = view.toListItems(normalized)
  const stored = [item('reps', [{ reps: 10 }, { reps: 10 }], '스쿼트', 'e1')]
  assert.equal(model.sameListItems(stored, items), true)
  // 세트 값·이름·운동·순서가 다르면 다른 구성이다.
  const other = [item('reps', [{ reps: 10 }, { reps: 12 }], '스쿼트', 'e1')]
  assert.equal(model.sameListItems(other, items), false)
  assert.equal(
    model.sameListItems(
      [item('reps', [{ reps: 10 }, { reps: 10 }], '다른 이름', 'e1')],
      items,
    ),
    false,
  )
  assert.equal(model.sameListItems([], items), false)
})

test('날짜 표시', () => {
  assert.match(view.formatDateLabel('2026-11-13'), /11월 13일/)
  assert.equal(view.formatDateLabel('이상한 값'), '이상한 값')
})
