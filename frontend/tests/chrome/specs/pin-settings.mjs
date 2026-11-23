// [chrome 회귀] P11 2차 비밀번호 등록 · P12 변경: P09 메뉴 이동 · 입력 검증·보기 토글·포커스 · 등록·변경 성공(개발용 저장소) · 잘못된 현재 번호 ·
// 목표 화면(D01-4)과 공유하는 PIN·실패 횟수·잠금 · 직접 접근·새로고침·뒤로 가기·비회원 · 연결 전·조회/저장 실패 · 390/320/195/160px 레이아웃
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only pin-settings`. 상세: tests/chrome/README.md
// 개발 서버 전용 모의 계정과 개발용 PIN 저장소(브라우저 프로필 안)만 쓰고, 시나리오마다 새 Chrome 프로필로 시작해 실제 계정·PIN을 건드리지 않는다.
// 쓰는 번호는 테스트용이다. 운영 빌드에는 개발용 PIN 저장소가 없어 이 스크립트를 쓸 수 없다(운영 번들 분리는 verify:dist와 Node 테스트가 확인한다).
import { start } from '../lib/session.mjs'
import { mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const FORM = `!!document.querySelector('form[data-pin-form]')`
const OLD = '135790'
const NEW = '246801'

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

const val = (h, name) =>
  h.ev(`document.querySelector('[name=${name}]')?.value ?? null`)
const alertText = (h) =>
  h.ev(`document.querySelector('form [role=alert]')?.innerText.trim() ?? ''`)
const active = (h) =>
  h.ev(
    `document.activeElement?.getAttribute('name') ?? document.activeElement?.tagName`,
  )
const submit = (h) =>
  h.ev(`document.querySelector('form[data-pin-form]').requestSubmit()`)
const fill = async (h, values) => {
  for (const [name, value] of Object.entries(values))
    await h.setVal(`[name=${name}]`, value)
}
const openPin = async (h, mode) => {
  await h.go(`/settings/pin/${mode}`, 300)
  await mustUntil(h, FORM, 80)
}
const done = (mode) => `!!document.querySelector('[data-pin-done=${mode}]')`
const registerPin = async (h, pin = OLD) => {
  await openPin(h, 'register')
  await fill(h, { pinNew: pin, pinConfirm: pin })
  await submit(h)
  await mustUntil(h, done('register'), 120)
}
const changePin = async (h, current, next) => {
  await fill(h, { pinCurrent: current, pinNew: next, pinConfirm: next })
  await submit(h)
}
const waitAlert = (h, re) =>
  mustUntil(
    h,
    `new RegExp(${JSON.stringify(re)}).test(document.querySelector('form [role=alert]')?.innerText ?? '')`,
    120,
  )
const goalForm = `document.querySelector('#goal-pin')`
const goalSubmit = async (h, pin) => {
  await h.setVal('#goal-pin', pin)
  await h.ev(`${goalForm}.closest('form').requestSubmit()`)
}
const openGoal = async (h) => {
  await h.go('/records/meal/goal', 300)
  await mustUntil(h, `!!${goalForm}`, 80)
}
const rowHref = (h) =>
  h.ev(
    `(()=>{const li=[...document.querySelectorAll('main li')].find(l=>/^2차 비밀번호/.test(l.innerText.trim()));return {text:li?.innerText.replace(/\\s+/g,' ').trim()??null, href:li?.querySelector('a')?.getAttribute('href')??null, button:!!li?.querySelector('button')}})()`,
  )
const settingsRowReady = (h) =>
  mustUntil(
    h,
    `(()=>{const li=[...document.querySelectorAll('main li')].find(l=>/^2차 비밀번호/.test(l.innerText.trim()));return !!li&&!/확인 중/.test(li.innerText)})()`,
    120,
  )
const storageDump = (h) =>
  h.ev(
    `JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage), history.state, location.href])`,
  )

await scenario('A-menu-navigation', async (h) => {
  await h.login('free')
  await h.go('/settings', 300)
  await settingsRowReady(h)
  const row = await rowHref(h)
  check(
    h,
    'A1. P09: 미등록이면 이름은 "2차 비밀번호"이고 P11로 연결되며 상태 칩이 보인다',
    row.href === '/settings/pin/register' && /미등록/.test(row.text),
    JSON.stringify(row),
  )
  check(
    h,
    'A2. P09: 새 카테고리 없이 기존 그룹 그대로(2차 비밀번호는 계정 · 설정 안)',
    (await h.has('계정 · 설정[\\s\\S]*2차 비밀번호[\\s\\S]*멤버십 · 결제')) &&
      (await h.ev(
        `[...document.querySelectorAll('main section h2')].map(h=>h.innerText.trim()).slice(0,4).join('|')`,
      )) === '나의 활동|계정 · 설정|멤버십 · 결제|고객지원' &&
      !(await h.ev(
        `[...document.querySelectorAll('main section h2')].some(h=>/비밀번호|보안/.test(h.innerText))`,
      )),
  )
  await h.ev(
    `document.querySelector('main a[href="/settings/pin/register"]').click()`,
  )
  await waitPath(h, '^/settings/pin/register$')
  await mustUntil(h, FORM, 80)
  check(
    h,
    'A3. P11: 제목 h1 하나·문서 제목·이전 링크는 상세 설정',
    (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      /2차 비밀번호 등록/.test(
        await h.ev(`document.querySelector('main h1').innerText`),
      ) &&
      /2차 비밀번호 등록 · 밀스루틴/.test(await h.ev(`document.title`)) &&
      (await h.ev(
        `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim()))?.getAttribute('href')`,
      )) === '/settings',
  )
  await h.click('^취소$')
  await waitPath(h, '^/settings$')
  check(h, 'A4. P11 취소 → P09', true)
  await settingsRowReady(h)
  await h.ev(
    `document.querySelector('main a[href="/settings/pin/register"]').click()`,
  )
  await waitPath(h, '^/settings/pin/register$')
  await h.click('^이전')
  await waitPath(h, '^/settings$')
  check(h, 'A5. P11 이전 → P09', true)
  await settingsRowReady(h)
  await h.ev(
    `document.querySelector('main a[href="/settings/pin/register"]').click()`,
  )
  await waitPath(h, '^/settings/pin/register$')
  await h.ev(`history.back()`)
  await waitPath(h, '^/settings$')
  check(h, 'A6. 브라우저 뒤로 가기 → P09', true)
})

await scenario('B-register-validation', async (h) => {
  await h.login('free')
  await openPin(h, 'register')
  check(
    h,
    'B1. 두 칸 모두 마스킹·숫자 키패드·자동완성 끔, 눈 토글은 접힘 상태',
    (await h.ev(
      `(()=>{const i=[...document.querySelectorAll('form input')];return i.length===2&&i.every(e=>e.type==='password'&&e.inputMode==='numeric'&&e.autocomplete==='off'&&e.maxLength===6)})()`,
    )) &&
      (await h.ev(
        `[...document.querySelectorAll('form button[aria-pressed]')].every(b=>b.getAttribute('aria-pressed')==='false')`,
      )),
  )
  await submit(h)
  await mustUntil(h, `!!document.querySelector('form [role=alert]')`, 40)
  check(
    h,
    'B2. 빈 입력: 안내·aria-invalid·aria-describedby·해당 칸 포커스',
    /새 2차 비밀번호를 입력해 주세요/.test(await alertText(h)) &&
      (await active(h)) === 'pinNew' &&
      (await h.ev(
        `(()=>{const i=document.querySelector('[name=pinNew]');const id=document.querySelector('form [role=alert]').id;return i.getAttribute('aria-invalid')==='true'&&i.getAttribute('aria-describedby').split(' ').includes(id)})()`,
      )),
  )
  await h.setVal('[name=pinNew]', 'ab12cd')
  check(
    h,
    'B3. 숫자가 아닌 글자는 걸러지고 입력을 고치면 오류 안내가 거둬진다',
    (await val(h, 'pinNew')) === '12' && (await alertText(h)) === '',
  )
  await fill(h, { pinNew: '12', pinConfirm: '12' })
  await submit(h)
  await mustUntil(h, `!!document.querySelector('form [role=alert]')`, 40)
  check(
    h,
    'B4. 6자리 미만: 숫자 6자리 안내',
    /숫자 6자리로 입력해 주세요/.test(await alertText(h)) &&
      (await active(h)) === 'pinNew',
  )
  await h.setVal('[name=pinNew]', '12-34 56789')
  check(
    h,
    'B5. 붙여넣기도 숫자만 남기고 6자리에서 끊는다',
    (await val(h, 'pinNew')) === '123456',
  )
  await fill(h, { pinNew: OLD, pinConfirm: NEW })
  await submit(h)
  await mustUntil(h, `!!document.querySelector('form [role=alert]')`, 40)
  check(
    h,
    'B6. 확인 불일치: 안내와 확인 칸 포커스, 저장 안 됨',
    /확인이 일치하지 않아요/.test(await alertText(h)) &&
      (await active(h)) === 'pinConfirm' &&
      !(await h.ev(done('register'))),
  )
  await h.ev(
    `document.querySelector('button[aria-label="새 2차 비밀번호 보기"]').click()`,
  )
  check(
    h,
    'B7. 눈 토글: 해당 칸만 보이고 aria-pressed가 켜진다',
    (await h.ev(`document.querySelector('[name=pinNew]').type`)) === 'text' &&
      (await h.ev(`document.querySelector('[name=pinConfirm]').type`)) ===
        'password' &&
      (await h.ev(
        `document.querySelector('button[aria-label="새 2차 비밀번호 보기"]').getAttribute('aria-pressed')`,
      )) === 'true',
  )
  await h.ev(
    `document.querySelector('button[aria-label="새 2차 비밀번호 보기"]').click()`,
  )
  check(
    h,
    'B8. 눈 토글을 다시 누르면 가려진다',
    (await h.ev(`document.querySelector('[name=pinNew]').type`)) === 'password',
  )
  check(
    h,
    'B9. 검증 실패로는 저장소에 아무것도 쓰지 않는다',
    !(await storageDump(h)).includes('exercise-goal.pin'),
  )
})

await scenario('C-register-success', async (h) => {
  await h.login('free')
  await openPin(h, 'register')
  await fill(h, { pinNew: OLD, pinConfirm: OLD })
  await h.ev(`document.querySelector('[name=pinConfirm]').focus()`)
  await h.press('Enter', 'Enter', 13)
  await mustUntil(h, done('register'), 120)
  check(
    h,
    'C1. Enter로 제출하면 등록 완료 화면이 나온다(h1 하나, 포커스 이동)',
    (await h.has('2차 비밀번호를 등록했어요')) &&
      (await h.has('키·몸무게·BMI는 계속 가려져 있어요')) &&
      (await h.ev(`document.querySelectorAll('main h1').length`)) === 1 &&
      (await h.ev(`document.activeElement?.tagName`)) === 'H1',
  )
  const dump = await storageDump(h)
  check(
    h,
    'C2. 번호가 URL·history state·저장소에 평문으로 남지 않고 PIN 자격은 해시로만 저장된다',
    !dump.includes(OLD) && dump.includes('exercise-goal.pin'),
    dump.slice(0, 200),
  )
  check(
    h,
    'C3. 완료 화면의 이동: 상세 설정·마이페이지 링크',
    (await h.ev(
      `[...document.querySelectorAll('[data-pin-done] a')].map(a=>a.getAttribute('href')).join()`,
    )) === '/settings,/mypage',
  )
  await h.click('^상세 설정으로$')
  await waitPath(h, '^/settings$')
  await settingsRowReady(h)
  const row = await rowHref(h)
  check(
    h,
    'C4. P09: 등록됨이면 P12로 연결되고 상태 칩이 바뀐다',
    row.href === '/settings/pin/change' && /등록됨/.test(row.text),
    JSON.stringify(row),
  )
  await h.go('/settings/pin/register', 300)
  await mustUntil(
    h,
    `/이미 등록되어 있어요/.test(document.querySelector('main')?.innerText ?? '')`,
    80,
  )
  check(
    h,
    'C5. 등록된 회원이 P11에 직접 접근하면 폼이 막히고 P12 안내가 나온다',
    (await h.ev(`document.querySelectorAll('input').length`)) === 0 &&
      (await h.ev(
        `!!document.querySelector('main a[href="/settings/pin/change"]')`,
      )),
  )
  await openGoal(h)
  await mustUntil(
    h,
    `/신체 정보 확인/.test(document.querySelector('main')?.innerText ?? '')`,
    80,
  )
  check(
    h,
    'C6. D01-4 목표 화면이 같은 등록 상태를 읽는다(등록 폼이 아니라, 열람은 다시 확인을 요구하는 확인 폼)',
    !(await h.has('비밀번호 등록하기')) && (await h.has('2차 비밀번호')),
  )
})

await scenario('D-change', async (h) => {
  await h.login('free')
  await registerPin(h)
  await openPin(h, 'change')
  check(
    h,
    'D1. P12: 세 칸·분실 준비 중 안내·문의 링크 없음',
    (await h.ev(`document.querySelectorAll('form input').length`)) === 3 &&
      (await h.has(
        '2차 비밀번호를 잊으셨나요\\? 재설정 기능은 준비 중이에요',
      )) &&
      !(await h.ev(
        `[...document.querySelectorAll('main a')].some(a=>!['/settings'].includes(a.getAttribute('href')))`,
      )),
  )
  await changePin(h, '000000', NEW)
  await waitAlert(h, '일치하지 않아요')
  check(
    h,
    'D2. 현재 번호가 틀리면 (1/5) 안내·현재 칸만 비움·현재 칸 포커스',
    /\(1\/5\)/.test(await alertText(h)) &&
      (await val(h, 'pinCurrent')) === '' &&
      (await val(h, 'pinNew')) === NEW &&
      (await val(h, 'pinConfirm')) === NEW &&
      (await active(h)) === 'pinCurrent',
  )
  await changePin(h, OLD, OLD)
  await mustUntil(
    h,
    `/현재와 다른 새 비밀번호/.test(document.querySelector('form [role=alert]')?.innerText ?? '')`,
    80,
  )
  check(
    h,
    'D3. 현재와 같은 새 번호는 거부되고 실패 횟수에 들어가지 않는다',
    (await active(h)) === 'pinNew',
  )
  await changePin(h, '000000', NEW)
  await waitAlert(h, '\\(2\\/5\\)')
  check(h, 'D4. 다음 오답은 (2/5) — 같은 번호 입력은 횟수에서 제외됐다', true)
  await changePin(h, OLD, NEW)
  await mustUntil(h, done('change'), 120)
  check(
    h,
    'D5. 현재 번호 확인 뒤 변경되면 완료 화면이 나온다',
    (await h.has('2차 비밀번호를 변경했어요')) &&
      !(await storageDump(h)).includes(NEW),
  )
  await openGoal(h)
  await goalSubmit(h, OLD)
  await mustUntil(h, `!!document.querySelector('#goal-pin-error')`, 120)
  check(
    h,
    'D6. 변경 직후 이전 번호는 D01-4에서 거부된다',
    /일치하지 않아요/.test(
      await h.ev(`document.querySelector('#goal-pin-error').innerText`),
    ),
  )
  await goalSubmit(h, NEW)
  await mustUntil(h, `!${goalForm}`, 120)
  check(h, 'D7. 변경 직후 새 번호는 D01-4에서 통과한다', true)
})

await scenario('E-shared-lock', async (h) => {
  await h.login('free')
  await registerPin(h)
  await openPin(h, 'change')
  for (const n of [1, 2, 3]) {
    await changePin(h, '000000', NEW)
    await waitAlert(h, `\\(${n}\\/5\\)`)
  }
  check(h, 'E1. P12에서 3번 틀리면 (3/5)까지 안내된다', true)
  await openGoal(h)
  await goalSubmit(h, '000000')
  await mustUntil(
    h,
    `/일치하지 않아요/.test(document.querySelector('#goal-pin-error')?.innerText ?? '')`,
    120,
  )
  await goalSubmit(h, '000000')
  await mustUntil(
    h,
    `/5분 동안 제한/.test(document.querySelector('#goal-pin-error')?.innerText ?? '')`,
    120,
  )
  check(
    h,
    'E2. P12에서 쌓인 횟수가 D01-4에 이어져 5번째 실패에서 5분 잠금이 된다',
    true,
  )
  await openPin(h, 'change')
  await mustUntil(
    h,
    `/5회 일치하지 않아/.test(document.querySelector('form [role=alert]')?.innerText ?? '')`,
    80,
  )
  check(
    h,
    'E3. 잠금 중 P12는 안내가 보이고 저장 버튼이 비활성이다(맞는 번호로도 우회 불가)',
    (await h.ev(
      `document.querySelector('form button[type=submit]').disabled`,
    )) &&
      (await h.ev(
        `document.querySelector('[name=pinCurrent]').getAttribute('aria-invalid')`,
      )) === 'true',
  )
  await changePin(h, OLD, NEW)
  check(
    h,
    'E4. 잠금 중 제출을 시도해도 완료되지 않고 잠금 안내가 유지된다',
    !(await h.ev(done('change'))) &&
      /5회 일치하지 않아/.test(await alertText(h)),
  )
  await h.go('/settings', 300)
  await settingsRowReady(h)
  check(
    h,
    'E5. 잠겨도 P09 상태는 등록됨이다(PIN이 지워지지 않는다)',
    /등록됨/.test((await rowHref(h)).text),
  )
})

await scenario('F-access', async (h) => {
  await h.go('/settings/pin/register', 600)
  await mustUntil(
    h,
    `/로그인/.test(document.querySelector('main')?.innerText ?? '')`,
    80,
  )
  check(
    h,
    'F1. 비회원: 로그인 안내만 보이고 입력칸이 없다',
    (await h.ev(`document.querySelectorAll('input').length`)) === 0 &&
      !(await h.ev(done('register'))),
  )
  await h.login('free')
  await openPin(h, 'change')
  check(
    h,
    'F2. 미등록 회원이 P12에 직접 접근하면 등록 링크가 있고 폼은 비활성이다',
    (await h.has('먼저 2차 비밀번호를 등록해 주세요')) &&
      (await h.ev(
        `document.querySelector('form button[type=submit]').disabled`,
      )) &&
      (await h.ev(
        `[...document.querySelectorAll('form input')].every(i=>i.disabled)`,
      )) &&
      (await h.ev(
        `!!document.querySelector('main a[href="/settings/pin/register"]')`,
      )),
  )
  await h.click('2차 비밀번호 등록')
  await waitPath(h, '^/settings/pin/register$')
  await mustUntil(h, FORM, 80)
  await h.setVal('[name=pinNew]', OLD)
  await h.ev(`location.reload()`)
  await mustUntil(h, FORM, 120)
  check(
    h,
    'F3. 새로고침하면 같은 화면이 다시 열리고 입력한 번호는 남지 않는다',
    (await h.path()) === '/settings/pin/register' &&
      (await val(h, 'pinNew')) === '',
  )
})

await scenario('G-unavailable-and-failures', async (h) => {
  await h.login('free')
  await h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.unavailable','exerciseGoal')`,
  )
  await h.go('/settings', 300)
  await settingsRowReady(h)
  const row = await rowHref(h)
  check(
    h,
    'G1. 연결 전: P09 행은 "연결 전" 칩이고 어디로도 이동하지 않는다',
    /연결 전/.test(row.text) && row.href === null && !row.button,
    JSON.stringify(row),
  )
  for (const mode of ['register', 'change']) {
    await h.go(`/settings/pin/${mode}`, 300)
    await mustUntil(
      h,
      `/연결이 준비되면/.test(document.querySelector('main')?.innerText ?? '')`,
      80,
    )
    check(
      h,
      `G2. 연결 전 ${mode}: 안내·비활성 폼·완료 화면 없음`,
      (await h.ev(
        `document.querySelector('form button[type=submit]').disabled`,
      )) &&
        (await h.ev(
          `[...document.querySelectorAll('form input')].every(i=>i.disabled)`,
        )) &&
        !(await h.ev(`!!document.querySelector('[data-pin-done]')`)),
    )
  }
  await h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exerciseGoal');localStorage.removeItem('mealthroutine.dev.mock.flag.unavailable')`,
  )
  await h.go('/settings', 300)
  await mustUntil(
    h,
    `[...document.querySelectorAll('main li button')].some(b=>/다시 확인/.test(b.innerText))`,
    100,
  )
  check(
    h,
    'G3. 등록 여부 조회 실패: P09는 다시 확인 버튼을 보이고 P11·P12로 보내지 않는다',
    !(await h.ev(`!!document.querySelector('main a[href^="/settings/pin"]')`)),
  )
  await h.ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
  await h.click('다시 확인')
  await mustUntil(
    h,
    `!!document.querySelector('main a[href="/settings/pin/register"]')`,
    100,
  )
  check(h, 'G4. 다시 확인하면 조회가 복구되어 P11로 연결된다', true)
  await h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.failLoad','exerciseGoal')`,
  )
  await h.go('/settings/pin/register', 300)
  await mustUntil(
    h,
    `/확인하지 못했어요/.test(document.querySelector('main')?.innerText ?? '')`,
    80,
  )
  check(
    h,
    'G5. P11 조회 실패: 폼을 열지 않고(미등록으로 보지 않고) 다시 확인만 제공한다',
    (await h.ev(`document.querySelectorAll('form,input').length`)) === 0,
  )
  await h.ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failLoad')`)
  await h.click('다시 확인하기')
  await mustUntil(h, FORM, 80)
  check(h, 'G6. 다시 확인하면 폼이 열린다', true)
  await fill(h, { pinNew: OLD, pinConfirm: OLD })
  await h.ev(
    `localStorage.setItem('mealthroutine.dev.mock.flag.failSave','exerciseGoal')`,
  )
  await submit(h)
  await waitAlert(h, '저장하지 못했어요')
  check(
    h,
    'G7. 저장 실패 시 완료 화면이 나오지 않고 입력이 유지된다',
    !(await h.ev(done('register'))) && (await val(h, 'pinNew')) === OLD,
  )
  await h.ev(`localStorage.removeItem('mealthroutine.dev.mock.flag.failSave')`)
  await submit(h)
  await mustUntil(h, done('register'), 120)
  check(h, 'G8. 실패 원인이 사라진 뒤 다시 제출하면 한 번만 등록된다', true)
})

