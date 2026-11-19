import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// W14 세션 저장·복구 컨트롤러 검증. 저장소 계약(workoutModel의 실제 규칙)을 따르는 가짜 저장소와 가짜 주기 실행기를 쓴다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let C
let M
let R

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  C = await server.ssrLoadModule('/src/exercise/workoutSessionController.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  R = await server.ssrLoadModule('/src/exercise/workoutRepositories.ts')
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-13T03:00:00.000Z')
const iso = (date) => date.toISOString()
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })
const settle = async () => {
  for (let i = 0; i < 5; i++)
    await new Promise((resolve) => setTimeout(resolve, 0))
}

function makeList() {
  return {
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-13',
    catalogVersion: 'dev-mock-1',
    revision: 1,
    requestId: 'r1',
    createdAt: iso(T0),
    updatedAt: iso(T0),
    items: [
      {
        exerciseId: 'e1',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }],
      },
      {
        exerciseId: 'e2',
        exerciseNameSnapshot: '덤벨 컬',
        recordType: 'weight',
        sets: [{ reps: 10, weightKg: 8 }, { reps: 12 }],
      },
      {
        exerciseId: 'e3',
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        sets: [{ targetSeconds: 60 }, { targetSeconds: 60 }],
      },
    ],
  }
}
const newStored = (over = {}) => ({
  ...M.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list: makeList(),
    now: T0,
  }),
  ...over,
})
/** 시간형 세트(마지막 운동의 첫 세트)에서 시작하는 세션. */
const timeStored = (over = {}) => newStored({ cursor: pos(2, 0), ...over })

/** 저장소 계약을 따르는 가짜 저장소. 같은 세션 하나를 다룬다. */
function fakeRepo(session) {
  const r = {
    session,
    saves: [],
    abandons: [],
    abandonError: null,
    getActiveCalls: 0,
    getCalls: 0,
    hold: false,
    held: [],
    inFlight: 0,
    maxInFlight: 0,
    failNext: null,
    loseNext: false,
    getActiveError: null,
    getReturnsNull: false,
    activeGate: [],
    external(change) {
      change(r.session)
      r.session.revision += 1
    },
    release() {
      const next = r.held.shift()
      if (next) next()
    },
    releaseAll() {
      r.hold = false
      while (r.held.length) r.held.shift()()
    },
  }
  r.api = {
    async getActive() {
      r.getActiveCalls += 1
      if (r.getActiveError) throw r.getActiveError
      if (r.gateActive)
        await new Promise((resolve) => r.activeGate.push(resolve))
      return r.session && r.session.status === 'in_progress'
        ? structuredClone(r.session)
        : null
    },
    async get(id) {
      r.getCalls += 1
      if (r.getReturnsNull) return null
      return r.session && r.session.id === id
        ? structuredClone(r.session)
        : null
    },
    async abandon(id, options = {}) {
      r.abandons.push({ id, options })
      if (r.abandonError) throw r.abandonError
      const s = r.session
      if (!s || s.id !== id) throw new R.WorkoutStoreError('notFound')
      if (s.status === 'interrupted' || s.status === 'cancelled')
        return structuredClone(s)
      if (s.status === 'completed')
        throw new R.WorkoutStoreError('conflict', { code: 'sessionEnded' })
      if (
        options.expectedRevision !== undefined &&
        options.expectedRevision !== s.revision
      ) {
        throw new R.WorkoutStoreError('conflict', {
          code: 'revisionMismatch',
          currentRevision: s.revision,
        })
      }
      r.session = {
        ...s,
        status: M.abandonStatus(s),
        endedAt: iso(env.now),
        revision: s.revision + 1,
      }
      return structuredClone(r.session)
    },
    async saveProgress(id, input) {
      r.saves.push({
        expectedRevision: input.expectedRevision,
        input: structuredClone(input),
      })
      r.inFlight += 1
      r.maxInFlight = Math.max(r.maxInFlight, r.inFlight)
      try {
        if (r.hold) await new Promise((resolve) => r.held.push(resolve))
        if (r.failNext) {
          const error = r.failNext
          r.failNext = null
          throw error
        }
        const s = r.session
        if (!s || s.id !== id) throw new R.WorkoutStoreError('notFound')
        if (s.status !== 'in_progress')
          throw new R.WorkoutStoreError('conflict', {
            code: 'sessionNotInProgress',
          })
        if (!M.validateProgressInput(input, s.listSnapshot))
          throw new R.WorkoutStoreError('validation', {
            code: 'invalidProgress',
          })
        if (input.expectedRevision !== s.revision) {
          throw new R.WorkoutStoreError('conflict', {
            code: 'revisionMismatch',
            currentRevision: s.revision,
          })
        }
        const next = structuredClone(M.applyProgress(s, input, env.now))
        r.session = next
        if (r.loseNext) {
          r.loseNext = false
          throw new R.WorkoutStoreError('error')
        }
        return structuredClone(next)
      } finally {
        r.inFlight -= 1
      }
    },
  }
  return r
}

const env = { now: T0 }
const advance = (ms) => {
  env.now = new Date(env.now.getTime() + ms)
}

function fakeScheduler() {
  const s = { intervals: [], cleared: [], nextId: 1 }
  s.api = {
    setInterval(callback, ms) {
      const handle = { id: s.nextId++, callback, ms }
      s.intervals.push(handle)
      return handle
    },
    clearInterval(handle) {
      s.cleared.push(handle)
      s.intervals = s.intervals.filter((h) => h !== handle)
    },
  }
  s.tick = () => s.intervals.slice().forEach((h) => h.callback())
  return s
}

function make(repo, options = {}) {
  env.now = options.now ?? T0
  const sched = fakeScheduler()
  const ctl = C.createWorkoutSessionController({
    repository: repo === null ? null : repo.api,
    now: () => env.now,
    scheduler: sched.api,
    checkpointMs: 10_000,
  })
  const emits = []
  ctl.subscribe(() => emits.push(ctl.getSnapshot()))
  return { ctl, sched, emits }
}
async function start(repo, options) {
  const h = make(repo, options)
  h.ctl.activate()
  await settle()
  return h
}

