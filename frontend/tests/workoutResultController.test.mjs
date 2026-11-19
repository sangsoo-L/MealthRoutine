import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// W15 최종 저장 컨트롤러 검증. 실제 IndexedDB 저장소의 계약(workoutModel의 실제 규칙·complete 멱등성·revision 정책)을 따르는 가짜 저장소를 쓴다.
// 실제 IndexedDB 통합은 노드에서 검증할 수 없다(브라우저 API). 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let RC
let WR
let M
let R
let SC

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  RC = await server.ssrLoadModule('/src/exercise/workoutResultController.ts')
  WR = await server.ssrLoadModule('/src/exercise/workoutResult.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  R = await server.ssrLoadModule('/src/exercise/workoutRepositories.ts')
  SC = await server.ssrLoadModule('/src/exercise/workoutSessionController.ts')
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-13T03:00:00.000Z')
const NOW = new Date('2026-11-13T04:00:00.000Z')
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })
const settle = async () => {
  for (let i = 0; i < 8; i++)
    await new Promise((resolve) => setTimeout(resolve, 0))
}
const plain = (value) => JSON.parse(JSON.stringify(value))
const storeError = (reason, code) => new R.WorkoutStoreError(reason, { code })

/** 횟수형 3세트(e1), 중량형 2세트(e2), 시간형 2세트(e3). */
function makeList() {
  return {
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-13',
    catalogVersion: 'dev-mock-1',
    revision: 1,
    requestId: 'r1',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [
      {
        exerciseId: 'e1',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }],
      },
      {
        exerciseId: '305',
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
const ALL = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [2, 0],
  [2, 1],
]
function mkSession({ id = 's1', ownerId = 'u', done = ALL, ...over } = {}) {
  const base = M.createWorkoutSession({
    id,
    ownerId,
    list: { ...makeList(), ownerId },
    now: T0,
  })
  const performed = base.performed.map((sets) => sets.map((s) => ({ ...s })))
  for (const [i, j] of done) {
    const item = base.listSnapshot.items[i]
    const target = item.sets[j]
    performed[i][j] =
      item.recordType === 'time'
        ? { completed: true, measuredMs: 30_000 }
        : item.recordType === 'weight'
          ? target.weightKg === undefined
            ? { completed: true, actualReps: target.reps, actualWeightKg: 10 } // A안: 목표 중량이 없어도 실제 중량이 있다
            : {
                completed: true,
                actualReps: target.reps,
                actualWeightKg: target.weightKg,
              }
          : { completed: true, actualReps: target.reps }
  }
  return { ...base, performed, ...over }
}

/**
 * 저장소 계약을 따르는 가짜 저장소(세션·기록 공유). 실제 저장소와 같은 규칙:
 * - get은 없거나 다른 계정이면 null, 동작 대상이 없거나 다른 계정이면 notFound
 * - saveProgress: 끝난 세션 conflict(sessionNotInProgress) / 값 검증 validation / revision 불일치 conflict(revisionMismatch)
 * - complete: 이미 완료됐으면 기존 기록(created=false, expectedRevision 무시), 진행 중이 아니면 conflict(sessionEnded),
 *   revision 불일치 conflict, 완료 세트 없으면 validation(noCompletedSets)
 * 결함 주입: faults.<method>에 { error } (적용 전 실패) 또는 { error, lose: true } (적용 후 응답 유실)를 넣는다.
 */
function makeStore(sessions) {
  const st = {
    sessions: new Map(sessions.map((s) => [s.id, structuredClone(s)])),
    records: new Map(),
    calls: { get: [], getActive: 0, save: [], complete: [], records: [] },
    faults: { get: [], save: [], complete: [], records: [] },
    holdOn: { get: false, save: false, complete: false },
    held: { get: [], save: [], complete: [] },
    seq: 0,
    release(name) {
      st.held[name].shift()?.()
    },
    releaseAll(name) {
      st.holdOn[name] = false
      while (st.held[name].length) st.held[name].shift()()
    },
    /** 다른 탭에서의 변경(revision 증가). */
    external(id, change) {
      const s = st.sessions.get(id)
      change(s)
      s.revision += 1
    },
  }
  const gate = async (name) => {
    if (st.holdOn[name])
      await new Promise((resolve) => st.held[name].push(resolve))
  }
  st.api = (ownerId, { leaky = false } = {}) => {
    const visible = (s) => s && (leaky || s.ownerId === ownerId)
    const target = (id) => {
      const s = st.sessions.get(id)
      if (!visible(s)) throw new R.WorkoutStoreError('notFound')
      return s
    }
    return {
      repository: {
        async get(id) {
          st.calls.get.push(id)
          await gate('get')
          const f = st.faults.get.shift()
          if (f) throw f.error
          const s = st.sessions.get(id)
          return visible(s) ? structuredClone(s) : null
        },
        async getActive() {
          st.calls.getActive += 1
          const found = [...st.sessions.values()].find(
            (s) => s.status === 'in_progress' && visible(s),
          )
          return found ? structuredClone(found) : null
        },
        async saveProgress(id, input) {
          st.calls.save.push({ id, input: structuredClone(input) })
          await gate('save')
          const f = st.faults.save.shift()
          if (f && !f.lose) throw f.error
          const s = target(id)
          if (s.status !== 'in_progress')
            throw storeError('conflict', 'sessionNotInProgress')
          if (!M.validateProgressInput(input, s.listSnapshot))
            throw storeError('validation', 'invalidProgress')
          if (input.expectedRevision !== s.revision)
            throw new R.WorkoutStoreError('conflict', {
              code: 'revisionMismatch',
              currentRevision: s.revision,
            })
          const next = structuredClone(M.applyProgress(s, input, NOW))
          st.sessions.set(id, next)
          if (f?.lose) throw f.error
          return structuredClone(next)
        },
        async complete(id, options = {}) {
          st.calls.complete.push({
            id,
            expectedRevision: options.expectedRevision,
          })
          await gate('complete')
          const f = st.faults.complete.shift()
          if (f && !f.lose) throw f.error
          const s = target(id)
          let out
          if (s.status === 'completed') {
            out = {
              session: structuredClone(s),
              record: structuredClone(st.records.get(s.recordId)),
              created: false,
            }
          } else {
            if (s.status !== 'in_progress')
              throw storeError('conflict', 'sessionEnded')
            if (
              options.expectedRevision !== undefined &&
              options.expectedRevision !== s.revision
            )
              throw new R.WorkoutStoreError('conflict', {
                code: 'revisionMismatch',
                currentRevision: s.revision,
              })
            const record = M.buildWorkoutRecord({
              id: `rec${++st.seq}`,
              session: s,
              now: NOW,
            })
            if (!record) throw storeError('validation', 'noCompletedSets')
            st.records.set(record.id, record)
            const done = {
              ...s,
              status: 'completed',
              completedAt: record.completedAt,
              endedAt: record.completedAt,
              recordId: record.id,
              revision: s.revision + 1,
              lastSavedAt: record.completedAt,
            }
            st.sessions.set(id, done)
            out = {
              session: structuredClone(done),
              record: structuredClone(record),
              created: true,
            }
          }
          if (f?.lose) throw f.error
          return out
        },
      },
      records: {
        async getBySession(sessionId) {
          st.calls.records.push(sessionId)
          const f = st.faults.records.shift()
          if (f) throw f.error
          const found = [...st.records.values()].find(
            (r) =>
              r.sessionId === sessionId && (leaky || r.ownerId === ownerId),
          )
          return found ? structuredClone(found) : null
        },
      },
    }
  }
  return st
}

async function start(store, options = {}) {
  const {
    sessionId = 's1',
    ownerId = 'u',
    apiOwner = ownerId,
    leaky = false,
    w14,
    pass = true,
  } = options
  const api = store.api(apiOwner, { leaky })
  const ctl = RC.createWorkoutResultController({
    repository: api.repository,
    records: api.records,
    sessionId,
    ownerId: pass ? ownerId : undefined,
    w14,
    now: () => NOW,
  })
  ctl.activate()
  await settle()
  return ctl
}
const snap = (ctl) => ctl.getSnapshot()
const editReps = (ctl, i, j, value) =>
  ctl.edit({ kind: 'reps', position: pos(i, j), value })
const writes = (store) => [
  ...store.calls.save.map(() => 'save'),
  ...store.calls.complete.map(() => 'complete'),
]

// ─── 정상 저장 ─────────────────────────────────────────────

test('1. 변경 없음 → saveProgress 없이 complete만 호출한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  assert.equal(snap(ctl).load.status, 'ready')
  assert.equal(snap(ctl).canSubmit, true)
  assert.equal(snap(ctl).saved, false)
  const result = await ctl.submit()
  assert.equal(result.ok, true)
  assert.equal(store.calls.save.length, 0)
  assert.equal(store.calls.complete.length, 1)
  assert.equal(snap(ctl).phase, 'success')
  assert.equal(snap(ctl).saved, true)
})

