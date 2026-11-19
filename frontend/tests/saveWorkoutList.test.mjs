import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// W11 저장 절차(saveWorkoutList)의 시나리오 검증. IndexedDB 대신 저장소 계약을 따르는 가짜 저장소를 쓴다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let save
let model
let repos
let view

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  save = await server.ssrLoadModule('/src/exercise/saveWorkoutList.ts')
  model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  repos = await server.ssrLoadModule('/src/exercise/workoutRepositories.ts')
  view = await server.ssrLoadModule('/src/exercise/workoutListView.ts')
})
after(async () => {
  await server?.close()
})

const KNOWN = new Set(['e1', 'e2'])
const D1 = '2026-11-13'
const D2 = '2026-11-14'
const at = (day, hour = 12, minute = 0, second = 0) =>
  new Date(2026, 10, day, hour, minute, second)

function draftOf(
  sets = [{ reps: 10 }, { reps: 10 }],
  updatedAt = '2026-11-13T09:30:00.123Z',
  exerciseId = 'e1',
) {
  return {
    v: 1,
    day: 'today',
    items: [
      { itemId: 'i1', exerciseId, name: '스쿼트', recordType: 'reps', sets },
    ],
    updatedAt,
  }
}

/** 저장소 계약을 따르는 가짜: 같은 요청 ID·같은 구성은 처음 목록을 돌려주고, 같은 ID에 다른 구성이면 requestConflict. */
function setup(initialDate = at(13)) {
  const env = { now: initialDate }
  const store = []
  const state = {
    listCalls: 0,
    saveCalls: 0,
    requestIds: [],
    failList: null,
    failSaveOnce: null,
    loseResponseOnce: false,
    staleRead: false,
    forceConflict: false,
    onList: null,
    stampNow: null,
  }
  let seq = 0
  const repo = {
    async listByDate(date) {
      state.listCalls += 1
      state.onList?.()
      if (state.failList) throw state.failList
      if (state.staleRead) return { items: [], skippedCount: 0 }
      return {
        items: store.filter((list) => list.plannedDate === date),
        skippedCount: 0,
      }
    },
    async saveFromDraft(input) {
      state.saveCalls += 1
      state.requestIds.push(input.requestId)
      if (state.failSaveOnce) {
        const error = state.failSaveOnce
        state.failSaveOnce = null
        throw error
      }
      if (state.forceConflict) {
        throw new repos.WorkoutStoreError('conflict', {
          code: 'requestConflict',
        })
      }
      const candidate = model.buildWorkoutList({
        id: `l${++seq}`,
        ownerId: 'u',
        requestId: input.requestId,
        draft: input.draft,
        knownExerciseIds: input.knownExerciseIds,
        catalogVersion: 'dev-mock-1',
        now: state.stampNow ? state.stampNow() : env.now,
      })
      if (!candidate) {
        throw new repos.WorkoutStoreError('validation', {
          code: 'invalidDraft',
        })
      }
      const existing = store.find((list) => list.requestId === input.requestId)
      if (existing) {
        if (!model.sameListItems(existing.items, candidate.items)) {
          throw new repos.WorkoutStoreError('conflict', {
            code: 'requestConflict',
          })
        }
        return { list: existing, created: false }
      }
      store.push(candidate)
      if (state.loseResponseOnce) {
        state.loseResponseOnce = false
        throw new repos.WorkoutStoreError('error')
      }
      return { list: candidate, created: true }
    },
  }
  const deps = { listRepository: repo, now: () => env.now }
  const run = (draft, over = {}) =>
    save.saveWorkoutList(deps, {
      draft,
      knownExerciseIds: KNOWN,
      acknowledgedDate: D1,
      confirmedReplaceListId: null,
      ...over,
    })
  const advance = (minutes = 1) => {
    env.now = new Date(env.now.getTime() + minutes * 60_000)
  }
  return { env, store, state, run, advance }
}

// ── 처음 저장 ───────────────────────────────────────────────────────
test('처음 저장: 오늘 목록이 없으면 저장하고 요청 ID 형식을 따른다', async () => {
  const s = setup()
  const outcome = await s.run(draftOf())
  assert.equal(outcome.kind, 'saved')
  assert.equal(outcome.created, true)
  assert.equal(outcome.list.plannedDate, D1)
  assert.equal(s.store.length, 1)
  assert.equal(s.state.requestIds[0], 'w11-20261113-20261113T093000123Z')
})

// ── 같은 구성 재저장 ────────────────────────────────────────────────
test('같은 구성이 이미 오늘의 목록이면 중복 저장하지 않는다', async () => {
  const s = setup()
  await s.run(draftOf())
  s.advance()
  // 정리에 실패해 남은 초안과 새로 만든 같은 내용의 초안 모두 같은 판정이다.
  const again = await s.run(draftOf(undefined, '2026-11-13T09:31:00.000Z'))
  assert.equal(again.kind, 'alreadySaved')
  const leftover = await s.run(draftOf())
  assert.equal(leftover.kind, 'alreadySaved')
  assert.equal(s.state.saveCalls, 1)
  assert.equal(s.store.length, 1)
})