await scenario('I-logout-account-switch', async (h) => {
  const repoExpr = (id) =>
    `(await import('/src/exercise-goal/exerciseGoalSource.ts')).createExerciseGoalRepository('${id}')`
  await h.login('free')
  await registerPin(h)
  await h.go('/settings', 300)
  await settingsRowReady(h)
  // 앱과 같은 모듈로 개발용 열람 권한을 하나 발급받아 둔다(메모리에만 있는 권한).
  const granted = await h.ev(`(async()=>{
    const repo = ${repoExpr('free')}
    window.__access = await repo.unlock('${OLD}')
    return (await repo.getProfile(window.__access)) === null
  })()`)
  check(h, 'I1. 로그아웃 전에는 발급된 열람 권한이 유효하다', granted === true)
  await h.click('^로그아웃$')
  await waitPath(h, '^/home$')
  const afterLogout = await h.ev(`(async()=>{
    const repo = ${repoExpr('free')}
    try { await repo.getProfile(window.__access); return 'still-valid' }
    catch (e) { return e.code }
  })()`)
  check(
    h,
    'I2. 로그아웃하면 개발용 열람 권한이 무효가 된다(expired)',
    afterLogout === 'expired',
    String(afterLogout),
  )
  await h.login('full')
  await h.go('/settings', 300)
  await settingsRowReady(h)
  const other = await rowHref(h)
  check(
    h,
    'I3. 다른 계정은 다른 계정의 PIN을 보지 못한다(미등록)',
    other.href === '/settings/pin/register' && /미등록/.test(other.text),
    JSON.stringify(other),
  )
  await h.click('^로그아웃$')
  await waitPath(h, '^/home$')
  await h.login('free')
  await h.go('/settings', 300)
  await settingsRowReady(h)
  const back = await rowHref(h)
  check(
    h,
    'I4. 로그아웃해도 등록된 PIN은 남아 있다(다시 로그인하면 등록됨)',
    back.href === '/settings/pin/change' && /등록됨/.test(back.text),
    JSON.stringify(back),
  )
  const still = await h.ev(`(async()=>{
    const repo = ${repoExpr('free')}
    return Boolean((await repo.unlock('${OLD}')).token)
  })()`)
  check(h, 'I5. 다시 로그인한 뒤 기존 PIN으로 확인된다', still === true)
})