test('2~3. 변경 있음 → saveProgress 성공 확인 후 최신 revision으로 complete', async () => {
  const store = makeStore([mkSession({ revision: 5 })])
  const ctl = await start(store)
  assert.equal(editReps(ctl, 0, 0, 12).ok, true)
  assert.equal(snap(ctl).hasChanges, true)
  const result = await ctl.submit()
  assert.equal(result.ok, true)
  assert.deepEqual(writes(store), ['save', 'complete'])
  // 저장은 읽은 revision으로, complete는 저장이 만든 새 revision(이전 revision 아님)으로 보낸다.
  assert.equal(store.calls.save[0].input.expectedRevision, 5)
  assert.equal(store.calls.save[0].input.performed[0][0].actualReps, 12)
  assert.equal(store.calls.complete[0].expectedRevision, 6)
  assert.equal(snap(ctl).session.revision, 7)
})

test('4. 완료 기록 정상 반환(편집값·목표·ID 유지)', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  ctl.edit({ kind: 'weightKg', position: pos(1, 0), value: '10.5' })
  const result = await ctl.submit()
  assert.equal(result.ok, true)
  const record = result.record
  assert.equal(record.sessionId, 's1')
  assert.equal(record.exercises[0].completedSets[0].actualReps, 12)
  assert.equal(record.exercises[1].completedSets[0].actualWeightKg, 10.5)
  assert.deepEqual(record.exercises[1].completedSets[0].target, {
    reps: 10,
    weightKg: 8,
  })
  assert.deepEqual(
    record.exercises.map((e) => e.exerciseId),
    ['e1', '305', 'e3'],
  )
  assert.notEqual(M.parseWorkoutRecord(plain(record)), null)
  assert.deepEqual(snap(ctl).record, record)
  assert.equal(store.records.size, 1)
})

