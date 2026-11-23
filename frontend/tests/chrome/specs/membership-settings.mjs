// [chrome 회귀] P03 멤버십과 결제 관리(통합 AI 멤버십: 무료 최초 5회 · 베이직 월 30회 · 프로 월 100회):
//   비회원 차단 · P09·P01에서 진입과 "이전" · 서버 연결 전 현재 멤버십·잔여 횟수("연결 전", 멤버십·횟수를 지어내지 않음) · 운동·식단별 상품 구분 없음 ·
//   사용량 규칙·소진 안내 · 무료·베이직·프로 비교 · AI 기능 목록·링크 · 결제 관리(가격·결제 내역을 만들지 않음, 결제·멤버십 변경 버튼 비활성) ·
//   무료 체험 FAQ(키보드로 펼침) · 멤버십·사용량 상태를 저장소에 남기지 않음 · 390/320/195/160px·320px 글자 200%·하단 탭 겹침
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only membership-settings`. 상세: tests/chrome/README.md
// 멤버십·사용량 API가 없어 서버 연결 전 상태만 브라우저에서 볼 수 있다(무료·베이직·프로·소진 상태는 membershipSettings.test.mjs가 화면 단위로 확인한다).
// 개발 서버 전용 모의 계정만 쓰고 시나리오마다 새 Chrome 프로필로 시작한다.
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const READY = `!!document.querySelector('[data-membership-hero]')`
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
const text = (h) => h.ev(`document.querySelector('main').innerText`)
const rowText = (h, row) =>
  h.ev(
    `document.querySelector('[data-membership-row=${row}]')?.innerText.replace(/\\s+/g,' ').trim() ?? null`,
  )
const openPage = async (h) => {
  await h.go('/settings/membership', 300)
  await mustUntil(h, READY, 120)
  await mustUntil(h, `!!document.querySelector('[data-membership-state]')`, 120)
}

await scenario('A-guest-blocked', async (h) => {
  await h.go('/settings/membership', 300)
  await mustUntil(h, `!!document.querySelector('main')`, 100)
  await h.sleep(300)
  check(
    h,
    'A1. 비회원이 P03 주소로 들어오면 로그인 안내를 보고 멤버십·결제 정보가 없다',
    (await h.has('로그인')) &&
      !(await h.ev(READY)) &&
      !(await h.has('구독 상태|멤버십 관리하기|무료·멤버십 기능 비교')),
  )
})

await scenario('B-settings-and-p01-entry', async (h) => {
  await h.login('free')
  await h.go('/settings', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'B1. P09: 멤버십 관리는 /settings/membership 링크(준비 중 아님)',
    (await hrefOf(h, '^멤버십 관리')) === '/settings/membership',
  )
  await mustClick(h, '^멤버십 관리')
  await waitPath(h, '^/settings/membership$')
  await mustUntil(h, READY, 120)
  check(
    h,
    'B2. P03: h1 하나·문서 제목·하단 탭 마이·이전은 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '멤버십과 결제 관리' &&
      /멤버십과 결제 관리/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `document.querySelector(${q(NAV)}+' a[aria-current=page]')?.innerText.trim()`,
      )) === '마이' &&
      (await hrefOf(h, '^이전')) === '/settings',
  )
  await h.click('^이전')
  await waitPath(h, '^/settings$')
  // 주소가 바뀐 직후에는 이전 화면(P03)이 아직 남아 있을 수 있다. 상세 설정(P09)이 그려진 뒤에 누른다.
  const SETTINGS_RENDERED = `(document.querySelector('main h1')?.innerText.trim() ?? '') !== '멤버십과 결제 관리' && !!document.querySelector('main a[href="/settings/membership"]')`
  await mustUntil(h, SETTINGS_RENDERED, 100)
  check(h, 'B3. "이전"은 상세 설정으로 돌아온다', true)
  await mustClick(h, '^멤버십 관리')
  await waitPath(h, '^/settings/membership$')
  await mustUntil(h, READY, 120)
  await h.ev(`history.back()`)
  await waitPath(h, '^/settings$')
  check(h, 'B4. 브라우저 뒤로 가기도 상세 설정으로 돌아온다', true)
  // P01: 일반 회원은 "멤버십 보기"
  await h.go('/mypage', 300)
  await mustUntil(h, `!!document.querySelector('[data-membership-link]')`, 120)
  check(
    h,
    'B5. P01 일반 회원: 멤버십 보기가 P03 링크이고 가격·결제 표현이 없다',
    (await h.ev(
      `document.querySelector('[data-membership-link]').getAttribute('href')`,
    )) === '/settings/membership' &&
      /멤버십 보기/.test(
        await h.ev(
          `document.querySelector('[data-membership-link]').innerText`,
        ),
      ) &&
      !(await h.ev(
        `/[\\d,]+\\s?원|다음 결제/.test(document.querySelector('section[aria-labelledby=my-membership-title]').innerText)`,
      )),
  )
  await h.ev(`document.querySelector('[data-membership-link]').click()`)
  await waitPath(h, '^/settings/membership$')
  await mustUntil(h, READY, 120)
  check(
    h,
    'B6. P01 → P03: 이전이 마이페이지로 돌아간다',
    (await hrefOf(h, '^이전')) === '/mypage',
  )
  await h.click('^이전')
  await waitPath(h, '^/mypage$')
  check(h, 'B7. 이전을 누르면 마이페이지로 돌아온다', true)
})

await scenario('C-content-free', async (h) => {
  await h.login('free')
  await openPage(h)
  check(
    h,
    'C1. 서버 연결 전: 안내가 보이고 현재 멤버십은 "연결 전"이며 무료·베이직·프로 멤버십으로 표시하지 않는다',
    (await h.has('멤버십·사용량 정보가 아직 서버에 연결되지 않았어요')) &&
      /연결 전/.test((await rowText(h, 'subscription')) ?? '') &&
      !/(무료|베이직|프로) 멤버십/.test(
        await h.ev(
          `document.querySelector('[data-membership-hero]').innerText`,
        ),
      ) &&
      !(await h.has('일반 회원|회원 유형|운동 멤버십|식단 멤버십|종합 멤버십')),
  )
  check(
    h,
    'C2. 통합 AI 사용량도 "연결 전"이고 잔여 횟수·진행 막대 숫자를 만들지 않는다',
    /연결 전/.test(
      await h.ev(
        `document.querySelector('[data-membership-usage-section]').innerText`,
      ),
    ) &&
      !(await h.ev(
        `!!document.querySelector('[data-membership-remaining], [role=progressbar]')`,
      )) &&
      !/\d+회 남음/.test(await text(h)),
  )
  check(
    h,
    'C3. 운동 AI·식단 AI 공통 사용량, 기록·조회 비차감, 소진 안내가 보인다',
    (await h.has('운동 AI와 식단 AI는 같은 횟수를 함께 사용해요')) &&
      (await h.has('운동·식단 기록과 조회는 AI 사용 횟수를 쓰지 않아요')) &&
      (await h.has('AI 사용 횟수를 모두 쓰면 AI 기능은 이용할 수 없어요')) &&
      (await h.has('운동·식단별 사용 내역')) &&
      (await h.ev(
        `document.querySelector('[data-membership-breakdown]').dataset.membershipBreakdown`,
      )) === 'empty',
  )
  check(
    h,
    'C4. 무료·베이직·프로 비교: 무료 최초 5회(월간 초기화 없음) · 매월 30회 · 매월 100회, 유료는 권장안·승인 전',
    (await h.has('무료·베이직·프로 비교')) &&
      (await h.ev(
        `document.querySelectorAll('[data-membership-plan]').length`,
      )) === 3 &&
      (await h.has('가입 후 최초 총 5회')) &&
      (await h.has('월간 초기화 없음')) &&
      (await h.has('매월 30회')) &&
      (await h.has('매월 100회')) &&
      (await h.ev(
        `(document.querySelector('main').innerText.match(/권장안 · 최종 승인 전/g) ?? []).length`,
      )) === 2,
  )
  check(
    h,
    'C5. AI 기능 4개(운동·식단·사진·주간)와 서비스 링크가 보이고 상품별 이용 조건 문구는 없다',
    (await h.ev(
      `document.querySelectorAll('[data-membership-feature]').length`,
    )) === 4 &&
      (await hrefOf(h, '운동 조건 선택')) === '/ai/exercise/plan' &&
      (await hrefOf(h, '식단 목표 확인')) === '/ai/meal' &&
      (await hrefOf(h, '^주간 리포트 보기')) === '/ai/weekly-report' &&
      !(await h.has('이용 조건:|운동·종합|식단·종합')),
  )
  const page = await text(h)
  check(
    h,
    'C6. 결제 관리: 준비 중 안내, 요금·방식 미확정, 결제 내역을 만들지 않음, 가격·카드 표현 없음',
    /결제와 멤버십 변경 기능은 준비 중이에요/.test(page) &&
      /요금과 결제 방식은 아직 정해지지 않았어요/.test(page) &&
      /표시할 결제 내역이 없어요/.test(page) &&
      /자동으로 결제되지 않아요/.test(page) &&
      !/[\d,]+\s?원|₩|카드 번호|카드번호/.test(page),
  )
  check(
    h,
    'C7. 멤버십 변경 버튼은 비활성이고 이유를 안내하며 누를 수 없다',
    (await h.ev(
      `[...document.querySelectorAll('[data-membership-actions] button')].length`,
    )) === 1 &&
      (await h.ev(
        `[...document.querySelectorAll('[data-membership-actions] button')].every(b=>b.disabled)`,
      )) &&
      (await h.has('결제·멤버십 변경은 준비가 끝나면 이용할 수 있어요')),
  )
  await h.ev(
    `document.querySelector('[data-membership-actions] button').click()`,
  )
  await h.sleep(300)
  check(
    h,
    'C8. 비활성 버튼을 눌러도 이동·성공 표시·상태 변화가 없다',
    (await h.path()) === '/settings/membership' &&
      !(await h.has(
        '완료|가입했어요|결제되었|구독했어요|해지했어요|변경했어요',
      )) &&
      /연결 전/.test((await rowText(h, 'subscription')) ?? ''),
  )
  // FAQ: 접힌 상태에서 시작, 키보드로 펼친다.
  check(
    h,
    'C9. 무료 체험 FAQ는 접힌 상태로 시작한다',
    (await h.ev(
      `document.querySelectorAll('[data-membership-faq]').length`,
    )) === 4 &&
      (await h.ev(
        `[...document.querySelectorAll('[data-membership-faq]')].every(d=>!d.open)`,
      )),
  )
  await h.ev(`document.querySelector('[data-membership-faq] summary').focus()`)
  await h.press('Enter', 'Enter', 13)
  await h.sleep(200)
  check(
    h,
    'C10. FAQ 질문은 키보드(Enter)로 펼쳐지고 확정된 안내(가입 후 최초 총 5회, 월간 초기화 없음)가 보인다',
    (await h.ev(`document.querySelector('[data-membership-faq]').open`)) &&
      /최초 총 5회/.test(
        await h.ev(`document.querySelector('[data-membership-faq]').innerText`),
      ) &&
      /월간 초기화는 없고/.test(
        await h.ev(`document.querySelector('[data-membership-faq]').innerText`),
      ),
  )
  // 서비스 링크 이동
  await mustClick(h, '^주간 리포트 보기')
  await waitPath(h, '^/ai/weekly-report$')
  check(h, 'C11. AI 기능 링크는 해당 서비스 화면으로 이동한다', true)
  await h.ev(`history.back()`)
  await waitPath(h, '^/settings/membership$')
  // 멤버십·사용량 상태가 저장소에 남지 않는다.
  const dump = await h.ev(
    `JSON.stringify([Object.keys(localStorage), Object.keys(sessionStorage), history.state, location.href])`,
  )
  check(
    h,
    'C12. 멤버십·사용량·결제 상태가 URL·history state·저장소 키에 남지 않는다',
    !/subscri|payment|billing|membership|plan|usage|remaining/i.test(
      dump.replace('/settings/membership', ''),
    ),
    dump.slice(0, 200),
  )
})

await scenario('D-legacy-account-type', async (h) => {
  // 개발용 계정에 옛 회원 유형(종합)이 있어도 P03은 운동·식단별 상품 구분을 보이지 않고 서버에서 확인하지 않은 멤버십을 표시하지 않는다.
  await h.login('full')
  await h.go('/mypage', 300)
  await mustUntil(h, `!!document.querySelector('[data-membership-link]')`, 120)
  await openPage(h)
  const hero = await h.ev(
    `document.querySelector('[data-membership-hero]').innerText`,
  )
  check(
    h,
    'D1. 계정 유형과 무관하게 연결 전이며 멤버십 종류·상품 구분(운동·식단·종합)을 보이지 않는다',
    /연결 전/.test((await rowText(h, 'subscription')) ?? '') &&
      !/(무료|베이직|프로) 멤버십|운동 멤버십|식단 멤버십|종합 멤버십/.test(
        hero,
      ) &&
      (await h.ev(
        `[...document.querySelectorAll('[data-membership-actions] button')].every(b=>b.disabled && /멤버십 관리하기/.test(b.innerText))`,
      )),
  )
})

await scenario('E-layout', async (h) => {
  await h.login('free')
  const probe = `(()=>{
    const W=window.innerWidth;
    const els=[...document.querySelectorAll('main a, main button, main summary')];
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
    await openPage(h)
    // FAQ를 모두 펼친 가장 긴 상태에서 확인한다.
    await h.ev(
      `document.querySelectorAll('[data-membership-faq]').forEach(d=>{d.open=true})`,
    )
    const r = await h.ev(probe)
    check(
      h,
      `E1. ${width}px: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
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
      await h.shot(`p03-${width}.png`)
    }
  }
  await h.vp(320, 844)
  await openPage(h)
  await h.ev(`document.documentElement.style.fontSize='200%'`)
  await h.sleep(500)
  const big = await h.ev(probe)
  check(
    h,
    'E2. 320px·글자 200%: 가로 스크롤·잘림·하단 탭 겹침 없음',
    big.ov <= 0 && big.bad === 0 && big.wide === 0 && big.navOverlap <= 0,
    JSON.stringify(big),
  )
  await h.ev(`window.scrollTo(0,0)`)
  await h.sleep(300)
  await h.shot('p03-320-text200.png')
})
