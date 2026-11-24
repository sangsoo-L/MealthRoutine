// 완료 기록 서버 업로드(F4). 가짜 request 함수로 서버(POST /api/v1/workout-sessions/records)를 흉내 내고 vite SSR 로더로 소스를 불러온다.
// 기록은 실제 완료 경로와 같은 buildWorkoutRecord로 세션에서 만든다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let upload
let model
let http

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  upload = await server.ssrLoadModule('/src/exercise/api/recordUpload.ts')
  model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  http = await server.ssrLoadModule('/src/api/http.ts')
})

after(async () => {
  await server?.close()
})

const OWNER = '7'
const ITEMS = [
  {
    exerciseId: '2',
    exerciseNameSnapshot: '원암 덤벨 로우',
    recordType: 'weight',
    sets: [
      { reps: 12, weightKg: 40 },
      { reps: 10, weightKg: 50 },
      { reps: 8, weightKg: 60 },
    ],
  },
  {
    exerciseId: '22',
    exerciseNameSnapshot: '플랭크',
    recordType: 'time',
    sets: [{ targetSeconds: 30 }],
  },
  {
    exerciseId: '5',
    exerciseNameSnapshot: '푸시업',
    recordType: 'reps',
    sets: [{ reps: 15 }],
  },
]
// 첫 운동은 1·3세트만, 플랭크는 측정해서 완료, 푸시업은 하나도 하지 않았다.
const PERFORMED = [
  [
    { completed: true, actualReps: 12, actualWeightKg: 40 },
    { completed: false, actualReps: 9 },
    { completed: true, actualReps: 8, actualWeightKg: 62.5 },
  ],
  [{ completed: true, measuredMs: 31_600 }],
  [{ completed: false }],
]

function session(id, overrides = {}) {
  return {
    id: `session-${id}`,
    ownerId: OWNER,
    schemaVersion: 1,
    listId: 'list-1',
    listRevision: 1,
    listSnapshot: {
      plannedDate: '2026-11-24',
      items: ITEMS,
      catalogVersion: 'server-1',
    },
    status: 'completed',
    cursor: { itemIndex: 0, setIndex: 0 },
    performed: PERFORMED,
    timer: { accumulatedMs: 0, runningSince: null },
    revision: 3,
    startedAt: '2026-11-24T01:00:00.000Z',
    lastSavedAt: '2026-11-24T01:30:00.000Z',
    completedAt: '2026-11-24T01:30:00.000Z',
    endedAt: '2026-11-24T01:30:00.000Z',
    recordId: `record-${id}`,
    ...overrides,
  }
}

function record(id, sessionOverrides = {}, recordOverrides = {}) {
  const built = model.buildWorkoutRecord({
    id: `record-${id}`,
    session: session(id, sessionOverrides),
    now: new Date('2026-11-24T01:30:00.000Z'),
  })
  return { ...built, ...recordOverrides }
}

/** 메모리 저장소. records는 기록 배열, sessions는 id → 세션. */
function fakeDeps({ records, sessions, storage = new Map(), request }) {
  const calls = []
  const store = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  }
  return {
    calls,
    storage,
    deps: {
      records: {
        listByDateRange: async () => ({ items: records, skippedCount: 0 }),
      },
      sessions: {
        get: async (id) => sessions.get(id) ?? null,
      },
      marks: upload.createStorageMarkStore(OWNER, () => store),
      request: async (method, path, options) => {
        calls.push({ method, path, body: options?.body })
        return request ? request(options.body) : { created: true }
      },
    },
  }
}

const sessionsOf = (...ids) =>
  new Map(ids.map((id) => [`session-${id}`, session(id)]))