// ── 불러오기 ────────────────────────────────────────────────────────
test('정상 불러오기: 진행 중 세션을 읽고 저장된 revision과 값을 그대로 쓴다', async () => {
  const repo = fakeRepo(newStored({ revision: 4, cursor: pos(0, 1) }))
  const { ctl } = make(repo)
  assert.equal(ctl.getSnapshot().load.status, 'loading')
  ctl.activate()
  assert.equal(ctl.getSnapshot().load.status, 'loading')
  await settle()
  const snap = ctl.getSnapshot()
  assert.equal(snap.load.status, 'ready')
  assert.equal(snap.sessionId, 's1')
  assert.equal(snap.revision, 4)
  assert.deepEqual(snap.session.cursor, pos(0, 1))
  assert.equal(snap.session.performed.length, 3)
  assert.deepEqual(snap.save, {
    saving: false,
    dirty: false,
    failed: false,
    reason: null,
    fatal: false,
  })
  assert.equal(snap.restorePending, false)
  assert.equal(snap.timerBlocked, false)
  assert.equal(snap.needsLeavePreparation, false)
  assert.equal(snap.warnBeforeUnload, false)
  assert.deepEqual(snap.leave, { action: 'allow' })
  assert.equal(repo.saves.length, 0)
})

test('진행 중 세션 없음·저장소 없음·손상·조회 실패를 구분한다', async () => {
  const none = await start(fakeRepo(null))
  assert.equal(none.ctl.getSnapshot().load.status, 'none')
  assert.equal(none.ctl.getSnapshot().session, null)
  assert.deepEqual(none.ctl.complete(), { ok: false, reason: 'notReady' })

  const ended = await start(fakeRepo(newStored({ status: 'completed' })))
  assert.equal(ended.ctl.getSnapshot().load.status, 'none')

  const noRepo = await start(null)
  assert.equal(noRepo.ctl.getSnapshot().load.status, 'unavailable')

  const cases = [
    [
      new R.WorkoutStoreError('error', { code: 'activeSessionCorrupt' }),
      { status: 'corrupt' },
    ],
    [new R.WorkoutStoreError('unavailable'), { status: 'unavailable' }],
    [new R.WorkoutStoreError('quota'), { status: 'error', reason: 'quota' }],
    [
      new R.WorkoutStoreError('blocked'),
      { status: 'error', reason: 'blocked' },
    ],
    [
      new R.WorkoutStoreError('versionChange'),
      { status: 'error', reason: 'blocked' },
    ],
    [new R.WorkoutStoreError('error'), { status: 'error', reason: 'error' }],
    [new Error('x'), { status: 'error', reason: 'error' }],
  ]
  for (const [error, expected] of cases) {
    const repo = fakeRepo(newStored())
    repo.getActiveError = error
    const h = await start(repo)
    assert.deepEqual(h.ctl.getSnapshot().load, expected)
    assert.equal(h.ctl.getSnapshot().session, null)
  }
})

test('오류 분류', () => {
  const E = R.WorkoutStoreError
  const f = C.classifySessionFailure
  assert.equal(
    f(new E('conflict', { code: 'revisionMismatch' })),
    'revisionMismatch',
  )
  assert.equal(
    f(new E('conflict', { code: 'sessionNotInProgress' })),
    'sessionEnded',
  )
  assert.equal(f(new E('conflict', { code: 'sessionEnded' })), 'sessionEnded')
  assert.equal(f(new E('conflict', { code: 'uniqueConstraint' })), 'error')
  assert.equal(
    f(new E('validation', { code: 'invalidProgress' })),
    'invalidProgress',
  )
  assert.equal(f(new E('notFound')), 'notFound')
  assert.equal(f(new E('error', { code: 'corruptRecord' })), 'corrupt')
  assert.equal(f(null), 'error')
})

// ── 타이머 복원 ─────────────────────────────────────────────────────
test('복원: 측정 중이던 타이머를 정지 상태로 복원해 한 번만 저장하고 다른 진행 데이터는 바꾸지 않는다', async () => {
  const stored = timeStored({
    revision: 6,
    timer: { accumulatedMs: 2000, runningSince: iso(T0) },
    lastSavedAt: iso(new Date(T0.getTime() + 20_000)),
  })
  const repo = fakeRepo(stored)
  const original = structuredClone(stored)
  const { ctl } = await start(repo, { now: new Date(T0.getTime() + 999_000) })
  assert.equal(repo.saves.length, 1)
  assert.equal(repo.saves[0].expectedRevision, 6)
  assert.deepEqual(repo.saves[0].input.timer, {
    accumulatedMs: 22_000,
    runningSince: null,
  })
  assert.deepEqual(repo.saves[0].input.cursor, original.cursor)
  assert.deepEqual(repo.saves[0].input.performed, original.performed)
  const snap = ctl.getSnapshot()
  assert.equal(snap.revision, 7)
  assert.equal(snap.restorePending, false)
  assert.equal(snap.timerRunning, false)
  assert.equal(snap.save.dirty, false)
  // 자동으로 재개하지 않았다
  assert.equal(repo.session.timer.runningSince, null)
  assert.deepEqual(repo.session.performed, original.performed)
})

test('복원이 값을 바꾸지 않으면(일시정지·대기 타이머) 저장하지 않는다', async () => {
  for (const timer of [
    { accumulatedMs: 0, runningSince: null },
    { accumulatedMs: 5000, runningSince: null },
  ]) {
    const repo = fakeRepo(timeStored({ timer }))
    const { ctl } = await start(repo)
    assert.equal(repo.saves.length, 0)
    assert.equal(ctl.getSnapshot().restorePending, false)
    assert.deepEqual(ctl.getSnapshot().session.timer, timer)
  }
})

