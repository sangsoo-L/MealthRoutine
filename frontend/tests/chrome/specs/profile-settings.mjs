// [chrome 회귀] P02 프로필과 개인정보 설정:
//   비회원 차단 · P09 → P02 진입과 "이전" · 계정 정보(닉네임·이메일) 표시와 계정 전환 시 분리 · 서버 연결 전 표시("연결 전" 항목·비활성 저장·사진 변경) ·
//   닉네임 검증(가입과 같은 규칙: 한글 포함 2~8자, 그 밖 영문·숫자 2~16자) · Enter·버튼으로 저장되지 않음 · 입력이 저장소·URL에 남지 않음 · 마이페이지·비밀번호 변경 링크 · 키보드 순서 ·
//   390/320/195/160px·320px 글자 200%·하단 탭 겹침
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only profile-settings`. 상세: tests/chrome/README.md
// 프로필 API가 없어 서버 연결 전 상태만 브라우저에서 볼 수 있다(저장 성공·서버 값 표시는 가장하지 않는다. 값 표시 상태는 profileSettings.test.mjs가 화면 단위로 확인한다).
// 개발 서버 전용 모의 계정만 쓰고 시나리오마다 새 Chrome 프로필로 시작한다.
import { start, q } from '../lib/session.mjs'
import { mustClick, mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const FORM = `!!document.querySelector('form[data-profile-form]')`
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
const openProfile = async (h) => {
  await h.go('/settings/profile', 300)
  await mustUntil(h, FORM, 100)
}
const setText = (h, sel, v) =>
  h.ev(
    `(()=>{const el=document.querySelector(${q(sel)});const set=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;el.focus();set.call(el,${q(v)});el.dispatchEvent(new Event('input',{bubbles:true}))})()`,
  )
// 칸을 벗어나는 동작. 헤드리스 Chrome은 창에 포커스가 없으면 blur()가 포커스 이벤트를 내지 않을 수 있어, 실제 blur와 함께 focusout을 직접 보낸다(React onBlur가 듣는 이벤트).
const blur = (h, sel) =>
  h.ev(
    `(()=>{const el=document.querySelector(${q(sel)});el.blur();el.dispatchEvent(new FocusEvent('focusout',{bubbles:true,relatedTarget:null}))})()`,
  )
/** 닉네임 규칙 오류 문구(가입과 같은 규칙 NAME-2, F3-D2). */
const NICKNAME_ERROR = /한글이 있으면 2~8자, 없으면 2~16자/
const alertTexts = (h) =>
  h.ev(
    `[...document.querySelectorAll('form [role=alert]')].map(e=>e.innerText.trim()).filter(Boolean)`,
  )
const rowText = (h, name) =>
  h.ev(
    `[...document.querySelectorAll('[data-profile-row]')].find(e=>e.dataset.profileRow===${q(name)})?.innerText.replace(/\\s+/g,' ').trim() ?? null`,
  )

await scenario('A-guest-blocked', async (h) => {
  await h.go('/settings/profile', 300)
  await mustUntil(h, `!!document.querySelector('main')`, 100)
  await h.sleep(300)
  check(
    h,
    'A1. 비회원이 P02 주소로 들어오면 로그인 안내를 보고 프로필·개인정보 입력·값이 없다',
    (await h.has('로그인')) &&
      !(await h.ev(FORM)) &&
      !(await h.ev(`!!document.querySelector('[data-profile-row]')`)),
  )
})

await scenario('B-settings-entry', async (h) => {
  await h.login('free')
  await h.go('/settings', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'B1. P09: 프로필·개인정보는 /settings/profile 링크(준비 중 아님)',
    (await hrefOf(h, '^프로필·개인정보')) === '/settings/profile',
  )
  await mustClick(h, '^프로필·개인정보')
  await waitPath(h, '^/settings/profile$')
  await mustUntil(h, FORM, 100)
  check(
    h,
    'B2. P02: h1 하나·문서 제목·하단 탭 마이·이전은 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h1(h)) === '프로필과 개인정보 설정' &&
      /프로필과 개인정보 설정/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `document.querySelector(${q(NAV)}+' a[aria-current=page]')?.innerText.trim()`,
      )) === '마이' &&
      (await hrefOf(h, '^이전')) === '/settings',
  )
  await h.click('^이전')
  await waitPath(h, '^/settings$')
  check(h, 'B3. "이전"은 상세 설정으로 돌아온다', true)
  await mustClick(h, '^프로필·개인정보')
  await waitPath(h, '^/settings/profile$')
  await h.ev(`history.back()`)
  await waitPath(h, '^/settings$')
  check(h, 'B4. 브라우저 뒤로 가기도 상세 설정으로 돌아온다', true)
  await mustClick(h, '^프로필·개인정보')
  await waitPath(h, '^/settings/profile$')
  await mustUntil(h, FORM, 100)
  await mustClick(h, '^취소$')
  await waitPath(h, '^/settings$')
  check(h, 'B5. 취소(진입한 화면이 설정)는 상세 설정으로 돌아온다', true)
})

await scenario('C-content-and-form', async (h) => {
  await h.login('free')
  await openProfile(h)
  check(
    h,
    'C1. 구성: 01 프로필·02 가입 개인정보·03 건강 관리 동의 제목',
    await h.has(
      '01[\\s\\S]*프로필[\\s\\S]*02[\\s\\S]*가입 개인정보[\\s\\S]*03[\\s\\S]*건강 관리 동의',
    ),
  )
  check(
    h,
    'C2. 계정 정보: 닉네임은 로그인 계정 값이고 이메일은 읽기 전용으로 보인다',
    (await h.ev(`document.querySelector('[name=profileNickname]').value`)) ===
      '일반회원' &&
      /member\.free@example\.com/.test(
        (await rowText(h, '계정 이메일')) ?? '',
      ) &&
      /읽기 전용/.test((await rowText(h, '계정 이메일')) ?? ''),
  )
  check(
    h,
    'C3. 서버 연결 전: 안내가 보이고 6개 항목이 "연결 전"이며 정보 없음·가짜 값이 없다',
    (await h.has('프로필·개인정보 기능이 아직 서버에 연결되지 않았어요')) &&
      (await h.ev(
        `document.querySelectorAll('[data-profile-status=unavailable]').length`,
      )) === 6 &&
      !(await h.ev(
        `!!document.querySelector('[data-profile-status=empty]')`,
      )) &&
      !(await h.has('010-|세 · |등록된 정보 없음')),
  )
  check(
    h,
    'C4. 저장·사진 변경은 비활성이고 저장됐다는 표현이 없다',
    (await h.ev(`document.querySelector('[data-profile-submit]').disabled`)) &&
      (await h.ev(`document.querySelector('[data-profile-photo]').disabled`)) &&
      (await h.has('서버에 연결되면 닉네임을 저장할 수 있어요')) &&
      !(await h.has('저장했어요|저장되었어요')),
  )
  check(
    h,
    'C5. 링크: 비밀번호 변경 → /password/reset, 건강 목표 → P10, 키·몸무게 → P06, 잠금 관리 → 마이페이지',
    (await hrefOf(h, '^비밀번호 변경')) === '/password/reset' &&
      (await hrefOf(h, '^건강 목표 설정')) === '/settings/health-goal' &&
      (await hrefOf(h, '^키·몸무게 입력')) === '/settings/body' &&
      (await hrefOf(h, '^신체 정보 잠금 관리')) === '/mypage',
  )
  // 닉네임 검증
  await setText(h, '[name=profileNickname]', 'a')
  await blur(h, '[name=profileNickname]')
  await mustUntil(
    h,
    `document.querySelector('form [role=alert]')?.innerText.trim() !== ''`,
    40,
  )
  check(
    h,
    'C6. 1자는 오류 안내가 뜨고 aria-invalid·aria-describedby로 연결된다',
    (await alertTexts(h)).some((t) => NICKNAME_ERROR.test(t)) &&
      (await h.ev(
        `(()=>{const i=document.querySelector('[name=profileNickname]');const id=document.querySelector('form [role=alert] p')?.id;return i.getAttribute('aria-invalid')==='true'&&!!id&&i.getAttribute('aria-describedby').split(' ').includes(id)})()`,
      )),
  )
  await setText(h, '[name=profileNickname]', '가'.repeat(9))
  check(
    h,
    'C7. 한글이 있으면 9자도 오류다(최대 8자)',
    (await alertTexts(h)).some((t) => NICKNAME_ERROR.test(t)),
  )
  await setText(h, '[name=profileNickname]', 'a'.repeat(17))
  check(
    h,
    'C7-2. 영문·숫자만이면 17자도 오류다(최대 16자)',
    (await alertTexts(h)).some((t) => NICKNAME_ERROR.test(t)),
  )
  await setText(h, '[name=profileNickname]', '  ')
  check(
    h,
    'C8. 공백만 입력해도 오류다',
    (await alertTexts(h)).some((t) => NICKNAME_ERROR.test(t)),
  )
  await setText(h, '[name=profileNickname]', '닉네임!')
  check(
    h,
    'C8-2. 기호가 들어가면 오류다',
    (await alertTexts(h)).some((t) => NICKNAME_ERROR.test(t)),
  )
  await setText(h, '[name=profileNickname]', '새닉네임')
  check(
    h,
    'C9. 규칙에 맞는 닉네임을 입력하면 오류가 사라진다',
    (await alertTexts(h)).length === 0 &&
      (await h.ev(
        `document.querySelector('[name=profileNickname]').getAttribute('aria-invalid')`,
      )) === null,
  )
  // 저장 불가: Enter·버튼 모두 저장·이동·성공 표시가 없다.
  const before = await h.path()
  await h.ev(`document.querySelector('[data-profile-submit]').click()`)
  await h.ev(`document.querySelector('[name=profileNickname]').focus()`)
  await h.press('Enter', 'Enter', 13)
  await h.sleep(500)
  check(
    h,
    'C10. 올바르게 입력해도 연결 전에는 저장되지 않는다(Enter·버튼): 이동·저장 표시가 없고 입력은 유지된다',
    (await h.path()) === before &&
      !(await h.ev(`!!document.querySelector('[data-profile-save]')`)) &&
      (await h.ev(`document.querySelector('[name=profileNickname]').value`)) ===
        '새닉네임',
  )
  // 입력이 저장소·URL에 남지 않는다.
  const dump = await h.ev(
    `JSON.stringify([Object.entries(localStorage).filter(([k])=>!k.startsWith('mealthroutine.dev.')), Object.entries(sessionStorage), history.state, location.href])`,
  )
  check(
    h,
    'C11. 작성 중인 닉네임은 URL·history state·저장소에 남지 않는다',
    !/새닉네임/.test(dump),
  )
  await h.go('/settings/profile', 300)
  await mustUntil(h, FORM, 100)
  check(
    h,
    'C12. 새로고침하면 닉네임이 계정 값으로 돌아온다(저장하지 않음)',
    (await h.ev(`document.querySelector('[name=profileNickname]').value`)) ===
      '일반회원',
  )
  // 키보드 순서
  await h.ev(`document.querySelector('[name=profileNickname]').focus()`)
  const order = []
  for (let i = 0; i < 6; i += 1) {
    await h.press('Tab', 'Tab', 9)
    order.push(
      await h.ev(
        `(document.activeElement?.innerText||document.activeElement?.tagName||'').trim().replace(/\\s+/g,' ').slice(0,16)`,
      ),
    )
  }
  check(
    h,
    'C13. 키보드 순서: 닉네임 → 비밀번호 변경 → 건강 목표 → 키·몸무게 → 잠금 관리 → 취소 → 로그아웃(비활성 저장·사진 변경은 건너뜀)',
    /^비밀번호 변경/.test(order[0]) &&
      /^건강 목표/.test(order[1]) &&
      /^키·몸무게/.test(order[2]) &&
      /^신체 정보 잠금/.test(order[3]) &&
      /^취소$/.test(order[4]) &&
      /^로그아웃$/.test(order[5]),
    JSON.stringify(order),
  )
  // 잠금 관리 링크(마이페이지)
  await mustClick(h, '신체 정보 잠금 관리')
  await waitPath(h, '^/mypage$')
  check(
    h,
    'C14. 신체 정보 잠금 관리는 마이페이지로 이동한다(이 화면은 신체 정보를 다루지 않음)',
    true,
  )
  // 계정 관리: 회원 탈퇴는 준비 중
  await openProfile(h)
  check(
    h,
    'C15. 하단 계정 관리: 로그아웃은 동작하는 버튼이고 회원 탈퇴는 준비 중이다',
    (await h.has('계정 관리')) &&
      (await h.has('회원 탈퇴[\\s\\S]*준비 중')) &&
      (await h.ev(
        `!![...document.querySelectorAll('main button')].find(b=>/^로그아웃$/.test(b.innerText.trim()))`,
      )),
  )
})

await scenario('D-account-separation', async (h) => {
  await h.login('free')
  await openProfile(h)
  await setText(h, '[name=profileNickname]', '남으면안되는값')
  check(
    h,
    'D1. 일반회원: 계정 값이 보인다',
    /member\.free@example\.com/.test((await rowText(h, '계정 이메일')) ?? ''),
  )
  await mustClick(h, '^로그아웃$')
  await waitPath(h, '^/home$')
  await h.go('/settings/profile', 300)
  await mustUntil(h, `!!document.querySelector('main')`, 100)
  await h.sleep(300)
  check(
    h,
    'D2. 로그아웃 후 주소로 들어오면 로그인 안내만 보이고 이전 사용자 정보가 없다',
    (await h.has('로그인')) &&
      !(await h.ev(FORM)) &&
      !(await h.has('member.free@example.com|일반회원|남으면안되는값')),
  )
  await h.login('full')
  await openProfile(h)
  check(
    h,
    'D3. 다른 계정(종합멤버)으로 로그인하면 그 계정 값이 보이고 이전 계정의 입력·정보가 남지 않는다',
    (await h.ev(`document.querySelector('[name=profileNickname]').value`)) ===
      '종합멤버' &&
      /member\.full@example\.com/.test(
        (await rowText(h, '계정 이메일')) ?? '',
      ) &&
      !(await h.has('member.free@example.com|일반회원|남으면안되는값')),
  )
})

await scenario('E-layout', async (h) => {
  await h.login('free')
  const probe = `(()=>{
    const W=window.innerWidth;
    const els=[...document.querySelectorAll('main a, main button, main input')];
    const bad=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).length;
    const small=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5}).map(e=>(e.innerText||e.name||e.tagName).trim().slice(0,14));
    window.scrollTo(0,document.documentElement.scrollHeight);
    const nav=document.querySelector(${q(NAV)});
    const navTop=nav?nav.getBoundingClientRect().top:Infinity;
    const last=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().height>0).reduce((m,e)=>Math.max(m,e.getBoundingClientRect().bottom),0);
    return {ov:document.documentElement.scrollWidth-W,bad,small,navOverlap:Math.round(last-navTop)}})()`
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    await openProfile(h)
    await setText(h, '[name=profileNickname]', '아주아주아주아주긴닉네임입니다')
    const r = await h.ev(probe)
    check(
      h,
      `E1. ${width}px: 가로 스크롤·잘림·44px 미만·하단 탭 겹침 없음`,
      r.ov <= 0 && r.bad === 0 && r.small.length === 0 && r.navOverlap <= 0,
      JSON.stringify(r),
    )
    if (width === 390 || width === 320) {
      await h.ev(`window.scrollTo(0,0)`)
      await h.sleep(450)
      await h.shot(`p02-${width}.png`)
    }
  }
  await h.vp(320, 844)
  await openProfile(h)
  await h.ev(`document.documentElement.style.fontSize='200%'`)
  await h.sleep(500)
  const big = await h.ev(probe)
  check(
    h,
    'E2. 320px·글자 200%: 가로 스크롤·잘림·하단 탭 겹침 없음',
    big.ov <= 0 && big.bad === 0 && big.navOverlap <= 0,
    JSON.stringify(big),
  )
  await h.ev(`window.scrollTo(0,0)`)
  await h.sleep(300)
  await h.shot('p02-320-text200.png')
})
