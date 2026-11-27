// C2 커뮤니티 내 글 수정·삭제(계획 v2 6장·8.2, 결정 C2-D1~D8·C2-IMPL-1~3):
// 상세 mine(회원 연결 optional·비회원 연결 none) · 회원 상세의 비회원 1회 재조회(C2-R1: 401·재발급 500/NETWORK·/users/me 실패·
// 계정 불일치·정지 계정 / 404·400·403·형식 오류·취소·비회원 연결은 재조회 안 함) · PATCH·DELETE 요청과 결과 분류(gone/forbidden/rejected/uncertain,
// DELETE 성공 본문의 data 생략) · 세 겹 현재성(C2-R2: 같은 계정 A글→B글 이동, 취소, 새 작업, 화면 이탈, 같은 ID 재로그인) ·
// 결과 미확인 문구와 자동 재전송 없음(C2-R3) · deleted/gone 안내 구분(C2-R4) · 버튼 표시 조건(D3: 자유게시판만) · 모의 저장소 · 화면 정적 규칙.
// 실제 서버·실제 계정은 쓰지 않는다(가짜 fetch, 'access-A1' 같은 가짜 토큰). 보류 Promise(deferred)로 순서를 강제한다.
// 개인 .env.development.local의 VITE_DEV_AUTH 값이 결과를 바꾸지 않도록 빈 envDir을 쓴다. 윈도우 PowerShell에서도 같은 명령으로 실행한다.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'
import {
  createFakeServer,
  createStorage,
  deferred,
  fail,
  flush,
  loginOk,
  me,
  networkError,
  ok,
  refreshOk,
  within,
} from './apiTestKit.mjs'

const envDir = mkdtempSync(join(tmpdir(), 'community-edit-env-'))
const storage = createStorage()
let realServer, mockServer
let server, c, session, backendModule, ctx, PostView, EditForm, BoardView
let mockSource