await scenario('H-layout', async (h) => {
  await h.login('free')
  await registerPin(h)
  const probe = `(()=>{const W=window.innerWidth;
    const els=[...document.querySelectorAll('main input, main button, main a')];
    const name=(e)=>(e.getAttribute('aria-label')||e.innerText||e.name||e.tagName).trim().slice(0,18);
    const bad=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>W+0.5||r.left<-0.5)}).map(name);
    const small=els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height<43.5}).map(name);
    const eye=[...document.querySelectorAll('main button[aria-pressed]')].filter(b=>{const i=b.closest('div.relative')?.querySelector('input');if(!i)return false;const a=b.getBoundingClientRect(),c=i.getBoundingClientRect();return a.right>c.right+0.5||a.left<c.left-0.5||a.top<c.top-0.5||a.bottom>c.bottom+0.5}).length;
    return {ov:document.documentElement.scrollWidth-W,bad,small,eye}})()`
  for (const width of [390, 320, 195, 160]) {
    await h.vp(width, 844)
    for (const mode of ['register', 'change']) {
      await h.go(`/settings/pin/${mode}`, 300)
      await mustUntil(h, `!!document.querySelector('main h1')`, 80)
      // 등록된 상태라 register는 "이미 등록" 안내, change는 폼이 열린다.
      const r = await h.ev(probe)
      check(
        h,
        `H1. ${width}px ${mode}: 가로 스크롤·잘림·44px 미만 없음`,
        r.ov <= 0 && r.bad.length === 0 && r.small.length === 0 && r.eye === 0,
        JSON.stringify(r),
      )
      await h.shot(`pin-${mode}-${width}.png`)
    }
    await h.go('/settings', 300)
    await settingsRowReady(h)
    const s = await h.ev(probe)
    check(
      h,
      `H2. ${width}px P09: 가로 스크롤·잘림 없음`,
      s.ov <= 0 && s.bad.length === 0,
      JSON.stringify(s),
    )
  }
})