test('5. 부분 완료 저장', async () => {
  const store = makeStore([
    mkSession({
      done: [
        [0, 0],
        [0, 1],
      ],
    }),
  ])
  const ctl = await start(store)
  assert.equal(snap(ctl).summary.partial, true)
  const result = await ctl.submit()
  assert.equal(result.ok, true)
  assert.equal(result.record.totals.completedSetCount, 2)
  assert.equal(result.record.totals.plannedSetCount, 7)
  assert.equal(WR.deriveRecordResultStatus(result.record), 'partial')
})

test('6. 전체 완료 저장', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  assert.equal(snap(ctl).summary.allCompleted, true)
  const result = await ctl.submit()
  assert.equal(WR.deriveRecordResultStatus(result.record), 'full')
  assert.equal(result.record.totals.measuredMs, 60_000)
})

// ─── 중복 방지 ─────────────────────────────────────────────

test('7. 저장 버튼 연속 클릭·saveProgress/complete 진행 중 재클릭은 하나의 실행을 공유한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.holdOn.save = true
  store.holdOn.complete = true
  const p1 = ctl.submit()
  const p2 = ctl.submit()
  await settle()
  assert.equal(p1, p2) // 같은 실행
  assert.equal(snap(ctl).phase, 'savingProgress')
  assert.equal(snap(ctl).canSubmit, false)
  const p3 = ctl.submit() // saveProgress 진행 중 재클릭
  store.release('save')
  await settle()
  assert.equal(snap(ctl).phase, 'completing')
  const p4 = ctl.submit() // complete 진행 중 재클릭
  assert.equal(p3, p4)
  store.release('complete')
  const results = await Promise.all([p1, p2, p3, p4])
  assert.ok(results.every((r) => r.ok))
  assert.equal(store.calls.save.length, 1)
  assert.equal(store.calls.complete.length, 1)
  assert.equal(store.records.size, 1)
  // 성공 뒤 다시 눌러도 저장소를 부르지 않는다.
  const again = await ctl.submit()
  assert.equal(again.ok, true)
  assert.equal(store.calls.save.length, 1)
  assert.equal(store.calls.complete.length, 1)
})

test('8. 컨트롤러가 둘(StrictMode·두 탭)이어도 동시 저장에서 기록은 하나다', async () => {
  const store = makeStore([mkSession()])
  const a = await start(store)
  const b = await start(store)
  editReps(a, 0, 0, 12)
  editReps(b, 0, 0, 12) // 같은 편집
  const [ra, rb] = await Promise.all([a.submit(), b.submit()])
  assert.equal(store.records.size, 1)
  assert.equal(ra.ok, true, JSON.stringify(ra))
  assert.equal(rb.ok, true, JSON.stringify(rb))
  assert.equal(ra.record.id, rb.record.id)
})

test('9. 이미 완료된 세션 재요청: 기록을 확인해 보여 주고 다시 완료하지 않는다', async () => {
  const store = makeStore([mkSession()])
  const first = await start(store)
  const done = await first.submit()
  assert.equal(done.ok, true)
  // 다시 열기: sessionId로 열면 완료된 세션의 기록을 확인한다(저장 화면이 아니다).
  const reopened = await start(store)
  assert.equal(snap(reopened).load.status, 'completed')
  assert.equal(snap(reopened).alreadyCompleted, true)
  assert.equal(snap(reopened).saved, true)
  assert.equal(snap(reopened).record.id, done.record.id)
  assert.equal(snap(reopened).canSubmit, false)
  const result = await reopened.submit()
  assert.deepEqual(plain(result), { ok: false, reason: 'notReady' })
  assert.equal(store.calls.complete.length, 1)
  assert.equal(store.records.size, 1)
})

test('10~11. complete 응답 유실 → 재시도는 다시 읽어 완료를 확인하고 중복 기록 없이 성공한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.complete.push({
    error: new R.WorkoutStoreError('error'),
    lose: true,
  })
  const first = await ctl.submit()
  assert.equal(first.ok, false)
  assert.equal(first.reason, 'failed')
  assert.equal(first.stage, 'completing')
  assert.equal(first.retryable, true)
  assert.equal(snap(ctl).phase, 'retryableError')
  assert.equal(snap(ctl).progressSaved, true)
  assert.equal(snap(ctl).saved, false) // 확인 전에는 성공이 아니다
  assert.equal(store.records.size, 1) // 실제로는 완료됐다
  const second = await ctl.submit()
  assert.equal(second.ok, true)
  assert.equal(store.calls.complete.length, 1) // complete를 다시 부르지 않았다
  assert.equal(store.calls.save.length, 1)
  assert.equal(store.records.size, 1)
  assert.equal(snap(ctl).saved, true)
  assert.equal(second.record.exercises[0].completedSets[0].actualReps, 12)
})