test('복원 저장이 끝나기 전에는 타이머를 시작할 수 없고 끝나면 시작할 수 있다', async () => {
  const repo = fakeRepo(
    timeStored({
      timer: { accumulatedMs: 0, runningSince: iso(T0) },
      lastSavedAt: iso(new Date(T0.getTime() + 5000)),
    }),
  )
  repo.hold = true
  const { ctl } = await start(repo)
  let snap = ctl.getSnapshot()
  assert.equal(snap.restorePending, true)
  assert.equal(snap.timerBlocked, true)
  assert.equal(snap.save.saving, true)
  assert.equal(snap.timerRunning, false)
  assert.deepEqual(ctl.startTimer(), { ok: false, reason: 'restorePending' })
  assert.equal(repo.saves.length, 1)
  repo.releaseAll()
  await ctl.idle()
  snap = ctl.getSnapshot()
  assert.equal(snap.restorePending, false)
  assert.equal(snap.timerBlocked, false)
  const started = ctl.startTimer()
  assert.equal(started.ok, true)
  await ctl.idle()
  assert.equal(ctl.getSnapshot().timerRunning, true)
})

test('복원 저장 실패: 정지 상태로 실패를 알리고 타이머를 막으며, 다시 시도하면 해제된다', async () => {
  const repo = fakeRepo(
    timeStored({
      revision: 2,
      timer: { accumulatedMs: 0, runningSince: iso(T0) },
      lastSavedAt: iso(new Date(T0.getTime() + 8000)),
    }),
  )
  repo.failNext = new R.WorkoutStoreError('quota')
  const { ctl } = await start(repo)
  let snap = ctl.getSnapshot()
  assert.equal(snap.save.failed, true)
  assert.equal(snap.save.reason, 'quota')
  assert.equal(snap.save.dirty, true)
  assert.equal(snap.restorePending, true)
  assert.equal(snap.timerBlocked, true)
  assert.equal(snap.timerRunning, false)
  assert.equal(snap.session.timer.accumulatedMs, 8000)
  assert.equal(repo.session.timer.runningSince, iso(T0)) // 저장소는 그대로
  await ctl.retry()
  snap = ctl.getSnapshot()
  assert.equal(snap.save.failed, false)
  assert.equal(snap.restorePending, false)
  assert.equal(snap.timerBlocked, false)
  assert.equal(repo.session.timer.runningSince, null)
  assert.equal(repo.saves[1].expectedRevision, 2)
})

test('복원 저장 중 다른 탭이 먼저 저장하면 충돌로 보고 덮어쓰지 않는다', async () => {
  const repo = fakeRepo(
    timeStored({
      revision: 3,
      timer: { accumulatedMs: 0, runningSince: iso(T0) },
      lastSavedAt: iso(new Date(T0.getTime() + 5000)),
    }),
  )
  repo.hold = true
  const { ctl } = await start(repo)
  // 복원 저장이 반영되기 전에 다른 탭이 세트를 완료해 저장한다
  repo.external((s) => {
    s.performed[0][0] = { completed: true, actualReps: 10 }
  })
  const othersState = structuredClone(repo.session)
  repo.releaseAll()
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.deepEqual(snap.conflict, { kind: 'changed' })
  assert.equal(snap.timerBlocked, true)
  assert.deepEqual(repo.session, othersState) // 다른 탭의 변경을 덮어쓰지 않았다
  assert.equal(repo.getCalls, 1)
  assert.deepEqual(ctl.startTimer(), { ok: false, reason: 'conflict' })
  assert.deepEqual(ctl.complete(), { ok: false, reason: 'conflict' })
  // 최신 상태를 불러온다
  assert.deepEqual(await ctl.reloadLatest(true).then((r) => r.ok), true)
  await settle()
  assert.equal(ctl.getSnapshot().conflict, null)
  assert.equal(ctl.getSnapshot().session.performed[0][0].completed, true)
})

// ── 저장 대기열 ─────────────────────────────────────────────────────
test('세트 완료: 완료·커서·타이머 초기화를 한 번의 저장으로 보내고 revision을 갱신한다', async () => {
  const repo = fakeRepo(newStored({ revision: 2 }))
  const { ctl } = await start(repo)
  const result = ctl.complete()
  assert.equal(result.ok, true)
  assert.equal(ctl.getSnapshot().save.dirty, true)
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.equal(repo.saves.length, 1)
  assert.equal(repo.saves[0].expectedRevision, 2)
  assert.equal(snap.revision, 3)
  assert.equal(snap.save.dirty, false)
  assert.equal(repo.session.performed[0][0].completed, true)
  assert.deepEqual(repo.session.cursor, pos(0, 1))
})

test('저장 중 추가 입력: 한 번에 하나만 저장하고 이어서 최신 전체 상태를 저장한다', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const { ctl } = await start(repo)
  repo.hold = true
  ctl.complete() // 0-0
  assert.equal(ctl.getSnapshot().save.saving, true)
  ctl.complete() // 0-1, 첫 저장이 아직 진행 중
  ctl.complete() // 0-2
  assert.equal(repo.saves.length, 1)
  assert.equal(repo.maxInFlight, 1)
  repo.hold = false
  repo.release()
  await ctl.idle()
  assert.equal(repo.maxInFlight, 1)
  assert.equal(repo.saves.length, 2)
  // 두 번째 저장은 낡은 revision이 아니라 첫 저장이 돌려준 revision을 쓰고 최신 전체 상태를 담는다
  assert.deepEqual(
    repo.saves.map((s) => s.expectedRevision),
    [1, 2],
  )
  assert.equal(
    repo.saves[1].input.performed[0].filter((s) => s.completed).length,
    3,
  )
  assert.equal(repo.session.revision, 3)
  assert.equal(ctl.getSnapshot().save.dirty, false)
  assert.equal(ctl.getSnapshot().revision, 3)
})

test('연타해도 같은 세트를 두 번 저장하지 않는다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  repo.hold = true
  const first = ctl.complete({ position: pos(0, 0) })
  const again = ctl.complete({ position: pos(0, 0) })
  assert.equal(first.ok, true)
  assert.equal(again.ok, false)
  assert.equal(again.reason, 'alreadyCompleted')
  repo.hold = false
  repo.releaseAll()
  await ctl.idle()
  assert.equal(repo.saves.length, 1)
})

