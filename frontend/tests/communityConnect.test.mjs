// C1 커뮤니티 자유게시판 서버 연결(계획 v2 6장·8.2): 실제/모의 모드 선택 · 목록·상세 요청과 변환(토큰 없이, +09:00, null 필드) ·
// 없는 글·잘못된 id · 등록 결과 3분류(C1-R2: created/rejected/uncertain, 자동 재전송 없음) ·
// 로그인 작업에 묶인 등록(C1-R1: 계정 교체·같은 ID 재로그인 뒤 늦은 성공·실패는 버림, 닉네임 변경은 유지) ·
// 서버와 같은 입력 규칙(코드포인트 글자 수, NBSP·전각 공백) · 미지원 댓글·응원 표시 · 작성 화면의 계정별 key.
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
  within,
} from './apiTestKit.mjs'

const envDir = mkdtempSync(join(tmpdir(), 'community-connect-env-'))
const storage = createStorage()
let realServer, mockServer
let server, source, mockSource, c, session, backendModule, ctx, PostView

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
  source = await load('/src/community/communitySource.ts')
  c = await load('/src/community/community.ts')
  session = await load('/src/api/session.ts')
  backendModule = await load('/src/auth/serverBackend.ts')
  ctx = await load('/src/auth/authContext.ts')
  PostView = (await load('/src/components/community/CommunityPostView.tsx'))
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
const LIST = 'GET /community/posts?postType=general&page=0&size=50'
const CREATE = 'POST /community/posts'
const read = (path) => readFileSync(path, 'utf8')
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const user = (id, nickname = `nick${id}`) => ({
  id,
  email: `u${id}@example.test`,
  nickname,
  entitlement: 'free',
})
const page = (content) =>
  ok({
    content,
    page: 0,
    size: 50,
    totalElements: content.length,
    totalPages: 1,
  })
const row = (over = {}) => ({
  postId: 7,
  postType: 'general',
  title: '첫 글',
  authorName: '작성자',
  createdAt: '2026-11-25T09:30:00',
  ...over,
})
const newPost = { board: 'free', title: '제목', body: '내용' }

/** 가짜 fetch 세션(로그인 안 함). 비회원 요청·보내기 전 거절 확인용. */
function guestEnv() {
  const fake = createFakeServer()
  const s = session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  return {
    fake,
    source: server.createServerCommunitySource(s.request.bind(s)),
  }
}

/** 가짜 fetch 세션으로 로그인한 뒤 서버 연결을 만든다. */
async function login(userId = 7) {
  const env = guestEnv()
  const fake = env.fake
  const s = session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  const backend = backendModule.createServerBackend(s)
  fake.on('POST /auth/login', loginOk(userId, 'access-A1'))
  fake.on('GET /users/me', me(userId))
  const result = await backend.login(`u${userId}@example.test`, 'x')
  assert.equal(result.ok, true)
  return {
    fake,
    user: result.user,
    source: server.createServerCommunitySource(s.request.bind(s)),
  }
}

const callsOf = (fake, key) => fake.calls.filter((call) => call.key === key)

// ── 모드 ─────────────────────────────────────────────────────────────────

test('실제 모드(개발 기본)는 서버 연결이고 자유게시판만 지원한다. 모의 모드는 예시 저장소로 모두 지원한다', () => {
  const real = source.createCommunitySource(null)
  assert.ok(real)
  assert.deepEqual(real.supports, {
    boards: ['free'],
    comments: false,
    likes: false,
  })
  const mock = mockSource.createCommunitySource({ id: 'u1', nickname: 'n' })
  assert.deepEqual(mock.supports, {
    boards: ['free', 'qa'],
    comments: true,
    likes: true,
  })
  // 지원하지 않는 게시판은 연결이 없는 것처럼(null → "서버 연결 전") 보인다.
  const hook = read('src/community/useCommunity.ts')
  assert.match(hook, /source\.supports\.boards\.includes\(board\)/)
})

// ── 목록 ─────────────────────────────────────────────────────────────────