test('11-1. complete가 적용 전에 실패한 뒤 재시도: 멱등 complete로 기록은 하나', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  store.faults.complete.push({ error: new R.WorkoutStoreError('error') })
  const first = await ctl.submit()
  assert.equal(first.reason, 'failed')
  assert.equal(store.records.size, 0)
  const second = await ctl.submit()
  assert.equal(second.ok, true)
  assert.equal(store.calls.complete.length, 2)
  assert.equal(store.records.size, 1)
})

// ─── 실패 복구 ─────────────────────────────────────────────

test('12. saveProgress 실패: 편집값을 남기고 재시도하면 저장을 다시 보낸다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.save.push({ error: new R.WorkoutStoreError('quota') })
  const first = await ctl.submit()
  assert.equal(first.reason, 'failed')
  assert.equal(first.stage, 'savingProgress')
  assert.equal(first.failure, 'quota')
  assert.equal(snap(ctl).progressSaved, false)
  assert.equal(snap(ctl).retryable, true)
  assert.match(snap(ctl).message, /저장 공간/)
  assert.equal(snap(ctl).draft.performed[0][0].actualReps, 12) // 편집값 보존
  assert.equal(store.calls.complete.length, 0) // 저장 실패 뒤 complete를 부르지 않는다
  const second = await ctl.submit()
  assert.equal(second.ok, true)
  assert.equal(store.calls.save.length, 2)
  assert.equal(second.record.exercises[0].completedSets[0].actualReps, 12)
})

test('13. saveProgress 응답 유실: 재시도는 같은 저장을 반복하지 않고 complete만 한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.save.push({
    error: new R.WorkoutStoreError('error'),
    lose: true,
  })
  const first = await ctl.submit()
  assert.equal(first.reason, 'failed')
  assert.equal(first.stage, 'savingProgress')
  assert.equal(store.sessions.get('s1').performed[0][0].actualReps, 12) // 실제로는 반영됨
  const second = await ctl.submit()
  assert.equal(second.ok, true)
  assert.equal(store.calls.save.length, 1)
  assert.equal(store.calls.complete.length, 1)
  assert.equal(store.calls.complete[0].expectedRevision, 2) // 반영된 최신 revision
})

test('14~15. saveProgress 성공 후 complete 실패: 편집값은 저장됨을 알리고 complete만 재시도한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.complete.push({ error: new R.WorkoutStoreError('unavailable') })
  const first = await ctl.submit()
  assert.equal(first.reason, 'failed')
  assert.equal(first.stage, 'completing')
  assert.equal(first.failure, 'unavailable')
  assert.equal(snap(ctl).progressSaved, true)
  assert.match(snap(ctl).message, /수정한 값은 저장됐지만/)
  assert.equal(snap(ctl).editLocked, true)
  assert.equal(editReps(ctl, 0, 1, 3).reason, 'locked')
  const second = await ctl.submit()
  assert.equal(second.ok, true)
  assert.equal(store.calls.save.length, 1) // 동일한 저장을 반복하지 않는다
  assert.equal(store.calls.complete.length, 2)
  assert.equal(store.calls.complete[1].expectedRevision, 2)
})

test('16. 재시도 전에 저장소를 다시 읽어 저장 상태를 판별한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.save.push({ error: new R.WorkoutStoreError('error') })
  await ctl.submit()
  const readsBefore = store.calls.get.length // 불러오기 1회
  await ctl.submit()
  assert.ok(store.calls.get.length > readsBefore)
})

test('17. 저장 중 새로고침: 새 컨트롤러가 저장된 값을 읽어 이어 가고, 완료됐다면 기록을 보여 준다', async () => {
  // 편집값 저장은 반영됐지만 complete 전에 새로고침
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.complete.push({ error: new R.WorkoutStoreError('error') })
  await ctl.submit()
  ctl.deactivate() // 새로고침
  const reloaded = await start(store)
  assert.equal(snap(reloaded).load.status, 'ready')
  assert.equal(snap(reloaded).draft.performed[0][0].actualReps, 12)
  assert.equal(snap(reloaded).hasChanges, false) // 저장된 값이 기준
  const result = await reloaded.submit()
  assert.equal(result.ok, true)
  assert.equal(store.calls.save.length, 1) // 새 컨트롤러도 저장을 반복하지 않는다
  assert.equal(result.record.exercises[0].completedSets[0].actualReps, 12)

  // complete가 반영됐는데 응답을 잃고 새로고침
  const store2 = makeStore([mkSession()])
  const ctl2 = await start(store2)
  store2.faults.complete.push({
    error: new R.WorkoutStoreError('error'),
    lose: true,
  })
  await ctl2.submit()
  ctl2.deactivate()
  const reloaded2 = await start(store2)
  assert.equal(snap(reloaded2).load.status, 'completed')
  assert.equal(snap(reloaded2).saved, true)
  assert.equal(store2.records.size, 1)
  assert.equal(store2.calls.complete.length, 1)
})

