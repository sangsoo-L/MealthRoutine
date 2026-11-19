import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// W01 운동 시작·이어하기 판단과 화면. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let S
let M
let Parts
let Today
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  S = await server.ssrLoadModule('/src/exercise/startWorkout.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  Parts = await server.ssrLoadModule(
    '/src/components/exercise/dashboard/WorkoutStartParts.tsx',
  )
  Today = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/TodayExerciseSection.tsx',
    )
  ).default
})
after(async () => {
  await server?.close()
})

const TODAY = '2026-11-13'
const list = (id = 'l1', plannedDate = TODAY) => ({ id, plannedDate })
const active = (over = {}) => ({
  id: 's1',
  listId: 'l1',
  revision: 3,
  startedDate: TODAY,
  startedToday: true,
  plannedDate: TODAY,
  completedSets: 2,
  totalSets: 5,
  ...over,
})
const none = new Set()

// ── 시작 판단 ───────────────────────────────────────────────────────
test('진행 중인 세션이 없으면 오늘 목록을 새로 시작한다', () => {
  assert.deepEqual(
    S.decideStart({
      today: TODAY,
      list: list(),
      active: null,
      doneListIds: none,
    }),
    { kind: 'start', listId: 'l1' },
  )
})

test('같은 목록의 진행 중인 세션이 있으면 이어하기다(날짜와 무관)', () => {
  const a = active()
  assert.deepEqual(
    S.decideStart({ today: TODAY, list: list(), active: a, doneListIds: none }),
    { kind: 'resume', active: a },
  )
  // 목록이 오늘 것이 아니어도 이미 진행 중인 세션은 이어할 수 있다
  const old = active({ startedToday: false, startedDate: '2026-11-12' })
  assert.equal(
    S.decideStart({
      today: TODAY,
      list: list('l1', '2026-11-12'),
      active: old,
      doneListIds: none,
    }).kind,
    'resume',
  )
})

test('다른 목록의 진행 중인 세션이 있으면 충돌이다', () => {
  const a = active({ listId: 'other' })
  assert.deepEqual(
    S.decideStart({ today: TODAY, list: list(), active: a, doneListIds: none }),
    { kind: 'conflict', active: a, listId: 'l1' },
  )
})

test('오늘 날짜가 아닌 목록은 새로 시작하지 않는다', () => {
  assert.deepEqual(
    S.decideStart({
      today: TODAY,
      list: list('l1', '2026-11-12'),
      active: null,
      doneListIds: none,
    }),
    { kind: 'notToday' },
  )
  assert.deepEqual(
    S.decideStart({
      today: TODAY,
      list: list('l1', '2026-11-14'),
      active: null,
      doneListIds: none,
    }),
    { kind: 'notToday' },
  )
  // 다른 목록이 진행 중이어도 오늘 것이 아닌 목록은 충돌 패널이 아니라 시작 불가다
  assert.equal(
    S.decideStart({
      today: TODAY,
      list: list('l1', '2026-11-12'),
      active: active({ listId: 'x' }),
      doneListIds: none,
    }).kind,
    'notToday',
  )
})

test('오늘 이미 마친 목록은 다시 시작하지 않는다', () => {
  assert.deepEqual(
    S.decideStart({
      today: TODAY,
      list: list(),
      active: null,
      doneListIds: new Set(['l1']),
    }),
    { kind: 'done' },
  )
  // 다른 목록의 완료 기록은 영향이 없다
  assert.equal(
    S.decideStart({
      today: TODAY,
      list: list(),
      active: null,
      doneListIds: new Set(['x']),
    }).kind,
    'start',
  )
  // 마친 목록은 다른 목록이 진행 중이어도 충돌이 아니라 완료다
  assert.equal(
    S.decideStart({
      today: TODAY,
      list: list(),
      active: active({ listId: 'x' }),
      doneListIds: new Set(['l1']),
    }).kind,
    'done',
  )
})