test('저장 실패 후 재시도는 그 시점의 최신 값을 쓰고 미저장 상태를 유지한다', async () => {
  const repo = fakeRepo(newStored({ revision: 5 }))
  const { ctl } = await start(repo)
  repo.failNext = new R.WorkoutStoreError('quota')
  ctl.complete()
  await ctl.idle()
  let snap = ctl.getSnapshot()
  assert.equal(snap.save.failed, true)
  assert.equal(snap.save.reason, 'quota')
  assert.equal(snap.save.dirty, true)
  assert.equal(snap.save.fatal, false)
  assert.equal(snap.revision, 5)
  assert.equal(repo.session.performed[0][0].completed, false)
  assert.equal(snap.needsLeavePreparation, true)
  assert.equal(snap.warnBeforeUnload, true)
  // 실패 뒤 입력이 더 생기면 그 입력이 새 저장을 시도하며, 최신 전체 상태를 보낸다(자동 반복 없음)
  ctl.complete()
  await ctl.idle()
  snap = ctl.getSnapshot()
  assert.equal(repo.saves.length, 2)
  assert.equal(repo.saves[1].expectedRevision, 5)
  assert.equal(
    repo.saves[1].input.performed[0].filter((s) => s.completed).length,
    2,
  )
  assert.equal(snap.save.failed, false)
  assert.equal(snap.save.dirty, false)
  assert.equal(snap.revision, 6)
})

test('저장 실패를 다시 시도(retry)하면 같은 값을 저장하고 성공하면 실패 표시가 사라진다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  repo.failNext = new R.WorkoutStoreError('unavailable')
  ctl.complete()
  await ctl.idle()
  assert.equal(ctl.getSnapshot().save.reason, 'unavailable')
  await ctl.retry()
  assert.equal(repo.saves.length, 2)
  assert.deepEqual(repo.saves[0].input, { ...repo.saves[1].input })
  assert.equal(ctl.getSnapshot().save.failed, false)
  assert.equal(repo.session.performed[0][0].completed, true)
})

test('invalidProgress는 다시 시도하지 않고 진행을 막는다(무한 재시도 없음)', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  repo.failNext = new R.WorkoutStoreError('validation', {
    code: 'invalidProgress',
  })
  ctl.complete()
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.equal(snap.save.fatal, true)
  assert.equal(snap.save.reason, 'invalidProgress')
  assert.equal(repo.saves.length, 1)
  await ctl.retry()
  await settle()
  assert.equal(repo.saves.length, 1)
  assert.deepEqual(ctl.complete(), { ok: false, reason: 'blocked' })
  assert.equal(snap.timerBlocked, true)
  // 최신 상태 불러오기는 가능하다
  assert.equal((await ctl.reloadLatest(true)).ok, true)
  await settle()
  assert.equal(ctl.getSnapshot().save.fatal, false)
})

// ── 응답 유실과 충돌 ────────────────────────────────────────────────
test('응답 유실: 이미 반영된 저장은 충돌이 아니라 저장된 revision을 받아들인다', async () => {
  const repo = fakeRepo(newStored({ revision: 3 }))
  const { ctl } = await start(repo)
  repo.loseNext = true
  ctl.complete()
  await ctl.idle()
  // 저장은 커밋됐지만 응답을 못 받았다
  assert.equal(repo.session.revision, 4)
  assert.equal(ctl.getSnapshot().save.failed, true)
  assert.equal(ctl.getSnapshot().revision, 3)
  await ctl.retry()
  const snap = ctl.getSnapshot()
  assert.equal(snap.conflict, null)
  assert.equal(snap.save.failed, false)
  assert.equal(snap.save.dirty, false)
  assert.equal(snap.revision, 4)
  assert.equal(repo.getCalls, 1)
  // 낡은 revision(3)으로 다시 보냈다가 mismatch → get → 이미 반영됨으로 판별했고 추가 저장은 없다
  assert.deepEqual(
    repo.saves.map((s) => s.expectedRevision),
    [3, 3],
  )
  assert.equal(repo.session.revision, 4)
})

test('응답 유실 뒤 그 사이 생긴 변경: 내 이전 저장이 반영된 것으로 판별하고 새 변경만 이어서 저장한다', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const { ctl } = await start(repo)
  repo.loseNext = true
  ctl.complete() // 0-0: 커밋되지만 응답 유실
  await ctl.idle()
  assert.equal(repo.session.revision, 2)
  ctl.complete() // 0-1: 낡은 revision(1)으로 시도 → mismatch → 저장된 값이 내 이전 시도(0-0)와 같다
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.equal(snap.conflict, null)
  assert.equal(snap.save.failed, false)
  assert.equal(snap.save.dirty, false)
  // 이전 저장을 받아들인 뒤(revision 2) 새 변경을 그 revision으로 저장했다
  assert.deepEqual(
    repo.saves.map((s) => s.expectedRevision),
    [1, 1, 2],
  )
  assert.equal(repo.session.revision, 3)
  assert.equal(repo.session.performed[0][0].completed, true)
  assert.equal(repo.session.performed[0][1].completed, true)
  assert.equal(snap.revision, 3)
})

test('응답 유실처럼 보여도 저장된 값이 내가 보낸 어느 값과도 다르면 충돌이다(다른 탭이 이어서 저장)', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const { ctl } = await start(repo)
  repo.loseNext = true
  ctl.complete() // 0-0 커밋, 응답 유실
  await ctl.idle()
  // 그 뒤 다른 탭이 다른 세트를 저장했다
  repo.external((s) => {
    s.performed[1][0] = { completed: true, actualReps: 10 }
  })
  const others = structuredClone(repo.session)
  await ctl.retry()
  assert.deepEqual(ctl.getSnapshot().conflict, { kind: 'changed' })
  assert.deepEqual(repo.session, others)
  assert.equal((await ctl.reloadLatest(false)).reason, 'confirmRequired')
  assert.equal((await ctl.reloadLatest(true)).ok, true)
  await settle()
  assert.equal(ctl.getSnapshot().session.performed[1][0].completed, true)
  assert.equal(ctl.getSnapshot().save.dirty, false)
})

