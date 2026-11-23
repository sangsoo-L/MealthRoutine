// 댓글·답변 입력 보존: 응답을 기다리는 동안 새로 쓴 내용을 늦은 성공 응답이 지우지 않는다(입력 변경 버전 비교).
// 컴포넌트를 직접 조작할 DOM 도구가 없어 규칙(src/community/commentDraft.ts)을 지연 Promise로 재현하고, 두 입력(댓글·답변)이 같은 규칙을 쓰는지는 소스와 렌더링으로 확인한다.
// 실제 textarea 입력과 지연 응답은 Chrome 회귀(tests/chrome/specs/community-draft.mjs)가 확인한다.
// 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, createDraftSubmitTracker, PostView
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  ;({ createDraftSubmitTracker } = await server.ssrLoadModule(
    '/src/community/commentDraft.ts',
  ))
  PostView = (
    await server.ssrLoadModule(
      '/src/components/community/CommunityPostView.tsx',
    )
  ).default
})
after(async () => {
  await server?.close()
})

/** 제어할 수 있는 지연 응답. */
function deferred() {
  let resolve
  const promise = new Promise((r) => (resolve = r))
  return { promise, resolve }
}

/**
 * CommentForm.handleSubmit과 같은 순서로 규칙을 쓰는 시험용 입력창.
 * type()은 textarea 입력(입력 변경 버전 증가), submit()은 전송이다.
 */
function makeForm(onSubmit) {
  const tracker = createDraftSubmitTracker()
  const form = {
    value: '',
    sent: [],
    outcome: null,
    type(next) {
      form.value = next
      tracker.edit()
    },
    async submit() {
      const body = form.value.trim()
      if (tracker.busy) return 'ignored'
      if (body === '') return 'invalid'
      const token = tracker.begin()
      if (token === null) return 'ignored'
      form.sent.push(body)
      const ok = await onSubmit(body)
      form.outcome = tracker.finish(token, ok)
      if (form.outcome === 'cleared') form.value = ''
      return form.outcome
    },
  }
  return form
}

for (const kind of ['comment', 'answer']) {
  const label = kind === 'comment' ? '자유게시판 댓글' : 'Q&A 답변'

  test(`${label}: A 전송 후 수정 없이 성공하면 입력이 비워진다`, async () => {
    const gate = deferred()
    const form = makeForm(() => gate.promise)
    form.type('A')
    const sending = form.submit()
    gate.resolve(true)
    assert.equal(await sending, 'cleared')
    assert.equal(form.value, '')
  })

  test(`${label}: A 전송 중 B를 입력하고 A가 성공해도 B는 남는다`, async () => {
    const gate = deferred()
    const form = makeForm(() => gate.promise)
    form.type('A')
    const sending = form.submit()
    form.type('B')
    gate.resolve(true)
    assert.equal(await sending, 'kept')
    assert.equal(form.value, 'B')
  })

  test(`${label}: A 전송 중 A→B→A로 되돌려도 문자열만 같을 뿐 바뀐 입력이므로 보존한다`, async () => {
    const gate = deferred()
    const form = makeForm(() => gate.promise)
    form.type('A')
    const sending = form.submit()
    form.type('B')
    form.type('A')
    gate.resolve(true)
    assert.equal(await sending, 'kept')
    assert.equal(form.value, 'A')
  })

  test(`${label}: A 전송 중 입력을 바꾸고 실패하면 현재 입력을 지우지 않는다`, async () => {
    const gate = deferred()
    const form = makeForm(() => gate.promise)
    form.type('A')
    const sending = form.submit()
    form.type('B')
    gate.resolve(false)
    assert.equal(await sending, 'failed')
    assert.equal(form.value, 'B')
  })

  test(`${label}: 수정 없이 실패해도 입력은 그대로이고 실패 뒤에는 다시 제출할 수 있다`, async () => {
    const results = [false, true]
    const form = makeForm(async () => results.shift())
    form.type('A')
    assert.equal(await form.submit(), 'failed')
    assert.equal(form.value, 'A')
    assert.equal(await form.submit(), 'cleared')
    assert.deepEqual(form.sent, ['A', 'A'])
  })

  test(`${label}: 전송 중 중복 제출은 한 번만 나가고, 응답 뒤에는 다시 제출할 수 있다`, async () => {
    const gate = deferred()
    let calls = 0
    const form = makeForm(() => {
      calls += 1
      return gate.promise
    })
    form.type('A')
    const first = form.submit()
    assert.equal(await form.submit(), 'ignored')
    assert.equal(await form.submit(), 'ignored')
    assert.equal(calls, 1)
    gate.resolve(true)
    await first
    form.type('B')
    const gate2 = deferred()
    const second = makeForm(() => gate2.promise)
    second.type('C')
    const p = second.submit()
    gate2.resolve(true)
    assert.equal(await p, 'cleared')
    assert.equal(form.value, 'B')
  })
}

test('규칙 자체: 처리 중이 아니면 begin이 토큰을 주고, 처리 중에는 null이다', () => {
  const tracker = createDraftSubmitTracker()
  const token = tracker.begin()
  assert.equal(typeof token, 'number')
  assert.equal(tracker.busy, true)
  assert.equal(tracker.begin(), null)
  assert.equal(tracker.finish(token, true), 'cleared')
  assert.equal(tracker.busy, false)
})

test('댓글과 답변은 같은 CommentForm·같은 규칙을 쓰고, 성공 뒤 무조건 비우는 코드가 없다', () => {
  const source = readFileSync(
    'src/components/community/CommunityPostView.tsx',
    'utf8',
  )
  const code = source.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.equal((code.match(/function CommentForm\(/g) ?? []).length, 1)
  assert.match(code, /<CommentForm kind="answer"/)
  assert.match(code, /<CommentForm kind="comment"/)
  assert.match(code, /createDraftSubmitTracker/)
  assert.match(code, /tracker\.edit\(\)/)
  assert.match(code, /tracker\.finish\(token, ok\)/)
  // setDraft('')는 규칙이 'cleared'라고 한 때만 실행된다.
  const clears = code.match(/setDraft\(''\)/g) ?? []
  assert.equal(clears.length, 1)
  assert.match(code, /if \(outcome === 'cleared'\) \{\s*setDraft\(''\)/)
  assert.match(code, /data-community-done="kept"/)
})

test('렌더링: 회원은 자유게시판에서 댓글 입력, Q&A에서 답변 입력이 열리고 둘 다 같은 폼 표식을 쓴다', () => {
  const detail = (board) => ({
    post: {
      id: 'p1',
      board,
      title: '제목',
      excerpt: null,
      authorName: '작성자',
      createdAt: '2026-11-20T09:00:00+09:00',
      commentCount: board === 'free' ? 0 : null,
      answered: board === 'qa' ? false : null,
      qaCategory: board === 'qa' ? 'exercise' : null,
      body: '본문',
      likeCount: board === 'free' ? 0 : null,
      likedByMe: board === 'free' ? false : null,
    },
    comments: [],
  })
  const actions = { like: async () => true, comment: async () => true }
  const html = (board) =>
    renderToStaticMarkup(
      createElement(
        MemoryRouter,
        null,
        createElement(PostView, {
          board,
          state: { status: 'ready', detail: detail(board) },
          onRetry: () => {},
          isMember: true,
          eligibility: { kind: 'allowed' },
          onEligibilityRetry: () => {},
          actions,
          listPath: '/community',
        }),
      ),
    )
  assert.match(html('free'), /data-community-form="comment"/)
  assert.match(html('qa'), /data-community-form="answer"/)
})
