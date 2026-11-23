// [chrome 회귀] 커뮤니티 댓글(C05)·답변(C04) 입력: 응답을 기다리는 동안 새로 쓴 내용을 늦은 성공 응답이 지우지 않는다.
//   수정 없이 성공 → 비워짐 · 전송 중 B 입력 후 A 성공 → B 보존과 안내 · A→B→A 되돌림 → 보존 · 전송 중 입력 후 실패 → 보존 · 전송 중 중복 제출 → 한 번만 · Q&A 답변도 같은 규칙
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only community-draft`. 상세: tests/chrome/README.md
// 개발용 탭 메모리 저장소는 즉시 응답하므로, 화면이 쥔 저장소 객체(React 훅 값)의 addComment를 시험 안에서만 지연 응답으로 감싼다(앱 소스는 바꾸지 않는다).
import { start, q } from '../lib/session.mjs'
import { mustUntil } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)

async function scenario(name, fn) {
  if (process.env.ONLY && process.env.ONLY !== name) return
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await fn(h)
    if (h.problems.length)
      console.log('  (console problems)', h.problems.slice(0, 4))
  } catch (e) {
    check(h, `${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

const DETAIL = '[data-community-detail]'
const open = async (h, path, ready) => {
  await h.go(path, 300)
  await mustUntil(h, `!!document.querySelector(${q(ready)})`, 120)
}
const typeInto = (h, sel, value) =>
  h.ev(`(()=>{
    const el = document.querySelector(${q(sel)})
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set
    el.focus(); set.call(el, ${q(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)

/**
 * 화면이 쥔 저장소 객체를 React fiber의 훅 값에서 찾아 addComment를 지연 응답으로 감싼다.
 * window.__calls는 저장소까지 간 요청 수, window.__release()는 대기 중인 응답을 풀어 준다.
 */
const installDelay = (h, formSel) =>
  h.ev(`(()=>{
    const el = document.querySelector(${q(formSel)})
    const key = Object.keys(el).find((k) => k.startsWith('__reactFiber$'))
    let f = el[key]
    let source = null
    while (f && !source) {
      for (let s = f.memoizedState; s && !source; s = s.next) {
        const v = Array.isArray(s.memoizedState) ? s.memoizedState[0] : s.memoizedState
        if (v && typeof v.addComment === 'function') source = v
      }
      f = f.return
    }
    if (!source) return false
    const original = source.addComment.bind(source)
    window.__calls = 0
    window.__gates = []
    source.addComment = (...args) => {
      window.__calls += 1
      return new Promise((resolve) => window.__gates.push(() => resolve(original(...args))))
    }
    window.__release = () => { const g = window.__gates.shift(); if (g) g(); return !!g }
    return true
  })()`)

const value = (h, kind) =>
  h.ev(`document.querySelector('[data-community-form=${kind}] textarea').value`)
const submit = (h, kind) =>
  h.ev(
    `document.querySelector('[data-community-form=${kind}]').requestSubmit()`,
  )
const notice = (h, kind) =>
  h.ev(
    `document.querySelector('[data-community-form=${kind}] [data-community-done]')?.dataset.communityDone ?? null`,
  )
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function flow(h, kind, label) {
  const sel = `[data-community-form=${kind}] textarea`
  const form = `[data-community-form=${kind}]`
  check(h, `${label}0. 저장소 지연 장치를 걸었다`, await installDelay(h, form))

  // 1) 수정 없이 성공 → 비워짐
  await typeInto(h, sel, '첫 번째 A')
  await submit(h, kind)
  await mustUntil(h, `window.__calls === 1`, 60)
  await h.ev(`window.__release()`)
  await mustUntil(h, `!!document.querySelector('[data-community-done]')`, 80)
  check(
    h,
    `${label}1. 수정 없이 성공하면 입력이 비워지고 일반 등록 안내가 나온다`,
    (await value(h, kind)) === '' && (await notice(h, kind)) === '',
  )

  // 2) 전송 중 B 입력 후 A 성공 → B 보존
  await typeInto(h, sel, '두 번째 A')
  await submit(h, kind)
  await mustUntil(h, `window.__calls === 2`, 60)
  await typeInto(h, sel, '새로 쓰는 B')
  await h.ev(`window.__release()`)
  await mustUntil(h, `!!document.querySelector('[data-community-done]')`, 80)
  check(
    h,
    `${label}2. 전송 중 새로 쓴 B는 A의 성공 응답 뒤에도 남고, 먼저 보낸 것이 등록됐다는 안내가 나온다`,
    (await value(h, kind)) === '새로 쓰는 B' &&
      /먼저 보낸/.test(await h.text(form)),
  )

  // 3) A→B→A 되돌림 → 보존
  await typeInto(h, sel, '세 번째 A')
  await submit(h, kind)
  await mustUntil(h, `window.__calls === 3`, 60)
  await typeInto(h, sel, '잠깐 B')
  await typeInto(h, sel, '세 번째 A')
  await h.ev(`window.__release()`)
  await mustUntil(h, `!!document.querySelector('[data-community-done]')`, 80)
  check(
    h,
    `${label}3. 전송 중 A→B→A로 되돌린 입력도 바뀐 입력으로 보고 보존한다`,
    (await value(h, kind)) === '세 번째 A',
  )

  // 5) 전송 중 중복 제출은 한 번만
  await typeInto(h, sel, '중복 확인')
  await submit(h, kind)
  await mustUntil(h, `window.__calls === 4`, 60)
  await submit(h, kind)
  await submit(h, kind)
  await sleep(300)
  check(
    h,
    `${label}5. 전송 중 다시 제출해도 요청은 한 번만 나가고 버튼은 등록 중이다`,
    (await h.ev(`window.__calls`)) === 4 && (await h.has('등록 중', form)),
  )
  await h.ev(`window.__release()`)
  await mustUntil(
    h,
    `!document.querySelector(${q(form)}).getAttribute('aria-busy') || document.querySelector(${q(form)}).getAttribute('aria-busy')==='false'`,
    80,
  )
}

await scenario('A-free-comment', async (h) => {
  await h.login('free')
  await open(h, '/community/posts/dev-free-2', DETAIL)
  await flow(h, 'comment', 'A')
})

await scenario('B-qa-answer', async (h) => {
  await h.login('free')
  await h.ev(`(async()=>{
    const A = await import('/src/auth/accountScope.ts');
    const Q = await import('/src/onboarding-assessment/mock/questionBank.ts');
    sessionStorage.setItem(A.accountScopedKey('free','assessment.mock.result'), JSON.stringify({bankVersion:Q.QUESTION_BANK_VERSION,sessionId:'t-sess',completedAt:new Date().toISOString(),exercise:'intermediate',meal:'beginner'}));
    return true })()`)
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await mustUntil(
    h,
    `!!document.querySelector('[data-community-form=answer]')`,
    150,
  )
  await flow(h, 'answer', 'B')
})
