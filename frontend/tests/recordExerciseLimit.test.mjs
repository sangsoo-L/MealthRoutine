// 운동 100개 상한(PR #43 리뷰). 서버는 완료 기록 하나에 운동을 100개까지만 받는다(SessionRecordRequest exercises @Size(max = 100)).
// - 목록 저장: 100개는 저장되고 그 목록으로 완료한 기록은 서버에 저장된다. 101개는 목록 저장 전에 막는다.
// - 이미 거절된 기록: 이유를 표시에 남겨 화면이 보여 주고, 고칠 수 있는 기록은 같은 requestId로 다시 보내 서버에 한 건만 저장된다.
// 가짜 request 함수로 서버(requestId별 저장, 운동 100개 초과는 400)를 흉내 내고 vite SSR 로더로 소스를 불러온다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server
let upload
let model
let http
let draftModel
let saveList
let ResultView
let RecentRecordsSection

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
  saveList = await server.ssrLoadModule('/src/exercise/saveWorkoutList.ts')
  ResultView = (
    await server.ssrLoadModule('/src/components/exercise/result/ResultView.tsx')
  ).default
  RecentRecordsSection = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/RecentRecordsSection.tsx',
    )
  ).default
})

after(async () => {
  await server?.close()
})

const OWNER = '7'
const KEY = 'mealthroutine.recordUploads.v1.7'
const TODAY = '2026-11-24'
const NOW = new Date('2026-11-24T00:00:00.000Z')

const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

/** 운동 n개(id 1..n, 횟수형 1세트)의 오늘 초안. */
function draftOf(n) {
  return {
    v: 1,
    day: 'today',
    items: Array.from({ length: n }, (_, i) => ({
      itemId: `i${i + 1}`,
      exerciseId: String(i + 1),
      name: `운동 ${i + 1}`,
      recordType: 'reps',
      sets: [{ reps: 10 }],
    })),
    updatedAt: '2026-11-24T00:00:00.000Z',
  }
}
const knownOf = (n) =>
  new Set(Array.from({ length: n }, (_, i) => String(i + 1)))

function exercise(id) {
  return {
    id,
    name: `운동 ${id}`,
    equipment: ['맨몸'],
    targetMuscles: ['가슴'],
  }
}

/** 운동 n개 목록으로 한 세션. done(i)가 참인 운동만 완료했다. */
function sessionOf(id, n, done = () => true) {
  const items = Array.from({ length: n }, (_, i) => ({
    exerciseId: String(i + 1),
    exerciseNameSnapshot: `운동 ${i + 1}`,
    recordType: 'reps',
    sets: [{ reps: 10 }],
  }))
  return {
    id: `session-${id}`,
    ownerId: OWNER,
    schemaVersion: 1,
    listId: `list-${id}`,
    listRevision: 1,
    listSnapshot: { plannedDate: TODAY, items, catalogVersion: 'server-1' },
    status: 'completed',
    cursor: { itemIndex: 0, setIndex: 0 },
    performed: items.map((_, i) =>
      done(i) ? [{ completed: true, actualReps: 10 }] : [{ completed: false }],
    ),
    timer: { accumulatedMs: 0, runningSince: null },
    revision: 3,
    startedAt: '2026-11-24T01:00:00.000Z',
    lastSavedAt: '2026-11-24T01:30:00.000Z',
    completedAt: '2026-11-24T01:30:00.000Z',
    endedAt: '2026-11-24T01:30:00.000Z',
    recordId: `record-${id}`,
  }
}

function recordOf(session) {
  return model.buildWorkoutRecord({
    id: session.recordId,
    session,
    now: new Date('2026-11-24T01:30:00.000Z'),
  })
}

/**
 * requestId로 저장하는 가짜 서버. 운동 0개·101개 이상, 완료한 세트가 없는 기록은 400 INVALID_REQUEST다(docs/api_exercise_v1.0.md).
 * 같은 requestId·같은 본문은 새로 만들지 않고(created: false), 다른 본문은 409 REQUEST_CONFLICT다.
 */