async function devServer(devAuth) {
  if (devAuth) process.env.VITE_DEV_AUTH = 'true'
  else delete process.env.VITE_DEV_AUTH
  const vite = await createServer({
    envDir,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  delete process.env.VITE_DEV_AUTH
  return vite
}

before(async () => {
  globalThis.sessionStorage = storage
  realServer = await devServer(false)
  mockServer = await devServer(true)
  const load = (path) => realServer.ssrLoadModule(path)
  server = await load('/src/community/serverCommunitySource.ts')
  c = await load('/src/community/community.ts')
  session = await load('/src/api/session.ts')
  backendModule = await load('/src/auth/serverBackend.ts')
  ctx = await load('/src/auth/authContext.ts')
  PostView = (await load('/src/components/community/CommunityPostView.tsx'))
    .default
  EditForm = (await load('/src/components/community/CommunityEditForm.tsx'))
    .default
  BoardView = (await load('/src/components/community/CommunityBoardView.tsx'))
    .default
  mockSource = await mockServer.ssrLoadModule(
    '/src/community/communitySource.ts',
  )
})
after(async () => {
  await realServer?.close()
  await mockServer?.close()
  delete globalThis.sessionStorage
  rmSync(envDir, { recursive: true, force: true })
})
beforeEach(() => {
  storage.map.clear()
})

const signal = new AbortController().signal
const DETAIL = 'GET /community/posts/7'
const PATCH = 'PATCH /community/posts/7'
const DELETE = 'DELETE /community/posts/7'
const REFRESH = 'POST /auth/token/refresh'
const read = (path) => readFileSync(path, 'utf8')
const strip = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const user = (id, nickname = `nick${id}`) => ({
  id,
  email: `u${id}@example.test`,
  nickname,
  entitlement: 'free',
})
const row = (over = {}) => ({
  postId: 7,
  postType: 'general',
  title: '첫 글',
  content: '본문',
  authorName: '작성자',
  createdAt: '2026-11-25T09:30:00',
  mine: true,
  ...over,
})
const edit = { title: '고친 제목', body: '고친 내용' }
const callsOf = (fake, key) => fake.calls.filter((call) => call.key === key)

function newSession(fake) {
  return session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
}

/** 가짜 fetch 세션(로그인 안 함). member를 넘기면 회원 연결로 만든다(전환 구간 시험용). */
function guestEnv(member = false) {
  const fake = createFakeServer()
  const s = newSession(fake)
  return {
    fake,
    source: server.createServerCommunitySource(s.request.bind(s), { member }),
  }
}

/** 가짜 fetch 세션으로 로그인한 뒤 회원 연결을 만든다. */
async function login(userId = 7) {
  const fake = createFakeServer()
  const s = newSession(fake)
  const backend = backendModule.createServerBackend(s)
  fake.on('POST /auth/login', loginOk(userId, 'access-A1'))
  fake.on('GET /users/me', me(userId))
  const result = await backend.login(`u${userId}@example.test`, 'x')
  assert.equal(result.ok, true)
  return {
    fake,
    session: s,
    source: server.createServerCommunitySource(s.request.bind(s), {
      member: true,
    }),
  }
}

/** settlePostWrite가 부른 처리기 이름을 모은다. */
function settle(submitted) {
  const seen = []
  const handler = (name) => (result) =>
    seen.push(result?.detail ? `${name}:${result.detail.post.title}` : name)
  c.settlePostWrite(submitted, {
    updated: handler('updated'),
    deleted: handler('deleted'),
    gone: handler('gone'),
    forbidden: handler('forbidden'),
    rejected: handler('rejected'),
    uncertain: handler('uncertain'),
    unconfirmed: handler('unconfirmed'),
  })
  return seen
}

// ── 상세 mine(C2-D1) ─────────────────────────────────────────────────────

test('상세: 회원 연결은 토큰을 붙여 mine을 받고, 비회원 연결은 토큰 없이 읽는다(전환 구간에 토큰이 있어도)', async () => {
  const env = await login()
  env.fake.on(DETAIL, ok(row({ mine: true })))
  const mine = await env.source.getPost('free', '7', signal)
  assert.equal(mine.post.mine, true)
  assert.equal(
    callsOf(env.fake, DETAIL)[0].headers.Authorization,
    'Bearer access-A1',
  )

  // 같은 세션(토큰 있음)이라도 비회원 연결이면 auth:none(Codex v2 확인사항).
  const fakeGuest = env.fake
  const s = env.session
  const guestSource = server.createServerCommunitySource(s.request.bind(s))
  fakeGuest.on(DETAIL, ok(row({ mine: false })))
  const guest = await guestSource.getPost('free', '7', signal)
  assert.equal(guest.post.mine, false)
  assert.equal(callsOf(fakeGuest, DETAIL)[1].headers.Authorization, undefined)
})

test('상세: mine이 없거나 boolean이 아니면 형식 오류(조회 실패)다', async () => {
  const { fake, source } = guestEnv()
  for (const bad of [
    { mine: undefined },
    { mine: 'true' },
    { mine: 1 },
    { mine: null },
  ]) {
    fake.on(DETAIL, ok(row(bad)))
    assert.deepEqual(await c.runGetPost(source, 'free', '7', signal), {
      status: 'error',
    })
  }
})

// ── 회원 상세의 비회원 1회 재조회(C2-R1, C2-IMPL-2) ──────────────────────────

test('C2-R1: 만료 토큰 → 재발급·확인 실패의 모든 바깥 오류(401·500·NETWORK)에서 토큰 없이 한 번만 다시 읽고 mine=false다', async () => {
  const cases = [
    ['refresh 401(세션 종료)', [[REFRESH, fail(401, 'INVALID_TOKEN')]]],
    ['refresh 500', [[REFRESH, fail(500, 'INTERNAL_ERROR')]]],
    ['refresh NETWORK', [[REFRESH, networkError()]]],
    ['refresh 정지 계정', [[REFRESH, fail(403, 'ACCOUNT_SUSPENDED')]]],
    [
      '/users/me 500',
      [
        [REFRESH, refreshOk('access-A2')],
        ['GET /users/me', fail(500, 'INTERNAL_ERROR')],
      ],
    ],
    [
      '/users/me NETWORK',
      [
        [REFRESH, refreshOk('access-A2')],
        ['GET /users/me', networkError()],
      ],
    ],
    [
      '/users/me 다른 계정(세션 종료)',
      [
        [REFRESH, refreshOk('access-A2')],
        ['GET /users/me', me(99)],
      ],
    ],
  ]
  for (const [name, routes] of cases) {
    const env = await login()
    env.fake.on(DETAIL, fail(401, 'TOKEN_EXPIRED'))
    for (const [key, response] of routes) env.fake.on(key, response)
    env.fake.on(DETAIL, ok(row({ mine: false })))
    const detail = await within(env.source.getPost('free', '7', signal))
    assert.equal(detail.post.mine, false, name)
    const gets = callsOf(env.fake, DETAIL)
    assert.equal(gets.length, 2, name)
    assert.equal(gets[0].headers.Authorization, 'Bearer access-A1', name)
    assert.equal(gets[1].headers.Authorization, undefined, name)
    assert.equal(env.fake.pending(DETAIL), 0, name)
  }
})

test('C2-R1: 재조회도 실패하면 그 결과대로(404 → 없는 글, 500 → 조회 실패)이고 세 번째 요청은 없다', async () => {
  for (const [second, expected] of [
    [fail(404, 'POST_NOT_FOUND'), { status: 'notfound' }],
    [fail(500, 'INTERNAL_ERROR'), { status: 'error' }],
  ]) {
    const env = await login()
    env.fake.on(DETAIL, fail(500, 'INTERNAL_ERROR'), second)
    assert.deepEqual(
      await c.runGetPost(env.source, 'free', '7', signal),
      expected,
    )
    assert.equal(callsOf(env.fake, DETAIL).length, 2)
  }
})

test('C2-R1: 404·400·처음 받은 정지 계정 403·형식 오류는 다시 읽지 않는다', async () => {
  for (const [first, expected] of [
    [fail(404, 'POST_NOT_FOUND'), { status: 'notfound' }],
    [fail(400, 'INVALID_REQUEST'), { status: 'error' }],
    [fail(403, 'ACCOUNT_SUSPENDED'), { status: 'error' }],
    [ok(row({ mine: 'x' })), { status: 'error' }],
  ]) {
    const env = await login()
    env.fake.on(DETAIL, first)
    assert.deepEqual(
      await c.runGetPost(env.source, 'free', '7', signal),
      expected,
    )
    assert.equal(callsOf(env.fake, DETAIL).length, 1)
  }
})

test('C2-R1: 비회원 연결은 500·NETWORK에서도 다시 읽지 않는다(처음부터 토큰 없이 보냈다)', async () => {
  for (const response of [fail(500, 'INTERNAL_ERROR'), networkError()]) {
    const { fake, source } = guestEnv()
    fake.on(DETAIL, response)
    assert.deepEqual(await c.runGetPost(source, 'free', '7', signal), {
      status: 'error',
    })
    assert.equal(callsOf(fake, DETAIL).length, 1)
  }
})

test('C2-R1: 화면을 떠나 취소된 조회는 다시 읽지 않는다', async () => {
  const env = await login()
  const held = deferred()
  env.fake.on(DETAIL, held)
  const controller = new AbortController()
  const pending = env.source.getPost('free', '7', controller.signal)
  await flush()
  controller.abort()
  await assert.rejects(within(pending))
  assert.equal(callsOf(env.fake, DETAIL).length, 1)
})

// ── PATCH·DELETE 요청과 분류 ─────────────────────────────────────────────

test('수정: 로그인 토큰으로 title·content만 보내고 200 상세면 updated(mine 포함)다', async () => {
  const env = await login()
  env.fake.on(PATCH, ok(row({ title: '고친 제목', content: '고친 내용' })))
  const result = await env.source.updatePost('7', edit, signal)
  assert.equal(result.kind, 'updated')
  assert.equal(result.detail.post.title, '고친 제목')
  assert.equal(result.detail.post.body, '고친 내용')
  assert.equal(result.detail.post.mine, true)
  const call = callsOf(env.fake, PATCH)[0]
  assert.equal(call.headers.Authorization, 'Bearer access-A1')
  assert.deepEqual(call.body, { title: '고친 제목', content: '고친 내용' })
})

test('수정·삭제 분류: 404 POST_NOT_FOUND만 gone, 403 ACCESS_DENIED만 forbidden, 그 밖 4xx rejected, 네트워크·5xx·형식 오류 uncertain', async () => {
  // 응답은 쓸 때마다 새로 만든다(Response 본문은 한 번만 읽힌다).
  const table = [
    [() => fail(404, 'POST_NOT_FOUND'), 'gone'],
    [() => fail(404, 'NOT_FOUND'), 'rejected'],
    [() => fail(403, 'ACCESS_DENIED'), 'forbidden'],
    [() => fail(403, 'ACCOUNT_SUSPENDED'), 'rejected'],
    [() => fail(400, 'INVALID_REQUEST'), 'rejected'],
    [() => fail(500, 'INTERNAL_ERROR'), 'uncertain'],
    [() => fail(503, 'AI_UNAVAILABLE'), 'uncertain'],
    [() => networkError(), 'uncertain'],
  ]
  for (const [response, kind] of table) {
    const env = await login()
    env.fake.on(PATCH, response())
    assert.equal(
      (await env.source.updatePost('7', edit, signal)).kind,
      kind,
      `PATCH ${kind}`,
    )
    env.fake.on(DELETE, response())
    assert.equal(
      (await env.source.deletePost('7', signal)).kind,
      kind,
      `DELETE ${kind}`,
    )
  }
  // 200인데 고친 글을 알 수 없으면 uncertain(형식 오류·다른 id·다른 게시판).
  for (const body of [
    ok({ postId: 7 }),
    ok(row({ postId: 8 })),
    ok(row({ postType: 'question' })),
    ok(row({ mine: undefined })),
  ]) {
    const env = await login()
    env.fake.on(PATCH, body)
    assert.equal(
      (await env.source.updatePost('7', edit, signal)).kind,
      'uncertain',
    )
  }
})

test('삭제: 200 본문이 {success, message}뿐이어도(data 생략) deleted다(C2-D5·R4b)', async () => {
  const env = await login()
  env.fake.on(DELETE, ok(undefined))
  assert.deepEqual(await env.source.deletePost('7', signal), {
    kind: 'deleted',
  })
  assert.equal(
    callsOf(env.fake, DELETE)[0].headers.Authorization,
    'Bearer access-A1',
  )
  assert.equal(callsOf(env.fake, DELETE)[0].body, undefined)
})

test('잘못된 id·비회원은 보내지 않고 rejected다', async () => {
  const env = await login()
  for (const id of ['abc', '0', '01', ' 7'])
    assert.equal(
      (await env.source.updatePost(id, edit, signal)).kind,
      'rejected',
    )
  assert.equal((await env.source.deletePost('abc', signal)).kind, 'rejected')
  const guest = guestEnv()
  assert.equal(
    (await guest.source.updatePost('7', edit, signal)).kind,
    'rejected',
  )
  assert.equal((await guest.source.deletePost('7', signal)).kind, 'rejected')
  assert.equal(
    env.fake.calls.filter((c2) => c2.method !== 'POST' && c2.method !== 'GET')
      .length,
    0,
  )
  assert.equal(guest.fake.calls.length, 0)
})

test('C2-R3: 결과 미확인(uncertain)은 자동으로 다시 보내지 않고, 문구는 다른 탭 수정을 덮어쓸 수 있다고 알린다', async () => {
  const env = await login()
  env.fake.on(PATCH, networkError())
  const work = ctx.createLoginWork(user('7'))
  const scope = c.createPostWriteScope()
  scope.activate('7:free:7')
  const submitted = await c.submitPostEdit(
    env.source,
    '7',
    edit,
    signal,
    () => work.beginAccountWork(),
    scope.begin('7:free:7'),
  )
  assert.deepEqual(settle(submitted), ['uncertain'])
  await flush()
  assert.equal(callsOf(env.fake, PATCH).length, 1)
  assert.match(c.EDIT_RESULT_TEXT.uncertain, /덮어써요/)
  assert.doesNotMatch(c.EDIT_RESULT_TEXT.uncertain, /안전/)
  // 사용자가 [다시 저장]을 누르면 그때만 같은 값을 다시 보낸다(D4 last-write-wins).
  env.fake.on(PATCH, ok(row({ title: '고친 제목' })))
  const again = await c.submitPostEdit(
    env.source,
    '7',
    edit,
    signal,
    () => work.beginAccountWork(),
    scope.begin('7:free:7'),
  )
  assert.deepEqual(settle(again), ['updated:고친 제목'])
  assert.equal(callsOf(env.fake, PATCH).length, 2)
})

test('C2-R4: deleted만 "삭제했어요", gone은 중립 문구이고 목록 안내도 그 둘을 구분한다', () => {
  assert.match(c.DELETE_RESULT_TEXT.deleted, /삭제했어요/)
  assert.doesNotMatch(c.DELETE_RESULT_TEXT.gone, /삭제/)
  assert.doesNotMatch(c.EDIT_RESULT_TEXT.gone, /삭제됐어요\./)
  assert.match(c.EDIT_RESULT_TEXT.gone, /수 있어요/)
  const board = (notice) =>
    render(
      createElement(BoardView, {
        board: 'free',
        state: { status: 'ready', posts: [] },
        onRetry: () => {},
        notice,
      }),
    )
  assert.match(board('deleted'), /data-community-board-notice="deleted"/)
  assert.match(text(board('deleted')), /글을 삭제했어요/)
  assert.match(text(board('gone')), /글을 찾을 수 없어 목록으로 이동했어요/)
  assert.doesNotMatch(text(board('gone')), /삭제했어요/)
  assert.doesNotMatch(board(null), /data-community-board-notice/)
  assert.equal(c.isBoardNotice('deleted'), true)
  assert.equal(c.isBoardNotice('gone'), true)
  assert.equal(c.isBoardNotice('other'), false)
})

// ── 세 겹 현재성(C2-R2, C2-IMPL-3) ──────────────────────────────────────────

/** 수정·삭제 응답 5분류. Response 본문은 한 번만 읽히므로 쓸 때마다 새로 만든다. */
const RESULT_FACTORIES = [
  () => [ok(row({ title: '늦은 수정' })), ok(undefined)],
  () => [fail(404, 'POST_NOT_FOUND'), fail(404, 'POST_NOT_FOUND')],
  () => [fail(403, 'ACCESS_DENIED'), fail(403, 'ACCESS_DENIED')],
  () => [fail(400, 'INVALID_REQUEST'), fail(400, 'INVALID_REQUEST')],
  () => [fail(500, 'INTERNAL_ERROR'), fail(500, 'INTERNAL_ERROR')],
]

test('C2-R2: 같은 계정으로 A글 수정·삭제 요청 → B글로 이동 → A의 늦은 결과(5분류 모두)는 아무것도 반영하지 않는다', async () => {
  for (const [patchResponse, deleteResponse] of RESULT_FACTORIES.map((make) =>
    make(),
  )) {
    for (const which of ['edit', 'delete']) {
      const env = await login()
      const work = ctx.createLoginWork(user('7'))
      const scope = c.createPostWriteScope()
      scope.activate('7:free:7')
      const held = deferred()
      env.fake.on(which === 'edit' ? PATCH : DELETE, held)
      const ticket = scope.begin('7:free:7')
      const pending =
        which === 'edit'
          ? c.submitPostEdit(
              env.source,
              '7',
              edit,
              signal,
              () => work.beginAccountWork(),
              ticket,
            )
          : c.submitPostDelete(
              env.source,
              '7',
              signal,
              () => work.beginAccountWork(),
              ticket,
            )
      await flush()
      // B글 화면이 활성이 된다(이전 화면의 정리보다 먼저 와도 지금 활성 대상과 비교한다).
      scope.activate('7:free:8')
      held.resolve(which === 'edit' ? patchResponse : deleteResponse)
      const submitted = await within(pending)
      assert.equal(submitted.currency(), 'stale')
      assert.deepEqual(settle(submitted), [], `${which}`)
    }
  }
})

test('C2-R2: 취소·편집 종료(invalidate), 새 작업 시작, 화면 이탈(deactivate), 요청 중단은 이전 작업 결과를 버린다', async () => {
  const run = async (interrupt) => {
    const env = await login()
    const work = ctx.createLoginWork(user('7'))
    const scope = c.createPostWriteScope()
    scope.activate('k')
    const held = deferred()
    env.fake.on(PATCH, held)
    const controller = new AbortController()
    const pending = c.submitPostEdit(
      env.source,
      '7',
      edit,
      controller.signal,
      () => work.beginAccountWork(),
      scope.begin('k'),
    )
    await flush()
    interrupt(scope, controller)
    held.resolve(ok(row({ title: '늦은 수정' })))
    return within(pending.catch(() => null))
  }
  for (const [name, interrupt] of [
    ['invalidate', (scope) => scope.invalidate()],
    ['새 작업', (scope) => scope.begin('k')],
    ['deactivate', (scope) => scope.deactivate('k')],
    ['abort', (_scope, controller) => controller.abort()],
  ]) {
    const submitted = await run(interrupt)
    assert.ok(submitted, name)
    assert.equal(submitted.currency(), 'stale', name)
    assert.deepEqual(settle(submitted), [], name)
  }
})

test('C2-R2: 새 글 화면이 활성이 된 뒤 아직 정리되지 않은 이전 화면이 시작한 작업은 보내지도 표시하지도 않는다(지금 활성 대상과 비교)', async () => {
  const env = await login()
  const work = ctx.createLoginWork(user('7'))
  const scope = c.createPostWriteScope()
  scope.activate('7:free:7')
  scope.activate('7:free:8')
  // 이전 화면(7번 글)은 아직 남아 있고, 정리 전에 삭제를 눌렀다.
  const ticket = scope.begin('7:free:7')
  assert.equal(ticket(), false)
  const submitted = await c.submitPostDelete(
    env.source,
    '7',
    signal,
    () => work.beginAccountWork(),
    ticket,
  )
  assert.equal(submitted.currency(), 'stale')
  assert.deepEqual(settle(submitted), [])
  assert.equal(callsOf(env.fake, DELETE).length, 0)
  // 지금 활성인 8번 글의 작업은 그대로 진행된다.
  assert.equal(scope.begin('7:free:8')(), true)
})

test('C2-C1: 이전 화면의 begin은 지금 화면에서 이미 진행 중인 작업을 무효로 만들지 않고, 그 작업의 정상 결과는 그대로 반영된다', async () => {
  for (const which of ['edit', 'delete']) {
    const env = await login()
    const work = ctx.createLoginWork(user('7'))
    const scope = c.createPostWriteScope()
    scope.activate('7:free:7')
    scope.activate('7:free:8')
    // 지금 화면(8번 글)의 작업이 먼저 시작되어 응답을 기다린다.
    const held = deferred()
    env.fake.on(
      which === 'edit'
        ? 'PATCH /community/posts/8'
        : 'DELETE /community/posts/8',
      held,
    )
    const ticketB = scope.begin('7:free:8')
    const pendingB =
      which === 'edit'
        ? c.submitPostEdit(
            env.source,
            '8',
            edit,
            signal,
            () => work.beginAccountWork(),
            ticketB,
          )
        : c.submitPostDelete(
            env.source,
            '8',
            signal,
            () => work.beginAccountWork(),
            ticketB,
          )
    await flush()
    // 정리 전인 이전 화면(7번 글)이 작업을 시작하려 한다.
    const ticketA = scope.begin('7:free:7')
    assert.equal(ticketA(), false, which)
    assert.equal(ticketB(), true, which)
    held.resolve(
      which === 'edit'
        ? ok(row({ postId: 8, title: 'B 수정' }))
        : ok(undefined),
    )
    const submitted = await within(pendingB)
    assert.equal(submitted.currency(), 'current', which)
    assert.deepEqual(
      settle(submitted),
      [which === 'edit' ? 'updated:B 수정' : 'deleted'],
      which,
    )
  }
})

test('C2-R2: 같은 화면에서 로그인 작업만 바뀌면(같은 ID 재로그인 포함) 교체·이동 없이 unconfirmed만 보인다', async () => {
  for (const change of [
    (work) => work.startLogin(),
    (work) => {
      work.replaceUser(null)
      work.startLogin()
      work.replaceUser(user('7'))
    },
    (work) => work.replaceUser(user('8')),
  ]) {
    for (const [patchResponse, deleteResponse] of RESULT_FACTORIES.map((make) =>
      make(),
    )) {
      const env = await login()
      const work = ctx.createLoginWork(user('7'))
      const scope = c.createPostWriteScope()
      scope.activate('k')
      env.fake.on(PATCH, patchResponse)
      env.fake.on(DELETE, deleteResponse)
      const edited = await c.submitPostEdit(
        env.source,
        '7',
        edit,
        signal,
        () => work.beginAccountWork(),
        scope.begin('k'),
      )
      // 결과가 돌아온 뒤 화면이 반영하기 직전에 로그인이 바뀐다(C1-C1과 같은 구간).
      change(work)
      assert.deepEqual(settle(edited), ['unconfirmed'])
      const work2 = ctx.createLoginWork(user('7'))
      const deleted = await c.submitPostDelete(
        env.source,
        '7',
        signal,
        () => work2.beginAccountWork(),
        scope.begin('k'),
      )
      change(work2)
      assert.deepEqual(settle(deleted), ['unconfirmed'])
    }
  }
})

test('C2-R2: 그대로면 결과대로 반영하고, 보내기 전 로그인 작업이 없으면 보내지 않고 rejected, 대상이 이미 아니면 보내지도 표시하지도 않는다', async () => {
  const env = await login()
  const work = ctx.createLoginWork(user('7'))
  const scope = c.createPostWriteScope()
  scope.activate('k')
  const begin = () => work.beginAccountWork()
  const expected = [
    'updated:늦은 수정',
    'gone',
    'forbidden',
    'rejected',
    'uncertain',
  ]
  const expectedDelete = [
    'deleted',
    'gone',
    'forbidden',
    'rejected',
    'uncertain',
  ]
  for (const [index, [patchResponse, deleteResponse]] of RESULT_FACTORIES.map(
    (make) => make(),
  ).entries()) {
    env.fake.on(PATCH, patchResponse)
    assert.deepEqual(
      settle(
        await c.submitPostEdit(
          env.source,
          '7',
          edit,
          signal,
          begin,
          scope.begin('k'),
        ),
      ),
      [expected[index]],
    )
    env.fake.on(DELETE, deleteResponse)
    assert.deepEqual(
      settle(
        await c.submitPostDelete(
          env.source,
          '7',
          signal,
          begin,
          scope.begin('k'),
        ),
      ),
      [expectedDelete[index]],
    )
  }
  const sentBefore = env.fake.calls.length
  const guest = ctx.createLoginWork(null)
  assert.deepEqual(
    settle(
      await c.submitPostEdit(
        env.source,
        '7',
        edit,
        signal,
        () => guest.beginAccountWork(),
        scope.begin('k'),
      ),
    ),
    ['rejected'],
  )
  const ticket = scope.begin('k')
  scope.activate('other')
  assert.deepEqual(
    settle(await c.submitPostDelete(env.source, '7', signal, begin, ticket)),
    [],
  )
  assert.equal(env.fake.calls.length, sentBefore)
})

test('C2-R2: 연결이 예상하지 못한 예외를 던지면 결과를 모르므로 uncertain이다', async () => {
  const work = ctx.createLoginWork(user('7'))
  const scope = c.createPostWriteScope()
  scope.activate('k')
  const throwing = {
    supports: {
      boards: ['free'],
      comments: false,
      likes: false,
      editOwn: ['free'],
    },
    updatePost: async () => {
      throw new Error('boom')
    },
    deletePost: async () => {
      throw new Error('boom')
    },
  }
  assert.deepEqual(
    settle(
      await c.submitPostEdit(
        throwing,
        '7',
        edit,
        signal,
        () => work.beginAccountWork(),
        scope.begin('k'),
      ),
    ),
    ['uncertain'],
  )
  assert.deepEqual(
    settle(
      await c.submitPostDelete(
        throwing,
        '7',
        signal,
        () => work.beginAccountWork(),
        scope.begin('k'),
      ),
    ),
    ['uncertain'],
  )
})

// ── 버튼 표시·화면 ──────────────────────────────────────────────────────

test('버튼 표시(C2-D1·D3): 회원 + 연결의 editOwn에 이 게시판 + 서버 mine=true일 때만', () => {
  const free = { editOwn: ['free'] }
  assert.equal(c.canEditOwnPost(free, 'free', true, { mine: true }), true)
  assert.equal(c.canEditOwnPost(free, 'free', false, { mine: true }), false)
  assert.equal(c.canEditOwnPost(free, 'free', true, { mine: false }), false)
  assert.equal(c.canEditOwnPost(free, 'free', true, { mine: null }), false)
  assert.equal(c.canEditOwnPost(free, 'free', true, {}), false)
  assert.equal(c.canEditOwnPost(free, 'qa', true, { mine: true }), false)
  assert.equal(c.canEditOwnPost({}, 'free', true, { mine: true }), false)
  assert.equal(c.canEditOwnPost(null, 'free', true, { mine: true }), false)
})

const detailOf = (over = {}) => ({
  post: {
    id: '7',
    board: 'free',
    title: '첫 글',
    excerpt: null,
    authorName: '작성자',
    createdAt: '2026-11-25T09:30:00+09:00',
    commentCount: null,
    answered: null,
    qaCategory: null,
    body: '본문 내용',
    likeCount: null,
    likedByMe: null,
    mine: true,
    ...over,
  },
  comments: [],
})
const own = (over = {}) => ({
  mode: 'view',
  deleting: false,
  notice: null,
  editor: null,
  onEdit: () => {},
  onDelete: () => {},
  onCancelDelete: () => {},
  onConfirmDelete: () => {},
  onRecheck: () => {},
  ...over,
})
const view = (props = {}) =>
  render(
    createElement(PostView, {
      board: 'free',
      state: { status: 'ready', detail: detailOf() },
      onRetry: () => {},
      isMember: true,
      eligibility: { kind: 'guest' },
      onEligibilityRetry: () => {},
      actions: { like: async () => true, comment: async () => true },
      listPath: '/community',
      supports: { comments: false, likes: false },
      ...props,
    }),
  )

test('상세 화면: own이 있으면 수정·삭제 버튼, 편집 모드는 본문·댓글 대신 편집 폼, 삭제 확인은 alertdialog, 안내는 톤별 역할', () => {
  const normal = view({ own: own() })
  assert.match(normal, /data-community-edit-start/)
  assert.match(normal, /data-community-delete-start/)
  assert.match(normal, /data-community-body/)
  assert.doesNotMatch(
    view(),
    /data-community-edit-start|data-community-delete-start/,
  )

  const editing = view({
    own: own({
      mode: 'edit',
      editor: createElement('div', { 'data-editor': '' }),
    }),
  })
  assert.match(editing, /data-editor/)
  assert.doesNotMatch(editing, /data-community-body/)
  assert.doesNotMatch(editing, /data-community-unsupported="comments"/)
  assert.doesNotMatch(editing, /data-community-edit-start/)

  const confirm = view({ own: own({ mode: 'confirm-delete' }) })
  assert.match(confirm, /role="alertdialog"/)
  assert.match(text(confirm), /이 글을 삭제할까요\?/)
  assert.doesNotMatch(confirm, /data-community-edit-start/)
  const deleting = view({
    own: own({ mode: 'confirm-delete', deleting: true }),
  })
  assert.match(text(deleting), /삭제 중…/)
  assert.match(deleting, /data-community-delete-confirm-yes="" disabled=""/)

  const info = view({
    own: own({ notice: { tone: 'info', text: '글을 수정했어요.' } }),
  })
  assert.match(info, /role="status"[^>]*data-community-own-notice="info"/)
  const error = view({
    own: own({ notice: { tone: 'error', text: '내 글만 수정할 수 있어요.' } }),
  })
  assert.match(error, /role="alert"[^>]*data-community-own-notice="error"/)
  assert.doesNotMatch(normal, />신고</)
})

test('C2-C2: 입력 중 취소는 안내가 없고, 저장 요청을 보낸 뒤 취소는 "반영됐을 수 있음"과 다시 불러오기 버튼을 남긴다(자동 재조회 없음)', () => {
  assert.equal(c.editCancelNotice(false), null)
  const notice = c.editCancelNotice(true)
  assert.equal(notice.recheck, true)
  assert.match(notice.text, /반영됐을 수 있어요/)
  assert.doesNotMatch(notice.text, /저장되지 않/)
  const html = view({ own: own({ notice }) })
  assert.match(html, /role="alert"[^>]*data-community-own-notice="error"/)
  assert.match(html, /data-community-own-recheck/)
  assert.match(text(html), /글 다시 불러오기/)
  // 다른 안내에는 다시 불러오기 버튼이 없다.
  assert.doesNotMatch(
    view({ own: own({ notice: { tone: 'info', text: '글을 수정했어요.' } }) }),
    /data-community-own-recheck/,
  )
  // 상세 페이지는 취소 때 이 안내를 쓰고, 저장 중 취소로 곧바로 다시 읽지 않는다.
  const pageCode = strip(read('src/pages/CommunityPostPage.tsx'))
  assert.match(pageCode, /setNotice\(editCancelNotice\(wasSaving\)\)/)
  assert.doesNotMatch(pageCode, /if \(wasSaving\) refresh\(\)/)
  // 폼은 저장 중 취소를 "저장되지 않음"으로 안내하지 않는다.
  const formCode = strip(read('src/components/community/CommunityEditForm.tsx'))
  assert.match(formCode, /'지금 취소해도 이미 보낸 수정은 반영될 수 있어요\.'/)
  assert.doesNotMatch(formCode, /'취소하면 고친 내용은 저장되지 않아요\.'/)
})

test('편집 폼: 현재 제목·내용으로 채우고 수정 완료·취소 버튼과 개인정보 경고가 있다', () => {
  const html = render(
    createElement(EditForm, {
      initialTitle: '원래 제목',
      initialBody: '원래 내용',
      submit: async () => ({
        result: { kind: 'rejected' },
        currency: () => 'current',
      }),
      onUpdated: () => {},
      onForbidden: () => {},
      onCancel: () => {},
      onShowLatest: () => {},
    }),
  )
  assert.match(html, /value="원래 제목"/)
  assert.match(html, />원래 내용</)
  assert.match(text(html), /수정 완료/)
  assert.match(text(html), /취소/)
  assert.match(text(html), /누구나 볼 수 있어요/)
  // 저장 전(입력 중) 취소 안내.
  assert.match(text(html), /저장하기 전에 취소하면 고친 내용은 저장되지 않아요/)
  // 결과 미확인 전에는 [최신 글 보기]가 없다.
  assert.doesNotMatch(html, /data-community-edit-latest/)
})

// ── 모의 저장소(D3 포함) ────────────────────────────────────────────────

test('모의 저장소: 내가 쓴 자유게시판 글만 mine·수정·삭제, 남의 글 forbidden, Q&A gone, 예시 글 forbidden, 비회원 rejected, 삭제 글은 사라진다', async () => {
  const me1 = mockSource.createCommunitySource({ id: 'm1', nickname: '나' })
  const other = mockSource.createCommunitySource({ id: 'm2', nickname: '남' })
  const guest = mockSource.createCommunitySource(null)
  const created = await me1.createPost(
    { board: 'free', title: '내 글', body: '내용' },
    signal,
  )
  assert.equal((await me1.getPost('free', created.id, signal)).post.mine, true)
  assert.equal(
    (await other.getPost('free', created.id, signal)).post.mine,
    false,
  )
  assert.equal(
    (await guest.getPost('free', created.id, signal)).post.mine,
    false,
  )

  const updated = await me1.updatePost(
    created.id,
    { title: '고침', body: '고친 내용' },
    signal,
  )
  assert.equal(updated.kind, 'updated')
  assert.equal(updated.detail.post.title, '고침')
  assert.equal(c.isPostDetail(updated.detail), true)
  assert.equal(
    (await other.updatePost(created.id, edit, signal)).kind,
    'forbidden',
  )
  assert.equal((await other.deletePost(created.id, signal)).kind, 'forbidden')
  assert.equal(
    (await guest.updatePost(created.id, edit, signal)).kind,
    'rejected',
  )

  const qa = await me1.createPost(
    { board: 'qa', category: 'meal', title: '질문', body: '내용' },
    signal,
  )
  assert.equal((await me1.updatePost(qa.id, edit, signal)).kind, 'gone')
  assert.equal((await me1.deletePost(qa.id, signal)).kind, 'gone')
  // 예시 글은 내 글이 아니다: 서버의 남의 공개 글처럼 forbidden이다.
  const example = (await me1.listPosts('free', signal)).find((p) => p.example)
  assert.equal((await me1.deletePost(example.id, signal)).kind, 'forbidden')

  assert.deepEqual(await me1.deletePost(created.id, signal), {
    kind: 'deleted',
  })
  assert.equal(await me1.getPost('free', created.id, signal), null)
  assert.ok(
    !(await me1.listPosts('free', signal)).some((p) => p.id === created.id),
  )
  assert.equal((await me1.deletePost(created.id, signal)).kind, 'gone')
})

// ── 화면 연결 정적 규칙 ─────────────────────────────────────────────────

test('상세 페이지: 사용자·게시판·글 키로 내부 화면을 그리고, 대상 키를 레이아웃 효과로 활성화하며, 모든 쓰기 결과는 settlePostWrite로만 반영한다', () => {
  const pageCode = strip(read('src/pages/CommunityPostPage.tsx'))
  assert.match(
    pageCode,
    /const targetKey = `\$\{viewer\}:\$\{board\}:\$\{postId\}`/,
  )
  assert.match(pageCode, /<PostScreen\s+key=\{targetKey\}/)
  assert.match(
    pageCode,
    /useLayoutEffect\(\(\) => \{\s*scope\.activate\(targetKey\)\s*return \(\) => scope\.deactivate\(targetKey\)/,
  )
  assert.match(pageCode, /settlePostWrite\(submitted,/)
  assert.match(
    pageCode,
    /usePost\(\s*source,\s*board,\s*postId,\s*viewer,?\s*\)/,
  )
  // 삭제 결과는 deleted/gone을 다른 표지로 목록에 넘긴다.
  assert.match(pageCode, /deleted: \(\) => goToList\('deleted'\)/)
  assert.match(pageCode, /gone: \(\) => goToList\('gone'\)/)
  const formCode = strip(read('src/components/community/CommunityEditForm.tsx'))
  assert.match(formCode, /settlePostWrite\(submitted,/)
  assert.doesNotMatch(formCode, /setTimeout|setInterval/)
  const hook = strip(read('src/community/useCommunity.ts'))
  assert.match(
    hook,
    /const base = `\$\{viewer\}:\$\{board\}:\$\{postId\}:\$\{attempt\}`/,
  )
  assert.match(hook, /generation\.current === started/)
  // 공통 라우터·인증·API 파일은 이 단위에서 바꾸지 않는다(별도 수정 경로 없음).
  assert.doesNotMatch(read('src/app/router.tsx'), /community[^'"`]*edit/)
})