test('본문: 세트별 목표 전체는 세션 목록 사본에서, 완료 세트는 기록에서 만든다', () => {
  const body = upload.toRecordUploadBody(record('a'), session('a'))
  assert.deepEqual(body, {
    requestId: 'record-a',
    startedAt: '2026-11-24T01:00:00.000Z',
    endedAt: '2026-11-24T01:30:00.000Z',
    exercises: [
      {
        exerciseId: 2,
        recordType: 'weight',
        setTargets: ITEMS[0].sets,
        // 완료하지 않은 2세트는 빼고 번호는 목록 위치 그대로다.
        completedSets: [
          { setNumber: 1, reps: 12, weightKg: 40 },
          { setNumber: 3, reps: 8, weightKg: 62.5 },
        ],
      },
      {
        exerciseId: 22,
        recordType: 'time',
        setTargets: [{ targetSeconds: 30 }],
        // 31.6초는 32초로 반올림한다.
        completedSets: [{ setNumber: 1, durationSeconds: 32 }],
      },
      {
        exerciseId: 5,
        recordType: 'reps',
        setTargets: [{ reps: 15 }],
        completedSets: [],
      },
    ],
  })
})

test('본문: 측정하지 않은 시간은 보내지 않고, 세션이 기록과 맞지 않으면 null이다', () => {
  const unmeasured = record('b', {
    performed: [PERFORMED[0], [{ completed: true }], PERFORMED[2]],
  })
  const body = upload.toRecordUploadBody(unmeasured, session('b'))
  assert.deepEqual(body.exercises[1].completedSets, [{ setNumber: 1 }])

  const a = record('a')
  assert.equal(upload.toRecordUploadBody(a, session('other')), null)
  assert.equal(
    upload.toRecordUploadBody(a, session('a', { ownerId: '8' })),
    null,
  )
  const fewer = session('a', {
    listSnapshot: { ...session('a').listSnapshot, items: ITEMS.slice(0, 2) },
  })
  assert.equal(upload.toRecordUploadBody(a, fewer), null)
  const moreSets = session('a', {
    listSnapshot: {
      ...session('a').listSnapshot,
      items: [
        { ...ITEMS[0], sets: [...ITEMS[0].sets, { reps: 6 }] },
        ITEMS[1],
        ITEMS[2],
      ],
    },
  })
  assert.equal(upload.toRecordUploadBody(a, moreSets), null)
  const devId = record('d', {}, {})
  const devSession = session('d', {
    listSnapshot: {
      ...session('d').listSnapshot,
      items: [{ ...ITEMS[0], exerciseId: 'ex-row' }, ITEMS[1], ITEMS[2]],
    },
  })
  assert.equal(
    upload.toRecordUploadBody(
      {
        ...devId,
        exercises: devId.exercises.map((e, i) =>
          i === 0 ? { ...e, exerciseId: 'ex-row' } : e,
        ),
      },
      devSession,
    ),
    null,
  )
})

test('업로드: 올리지 않은 기록만 보내고, 올린 기록은 다음에 다시 보내지 않는다', async () => {
  const { deps, calls } = fakeDeps({
    records: [record('a'), record('b')],
    sessions: sessionsOf('a', 'b'),
  })
  const first = await upload.uploadPendingRecords(deps)
  assert.deepEqual(first, { uploaded: 2, rejected: 0, stoppedBy: undefined })
  assert.deepEqual(
    calls.map((c) => [c.method, c.path, c.body.requestId]),
    [
      ['POST', '/workout-sessions/records', 'record-a'],
      ['POST', '/workout-sessions/records', 'record-b'],
    ],
  )
  const second = await upload.uploadPendingRecords(deps)
  assert.deepEqual(second, { uploaded: 0, rejected: 0, stoppedBy: undefined })
  assert.equal(calls.length, 2)
})

test('업로드: 이미 저장된 기록(created: false)도 올린 것으로 본다', async () => {
  const { deps, calls } = fakeDeps({
    records: [record('a')],
    sessions: sessionsOf('a'),
    request: () => ({ created: false, sessionId: 9 }),
  })
  assert.equal((await upload.uploadPendingRecords(deps)).uploaded, 1)
  await upload.uploadPendingRecords(deps)
  assert.equal(calls.length, 1)
})