function fakeServer() {
  const stored = new Map()
  const posts = []
  return {
    stored,
    posts,
    request: async (method, path, options) => {
      const { body } = options
      posts.push(body)
      if (
        body.exercises.length < 1 ||
        body.exercises.length > 100 ||
        body.exercises.every((e) => e.completedSets.length === 0)
      ) {
        throw new http.ApiError(400, 'INVALID_REQUEST', '요청 값')
      }
      const before = stored.get(body.requestId)
      if (before) {
        if (JSON.stringify(before) !== JSON.stringify(body)) {
          throw new http.ApiError(409, 'REQUEST_CONFLICT', '충돌')
        }
        return { created: false }
      }
      stored.set(body.requestId, body)
      return { created: true }
    },
  }
}

function depsOf({ sessions, storage = new Map(), request }) {
  const store = {
    getItem: (key) => (storage.has(key) ? storage.get(key) : null),
    setItem: (key, value) => storage.set(key, value),
  }
  return {
    storage,
    deps: {
      records: {
        listByDateRange: async () => ({
          items: sessions.map(recordOf),
          skippedCount: 0,
        }),
      },
      sessions: {
        get: async (id) => sessions.find((s) => s.id === id) ?? null,
      },
      marks: upload.createStorageMarkStore(OWNER, () => store),
      request,
    },
  }
}

// ─── 목록 저장 ──────────────────────────────────────────────

test('목록 저장: 운동 100개는 저장되고, 101개는 저장 전에 100개 한도를 안내하며 저장소를 부르지 않는다', async () => {
  assert.equal(draftModel.MAX_SAVED_ITEMS, 100)
  assert.equal(upload.MAX_RECORD_EXERCISES, 100)
  assert.equal(draftModel.validateDraft(draftOf(100), knownOf(100)).ok, true)

  const over = draftModel.validateDraft(draftOf(101), knownOf(101))
  assert.equal(over.ok, false)
  assert.deepEqual(over.issues, [
    { field: 'items', message: draftModel.ISSUE_MESSAGES.tooManyItems },
  ])
  assert.equal(
    draftModel.ISSUE_MESSAGES.tooManyItems,
    '운동은 한 목록에 최대 100개까지 저장할 수 있어요. 100개 이하가 되도록 운동을 삭제해 주세요.',
  )
  // 이미 저장된 루틴·계획을 초안으로 옮길 때(serverLimits: false)는 막지 않고, W02·W11이 저장 전에 안내한다.
  assert.equal(
    draftModel.validateDraft(draftOf(101), knownOf(101), undefined, {
      serverLimits: false,
    }).ok,
    true,
  )

  const saves = []
  const deps = {
    listRepository: {
      listByDate: async () => ({ items: [], skippedCount: 0 }),
      saveFromDraft: async (input) => {
        saves.push(input.draft.items.length)
        const list = model.buildWorkoutList({
          id: 'list-1',
          ownerId: OWNER,
          requestId: input.requestId,
          draft: input.draft,
          knownExerciseIds: input.knownExerciseIds,
          catalogVersion: 'server-1',
          now: NOW,
        })
        if (!list) throw new Error('목록을 만들 수 없다')
        return { list, created: true }
      },
    },
    now: () => NOW,
  }
  const params = (n) => ({
    draft: draftOf(n),
    knownExerciseIds: knownOf(n),
    acknowledgedDate: TODAY,
    confirmedReplaceListId: null,
  })
  const blocked = await saveList.saveWorkoutList(deps, params(101))
  assert.equal(blocked.kind, 'invalid')
  assert.deepEqual(
    blocked.issues.map((issue) => issue.message),
    [draftModel.ISSUE_MESSAGES.tooManyItems],
  )
  assert.deepEqual(saves, [])
  // 저장소(buildWorkoutList)도 같은 검증(normalizeDraft)을 거쳐 101개 목록을 만들지 않는다.
  assert.equal(
    model.buildWorkoutList({
      id: 'list-x',
      ownerId: OWNER,
      requestId: 'req-x',
      draft: draftOf(101),
      knownExerciseIds: knownOf(101),
      catalogVersion: 'server-1',
      now: NOW,
    }),
    null,
  )

  const saved = await saveList.saveWorkoutList(deps, params(100))
  assert.equal(saved.kind, 'saved')
  assert.equal(saved.list.items.length, 100)
  assert.deepEqual(saves, [100])
})