// ─── 충돌 ──────────────────────────────────────────────────

test('18. revisionMismatch: 다시 읽어 저장 상태가 다르면 충돌(changed)이고 쓰지 않는다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.external('s1', (s) => {
    s.timer = { accumulatedMs: 1000, runningSince: null }
  })
  const result = await ctl.submit()
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'conflict')
  assert.deepEqual(plain(result.conflict), {
    kind: 'changed',
    recordMismatch: false,
  })
  assert.equal(snap(ctl).phase, 'conflict')
  assert.equal(snap(ctl).retryable, false)
  assert.equal(store.calls.complete.length, 0)
  // 변경이 없는 저장도 complete에서 revision이 달라졌으면 같은 판별을 한다.
  const store2 = makeStore([mkSession()])
  const ctl2 = await start(store2)
  store2.external('s1', (s) => {
    s.timer = { accumulatedMs: 1000, runningSince: null }
  })
  const result2 = await ctl2.submit()
  assert.equal(result2.reason, 'conflict')
  assert.equal(store2.calls.complete.length, 1)
  assert.equal(store2.records.size, 0)
})

test('19. changed: 편집값은 지우지 않고 사유를 구조화해 전달한다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.external('s1', (s) => {
    s.performed[0][1].actualReps = 5
  })
  await ctl.submit()
  const s = snap(ctl)
  assert.deepEqual(plain(s.conflict), {
    kind: 'changed',
    recordMismatch: false,
  })
  assert.match(s.message, /다른 곳에서/)
  assert.equal(s.draft.performed[0][0].actualReps, 12) // 사용자의 편집값 유지
  assert.equal(s.saved, false)
  assert.equal(s.canSubmit, false)
})

test('20. ended: 다른 곳에서 중단·취소된 세션', async () => {
  for (const status of ['interrupted', 'cancelled']) {
    const store = makeStore([mkSession()])
    const ctl = await start(store)
    editReps(ctl, 0, 0, 12)
    store.external('s1', (s) => {
      s.status = status
      s.endedAt = NOW.toISOString()
    })
    const result = await ctl.submit()
    assert.equal(result.reason, 'conflict', status)
    assert.deepEqual(plain(result.conflict), {
      kind: 'ended',
      recordMismatch: false,
    })
    assert.equal(store.calls.complete.length, 0)
  }
})

test('21. gone: 세션이 사라졌다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.sessions.delete('s1')
  const result = await ctl.submit()
  assert.equal(result.reason, 'conflict')
  assert.deepEqual(plain(result.conflict), {
    kind: 'gone',
    recordMismatch: false,
  })
})

test('22. 다른 탭 변경은 자신의 저장으로 인정하지 않는다', async () => {
  // (a) 다른 탭이 다른 세트를 고침 → 충돌, 다른 탭 값은 덮어쓰지 않는다.
  const a = makeStore([mkSession()])
  const ctlA = await start(a)
  editReps(ctlA, 0, 0, 12)
  a.external('s1', (s) => {
    s.performed[0][1].actualReps = 5
  })
  assert.equal((await ctlA.submit()).reason, 'conflict')
  assert.equal(a.sessions.get('s1').performed[0][1].actualReps, 5)
  assert.equal(a.sessions.get('s1').performed[0][0].actualReps, 10) // 내 편집이 쓰이지 않았다

  // (b) 다른 탭이 다른 편집값으로 먼저 완료 → 기록이 내 요청과 다르므로 성공이 아니다.
  const b = makeStore([mkSession()])
  const mine = await start(b)
  const other = await start(b)
  editReps(mine, 0, 0, 12)
  editReps(other, 0, 0, 99)
  assert.equal((await other.submit()).ok, true)
  const result = await mine.submit()
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'conflict')
  assert.deepEqual(plain(result.conflict), {
    kind: 'ended',
    recordMismatch: true,
  })
  assert.equal(snap(mine).saved, false)
  assert.equal(b.records.size, 1)
  assert.equal(
    [...b.records.values()][0].exercises[0].completedSets[0].actualReps,
    99,
  )

  // (c) 변경 없는 두 탭: 다른 탭이 먼저 완료했어도 기록이 내 요청과 같으면 성공(중복 기록 없음).
  const c = makeStore([mkSession()])
  const first = await start(c)
  const second = await start(c)
  assert.equal((await first.submit()).ok, true)
  const same = await second.submit()
  assert.equal(same.ok, true)
  assert.equal(c.records.size, 1)
  assert.equal(same.record.id, [...c.records.values()][0].id)

  // (d) 완료 기록이 내 요청과 다른 상태에서 변경 없는 저장(complete 멱등 응답)도 성공이 아니다.
  const d = makeStore([mkSession()])
  const mineD = await start(d)
  const otherD = await start(d)
  editReps(otherD, 0, 0, 99)
  assert.equal((await otherD.submit()).ok, true)
  const resultD = await mineD.submit()
  assert.equal(resultD.reason, 'conflict')
  assert.equal(resultD.conflict.recordMismatch, true)
})