test('다른 탭의 실제 변경: 자동 병합하지 않고 저장·타이머를 멈추며 폐기 전 확인을 요구한다', async () => {
  const repo = fakeRepo(timeStored({ revision: 2 }))
  const { ctl } = await start(repo)
  ctl.startTimer()
  await ctl.idle()
  advance(7000)
  repo.external((s) => {
    s.performed[0][0] = { completed: true, actualReps: 12 }
  })
  const others = structuredClone(repo.session)
  ctl.complete({ position: pos(2, 0) }) // 내 변경(시간형 세트 완료) → mismatch → get → 다른 값 → 충돌
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.deepEqual(snap.conflict, { kind: 'changed' })
  assert.equal(snap.timerBlocked, true)
  assert.equal(snap.timerRunning, false) // 충돌 시 타이머 정지
  assert.deepEqual(repo.session, others)
  assert.equal(snap.save.dirty, true)
  // 더 저장할 수 없지만 미저장 변경이 남아 있으므로 이동 준비(prepareLeave)가 폐기 확인을 요구해야 한다
  assert.equal(snap.needsLeavePreparation, true)
  assert.equal(snap.warnBeforeUnload, true)
  const saved = repo.saves.length
  await ctl.retry()
  assert.equal(repo.saves.length, saved) // 충돌 중에는 재시도하지 않는다
  assert.deepEqual(ctl.pauseTimer(), { ok: false, reason: 'conflict' })
  // 로컬 미저장 변경 폐기 전 확인 필요
  assert.deepEqual(await ctl.reloadLatest(), {
    ok: false,
    reason: 'confirmRequired',
  })
  assert.equal(ctl.getSnapshot().conflict.kind, 'changed')
  const reloaded = await ctl.reloadLatest(true)
  assert.equal(reloaded.ok, true)
  await settle()
  const latest = ctl.getSnapshot()
  assert.equal(latest.conflict, null)
  assert.equal(latest.session.performed[0][0].actualReps, 12)
  assert.equal(latest.save.dirty, false)
})

test('세션이 다른 곳에서 끝났거나 사라졌으면 충돌로 알린다', async () => {
  const ended = fakeRepo(newStored())
  const a = await start(ended)
  ended.external((s) => {
    s.status = 'completed'
    s.endedAt = iso(T0)
    s.completedAt = iso(T0)
    s.recordId = 'rec'
  })
  a.ctl.complete()
  await a.ctl.idle()
  assert.deepEqual(a.ctl.getSnapshot().conflict, { kind: 'ended' })
  assert.equal((await a.ctl.reloadLatest(true)).ok, true)
  await settle()
  assert.equal(a.ctl.getSnapshot().load.status, 'none')

  const gone = fakeRepo(newStored())
  const b = await start(gone)
  gone.external((s) => {
    s.performed[0][0] = { completed: true, actualReps: 9 }
  })
  gone.getReturnsNull = true
  b.ctl.complete()
  await b.ctl.idle()
  assert.deepEqual(b.ctl.getSnapshot().conflict, { kind: 'gone' })
})

test('충돌 판별 중 다시 읽기에 실패하면 충돌로 단정하지 않고 저장 실패로 두어 다시 시도할 수 있다', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const { ctl } = await start(repo)
  repo.loseNext = true
  ctl.complete()
  await ctl.idle()
  repo.api.get = async () => {
    throw new R.WorkoutStoreError('unavailable')
  }
  await ctl.retry()
  let snap = ctl.getSnapshot()
  assert.equal(snap.conflict, null)
  assert.equal(snap.save.failed, true)
  assert.equal(snap.save.reason, 'unavailable')
})

// ── 체크포인트·탭 숨김 ──────────────────────────────────────────────
test('체크포인트: 측정 중에만 10초마다 저장하고 겹치지 않으며 멈추면 주기를 해제한다', async () => {
  const repo = fakeRepo(timeStored({ revision: 1 }))
  const { ctl, sched } = await start(repo)
  assert.equal(sched.intervals.length, 0)
  ctl.startTimer()
  await ctl.idle()
  assert.equal(repo.saves.length, 1) // 시작은 즉시 저장
  assert.equal(sched.intervals.length, 1)
  assert.equal(sched.intervals[0].ms, 10_000)
  advance(10_000)
  sched.tick()
  await ctl.idle()
  assert.equal(repo.saves.length, 2)
  assert.equal(repo.session.lastSavedAt, iso(env.now))
  assert.equal(repo.session.revision, 3)
  // 저장 중에는 체크포인트가 새 저장을 만들지 않는다
  repo.hold = true
  advance(10_000)
  sched.tick()
  assert.equal(repo.saves.length, 3)
  advance(10_000)
  sched.tick()
  sched.tick()
  assert.equal(repo.saves.length, 3)
  assert.equal(repo.maxInFlight, 1)
  repo.hold = false
  repo.releaseAll()
  await ctl.idle()
  // 일시정지하면 즉시 저장하고 주기를 해제한다
  ctl.pauseTimer()
  await ctl.idle()
  assert.equal(sched.intervals.length, 0)
  const count = repo.saves.length
  sched.tick()
  await settle()
  assert.equal(repo.saves.length, count)
  assert.equal(repo.session.timer.runningSince, null)
})

test('체크포인트 저장 실패: 오류 상태를 유지하다가 다음 체크포인트에서 성공하면 해제된다', async () => {
  const repo = fakeRepo(timeStored())
  const { ctl, sched } = await start(repo)
  ctl.startTimer()
  await ctl.idle()
  repo.failNext = new R.WorkoutStoreError('quota')
  advance(10_000)
  sched.tick()
  await ctl.idle()
  let snap = ctl.getSnapshot()
  assert.equal(snap.save.failed, true)
  assert.equal(snap.save.reason, 'quota')
  assert.equal(snap.save.dirty, false) // 값은 같지만 체크포인트가 실패했다
  assert.equal(snap.timerRunning, true) // 화면의 측정은 계속된다
  advance(10_000)
  sched.tick()
  await ctl.idle()
  snap = ctl.getSnapshot()
  assert.equal(snap.save.failed, false)
  assert.equal(repo.session.lastSavedAt, iso(env.now))
})

test('체크포인트는 충돌·치명적 실패 뒤에는 멈춘다', async () => {
  const repo = fakeRepo(timeStored())
  const { ctl, sched } = await start(repo)
  ctl.startTimer()
  await ctl.idle()
  repo.external((s) => {
    s.performed[0][0] = { completed: true, actualReps: 10 }
  })
  advance(10_000)
  sched.tick() // 체크포인트가 낡은 revision으로 저장 → 충돌
  await ctl.idle()
  assert.deepEqual(ctl.getSnapshot().conflict, { kind: 'changed' })
  assert.equal(sched.intervals.length, 0)
  assert.equal(ctl.getSnapshot().timerRunning, false)
})

