// [chrome 회귀] P14 경험치 내역 · P16 포인트 내역:
//   비회원 차단 · P01에서 진입과 "이전" · 직접 URL·뒤로 가기 · 현재 레벨·보유 포인트(기존 출처, 개발용 값 안내)와 서버 연결 전 내역("아직 볼 수 없어요", 내역 없음 아님) ·
//   값이 없는 계정의 "연결 전" · 합계·잔액·내역을 만들지 않음 · P14 ↔ P15 이동 · 경험치와 포인트 분리 · 저장소에 남기지 않음 · 390/320/195/160px·320px 글자 200%
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only growth-history`. 상세: tests/chrome/README.md
// 내역 API가 없어 서버 연결 전 상태만 브라우저에서 볼 수 있다(내역 있음·필터·조회 실패 등은 growthHistory.test.mjs가 화면 단위로 확인한다).
// 개발 서버 전용 모의 계정(레벨·포인트 개발용 값이 있는 free·full, 없는 exercise·meal)만 쓰고 시나리오마다 새 Chrome 프로필로 시작한다.
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const NAV = 'nav[aria-label="밀스루틴 주요 메뉴"]'
const STATE = `!!document.querySelector('[data-history-state]:not([data-history-state=loading])')`

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
const text = (h) => h.ev(`document.querySelector('main').innerText`)
const open = async (h, path) => {
  await h.go(path, 300)
  await mustUntil(h, STATE, 120)
}
const status = (h) =>
  h.ev(`document.querySelector('[data-history-state]')?.dataset.historyState`)

// 하네스의 login은 free·full만 안다. 개발용 값이 없는 계정(식단 멤버)은 개발 서버 전용 모의 계정(src/auth/dev/devAccounts.ts)으로 같은 절차로 로그인한다.
const loginMeal = async (h) => {
  await h.go('/login', 900)
  await h.until(`!!document.querySelector('input[type=email]')`, 120)
  await h.setVal('input[type=email]', 'member.meal@example.com')
  await h.setVal('input[type=password]', 'Mr-Dev-Meal-2026')
  await h.ev(`document.querySelector('form').requestSubmit()`)
  await h.until(`location.pathname==='/home'`, 60)
  await h.sleep(300)
}

await scenario('A-guest-blocked', async (h) => {
  for (const path of ['/mypage/experience', '/mypage/points']) {
    await h.go(path, 300)
    await mustUntil(h, `!!document.querySelector('main')`, 100)
    await h.sleep(300)
    check(
      h,
      `A1. 비회원이 ${path}로 들어오면 로그인 안내를 보고 내역·수치가 없다`,
      (await h.has('로그인')) &&
        !(await h.ev(
          `!!document.querySelector('[data-history-state], [data-point-total]')`,
        )),
      path,
    )
  }
})

await scenario('B-p01-entries', async (h) => {
  await h.login('free')
  await h.go('/mypage', 300)
  await mustUntil(
    h,
    `!!document.querySelector('section[aria-labelledby=my-growth-title]')`,
    120,
  )
  check(
    h,
    'B1. P01: 경험치 내역 → /mypage/experience, 포인트 내역 → /mypage/points가 링크다',
    (await hrefOf(h, '^경험치 내역')) === '/mypage/experience' &&
      (await hrefOf(h, '^포인트 내역')) === '/mypage/points',
  )
  await mustClick(h, '^경험치 내역')
  await waitPath(h, '^/mypage/experience$')
  await mustUntil(h, STATE, 120)
  check(
    h,
    'B2. P14: h1 하나·문서 제목·하단 탭 마이·이전은 마이페이지',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '경험치 내역' &&
      /경험치 내역/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `document.querySelector(${q(NAV)}+' a[aria-current=page]')?.innerText.trim()`,
      )) === '마이' &&
      (await hrefOf(h, '^이전')) === '/mypage',
  )
  await h.click('^이전')
  await waitPath(h, '^/mypage$')
  check(h, 'B3. P14의 "이전"은 마이페이지로 돌아온다', true)
  await mustUntil(
    h,
    `!!document.querySelector('section[aria-labelledby=my-point-title]')`,
    120,
  )
  await mustClick(h, '^포인트 내역')
  await waitPath(h, '^/mypage/points$')
  await mustUntil(h, STATE, 120)
  check(
    h,
    'B4. P16: h1 하나·문서 제목·하단 탭 마이·이전은 마이페이지',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '포인트 내역' &&
      /포인트 내역/.test(await h.ev(`document.title`)) &&
      (await hrefOf(h, '^이전')) === '/mypage',
  )
  await h.ev(`history.back()`)
  await waitPath(h, '^/mypage$')
  check(h, 'B5. 브라우저 뒤로 가기도 마이페이지로 돌아온다', true)
})

await scenario('C-experience', async (h) => {
  await h.login('free')
  await open(h, '/mypage/experience')
  const page = await text(h)
  check(
    h,
    'C1. 서버 연결 전: "아직 볼 수 없어요"이고 내역 없음이 아니며 내역·합계가 없다',
    (await status(h)) === 'unavailable' &&
      /경험치 내역을 아직 볼 수 없어요/.test(page) &&
      /내역이 없다는 뜻이 아니에요/.test(page) &&
      !/아직 경험치 내역이 없어요/.test(page) &&
      !(await h.ev(
        `!!document.querySelector('[data-experience-entry], [data-history-list], [data-history-total]')`,
      )) &&
      !/\+\d+ EXP|합계|총 적립/.test(page),
  )
  check(
    h,
    'C2. 현재 활동 레벨은 P01과 같은 기존 값(개발용 Lv.3)이고 경험치 진행·합계 수치는 만들지 않으며 개발용 안내가 보인다',
    /Lv\.3/.test(page) &&
      !/다음 레벨까지|현재 \d+ EXP|320|500 EXP/.test(page) &&
      /개발용 임시 데이터가 포함돼 있어요/.test(
        await h.ev(`document.body.innerText`),
      ),
  )
  check(
    h,
    'C3. 안내: 포인트와 별도·지급과 승급 기준 미확정, 포인트 수량·보유 포인트가 섞이지 않는다',
    /포인트와 따로 관리돼요/.test(page) &&
      /경험치 지급과 레벨이 오르는 기준은 아직 정해지지 않았어요/.test(page) &&
      !/보유 포인트|\d\s?P\b/.test(page.replace(/Lv\.\d+/g, '')),
  )
  check(
    h,
    'C4. 레벨 안내(P15) 링크가 있다',
    (await hrefOf(h, '^레벨 안내 보기')) === '/mypage/level',
  )
  await mustClick(h, '^레벨 안내 보기')
  await waitPath(h, '^/mypage/level$')
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'C5. P14 → P15: 이전이 경험치 내역으로 돌아온다',
    (await hrefOf(h, '^이전')) === '/mypage/experience',
  )
  check(
    h,
    'C6. P15에서 경험치 내역으로 갈 수 있다',
    (await hrefOf(h, '^경험치 내역 보기')) === '/mypage/experience',
  )
  await h.click('^이전')
  await waitPath(h, '^/mypage/experience$')
  check(h, 'C7. 이전을 누르면 경험치 내역으로 돌아온다', true)
  // 새로고침(직접 URL)에도 같은 화면이다.
  await open(h, '/mypage/experience')
  check(
    h,
    'C8. 직접 URL 접근도 같은 화면이다',
    (await h1(h)) === '경험치 내역' && (await status(h)) === 'unavailable',
  )
})

await scenario('D-points', async (h) => {
  await h.login('free')
  await open(h, '/mypage/points')
  const page = await text(h)
  check(
    h,
    'D1. 서버 연결 전: "아직 볼 수 없어요"이고 내역 없음이 아니며 필터·내역이 없다',
    (await status(h)) === 'unavailable' &&
      /포인트 내역을 아직 볼 수 없어요/.test(page) &&
      /내역이 없다는 뜻이 아니에요/.test(page) &&
      !/아직 포인트 내역이 없어요/.test(page) &&
      !(await h.ev(
        `!!document.querySelector('[data-point-entry], [data-point-filter], [data-history-list]')`,
      )),
  )
  check(
    h,
    'D2. 보유 포인트는 P01과 같은 기존 값(개발용 500P)이고 총 적립·총 사용은 "연결 전"이며 개발용 안내가 보인다',
    /500/.test(page) &&
      /연결 전/.test(
        await h.ev(
          `document.querySelector('[data-point-total="총 적립"]').innerText`,
        ),
      ) &&
      /연결 전/.test(
        await h.ev(
          `document.querySelector('[data-point-total="총 사용"]').innerText`,
        ),
      ) &&
      /개발용 임시 데이터가 포함돼 있어요/.test(
        await h.ev(`document.body.innerText`),
      ),
  )
  check(
    h,
    'D3. 안내: 적립 기준·사용처·유효기간 미확정과 경험치 별도 관리, 거래·잔액·경험치 수량을 만들지 않는다',
    /적립 기준·사용처·유효기간은 아직 정해지지 않았어요/.test(page) &&
      /경험치와 따로 관리돼요/.test(page) &&
      !/[+−]\d+ P|잔액 \d|\d\s?EXP/.test(page),
  )
  await h.go('/mypage', 300)
  await mustUntil(
    h,
    `!!document.querySelector('section[aria-labelledby=my-point-title]')`,
    120,
  )
  const p01Balance = await h.ev(
    `document.querySelector('section[aria-labelledby=my-point-title]').innerText.match(/[\\d,]+/)?.[0] ?? null`,
  )
  check(
    h,
    'D4. P01의 보유 포인트와 같은 값이다',
    p01Balance === '500',
    String(p01Balance),
  )
})

await scenario('E-accounts', async (h) => {
  // 개발용 값이 없는 계정: 레벨·포인트도 "연결 전"이고 개발용 안내가 없다.
  await loginMeal(h)
  await open(h, '/mypage/experience')
  const exp = await text(h)
  check(
    h,
    'E1. 개발용 값이 없는 계정의 P14: 레벨은 "Lv.–"·연결 전이고 개발용 안내가 없다',
    /Lv\.–|활동 레벨 연결 전/.test(
      exp + (await h.ev(`document.querySelector('main').innerHTML`)),
    ) &&
      /연결 전/.test(exp) &&
      !/Lv\.\d/.test(exp) &&
      !/개발용 임시 데이터/.test(await h.ev(`document.body.innerText`)),
  )
  await open(h, '/mypage/points')
  const pts = await text(h)
  check(
    h,
    'E2. 개발용 값이 없는 계정의 P16: 보유 포인트는 줄표·"아직 연결되지 않았어요"이고 0P로 채우지 않는다',
    /아직 연결되지 않았어요/.test(pts) &&
      !/\b0\s?P\b/.test(pts) &&
      !/개발용 임시 데이터/.test(await h.ev(`document.body.innerText`)),
  )
  // 계정 전환: 이전 계정(식단멤버) 값이 남지 않고 종합멤버의 개발용 값이 보인다.
  await h.go('/settings', 300)
  await mustClick(h, '^로그아웃$')
  await waitPath(h, '^/home$')
  await h.login('full')
  await open(h, '/mypage/points')
  check(
    h,
    'E3. 다른 계정(종합멤버)으로 로그인하면 그 계정의 개발용 값(24,000P)만 보인다',
    /24,000/.test(await text(h)),
  )
  await open(h, '/mypage/experience')
  check(h, 'E4. 종합멤버의 P14는 Lv.12가 보인다', /Lv\.12/.test(await text(h)))
  const dump = await h.ev(
    `JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), history.state, location.href])`,
  )
  check(
    h,
    'E5. 경험치·포인트 내역이 URL·history state·저장소 키에 남지 않는다',
    !/exp|point|ledger|history/i.test(
      dump
        .replace(/\/mypage\/(experience|points)/, '')
        .replace('react-router-scroll-positions', ''),
    ),
    dump.slice(0, 200),
  )
})

await scenario('F-layout', async (h) => {
  await h.login('free')
  const probe = `(()=>{
    const W=window.innerWidth;
    const els=[...document.querySelectorAll('main a, main button')];
    const bad=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).length;
    const small=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5}).map(e=>(e.innerText||e.tagName).trim().slice(0,14));
    const wide=[...document.querySelectorAll('main *')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).length;
    window.scrollTo(0,document.documentElement.scrollHeight);
    const nav=document.querySelector(${q(NAV)});
    const navTop=nav?nav.getBoundingClientRect().top:Infinity;
    const last=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().height>0&&(e.checkVisibility?e.checkVisibility():true)).reduce((m,e)=>Math.max(m,e.getBoundingClientRect().bottom),0);
    return {ov:document.documentElement.scrollWidth-W,bad,wide,small,navOverlap:Math.round(last-navTop)}})()`
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    for (const [path, tag] of [
      ['/mypage/experience', 'P14'],
      ['/mypage/points', 'P16'],
    ]) {
      await open(h, path)
      const r = await h.ev(probe)
      check(
        h,
        `F1. ${width}px ${tag}: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
        r.ov <= 0 &&
          r.bad === 0 &&
          r.wide === 0 &&
          r.small.length === 0 &&
          r.navOverlap <= 0,
        JSON.stringify(r),
      )
      if (width === 390 || width === 320) {
        await h.ev(`window.scrollTo(0,0)`)
        await h.sleep(450)
        await h.shot(`${tag.toLowerCase()}-${width}.png`)
      }
    }
  }
  await h.vp(320, 844)
  for (const [path, file] of [
    ['/mypage/experience', 'p14-320-text200.png'],
    ['/mypage/points', 'p16-320-text200.png'],
  ]) {
    await open(h, path)
    await h.ev(`document.documentElement.style.fontSize='200%'`)
    await h.sleep(500)
    const big = await h.ev(probe)
    check(
      h,
      `F2. 320px·글자 200% ${path}: 가로 스크롤·잘림·하단 탭 겹침 없음`,
      big.ov <= 0 && big.bad === 0 && big.wide === 0 && big.navOverlap <= 0,
      JSON.stringify(big),
    )
    await h.ev(`window.scrollTo(0,0)`)
    await h.sleep(300)
    await h.shot(file)
    await h.ev(`document.documentElement.style.fontSize=''`)
  }
})
