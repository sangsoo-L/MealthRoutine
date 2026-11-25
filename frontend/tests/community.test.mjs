// 커뮤니티(C01·C01-2 목록, C05·C04 상세, C02·C02-1 작성): 검증·조회 상태·목록/상세/작성 화면 상태·로그인·답변 자격 안내·라우트(공개/회원 전용)·
// 개발 전용 예시 저장소(탭 메모리, 저장소 미사용)·후속 화면(C01-1·C02-2·C03)과 수정·삭제·신고·삭제된 루틴 좋아요 API 미사용을 확인한다.
// 화면에는 시험용 값을 직접 넘겨 "서버가 준 값만 보인다"는 규칙을 확인한다(실제 서버 데이터가 아니다). 서버 연결 자체는 communityConnect.test.mjs.
// 예시 저장소는 모의 모드(개발 서버 + VITE_DEV_AUTH=true)에서만 쓰이므로 이 파일은 모의 모드 서버로 불러온다.
// 개인 .env.development.local의 값이 결과를 바꾸지 않도록 빈 envDir을 쓴다. 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

const envDir = mkdtempSync(join(tmpdir(), 'community-env-'))
let server, c, Board, PostView, Compose, devModule, sourceModule
before(async () => {
  process.env.VITE_DEV_AUTH = 'true'
  server = await createServer({
    envDir,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  delete process.env.VITE_DEV_AUTH
  const load = (path) => server.ssrLoadModule(path)
  c = await load('/src/community/community.ts')
  Board = (await load('/src/components/community/CommunityBoardView.tsx'))
    .default
  PostView = (await load('/src/components/community/CommunityPostView.tsx'))
    .default
  Compose = (await load('/src/components/community/CommunityComposeForm.tsx'))
    .default
  devModule = await load('/src/community/dev/devCommunity.ts')
  sourceModule = await load('/src/community/communitySource.ts')
})
after(async () => {
  await server?.close()
  rmSync(envDir, { recursive: true, force: true })
})

const signal = new AbortController().signal
const noop = () => {}
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const read = (path) => readFileSync(path, 'utf8')
const strip = (source) => source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

const summary = (over = {}) => ({
  id: 'p1',
  board: 'free',
  title: '첫 글 제목',
  excerpt: null,
  authorName: '작성자A',
  createdAt: '2026-11-20T09:00:00+09:00',
  commentCount: 2,
  answered: null,
  qaCategory: null,
  ...over,
})
const qaSummary = (over = {}) =>
  summary({
    id: 'q1',
    board: 'qa',
    title: '질문 제목',
    commentCount: null,
    answered: false,
    qaCategory: 'exercise',
    ...over,
  })
const detail = (post, comments = []) => ({
  post: {
    body: '본문 첫 줄\n둘째 줄',
    likeCount: 3,
    likedByMe: false,
    ...post,
  },
  comments,
})
const comment = (over = {}) => ({
  id: 'c1',
  authorName: '댓글러',
  authorTier: null,
  body: '댓글 본문',
  createdAt: '2026-11-21T10:00:00+09:00',
  ...over,
})
const actions = { like: async () => true, comment: async () => true }

// ── 경로·검증·표시 규칙 ───────────────────────────────────────────────────
test('경로: 사용자 승인 URL이고 상세 경로는 id를 인코딩한다', () => {
  assert.equal(c.PATH_COMMUNITY, '/community')
  assert.equal(c.PATH_COMMUNITY_NEW, '/community/posts/new')
  assert.equal(c.PATH_QA, '/community/qa')
  assert.equal(c.PATH_QA_NEW, '/community/qa/new')
  assert.equal(c.postPath('free', 'a b/1'), '/community/posts/a%20b%2F1')
  assert.equal(c.postPath('qa', '7'), '/community/qa/7')
})

test('작성 검증: 제목·내용은 공백만이면 막고 Q&A는 운동/식단 카테고리가 필수이며 기타 값은 차단한다', () => {
  assert.deepEqual(
    c.validateCompose('free', { category: null, title: ' ', body: '' }),
    { ok: false, errors: ['title', 'body'], tooLong: [] },
  )
  assert.deepEqual(
    c.validateCompose('free', {
      category: null,
      title: ' 제목 ',
      body: ' 내용 ',
    }),
    { ok: true, input: { board: 'free', title: '제목', body: '내용' } },
  )
  // 자유게시판은 카테고리를 보지 않는다(Q&A 입력으로 바뀌지 않는다).
  assert.equal(
    c.validateCompose('free', { category: 'meal', title: 'a', body: 'b' }).input
      .board,
    'free',
  )
  for (const category of [null, '', 'diet', 'both'])
    assert.deepEqual(
      c.validateCompose('qa', { category, title: 'a', body: 'b' }),
      { ok: false, errors: ['category'], tooLong: [] },
      String(category),
    )
  assert.deepEqual(
    c.validateCompose('qa', { category: 'meal', title: ' q ', body: ' b ' }),
    {
      ok: true,
      input: { board: 'qa', category: 'meal', title: 'q', body: 'b' },
    },
  )
  assert.equal(c.validateComment('  '), null)
  assert.equal(c.validateComment(' 안녕 '), '안녕')
})

test('작성일은 한국 시간으로 보이고 없거나 올바르지 않으면 "작성일 미기록"이다(날짜를 만들지 않는다)', () => {
  assert.match(
    c.formatPostDate('2026-11-20T23:30:00+00:00'),
    /2026\.\s?11\.\s?21/,
  )
  for (const bad of [null, 'nope', ''])
    assert.equal(c.formatPostDate(bad), '작성일 미기록')
})

// ── 조회 상태 ────────────────────────────────────────────────────────────
test('목록 조회: 연결이 없으면 unavailable, 서버가 답하면 ready(빈 배열도), 예외·다른 게시판 글·모르는 모양은 error다', async () => {
  const make = (value) => ({ listPosts: async () => value })
  assert.deepEqual(await c.runListPosts(null, 'free', signal), {
    status: 'unavailable',
  })
  assert.deepEqual(await c.runListPosts(make([]), 'free', signal), {
    status: 'ready',
    posts: [],
  })
  const posts = [summary()]
  assert.deepEqual(await c.runListPosts(make(posts), 'free', signal), {
    status: 'ready',
    posts,
  })
  const bad = {
    listPosts: async () => {
      throw new Error('x')
    },
  }
  for (const source of [
    bad,
    make([qaSummary()]),
    make([{ id: '', board: 'free' }]),
    make([summary({ commentCount: -1 })]),
    make([summary({ qaCategory: 'diet' })]),
    make(null),
  ])
    assert.deepEqual(await c.runListPosts(source, 'free', signal), {
      status: 'error',
    })
})

test('상세 조회: 빈 id·서버 null은 notfound, 연결 없음은 unavailable, 모양·게시판이 다르면 error다', async () => {
  const make = (value) => ({ getPost: async () => value })
  const ok = detail(summary())
  assert.deepEqual(await c.runGetPost(make(ok), 'free', 'p1', signal), {
    status: 'ready',
    detail: ok,
  })
  assert.deepEqual(await c.runGetPost(make(null), 'free', 'p1', signal), {
    status: 'notfound',
  })
  // 비어 있는 id는 서버에 묻지 않는다.
  let called = false
  const spy = {
    getPost: async () => {
      called = true
      return ok
    },
  }
  assert.deepEqual(await c.runGetPost(spy, 'free', '  ', signal), {
    status: 'notfound',
  })
  assert.equal(called, false)
  assert.deepEqual(await c.runGetPost(null, 'free', 'p1', signal), {
    status: 'unavailable',
  })
  for (const source of [
    make(detail(qaSummary())),
    make({ post: summary(), comments: [] }),
    make(detail(summary(), [{ id: 1 }])),
    {
      getPost: async () => {
        throw new Error('x')
      },
    },
  ])
    assert.deepEqual(await c.runGetPost(source, 'free', 'p1', signal), {
      status: 'error',
    })
})

// ── C01·C01-2 목록 ───────────────────────────────────────────────────────
const board = (boardName, state) =>
  render(createElement(Board, { board: boardName, state, onRetry: noop }))

test('C01 자유게시판 목록: 제목·댓글 수(n)·작성자·작성일, 행 전체가 C05 링크이고 글쓰기는 작성 화면으로 간다', () => {
  const html = board('free', {
    status: 'ready',
    posts: [
      summary({ excerpt: '요약 문장' }),
      summary({
        id: 'p2',
        title: '날짜 없음',
        createdAt: null,
        commentCount: 0,
      }),
    ],
  })
  assert.match(html, /<h1[^>]*>자유게시판<\/h1>/)
  assert.match(html, /전체 글 2개/)
  assert.match(html, /href="\/community\/posts\/p1"/)
  assert.match(html, /href="\/community\/posts\/p2"/)
  assert.match(html, /data-community-comments="2"/)
  assert.match(text(html), /\( 2\)|\(2\)/)
  assert.match(text(html), /요약 문장/)
  assert.match(text(html), /작성일 미기록/)
  assert.match(html, /href="\/community\/posts\/new"[^>]*>글쓰기/)
  // 게시판 전환 탭은 없고 작은 링크 하나로 Q&A로 간다.
  assert.match(html, /href="\/community\/qa"[^>]*>[\s\S]*초보자 Q&amp;A 보기/)
  assert.doesNotMatch(html, /role="tab"|data-community-status/)
})

test('C01-2 초보자 Q&A 목록: 댓글 수 대신 답변 대기·답변 완료 배지, 행은 C04 링크, 질문하기는 C02-1이다', () => {
  const html = board('qa', {
    status: 'ready',
    posts: [
      qaSummary(),
      qaSummary({ id: 'q2', answered: true, qaCategory: 'meal' }),
      qaSummary({ id: 'q3', answered: null, qaCategory: null }),
    ],
  })
  assert.match(html, /<h1[^>]*>초보자 Q&amp;A<\/h1>/)
  assert.match(html, /전체 질문 3개/)
  assert.match(html, /data-community-status="waiting"[^>]*>답변 대기/)
  assert.match(html, /data-community-status="answered"[^>]*>답변 완료/)
  assert.match(html, /data-community-status="unknown"[^>]*>상태 확인 전/)
  assert.match(html, /href="\/community\/qa\/q1"/)
  assert.match(html, /href="\/community\/qa\/new"[^>]*>질문하기/)
  assert.match(html, /href="\/community"[^>]*>[\s\S]*자유게시판 보기/)
  assert.doesNotMatch(html, /data-community-comments/)
})

test('목록 상태: 조회 중 · 서버 연결 전(글 없음이 아님) · 실패(다시 시도) · 서버가 비어 있다고 답함이 서로 다르고 글을 만들지 않는다', () => {
  const loading = board('free', { status: 'loading' })
  assert.match(loading, /data-community-state="loading"/)
  const off = board('free', { status: 'unavailable' })
  assert.match(off, /data-community-state="unavailable"/)
  assert.match(off, /글이 없다는 뜻은 아니에요/)
  const error = board('free', { status: 'error' })
  assert.match(error, /role="alert"/)
  assert.match(error, /data-community-retry/)
  const empty = board('free', { status: 'ready', posts: [] })
  assert.match(empty, /data-community-state="empty"/)
  assert.match(empty, /아직 올라온 글이 없어요/)
  for (const html of [loading, off, error, empty])
    assert.doesNotMatch(html, /data-community-list|data-community-post=/)
  // 비어 있는 Q&A는 질문 문구를 쓴다.
  assert.match(
    board('qa', { status: 'ready', posts: [] }),
    /아직 올라온 질문이 없어요/,
  )
  // 글쓰기 버튼은 어느 상태에서도 있다(비회원은 작성 화면에서 로그인 안내를 본다).
  for (const html of [loading, off, error, empty])
    assert.match(html, /data-community-write/)
})

// ── C05·C04 상세 ─────────────────────────────────────────────────────────
const post = (props = {}) =>
  render(
    createElement(PostView, {
      board: 'free',
      state: { status: 'loading' },
      onRetry: noop,
      isMember: false,
      eligibility: { kind: 'guest' },
      onEligibilityRetry: noop,
      actions,
      listPath: '/community',
      ...props,
    }),
  )

test('C05 자유게시판 상세(비회원): 제목·작성자·작성일·본문·댓글 목록이 보이고 댓글·응원은 로그인 안내가 있으며 입력이 없다', () => {
  const html = post({
    state: {
      status: 'ready',
      detail: detail(summary(), [
        comment(),
        comment({ id: 'c2', body: '두 번째' }),
      ]),
    },
  })
  assert.match(html, /<h1[^>]*>첫 글 제목<\/h1>/)
  assert.match(html, /작성자A/)
  assert.match(html, /2026\.\s?11\.\s?20/)
  assert.match(html, /data-community-body[^>]*>본문 첫 줄\n둘째 줄/)
  assert.match(html, /data-community-comment-count="2"/)
  assert.equal((html.match(/data-community-comment="/g) ?? []).length, 2)
  assert.match(html, /data-community-guide="guest"/)
  assert.match(html, /댓글과 응원은 로그인한 회원이 남길 수 있어요/)
  assert.match(html, /href="\/login"[^>]*>로그인하기/)
  assert.doesNotMatch(html, /<textarea|data-community-form/)
  // 응원 버튼은 보이되 회원이 아니면 비활성이다.
  assert.match(html, /data-community-like=""[^>]*aria-disabled="true"/)
  assert.match(html, /data-community-like-count="3"/)
  assert.match(html, /href="\/community"[^>]*>자유게시판 목록으로/)
})

test('C05 회원: 댓글 입력과 응원 버튼(aria-pressed)이 열리고 댓글이 없으면 빈 안내만 보인다', () => {
  const html = post({
    isMember: true,
    state: {
      status: 'ready',
      detail: detail(summary({ commentCount: 0 }), []),
    },
  })
  assert.match(html, /data-community-form="comment"/)
  assert.match(html, /<textarea/)
  assert.match(html, /댓글 등록/)
  assert.match(html, /data-community-empty[^>]*>아직 댓글이 없어요/)
  assert.match(html, /data-community-like=""[^>]*aria-pressed="false"/)
  assert.doesNotMatch(html, /data-community-guide="guest"/)
  const liked = post({
    isMember: true,
    state: {
      status: 'ready',
      detail: detail(summary({ likedByMe: undefined }), []),
    },
  })
  assert.match(liked, /aria-pressed="false"/)
  const likedTrue = post({
    isMember: true,
    state: {
      status: 'ready',
      detail: {
        post: { ...detail(summary()).post, likedByMe: true },
        comments: [],
      },
    },
  })
  assert.match(likedTrue, /aria-pressed="true"/)
  // 서버가 응원 수를 주지 않으면 숫자를 만들지 않는다.
  const noCount = post({
    isMember: true,
    state: {
      status: 'ready',
      detail: {
        post: { ...detail(summary()).post, likeCount: null },
        comments: [],
      },
    },
  })
  assert.doesNotMatch(noCount, /data-community-like-count/)
})

const qaDetail = (comments = [], over = {}) => detail(qaSummary(over), comments)

test('C04 Q&A 상세: 답변 대기·카테고리·질문 본문, 답변이 없으면 대기 안내, 있으면 답변자·등급·작성일·본문이 답변 카드로 보인다', () => {
  const waiting = post({
    board: 'qa',
    listPath: '/community/qa',
    state: { status: 'ready', detail: qaDetail() },
  })
  assert.match(waiting, /data-community-status="waiting"[^>]*>답변 대기/)
  assert.match(waiting, /data-community-category="exercise"[^>]*>운동/)
  assert.match(waiting, /아직 답변이 없어요/)
  assert.match(waiting, /href="\/community\/qa"[^>]*>질문 목록으로/)
  // 질문 글에는 응원 버튼이 없다(명세 C04에 없음).
  assert.doesNotMatch(waiting, /data-community-like/)
  assert.match(waiting, /의료적 진단이나 처방을 대신하지 않아요/)
  const answered = post({
    board: 'qa',
    state: {
      status: 'ready',
      detail: qaDetail(
        [
          comment({
            id: 'a1',
            authorName: '답변자',
            authorTier: 'advanced',
            body: '답변 본문',
          }),
          comment({ id: 'a2', authorTier: null }),
        ],
        { answered: true },
      ),
    },
  })
  assert.match(answered, /data-community-status="answered"[^>]*>답변 완료/)
  assert.match(
    text(answered),
    /답변자[\s\S]*고급 회원[\s\S]*2026\.\s?11\.\s?21/,
  )
  assert.match(answered, /답변 본문/)
  // 서버가 등급을 주지 않으면 등급을 만들지 않는다.
  assert.match(answered, /등급 확인 전/)
  assert.doesNotMatch(answered, /아직 답변이 없어요/)
})

test('C04 답변 입력은 질문 영역 이해도가 중급 이상일 때만 열리고 나머지는 이유를 안내한다(임의로 허용하지 않는다)', () => {
  const view = (eligibility) =>
    post({
      board: 'qa',
      isMember: eligibility.kind !== 'guest',
      eligibility,
      state: { status: 'ready', detail: qaDetail() },
    })
  const allowed = view({ kind: 'allowed' })
  assert.match(allowed, /data-community-form="answer"/)
  assert.match(allowed, /답변 등록/)
  for (const [kind, marker, message] of [
    ['guest', 'guest', /로그인한 중급·고급 회원이 남길 수 있어요/],
    ['loading', 'loading', /답변 자격을 확인하고 있어요/],
    ['error', 'error', /답변 자격을 확인하지 못했어요/],
    ['beginner', 'beginner', /이해도가 중급 이상인 회원이 남길 수 있어요/],
    ['unknown', 'unknown', /이해도를 확인할 수 없어/],
  ]) {
    const html = view({ kind })
    assert.match(html, new RegExp(`data-community-guide="${marker}"`), kind)
    assert.match(text(html), message, kind)
    assert.doesNotMatch(html, /<textarea|data-community-form/, kind)
  }
  assert.match(view({ kind: 'error' }), /다시 시도/)
  assert.match(view({ kind: 'guest' }), /href="\/login"/)
})

test('상세 상태: 조회 중·서버 연결 전·실패(다시 시도)·없는 글/삭제된 글은 서로 다르고 모두 목록 링크가 있으며 글을 만들지 않는다', () => {
  const states = {
    loading: /data-community-state="loading"/,
    unavailable:
      /data-community-state="unavailable"[\s\S]*글이 없다는 뜻은 아니에요/,
    error: /role="alert"[\s\S]*data-community-retry/,
    notfound: /data-community-state="notfound"[\s\S]*찾을 수 없는 글이에요/,
  }
  for (const [status, pattern] of Object.entries(states)) {
    const html = post({ state: { status } })
    assert.match(html, pattern, status)
    assert.match(html, /<h1[^>]*>게시글<\/h1>/, status)
    assert.match(html, /href="\/community"[^>]*>자유게시판 목록으로/, status)
    assert.doesNotMatch(
      html,
      /data-community-detail|data-community-body/,
      status,
    )
  }
  const qa = post({
    board: 'qa',
    listPath: '/community/qa',
    state: { status: 'notfound' },
  })
  assert.match(qa, /<h1[^>]*>질문<\/h1>/)
  assert.match(qa, /href="\/community\/qa"[^>]*>질문 목록으로/)
})

test('상세 화면에는 수정·삭제·신고 버튼이 없다(명세에 화면이 없다)', () => {
  const html = post({
    isMember: true,
    state: { status: 'ready', detail: detail(summary(), [comment()]) },
  })
  assert.doesNotMatch(html, />(수정|삭제|신고)</)
})

// ── C02·C02-1 작성 ───────────────────────────────────────────────────────
const compose = (props = {}) =>
  render(
    createElement(Compose, {
      board: 'free',
      submit: null,
      cancelTo: '/community',
      onCreated: noop,
      ...props,
    }),
  )

test('C02 글 작성: 제목·내용(필수)·개인정보 경고, 서버 연결 전에는 등록 버튼이 비활성이고 등록·저장되지 않는다고 알린다', () => {
  const html = compose()
  assert.match(html, /data-community-compose="free"/)
  assert.match(html, /name="postTitle"/)
  assert.match(html, /name="postBody"/)
  assert.doesNotMatch(html, /qaCategory/)
  assert.match(html, /개인정보는 적지 마세요/)
  assert.match(html, /data-community-unavailable/)
  assert.match(html, /등록되지도 저장되지도 않아요/)
  const submit = html.match(/<button[^>]*data-community-submit[^>]*>/)[0]
  assert.match(submit, /disabled=""/)
  assert.match(html, /href="\/community"[^>]*>취소/)
  // 연결이 있으면 버튼이 열리고 연결 전 안내가 없다.
  const on = compose({ submit: async () => ({ id: 'x' }) })
  assert.doesNotMatch(on, /data-community-unavailable/)
  assert.doesNotMatch(
    on.match(/<button[^>]*data-community-submit[^>]*>/)[0],
    /disabled=""/,
  )
})

test('C02-1 질문 작성: 운동/식단 카테고리(필수·단일 선택)·질문 제목·내용·질문 예시·의료 안내, 취소는 Q&A 목록이다', () => {
  const html = compose({ board: 'qa', cancelTo: '/community/qa' })
  assert.match(html, /data-community-compose="qa"/)
  assert.equal((html.match(/name="qaCategory"/g) ?? []).length, 2)
  assert.match(html, /type="radio"[^>]*value="exercise"/)
  assert.match(html, /type="radio"[^>]*value="meal"/)
  assert.match(text(html), /메인 카테고리\s*필수/)
  assert.match(html, /placeholder="예\) 처음 운동을 시작하는데/)
  assert.match(html, /의료적 진단이나 처방을 대신하지 않아요/)
  assert.match(html, /질문 등록/)
  assert.match(html, /href="\/community\/qa"[^>]*>취소/)
  // 아무것도 고르지 않은 채로 시작한다.
  assert.doesNotMatch(html, / checked=""/)
})

// ── 개발 전용 예시 저장소 ─────────────────────────────────────────────────
test('개발 전용 예시 저장소: 탭 메모리 안에서만 글·댓글·응원이 동작하고 예시 글에는 표지가 있다', async () => {
  const actor = { id: 'u1', nickname: '시험회원' }
  const source = sourceModule.createCommunitySource(actor)
  assert.ok(source, '개발 서버에서는 예시 연결이 있다')
  assert.equal(sourceModule.createCommunitySource(null) !== null, true)
  const free = await source.listPosts('free', signal)
  assert.ok(free.length >= 3)
  assert.ok(free.every((p) => p.board === 'free' && p.example === true))
  const qa = await source.listPosts('qa', signal)
  assert.ok(qa.some((p) => p.answered === false))
  assert.ok(qa.some((p) => p.answered === true))
  // 모든 예시 응답이 화면 계약의 모양이다.
  for (const p of [...free, ...qa]) assert.equal(c.isPostSummary(p), true, p.id)
  // 작성일 없는 글은 맨 아래다.
  assert.equal(free.at(-1).createdAt, null)

  assert.deepEqual(source.supports, {
    boards: ['free', 'qa'],
    comments: true,
    likes: true,
  })
  const created = await source.createPost(
    { board: 'free', title: '새 글', body: '내용' },
    signal,
  )
  assert.equal(created.kind, 'created')
  const got = await source.getPost('free', created.id, signal)
  assert.equal(got.post.authorName, '시험회원')
  assert.equal(c.isPostDetail(got), true)
  // 다른 게시판 주소로는 보이지 않는다.
  assert.equal(await source.getPost('qa', created.id, signal), null)
  assert.equal(await source.getPost('free', 'nope', signal), null)

  await source.addComment(created.id, '첫 댓글', signal)
  assert.equal(
    (await source.getPost('free', created.id, signal)).comments.length,
    1,
  )
  assert.equal(
    (await source.listPosts('free', signal)).find((p) => p.id === created.id)
      .commentCount,
    1,
  )
  const liked = await source.setLike(created.id, true, signal)
  assert.deepEqual(liked, { liked: true, likeCount: 1 })
  // 같은 사용자의 응원은 한 번만 센다.
  assert.deepEqual(await source.setLike(created.id, true, signal), {
    liked: true,
    likeCount: 1,
  })
  assert.deepEqual(await source.setLike(created.id, false, signal), {
    liked: false,
    likeCount: 0,
  })

  // Q&A: 질문 등록 → 답변 대기, 답변을 달면 답변 완료. 답변자 등급은 개발용 저장소가 판정하지 않는다.
  const q = await source.createPost(
    { board: 'qa', category: 'meal', title: '질문', body: '내용' },
    signal,
  )
  assert.equal(q.kind, 'created')
  assert.equal(
    (await source.listPosts('qa', signal)).find((p) => p.id === q.id).answered,
    false,
  )
  const answer = await source.addComment(q.id, '답변', signal)
  assert.equal(answer.authorTier, null)
  assert.equal(
    (await source.listPosts('qa', signal)).find((p) => p.id === q.id).answered,
    true,
  )

  // 비회원 쓰기는 실패한다(서버의 401과 같은 역할). 등록은 저장되지 않음이 확실한 rejected다.
  const guest = sourceModule.createCommunitySource(null)
  assert.deepEqual(
    await guest.createPost({ board: 'free', title: 'a', body: 'b' }, signal),
    { kind: 'rejected' },
  )
  await assert.rejects(guest.addComment(created.id, 'x', signal))
  await assert.rejects(guest.setLike(created.id, true, signal))
})

// ── 라우트·범위·정적 규칙 ──────────────────────────────────────────────────
test('라우트: 목록·상세는 공개(AuthGate 밖), 작성은 회원 전용(AuthGate 안)이고 상위 화면·h1·하단 탭이 맞다', () => {
  const router = read('src/app/router.tsx')
  const block = (path) => {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > 0, path)
    return router.slice(at, router.indexOf('} satisfies RouteHandle', at))
  }
  const expected = [
    ['community', 'C01', '/home'],
    ['community/qa', 'C01-2', '/home'],
    ['community/posts/:postId', 'C05', '/community'],
    ['community/qa/:postId', 'C04', '/community/qa'],
    ['community/posts/new', 'C02', '/community'],
    ['community/qa/new', 'C02-1', '/community/qa'],
  ]
  for (const [path, id, parent] of expected) {
    const b = block(path)
    assert.match(b, new RegExp(`screenId: '${id}'`), path)
    assert.match(b, /ownH1: true/, path)
    assert.match(b, /tab: 'home'/, path)
    assert.match(b, new RegExp(`parent: '${parent}'`), path)
  }
  // AuthGate 위치: 작성 두 화면은 마지막 AuthGate 그룹 안, 읽기 네 화면은 그 그룹 밖(공개)이다.
  const gate = router.lastIndexOf('element: <AuthGate />')
  const guardEnd = router.indexOf("path: 'support',")
  for (const path of ['community/posts/new', 'community/qa/new']) {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > gate && at < guardEnd, `${path}는 회원 전용 그룹 안`)
  }
  for (const path of [
    'community',
    'community/qa',
    'community/posts/:postId',
    'community/qa/:postId',
  ]) {
    const at = router.indexOf(`path: '${path}',`)
    assert.ok(at > guardEnd, `${path}는 공개`)
  }
})

test('후속 화면(C01-1·C02-2·C03)과 수정·삭제 화면은 만들지 않았고 삭제된 루틴 좋아요 API를 쓰지 않는다', () => {
  const router = read('src/app/router.tsx')
  for (const id of ['C01-1', 'C02-2', 'C03'])
    assert.doesNotMatch(router, new RegExp(`screenId: '${id}'`), id)
  assert.doesNotMatch(router, /path: 'community[^']*\/edit'/)
  const files = [
    'src/community/community.ts',
    'src/community/communitySource.ts',
    'src/community/serverCommunitySource.ts',
    'src/community/useCommunity.ts',
    'src/community/dev/devCommunity.ts',
    'src/components/community/CommunityBoardView.tsx',
    'src/components/community/CommunityPostView.tsx',
    'src/components/community/CommunityComposeForm.tsx',
    'src/pages/CommunityBoardPage.tsx',
    'src/pages/CommunityPostPage.tsx',
    'src/pages/CommunityWritePage.tsx',
  ]
  for (const file of files) {
    const code = strip(read(file))
    assert.doesNotMatch(code, /workout-routines\/[^'"`]*likes/, file)
    assert.doesNotMatch(
      code,
      /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|setItem|console\./,
      file,
    )
  }
})

test('홈 "커뮤니티" 바로가기는 C01(/community)로 연결되고, 개발용 저장소는 모의 모드(DEV && VITE_DEV_AUTH) 분기의 동적 import로만 불러온다', () => {
  const home = read('src/components/home/homeContent.ts')
  assert.match(home, /label: '커뮤니티'[^}]*to: '\/community'/)
  const source = strip(read('src/community/communitySource.ts'))
  assert.match(
    source,
    /const MOCK_AUTH =\s*import\.meta\.env\.DEV && import\.meta\.env\.VITE_DEV_AUTH === 'true'/,
  )
  assert.match(
    source,
    /MOCK_AUTH\s*\?\s*await import\('\.\/dev\/devCommunity\.ts'\)/,
  )
  // 운영 화면 코드는 개발용 저장소를 직접 import하지 않는다.
  for (const file of [
    'src/community/useCommunity.ts',
    'src/components/community/CommunityBoardView.tsx',
    'src/components/community/CommunityPostView.tsx',
    'src/pages/CommunityBoardPage.tsx',
  ])
    assert.doesNotMatch(read(file), /dev\/devCommunity/, file)
})