test('탭 숨김: 측정 중이면 일시정지하고 저장하며 돌아와도 자동 재개하지 않는다', async () => {
  const repo = fakeRepo(timeStored({ revision: 1 }))
  const { ctl } = await start(repo)
  ctl.startTimer()
  await ctl.idle()
  advance(30_000)
  ctl.onHidden()
  let snap = ctl.getSnapshot()
  assert.equal(snap.timerRunning, false)
  assert.equal(snap.pausedByHide, true)
  assert.equal(snap.session.timer.accumulatedMs, 30_000)
  await ctl.idle()
  assert.deepEqual(repo.session.timer, {
    accumulatedMs: 30_000,
    runningSince: null,
  })
  // 복귀(시간이 지나도) 자동으로 재개하지 않는다
  advance(60_000)
  snap = ctl.getSnapshot()
  assert.equal(snap.timerRunning, false)
  assert.equal(snap.pausedByHide, true)
  assert.equal(snap.session.timer.accumulatedMs, 30_000)
  // 사용자가 직접 재개하면 안내가 사라진다
  assert.equal(ctl.startTimer().ok, true)
  assert.equal(ctl.getSnapshot().pausedByHide, false)
})

test('탭 숨김: 측정 중이 아니어도 미저장 변경이 있으면 저장을 시도한다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  repo.failNext = new R.WorkoutStoreError('unavailable')
  ctl.complete()
  await ctl.idle()
  assert.equal(ctl.getSnapshot().save.failed, true)
  ctl.onHidden()
  await ctl.idle()
  assert.equal(repo.saves.length, 2)
  assert.equal(ctl.getSnapshot().save.failed, false)
  assert.equal(ctl.getSnapshot().pausedByHide, false)
  // 저장할 것이 없으면 저장하지 않는다
  ctl.onHidden()
  await settle()
  assert.equal(repo.saves.length, 2)
})

test('pagehide: 저장이 실패해도 일시정지하고, 다시 열면 마지막 저장 시각까지만 복원돼 과다 기록이 없다', async () => {
  const repo = fakeRepo(timeStored({ revision: 1 }))
  const first = await start(repo)
  first.ctl.startTimer()
  await first.ctl.idle()
  const startedAt = env.now
  advance(30_000)
  repo.failNext = new R.WorkoutStoreError('error') // pagehide의 저장이 끝나지 못함
  first.ctl.onPageHide()
  await first.ctl.idle()
  assert.equal(first.ctl.getSnapshot().save.failed, true)
  assert.equal(first.ctl.getSnapshot().timerRunning, false)
  first.ctl.deactivate() // 탭이 닫힘
  // 저장소에는 시작 시점의 저장뿐이다(측정 중). 다시 열면 그 저장 시각까지만 인정한다.
  assert.equal(repo.session.timer.runningSince, iso(startedAt))
  advance(5 * 60_000)
  const second = await start(repo, { now: env.now })
  const snap = second.ctl.getSnapshot()
  assert.equal(snap.session.timer.runningSince, null)
  assert.equal(snap.session.timer.accumulatedMs, 0) // 마지막 저장 이후의 30초는 사라지지만 5분 30초가 더해지지는 않는다
  assert.equal(repo.session.timer.runningSince, null)
})

test('새로고침 복원: 체크포인트까지의 시간만 복원되고 정지 상태로 시작한다', async () => {
  const repo = fakeRepo(timeStored({ revision: 1 }))
  const first = await start(repo)
  first.ctl.startTimer()
  await first.ctl.idle()
  advance(10_000)
  first.sched.tick()
  await first.ctl.idle()
  advance(7_000) // 체크포인트 뒤 7초 더 측정하다가 새로고침(저장 없음)
  first.ctl.deactivate()
  const second = await start(repo, { now: env.now })
  const snap = second.ctl.getSnapshot()
  assert.equal(snap.session.timer.runningSince, null)
  assert.equal(snap.session.timer.accumulatedMs, 10_000)
  assert.equal(snap.timerRunning, false)
  assert.equal(snap.restorePending, false) // 복원 저장이 끝났다
  assert.equal(repo.session.timer.runningSince, null)
})

test('새로고침 복원: 위치·완료 세트·revision을 그대로 되살린다', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const first = await start(repo)
  first.ctl.complete()
  first.ctl.complete()
  await first.ctl.idle()
  first.ctl.deactivate()
  const second = await start(repo)
  const snap = second.ctl.getSnapshot()
  assert.deepEqual(snap.session.cursor, pos(0, 2))
  assert.equal(snap.session.performed[0].filter((s) => s.completed).length, 2)
  assert.equal(snap.revision, repo.session.revision)
  assert.equal(snap.save.dirty, false)
})

// ── 계정·세션 전환 ──────────────────────────────────────────────────
test('비활성화한 컨트롤러는 늦게 도착한 불러오기·저장 응답을 모두 무시한다', async () => {
  const repoA = fakeRepo(newStored({ id: 'sA', revision: 1 }))
  repoA.gateActive = true
  const a = make(repoA)
  a.ctl.activate()
  await settle()
  a.ctl.deactivate() // 계정 전환
  const emitsAfter = a.emits.length
  repoA.activeGate.forEach((resolve) => resolve())
  await settle()
  assert.equal(a.ctl.getSnapshot().load.status, 'loading')
  assert.equal(a.emits.length, emitsAfter)
  assert.equal(a.ctl.getSnapshot().session, null)

  // 다른 계정의 컨트롤러는 영향받지 않는다
  const repoB = fakeRepo(newStored({ id: 'sB', revision: 7 }))
  const b = await start(repoB)
  assert.equal(b.ctl.getSnapshot().sessionId, 'sB')
  assert.equal(b.ctl.getSnapshot().revision, 7)
  assert.equal(a.ctl.getSnapshot().sessionId, null)

  // 저장 중 비활성화: 응답이 와도 상태가 바뀌지 않고 알림도 없다
  const repoC = fakeRepo(newStored({ revision: 1 }))
  const c = await start(repoC)
  repoC.hold = true
  c.ctl.complete()
  const beforeDeactivate = c.emits.length
  c.ctl.deactivate()
  repoC.hold = false
  repoC.releaseAll()
  await settle()
  assert.equal(c.emits.length, beforeDeactivate)
  assert.equal(c.ctl.getSnapshot().revision, 1)
  assert.equal(repoC.session.revision, 2) // 저장 자체는 커밋됐다
})