test('진행 중인 세션 요약: 완료·전체 세트, 시작 날짜, 오늘 시작 여부', () => {
  const l = {
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: TODAY,
    catalogVersion: 'x',
    revision: 1,
    requestId: 'r',
    createdAt: '',
    updatedAt: '',
    items: [
      {
        exerciseId: 'e1',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }],
      },
    ],
  }
  const startedAt = new Date(2026, 10, 13, 9, 0, 0)
  const session = {
    ...M.createWorkoutSession({
      id: 's1',
      ownerId: 'u',
      list: l,
      now: startedAt,
    }),
    revision: 4,
  }
  session.performed[0][0] = { completed: true, actualReps: 10 }
  const today = S.summarizeActiveSession(session, TODAY)
  assert.deepEqual(today, {
    id: 's1',
    listId: 'l1',
    revision: 4,
    startedDate: TODAY,
    startedToday: true,
    plannedDate: TODAY,
    completedSets: 1,
    totalSets: 3,
  })
  assert.equal(S.startedOnLabel(today), null)
  const later = S.summarizeActiveSession(session, '2026-11-14')
  assert.equal(later.startedToday, false)
  assert.equal(S.startedOnLabel(later), '11월 13일에 시작한 운동이에요')
})

// ── W01 화면 ────────────────────────────────────────────────────────
const view = (over = {}) => ({
  phase: 'planned',
  listName: '오늘 할 운동 목록',
  exerciseCount: 1,
  setCount: 2,
  items: [{ name: '푸시업', detail: '10회 × 2세트', trailing: '횟수형' }],
  listId: 'l1',
  plannedDate: TODAY,
  ...over,
})
const controls = (over = {}) => ({
  status: 'ready',
  active: null,
  decision: { kind: 'start', listId: 'l1' },
  busy: false,
  error: null,
  panel: null,
  reload: noop,
  start: noop,
  resume: noop,
  openAbandon: noop,
  chooseAbandonAndStart: noop,
  confirmAbandon: noop,
  closePanel: noop,
  ...over,
})
const renderToday = (start, data = view()) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Today, {
        slot: { status: 'ready', data },
        draftCount: 0,
        onRetry: noop,
        start,
      }),
    ),
  )
const renderCard = (c) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Parts.ActiveSessionCard, { controls: c }),
    ),
  )

test('시작 가능: 활성화된 시작 버튼, 준비 중 안내는 없다', () => {
  const html = renderToday(controls())
  assert.match(html, /이 목록으로 바로 운동 시작/)
  assert.doesNotMatch(html, /운동 진행 기능을 준비 중이에요/)
  assert.doesNotMatch(
    html,
    /aria-disabled="true"[^>]*>이 목록으로 바로 운동 시작/,
  )
  assert.match(html, /목록 다시 구성하기/)
})

test('이어하기: 버튼이 "이어서 운동하기"로 바뀐다', () => {
  const a = active()
  assert.match(
    renderToday(
      controls({ active: a, decision: { kind: 'resume', active: a } }),
    ),
    /이어서 운동하기/,
  )
})

test('충돌: 시작을 누르면 이어하기 / 그만두고 새로 시작 / 취소 패널이 열린다', () => {
  const a = active({ listId: 'other' })
  const closed = renderToday(
    controls({
      active: a,
      decision: { kind: 'conflict', active: a, listId: 'l1' },
    }),
  )
  assert.match(closed, /진행 중인 다른 운동이 있어요/)
  const open = renderToday(
    controls({
      active: a,
      decision: { kind: 'conflict', active: a, listId: 'l1' },
      panel: { origin: 'today', kind: 'conflict', step: 1, thenStart: false },
    }),
  )
  assert.match(open, /진행 중인 운동 이어서 하기/)
  assert.match(open, /그만두고 이 목록으로 새로 시작/)
  assert.match(open, /완료 2 \/ 5세트/)
  assert.match(open, /취소/)
})

