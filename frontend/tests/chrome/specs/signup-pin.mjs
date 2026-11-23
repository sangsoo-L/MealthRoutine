// [chrome 회귀] P05 가입 설정 모드(/signup/pin): 연결 전(체험 아님) 비활성 안내 · 가입 체험 중 입력 검증(형식·불일치) · 보기 토글 · 성공 시 다음 화면 이동과 번호 미저장 · 이전(→ A03) · 로그인 회원 안내 · 새로고침 · 키보드 · 반응형
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only signup-pin`. 상세: tests/chrome/README.md
// 가입 체험 표지는 앱이 쓰는 같은 모듈(signupExperience.ts)을 페이지 안에서 불러 시작한다(가입 폼의 인증 대체 절차를 길게 거치지 않는다).
// 실제 가입·2차 비밀번호 등록은 없다. 테스트용 번호(123456)는 어디에도 저장되지 않아야 한다.
import { start } from '../lib/session.mjs'
import { mustUntil, reloadSettled, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const PIN = '123456'
const READY = `!!document.querySelector('[data-pin-form=register]')`
const startExperience = (h) =>
  h.ev(
    `(async()=>{const m=await import('/src/signup-experience/signupExperience.ts');m.startSignupExperience();return m.isSignupExperienceActive()})()`,
  )

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

const open = async (h) => {
  await h.go('/signup/pin', 300)
  await mustUntil(h, READY, 100)
}
const fill = async (h, next, confirm) => {
  await h.setVal('input[name=pinNew]', next)
  await h.setVal('input[name=pinConfirm]', confirm)
}
const submit = (h) => h.ev(`document.querySelector('form').requestSubmit()`)
const alertText = (h) =>
  h.ev(`document.querySelector('main [role=alert]')?.innerText.trim() ?? ''`)
/** 번호가 저장소·주소·history state에 남았는지(남으면 true). */
const leaked = (h) =>
  h.ev(
    `JSON.stringify([Object.entries(localStorage),Object.entries(sessionStorage),location.href,history.state]).includes(${JSON.stringify(PIN)})`,
  )

await scenario('A-unavailable', async (h) => {
  // 가입 체험이 아니면(운영 빌드와 같은 상태) 입력은 막히고 이유를 알린다.
  await open(h)
  check(
    h,
    'A1. 제목 하나·신체 정보 보호 안내·로그인 비밀번호와 구분',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h.has('2차 비밀번호 설정')) &&
      (await h.has('로그인 비밀번호와는 별개')) &&
      (await h.has('신체 정보')),
  )
  check(
    h,
    'A2. 문서 제목·가입처럼 하단 탭 없음',
    /2차 비밀번호 설정 · 밀스루틴/.test(await h.ev(`document.title`)) &&
      (await h.ev(`!document.querySelector('nav[aria-label]')`)),
  )
  check(
    h,
    'A3. 체험이 아니면 "지금은 설정할 수 없어요"이고 입력·다음이 비활성이다',
    (await h.has('지금은 설정할 수 없어요')) &&
      (await h.ev(
        `[...document.querySelectorAll('form input')].every(i=>i.disabled)&&document.querySelector('form button[type=submit]').disabled`,
      )),
  )
  check(
    h,
    'A4. 등록 성공 표현이 없다',
    !(await h.has('등록(됐|되었|완료)|설정(됐|되었|완료)')),
  )
  check(
    h,
    'A5. 이전은 회원가입(A03)으로 이동한다',
    (await h.ev(
      `[...document.querySelectorAll('form a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
    )) === '/signup',
  )
  await h.ev(
    `[...document.querySelectorAll('form a')].find(a=>/^이전/.test(a.innerText.trim())).click()`,
  )
  await waitPath(h, '^/signup$')
  check(h, 'A6. 이전을 누르면 회원가입으로 간다', true)
})