test('활성화·비활성화·재활성화(StrictMode)에서도 지난 응답은 버리고 마지막 불러오기만 쓴다', async () => {
  const repo = fakeRepo(newStored({ revision: 2 }))
  repo.gateActive = true
  const { ctl } = make(repo)
  ctl.activate()
  ctl.deactivate()
  ctl.activate()
  await settle()
  assert.equal(repo.getActiveCalls, 2)
  repo.activeGate.forEach((resolve) => resolve())
  await settle()
  assert.equal(ctl.getSnapshot().load.status, 'ready')
  assert.equal(ctl.getSnapshot().revision, 2)
  ctl.activate() // 이미 활성이면 다시 불러오지 않는다
  await settle()
  assert.equal(repo.getActiveCalls, 2)
})

// ── 이탈 보호 ───────────────────────────────────────────────────────
test('이탈 보호 상태: 저장할 것이 없으면 허용, 저장 중·미저장·실패를 구분한다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  let snap = ctl.getSnapshot()
  assert.deepEqual(snap.leave, { action: 'allow' })
  assert.equal(snap.needsLeavePreparation, false)
  assert.equal(snap.warnBeforeUnload, false)

  repo.hold = true
  ctl.complete()
  snap = ctl.getSnapshot()
  assert.deepEqual(snap.leave, { action: 'waitForSave' })
  assert.equal(snap.needsLeavePreparation, true)
  assert.equal(snap.warnBeforeUnload, true)
  repo.hold = false
  repo.releaseAll()
  await ctl.idle()

  repo.failNext = new R.WorkoutStoreError('quota')
  ctl.complete()
  await ctl.idle()
  snap = ctl.getSnapshot()
  assert.deepEqual(snap.leave, {
    action: 'confirmLoss',
    unsavedCompletedSets: 1,
  })
  assert.equal(snap.warnBeforeUnload, true)
})

test('측정 중에는 저장할 변경이 없어도 이동 준비가 필요하지만 브라우저 경고는 띄우지 않는다', async () => {
  const repo = fakeRepo(timeStored())
  const { ctl } = await start(repo)
  ctl.startTimer()
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.equal(snap.timerRunning, true)
  assert.equal(snap.needsLeavePreparation, true)
  assert.equal(snap.warnBeforeUnload, false)
})

test('이동 준비: 일시정지하고 저장을 마치면 이동을 허용하고, 저장에 실패하면 막는다', async () => {
  const repo = fakeRepo(timeStored({ revision: 1 }))
  const { ctl } = await start(repo)
  ctl.startTimer()
  await ctl.idle()
  advance(12_000)
  const ok = await ctl.prepareLeave()
  assert.deepEqual(ok, { action: 'allow' })
  assert.equal(ctl.getSnapshot().timerRunning, false)
  assert.deepEqual(repo.session.timer, {
    accumulatedMs: 12_000,
    runningSince: null,
  })

  // 저장 실패 상태에서는 이동을 막는다
  ctl.complete({ position: pos(2, 0) })
  await ctl.idle()
  repo.failNext = new R.WorkoutStoreError('quota')
  ctl.complete({ position: pos(0, 0) })
  await ctl.idle()
  assert.equal(ctl.getSnapshot().save.failed, true)
  repo.failNext = new R.WorkoutStoreError('quota')
  const blocked = await ctl.prepareLeave()
  assert.deepEqual(blocked, { action: 'confirmLoss', unsavedCompletedSets: 1 })

  // 저장이 성공하면 허용
  const allowed = await ctl.prepareLeave()
  assert.deepEqual(allowed, { action: 'allow' })
  assert.equal(repo.session.performed[0][0].completed, true)
})

test('충돌 상태에서 미저장 변경이 있으면 이동 준비가 폐기 확인을 요구한다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  repo.external((s) => {
    s.performed[1][0] = { completed: true, actualReps: 10 }
  })
  ctl.complete()
  await ctl.idle()
  assert.deepEqual(ctl.getSnapshot().conflict, { kind: 'changed' })
  assert.deepEqual(await ctl.prepareLeave(), {
    action: 'confirmLoss',
    unsavedCompletedSets: 1,
  })
})

test('W15 이동 조건은 저장 상태와 완료 세트에 따라 달라진다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  assert.deepEqual(ctl.getSnapshot().result, {
    ok: false,
    reason: 'noCompletedSets',
  })
  repo.hold = true
  ctl.complete()
  assert.deepEqual(ctl.getSnapshot().result, { ok: false, reason: 'saving' })
  repo.hold = false
  repo.releaseAll()
  await ctl.idle()
  const ready = ctl.getSnapshot().result
  assert.equal(ready.ok, true)
  assert.equal(ready.completedSets, 1)
  assert.equal(ready.incompleteSets, 6)
  repo.failNext = new R.WorkoutStoreError('quota')
  ctl.complete()
  await ctl.idle()
  assert.deepEqual(ctl.getSnapshot().result, {
    ok: false,
    reason: 'saveFailed',
  })
})

// ── 변경 알림 ───────────────────────────────────────────────────────
test('구독: 변경될 때마다 새 snapshot 객체로 알리고 해제하면 알리지 않는다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = make(repo)
  let count = 0
  const off = ctl.subscribe(() => {
    count += 1
  })
  const first = ctl.getSnapshot()
  ctl.activate()
  await settle()
  assert.notEqual(ctl.getSnapshot(), first)
  const seen = count
  assert.ok(seen > 0)
  const same = ctl.getSnapshot()
  assert.equal(ctl.getSnapshot(), same) // 변경이 없으면 같은 객체
  off()
  ctl.complete()
  await ctl.idle()
  assert.equal(count, seen)
})