test('그만두기는 2단계 확인이고 완료 세트가 있으면 기록 손실을 안내한다', () => {
  const a = active({ completedSets: 3 })
  const base = { active: a, decision: { kind: 'resume', active: a } }
  const step1 = renderToday(
    controls({
      ...base,
      panel: { origin: 'today', kind: 'abandon', step: 1, thenStart: false },
    }),
  )
  assert.match(step1, /진행 중인 운동을 그만둘까요\?/)
  assert.match(step1, /완료한 3세트는 기록으로 저장되지 않아요/)
  assert.match(step1, /그만두기 계속/)
  assert.doesNotMatch(step1, /기록 없이 그만두기<\/button>/)
  const step2 = renderToday(
    controls({
      ...base,
      panel: { origin: 'today', kind: 'abandon', step: 2, thenStart: true },
    }),
  )
  assert.match(step2, /기록 없이 그만둘까요\?/)
  assert.match(step2, /기록 없이 그만두기/)
  assert.match(step2, /그만둔 뒤 이 목록으로 새로 시작해요/)
  const noLoss = renderToday(
    controls({
      active: active({ completedSets: 0 }),
      panel: { origin: 'today', kind: 'abandon', step: 1, thenStart: false },
    }),
  )
  assert.match(noLoss, /완료한 세트가 없어 남는 기록은 없어요/)
})

test('오늘 이미 마친 목록은 시작 버튼 대신 완료 안내를 보인다', () => {
  const html = renderToday(controls({ decision: { kind: 'done' } }))
  assert.match(html, /오늘 운동을 마쳤어요/)
  assert.match(html, /같은 목록은 다시 시작하지/)
  assert.doesNotMatch(html, /이 목록으로 바로 운동 시작/)
})

test('시작 정보 조회 중·실패·손상', () => {
  assert.match(
    renderToday(controls({ status: 'loading', decision: null })),
    /운동 시작 정보를 확인하는 중이에요/,
  )
  const error = renderToday(controls({ status: 'error', decision: null }))
  assert.match(error, /운동 시작 정보를 확인하지 못했어요/)
  assert.match(error, /다시 시도/)
  const corrupt = renderToday(controls({ status: 'corrupt', decision: null }))
  assert.match(corrupt, /읽을 수 없어 시작할 수 없어요/)
  assert.match(corrupt, /데이터는\s*지우지 않았어요/)
})

test('저장소가 없으면(운영 빌드) 기존 준비 중 안내를 유지한다', () => {
  const unavailable = renderToday(
    controls({ status: 'unavailable', decision: null }),
  )
  assert.match(unavailable, /운동 진행 기능을 준비 중이에요/)
  assert.match(unavailable, /aria-disabled="true"/)
  // 시작 정보가 없거나 개발용 예시(목록 식별자 없음)도 마찬가지다
  assert.match(renderToday(undefined), /운동 진행 기능을 준비 중이에요/)
  assert.match(
    renderToday(controls(), view({ listId: undefined })),
    /운동 진행 기능을 준비 중이에요/,
  )
})

test('시작 중에는 버튼이 비활성이고 오류 문구를 보인다', () => {
  assert.match(
    renderToday(controls({ busy: true })),
    /aria-disabled="true"[^>]*>시작하는 중…/,
  )
  assert.match(
    renderToday(controls({ error: 'start' })),
    /운동을 시작하지 못했어요/,
  )
  assert.match(renderToday(controls({ error: 'dateChanged' })), /날짜가 바뀌어/)
  assert.match(
    renderToday(controls({ error: 'changed' })),
    /다른 곳에서 운동이 바뀌어/,
  )
})

test('진행 중인 운동 영역: 별도 카드로 이어하기·그만두기를 보이고 자정 이후 세션은 안내한다', () => {
  assert.equal(renderCard(controls()), '')
  assert.equal(
    renderCard(controls({ status: 'loading', active: active() })),
    '',
  )
  const same = renderCard(controls({ active: active() }))
  assert.match(same, /진행 중인 운동/)
  assert.match(same, /완료 2 \/ 5세트/)
  assert.match(same, /이어서 운동하기/)
  assert.match(same, /그만두기/)
  assert.doesNotMatch(same, /에 시작한 운동이에요/)
  const old = renderCard(
    controls({
      active: active({ startedToday: false, startedDate: '2026-11-12' }),
    }),
  )
  assert.match(old, /11월 12일에 시작한 운동이에요/)
  assert.match(old, /이어서 하거나 그만둘 수 있어요/)
  const withPanel = renderCard(
    controls({
      active: active({ completedSets: 1 }),
      panel: { origin: 'card', kind: 'abandon', step: 1, thenStart: false },
    }),
  )
  assert.match(withPanel, /진행 중인 운동을 그만둘까요\?/)
})
