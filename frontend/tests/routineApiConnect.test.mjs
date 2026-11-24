// 운동 루틴 API 연결(F3). 가짜 request 함수로 서버(/api/v1/workout-routines)를 흉내 내고 vite SSR 로더로 소스를 불러온다.
// 서버 응답은 백엔드 RoutineResponse 모양(시간대 없는 한국 시각, 주인에게만 revision·requestId, 항목은 recordType·sets)으로 만든다.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let api
let model
let http

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  api = await server.ssrLoadModule('/src/exercise/api/apiRoutineRepository.ts')
  model = await server.ssrLoadModule('/src/exercise/workoutRoutineModel.ts')
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
    ],
  },
  {
    exerciseId: '22',
    exerciseNameSnapshot: '플랭크',
    recordType: 'time',
    sets: [{ targetSeconds: 30 }],
  },
]

const draft = (items = ITEMS) =>
  model.routineToDraft({ items }, () => '2026-01-10T00:00:00.000Z')

/** 서버가 보내는 루틴 한 건(RoutineResponse). body는 클라이언트가 보낸 요청 본문 모양. */
function serverRoutine(overrides = {}, body = undefined) {
  const items = (
    body?.items ?? [
      { exerciseId: 2, recordType: 'weight', sets: ITEMS[0].sets },
      { exerciseId: 22, recordType: 'time', sets: ITEMS[1].sets },
    ]
  ).map((item, index) => ({
    exerciseRoutineItemId: 100 + index,
    exerciseId: item.exerciseId,
    exerciseName: item.exerciseId === 2 ? '원암 덤벨 로우' : '플랭크',
    sequenceNumber: index + 1,
    targetSets: item.sets.length,
    targetReps: item.sets[0].reps ?? null,
    targetDurationSeconds: item.sets[0].targetSeconds ?? null,
    restSeconds: null,
    recordType: item.recordType,
    sets: item.sets,
  }))
  return {
    routineId: 41,
    ownerUserId: 7,
    routineName: body?.routineName ?? '등·코어',
    description: body?.description ?? null,
    difficulty: null,
    visibility: 'private',
    revision: 1,
    requestId: body?.requestId ?? 'rt-1',
    createdAt: '2026-01-10T10:00:00',
    updatedAt: '2026-01-10T10:30:00.123456',
    items,
    ...overrides,
  }
}

function fakeRequest(handler) {
  const calls = []
  const request = async (method, path, options) => {
    calls.push({ method, path, options })
    return handler({ method, path, body: options?.body })
  }
  return { request, calls }
}

const fail = (status, errorCode, data) =>
  new http.ApiError(status, errorCode, `msg:${errorCode}`, data)
const storeError = (reason, code) => (error) =>
  error.name === 'WorkoutStoreError' &&
  error.reason === reason &&
  (code === undefined || error.code === code)

