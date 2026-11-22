// [chrome 회귀] FAST-01: 랜딩 연결 · P07 즐겨찾기 · S01 공지 · S01-1 공지 상세 · S04 FAQ · P15 레벨 안내
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only support-screens`. 상세: tests/chrome/README.md
// 시나리오마다 새 Chrome 프로필(빈 저장소)을 쓴다. 즐겨찾기 시드는 앱과 같은 저장소 코드(favoriteSource)로 만든다. 앱 소스를 수정하지 않는다.
import { start } from '../lib/session.mjs'
import {
  mustClick,
  mustUntil as baseUntil,
  waitPath as basePath,
} from '../lib/history.mjs'

// 새 Chrome 프로필은 매 시나리오 첫 화면을 개발 서버에서 새로 받아 와 느릴 때가 있다. 대기 한도를 두 배로 둔다(조건이 충족되면 바로 넘어간다).
const mustUntil = (h, expr, n = 80) => baseUntil(h, expr, n * 2)
const waitPath = (h, re, n = 80) => basePath(h, re, n * 2)

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

/** main 안의 보이는 글자와 링크·제목 요약. */
const snap = (h) =>
  h.ev(`(()=>{
    const m=document.querySelector('main');
    return {
      path:location.pathname+location.search,
      h1:[...m.querySelectorAll('h1')].map(x=>x.textContent.trim()),
      text:m.innerText.replace(/\\s+/g,' ').trim(),
      links:[...m.querySelectorAll('a')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')})),
      over:document.documentElement.scrollWidth-document.documentElement.clientWidth,
    }})()`)

const waitH1 = (h, text, n = 80) =>
  mustUntil(
    h,
    `document.querySelector('main h1')?.textContent.trim()===${JSON.stringify(text)}`,
    n,
  )

/** 페이지를 다시 불러오지 않는 앱 안 이동(공유 상태·진입 경로 state는 링크 클릭으로만 만든다). */
const clickLink = async (h, re) => {
  await mustClick(h, re, 'body')
}

// ── A. 비회원: 랜딩 → 운동 찾기·음식 찾기·고객지원 ──────────────────────────────────────
for (const [label, w, hh] of [
  ['모바일 390', 390, 844],
  ['데스크톱 1280', 1280, 800],
]) {
  await scenario(`A-landing-${w}`, async (h) => {
    await h.vp(w, hh)
    await h.go('/home', 200)
    await mustUntil(h, `!!document.querySelector('#explore')`, 80)
    let s = await h.ev(`document.body.innerText`)
    check(
      h,
      `A1(${label}). 랜딩에 "화면 준비 중" 문구가 없다`,
      !/화면 준비 중/.test(s),
    )
    check(
      h,
      `A2(${label}). 아직 없는 기능 안내("제공 예정")는 그대로 있다`,
      /제공 예정/.test(s),
    )
    const tiles = await h.ev(
      `[...document.querySelectorAll('#explore a')].map(a=>({t:a.innerText.replace(/\\s+/g,' ').trim(),h:a.getAttribute('href')}))`,
    )
    check(
      h,
      `A3(${label}). 둘러보기 링크: 운동 찾기 → /exercises, 음식 찾기 → /foods`,
      tiles.length === 2 &&
        tiles[0].h === '/exercises' &&
        /운동 찾기/.test(tiles[0].t) &&
        tiles[1].h === '/foods' &&
        /음식 찾기/.test(tiles[1].t),
      JSON.stringify(tiles),
    )
    // 클릭 → 비회원도 화면이 열린다(로그인 안내로 막히지 않는다)
    await h.ev(
      `document.querySelector('#explore a[href="/exercises"]').click()`,
    )
    await waitPath(h, '^/exercises$')
    await mustUntil(h, `!!document.querySelector('main')`, 40)
    s = await h.ev(`document.querySelector('main').innerText`)
    check(
      h,
      `A4(${label}). 운동 찾기가 열리고 로그인 안내·"준비 중"이 아니다`,
      !/로그인 후 이용할 수 있어요|화면 준비 중|임시 화면/.test(s) &&
        /운동/.test(s),
      s.slice(0, 120),
    )
    await h.ev(`history.back()`)
    await waitPath(h, '^/home$')
    await mustUntil(h, `!!document.querySelector('#explore')`, 80)
    await h.ev(`document.querySelector('#explore a[href="/foods"]').click()`)
    await waitPath(h, '^/foods$')
    await mustUntil(h, `!!document.querySelector('main')`, 40)
    s = await h.ev(`document.querySelector('main').innerText`)
    check(
      h,
      `A5(${label}). 음식 찾기가 열리고 로그인 안내·"준비 중"이 아니다`,
      !/로그인 후 이용할 수 있어요|임시 화면/.test(s) && /음식/.test(s),
      s.slice(0, 120),
    )
    // 푸터 고객지원 → 공지사항 → 이전 → 홈
    await h.ev(`history.back()`)
    await waitPath(h, '^/home$')
    await mustUntil(
      h,
      `!!document.querySelector('footer a[href="/support"]')`,
      80,
    )
    check(
      h,
      `A6(${label}). 푸터 고객지원 옆에 "화면 준비 중"이 없다`,
      !/준비 중/.test(await h.ev(`document.querySelector('footer').innerText`)),
    )
    await h.ev(`document.querySelector('footer a[href="/support"]').click()`)
    await waitPath(h, '^/support$')
    await waitH1(h, '공지사항')
    await mustClick(h, '^이전$')
    await waitPath(h, '^/home$')
    check(
      h,
      `A7(${label}). 고객지원(공지사항)의 "이전"은 홈으로 돌아온다`,
      (await h.path()) === '/home',
    )
    s = await snap(h)
    check(h, `A8(${label}). 가로 스크롤 없음`, s.over <= 0, String(s.over))
  })
}

// ── B. 비회원: 공지사항 · 공지 상세 · FAQ ───────────────────────────────────────────────
await scenario('B-support-guest', async (h) => {
  await h.go('/support', 200)
  await waitH1(h, '공지사항')
  let s = await snap(h)
  check(
    h,
    'B1. S01: 공지가 없으면 빈 상태 안내(가짜 공지 없음), 검색 입력·FAQ 진입이 있다',
    /등록된 공지가 없어요/.test(s.text) &&
      !s.links.some((l) => /\/support\/notices\//.test(l.h)) &&
      s.links.some((l) => l.h === '/support/faq') &&
      (await h.ev(`!!document.querySelector('main input[type=search]')`)),
    JSON.stringify(s.links),
  )
  check(
    h,
    'B2. 챗봇·1:1 문의는 링크가 아니라 "준비 중"으로만 알린다',
    /키워드 챗봇/.test(s.text) &&
      /1:1 문의/.test(s.text) &&
      (s.text.match(/준비 중/g) ?? []).length === 2,
  )
  await h.go('/support/notices/없는공지', 200)
  await waitH1(h, '공지사항')
  s = await snap(h)
  check(
    h,
    'B3. S01-1: 없는 공지 id는 "찾을 수 없어요"와 목록 링크만 보인다',
    /공지를 찾을 수 없어요/.test(s.text) &&
      s.links.some((l) => l.h === '/support' && /공지 목록으로/.test(l.t)),
    s.text.slice(0, 120),
  )
  await mustClick(h, '^공지 목록으로$')
  await waitPath(h, '^/support$')
  check(h, 'B4. "공지 목록으로" → S01', (await h.path()) === '/support')

  // FAQ
  await h.go('/support/faq', 200)
  await waitH1(h, '자주 묻는 질문')
  s = await snap(h)
  const total = await h.ev(`document.querySelectorAll('main details').length`)
  check(
    h,
    'B5. S04: 질문 아코디언이 있고 전체 건수와 같다',
    total >= 5 && new RegExp(`전체 ${total}건`).test(s.text),
    `${total}`,
  )
  await h.ev(`document.querySelector('main details summary').focus()`)
  const before = await h.ev(`document.querySelector('main details').open`)
  await h.press('Enter', 'Enter', 13)
  const opened = await h.ev(`document.querySelector('main details').open`)
  await h.press(' ', 'Space', 32)
  const closed = await h.ev(`document.querySelector('main details').open`)
  check(
    h,
    'B6. 질문을 키보드(Enter로 열기·Space로 닫기)로 펼치고 접는다',
    before === false && opened === true && closed === false,
    `${before}/${opened}/${closed}`,
  )
  // 검색: 입력하면 주소 ?q=에 반영되고 결과가 줄어든다
  await h.setVal('#faq-search', '즐겨찾기')
  await mustUntil(h, `document.querySelectorAll('main details').length===1`, 40)
  s = await snap(h)
  check(
    h,
    'B7. 검색: "즐겨찾기"는 1건, 결과 건수와 주소(?q=)에 반영',
    /검색 결과 1건/.test(s.text) &&
      decodeURIComponent(s.path).endsWith('/support/faq?q=즐겨찾기'),
    s.path,
  )
  await h.setVal('#faq-search', '없는질문xyz')
  await mustUntil(
    h,
    `/검색 결과가 없어요/.test(document.querySelector('main').innerText)`,
    40,
  )
  await mustClick(h, '^전체 보기$')
  await mustUntil(
    h,
    `document.querySelectorAll('main details').length===${total}`,
    40,
  )
  check(
    h,
    'B8. 결과가 없으면 안내가 나오고 "전체 보기"가 검색어를 지워 전체 질문을 다시 보인다',
    (await h.path()) === '/support/faq' &&
      (await h.ev(`document.querySelector('#faq-search').value`)) === '',
  )
  // 관련 화면 이동
  await h.ev(`document.querySelector('main details').open=true`)
  await mustClick(h, '^운동 탐색으로 이동$')
  await waitPath(h, '^/exercises$')
  check(
    h,
    'B9. 관련 화면 링크 → 운동 탐색(비회원 열람)',
    (await h.path()) === '/exercises',
  )
  // 직접 URL의 "이전"은 상세 설정(P09)이다(비회원은 로그인 안내)
  await h.go('/support/faq', 200)
  await waitH1(h, '자주 묻는 질문')
  await mustClick(h, '^이전$')
  await waitPath(h, '^/settings$')
  check(
    h,
    'B10. 주소로 연 FAQ의 "이전"은 상세 설정(P09, 비회원은 로그인 안내)',
    (await h.path()) === '/settings',
  )
  // 반응형·터치 영역
  for (const [w, hh] of [
    [320, 700],
    [390, 844],
    [768, 1024],
    [1280, 800],
  ]) {
    await h.vp(w, hh)
    await h.go('/support/faq', 200)
    await waitH1(h, '자주 묻는 질문')
    const p = await h.ev(`(()=>{
      const small=[...document.querySelectorAll('main a, main button, main summary, main input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('.sr-only')&&r.height<43.5}).map(e=>(e.innerText||e.id||'').trim().slice(0,14)+':'+Math.round(e.getBoundingClientRect().height));
      return {ov:document.documentElement.scrollWidth-window.innerWidth, small:small.slice(0,5)}})()`)
    check(
      h,
      `B11-${w}. FAQ: 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.small.length === 0,
      JSON.stringify(p),
    )
  }
})