test('목록: 토큰 없이 general 첫 50개를 요청하고 화면 값으로 바꾼다(id 문자열·+09:00·없는 값 null)', async () => {
  const env = await login()
  env.fake.on(LIST, page([row(), row({ postId: 3, createdAt: 'bad' })]))
  const posts = await env.source.listPosts('free', signal)
  const call = callsOf(env.fake, LIST)[0]
  assert.equal(
    call.headers.Authorization,
    undefined,
    '조회는 토큰을 붙이지 않는다',
  )
  assert.deepEqual(posts[0], {
    id: '7',
    board: 'free',
    title: '첫 글',
    excerpt: null,
    authorName: '작성자',
    createdAt: '2026-11-25T09:30:00+09:00',
    commentCount: null,
    answered: null,
    qaCategory: null,
  })
  assert.equal(posts[1].createdAt, null, '모양이 다른 시각은 "작성일 미기록"')
  assert.equal(
    c.formatPostDate(posts[0].createdAt),
    c.formatPostDate('2026-11-25T00:30:00Z'),
    '브라우저 시간대와 상관없이 서울 시각',
  )
  // 화면의 조회 상태로도 ready다(빈 목록 포함).
  env.fake.on(LIST, page([]))
  assert.deepEqual(await c.runListPosts(env.source, 'free', signal), {
    status: 'ready',
    posts: [],
  })
})

test('목록: 형식이 다르거나 서버·네트워크 실패면 조회 실패(error)이고 글을 만들지 않는다', async () => {
  const { fake, source: s } = guestEnv()
  for (const response of [
    ok({ items: [] }),
    page([row({ postId: '7' })]),
    page([row({ postType: 'question' })]),
    page([row({ title: null })]),
    page([row({ postId: 0 })]),
    fail(500, 'INTERNAL_ERROR'),
    networkError(),
  ]) {
    fake.on(LIST, response)
    assert.deepEqual(await c.runListPosts(s, 'free', signal), {
      status: 'error',
    })
  }
  // Q&A는 이 연결로 묻지 않는다(화면에서는 연결 null → 연결 전 안내).
  await assert.rejects(s.listPosts('qa', signal))
  assert.equal(fake.calls.length, 7)
})

// ── 상세 ─────────────────────────────────────────────────────────────────

test('상세: 잘못된 id는 서버에 묻지 않고 없는 글, 404 POST_NOT_FOUND·다른 게시판 글도 없는 글이다', async () => {
  const { fake, source: s } = guestEnv()
  for (const id of ['abc', '0', '-1', '01', '1.5', '99999999999999999', ' 7'])
    assert.equal(await s.getPost('free', id, signal), null, id)
  assert.equal(await s.getPost('qa', '7', signal), null)
  assert.equal(fake.calls.length, 0)

  fake.on('GET /community/posts/7', fail(404, 'POST_NOT_FOUND'))
  assert.deepEqual(await c.runGetPost(s, 'free', '7', signal), {
    status: 'notfound',
  })
  fake.on(
    'GET /community/posts/7',
    ok({ ...row(), postType: 'question', content: '질문' }),
  )
  assert.equal(await s.getPost('free', '7', signal), null)
})

test('상세: 화면 값으로 바꾸고(본문·댓글 없음·응원 null), 형식 오류·다른 id·그 밖의 404는 조회 실패다', async () => {
  const { fake, source: s } = guestEnv()
  fake.on('GET /community/posts/7', ok({ ...row(), content: '본문\n둘째 줄' }))
  const state = await c.runGetPost(s, 'free', '7', signal)
  assert.equal(state.status, 'ready')
  assert.deepEqual(state.detail, {
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
      body: '본문\n둘째 줄',
      likeCount: null,
      likedByMe: null,
    },
    comments: [],
  })
  assert.equal(fake.calls[0].headers.Authorization, undefined)
  for (const response of [
    ok({ ...row() }),
    ok({ ...row({ postId: 8 }), content: 'x' }),
    fail(404, 'NOT_FOUND'),
    fail(500, 'INTERNAL_ERROR'),
    networkError(),
  ]) {
    fake.on('GET /community/posts/7', response)
    assert.deepEqual(await c.runGetPost(s, 'free', '7', signal), {
      status: 'error',
    })
  }
})