test('생성: 로컬 저장소와 같은 검증을 거친 값을 보내고, 서버 응답을 화면 모델로 바꾼다', async () => {
  const { request, calls } = fakeRequest(({ body }) =>
    serverRoutine({ created: true }, body),
  )
  const repository = api.createApiRoutineRepository(OWNER, request)
  assert.equal(repository.kind, 'api')
  const result = await repository.create({
    requestId: 'rt-1',
    name: '  등·코어  ',
    description: '',
    draft: draft(),
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'POST')
  assert.equal(calls[0].path, '/workout-routines')
  assert.deepEqual(calls[0].options.body, {
    routineName: '등·코어',
    description: '',
    items: [
      { exerciseId: 2, recordType: 'weight', sets: ITEMS[0].sets },
      { exerciseId: 22, recordType: 'time', sets: ITEMS[1].sets },
    ],
    visibility: 'private',
    requestId: 'rt-1',
  })

  assert.equal(result.created, true)
  const routine = result.routine
  assert.equal(routine.id, '41')
  assert.equal(routine.ownerId, OWNER)
  assert.equal(routine.name, '등·코어')
  assert.equal(routine.description, '')
  assert.equal(routine.revision, 1)
  assert.equal(routine.requestId, 'rt-1')
  // 서버 시각은 한국 시각이라 9시간을 빼서 UTC로 바꾼다.
  assert.equal(routine.createdAt, '2026-01-10T01:00:00.000Z')
  assert.equal(routine.updatedAt, '2026-01-10T01:30:00.123Z')
  assert.deepEqual(routine.items, ITEMS)
  // 같은 내용인지 판정하는 규칙(재전송 비교)으로도 보낸 것과 같다.
  assert.ok(
    model.sameRoutineContent(routine, {
      name: '등·코어',
      description: '',
      items: ITEMS,
    }),
  )
})

test('생성: 같은 요청을 다시 보내 서버가 created: false로 답하면 그대로 알린다', async () => {
  const { request } = fakeRequest(({ body }) =>
    serverRoutine({ created: false }, body),
  )
  const result = await api.createApiRoutineRepository(OWNER, request).create({
    requestId: 'rt-1',
    name: '등·코어',
    description: '',
    draft: draft(),
  })
  assert.equal(result.created, false)
})

test('생성: 요청 id·이름·운동 구성이 올바르지 않으면 서버에 보내지 않는다', async () => {
  const { request, calls } = fakeRequest(() => {
    throw new Error('보내면 안 된다')
  })
  const repository = api.createApiRoutineRepository(OWNER, request)
  await assert.rejects(
    repository.create({
      requestId: 'bad id',
      name: '이름',
      description: '',
      draft: draft(),
    }),
    storeError('validation', 'invalidRequestId'),
  )
  await assert.rejects(
    repository.create({
      requestId: 'rt-2',
      name: '   ',
      description: '',
      draft: draft(),
    }),
    storeError('validation', 'invalidRoutineMeta'),
  )
  await assert.rejects(
    repository.create({
      requestId: 'rt-3',
      name: '이름',
      description: '',
      draft: draft(),
      knownExerciseIds: new Set(['2']), // 22번은 운동 저장소에 없다
    }),
    storeError('validation'),
  )
  await assert.rejects(
    repository.create({
      requestId: 'rt-4',
      name: '이름',
      description: '',
      draft: draft([{ ...ITEMS[0], exerciseId: 'abc' }]),
    }),
    storeError('validation', 'invalidDraft'),
  )
  assert.equal(calls.length, 0)
})

test('생성: 같은 요청 id에 다른 내용이면 requestConflict, 없는 운동이면 invalidDraft, 네트워크 오류는 error', async () => {
  const errors = [
    [fail(409, 'REQUEST_CONFLICT'), storeError('conflict', 'requestConflict')],
    [fail(404, 'EXERCISE_NOT_FOUND'), storeError('validation', 'invalidDraft')],
    [fail(400, 'INVALID_REQUEST'), storeError('validation', 'invalidDraft')],
    [fail(0, 'NETWORK'), storeError('error')],
    [fail(500, 'INTERNAL_ERROR'), storeError('error')],
  ]
  for (const [error, check] of errors) {
    const { request } = fakeRequest(() => {
      throw error
    })
    await assert.rejects(
      api.createApiRoutineRepository(OWNER, request).create({
        requestId: 'rt-1',
        name: '등·코어',
        description: '',
        draft: draft(),
      }),
      check,
      error.errorCode,
    )
  }
})

test('목록: 내 루틴만 항목까지 한 번에 받고, 예전 방식 항목이나 모양이 맞지 않는 루틴은 개수만 알린다', async () => {
  const pages = [
    {
      content: [
        serverRoutine({ routineId: 43, updatedAt: '2026-01-11T09:00:00' }),
        serverRoutine({
          routineId: 42,
          items: [
            {
              ...serverRoutine().items[0],
              recordType: undefined,
              sets: undefined,
            },
          ],
        }),
        // 다른 클라이언트가 만든 루틴: 이름이 앱 규칙(50자)보다 길고 requestId가 없어도 읽는다.
        serverRoutine({
          routineId: 41,
          routineName: '가'.repeat(51),
          description: '소'.repeat(201),
          requestId: null,
        }),
        // 세트 값이 맞지 않는 루틴(시간 방식인데 횟수만 있음)은 여전히 뺀다.
        serverRoutine({
          routineId: 38,
          items: [{ ...serverRoutine().items[1], sets: [{ reps: 3 }] }],
        }),
      ],
      totalPages: 2,
    },
    {
      content: [
        serverRoutine({ routineId: 40 }),
        // 옵션을 모르는 예전 서버가 섞어 보낸 다른 회원의 공개 루틴: 읽을 수 없는 루틴으로 세지 않는다.
        serverRoutine({
          routineId: 39,
          ownerUserId: 8,
          revision: undefined,
          requestId: undefined,
        }),
      ],
      totalPages: 2,
    },
  ]
  const { request, calls } = fakeRequest(
    ({ path }) =>
      pages[Number(new URL(path, 'http://x').searchParams.get('page'))],
  )
  const result = await api.createApiRoutineRepository(OWNER, request).list()
  assert.deepEqual(
    calls.map((c) => c.path),
    [
      '/workout-routines?mine=true&includeItems=true&page=0&size=100',
      '/workout-routines?mine=true&includeItems=true&page=1&size=100',
    ],
  )
  assert.deepEqual(
    result.items.map((r) => r.id),
    ['43', '41', '40'],
  )
  assert.equal(result.skippedCount, 2)
  const longName = result.items[1]
  assert.equal(longName.name, '가'.repeat(51))
  assert.equal(longName.description, '소'.repeat(201))
  assert.equal(longName.requestId, 'server-41')
})

test('목록: 페이지 상한(20페이지)을 넘는 루틴은 받지 않고 제외한 수로 알린다', async () => {
  const { request, calls } = fakeRequest(() => ({
    content: [serverRoutine()],
    totalPages: 30,
    totalElements: 2050,
  }))
  const result = await api.createApiRoutineRepository(OWNER, request).list()
  assert.equal(calls.length, 20)
  assert.equal(result.items.length, 20)
  assert.equal(result.skippedCount, 50)
})

test('저장: 서버가 더 좁게 막는 값(운동 100개 초과, 횟수 999 초과, 중량 999kg 초과·소수 셋째 자리)은 보내지 않는다', async () => {
  const { request, calls } = fakeRequest(() => {
    throw new Error('보내면 안 된다')
  })
  const repository = api.createApiRoutineRepository(OWNER, request)
  // 같은 운동을 반복하면 초안 규칙(중복 운동)에 먼저 걸리므로 운동마다 다른 id를 쓴다.
  const tooMany = Array.from({ length: 101 }, (_, i) => ({
    ...ITEMS[1],
    exerciseId: String(1000 + i),
  }))
  const drafts = [
    draft(tooMany),
    draft([{ ...ITEMS[0], sets: [{ reps: 1000 }] }]),
    draft([{ ...ITEMS[0], sets: [{ reps: 10, weightKg: 1000 }] }]),
    draft([{ ...ITEMS[0], sets: [{ reps: 10, weightKg: 22.555 }] }]),
  ]
  for (const value of drafts) {
    await assert.rejects(
      repository.create({
        requestId: 'rt-1',
        name: '이름',
        description: '',
        draft: value,
      }),
      storeError('validation', 'invalidDraft'),
    )
    await assert.rejects(
      repository.update('41', {
        expectedRevision: 1,
        name: '이름',
        description: '',
        draft: value,
      }),
      storeError('validation', 'invalidDraft'),
    )
  }
  assert.equal(calls.length, 0)
  // 경계값과 소수 둘째 자리(부동소수 오차 포함)는 보낸다.
  const ok = fakeRequest(({ body }) => serverRoutine({ created: true }, body))
  await api.createApiRoutineRepository(OWNER, ok.request).create({
    requestId: 'rt-1',
    name: '이름',
    description: '',
    draft: draft([
      {
        ...ITEMS[0],
        sets: [
          { reps: 999, weightKg: 999 },
          { reps: 1, weightKg: 0.07 },
        ],
      },
    ]),
  })
  assert.equal(ok.calls.length, 1)
})

test('수정·삭제: 잘못된 id나 정수가 아닌 revision은 요청하지 않고, 서버 응답이 다른 회원 루틴이면 손상으로 본다', async () => {
  const { request, calls } = fakeRequest(() => {
    throw new Error('보내면 안 된다')
  })
  const repository = api.createApiRoutineRepository(OWNER, request)
  const input = {
    expectedRevision: 1,
    name: '이름',
    description: '',
    draft: draft(),
  }
  await assert.rejects(
    repository.update('../41', input),
    storeError('notFound'),
  )
  await assert.rejects(
    repository.update('41', { ...input, expectedRevision: 1.5 }),
    storeError('validation'),
  )
  await assert.rejects(
    repository.delete('41', { expectedRevision: 1.5 }),
    storeError('validation'),
  )
  assert.equal(calls.length, 0)

  const foreign = fakeRequest(({ body }) =>
    serverRoutine({ ownerUserId: 8 }, body),
  )
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, foreign.request).update('41', input),
    storeError('error', 'corruptRecord'),
  )
  const stale = fakeRequest(() => {
    throw fail(409, 'REVISION_MISMATCH', { currentRevision: 4 })
  })
  await assert.rejects(
    api
      .createApiRoutineRepository(OWNER, stale.request)
      .delete('41', { expectedRevision: 3 }),
    (error) =>
      storeError('conflict', 'revisionMismatch')(error) &&
      error.currentRevision === 4,
  )
  const lost = fakeRequest(() => {
    throw fail(409, 'SET_TARGETS_WOULD_BE_LOST')
  })
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, lost.request).update('41', input),
    (error) =>
      error.name === 'WorkoutStoreError' &&
      error.reason === 'conflict' &&
      error.code === undefined,
  )
  const denied = fakeRequest(() => {
    throw fail(403, 'ACCESS_DENIED')
  })
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, denied.request).update('41', input),
    storeError('notFound'),
  )
})