// ── C. 회원: 설정 메뉴 연결 · 이전 복귀 · 레벨 안내 ─────────────────────────────────────
await scenario('C-member-links', async (h) => {
  await h.login('free')
  await h.go('/settings', 200)
  await waitH1(h, '상세 설정')
  let s = await snap(h)
  const link = (label) => s.links.find((l) => l.t.startsWith(label))
  check(
    h,
    'C1. 설정 메뉴: 즐겨찾기 → /favorites, 공지사항 → /support, FAQ → /support/faq가 링크다',
    link('즐겨찾기')?.h === '/favorites' &&
      link('공지사항')?.h === '/support' &&
      link('FAQ')?.h === '/support/faq',
    JSON.stringify(s.links),
  )
  check(
    h,
    'C2. 내 운동 루틴은 W06 링크이고, 아직 화면이 없는 항목(내 문의 등)은 그대로 "준비 중"이다',
    (s.text.match(/준비 중/g) ?? []).length >= 8 &&
      link('내 운동 루틴')?.h === '/records/exercise/routines' &&
      !link('내 문의'),
    String((s.text.match(/준비 중/g) ?? []).length),
  )
  for (const [label, path, h1] of [
    ['즐겨찾기', '/favorites', '즐겨찾기'],
    ['공지사항', '/support', '공지사항'],
    ['FAQ', '/support/faq', '자주 묻는 질문'],
  ]) {
    await mustClick(h, `^${label}$`)
    await waitPath(h, `^${path.replace(/\//g, '\\/')}$`)
    await waitH1(h, h1)
    check(h, `C3. 설정 → ${label} 화면(h1 "${h1}")`, (await h.path()) === path)
    await mustClick(h, '^이전$')
    await waitPath(h, '^/settings$')
    check(
      h,
      `C4. ${label}의 "이전" → 상세 설정`,
      (await h.path()) === '/settings',
    )
    await waitH1(h, '상세 설정')
  }
  // 공지·FAQ 사이 이동과 "이전"
  const step = async (label, fn) => {
    try {
      await fn()
    } catch (e) {
      const where = await h.ev(
        `location.pathname+' | '+(document.querySelector('main h1')?.textContent.trim()??'-')+' | '+JSON.stringify(history.state)`,
      )
      throw new Error(`${label}: ${e.message} (현재 ${where})`)
    }
  }
  await step('C5-1 설정 → 공지', async () => {
    await mustClick(h, '^공지사항$')
    await waitPath(h, '^/support$')
  })
  await step('C5-2 공지 → FAQ', async () => {
    await mustClick(h, '^자주 묻는 질문\\(FAQ\\)$')
    await waitPath(h, '^/support/faq$')
    // 주소가 바뀐 직후에도 본문은 아직 이전 화면일 수 있다(그 화면의 "이전"을 누르면 다른 곳으로 간다). 새 화면의 제목이 나올 때까지 기다린다.
    await waitH1(h, '자주 묻는 질문')
  })
  await step('C5-3 FAQ 이전', async () => {
    await mustClick(h, '^이전$')
    await waitPath(h, '^/support$')
  })
  check(
    h,
    'C5. 공지 → FAQ의 "이전" → 공지 목록',
    (await h.path()) === '/support',
  )

  // 마이페이지 레벨 안내
  await h.go('/mypage', 200)
  await mustUntil(
    h,
    `!!document.querySelector('main a[href="/mypage/level"]')`,
    80,
  )
  check(h, 'C6. 마이페이지에 "레벨 안내" 링크가 생겼다', true)
  await mustClick(h, '^레벨 안내$')
  await waitPath(h, '^/mypage/level$')
  await waitH1(h, '레벨 안내')
  s = await snap(h)
  check(
    h,
    'C7. P15: 초보·중급·고급 설명과 정책 미확정 안내, 명세 예시 수치(320·180 EXP)는 없다',
    /초보/.test(s.text) &&
      /중급/.test(s.text) &&
      /고급/.test(s.text) &&
      /아직 정해지지 않았어요/.test(s.text) &&
      !/320|180 EXP/.test(s.text),
    s.text.slice(0, 200),
  )
  check(
    h,
    'C8. P15: 현재 상태는 마이페이지와 같은 출처(개발용 회원 Lv.) 또는 "연결 전"이고 적립·승급 동작이 없다',
    /내 현재 상태/.test(s.text) &&
      (/Lv\.\d+/.test(s.text) || /연결 전/.test(s.text)) &&
      !/적립 완료|승급했어요|포인트 지급 완료/.test(s.text),
  )
  check(h, 'C9. 가로 스크롤 없음', s.over <= 0, String(s.over))
  await mustClick(h, '^이전$')
  await waitPath(h, '^/mypage$')
  check(
    h,
    'C10. 레벨 안내의 "이전" → 마이페이지',
    (await h.path()) === '/mypage',
  )
})