// ── 등록 결과 3분류(C1-R2) ────────────────────────────────────────────────

test('등록: 로그인 토큰으로 general·title·content만 보내고 201+postId면 created다', async () => {
  const env = await login()
  env.fake.on(CREATE, ok({ postId: 42 }, 201))
  assert.deepEqual(await env.source.createPost(newPost, signal), {
    kind: 'created',
    id: '42',
  })
  const call = callsOf(env.fake, CREATE)[0]
  assert.equal(call.headers.Authorization, 'Bearer access-A1')
  assert.deepEqual(call.body, {
    postType: 'general',
    title: '제목',
    content: '내용',
  })
})

test('등록: 저장되지 않음이 확실하면 rejected(서버 4xx, 보내기 전 로그인 없음, Q&A)', async () => {
  const env = await login()
  for (const response of [
    fail(400, 'INVALID_REQUEST'),
    fail(403, 'ACCOUNT_SUSPENDED'),
  ]) {
    env.fake.on(CREATE, response)
    assert.deepEqual(await env.source.createPost(newPost, signal), {
      kind: 'rejected',
    })
  }
  const guest = guestEnv()
  assert.deepEqual(await guest.source.createPost(newPost, signal), {
    kind: 'rejected',
  })
  assert.deepEqual(
    await guest.source.createPost(
      { board: 'qa', category: 'meal', title: 'q', body: 'b' },
      signal,
    ),
    { kind: 'rejected' },
  )
  assert.equal(guest.fake.calls.length, 0, '보내지 않았다')
})

test('등록: 서버가 저장했을 수 있으면 uncertain이고 자동으로 다시 보내지 않는다', async () => {
  const env = await login()
  const cases = [
    networkError(), // 서버는 저장했는데 응답만 끊긴 경우
    fail(500, 'INTERNAL_ERROR'),
    fail(502, 'BAD_GATEWAY'),
    ok({ postId: 42 }, 200), // 201이 아닌 성공
    ok({}, 201),
    ok({ postId: '42' }, 201),
    ok({ postId: 0 }, 201),
    new Response('<html>proxy</html>', { status: 201 }),
  ]
  for (const response of cases) {
    env.fake.on(CREATE, response)
    assert.deepEqual(await env.source.createPost(newPost, signal), {
      kind: 'uncertain',
    })
  }
  assert.equal(callsOf(env.fake, CREATE).length, cases.length, '한 번씩만')
  assert.equal(env.fake.pending(CREATE), 0)
})

// ── 로그인 작업에 묶인 등록(C1-R1·C1-C1) ───────────────────────────────────

/** 폼이 결과를 반영하는 마지막 단계(settleSubmittedPost)에서 무엇을 했는지 기록한다. */
function settle(submitted) {
  const seen = []
  c.settleSubmittedPost(submitted, {
    created: (id) => seen.push(`created:${id}`),
    rejected: () => seen.push('rejected'),
    uncertain: () => seen.push('uncertain'),
  })
  return seen
}

test('submitPost: 로그인 작업이 없거나 보내기 직전에 이미 바뀌었으면 보내지 않고 rejected다', async () => {
  const env = await login()
  const guest = ctx.createLoginWork(null)
  const none = await c.submitPost(env.source, newPost, signal, () =>
    guest.beginAccountWork(),
  )
  assert.deepEqual(settle(none), ['rejected'])
  const stale = await c.submitPost(env.source, newPost, signal, () => ({
    isCurrent: () => false,
  }))
  assert.deepEqual(settle(stale), ['rejected'])
  assert.equal(callsOf(env.fake, CREATE).length, 0)
})