test('업로드: 내용 때문에 거절된 기록은 표시하고 다시 보내지 않으며 다음 기록은 계속 보낸다', async () => {
  const codes = {
    'record-a': new http.ApiError(400, 'INVALID_REQUEST', '요청 값'),
    'record-b': new http.ApiError(404, 'EXERCISE_NOT_FOUND', '운동'),
    'record-c': new http.ApiError(409, 'REQUEST_CONFLICT', '충돌'),
  }
  const { deps, calls } = fakeDeps({
    records: [record('a'), record('b'), record('c'), record('d')],
    sessions: sessionsOf('a', 'b', 'c', 'd'),
    request: (body) => {
      if (codes[body.requestId]) throw codes[body.requestId]
      return { created: true }
    },
  })
  const first = await upload.uploadPendingRecords(deps)
  assert.deepEqual(first, { uploaded: 1, rejected: 3, stoppedBy: undefined })
  assert.equal(calls.length, 4)
  await upload.uploadPendingRecords(deps)
  assert.equal(calls.length, 4)
})

test('업로드: 나중에 될 수 있는 실패는 표시하지 않고 멈췄다가 다음에 다시 보낸다', async () => {
  const transient = [
    new http.ApiError(0, 'NETWORK', '연결'),
    new http.ApiError(500, 'INTERNAL_ERROR', '서버'),
    new http.ApiError(401, 'LOGIN_REQUIRED', '로그인'),
    new http.ApiError(429, 'TOO_MANY_REQUESTS', '과다'),
    new http.ApiError(409, 'DATA_CONFLICT', '충돌'),
    new http.ApiError(0, 'INVALID_RESPONSE', '응답'),
    // 클라이언트 경로 검사의 INVALID_REQUEST(상태 0)는 서버 거절이 아니다.
    new http.ApiError(0, 'INVALID_REQUEST', '경로'),
    new TypeError('예상 밖'),
  ]
  for (const error of transient) {
    let fail = true
    const { deps, calls } = fakeDeps({
      records: [record('a'), record('b')],
      sessions: sessionsOf('a', 'b'),
      request: () => {
        if (fail) throw error
        return { created: true }
      },
    })
    const first = await upload.uploadPendingRecords(deps)
    assert.equal(first.stoppedBy, error)
    assert.equal(first.uploaded, 0)
    // 첫 기록에서 멈추고 두 번째 기록은 보내지 않았다.
    assert.equal(calls.length, 1, String(error.errorCode ?? error))
    fail = false
    const second = await upload.uploadPendingRecords(deps)
    assert.deepEqual(second, { uploaded: 2, rejected: 0, stoppedBy: undefined })
  }
})

test('업로드: 개발용 카탈로그 기록은 보내지 않고, 세션이 없거나 맞지 않으면 요청 없이 거절 표시한다', async () => {
  const dev = record('dev', {}, { catalogVersion: 'dev-mock-1' })
  const missing = record('m')
  const mismatched = record('x')
  const sessions = sessionsOf('a')
  sessions.set(
    'session-x',
    session('x', {
      listSnapshot: { ...session('x').listSnapshot, items: ITEMS.slice(0, 1) },
    }),
  )
  const { deps, calls, storage } = fakeDeps({
    records: [dev, missing, mismatched, record('a')],
    sessions,
  })
  const summary = await upload.uploadPendingRecords(deps)
  assert.deepEqual(summary, { uploaded: 1, rejected: 2, stoppedBy: undefined })
  assert.deepEqual(
    calls.map((c) => c.body.requestId),
    ['record-a'],
  )
  assert.deepEqual(
    JSON.parse(storage.get('mealthroutine.recordUploads.v1.7')),
    {
      uploaded: ['record-a'],
      rejected: { 'record-m': 'sessionMissing', 'record-x': 'sessionMismatch' },
    },
  )
})

test('업로드: 세션을 읽다 실패하면 멈추고, 그 전까지 올린 표시는 저장한다', async () => {
  const failure = new Error('IndexedDB')
  const { deps, calls, storage } = fakeDeps({
    records: [record('a'), record('b')],
    sessions: sessionsOf('a', 'b'),
  })
  const get = deps.sessions.get
  deps.sessions.get = async (id) => {
    if (id === 'session-b') throw failure
    return get(id)
  }
  const summary = await upload.uploadPendingRecords(deps)
  assert.equal(summary.stoppedBy, failure)
  assert.equal(calls.length, 1)
  assert.deepEqual(
    JSON.parse(storage.get('mealthroutine.recordUploads.v1.7')).uploaded,
    ['record-a'],
  )
})