// ── 그만두기 ────────────────────────────────────────────────────────
test('그만두기: 진행 중인 저장을 기다린 뒤 마지막 revision으로 요청하고 진행 중인 세션이 없는 상태가 된다', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const { ctl } = await start(repo)
  repo.hold = true
  ctl.complete()
  const pending = ctl.abandon() // 저장이 끝나기를 기다린다
  await settle()
  assert.equal(repo.abandons.length, 0)
  repo.hold = false
  repo.releaseAll()
  const result = await pending
  assert.deepEqual(result, { ok: true })
  assert.equal(repo.abandons.length, 1)
  assert.equal(repo.abandons[0].options.expectedRevision, 2) // 내 저장이 반영된 뒤의 revision
  assert.equal(repo.session.status, 'interrupted') // 완료한 세트가 있었다
  assert.equal(ctl.getSnapshot().load.status, 'none')
  assert.equal(ctl.getSnapshot().session, null)
})

test('그만두기: 완료 세트가 없으면 cancelled, 다른 탭이 먼저 바꿨으면 충돌이며 그만두지 않는다', async () => {
  const repo = fakeRepo(newStored())
  const a = await start(repo)
  assert.deepEqual(await a.ctl.abandon(), { ok: true })
  assert.equal(repo.session.status, 'cancelled')

  const repo2 = fakeRepo(newStored({ revision: 1 }))
  const b = await start(repo2)
  repo2.external((s) => {
    s.performed[0][0] = { completed: true, actualReps: 10 }
  })
  const result = await b.ctl.abandon()
  assert.deepEqual(result, { ok: false, reason: 'conflict' })
  assert.deepEqual(b.ctl.getSnapshot().conflict, { kind: 'changed' })
  assert.equal(repo2.session.status, 'in_progress')
})

test('그만두기 실패와 충돌 상태·준비 안 됨', async () => {
  const repo = fakeRepo(newStored())
  const { ctl } = await start(repo)
  repo.abandonError = new R.WorkoutStoreError('quota')
  assert.deepEqual(await ctl.abandon(), {
    ok: false,
    reason: 'failed',
    failure: 'quota',
  })
  assert.equal(ctl.getSnapshot().load.status, 'ready')
  repo.abandonError = new R.WorkoutStoreError('conflict', {
    code: 'sessionEnded',
  })
  assert.deepEqual(await ctl.abandon(), { ok: false, reason: 'conflict' })
  assert.deepEqual(ctl.getSnapshot().conflict, { kind: 'ended' })
  assert.deepEqual(await ctl.abandon(), { ok: false, reason: 'conflict' })

  const none = await start(fakeRepo(null))
  assert.deepEqual(await none.ctl.abandon(), { ok: false, reason: 'notReady' })
})

// ── 탭 복귀 ─────────────────────────────────────────────────────────
test('탭 복귀: 미저장 변경이 없으면 다른 곳의 변경을 반영하고 타이머는 자동 재개하지 않는다', async () => {
  const repo = fakeRepo(timeStored({ revision: 2 }))
  const { ctl } = await start(repo)
  repo.external((s) => {
    s.performed[0][0] = { completed: true, actualReps: 11 }
    s.timer = { accumulatedMs: 0, runningSince: iso(T0) } // 다른 탭이 측정 중
    s.lastSavedAt = iso(new Date(T0.getTime() + 4000))
  })
  await ctl.syncOnReturn()
  await ctl.idle()
  const snap = ctl.getSnapshot()
  assert.equal(snap.session.performed[0][0].actualReps, 11)
  assert.equal(snap.timerRunning, false)
  assert.equal(snap.session.timer.accumulatedMs, 4000) // 마지막 저장까지만 인정
  assert.equal(repo.session.timer.runningSince, null) // 정지 상태 복원을 저장
  assert.equal(snap.conflict, null)
  assert.equal(snap.save.dirty, false)
})

test('탭 복귀: 미저장 변경·저장 중·저장 실패에서는 덮어쓰지 않는다', async () => {
  const repo = fakeRepo(newStored({ revision: 1 }))
  const { ctl } = await start(repo)
  repo.failNext = new R.WorkoutStoreError('quota')
  ctl.complete()
  await ctl.idle()
  repo.external((s) => {
    s.performed[1][0] = { completed: true, actualReps: 9 }
  })
  const before = ctl.getSnapshot().session.performed
  await ctl.syncOnReturn()
  const snap = ctl.getSnapshot()
  assert.equal(snap.save.dirty, true)
  assert.deepEqual(snap.session.performed, before) // 로컬 값이 그대로
  assert.equal(snap.conflict, null)
  assert.equal(repo.getCalls, 0) // 읽지도 않았다
})

test('탭 복귀: 같은 revision이면 아무것도 바꾸지 않고, 세션이 끝났거나 사라졌으면 충돌로 알린다', async () => {
  const repo = fakeRepo(newStored({ revision: 3 }))
  const { ctl, emits } = await start(repo)
  const count = emits.length
  await ctl.syncOnReturn()
  assert.equal(emits.length, count)

  repo.external((s) => {
    s.status = 'completed'
    s.endedAt = iso(T0)
    s.completedAt = iso(T0)
    s.recordId = 'rec'
  })
  await ctl.syncOnReturn()
  assert.deepEqual(ctl.getSnapshot().conflict, { kind: 'ended' })

  const repo2 = fakeRepo(newStored())
  const other = await start(repo2)
  repo2.getReturnsNull = true
  await other.ctl.syncOnReturn()
  assert.deepEqual(other.ctl.getSnapshot().conflict, { kind: 'gone' })
})

test('탭 복귀: 읽기에 실패하면 화면 상태를 바꾸지 않는다', async () => {
  const repo = fakeRepo(newStored())
  const { ctl, emits } = await start(repo)
  repo.api.get = async () => {
    throw new R.WorkoutStoreError('unavailable')
  }
  const count = emits.length
  await ctl.syncOnReturn()
  assert.equal(emits.length, count)
  assert.equal(ctl.getSnapshot().conflict, null)
  assert.equal(ctl.getSnapshot().save.failed, false)
})