// ── 교체 ────────────────────────────────────────────────────────────
test('다른 구성이면 교체 확인을 요청하고 확인 전에는 저장하지 않는다', async () => {
  const s = setup()
  const first = await s.run(draftOf())
  s.advance()
  const other = draftOf([{ reps: 12 }], '2026-11-13T10:00:00.000Z')
  const ask = await s.run(other)
  assert.equal(ask.kind, 'replaceConfirm')
  assert.equal(ask.existing.id, first.list.id)
  assert.equal(s.state.saveCalls, 1)
})

test('교체를 확인하면 새 목록을 추가하고 이전 목록은 보존하며 최신 저장본이 오늘의 목록이다', async () => {
  const s = setup()
  const first = await s.run(draftOf())
  const firstSnapshot = JSON.stringify(first.list)
  s.advance()
  const other = draftOf([{ reps: 12 }], '2026-11-13T10:00:00.000Z')
  const done = await s.run(other, { confirmedReplaceListId: first.list.id })
  assert.equal(done.kind, 'saved')
  assert.equal(s.store.length, 2)
  assert.equal(JSON.stringify(s.store[0]), firstSnapshot)
  assert.equal(view.selectTodayList(s.store, D1).id, done.list.id)
  assert.notEqual(s.state.requestIds[0], s.state.requestIds[1])
})

test('확인한 목록이 이미 최신이 아니면(다른 곳에서 저장) 다시 확인을 요청한다', async () => {
  const s = setup()
  const first = await s.run(draftOf())
  s.advance()
  const second = await s.run(
    draftOf([{ reps: 12 }], '2026-11-13T10:00:00.000Z'),
    {
      confirmedReplaceListId: first.list.id,
    },
  )
  s.advance()
  const third = draftOf([{ reps: 15 }], '2026-11-13T11:00:00.000Z')
  // 사용자는 첫 목록을 바꾼다고 확인했지만 지금 최신은 두 번째 목록이다.
  const ask = await s.run(third, { confirmedReplaceListId: first.list.id })
  assert.equal(ask.kind, 'replaceConfirm')
  assert.equal(ask.existing.id, second.list.id)
  assert.equal(s.store.length, 2)
})

test('이전에 저장했던 구성을 다시 저장하면 새 목록이 오늘의 목록이 된다', async () => {
  const s = setup()
  const a = await s.run(draftOf())
  s.advance()
  const b = await s.run(draftOf([{ reps: 12 }], '2026-11-13T10:00:00.000Z'), {
    confirmedReplaceListId: a.list.id,
  })
  s.advance()
  const backToA = draftOf(undefined, '2026-11-13T11:00:00.000Z')
  const done = await s.run(backToA, { confirmedReplaceListId: b.list.id })
  assert.equal(done.kind, 'saved')
  assert.equal(done.created, true)
  assert.equal(view.selectTodayList(s.store, D1).id, done.list.id)
  assert.equal(s.store.length, 3)
})

// ── 중복 호출 ───────────────────────────────────────────────────────
test('같은 초안을 동시에 두 번 저장해도 목록은 하나다(같은 요청 ID)', async () => {
  const s = setup()
  const draft = draftOf()
  const [a, b] = await Promise.all([s.run(draft), s.run(draft)])
  assert.equal(s.store.length, 1)
  assert.ok(
    [a.kind, b.kind].every(
      (kind) => kind === 'saved' || kind === 'alreadySaved',
    ),
  )
  assert.equal(new Set(s.state.requestIds).size, 1)
})

// ── 응답 유실·실패·재시도 ───────────────────────────────────────────
test('응답이 유실돼도 다시 저장하면 중복 없이 처리된다(같은 구성 발견)', async () => {
  const s = setup()
  const draft = draftOf()
  s.state.loseResponseOnce = true
  const lost = await s.run(draft)
  assert.equal(lost.kind, 'failed')
  assert.equal(lost.stage, 'save')
  assert.equal(s.store.length, 1) // 실제로는 저장돼 있다
  const retry = await s.run(draft)
  assert.equal(retry.kind, 'alreadySaved')
  assert.equal(s.store.length, 1)
})

test('조회가 오래된 값이어도 같은 요청 ID라 목록이 둘 생기지 않는다(created=false)', async () => {
  const s = setup()
  const draft = draftOf()
  s.state.loseResponseOnce = true
  await s.run(draft)
  s.state.staleRead = true // 오늘 목록 조회가 비어 있는 것처럼 보인다
  const retry = await s.run(draft)
  assert.equal(retry.kind, 'saved')
  assert.equal(retry.created, false)
  assert.equal(s.store.length, 1)
  assert.equal(s.state.requestIds[0], s.state.requestIds[1])
})

