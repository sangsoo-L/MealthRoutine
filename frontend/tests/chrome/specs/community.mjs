// [chrome 회귀] 커뮤니티 C01 자유게시판(/community)·C01-2 초보자 Q&A(/community/qa)·C05 글 상세(/community/posts/:postId)·C04 Q&A 상세(/community/qa/:postId)·
// C02 글 작성(/community/posts/new)·C02-1 질문 작성(/community/qa/new):
//   비회원 읽기와 로그인 안내 · 목록→상세→이전/목록으로 · 게시판 전환 링크 · 댓글·응원(회원)과 빈 입력 검증 · 글·질문 작성(검증·카테고리 필수·등록 후 상세 이동) ·
//   답변 자격 안내(초보 이해도) · 없는 글/다른 게시판 글/잘못된 주소 · 홈 바로가기 · 새로고침하면 사라지는 개발용 메모리 예시 · 390/320/195/160px·320px 글자 200%
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only community`. 상세: tests/chrome/README.md
// 서버가 없어 개발 서버 전용 탭 메모리 예시 저장소만 쓴다(운영 빌드의 "연결 전" 상태는 Node 테스트와 verify:dist가 확인한다). 개발용 모의 계정만 쓰고 시나리오마다 새 Chrome 프로필로 시작한다.
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const NAV = 'nav[aria-label="밀스루틴 주요 메뉴"]'

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

const h1 = (h) =>
  h.ev(`document.querySelector('main h1')?.innerText.trim() ?? ''`)
const hrefOf = (h, re, scope = 'main') =>
  h.ev(
    `[...document.querySelectorAll(${q(scope)}+' a')].find(a=>new RegExp(${q(re)}).test(a.innerText.trim()))?.getAttribute('href') ?? null`,
  )
const has = (h, sel) => h.ev(`!!document.querySelector(${q(sel)})`)
const open = async (h, path, ready) => {
  await h.go(path, 300)
  await mustUntil(h, `!!document.querySelector(${q(ready)})`, 120)
}
const LIST = '[data-community-list]'
const DETAIL = '[data-community-detail]'
const FORM = '[data-community-compose]'
const typeInto = (h, sel, value) =>
  h.ev(`(()=>{
    const el = document.querySelector(${q(sel)})
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement : HTMLInputElement
    const set = Object.getOwnPropertyDescriptor(proto.prototype, 'value').set
    el.focus(); set.call(el, ${q(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)

await scenario('A-guest-read', async (h) => {
  await open(h, '/community', LIST)
  check(
    h,
    'A1. C01: h1 자유게시판·개발 예시 안내·글 행 3개·댓글 수·작성일 미기록 표시',
    (await h1(h)) === '자유게시판' &&
      (await has(h, '[data-community-dev]')) &&
      (await h.ev(
        `document.querySelectorAll('[data-community-post]').length`,
      )) >= 3 &&
      (await h.has('\\(2\\)')) &&
      (await h.has('작성일 미기록')) &&
      /자유게시판 · 밀스루틴/.test(await h.ev(`document.title`)),
  )
  check(
    h,
    'A2. 비회원도 글쓰기 버튼이 있고 하단 탭(홈)이 활성이며 이전은 홈이다',
    (await hrefOf(h, '^글쓰기$')) === '/community/posts/new' &&
      (await h.ev(
        `document.querySelector(${q(NAV)}+' a[aria-current=page]')?.innerText.trim()`,
      )) === '홈' &&
      (await hrefOf(h, '^이전')) === '/home',
  )
  await h.ev(
    `document.querySelector('[data-community-post=dev-free-1]').click()`,
  )
  await waitPath(h, '^/community/posts/dev-free-1$')
  await mustUntil(h, `!!document.querySelector(${q(DETAIL)})`, 120)
  check(
    h,
    'A3. C05 상세: 제목·작성자·본문·댓글 2개, 이전은 목록(C01)',
    (await h1(h)) === '오늘 처음으로 30분 걸었어요' &&
      (await h.has('개발용 예시')) &&
      (await h.has('둘째 줄|내일도 짧게라도')) &&
      (await h.ev(
        `document.querySelectorAll('[data-community-comment]').length`,
      )) === 2 &&
      (await hrefOf(h, '^이전')) === '/community',
  )
  check(
    h,
    'A4. 비회원: 댓글 입력이 없고 로그인 안내와 로그인 링크가 있으며 응원은 비활성이다',
    !(await has(h, 'main textarea')) &&
      (await h.has('댓글과 응원은 로그인한 회원이 남길 수 있어요')) &&
      (await hrefOf(h, '^로그인하기$')) === '/login' &&
      (await h.ev(
        `document.querySelector('[data-community-like]').getAttribute('aria-disabled')`,
      )) === 'true' &&
      !(await h.has('^(수정|삭제|신고)$')),
  )
  await mustClick(h, '자유게시판 목록으로')
  await waitPath(h, '^/community$')
  check(h, 'A5. 목록으로 링크는 C01로 돌아간다', true)

  await mustClick(h, '초보자 Q&A 보기')
  await waitPath(h, '^/community/qa$')
  await mustUntil(h, `!!document.querySelector(${q(LIST)})`, 120)
  check(
    h,
    'A6. C01-2: h1 초보자 Q&A·답변 대기/완료 배지·댓글 수 없음·질문하기 링크·자유게시판 링크',
    (await h1(h)) === '초보자 Q&A' &&
      (await has(h, '[data-community-status=waiting]')) &&
      (await has(h, '[data-community-status=answered]')) &&
      !(await has(h, '[data-community-comments]')) &&
      (await hrefOf(h, '^질문하기$')) === '/community/qa/new' &&
      (await hrefOf(h, '자유게시판 보기')) === '/community',
  )
  await h.ev(`document.querySelector('[data-community-post=dev-qa-2]').click()`)
  await waitPath(h, '^/community/qa/dev-qa-2$')
  await mustUntil(h, `!!document.querySelector(${q(DETAIL)})`, 120)
  check(
    h,
    'A7. C04 상세(답변 있음): 답변 완료·식단 카테고리·답변 카드(답변자·중급 회원)·질문 목록으로·의료 안내',
    (await has(h, '[data-community-status=answered]')) &&
      (await has(h, '[data-community-category=meal]')) &&
      (await h.has('중급 회원')) &&
      (await h.has('의료적 진단이나 처방을 대신하지 않아요')) &&
      (await hrefOf(h, '질문 목록으로')) === '/community/qa' &&
      (await hrefOf(h, '^이전')) === '/community/qa',
  )
  check(
    h,
    'A8. 비회원: 답변 입력 없이 로그인 안내가 보인다',
    !(await has(h, 'main textarea')) &&
      (await has(h, '[data-community-guide=guest]')) &&
      (await h.has('로그인한 중급·고급 회원이 남길 수 있어요')),
  )
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  check(
    h,
    'A9. C04 상세(답변 없음): 답변 대기와 대기 안내',
    (await has(h, '[data-community-status=waiting]')) &&
      (await h.has('아직 답변이 없어요')),
  )
})

await scenario('B-guest-write-guard', async (h) => {
  for (const path of ['/community/posts/new', '/community/qa/new']) {
    await h.go(path, 600)
    await mustUntil(h, `!!document.querySelector('#login-required-title')`, 100)
    check(
      h,
      `B. 비회원이 ${path}에 들어오면 로그인 안내를 보고 작성 폼이 없다`,
      (await h.has('로그인 후 이용할 수 있어요')) && !(await has(h, FORM)),
    )
  }
})

await scenario('C-member-comment-like', async (h) => {
  await h.login('free')
  await open(h, '/community/posts/dev-free-1', DETAIL)
  check(
    h,
    'C1. 회원: 댓글 입력과 응원 버튼이 열리고 응원 수 3',
    (await has(h, '[data-community-form=comment]')) &&
      !(await has(h, '[data-community-guide=guest]')) &&
      (await h.ev(
        `document.querySelector('[data-community-like]').getAttribute('aria-pressed')`,
      )) === 'false' &&
      (await h.ev(
        `document.querySelector('[data-community-like-count]').dataset.communityLikeCount`,
      )) === '3',
  )
  await h.ev(
    `document.querySelector('[data-community-form=comment]').requestSubmit()`,
  )
  await mustUntil(
    h,
    `/내용을 입력해 주세요/.test(document.querySelector('main').innerText)`,
    40,
  )
  check(
    h,
    'C2. 빈 댓글은 등록되지 않고 오류 안내가 나온다',
    (await h.ev(
      `document.querySelectorAll('[data-community-comment]').length`,
    )) === 2,
  )
  await typeInto(
    h,
    '[data-community-form=comment] textarea',
    '댓글 확인용 입력',
  )
  await h.ev(
    `document.querySelector('[data-community-form=comment]').requestSubmit()`,
  )
  await mustUntil(
    h,
    `document.querySelectorAll('[data-community-comment]').length === 3`,
    80,
  )
  check(
    h,
    'C3. 댓글을 등록하면 서버(예시 저장소) 값으로 3개가 되고 내 닉네임이 보이며 입력이 비워진다',
    (await h.has('댓글 확인용 입력')) &&
      (await h.has('일반회원')) &&
      (await h.ev(
        `document.querySelector('[data-community-form=comment] textarea').value`,
      )) === '',
  )
  await h.ev(`document.querySelector('[data-community-like]').click()`)
  await mustUntil(
    h,
    `document.querySelector('[data-community-like]').getAttribute('aria-pressed')==='true'`,
    80,
  )
  check(
    h,
    'C4. 응원을 누르면 눌림 상태가 되고 수가 4가 된다',
    (await h.ev(
      `document.querySelector('[data-community-like-count]').dataset.communityLikeCount`,
    )) === '4',
  )
  await h.ev(`document.querySelector('[data-community-like]').click()`)
  await mustUntil(
    h,
    `document.querySelector('[data-community-like]').getAttribute('aria-pressed')==='false'`,
    80,
  )
  check(
    h,
    'C5. 다시 누르면 취소되어 수가 3으로 돌아온다',
    (await h.ev(
      `document.querySelector('[data-community-like-count]').dataset.communityLikeCount`,
    )) === '3',
  )
  await h.ev(`location.reload()`)
  await mustUntil(h, `!!document.querySelector(${q(DETAIL)})`, 150)
  check(
    h,
    'C6. 새로고침하면 개발용 메모리 예시가 처음으로 돌아가 댓글이 2개이다(저장되지 않음)',
    (await h.ev(
      `document.querySelectorAll('[data-community-comment]').length`,
    )) === 2 && !(await h.has('댓글 확인용 입력')),
  )
  const dump = await h.ev(
    `JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), history.state])`,
  )
  check(
    h,
    'C7. 글·댓글·응원이 저장소 키나 history state에 남지 않는다',
    !/community|comment|post|like/i.test(dump),
    dump.slice(0, 200),
  )
})

await scenario('D-compose-free', async (h) => {
  await h.login('free')
  await open(h, '/community', LIST)
  const before = await h.ev(
    `document.querySelectorAll('[data-community-post]').length`,
  )
  await mustClick(h, '^글쓰기$')
  await waitPath(h, '^/community/posts/new$')
  await mustUntil(h, `!!document.querySelector(${q(FORM)})`, 120)
  check(
    h,
    'D1. C02: h1·제목·내용 입력·개인정보 경고·등록 버튼 활성·취소는 C01',
    (await h1(h)) === '자유게시판 글쓰기' &&
      (await has(h, 'input[name=postTitle]')) &&
      (await has(h, 'textarea[name=postBody]')) &&
      (await h.has('개인정보는 적지 마세요')) &&
      !(await h.ev(
        `document.querySelector('[data-community-submit]').disabled`,
      )) &&
      !(await has(h, '[data-community-unavailable]')) &&
      (await hrefOf(h, '^취소$')) === '/community' &&
      (await hrefOf(h, '^이전')) === '/community',
  )
  await h.ev(`document.querySelector(${q(FORM)}).requestSubmit()`)
  await mustUntil(
    h,
    `!!document.querySelector('[data-community-state=invalid]')`,
    40,
  )
  check(
    h,
    'D2. 빈 제목·내용으로 등록하면 막히고 각 칸에 오류가 보이며 이동하지 않는다',
    (await h.has('제목을 입력해 주세요')) &&
      (await h.has('내용을 입력해 주세요')) &&
      (await h.path()) === '/community/posts/new',
  )
  await typeInto(h, 'input[name=postTitle]', '시험 삼아 올리는 글')
  await typeInto(h, 'textarea[name=postBody]', '본문 첫 줄\n본문 둘째 줄')
  await h.ev(`document.querySelector(${q(FORM)}).requestSubmit()`)
  await mustUntil(
    h,
    `/^\\/community\\/posts\\/dev-new-/.test(location.pathname)`,
    100,
  )
  await mustUntil(h, `!!document.querySelector(${q(DETAIL)})`, 120)
  check(
    h,
    'D3. 등록하면 새 글 상세(C05)로 이동하고 제목·작성자(내 닉네임)·본문이 보인다',
    (await h1(h)) === '시험 삼아 올리는 글' &&
      (await h.has('일반회원')) &&
      (await h.has('본문 둘째 줄')) &&
      (await hrefOf(h, '^이전')) === '/community',
  )
  await h.ev(`history.back()`)
  await waitPath(h, '^/community$')
  await mustUntil(h, `!!document.querySelector(${q(LIST)})`, 120)
  check(
    h,
    'D4. 뒤로 가면 작성 폼이 아니라 목록이고 새 글이 맨 위에 있다',
    (await h.ev(
      `document.querySelectorAll('[data-community-post]').length`,
    )) ===
      before + 1 &&
      (await h.ev(
        `document.querySelector('[data-community-post]').innerText.includes('시험 삼아 올리는 글')`,
      )),
  )
  await h.ev(`location.reload()`)
  await mustUntil(h, `!!document.querySelector(${q(LIST)})`, 150)
  check(
    h,
    'D5. 새로고침하면 새 글이 사라진다(저장되지 않음)',
    (await h.ev(
      `document.querySelectorAll('[data-community-post]').length`,
    )) === before,
  )
})

await scenario('E-compose-qa', async (h) => {
  await h.login('free')
  await open(h, '/community/qa/new', FORM)
  check(
    h,
    'E1. C02-1: 운동/식단 카테고리 라디오 2개(미선택)·질문 예시·취소는 C01-2',
    (await h1(h)) === '초보자 Q&A 질문하기' &&
      (await h.ev(
        `document.querySelectorAll('input[name=qaCategory]').length`,
      )) === 2 &&
      (await h.ev(
        `document.querySelectorAll('input[name=qaCategory]:checked').length`,
      )) === 0 &&
      (
        await h.ev(
          `document.querySelector('input[name=postTitle]').placeholder`,
        )
      ).startsWith('예)') &&
      (await hrefOf(h, '^취소$')) === '/community/qa',
  )
  await typeInto(h, 'input[name=postTitle]', '카테고리 없이 보내 보기')
  await typeInto(h, 'textarea[name=postBody]', '내용')
  await h.ev(`document.querySelector(${q(FORM)}).requestSubmit()`)
  await mustUntil(
    h,
    `!!document.querySelector('[data-community-state=invalid]')`,
    40,
  )
  check(
    h,
    'E2. 카테고리를 고르지 않으면 등록이 막히고 오류 안내가 나온다',
    (await h.has('운동과 식단 중 하나를 선택해 주세요')) &&
      (await h.path()) === '/community/qa/new',
  )
  await h.ev(
    `document.querySelector('input[name=qaCategory][value=meal]').click()`,
  )
  await h.sleep(150)
  check(
    h,
    'E3. 식단을 고르면 오류가 사라지고 단일 선택이다',
    !(await h.has('운동과 식단 중 하나를 선택해 주세요')) &&
      (await h.ev(
        `document.querySelectorAll('input[name=qaCategory]:checked').length`,
      )) === 1,
  )
  await h.ev(`document.querySelector(${q(FORM)}).requestSubmit()`)
  await mustUntil(
    h,
    `/^\\/community\\/qa\\/dev-new-/.test(location.pathname)`,
    100,
  )
  await mustUntil(h, `!!document.querySelector(${q(DETAIL)})`, 120)
  check(
    h,
    'E4. 등록하면 C04로 이동하고 답변 대기·선택한 카테고리(식단)가 보인다',
    (await has(h, '[data-community-status=waiting]')) &&
      (await has(h, '[data-community-category=meal]')) &&
      (await h1(h)) === '카테고리 없이 보내 보기' &&
      (await hrefOf(h, '^이전')) === '/community/qa',
  )
  await mustUntil(
    h,
    `!!document.querySelector('[data-community-guide=beginner]')`,
    120,
  )
  check(
    h,
    'E5. 초보 이해도 회원: 답변 입력이 없고 중급 이상만 답변할 수 있다는 안내가 보인다',
    !(await has(h, 'main textarea')) &&
      (await has(h, '[data-community-guide=beginner]')) &&
      (await h.has('이해도가 중급 이상인 회원이 남길 수 있어요')),
  )
})

await scenario('F-notfound-and-home', async (h) => {
  for (const path of [
    '/community/posts/nope',
    '/community/qa/nope',
    // 다른 게시판의 글 id는 이 주소에서 보이지 않는다.
    '/community/posts/dev-qa-1',
    '/community/qa/dev-free-1',
  ]) {
    await open(h, path, '[data-community-state=notfound]')
    check(
      h,
      `F. ${path}: 찾을 수 없는 글 안내와 목록 링크, 글 본문 없음`,
      (await h.has('찾을 수 없는 글이에요')) &&
        !(await has(h, DETAIL)) &&
        /목록으로/.test(
          await h.ev(
            `document.querySelector('[data-community-list-link]').innerText`,
          ),
        ),
    )
  }
  await h.login('free')
  await h.go('/home', 400)
  await mustUntil(h, `!!document.querySelector('[data-home-shortcuts]')`, 120)
  check(
    h,
    'F5. 홈 커뮤니티 바로가기는 /community이고 준비 중 표시가 없다',
    (await h.ev(
      `[...document.querySelectorAll('[data-home-shortcuts] a')].find(a=>/커뮤니티/.test(a.innerText))?.getAttribute('href')`,
    )) === '/community' &&
      !(await h.ev(
        `/준비 중/.test([...document.querySelectorAll('[data-home-shortcuts] li')].find(li=>/커뮤니티/.test(li.innerText)).innerText)`,
      )),
  )
  await h.ev(
    `[...document.querySelectorAll('[data-home-shortcuts] a')].find(a=>/커뮤니티/.test(a.innerText)).click()`,
  )
  await waitPath(h, '^/community$')
  await mustUntil(h, `!!document.querySelector(${q(LIST)})`, 120)
  check(
    h,
    'F6. 홈에서 들어온 C01의 이전은 홈이다',
    (await hrefOf(h, '^이전')) === '/home',
  )
})

await scenario('G-layout', async (h) => {
  await h.login('free')
  const probe = `(()=>{
    const W = window.innerWidth
    const els = [...document.querySelectorAll('main a, main button, main summary')]
    const bad = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) }).length
    const small = els.filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 43.5 }).map(e => (e.innerText || e.tagName).trim().slice(0, 14))
    const wide = [...document.querySelectorAll('main *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > W + 0.5 || r.left < -0.5) }).length
    return { ov: document.documentElement.scrollWidth - W, bad, wide, small }
  })()`
  const pages = [
    ['/community', LIST],
    ['/community/qa', LIST],
    ['/community/posts/dev-free-1', DETAIL],
    ['/community/qa/dev-qa-2', DETAIL],
    ['/community/posts/new', FORM],
    ['/community/qa/new', FORM],
  ]
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    for (const [path, ready] of pages) {
      await open(h, path, ready)
      const r = await h.ev(probe)
      check(
        h,
        `G1. ${width}px ${path}: 가로 스크롤·잘림 없음, 링크·버튼 높이 ≥44`,
        r.ov <= 0 && r.bad === 0 && r.wide === 0 && r.small.length === 0,
        JSON.stringify(r),
      )
    }
  }
  await h.vp(320, 844)
  for (const [path, ready] of pages) {
    await open(h, path, ready)
    await h.ev(`document.documentElement.style.fontSize='200%'`)
    await h.sleep(300)
    const r = await h.ev(probe)
    check(
      h,
      `G2. 320px·글자 200% ${path}: 가로 스크롤·잘림 없음`,
      r.ov <= 0 && r.bad === 0 && r.wide === 0,
      JSON.stringify(r),
    )
  }
  await open(h, '/community', LIST)
  await h.vp(390, 844)
  await h.sleep(300)
  await h.shot('community-list-390.png')
  await open(h, '/community/qa/dev-qa-2', DETAIL)
  await h.shot('community-qa-detail-390.png')
})

// Q&A 답변 권한(C04): 질문 카테고리와 같은 영역의 이해도가 중급 이상인 회원에게만 답변 입력을 연다. 이해도는 개발 서버 전용 mock 결과를
// 계정별 sessionStorage에 넣어 만든다(운영 빌드에는 이 mock이 없다). 개발용 계정의 기본 이해도는 모두 초보라 별도 상태가 필요하다.
const setTier = (h, exercise, meal = 'beginner', user = 'free') =>
  h.ev(`(async()=>{
    const A = await import('/src/auth/accountScope.ts');
    const Q = await import('/src/onboarding-assessment/mock/questionBank.ts');
    sessionStorage.setItem(A.accountScopedKey(${q(user)},'assessment.mock.result'), JSON.stringify({bankVersion:Q.QUESTION_BANK_VERSION,sessionId:'t-sess',completedAt:new Date().toISOString(),exercise:${q(exercise)},meal:${q(meal)}}));
    return true })()`)
const setFlag = (h, name, kind) =>
  h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.${name}', ${q(kind)})`,
  )
const guide = (h) =>
  h.ev(
    `document.querySelector('[data-community-guide]')?.dataset.communityGuide ?? null`,
  )
const settled = (h) =>
  mustUntil(
    h,
    `(()=>{const g=document.querySelector('[data-community-guide]')?.dataset.communityGuide; return !!document.querySelector('[data-community-form=answer]') || (!!g && g!=='loading')})()`,
    150,
  )

await scenario('H-answer-permission', async (h) => {
  await h.login('free')
  // 1) 초보 이해도: 운동·식단 질문 모두 입력 없음
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await settled(h)
  check(
    h,
    'H1. 초보 회원(운동 질문): 답변 입력이 없고 중급 이상 안내가 보인다',
    (await guide(h)) === 'beginner' && !(await has(h, 'main textarea')),
  )
  // 2) 운동 중급: 운동 질문은 입력 허용, 식단 질문은 제한
  await setTier(h, 'intermediate', 'beginner')
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await settled(h)
  check(
    h,
    'H2. 운동 중급 회원: 운동 질문에 답변 입력이 열린다',
    (await has(h, '[data-community-form=answer] textarea')) &&
      !(await has(h, '[data-community-guide]')),
  )
  await open(h, '/community/qa/dev-qa-2', DETAIL)
  await settled(h)
  check(
    h,
    'H3. 운동 중급·식단 초보 회원: 식단 질문에는 입력이 없다(같은 영역 이해도 기준)',
    (await guide(h)) === 'beginner' && !(await has(h, 'main textarea')),
  )
  // 3) 답변 등록 흐름(서버=개발용 예시 저장소가 성공을 알린 때만 반영)
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await settled(h)
  await h.ev(
    `document.querySelector('[data-community-form=answer]').requestSubmit()`,
  )
  await mustUntil(
    h,
    `/내용을 입력해 주세요/.test(document.querySelector('main').innerText)`,
    40,
  )
  check(
    h,
    'H4. 빈 답변은 등록되지 않고 오류 안내가 나온다',
    (await h.ev(
      `document.querySelectorAll('[data-community-comment]').length`,
    )) === 0,
  )
  await typeInto(h, '[data-community-form=answer] textarea', '답변 확인용 입력')
  await h.ev(
    `document.querySelector('[data-community-form=answer]').requestSubmit()`,
  )
  await mustUntil(
    h,
    `document.querySelectorAll('[data-community-comment]').length === 1`,
    80,
  )
  check(
    h,
    'H5. 답변을 등록하면 답변 카드가 생기고 상태가 답변 완료로 바뀐다(등급은 서버가 주지 않아 "등급 확인 전")',
    (await has(h, '[data-community-status=answered]')) &&
      (await h.has('답변 확인용 입력')) &&
      (await h.has('등급 확인 전')),
  )
  // 4) 식단 고급: 식단 질문 허용
  await setTier(h, 'beginner', 'advanced')
  await open(h, '/community/qa/dev-qa-2', DETAIL)
  await settled(h)
  check(
    h,
    'H6. 식단 고급 회원: 식단 질문에 답변 입력이 열린다',
    await has(h, '[data-community-form=answer] textarea'),
  )
  // 5) 이해도 미확인·조회 실패
  await setFlag(h, 'unavailable', 'assessment')
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await settled(h)
  check(
    h,
    'H7. 이해도를 확인할 수 없으면(미연결) 입력을 열지 않고 제한 안내를 보인다',
    (await guide(h)) === 'unknown' && !(await has(h, 'main textarea')),
  )
  // 미연결 스위치가 남아 있으면 그쪽이 우선하므로 먼저 지운다.
  await h.ev(
    `localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable')`,
  )
  await setFlag(h, 'failLoad', 'assessment')
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await settled(h)
  check(
    h,
    'H8. 이해도 조회가 실패하면 입력 없이 실패 안내와 다시 시도가 보인다',
    (await guide(h)) === 'error' &&
      !(await has(h, 'main textarea')) &&
      (await h.has('다시 시도')),
  )
})

await scenario('I-answer-guest', async (h) => {
  await open(h, '/community/qa/dev-qa-1', DETAIL)
  await settled(h)
  check(
    h,
    'I1. 비회원: 답변 입력 없이 로그인 안내와 로그인 링크가 보인다',
    (await guide(h)) === 'guest' &&
      !(await has(h, 'main textarea')) &&
      (await hrefOf(h, '^로그인하기$')) === '/login',
  )
})