test('운동 담기: 초안은 100개까지만 담고, 100개면 더 담지 않는다', () => {
  const ninetyNine = draftOf(99)
  const added = draftModel.addExercisesToDraft(
    ninetyNine,
    [exercise('500'), exercise('501')],
    () => 'now',
  )
  assert.equal(added.items.length, 100)
  assert.equal(added.items[99].exerciseId, '500')
  const full = draftOf(100)
  assert.equal(draftModel.addExercisesToDraft(full, [exercise('502')]), full)
  // 읽기 보호용 상한(500)은 그대로라 예전에 100개를 넘게 저장한 값도 읽힌다.
  assert.equal(draftModel.MAX_ITEMS, 500)
})

test('완료·업로드: 운동 100개 목록으로 완료한 기록은 서버에 한 건 저장된다', async () => {
  const done = sessionOf('100', 100, (i) => i % 2 === 0)
  const server = fakeServer()
  const { deps, storage } = depsOf({
    sessions: [done],
    request: server.request,
  })
  assert.deepEqual(await upload.uploadPendingRecords(deps), {
    uploaded: 1,
    rejected: 0,
    stoppedBy: undefined,
  })
  assert.equal(server.posts.length, 1)
  assert.equal(server.stored.size, 1)
  // 완료하지 않은 운동도 계획대로 함께 보낸다(100개 이하라 고칠 필요가 없다).
  assert.equal(server.stored.get('record-100').exercises.length, 100)
  assert.deepEqual(JSON.parse(storage.get(KEY)).uploaded, ['record-100'])
})

// ─── 이미 거절된 기록 ───────────────────────────────────────

test('거절 이유: 운동 101개 기록은 보내지 않고 이유를 남기며, 예전에 INVALID_REQUEST로 거절된 기록도 같은 이유로 다시 분류한다', async () => {
  // fixable: 101개 중 완료한 운동은 60개. unfixable: 101개 모두 완료. fresh: 아직 보낸 적 없는 101개 기록.
  const fixable = sessionOf('fix', 101, (i) => i < 60)
  const unfixable = sessionOf('all', 101)
  const fresh = sessionOf('new', 101, (i) => i === 0)
  const storage = new Map([
    [
      KEY,
      JSON.stringify({
        uploaded: [],
        rejected: {
          'record-fix': 'INVALID_REQUEST',
          'record-all': 'INVALID_REQUEST',
        },
        bodyVersion: 2,
      }),
    ],
  ])
  const server = fakeServer()
  const { deps } = depsOf({
    sessions: [fixable, unfixable, fresh],
    storage,
    request: server.request,
  })
  const summary = await upload.uploadPendingRecords(deps)
  assert.deepEqual(summary, { uploaded: 0, rejected: 1, stoppedBy: undefined })
  // 같은 본문은 늘 400이라 하나도 보내지 않았다.
  assert.equal(server.posts.length, 0)
  assert.deepEqual(JSON.parse(storage.get(KEY)), {
    uploaded: [],
    rejected: {
      'record-fix': 'tooManyExercises',
      'record-all': 'tooManyCompletedExercises',
      'record-new': 'tooManyExercises',
    },
    bodyVersion: 2,
    omitEmpty: [],
  })

  // 화면이 보여 줄 이유. 고칠 수 있는 기록만 다시 보낼 수 있다.
  assert.deepEqual(upload.describeUploadRejection('tooManyExercises'), {
    message:
      '운동이 100개를 넘어 서버에 저장하지 못했어요. 완료한 세트가 없는 운동을 빼면 100개 이하라 다시 보낼 수 있어요.',
    fixable: true,
  })
  assert.deepEqual(
    upload.describeUploadRejection('tooManyCompletedExercises'),
    {
      message:
        '완료한 운동이 100개를 넘어 서버에 저장할 수 없어요. 서버는 기록 하나에 운동을 100개까지만 받아요.',
      fixable: false,
    },
  )
  for (const code of [
    'INVALID_REQUEST',
    'EXERCISE_NOT_FOUND',
    'REQUEST_CONFLICT',
    'sessionMissing',
    'sessionMismatch',
    '모르는 코드',
  ]) {
    const view = upload.describeUploadRejection(code)
    assert.equal(view.fixable, false, code)
    assert.match(view.message, /서버에/, code)
  }
})