test('23. 자동 병합 없음: 충돌 뒤에는 저장소를 더 부르지 않고, 최신 불러오기는 편집값 확인을 받는다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.external('s1', (s) => {
    s.performed[0][1].actualReps = 5
  })
  await ctl.submit()
  const saves = store.calls.save.length
  const completes = store.calls.complete.length
  const gets = store.calls.get.length
  const again = await ctl.submit()
  assert.equal(again.reason, 'conflict')
  assert.equal(store.calls.save.length, saves)
  assert.equal(store.calls.complete.length, completes)
  assert.equal(store.calls.get.length, gets)
  // 편집값이 있으면 확인 없이 불러오지 않는다.
  const refused = await ctl.reloadLatest()
  assert.deepEqual(plain(refused), { ok: false, reason: 'confirmRequired' })
  assert.equal(snap(ctl).draft.performed[0][0].actualReps, 12)
  const reloaded = await ctl.reloadLatest(true)
  assert.equal(reloaded.ok, true)
  assert.equal(snap(ctl).conflict, null)
  assert.equal(snap(ctl).load.status, 'ready')
  assert.equal(snap(ctl).draft.performed[0][1].actualReps, 5) // 최신 저장 값 기준
  assert.equal(snap(ctl).draft.performed[0][0].actualReps, 10)
  assert.equal(snap(ctl).hasChanges, false)
  // 최신 값으로 다시 저장할 수 있다.
  assert.equal((await ctl.submit()).ok, true)
})

// ─── 안전성 ────────────────────────────────────────────────

test('24. 다른 계정의 세션·기록 접근 차단', async () => {
  const store = makeStore([mkSession()])
  // 저장소가 걸러낸다(get → null)
  const other = await start(store, { ownerId: 'x' })
  assert.equal(snap(other).load.status, 'notFound')
  assert.deepEqual(plain(await other.submit()), {
    ok: false,
    reason: 'notReady',
  })
  // 저장소가 걸러내지 못해도(누수) 컨트롤러가 없음으로 취급한다.
  const leaky = await start(store, { ownerId: 'x', leaky: true })
  assert.equal(snap(leaky).load.status, 'notFound')
  assert.equal(snap(leaky).draft, null)
  const leakyActive = await start(store, {
    sessionId: null,
    ownerId: 'x',
    leaky: true,
  })
  assert.equal(snap(leakyActive).load.status, 'none')
  assert.equal(store.calls.save.length, 0)
  assert.equal(store.calls.complete.length, 0)
  // 다른 계정의 완료 기록 조회 금지
  const done = await (await start(store)).submit()
  assert.equal(done.ok, true)
  const foreignView = await start(store, { ownerId: 'x', leaky: true })
  assert.equal(snap(foreignView).load.status, 'notFound')
  assert.equal(snap(foreignView).record, null)
  const own = await start(store)
  assert.equal(snap(own).record.ownerId, 'u')
})

test('25. 계정 전환·비활성화 뒤 도착한 응답은 무시한다', async () => {
  const store = makeStore([mkSession()])
  // 불러오는 중에 비활성화
  store.holdOn.get = true
  const loading = await start(store)
  assert.equal(snap(loading).load.status, 'loading')
  loading.deactivate()
  store.releaseAll('get')
  await settle()
  assert.equal(snap(loading).load.status, 'loading') // 지난 응답이 상태를 바꾸지 않았다
  assert.equal(snap(loading).session, null)

  // 저장 중에 비활성화(계정 전환): 응답은 버려지고 성공으로 표시하지 않는다.
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.holdOn.save = true
  const pending = ctl.submit()
  await settle()
  ctl.deactivate()
  store.releaseAll('save')
  assert.deepEqual(plain(await pending), { ok: false, reason: 'inactive' })
  assert.notEqual(snap(ctl).phase, 'success')
  assert.equal(snap(ctl).record, null)
  assert.equal(store.calls.complete.length, 0) // 비활성화 뒤에는 이어서 저장하지 않는다
  assert.deepEqual(plain(await ctl.submit()), { ok: false, reason: 'inactive' })
  // 새 컨트롤러(같은 계정)는 저장소를 다시 읽어 이어 간다.
  const next = await start(store)
  assert.equal(snap(next).draft.performed[0][0].actualReps, 12)
  assert.equal((await next.submit()).ok, true)
  assert.equal(store.records.size, 1)
})