test('submitPost: 로그인 작업이 그대로면 결과대로 반영한다(created 이동·rejected 실패·uncertain 확인)', async () => {
  const env = await login()
  const work = ctx.createLoginWork(user('7'))
  const begin = () => work.beginAccountWork()
  env.fake.on(CREATE, ok({ postId: 9 }, 201))
  assert.deepEqual(
    settle(await c.submitPost(env.source, newPost, signal, begin)),
    ['created:9'],
  )
  env.fake.on(CREATE, fail(400, 'INVALID_REQUEST'))
  assert.deepEqual(
    settle(await c.submitPost(env.source, newPost, signal, begin)),
    ['rejected'],
  )
  env.fake.on(CREATE, networkError())
  assert.deepEqual(
    settle(await c.submitPost(env.source, newPost, signal, begin)),
    ['uncertain'],
  )
})

test('submitPost: 응답 전에 다른 계정으로 바뀌면 늦은 성공·실패를 버린다(이동·실패 안내 없음)', async () => {
  for (const late of [ok({ postId: 9 }, 201), fail(400, 'INVALID_REQUEST')]) {
    const env = await login()
    const work = ctx.createLoginWork(user('7'))
    const held = deferred()
    env.fake.on(CREATE, held)
    const pending = c.submitPost(env.source, newPost, signal, () =>
      work.beginAccountWork(),
    )
    await flush()
    work.replaceUser(user('8'))
    held.resolve(late)
    assert.deepEqual(settle(await within(pending)), ['uncertain'])
  }
})

test('C1-C1: 헬퍼가 결과를 돌려준 뒤 폼이 반영하기 전에 새 로그인이 시작되면 이동·실패 안내를 하지 않는다', async () => {
  for (const response of [
    ok({ postId: 7 }, 201),
    fail(400, 'INVALID_REQUEST'),
  ]) {
    const env = await login()
    const work = ctx.createLoginWork(user('7'))
    env.fake.on(CREATE, response)
    const submitted = await c.submitPost(env.source, newPost, signal, () =>
      work.beginAccountWork(),
    )
    // 응답 처리는 끝났고 아직 같은 로그인 작업이다.
    assert.equal(submitted.isCurrent(), true)
    // 폼이 반영하기 직전에 새 로그인이 시작된다(user.id는 아직 7 그대로).
    work.startLogin()
    assert.equal(work.user.id, '7')
    assert.deepEqual(settle(submitted), ['uncertain'])
  }
})

test('submitPost: 같은 ID로 다시 로그인해도 이전 로그인의 결과는 버리고, 닉네임만 바뀌면 그대로 반영한다', async () => {
  const env = await login()
  const work = ctx.createLoginWork(user('7'))
  const held = deferred()
  env.fake.on(CREATE, held)
  const pending = c.submitPost(env.source, newPost, signal, () =>
    work.beginAccountWork(),
  )
  await flush()
  work.replaceUser(null)
  work.startLogin()
  work.replaceUser(user('7'))
  held.resolve(ok({ postId: 9 }, 201))
  assert.deepEqual(settle(await within(pending)), ['uncertain'])

  const held2 = deferred()
  env.fake.on(CREATE, held2)
  const pending2 = c.submitPost(env.source, newPost, signal, () =>
    work.beginAccountWork(),
  )
  await flush()
  const nick = work.beginNicknameSave()
  assert.ok(nick.commit('새닉네임'))
  held2.resolve(ok({ postId: 10 }, 201))
  assert.deepEqual(settle(await within(pending2)), ['created:10'])
})

test('submitPost: 연결이 예상하지 못한 예외를 던지면 저장 여부를 모르므로 uncertain이다', async () => {
  const work = ctx.createLoginWork(user('7'))
  const throwing = {
    supports: { boards: ['free'], comments: false, likes: false },
    createPost: async () => {
      throw new Error('boom')
    },
  }
  const submitted = await c.submitPost(throwing, newPost, signal, () =>
    work.beginAccountWork(),
  )
  assert.deepEqual(settle(submitted), ['uncertain'])
})