test('저장 실패 후 재시도는 같은 요청 ID를 쓰고 초안을 바꾸지 않는다', async () => {
  const s = setup()
  const draft = draftOf()
  const snapshot = JSON.stringify(draft)
  s.state.failSaveOnce = new repos.WorkoutStoreError('quota')
  const failed = await s.run(draft)
  assert.deepEqual(failed, { kind: 'failed', stage: 'save', reason: 'quota' })
  assert.equal(s.store.length, 0)
  const retry = await s.run(draft)
  assert.equal(retry.kind, 'saved')
  assert.equal(s.state.requestIds[0], s.state.requestIds[1])
  assert.equal(JSON.stringify(draft), snapshot)
})

test('오늘 목록 조회에 실패하면 저장을 시도하지 않는다', async () => {
  const s = setup()
  s.state.failList = new repos.WorkoutStoreError('error')
  const outcome = await s.run(draftOf())
  assert.deepEqual(outcome, { kind: 'failed', stage: 'read', reason: 'error' })
  assert.equal(s.state.saveCalls, 0)
  assert.equal(s.store.length, 0)
})

// ── requestConflict ─────────────────────────────────────────────────
test('requestConflict는 자동으로 다시 저장하지 않는다', async () => {
  const s = setup()
  s.state.forceConflict = true
  const outcome = await s.run(draftOf())
  assert.deepEqual(outcome, {
    kind: 'failed',
    stage: 'save',
    reason: 'requestConflict',
  })
  assert.equal(s.state.saveCalls, 1)
  assert.equal(s.store.length, 0)
})

test('저장소 오류는 안내용 이유로 분류된다', () => {
  const C = save.classifySaveFailure
  const E = repos.WorkoutStoreError
  assert.equal(C(new E('quota')), 'quota')
  assert.equal(C(new E('unavailable')), 'unavailable')
  assert.equal(C(new E('blocked')), 'blocked')
  assert.equal(C(new E('versionChange')), 'blocked')
  assert.equal(C(new E('validation', { code: 'invalidDraft' })), 'invalidDraft')
  assert.equal(
    C(new E('conflict', { code: 'requestConflict' })),
    'requestConflict',
  )
  assert.equal(C(new E('conflict', { code: 'revisionMismatch' })), 'error')
  assert.equal(C(new E('error')), 'error')
  assert.equal(C(new Error('x')), 'error')
  assert.equal(C(undefined), 'error')
})

// ── 날짜 전환 ───────────────────────────────────────────────────────
test('자정 이후 저장: 날짜 확인을 요청하고 확인 전에는 조회·저장하지 않는다', async () => {
  const s = setup(at(14, 0, 1, 0))
  const outcome = await s.run(draftOf())
  assert.deepEqual(outcome, { kind: 'dateChanged', from: D1, to: D2 })
  assert.equal(s.state.listCalls, 0)
  assert.equal(s.state.saveCalls, 0)
})

test('날짜를 확인하면 새 날짜의 목록으로 저장하고 요청 ID도 새 날짜를 쓴다', async () => {
  const s = setup(at(14, 0, 1, 0))
  const done = await s.run(draftOf(), { acknowledgedDate: D2 })
  assert.equal(done.kind, 'saved')
  assert.equal(done.list.plannedDate, D2)
  assert.equal(s.state.requestIds[0], 'w11-20261114-20261113T093000123Z')
})

test('확인한 뒤 저장 직전에 날짜가 다시 바뀌면 저장하지 않고 다시 확인한다', async () => {
  const s = setup(at(13, 23, 59, 58))
  // 오늘 목록 조회 도중 자정이 지난다.
  s.state.onList = () => {
    s.env.now = at(14, 0, 0, 1)
  }
  const outcome = await s.run(draftOf())
  assert.deepEqual(outcome, { kind: 'dateChanged', from: D1, to: D2 })
  assert.equal(s.state.saveCalls, 0)
  assert.equal(s.store.length, 0)
})

test('저장 중 자정을 넘기면 반환된 날짜가 달라 불일치로 알리고 자동으로 다시 저장하지 않는다', async () => {
  const s = setup(at(13, 23, 59, 59))
  s.state.stampNow = () => at(14, 0, 0, 1) // 저장소가 날짜를 정하는 순간 자정이 지났다
  const outcome = await s.run(draftOf())
  assert.equal(outcome.kind, 'dateMismatch')
  assert.equal(outcome.expected, D1)
  assert.equal(outcome.list.plannedDate, D2)
  assert.equal(s.state.saveCalls, 1)
})

// ── 초안 검증 ───────────────────────────────────────────────────────
test('초안이 올바르지 않으면 조회·저장 없이 알린다', async () => {
  const s = setup()
  const empty = {
    v: 1,
    day: 'today',
    items: [],
    updatedAt: '2026-11-13T09:30:00.123Z',
  }
  const none = await s.run(empty)
  assert.equal(none.kind, 'invalid')
  const badSet = await s.run(draftOf([{ reps: 0 }]))
  assert.equal(badSet.kind, 'invalid')
  assert.ok(badSet.issues.length > 0)
  const unknown = await s.run(draftOf(undefined, undefined, 'zzz'))
  assert.equal(unknown.kind, 'invalid')
  assert.equal(s.state.listCalls, 0)
  assert.equal(s.state.saveCalls, 0)
})