test('26. 세션 전환·잘못된 sessionId: 이전 응답 무시, 다른 세션으로 대체하지 않는다', async () => {
  const store = makeStore([
    mkSession({ id: 's1' }),
    mkSession({ id: 's2', done: [[0, 0]] }),
  ])
  store.holdOn.get = true
  const first = await start(store, { sessionId: 's1' })
  first.deactivate() // 화면이 s2로 바뀜
  store.holdOn.get = false
  const second = await start(store, { sessionId: 's2' })
  store.releaseAll('get')
  await settle()
  assert.equal(snap(first).load.status, 'loading')
  assert.equal(snap(second).sessionId, 's2')
  assert.equal(snap(second).summary.completedSetCount, 1)

  // 잘못된 sessionId는 다른 활성 세션으로 대체하지 않는다.
  const before = { get: store.calls.get.length, active: store.calls.getActive }
  for (const bad of ['', ' s1', 's1 ', 'x'.repeat(201)]) {
    const ctl = await start(store, { sessionId: bad })
    assert.equal(snap(ctl).load.status, 'invalidSessionId', JSON.stringify(bad))
    assert.equal(snap(ctl).draft, null)
  }
  assert.equal(store.calls.get.length, before.get)
  assert.equal(store.calls.getActive, before.active)
  const unknown = await start(store, { sessionId: 'nope' })
  assert.equal(snap(unknown).load.status, 'notFound')
  assert.equal(store.calls.getActive, before.active) // getActive로 대체하지 않았다
  // sessionId가 없을 때만 getActive를 쓴다.
  const active = await start(store, { sessionId: null })
  assert.equal(snap(active).load.status, 'ready')
  assert.equal(store.calls.getActive, before.active + 1)

  // 최신 불러오기가 진행 중인 저장의 응답을 버린다.
  const ctl = await start(store, { sessionId: 's1' })
  editReps(ctl, 0, 0, 12)
  store.holdOn.save = true
  const pending = ctl.submit()
  await settle()
  const reload = ctl.reloadLatest(true)
  store.releaseAll('save')
  assert.equal((await pending).reason, 'inactive')
  assert.equal((await reload).ok, true)
  assert.equal(snap(ctl).phase, 'idle')
  // 보류된 저장이 반영되기 전에 다시 읽었으므로 화면은 그 시점의 저장 값(10)이다. 저장소에는 지난 요청이 뒤늦게 반영(12)됐다.
  assert.equal(snap(ctl).draft.performed[0][0].actualReps, 10)
  assert.equal(snap(ctl).hasChanges, false)
  assert.equal(store.sessions.get('s1').performed[0][0].actualReps, 12)
  // 이 어긋남은 다음 저장에서 revision으로 드러나고, 병합하지 않고 충돌로 멈춘다(저장된 12를 덮어쓰지 않는다).
  const stale = await ctl.submit()
  assert.equal(stale.reason, 'conflict')
  assert.equal(stale.conflict.kind, 'changed')
  assert.equal(store.sessions.get('s1').performed[0][0].actualReps, 12)
  assert.equal(store.records.size, 0)
})

test('27. 실행 중 타이머가 있으면 저장하지 않는다(저장된 세션·W14 상태 모두)', async () => {
  const running = mkSession({
    timer: { accumulatedMs: 0, runningSince: T0.toISOString() },
  })
  const store = makeStore([running])
  const ctl = await start(store)
  assert.equal(snap(ctl).load.status, 'ready')
  assert.equal(snap(ctl).block, 'timerRunning')
  assert.equal(snap(ctl).canSubmit, false)
  const result = await ctl.submit()
  assert.deepEqual(plain(result), {
    ok: false,
    reason: 'blocked',
    block: 'timerRunning',
  })
  assert.match(snap(ctl).message, /타이머/)
  assert.equal(store.calls.save.length + store.calls.complete.length, 0)
  assert.equal(snap(ctl).phase, 'idle')

  // W14가 살아 있고 타이머가 측정 중인 경우
  const store2 = makeStore([mkSession()])
  const ctl2 = await start(store2, {
    w14: () => ({
      saving: false,
      dirty: false,
      failed: false,
      conflict: false,
      timerRunning: true,
    }),
  })
  assert.equal((await ctl2.submit()).block, 'timerRunning')
  assert.equal(store2.calls.complete.length, 0)
})

test('28. W14의 미확정 저장 작업·실패·충돌이 있으면 저장하지 않는다', async () => {
  const store = makeStore([mkSession()])
  let state = null
  const base = {
    saving: false,
    dirty: false,
    failed: false,
    conflict: false,
    timerRunning: false,
  }
  const ctl = await start(store, { w14: () => state })
  const cases = [
    [{ ...base, saving: true }, 'w14Saving'],
    [{ ...base, dirty: true }, 'w14Unsaved'],
    [{ ...base, failed: true }, 'w14SaveFailed'],
    [{ ...base, conflict: true }, 'w14Conflict'],
  ]
  for (const [value, reason] of cases) {
    state = value
    ctl.refreshGate()
    assert.equal(snap(ctl).block, reason)
    assert.equal(snap(ctl).canSubmit, false)
    const result = await ctl.submit()
    assert.deepEqual(plain(result), {
      ok: false,
      reason: 'blocked',
      block: reason,
    })
  }
  assert.equal(store.calls.save.length + store.calls.complete.length, 0)
  // 해소되면 저장할 수 있다.
  state = null
  ctl.refreshGate()
  assert.equal(snap(ctl).canSubmit, true)
  assert.equal((await ctl.submit()).ok, true)
  // W14 snapshot → 저장 상태 변환
  const view = RC.w14StateOf({
    save: {
      saving: false,
      dirty: false,
      failed: false,
      reason: null,
      fatal: false,
    },
    conflict: null,
    timerRunning: false,
    restorePending: true,
  })
  assert.equal(RC.assessW14Gate(view), 'w14Unsaved') // 타이머 복원 저장 대기
  assert.equal(RC.assessW14Gate(null), null)
  assert.ok(SC.createWorkoutSessionController) // W14 컨트롤러는 변경하지 않았다
})