test('다시 보내기: 고친 기록(완료한 운동만)은 같은 requestId로 보내 서버에 한 건만 저장되고, 고칠 수 없는 기록은 보내지 않는다', async () => {
  const fixable = sessionOf('fix', 101, (i) => i < 60)
  const unfixable = sessionOf('all', 101)
  const storage = new Map([
    [
      KEY,
      JSON.stringify({
        uploaded: [],
        rejected: {
          'record-fix': 'tooManyExercises',
          'record-all': 'tooManyCompletedExercises',
        },
        bodyVersion: 2,
        omitEmpty: [],
      }),
    ],
  ])
  const server = fakeServer()
  const { deps } = depsOf({
    sessions: [fixable, unfixable],
    storage,
    request: server.request,
  })

  // 다시 보내기를 누르지 않으면 보내지 않는다.
  await upload.uploadPendingRecords(deps)
  assert.equal(server.posts.length, 0)

  const first = await upload.uploadPendingRecords({
    ...deps,
    retry: new Set(['record-fix', 'record-all']),
  })
  assert.deepEqual(first, { uploaded: 1, rejected: 0, stoppedBy: undefined })
  assert.equal(server.posts.length, 1)
  assert.deepEqual([...server.stored.keys()], ['record-fix'])
  const body = server.stored.get('record-fix')
  assert.equal(body.requestId, 'record-fix')
  assert.equal(body.exercises.length, 60)
  assert.ok(body.exercises.every((e) => e.completedSets.length > 0))
  // 남은 운동의 목표·완료 세트는 원래 본문과 같다.
  const full = upload.toRecordUploadBody(recordOf(fixable), fixable)
  assert.deepEqual(body.exercises, full.exercises.slice(0, 60))
  assert.deepEqual(JSON.parse(storage.get(KEY)), {
    uploaded: ['record-fix'],
    rejected: { 'record-all': 'tooManyCompletedExercises' },
    bodyVersion: 2,
    omitEmpty: ['record-fix'],
  })

  // 다시 눌러도, 다음 업로드가 돌아도 더 보내지 않는다. 서버에는 한 건뿐이다.
  await upload.uploadPendingRecords({ ...deps, retry: new Set(['record-fix']) })
  await upload.uploadPendingRecords(deps)
  assert.equal(server.posts.length, 1)
  assert.equal(server.stored.size, 1)
  assert.deepEqual(JSON.parse(storage.get(KEY)).omitEmpty, [])
})

test('다시 보내기: 보내다 시간 초과로 멈추면(서버는 저장함) 다음 업로드가 같은 본문을 다시 보내 기록이 겹치지 않는다', async () => {
  const fixable = sessionOf('fix', 101, (i) => i < 60)
  const storage = new Map([
    [
      KEY,
      JSON.stringify({
        uploaded: [],
        rejected: { 'record-fix': 'tooManyExercises' },
        bodyVersion: 2,
      }),
    ],
  ])
  const server = fakeServer()
  let hold = true
  const { deps } = depsOf({
    sessions: [fixable],
    storage,
    request: async (method, path, options) => {
      const answer = await server.request(method, path, options)
      if (!hold) return answer
      hold = false
      // 서버는 저장했지만 응답이 오지 않는다.
      return new Promise((_, reject) => {
        options.signal.addEventListener('abort', () =>
          reject(options.signal.reason),
        )
      })
    },
  })
  deps.timeoutMs = 30
  const first = await upload.uploadPendingRecords({
    ...deps,
    retry: new Set(['record-fix']),
  })
  assert.equal(first.stoppedBy?.name, 'TimeoutError')
  // 거절 표시는 지웠고 고쳐 보내기 표시는 남아 다음 업로드도 같은 본문으로 보낸다.
  assert.deepEqual(JSON.parse(storage.get(KEY)), {
    uploaded: [],
    rejected: {},
    bodyVersion: 2,
    omitEmpty: ['record-fix'],
  })
  const second = await upload.uploadPendingRecords(deps)
  assert.deepEqual(second, { uploaded: 1, rejected: 0, stoppedBy: undefined })
  assert.equal(server.posts.length, 2)
  assert.deepEqual(server.posts[1], server.posts[0])
  assert.equal(server.stored.size, 1)
})

