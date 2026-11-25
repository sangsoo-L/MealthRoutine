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
let draftModel

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  upload = await server.ssrLoadModule('/src/exercise/api/recordUpload.ts')
  model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  http = await server.ssrLoadModule('/src/api/http.ts')
  draftModel = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
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
      bodyVersion: 2,
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
      bodyVersion: 2,
    },
  )

  // 저장소를 쓸 수 없어도 업로드는 된다(다음에 다시 보내면 서버가 중복을 막는다).
  const broken = upload.createStorageMarkStore(OWNER, () => {
    throw new Error('차단')
  })
  assert.deepEqual(broken.read(), {
    uploaded: new Set(),
    rejected: new Map(),
    bodyVersion: 2,
  })
  assert.doesNotThrow(() =>
    broken.write({
      uploaded: new Set(['x']),
      rejected: new Map(),
      bodyVersion: 2,
    }),
  )
})

/** 서버의 세트 값 규칙(docs/api_exercise_v1.0.md): 횟수 1~999 정수, 중량 0~999kg·소수 둘째 자리까지. 어기면 400 INVALID_REQUEST다. */
function checkServerRules(body) {
  const twoDecimals = (value) =>
    value >= 0 &&
    value <= 999 &&
    Math.abs(value * 100 - Math.round(value * 100)) <= 1e-6
  for (const exercise of body.exercises) {
    for (const set of [...exercise.setTargets, ...exercise.completedSets]) {
      if (set.weightKg !== undefined && !twoDecimals(set.weightKg)) {
        throw new http.ApiError(400, 'INVALID_REQUEST', '요청 값')
      }
      if (set.reps !== undefined && (set.reps < 1 || set.reps > 999)) {
        throw new http.ApiError(400, 'INVALID_REQUEST', '요청 값')
      }
    }
  }
}

/** 첫 운동의 세트 목표 중량만 바꾼 세션(그 목록으로 완료한 기록). */
function sessionWithTargets(id, weights, performed = PERFORMED) {
  const items = [
    {
      ...ITEMS[0],
      sets: ITEMS[0].sets.map((set, i) => ({ ...set, weightKg: weights[i] })),
    },
    ITEMS[1],
    ITEMS[2],
  ]
  return session(id, {
    listSnapshot: { ...session(id).listSnapshot, items },
    performed,
  })
}

function recordOf(sessionValue) {
  return model.buildWorkoutRecord({
    id: sessionValue.recordId,
    session: sessionValue,
    now: new Date('2026-11-24T01:30:00.000Z'),
  })
}

/** 응답을 보내지 않는 요청. fetch처럼 취소 신호(시간 제한)가 오면 그 이유로 실패한다. */
function neverAnswer(signal) {
  return new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason))
  })
}

test('목록 저장: 서버 규칙 밖의 목표(22.555kg, 1000kg, 1000회)는 저장 전에 안내하고, 유효한 목표로 완료한 기록은 서버에 저장된다', async () => {
  const draftOf = (sets) => ({
    v: 1,
    day: 'today',
    items: [
      {
        itemId: 'i1',
        exerciseId: '2',
        name: '원암 덤벨 로우',
        recordType: 'weight',
        sets,
      },
    ],
    updatedAt: '2026-11-24T00:00:00.000Z',
  })
  const known = new Set(['2'])
  const build = (draft) =>
    model.buildWorkoutList({
      id: 'list-1',
      ownerId: OWNER,
      requestId: 'list-req-1',
      draft,
      knownExerciseIds: known,
      catalogVersion: 'server-1',
      now: new Date('2026-11-24T00:00:00.000Z'),
    })
  for (const [field, set] of [
    ['weightKg', { reps: 10, weightKg: 22.555 }],
    ['weightKg', { reps: 10, weightKg: 1000 }],
    ['reps', { reps: 1000, weightKg: 20 }],
  ]) {
    const draft = draftOf([set])
    const checked = draftModel.validateDraft(draft, known)
    assert.equal(checked.ok, false)
    assert.deepEqual(
      checked.issues.map((issue) => [issue.field, issue.message]),
      [
        [
          field,
          draftModel.ISSUE_MESSAGES[field === 'reps' ? 'reps' : 'weight'],
        ],
      ],
    )
    // 저장소(buildWorkoutList)도 같은 검증(normalizeDraft)을 거쳐 목록을 만들지 않는다.
    assert.equal(build(draft), null)
    // 이미 저장된 루틴·계획을 초안으로 옮길 때는 예전 규칙으로 받아 W02가 저장 전에 안내하게 한다.
    assert.equal(
      draftModel.validateDraft(draft, known, undefined, {
        serverLimits: false,
      }).ok,
      true,
    )
  }
  assert.match(draftModel.ISSUE_MESSAGES.weight, /소수점 둘째 자리/)

  // 경계값과 소수 둘째 자리(부동소수 오차 포함)는 저장된다.
  const list = build(
    draftOf([
      { reps: 12, weightKg: 22.55 },
      { reps: 999, weightKg: 0.07 },
      { reps: 8, weightKg: 999 },
    ]),
  )
  assert.ok(list)
  const done = session('ok', {
    listSnapshot: {
      plannedDate: list.plannedDate,
      items: list.items,
      catalogVersion: 'server-1',
    },
    performed: [
      [
        { completed: true, actualReps: 12, actualWeightKg: 22.5 },
        { completed: false },
        { completed: true, actualReps: 8, actualWeightKg: 999 },
      ],
    ],
  })
  const stored = new Map()
  const { deps } = fakeDeps({
    records: [recordOf(done)],
    sessions: new Map([[done.id, done]]),
    request: (body) => {
      checkServerRules(body)
      stored.set(body.requestId, body)
      return { created: true }
    },
  })
  assert.deepEqual(await upload.uploadPendingRecords(deps), {
    uploaded: 1,
    rejected: 0,
    stoppedBy: undefined,
  })
  assert.deepEqual(stored.get('record-ok').exercises[0].setTargets, [
    { reps: 12, weightKg: 22.55 },
    { reps: 999, weightKg: 0.07 },
    { reps: 8, weightKg: 999 },
  ])
})