test('업로드: 계정이 바뀌면(isCurrent false) 다음 기록부터 보내지 않는다', async () => {
  let current = true
  const { deps, calls } = fakeDeps({
    records: [record('a'), record('b')],
    sessions: sessionsOf('a', 'b'),
    request: () => {
      current = false
      return { created: true }
    },
  })
  deps.isCurrent = () => current
  const summary = await upload.uploadPendingRecords(deps)
  assert.equal(summary.uploaded, 1)
  assert.equal(calls.length, 1)
})

test('표시: 깨진 값은 빈 표시로 보고, 지워진 기록의 표시는 정리한다', async () => {
  const storage = new Map([['mealthroutine.recordUploads.v1.7', '{깨짐']])
  const { deps, calls } = fakeDeps({
    records: [record('a')],
    sessions: sessionsOf('a'),
    storage,
  })
  await upload.uploadPendingRecords(deps)
  assert.equal(calls.length, 1)

  storage.set(
    'mealthroutine.recordUploads.v1.7',
    JSON.stringify({
      uploaded: ['record-a', 'record-gone', 3],
      rejected: { 'record-old': 'INVALID_REQUEST', 'record-n': 5 },
    }),
  )
  await upload.uploadPendingRecords(deps)
  assert.equal(calls.length, 1)
  assert.deepEqual(
    JSON.parse(storage.get('mealthroutine.recordUploads.v1.7')),
    {
      uploaded: ['record-a'],
      rejected: {},
    },
  )

  // 저장소를 쓸 수 없어도 업로드는 된다(다음에 다시 보내면 서버가 중복을 막는다).
  const broken = upload.createStorageMarkStore(OWNER, () => {
    throw new Error('차단')
  })
  assert.deepEqual(broken.read(), { uploaded: new Set(), rejected: new Map() })
  assert.doesNotThrow(() =>
    broken.write({ uploaded: new Set(['x']), rejected: new Map() }),
  )
})

test('실행기: 같은 키는 하나씩 돌고, 도는 중의 요청은 끝난 뒤 한 번 더 돈다', async () => {
  const runs = []
  let release
  const run = upload.createUploadRunner(async (key) => {
    runs.push(key)
    if (runs.length === 1) {
      await new Promise((resolve) => {
        release = resolve
      })
    }
    if (runs.length === 3) throw new Error('실패해도 다음 요청은 돈다')
  })
  const first = run('0:7')
  const second = run('0:7')
  const third = run('0:7')
  const other = run('1:7')
  assert.deepEqual(runs, ['0:7', '1:7'])
  release()
  await Promise.all([first, second, third, other])
  // 도는 중에 두 번 요청했어도 한 번만 더 돈다.
  assert.deepEqual(runs, ['0:7', '1:7', '0:7'])
  await run('0:7')
  assert.deepEqual(runs, ['0:7', '1:7', '0:7', '0:7'])
})

test('연결: 결과 화면 완료와 대시보드에서 요청하고, 개발 서버는 올리지 않으며, 계정이 바뀌면 이전 요청을 멈춘다', () => {
  const read = (path) =>
    readFileSync(new URL(`../src/exercise/${path}`, import.meta.url), 'utf8')
  const source = read('recordUploadSource.ts')
  assert.match(source, /if \(import\.meta\.env\.DEV\) return/)
  assert.match(source, /registerAccountCleanup\(/)
  assert.match(source, /runUpload\(`\$\{generation\}:\$\{ownerId\}`\)/)
  assert.match(source, /if \(generation !== started\) return/)
  assert.match(source, /isCurrent: \(\) => generation === started/)
  assert.match(
    read('useWorkoutResult.ts'),
    /snapshot\.phase === 'success'[\s\S]*requestRecordUpload\(userId\)/,
  )
  assert.match(
    read('useDashboardRecords.ts'),
    /if \(enabled && userId\) requestRecordUpload\(userId\)/,
  )
})