test('다시 보내기: 보내다 네트워크 오류로 멈추면 새로고침 뒤에도 미동기화로 읽히고, 다시 보내면 같은 requestId·같은 본문으로 한 건만 저장된다', async () => {
  const fixable = sessionOf('fix', 101, (i) => i < 100)
  const storage = new Map([
    [
      KEY,
      JSON.stringify({
        uploaded: [],
        rejected: { 'record-fix': 'tooManyExercises' },
        bodyVersion: 2,
      }),
    ],
  ])
  const server = fakeServer()
  const sent = []
  let offline = true
  const { deps } = depsOf({
    sessions: [fixable],
    storage,
    request: async (method, path, options) => {
      sent.push(structuredClone(options.body))
      // 첫 재전송은 서버에 닿지 못한다(fetch 실패).
      if (offline) throw new TypeError('Failed to fetch')
      return server.request(method, path, options)
    },
  })
  const first = await upload.uploadPendingRecords({
    ...deps,
    retry: new Set(['record-fix']),
  })
  assert.equal(first.stoppedBy?.name, 'TypeError')
  assert.equal(server.stored.size, 0)

  // 새로고침: 같은 localStorage를 새 표시 저장소로 다시 읽는다. 거절 이유는 없지만 미동기화(다시 보내기 대기)로 남는다.
  const reloaded = upload
    .createStorageMarkStore(OWNER, () => ({
      getItem: (key) => storage.get(key) ?? null,
      setItem: () => {},
    }))
    .read()
  assert.equal(reloaded.rejected.has('record-fix'), false)
  assert.equal(upload.isResendPending(reloaded, 'record-fix'), true)

  // 화면의 "다시 보내기"(requestRecordRetry → 같은 실행기)와 같은 호출.
  offline = false
  const second = await upload.uploadPendingRecords({
    ...deps,
    retry: new Set(['record-fix']),
  })
  assert.deepEqual(second, { uploaded: 1, rejected: 0, stoppedBy: undefined })
  assert.equal(sent.length, 2)
  assert.deepEqual(sent[1], sent[0])
  assert.equal(sent[1].requestId, 'record-fix')
  assert.equal(sent[1].exercises.length, 100)
  assert.equal(server.stored.size, 1)
  const after = deps.marks.read()
  assert.equal(upload.isResendPending(after, 'record-fix'), false)
  assert.equal(after.uploaded.has('record-fix'), true)
})

test('다시 보내기: 더 오래된 기록이 계속 서버 오류(500)로 실패해도 누른 기록을 먼저 보내 저장한다', async () => {
  const older = sessionOf('old', 2)
  const fixable = sessionOf('fix', 101, (i) => i < 100)
  const storage = new Map([
    [
      KEY,
      JSON.stringify({
        uploaded: [],
        rejected: {},
        bodyVersion: 2,
        omitEmpty: ['record-fix'],
      }),
    ],
  ])
  const server = fakeServer()
  const { deps } = depsOf({
    sessions: [older, fixable],
    storage,
    request: async (method, path, options) => {
      if (options.body.requestId === 'record-old') {
        throw new http.ApiError(500, 'INTERNAL_SERVER_ERROR', '서버 오류')
      }
      return server.request(method, path, options)
    },
  })
  // 자동 업로드는 오래된 기록에서 멈춘다.
  const auto = await upload.uploadPendingRecords(deps)
  assert.equal(auto.uploaded, 0)
  assert.equal(server.stored.size, 0)
  assert.equal(upload.isResendPending(deps.marks.read(), 'record-fix'), true)
  // 다시 보내기는 누른 기록을 먼저 보낸다.
  const retried = await upload.uploadPendingRecords({
    ...deps,
    retry: new Set(['record-fix']),
  })
  assert.equal(retried.uploaded, 1)
  assert.deepEqual([...server.stored.keys()], ['record-fix'])
  assert.equal(upload.isResendPending(deps.marks.read(), 'record-fix'), false)
})