test('본문: 목표 중량만 소수 둘째 자리로 반올림하고 실제 수행 값은 바꾸지 않는다', () => {
  const performed = [
    [
      { completed: true, actualReps: 12, actualWeightKg: 22.555 },
      { completed: false },
      { completed: true, actualReps: 8, actualWeightKg: 62.5 },
    ],
    PERFORMED[1],
    PERFORMED[2],
  ]
  const target = sessionWithTargets('t', [22.555, 0.07, 1000], performed)
  const body = upload.toRecordUploadBody(recordOf(target), target)
  assert.deepEqual(body.exercises[0].setTargets, [
    { reps: 12, weightKg: 22.56 },
    // 이미 둘째 자리 안인 값은 그대로, 고칠 수 없는 범위 밖 값도 그대로 보낸다.
    { reps: 10, weightKg: 0.07 },
    { reps: 8, weightKg: 1000 },
  ])
  assert.deepEqual(body.exercises[0].completedSets, [
    { setNumber: 1, reps: 12, weightKg: 22.555 },
    { setNumber: 3, reps: 8, weightKg: 62.5 },
  ])
  // 목표 중량이 없는 운동과 다른 목표 값은 그대로다.
  assert.deepEqual(body.exercises[1].setTargets, [{ targetSeconds: 30 }])
  assert.equal(upload.RECORD_BODY_VERSION, 2)
})

test('거절 재검토: 예전 본문으로 INVALID_REQUEST를 받은 기록은 한 번 다시 보내고, 다른 이유의 거절과 실제 값이 틀린 기록은 거절로 남는다', async () => {
  const key = 'mealthroutine.recordUploads.v1.7'
  // 목표 22.555kg으로 완료한 기록(목표 때문에 거절됨), 실제 중량이 서버 규칙 밖인 기록(목표는 정상), 다른 이유로 거절된 기록.
  const targetOnly = sessionWithTargets('a', [22.555, 50, 60])
  const badActual = sessionWithTargets(
    'd',
    [40, 50, 60],
    [
      [
        { completed: true, actualReps: 12, actualWeightKg: 22.555 },
        { completed: false },
        { completed: false },
      ],
      PERFORMED[1],
      PERFORMED[2],
    ],
  )
  const sessions = new Map([
    [targetOnly.id, targetOnly],
    [badActual.id, badActual],
    ...sessionsOf('b', 'c'),
  ])
  // bodyVersion이 없는 예전 모양의 표시.
  const storage = new Map([
    [
      key,
      JSON.stringify({
        uploaded: [],
        rejected: {
          'record-a': 'INVALID_REQUEST',
          'record-b': 'EXERCISE_NOT_FOUND',
          'record-c': 'sessionMismatch',
          'record-d': 'INVALID_REQUEST',
        },
      }),
    ],
  ])
  const stored = new Map()
  const { deps, calls } = fakeDeps({
    records: [
      recordOf(targetOnly),
      record('b'),
      record('c'),
      recordOf(badActual),
    ],
    sessions,
    storage,
    request: (body) => {
      checkServerRules(body)
      const created = !stored.has(body.requestId)
      stored.set(body.requestId, body)
      return { created }
    },
  })
  const first = await upload.uploadPendingRecords(deps)
  assert.deepEqual(first, { uploaded: 1, rejected: 1, stoppedBy: undefined })
  assert.deepEqual(
    calls.map((c) => c.body.requestId),
    ['record-a', 'record-d'],
  )
  assert.deepEqual([...stored.keys()], ['record-a'])
  assert.equal(
    stored.get('record-a').exercises[0].setTargets[0].weightKg,
    22.56,
  )
  assert.deepEqual(JSON.parse(storage.get(key)), {
    uploaded: ['record-a'],
    rejected: {
      'record-b': 'EXERCISE_NOT_FOUND',
      'record-c': 'sessionMismatch',
      'record-d': 'INVALID_REQUEST',
    },
    bodyVersion: 2,
  })
  // 지금 버전으로 다시 거절된 기록은 더 보내지 않는다.
  await upload.uploadPendingRecords(deps)
  assert.equal(calls.length, 2)
})