// ── D. 회원: 즐겨찾기(P07) ─────────────────────────────────────────────────────────────
await scenario('D-favorites', async (h) => {
  await h.login('free')
  // 앱과 같은 저장소 코드로 운동 3개를 free 계정에, 1개를 다른 계정에 즐겨찾기한다.
  const seeded = await h.ev(`(async()=>{
    const ex = await import('/src/exercise/exerciseSource.ts');
    const fav = await import('/src/exercise/favoriteSource.ts');
    const all = await ex.createExerciseRepository().list({query:'',difficulty:null,part:null,tool:null});
    const pick = all.slice(0,4);
    const mine = fav.createFavoriteRepository('free');
    for (const e of pick.slice(0,3)) await mine.add(e.id);
    await fav.createFavoriteRepository('full').add(pick[3].id);
    return pick.map(e=>({id:e.id,name:e.name}));
  })()`)
  await h.go('/favorites', 200)
  await waitH1(h, '즐겨찾기')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-item]').length===3`,
    80,
  )
  let s = await snap(h)
  const names = await h.ev(
    `[...document.querySelectorAll('[data-favorite-item]')].map(li=>li.querySelector('p').innerText.trim())`,
  )
  check(
    h,
    'D1. 운동 탭: free 계정의 즐겨찾기 3개만 카탈로그 순서로 보이고 다른 계정의 운동은 없다',
    names.length === 3 &&
      seeded.slice(0, 3).every((e) => names.includes(e.name)) &&
      !names.includes(seeded[3].name),
    JSON.stringify(names),
  )
  const tabs = await h.ev(
    `[...document.querySelectorAll('[role=tab]')].map(t=>({t:t.innerText.replace(/\\s+/g,' ').trim(),sel:t.getAttribute('aria-selected')}))`,
  )
  check(
    h,
    'D2. 탭: 음식·운동, 운동이 선택되어 있고 운동 개수 3이 보인다(음식 탭은 음식 즐겨찾기가 연결되어 개수도 보인다)',
    tabs.length === 2 &&
      /^음식(\s*개수\s*\d+)?$/.test(tabs[0].t) &&
      tabs[0].sel === 'false' &&
      /^운동\s*개수\s*3$/.test(tabs[1].t) &&
      tabs[1].sel === 'true',
    JSON.stringify(tabs),
  )
  // E02 이동과 "이전"
  const first = seeded[0]
  await h.ev(
    `[...document.querySelectorAll('[data-favorite-item]')].find(li=>li.innerText.includes(${JSON.stringify(first.name)})).querySelector('a').click()`,
  )
  await waitPath(h, `^/exercises/${first.id}$`)
  await waitH1(h, first.name)
  check(
    h,
    'D3. 자세히 → E02(운동 상세, 운동명 h1)',
    (await h.ev(`document.querySelector('main h1').textContent.trim()`)) ===
      first.name,
  )
  await mustClick(h, '^이전$')
  await waitPath(h, '^/favorites$')
  await waitH1(h, '즐겨찾기')
  check(h, 'D4. E02의 "이전" → 즐겨찾기', (await h.path()) === '/favorites')
  // 해제
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-item]').length===3`,
    80,
  )
  await h.ev(
    `document.querySelector('button[aria-label="즐겨찾기 해제: ${first.name}"]').click()`,
  )
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-item]').length===2`,
    80,
  )
  s = await snap(h)
  const status = await h.ev(
    `[...document.querySelectorAll('[role=status]')].map(n=>n.innerText.trim()).filter(Boolean)`,
  )
  const focus = await h.ev(
    `(()=>{const a=document.activeElement;return a?a.getAttribute('role')||a.tagName:null})()`,
  )
  check(
    h,
    'D5. 별 해제: 저장 뒤 목록에서 빠지고(2개), 개수 2, 결과 안내와 포커스가 문서 처음으로 빠지지 않는다',
    !s.text.includes(first.name) &&
      /운동\s*개수\s*2/.test(s.text) &&
      status.some((t) => /즐겨찾기에서 삭제했어요/.test(t)) &&
      focus === 'tabpanel',
    `${JSON.stringify(status)} focus=${focus}`,
  )
  // 저장이 실제로 반영된다: 새로고침 후에도 2개, 저장소에서도 빠졌다
  await h.go('/favorites', 200)
  await waitH1(h, '즐겨찾기')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-item]').length===2`,
    80,
  )
  const stored = await h.ev(`(async()=>{
    const fav = await import('/src/exercise/favoriteSource.ts');
    return [await fav.createFavoriteRepository('free').list(), await fav.createFavoriteRepository('full').list()]
  })()`)
  check(
    h,
    'D6. 새로고침 후에도 2개이고 저장소에서 해제됐으며 다른 계정의 즐겨찾기는 그대로(1개)다',
    stored[0].length === 2 &&
      !stored[0].includes(first.id) &&
      stored[1].length === 1,
    JSON.stringify(stored),
  )
  // 탭: 방향키·음식 탭
  await h.ev(`document.querySelector('[role=tab][aria-selected=true]').focus()`)
  await h.press('ArrowLeft', 'ArrowLeft', 37)
  await mustUntil(
    h,
    `document.querySelector('[role=tab][aria-selected=true]')?.innerText.trim().startsWith('음식')`,
    30,
  )
  await mustUntil(
    h,
    `/즐겨찾기한 음식이 없어요/.test(document.querySelector('main').innerText)`,
    60,
  )
  s = await snap(h)
  check(
    h,
    'D7. 왼쪽 방향키로 음식 탭(즐겨찾기한 음식 없음 안내, 음식 찾아보기 → /foods), 주소 ?tab=food',
    /즐겨찾기한 음식이 없어요/.test(s.text) &&
      s.links.some((l) => l.h === '/foods') &&
      /tab=food/.test(s.path) &&
      (await h.ev(`document.activeElement?.getAttribute('role')`)) === 'tab',
    s.path,
  )
  await h.press('ArrowRight', 'ArrowRight', 39)
  await mustUntil(
    h,
    `document.querySelector('[role=tab][aria-selected=true]')?.innerText.includes('운동')`,
    30,
  )
  check(h, 'D8. 오른쪽 방향키로 운동 탭으로 돌아온다', true)
  // 모두 해제 → 빈 상태
  for (const e of seeded.slice(1, 3)) {
    await h.ev(
      `document.querySelector('button[aria-label="즐겨찾기 해제: ${e.name}"]').click()`,
    )
    await mustUntil(
      h,
      `!document.querySelector('button[aria-label="즐겨찾기 해제: ${e.name}"]')`,
      60,
    )
  }
  s = await snap(h)
  check(
    h,
    'D9. 모두 해제하면 빈 상태 안내와 "운동 찾아보기"(→ /exercises)',
    /즐겨찾기한 운동이 없어요/.test(s.text) &&
      s.links.some((l) => l.h === '/exercises' && /운동 찾아보기/.test(l.t)),
  )
  // 계정 분리: exercise 계정으로는 자기 1개만
  await h.go('/settings', 200)
  await mustClick(h, '^로그아웃$', 'body')
  await h.sleep(500)
  await h.login('full')
  await h.go('/favorites', 200)
  await waitH1(h, '즐겨찾기')
  await mustUntil(
    h,
    `document.querySelectorAll('[data-favorite-item]').length===1`,
    80,
  )
  check(
    h,
    'D10. 다른 계정(full)은 자기 즐겨찾기 1개만 보인다(free 계정 기록 없음)',
    (await h.ev(`document.querySelector('main').innerText`)).includes(
      seeded[3].name,
    ),
  )
  // 반응형
  for (const [w, hh] of [
    [320, 700],
    [390, 844],
    [1280, 800],
  ]) {
    await h.vp(w, hh)
    await h.go('/favorites', 200)
    await waitH1(h, '즐겨찾기')
    await mustUntil(
      h,
      `document.querySelectorAll('[data-favorite-item]').length===1`,
      80,
    )
    const p = await h.ev(`(()=>{
      const small=[...document.querySelectorAll('main a, main button')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&!e.closest('.sr-only')&&r.height<43.5}).map(e=>(e.innerText||e.getAttribute('aria-label')||'').trim().slice(0,14)+':'+Math.round(e.getBoundingClientRect().height));
      return {ov:document.documentElement.scrollWidth-window.innerWidth, small:small.slice(0,5)}})()`)
    check(
      h,
      `D11-${w}. 즐겨찾기: 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.small.length === 0,
      JSON.stringify(p),
    )
  }
})

// ── E. 비회원: 회원 전용 화면은 로그인 안내 ──────────────────────────────────────────────
await scenario('E-guest-gate', async (h) => {
  for (const path of ['/favorites', '/mypage/level']) {
    await h.go(path, 300)
    await mustUntil(
      h,
      `/로그인 후 이용할 수 있어요/.test(document.body.innerText)`,
      60,
    )
    check(
      h,
      `E1. 비회원이 ${path}를 열면 로그인 안내만 보인다`,
      !(await h.ev(`!!document.querySelector('[data-favorite-item]')`)) &&
        !/내 현재 상태/.test(await h.ev(`document.body.innerText`)),
    )
  }
})