test('29. 완료 세트가 0개면 저장하지 않는다', async () => {
  const none = makeStore([mkSession({ done: [] })])
  const ctl = await start(none)
  assert.equal(snap(ctl).summary.noneCompleted, true)
  assert.equal(snap(ctl).canSubmit, false)
  const result = await ctl.submit()
  assert.equal(result.reason, 'invalid')
  assert.equal(result.issues[0].reason, 'noCompletedSets')
  assert.equal(snap(ctl).phase, 'idle')
  assert.equal(none.calls.save.length + none.calls.complete.length, 0)
  // 편집으로 0개가 된 경우
  const store = makeStore([mkSession({ done: [[0, 0]] })])
  const ctl2 = await start(store)
  assert.equal(snap(ctl2).canSubmit, true)
  ctl2.edit({ kind: 'uncomplete', position: pos(0, 0) })
  assert.equal(snap(ctl2).canSubmit, false)
  assert.equal((await ctl2.submit()).issues[0].reason, 'noCompletedSets')
  assert.equal(store.calls.save.length + store.calls.complete.length, 0)
  // 검증 실패 뒤에도 편집은 계속할 수 있다(잠기지 않는다).
  assert.equal(snap(ctl2).editLocked, false)
  ctl2.cancelEdits()
  assert.equal(snap(ctl2).canSubmit, true)
})

test('30. 저장소 unavailable 처리', async () => {
  // 저장소 없음(운영 빌드)
  const absent = RC.createWorkoutResultController({
    repository: null,
    records: null,
    sessionId: 's1',
  })
  absent.activate()
  await settle()
  assert.equal(snap(absent).load.status, 'unavailable')
  assert.equal(snap(absent).phase, 'unavailable')
  assert.equal((await absent.submit()).reason, 'notReady')
  // 읽기 중 unavailable
  const store = makeStore([mkSession()])
  store.faults.get.push({ error: new R.WorkoutStoreError('unavailable') })
  const ctl = await start(store)
  assert.equal(snap(ctl).load.status, 'unavailable')
  assert.equal(snap(ctl).phase, 'unavailable')
  // 다시 불러오면 복구된다.
  assert.equal((await ctl.reloadLatest()).ok, true)
  assert.equal(snap(ctl).load.status, 'ready')
  // 저장 중 unavailable: 재시도 가능한 오류, 성공으로 표시하지 않는다.
  editReps(ctl, 0, 0, 12)
  store.faults.save.push({ error: new R.WorkoutStoreError('unavailable') })
  const result = await ctl.submit()
  assert.equal(result.reason, 'failed')
  assert.equal(result.failure, 'unavailable')
  assert.equal(snap(ctl).phase, 'retryableError')
  assert.equal(snap(ctl).saved, false)
  assert.equal((await ctl.submit()).ok, true)
})

// ─── 추가 안전 장치 ────────────────────────────────────────

test('저장소가 값을 거부하면(validation) 같은 요청을 반복하지 않는다(fatal)', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.faults.save.push({ error: storeError('validation', 'invalidProgress') })
  const first = await ctl.submit()
  assert.equal(first.retryable, false)
  assert.equal(snap(ctl).phase, 'fatalError')
  assert.equal(snap(ctl).canSubmit, false)
  const second = await ctl.submit()
  assert.equal(second.reason, 'failed')
  assert.equal(second.retryable, false)
  assert.equal(store.calls.save.length, 1)
})

test('편집은 저장 요청 중·성공 뒤에 잠기고, 요청 값과 화면 값이 어긋나지 않는다', async () => {
  const store = makeStore([mkSession()])
  const ctl = await start(store)
  editReps(ctl, 0, 0, 12)
  store.holdOn.save = true
  const pending = ctl.submit()
  await settle()
  assert.equal(editReps(ctl, 0, 1, 3).reason, 'locked')
  assert.equal(ctl.cancelEdits().reason, 'locked')
  store.releaseAll('save')
  await pending
  assert.equal(editReps(ctl, 0, 1, 3).reason, 'locked')
  assert.equal(store.records.size, 1)
  assert.equal(
    [...store.records.values()][0].exercises[0].completedSets[1].actualReps,
    10,
  )
})