test('시간 제한: 응답이 오지 않으면 제한 시간 뒤 실행이 끝나고, 다음 실행은 같은 requestId로 다시 보내 기록이 겹치지 않는다', async () => {
  // requestId로 저장하는 가짜 서버. 첫 요청은 저장까지 하고 응답을 보내지 않는다(서버는 처리했지만 응답이 사라진 경우).
  const stored = new Map()
  const answers = []
  const signals = []
  let holdFirst = true
  const { deps, calls, storage } = fakeDeps({
    records: [record('a'), record('b')],
    sessions: sessionsOf('a', 'b'),
  })
  deps.timeoutMs = 30
  deps.request = async (method, path, options) => {
    calls.push({ method, path, body: options.body })
    signals.push(options.signal)
    const { body } = options
    const created = !stored.has(body.requestId)
    if (created) stored.set(body.requestId, body)
    if (holdFirst) {
      holdFirst = false
      return neverAnswer(options.signal)
    }
    answers.push([body.requestId, created])
    return { created }
  }
  const started = Date.now()
  const first = await upload.uploadPendingRecords(deps)
  assert.ok(Date.now() - started < 5_000)
  assert.equal(first.stoppedBy?.name, 'TimeoutError')
  assert.equal(first.uploaded, 0)
  assert.equal(first.rejected, 0)
  // 멈춘 기록 뒤의 기록은 보내지 않았고, 멈춘 기록도 표시하지 않았다.
  assert.equal(calls.length, 1)
  assert.deepEqual(
    JSON.parse(storage.get('mealthroutine.recordUploads.v1.7')),
    { uploaded: [], rejected: {}, bodyVersion: 2 },
  )

  const second = await upload.uploadPendingRecords(deps)
  assert.deepEqual(second, { uploaded: 2, rejected: 0, stoppedBy: undefined })
  assert.deepEqual(
    calls.map((c) => c.body.requestId),
    ['record-a', 'record-a', 'record-b'],
  )
  // 같은 본문을 다시 보냈고, 서버는 새로 만들지 않았다(created: false).
  assert.deepEqual(calls[1].body, calls[0].body)
  assert.deepEqual(answers, [
    ['record-a', false],
    ['record-b', true],
  ])
  assert.deepEqual([...stored.keys()], ['record-a', 'record-b'])
  // 요청마다 따로 시간 제한 신호를 붙인다.
  assert.equal(new Set(signals).size, 3)
  assert.ok(signals.every((signal) => signal instanceof AbortSignal))

  await upload.uploadPendingRecords(deps)
  assert.equal(calls.length, 3)
})

test('시간 제한: 실행기도 제한 시간 뒤 풀려서 같은 계정의 다음 업로드가 돈다', async () => {
  let hold = true
  const sent = []
  const run = upload.createUploadRunner(() => {
    const { deps } = fakeDeps({
      records: [record('a')],
      sessions: sessionsOf('a'),
    })
    deps.timeoutMs = 30
    deps.request = async (method, path, options) => {
      sent.push(options.body.requestId)
      if (!hold) return { created: true }
      hold = false
      return neverAnswer(options.signal)
    }
    return upload.uploadPendingRecords(deps)
  })
  await run('0:7')
  await run('0:7')
  assert.deepEqual(sent, ['record-a', 'record-a'])
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