test('운동 수 판정: 완료한 운동만 세어도 100개를 넘으면 고칠 수 없다', () => {
  const rec = (n, completed) => ({
    exercises: Array.from({ length: n }, (_, i) => ({
      completedSets: i < completed ? [{ setNumber: 1 }] : [],
    })),
  })
  assert.equal(upload.exerciseLimitRejection(rec(100, 0), false), null)
  assert.equal(
    upload.exerciseLimitRejection(rec(101, 100), false),
    'tooManyExercises',
  )
  assert.equal(upload.exerciseLimitRejection(rec(101, 100), true), null)
  assert.equal(
    upload.exerciseLimitRejection(rec(101, 101), false),
    'tooManyCompletedExercises',
  )
  assert.equal(
    upload.exerciseLimitRejection(rec(150, 101), true),
    'tooManyCompletedExercises',
  )
})

// ─── 화면 ──────────────────────────────────────────────────

function renderResult(upload) {
  const session = sessionOf('fix', 3, (i) => i < 2)
  const snapshot = {
    load: { status: 'completed' },
    record: recordOf(session),
    editLocked: true,
  }
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(ResultView, {
        snapshot,
        editor: null,
        panel: null,
        failureDismissed: false,
        actions: {},
        upload,
      }),
    ),
  )
}

test('화면: 저장된 기록(W15)은 거절 이유를 보여 주고, 고칠 수 있는 기록에만 다시 보내기 버튼을 그린다', () => {
  const noop = () => {}
  const fixable = renderResult({
    rejection: upload.describeUploadRejection('tooManyExercises'),
    retry: null,
    sendFixed: noop,
  })
  assert.match(fixable, /서버에 저장되지 않은 기록이에요/)
  assert.match(fixable, /운동이 100개를 넘어 서버에 저장하지 못했어요/)
  assert.match(fixable, /완료한 운동만 다시 보내기/)

  const unfixable = renderResult({
    rejection: upload.describeUploadRejection('tooManyCompletedExercises'),
    retry: null,
    sendFixed: noop,
  })
  assert.match(unfixable, /완료한 운동이 100개를 넘어 서버에 저장할 수 없어요/)
  assert.doesNotMatch(unfixable, /다시 보내기/)

  const sending = renderResult({
    rejection: upload.describeUploadRejection('tooManyExercises'),
    retry: 'sending',
    sendFixed: noop,
  })
  assert.match(sending, /aria-disabled="true"/)
  assert.match(sending, /다시 보내는 중이에요/)

  assert.match(
    renderResult({ rejection: null, retry: 'saved', sendFixed: noop }),
    /완료한 운동만 다시 보내 서버에 저장했어요/,
  )
  assert.match(
    renderResult({ rejection: null, retry: 'later', sendFixed: noop }),
    /지금은 서버에 보내지 못했어요/,
  )
  const clean = renderResult({ rejection: null, retry: null, sendFixed: noop })
  assert.doesNotMatch(clean, /서버에 저장되지 않은|서버에 보내지/)
})