test('서버 시각: 초가 없거나 소수점이 붙은 한국 시각도 UTC로 바꾸고, 시간대가 붙은 값은 받지 않는다', () => {
  const base = serverRoutine()
  const minute = api.toRoutine(
    {
      ...base,
      createdAt: '2026-01-10T10:00',
      updatedAt: '2026-01-10T10:00:59.5',
    },
    OWNER,
  )
  assert.equal(minute.createdAt, '2026-01-10T01:00:00.000Z')
  assert.equal(minute.updatedAt, '2026-01-10T01:00:59.500Z')
  assert.equal(
    api.toRoutine({ ...base, createdAt: '2026-01-10T10:00:00Z' }, OWNER),
    null,
  )
  assert.equal(
    api.toRoutine({ ...base, createdAt: '2026-01-10 10:00:00' }, OWNER),
    null,
  )
})

test('상세: 없는 루틴·다른 회원의 루틴은 null, 예전 방식 항목은 손상으로 본다', async () => {
  const cases = [
    [
      () => {
        throw fail(404, 'ROUTINE_NOT_FOUND')
      },
      null,
    ],
    [
      () => {
        throw fail(403, 'ACCESS_DENIED')
      },
      null,
    ],
    [
      () =>
        serverRoutine({
          ownerUserId: 8,
          revision: undefined,
          requestId: undefined,
        }),
      null,
    ],
  ]
  for (const [handler, expected] of cases) {
    const { request } = fakeRequest(handler)
    assert.equal(
      await api.createApiRoutineRepository(OWNER, request).get('41'),
      expected,
    )
  }
  const old = fakeRequest(() =>
    serverRoutine({
      items: [
        { ...serverRoutine().items[0], recordType: undefined, sets: undefined },
      ],
    }),
  )
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, old.request).get('41'),
    storeError('error', 'corruptRecord'),
  )
  const none = fakeRequest(() => {
    throw new Error('보내면 안 된다')
  })
  assert.equal(
    await api.createApiRoutineRepository(OWNER, none.request).get('../1'),
    null,
  )
  assert.equal(none.calls.length, 0)
  const ok = fakeRequest(() => serverRoutine())
  const routine = await api
    .createApiRoutineRepository(OWNER, ok.request)
    .get('41')
  assert.equal(ok.calls[0].path, '/workout-routines/41')
  assert.equal(routine.id, '41')
})