test('작성 화면: 폼은 계정 id(닉네임 아님)를 key로 그리고, 폼은 취소 확인 뒤 settleSubmittedPost로만 결과를 반영한다', () => {
  const page = read('src/pages/CommunityWritePage.tsx')
  assert.match(page, /key=\{user\?\.id \?\? ''\}/)
  assert.doesNotMatch(page, /key=\{[^}]*nickname/)
  assert.match(page, /submitPost\(source, input, signal, beginAccountWork\)/)
  const form = read('src/components/community/CommunityComposeForm.tsx')
  // 취소(화면 이탈·계정 변경으로 폼이 새로 그려짐) 확인 → 바로 settleSubmittedPost(그 안에서 로그인 작업 재확인).
  assert.match(
    form,
    /if \(controller\.signal\.aborted\) return\s+busyRef\.current = false\s+abortRef\.current = null\s+(\/\/[^\n]*\s+)*settleSubmittedPost\(submitted, \{\s+created: onCreated,/,
  )
  // 폼이 onCreated·실패 안내를 직접 부르는 다른 경로가 없다.
  assert.equal(form.match(/onCreated\(/g), null)
  assert.equal(form.match(/setPhase\('failed'\)/g).length, 1)
  assert.match(form, /data-community-state="uncertain"/)
})

// ── 입력 규칙(서버와 같음) ─────────────────────────────────────────────────

test('작성 검증: 글자 수는 코드포인트로 세고(이모지 1자) 제목 250·내용 5,000자를 넘으면 막는다', () => {
  const v = (title, body = '내용') =>
    c.validateCompose('free', { category: null, title, body })
  assert.equal(v('😀'.repeat(250)).ok, true)
  assert.deepEqual(v('😀'.repeat(251)), {
    ok: false,
    errors: ['title'],
    tooLong: ['title'],
  })
  assert.equal(v('가'.repeat(250)).ok, true)
  assert.equal(v('제목', 'a'.repeat(5000)).ok, true)
  assert.deepEqual(v('제목', 'a'.repeat(5001)), {
    ok: false,
    errors: ['body'],
    tooLong: ['body'],
  })
  // 앞뒤 공백(NBSP·전각 공백·BOM 포함)은 세지 않고 지운 값을 보낸다.
  const trimmed = v(' ' + '가'.repeat(250) + '　')
  assert.equal(trimmed.ok, true)
  assert.equal(trimmed.input.title, '가'.repeat(250))
  for (const blank of ['  ', '　', '﻿', ' \n\t '])
    assert.deepEqual(v(blank), { ok: false, errors: ['title'], tooLong: [] })
  assert.equal(
    c.COMPOSE_TOO_LONG_MESSAGE.body,
    '내용은 5,000자까지 쓸 수 있어요.',
  )
})

// ── 미지원 댓글·응원 ─────────────────────────────────────────────────────

test('상세 화면: 연결이 댓글·응원을 지원하지 않으면 응원 버튼·댓글 수·입력 대신 "준비 중"을 보인다', () => {
  const detail = {
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
      body: '본문',
      likeCount: null,
      likedByMe: null,
    },
    comments: [],
  }
  const props = {
    board: 'free',
    state: { status: 'ready', detail },
    onRetry: () => {},
    isMember: true,
    eligibility: { kind: 'unknown' },
    onEligibilityRetry: () => {},
    actions: { like: async () => true, comment: async () => true },
    listPath: '/community',
  }
  const off = render(
    createElement(PostView, {
      ...props,
      supports: { comments: false, likes: false },
    }),
  )
  assert.doesNotMatch(off, /data-community-like=/)
  assert.doesNotMatch(off, /data-community-comment-count/)
  assert.doesNotMatch(off, /<textarea/)
  assert.match(off, /data-community-unsupported="comments"/)
  assert.match(text(off), /댓글과 응원은 준비 중이에요/)
  assert.match(text(off), /본문/)
  // 지원 정보가 없으면(예시 저장소) 기존처럼 연다.
  const on = render(createElement(PostView, props))
  assert.match(on, /data-community-like=/)
  assert.match(on, /<textarea/)
  assert.doesNotMatch(on, /data-community-unsupported/)
})