await scenario('B-experience-flow', async (h) => {
  await h.go('/signup', 400)
  check(h, 'B0. 가입 체험 시작', (await startExperience(h)) === true)
  await open(h)
  check(
    h,
    'B1. 체험 중: 입력 두 칸이 열려 있고 "저장되지 않아요" 안내가 있다',
    (await h.ev(`[...document.querySelectorAll('form input')].length`)) === 2 &&
      (await h.ev(
        `[...document.querySelectorAll('form input')].every(i=>!i.disabled)`,
      )) &&
      (await h.has('저장되지 않아요')) &&
      !(await h.has('지금은 설정할 수 없어요')),
  )
  check(
    h,
    'B2. 입력은 마스킹·숫자 키패드·자동완성 끔·6자리 제한',
    await h.ev(
      `[...document.querySelectorAll('form input')].every(i=>i.type==='password'&&i.inputMode==='numeric'&&i.autocomplete==='off'&&i.maxLength===6)`,
    ),
  )
  // 빈 입력·형식 오류·불일치
  await submit(h)
  check(
    h,
    'B3. 빈 입력: 안내가 나오고 이동하지 않으며 포커스가 첫 칸으로 간다',
    /입력해 주세요/.test(await alertText(h)) &&
      (await h.path()) === '/signup/pin' &&
      (await h.ev(`document.activeElement?.name`)) === 'pinNew',
  )
  await fill(h, '12ab', '12ab')
  check(
    h,
    'B4. 숫자가 아닌 글자는 입력되지 않는다',
    (await h.ev(`document.querySelector('input[name=pinNew]').value`)) === '12',
  )
  await fill(h, '123', '123')
  await submit(h)
  check(
    h,
    'B5. 6자리 미만: 6자리 안내',
    /6자리/.test(await alertText(h)) && (await h.path()) === '/signup/pin',
  )
  await fill(h, PIN, '654321')
  await submit(h)
  check(
    h,
    'B6. 확인 불일치: 일치하지 않는다는 안내, 이동 없음, 확인 칸으로 포커스',
    /일치하지 않아요/.test(await alertText(h)) &&
      (await h.path()) === '/signup/pin' &&
      (await h.ev(`document.activeElement?.name`)) === 'pinConfirm',
  )
  // 보기 토글
  await fill(h, PIN, PIN)
  await h.ev(`document.querySelector('button[aria-pressed]').click()`)
  check(
    h,
    'B7. 보기 버튼은 그 칸만 보이게 하고 aria-pressed가 바뀐다',
    (await h.ev(
      `document.querySelector('input[name=pinNew]').type==='text'&&document.querySelector('input[name=pinConfirm]').type==='password'&&document.querySelector('button[aria-pressed]').getAttribute('aria-pressed')==='true'`,
    )) === true,
  )
  check(
    h,
    'B8. 입력 중에는 번호가 저장소·주소·state에 없다',
    !(await leaked(h)),
  )
  await submit(h)
  await waitPath(h, '^/onboarding/assessment$')
  check(h, 'B9. 정상 입력이면 다음 화면(이해도 확인)으로 이동한다', true)
  check(
    h,
    'B10. 이동 뒤에도 번호가 저장소·주소·history state 어디에도 없다',
    !(await leaked(h)),
  )
  check(
    h,
    'B11. 등록 완료 표현이 어디에도 없다',
    !(await h.has('2차 비밀번호.*(등록|설정)(됐|되었|완료)')),
  )
})

await scenario('C-refresh-keyboard', async (h) => {
  await h.go('/signup', 400)
  await startExperience(h)
  await open(h)
  await fill(h, PIN, PIN)
  await reloadSettled(h)
  check(
    h,
    'C1. 새로고침하면 입력은 비워지고(저장하지 않음) 화면은 같다',
    (await h.path()) === '/signup/pin' &&
      (await h.ev(
        `[...document.querySelectorAll('form input')].every(i=>i.value==='')`,
      )),
  )
  // 키보드: 입력칸에서 Tab으로 보기 버튼·다음 버튼·이전 링크까지 이동하고, Enter로 제출한다.
  await h.ev(`document.querySelector('input[name=pinNew]').focus()`)
  const order = []
  for (let i = 0; i < 6; i++) {
    await h.press('Tab', 'Tab', 9)
    order.push(
      await h.ev(
        `(()=>{const e=document.activeElement;return e?.name||e?.getAttribute('aria-label')||e?.innerText?.trim()||e?.tagName})()`,
      ),
    )
  }
  check(
    h,
    'C2. Tab으로 보기 버튼·확인 칸·다음 버튼·이전 링크가 모두 차례로 포커스를 받는다',
    [
      '2차 비밀번호 보기',
      'pinConfirm',
      '2차 비밀번호 확인 보기',
      '다음',
      '이전',
    ].every((x) => order.includes(x)),
    JSON.stringify(order),
  )
  await fill(h, PIN, PIN)
  await h.ev(`document.querySelector('input[name=pinConfirm]').focus()`)
  await h.press('Enter', 'Enter', 13)
  await waitPath(h, '^/onboarding/assessment$')
  check(h, 'C3. 확인 칸에서 Enter를 누르면 다음 화면으로 이동한다', true)
})

await scenario('D-member', async (h) => {
  await h.login('free')
  await h.go('/signup/pin', 300)
  await mustUntil(h, `!!document.querySelector('main h1')`, 100)
  check(
    h,
    'D1. 로그인한 회원은 폼 대신 P11 등록으로 안내받는다',
    (await h.has('이미 로그인한 회원이에요')) &&
      (await h.ev(`document.querySelectorAll('form input').length`)) === 0 &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].some(a=>a.getAttribute('href')==='/settings/pin/register')`,
      )),
  )
})

await scenario('E-responsive', async (h) => {
  await h.go('/signup', 400)
  await startExperience(h)
  await open(h)
  for (const [w, ht] of [
    [160, 640],
    [195, 844],
    [320, 640],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ]) {
    await h.vp(w, ht)
    await h.sleep(250)
    const m = await h.ev(
      `(()=>{const d=document.documentElement;const els=[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().width>0);return{sw:d.scrollWidth,cw:d.clientWidth,over:els.filter(e=>e.getBoundingClientRect().right>d.clientWidth+0.5||e.getBoundingClientRect().left<-0.5).length,small:[...document.querySelectorAll('form button, form a, form input')].filter(e=>e.getBoundingClientRect().height<44).length}})()`,
    )
    check(
      h,
      `E. ${w}px: 가로 스크롤·잘림 없음, 입력·버튼 높이 ≥44`,
      m.sw <= m.cw && m.over === 0 && m.small === 0,
      JSON.stringify(m),
    )
  }
})
