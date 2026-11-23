// [chrome 회귀] S02 문의 작성 · P13 내 문의:
//   비회원 접근 차단 · P09 → S02·P13 진입과 "이전" · S01·S04의 1:1 문의 진입 · S02 입력 UI(필수 오류·유형 변경 시 작성값 유지·서버 연결 전 비활성 제출 ·
//   Enter로 제출되지 않음·접수 성공 표현 없음) · P13 서버 연결 전(문의 없음과 구분)·P13 → S02 → 이전·취소 · 키보드 순서 · 390/320/195/160px·320px 글자 200%
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only inquiry-screens`. 상세: tests/chrome/README.md
// 문의 API가 없어 서버 연결 전 상태만 브라우저에서 볼 수 있다(접수 성공·문의 목록은 가장하지 않는다. 목록 상태는 inquiry.test.mjs가 화면 단위로 확인한다).
// 개발 서버 전용 모의 계정만 쓰고 시나리오마다 새 Chrome 프로필로 시작한다.
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const FORM = `!!document.querySelector('form[data-inquiry-form]')`
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
const openForm = async (h) => {
  await h.go('/support/inquiry', 300)
  await mustUntil(h, FORM, 100)
}
const name = (h) =>
  h.ev(
    `(()=>{const a=document.activeElement;return a?.getAttribute('name')||(a?.innerText||a?.tagName||'').trim().slice(0,12)})()`,
  )
const alertTexts = (h) =>
  h.ev(
    `[...document.querySelectorAll('form [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean)`,
  )
const setText = (h, sel, v) =>
  h.ev(
    `(()=>{const el=document.querySelector(${q(sel)});const proto=el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;const set=Object.getOwnPropertyDescriptor(proto,'value').set;el.focus();set.call(el,${q(v)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
// 칸을 벗어나는 동작. 헤드리스 Chrome은 창에 포커스가 없으면 blur()가 포커스 이벤트를 내지 않을 수 있어, 실제 blur와 함께 focusout을 직접 보낸다(React onBlur가 듣는 이벤트).
const blur = (h, sel) =>
  h.ev(
    `(()=>{const el=document.querySelector(${q(sel)});el.blur();el.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:null}))})()`,
  )

await scenario('A-guest-blocked', async (h) => {
  for (const [path, label] of [
    ['/support/inquiry', 'S02'],
    ['/mypage/inquiries', 'P13'],
  ]) {
    await h.go(path, 300)
    await mustUntil(h, `!!document.querySelector('main')`, 100)
    await h.sleep(300)
    check(
      h,
      `A1. 비회원이 ${label} 주소로 들어오면 로그인 안내를 보고 입력 폼·문의 목록이 없다`,
      (await h.has('로그인')) &&
        !(await h.ev(FORM)) &&
        !(await h.ev(
          `!!document.querySelector('[data-inquiry-list]:not([data-inquiry-list=loading])')`,
        )),
      path,
    )
  }
  // S01 → 1:1 문의(공개 화면의 링크, 이동하면 회원 전용이라 로그인 안내)
  await h.go('/support', 300)
  await mustUntil(
    h,
    `/공지사항/.test(document.querySelector('main h1')?.innerText ?? '')`,
    100,
  )
  check(
    h,
    'A2. S01 비회원: 1:1 문의 링크는 S02를 가리키고 키워드 챗봇만 "준비 중"이다',
    (await hrefOf(h, '^1:1 문의')) === '/support/inquiry' &&
      (await h.ev(
        `(document.querySelector('main').innerText.match(/준비 중/g)||[]).length`,
      )) === 1,
  )
  await mustClick(h, '^1:1 문의')
  await waitPath(h, '^/support/inquiry$')
  await h.sleep(300)
  check(
    h,
    'A3. 비회원이 1:1 문의를 누르면 로그인 안내가 보인다(폼 없음)',
    (await h.has('로그인')) && !(await h.ev(FORM)),
  )
})

await scenario('B-settings-entry', async (h) => {
  await h.login('free')
  await h.go('/settings', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'B1. P09: 문의 → /support/inquiry, 내 문의 → /mypage/inquiries가 링크(준비 중 아님)',
    (await hrefOf(h, '^문의')) === '/support/inquiry' &&
      (await hrefOf(h, '^내 문의')) === '/mypage/inquiries',
  )
  await mustClick(h, '^문의')
  await waitPath(h, '^/support/inquiry$')
  await mustUntil(h, FORM, 100)
  check(
    h,
    'B2. S02: h1 하나·문서 제목·하단 탭 마이·이전은 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '문의하기' &&
      /문의하기/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `document.querySelector(${q(NAV)}+' a[aria-current=page]')?.innerText.trim()`,
      )) === '마이' &&
      (await hrefOf(h, '^이전')) === '/settings',
  )
  await h.click('^이전')
  await waitPath(h, '^/settings$')
  check(h, 'B3. S02의 "이전"은 상세 설정으로 돌아온다', true)
  await mustClick(h, '^내 문의')
  await waitPath(h, '^/mypage/inquiries$')
  await mustUntil(
    h,
    `!!document.querySelector('[data-inquiry-list]:not([data-inquiry-list=loading])')`,
    100,
  )
  check(
    h,
    'B4. P13: h1 하나·문서 제목·하단 탭 마이·이전은 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '내 문의' &&
      /내 문의/.test(await h.ev(`document.title`)) &&
      (await hrefOf(h, '^이전')) === '/settings',
  )
  await h.click('^이전')
  await waitPath(h, '^/settings$')
  await mustClick(h, '^문의')
  await waitPath(h, '^/support/inquiry$')
  await h.ev(`history.back()`)
  await waitPath(h, '^/settings$')
  check(h, 'B5. 브라우저 뒤로 가기도 상세 설정으로 돌아온다', true)
})

await scenario('C-form-ui', async (h) => {
  await h.login('free')
  await openForm(h)
  check(
    h,
    'C1. 서버 연결 전: 안내가 보이고 제출은 비활성이며 접수·저장 표현이 없다',
    (await h.has('문의 접수 기능이 아직 서버에 연결되지 않았어요')) &&
      (await h.has('접수되지도 저장되지도 않아요')) &&
      (await h.ev(
        `document.querySelector('[data-inquiry-submit]').disabled`,
      )) &&
      !(await h.has('접수되었|접수가 완료|등록되었어요')),
  )
  check(
    h,
    'C2. 구성: 유형 4개(기본 기록 이용)·제목·내용 필수·답변 확인 안내·취소',
    (await h.ev(
      `[...document.querySelectorAll('input[name=inquiryType]')].map(i=>i.value+(i.checked?'*':'')).join(',')`,
    )) === 'record*,account,membership,food' &&
      (await h.ev(
        `document.querySelectorAll('form [aria-required=true]').length`,
      )) === 2 &&
      (await h.has('답변은 상세 설정의 ‘내 문의’에서 확인할 수 있어요')) &&
      (await hrefOf(h, '^취소', 'form')) === '/support' &&
      (await h.has('01[\\s\\S]*문의 유형[\\s\\S]*02[\\s\\S]*문의 내용')),
  )
  // 필수 오류: 칸을 벗어날 때
  await h.ev(`document.querySelector('[name=inquiryTitle]').focus()`)
  await blur(h, '[name=inquiryTitle]')
  await mustUntil(
    h,
    `document.querySelector('form [role=alert]')?.innerText.trim() !== ''`,
    40,
  )
  check(
    h,
    'C3. 제목을 비운 채 벗어나면 오류 안내가 뜨고 aria-invalid·aria-describedby로 연결된다',
    (await alertTexts(h)).includes('문의 제목을 입력해 주세요.') &&
      (await h.ev(
        `(()=>{const i=document.querySelector('[name=inquiryTitle]');const id=document.querySelector('form [role=alert] p')?.id;return i.getAttribute('aria-invalid')==='true'&&!!id&&i.getAttribute('aria-describedby')===id})()`,
      )),
  )
  await setText(h, '[name=inquiryTitle]', '   ')
  await blur(h, '[name=inquiryTitle]')
  check(
    h,
    'C4. 공백만 입력해도 필수 오류다',
    (await alertTexts(h)).includes('문의 제목을 입력해 주세요.'),
  )
  await setText(h, '[name=inquiryTitle]', '앱 사용 문의')
  check(
    h,
    'C5. 입력하면 오류가 곧바로 사라진다',
    !(await alertTexts(h)).includes('문의 제목을 입력해 주세요.') &&
      (await h.ev(
        `document.querySelector('[name=inquiryTitle]').getAttribute('aria-invalid')`,
      )) === null,
  )
  await h.ev(`document.querySelector('[name=inquiryBody]').focus()`)
  await blur(h, '[name=inquiryBody]')
  check(
    h,
    'C6. 내용을 비운 채 벗어나면 내용 오류 안내가 뜬다',
    (await alertTexts(h)).includes('문의 내용을 입력해 주세요.'),
  )
  await setText(
    h,
    '[name=inquiryBody]',
    '기록 수정 방법이 궁금해요.\n두 번째 줄',
  )
  // 유형 변경 시 작성값 유지
  await h.ev(
    `document.querySelector('input[name=inquiryType][value=food]').click()`,
  )
  check(
    h,
    'C7. 유형을 바꿔도 제목·내용 작성값이 유지된다',
    (await h.ev(`document.querySelector('[name=inquiryTitle]').value`)) ===
      '앱 사용 문의' &&
      (await h.ev(`document.querySelector('[name=inquiryBody]').value`)) ===
        '기록 수정 방법이 궁금해요.\n두 번째 줄' &&
      (await h.ev(
        `document.querySelector('input[name=inquiryType]:checked').value`,
      )) === 'food',
  )
  // 제출 불가: 버튼·Enter 모두 접수·이동이 없다.
  const before = await h.path()
  await h.ev(`document.querySelector('[data-inquiry-submit]').click()`)
  await h.ev(`document.querySelector('[name=inquiryTitle]').focus()`)
  await h.press('Enter', 'Enter', 13)
  await h.sleep(500)
  check(
    h,
    'C8. 입력을 모두 채워도 연결 전에는 제출되지 않는다(Enter·버튼): 이동·성공 표현·처리 중 표시가 없다',
    (await h.path()) === before &&
      !(await h.has('접수 번호|접수되었|접수 중|문의를 접수하고 있어요')) &&
      (await h.ev(
        `document.querySelector('[data-inquiry-submit]').disabled`,
      )) &&
      (await h.ev(`document.querySelector('[name=inquiryTitle]').value`)) ===
        '앱 사용 문의',
  )
  // 키보드 포커스 순서: 유형 → 제목 → 내용 → 내 문의 보기 → 취소(비활성 제출은 건너뛴다)
  await h.ev(
    `document.querySelector('input[name=inquiryType]:checked').focus()`,
  )
  const order = []
  for (let i = 0; i < 4; i += 1) {
    await h.press('Tab', 'Tab', 9)
    order.push(await name(h))
  }
  check(
    h,
    'C9. 키보드 순서: 유형 → 제목 → 내용 → 내 문의 보기 → 취소(비활성 제출 건너뜀)',
    order[0] === 'inquiryTitle' &&
      order[1] === 'inquiryBody' &&
      /내 문의 보기/.test(order[2]) &&
      /^취소$/.test(order[3]),
    JSON.stringify(order),
  )
  // 유형은 화살표 키로 고른다(라디오).
  await h.ev(
    `document.querySelector('input[name=inquiryType]:checked').focus()`,
  )
  await h.press('ArrowLeft', 'ArrowLeft', 37)
  check(
    h,
    'C10. 유형은 화살표 키로 바꾼다(라디오 그룹)',
    (await h.ev(
      `document.querySelector('input[name=inquiryType]:checked').value`,
    )) === 'membership',
  )
  check(
    h,
    'C11. 유형 선택은 fieldset·legend로 묶여 있다',
    await h.ev(
      `!!document.querySelector('fieldset legend') && document.querySelectorAll('fieldset input[type=radio]').length === 4`,
    ),
  )
  // 취소: 진입한 화면이 없으면 공지사항(S01)
  await mustClick(h, '^취소$', 'form')
  await waitPath(h, '^/support$')
  check(h, 'C12. 취소(직접 진입)는 공지사항(S01)으로 돌아간다', true)
})

await scenario('D-history-and-links', async (h) => {
  await h.login('free')
  await h.go('/mypage/inquiries', 300)
  await mustUntil(
    h,
    `!!document.querySelector('[data-inquiry-list]:not([data-inquiry-list=loading])')`,
    100,
  )
  check(
    h,
    'D1. P13 서버 연결 전: "아직 볼 수 없어요"이고 문의 없음이 아니며 문의 항목이 없다',
    (await h.has('문의 내역을 아직 볼 수 없어요')) &&
      (await h.has('문의가 없다는 뜻이 아니에요')) &&
      !(await h.has('아직 남긴 문의가 없어요|첫 문의 남기기')) &&
      (await h.ev(
        `document.querySelectorAll('[data-inquiry-item]').length`,
      )) === 0 &&
      (await h.ev(
        `document.querySelector('[data-inquiry-list]').dataset.inquiryList`,
      )) === 'unavailable',
  )
  check(
    h,
    'D2. P13: 문의하기 버튼이 S02를 가리킨다',
    (await hrefOf(h, '^문의하기$')) === '/support/inquiry',
  )
  await mustClick(h, '^문의하기$')
  await waitPath(h, '^/support/inquiry$')
  await mustUntil(h, FORM, 100)
  check(
    h,
    'D3. P13에서 온 S02: 이전·취소가 내 문의(P13)를 가리킨다',
    (await hrefOf(h, '^이전')) === '/mypage/inquiries' &&
      (await hrefOf(h, '^취소', 'form')) === '/mypage/inquiries',
  )
  await mustClick(h, '^취소$', 'form')
  await waitPath(h, '^/mypage/inquiries$')
  // 주소가 바뀐 직후에는 이전 화면(S02)이 아직 남아 있을 수 있다. P13 목록이 그려진 뒤에 누른다.
  await mustUntil(
    h,
    `!!document.querySelector('[data-inquiry-list]:not([data-inquiry-list=loading])')`,
    100,
  )
  check(h, 'D4. 취소하면 P13으로 돌아온다', true)
  await mustClick(h, '^문의하기$')
  await waitPath(h, '^/support/inquiry$')
  // 같은 이유로 S02 양식이 그려진 뒤에 "이전"을 누른다. 그렇지 않으면 아직 남은 P13의 "이전"(→ P01)을 눌러 버린다.
  await mustUntil(h, FORM, 100)
  await h.click('^이전')
  await waitPath(h, '^/mypage/inquiries$')
  check(h, 'D5. 이전을 누르면 P13으로 돌아온다', true)
  // S02의 "내 문의 보기" → P13
  await mustClick(h, '^문의하기$')
  await waitPath(h, '^/support/inquiry$')
  await mustUntil(h, FORM, 100)
  await mustClick(h, '내 문의 보기', 'form')
  await waitPath(h, '^/mypage/inquiries$')
  check(h, 'D6. S02의 "내 문의 보기"가 P13으로 이동한다', true)
  // 저장소·URL에 문의 내용이 남지 않는다.
  await h.go('/support/inquiry', 300)
  await mustUntil(h, FORM, 100)
  await setText(h, '[name=inquiryTitle]', '남지 않아야 하는 제목')
  await setText(h, '[name=inquiryBody]', '남지 않아야 하는 내용')
  const dump = await h.ev(
    `JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), history.state, location.href])`,
  )
  check(
    h,
    'D7. 작성 중인 문의는 URL·history state·저장소에 남지 않는다',
    !/남지 않아야 하는/.test(dump),
  )
  await h.go('/support/inquiry', 300)
  await mustUntil(h, FORM, 100)
  check(
    h,
    'D8. 새로고침하면 작성값은 비워진다(저장하지 않음)',
    (await h.ev(`document.querySelector('[name=inquiryTitle]').value`)) === '',
  )
})

await scenario('E-support-entries', async (h) => {
  await h.login('free')
  await h.go('/support', 300)
  await mustUntil(
    h,
    `/공지사항/.test(document.querySelector('main h1')?.innerText ?? '')`,
    100,
  )
  await mustClick(h, '^1:1 문의')
  await waitPath(h, '^/support/inquiry$')
  await mustUntil(h, FORM, 100)
  check(
    h,
    'E1. S01 → S02: 이전·취소가 S01을 가리키고 취소하면 S01로 돌아온다',
    (await hrefOf(h, '^이전')) === '/support' &&
      (await hrefOf(h, '^취소', 'form')) === '/support',
  )
  await mustClick(h, '^취소$', 'form')
  await waitPath(h, '^/support$')
  await h.go('/support/faq', 300)
  await mustUntil(
    h,
    `/자주 묻는 질문/.test(document.querySelector('main h1')?.innerText ?? '')`,
    100,
  )
  check(
    h,
    'E2. S04: 1:1 문의는 S02 링크이고 키워드 챗봇만 준비 중이다',
    (await hrefOf(h, '^1:1 문의')) === '/support/inquiry' &&
      (await h.ev(
        `(document.querySelector('main').innerText.match(/준비 중/g)||[]).length`,
      )) === 1,
  )
  await mustClick(h, '^1:1 문의')
  await waitPath(h, '^/support/inquiry$')
  await mustUntil(h, FORM, 100)
  check(
    h,
    'E3. S04 → S02: 이전이 FAQ를 가리킨다',
    (await hrefOf(h, '^이전')) === '/support/faq',
  )
  await h.click('^이전')
  await waitPath(h, '^/support/faq$')
  check(h, 'E4. 이전을 누르면 FAQ로 돌아온다', true)
})

await scenario('F-layout', async (h) => {
  await h.login('free')
  const probe = `(()=>{
    const W=window.innerWidth;
    const els=[...document.querySelectorAll('main a, main button, main input:not(.sr-only), main textarea, main summary')];
    const bad=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).length;
    const small=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5}).map(e=>(e.innerText||e.name||e.tagName).trim().slice(0,14));
    const labels=[...document.querySelectorAll('label span.flex')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5||r.height<43.5)}).length;
    window.scrollTo(0,document.documentElement.scrollHeight);
    const nav=document.querySelector(${q(NAV)});
    const navTop=nav?nav.getBoundingClientRect().top:Infinity;
    const last=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().height>0).reduce((m,e)=>Math.max(m,e.getBoundingClientRect().bottom),0);
    return {ov:document.documentElement.scrollWidth-W,bad,small,labels,navOverlap:Math.round(last-navTop)}})()`
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    await h.go('/support/inquiry', 300)
    await mustUntil(h, FORM, 100)
    await setText(
      h,
      '[name=inquiryTitle]',
      '아주아주아주아주아주아주아주아주긴제목'.repeat(2),
    )
    await setText(h, '[name=inquiryBody]', '내용 '.repeat(60))
    await blur(h, '[name=inquiryTitle]')
    const s02 = await h.ev(probe)
    check(
      h,
      `F1. ${width}px S02: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      s02.ov <= 0 &&
        s02.bad === 0 &&
        s02.small.length === 0 &&
        s02.labels === 0 &&
        s02.navOverlap <= 0,
      JSON.stringify(s02),
    )
    if (width === 390 || width === 320) {
      await h.ev(`window.scrollTo(0,0)`)
      await h.sleep(450)
      await h.shot(`s02-${width}.png`)
    }
    await h.go('/mypage/inquiries', 300)
    await mustUntil(
      h,
      `!!document.querySelector('[data-inquiry-list]:not([data-inquiry-list=loading])')`,
      100,
    )
    await h.sleep(450)
    const p13 = await h.ev(probe)
    check(
      h,
      `F2. ${width}px P13: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      p13.ov <= 0 &&
        p13.bad === 0 &&
        p13.small.length === 0 &&
        p13.navOverlap <= 0,
      JSON.stringify(p13),
    )
    if (width === 390 || width === 320) await h.shot(`p13-${width}.png`)
  }
  // 320px 글자 200%
  await h.vp(320, 844)
  for (const [path, ready, file] of [
    ['/support/inquiry', FORM, 's02-320-text200.png'],
    [
      '/mypage/inquiries',
      `!!document.querySelector('[data-inquiry-list]:not([data-inquiry-list=loading])')`,
      'p13-320-text200.png',
    ],
  ]) {
    await h.go(path, 300)
    await mustUntil(h, ready, 100)
    await h.ev(`document.documentElement.style.fontSize='200%'`)
    await h.sleep(500)
    const big = await h.ev(probe)
    check(
      h,
      `F3. 320px·글자 200% ${path}: 가로 스크롤·잘림·하단 탭 겹침 없음`,
      big.ov <= 0 && big.bad === 0 && big.labels === 0 && big.navOverlap <= 0,
      JSON.stringify(big),
    )
    await h.ev(`window.scrollTo(0,0)`)
    await h.sleep(300)
    await h.shot(file)
    await h.ev(`document.documentElement.style.fontSize=''`)
  }
})