test('수정: expectedRevision을 같이 보내고, 서버의 현재 revision이 다르면 revisionMismatch와 그 값을 알린다', async () => {
  const { request, calls } = fakeRequest(({ body }) =>
    serverRoutine({ revision: 3 }, { ...body, requestId: 'rt-1' }),
  )
  const repository = api.createApiRoutineRepository(OWNER, request)
  const updated = await repository.update('41', {
    expectedRevision: 2,
    name: '새 이름',
    description: '소개',
    draft: draft([ITEMS[1]]),
  })
  assert.equal(calls[0].method, 'PATCH')
  assert.equal(calls[0].path, '/workout-routines/41')
  assert.deepEqual(calls[0].options.body, {
    routineName: '새 이름',
    description: '소개',
    items: [
      { exerciseId: 22, recordType: 'time', sets: [{ targetSeconds: 30 }] },
    ],
    expectedRevision: 2,
  })
  assert.equal(updated.revision, 3)
  assert.equal(updated.name, '새 이름')

  const stale = fakeRequest(() => {
    throw fail(409, 'REVISION_MISMATCH', { currentRevision: 5 })
  })
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, stale.request).update('41', {
      expectedRevision: 2,
      name: '새 이름',
      description: '',
      draft: draft(),
    }),
    (error) =>
      storeError('conflict', 'revisionMismatch')(error) &&
      error.currentRevision === 5,
  )
  const gone = fakeRequest(() => {
    throw fail(404, 'ROUTINE_NOT_FOUND')
  })
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, gone.request).update('41', {
      expectedRevision: 1,
      name: '새 이름',
      description: '',
      draft: draft(),
    }),
    storeError('notFound'),
  )
})

test('삭제: expectedRevision을 쿼리로 보내고, 없는 루틴은 notFound, 잘못된 id는 요청하지 않는다', async () => {
  const { request, calls } = fakeRequest(() => undefined)
  const repository = api.createApiRoutineRepository(OWNER, request)
  await repository.delete('41', { expectedRevision: 3 })
  await repository.delete('41')
  assert.deepEqual(
    calls.map((c) => `${c.method} ${c.path}`),
    [
      'DELETE /workout-routines/41?expectedRevision=3',
      'DELETE /workout-routines/41',
    ],
  )
  await assert.rejects(repository.delete('abc'), storeError('notFound'))
  assert.equal(calls.length, 2)

  const gone = fakeRequest(() => {
    throw fail(403, 'ACCESS_DENIED')
  })
  await assert.rejects(
    api.createApiRoutineRepository(OWNER, gone.request).delete('41'),
    storeError('notFound'),
  )
})