test('화면: 고쳐 보내다 멈춘 기록(W15)은 표시만으로 미동기화 안내와 다시 보내기 버튼을 그리고, 기록을 열면 업로드를 요청한다', () => {
  const noop = () => {}
  const pending = renderResult({
    rejection: null,
    resendPending: true,
    retry: null,
    sendFixed: noop,
  })
  assert.match(pending, /서버에 아직 저장되지 않은 기록이에요/)
  assert.match(pending, /같은 내용으로 다시 보낼 수 있어요/)
  assert.match(pending, />다시 보내기</)
  // 새로고침 뒤처럼 retry 상태(화면 안의 값)가 없어도 보인다. 다시 보내다 또 멈춰도(later) 같은 안내와 버튼이 남는다.
  const later = renderResult({
    rejection: null,
    resendPending: true,
    retry: 'later',
    sendFixed: noop,
  })
  assert.match(later, />다시 보내기</)
  const sending = renderResult({
    rejection: null,
    resendPending: true,
    retry: 'sending',
    sendFixed: noop,
  })
  assert.match(sending, /aria-disabled="true"/)

  const hook = source('exercise/useRecordUploadStatus.ts')
  // 상태는 화면 안의 값이 아니라 표시(localStorage)에서 읽는다.
  assert.match(
    hook,
    /recordId !== null && marks !== null && isResendPending\(marks, recordId\)/,
  )
  // 기록 상세를 바로 열어도 업로드를 시작한다.
  assert.match(
    hook,
    /useEffect\(\(\) => \{\s*if \(userId && recordId\) requestRecordUpload\(userId\)/,
  )
  // W01 표시는 표시 저장소의 순수 함수로 고른다(아래 테스트).
  assert.match(hook, /unsyncedRecordIds\(readRecordUploadMarks\(userId\)\)/)
})

test('미동기화 판정: 거절된 기록과 다시 보내다 멈춘 기록만 고르고, 올렸거나 다시 거절된 기록과 고쳐 보내지 않은 기록은 다시 보내기 대기가 아니다', () => {
  const marks = {
    uploaded: new Set(['done', 'fixed-done']),
    rejected: new Map([
      ['too-many', 'tooManyExercises'],
      ['fixed-again', 'EXERCISE_NOT_FOUND'],
    ]),
    bodyVersion: 2,
    omitEmpty: new Set(['fixed-pending', 'fixed-done', 'fixed-again']),
  }
  assert.equal(upload.isResendPending(marks, 'fixed-pending'), true)
  assert.equal(upload.isResendPending(marks, 'fixed-done'), false)
  assert.equal(upload.isResendPending(marks, 'fixed-again'), false)
  assert.equal(upload.isResendPending(marks, 'never-sent'), false)
  assert.deepEqual([...upload.unsyncedRecordIds(marks)].sort(), [
    'fixed-again',
    'fixed-pending',
    'too-many',
  ])
})

test('화면: 최근 운동 기록(W01)은 서버가 받지 않은 기록에 표시를 붙이고, 결과 화면이 업로드 상태를 연결한다', () => {
  const item = (id) => ({
    id,
    sessionId: `session-${id}`,
    performedDate: TODAY,
    title: '운동',
    exerciseCount: 101,
    completedSetCount: 60,
    measuredMs: null,
  })
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(RecentRecordsSection, {
        slot: {
          status: 'ready',
          data: { items: [item('a'), item('b')], skippedCount: 0 },
        },
        sharedUnavailable: false,
        onRetry: () => {},
        notSavedIds: new Set(['b']),
      }),
    ),
  )
  assert.equal((html.match(/서버에 저장되지 않았어요/g) ?? []).length, 1)

  const page = source('pages/ExerciseResultPage.tsx')
  assert.match(page, /useRecordUploadStatus\(/)
  assert.match(page, /upload=\{upload\}/)
  const dashboard = source('pages/ExerciseDashboardPage.tsx')
  assert.match(dashboard, /useRejectedRecordIds\(/)
  // 다시 보내기도 자동 업로드와 같은 실행기로 돌아서 같은 기록을 동시에 보내지 않는다.
  const origin = source('exercise/recordUploadSource.ts')
  assert.match(origin, /retry: takeRetries\(ownerId\)/)
  assert.match(
    origin,
    /export function requestRecordRetry[\s\S]*?return runUpload\(/,
  )
})
