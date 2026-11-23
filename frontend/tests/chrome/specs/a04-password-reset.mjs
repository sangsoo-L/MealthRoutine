// [chrome 회귀] A04 비밀번호 재설정: A01 연결·복귀 · 빈 입력·형식 오류·정상 형식 · API 미연결 안내 · 직접 접근·새로고침 · 키보드·포커스 · 반응형
// 실행: frontend에서 `npm run dev -- --port 5199 --strictPort`를 띄운 뒤 `node tests/chrome/run.mjs --only a04-password-reset`. 상세: tests/chrome/README.md
// 서버 연결이 없어서 "요청 완료"는 나오지 않는다(완료·실패 상태의 화면은 Node 테스트가 주입한 상태로 확인한다). 계정·저장소를 쓰지 않는 비회원 시나리오다.
import { start } from '../lib/session.mjs'
import { mustUntil, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)
const READY = `!!document.querySelector('[data-reset-form]')`

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

const type = (h, value) => h.setVal('input[type=email]', value)
const submit = (h) => h.ev(`document.querySelector('form').requestSubmit()`)
const errorText = (h) =>
  h.ev(`document.querySelector('[role=alert]').innerText.trim()`)
const open = async (h) => {
  await h.go('/password/reset', 300)
  await mustUntil(h, READY, 80)
}

await scenario('A-link-and-back', async (h) => {
  await h.go('/login', 600)
  await mustUntil(h, `!!document.querySelector('[data-login-reset-link]')`, 80)
  check(
    h,
    'A1. 로그인의 비밀번호 링크가 A04로 연결된다',
    (await h.ev(
      `document.querySelector('[data-login-reset-link]').getAttribute('href')`,
    )) === '/password/reset',
  )
  await h.ev(`document.querySelector('[data-login-reset-link]').click()`)
  await waitPath(h, '^/password/reset$')
  await mustUntil(h, READY, 80)
  check(
    h,
    'A2. A04: 제목·안내·입력·버튼',
    /다시 설정할 수 있어요/.test(await h.text()) &&
      /가입할 때 사용한 이메일/.test(await h.text()) &&
      /재설정 안내 요청/.test(await h.text()) &&
      (await h.ev(`document.querySelectorAll('main h1').length`)) === 1,
  )
  check(
    h,
    'A3. 문서 제목',
    /비밀번호 재설정 · 밀스루틴/.test(await h.ev(`document.title`)),
  )
  await h.ev(`document.querySelector('[data-reset-back]').click()`)
  await waitPath(h, '^/login$')
  check(h, 'A4. 로그인으로 돌아가기', true)
  await h.ev(`document.querySelector('[data-login-reset-link]').click()`)
  await waitPath(h, '^/password/reset$')
  await mustUntil(h, READY, 80)
  await h.ev(
    `[...document.querySelectorAll('main a')].find(a=>/^이전/.test(a.innerText.trim())).click()`,
  )
  await waitPath(h, '^/login$')
  check(h, 'A5. 상단 이전도 로그인으로', true)
  await h.ev(`document.querySelector('[data-login-reset-link]').click()`)
  await waitPath(h, '^/password/reset$')
  await h.ev(`history.back()`)
  await waitPath(h, '^/login$')
  check(h, 'A6. 브라우저 뒤로 가기는 로그인으로', true)
})

await scenario('B-returnTo', async (h) => {
  // 로그인 안내에서 온 복귀 경로가 A04를 거쳐 로그인으로 이어진다(검증된 내부 경로만)
  await h.go('/favorites', 400)
  await mustUntil(
    h,
    `/로그인 후 이용할 수 있어요/.test(document.body.innerText)`,
    80,
  )
  await h.click('로그인', 'main')
  await waitPath(h, '^/login$')
  await mustUntil(h, `!!document.querySelector('[data-login-reset-link]')`, 80)
  await h.ev(`document.querySelector('[data-login-reset-link]').click()`)
  await waitPath(h, '^/password/reset$')
  await mustUntil(h, READY, 80)
  await h.ev(`document.querySelector('[data-reset-back]').click()`)
  await waitPath(h, '^/login$')
  check(
    h,
    'B1. 복귀 경로 정보가 로그인으로 돌아와도 유지된다(history state)',
    JSON.stringify(await h.ev(`history.state?.usr ?? null`)).includes(
      '/favorites',
    ),
    JSON.stringify(await h.ev(`history.state?.usr ?? null`)),
  )
})

await scenario('C-validation', async (h) => {
  await open(h)
  check(
    h,
    'C1. 처음에는 오류·안내가 없다',
    (await errorText(h)) === '' &&
      !(await h.ev(`!!document.querySelector('[data-reset-state]')`)),
  )
  await submit(h)
  await mustUntil(
    h,
    `document.querySelector('[role=alert]').innerText.trim()!==''`,
    40,
  )
  check(
    h,
    'C2. 빈 입력: 오류 안내',
    /이메일을 입력해 주세요/.test(await errorText(h)),
  )
  check(
    h,
    'C3. 오류가 입력에 연결되고 포커스가 입력으로 간다',
    (await h.ev(
      `(()=>{const i=document.querySelector('input[type=email]');const id=i.getAttribute('aria-describedby');return i.getAttribute('aria-invalid')==='true'&&!!document.getElementById(id)&&document.activeElement===i})()`,
    )) === true,
  )
  check(
    h,
    'C4. 요청은 나가지 않았다(연결 전 안내도 없다)',
    !(await h.ev(`!!document.querySelector('[data-reset-state]')`)),
  )
  for (const bad of ['abc', 'a@b', 'a@@b.com', 'a b@c.com']) {
    await type(h, bad)
    await submit(h)
    await mustUntil(
      h,
      `document.querySelector('[role=alert]').innerText.trim()!==''`,
      40,
    )
    check(
      h,
      `C5. 잘못된 이메일(${bad}): 형식 오류와 입력 유지`,
      /형식이 올바르지 않아요/.test(await errorText(h)) &&
        (await h.ev(`document.querySelector('input[type=email]').value`)) ===
          bad,
    )
  }
  await type(h, 'name@example.com')
  check(h, 'C6. 입력을 고치면 오류가 사라진다', (await errorText(h)) === '')
})

await scenario('D-unavailable', async (h) => {
  await open(h)
  await type(h, 'name@example.com')
  await submit(h)
  await mustUntil(
    h,
    `!!document.querySelector('[data-reset-state=unavailable]')`,
    60,
  )
  const t = await h.text()
  check(
    h,
    'D1. 정상 형식: API 미연결 안내(메일 미발송)',
    /아직 서버에 연결되지 않았어요/.test(t) && /발송되지 않았고/.test(t),
  )
  check(
    h,
    'D2. 완료·성공처럼 보이는 문구가 없다',
    !/보냈어요|발송했어요|완료/.test(t) &&
      !(await h.ev(`!!document.querySelector('[data-reset-state=done]')`)),
  )
  check(
    h,
    'D3. 입력은 유지되고 안내로 포커스가 이동한다',
    (await h.ev(`document.querySelector('input[type=email]').value`)) ===
      'name@example.com' &&
      (await h.ev(
        `document.activeElement?.getAttribute('data-reset-state')`,
      )) === 'unavailable',
  )
  check(
    h,
    'D4. 버튼은 다시 누를 수 있다(막히지 않음)',
    (await h.ev(
      `document.querySelector('form button[type=submit]').getAttribute('aria-disabled')`,
    )) === null,
  )
  await type(h, 'other@example.com')
  check(
    h,
    'D5. 이메일을 고치면 이전 안내가 사라진다',
    !(await h.ev(`!!document.querySelector('[data-reset-state]')`)),
  )
  // 계정 존재 여부와 무관하게 같은 안내
  await type(h, 'nobody-at-all@example.org')
  await submit(h)
  await mustUntil(
    h,
    `!!document.querySelector('[data-reset-state=unavailable]')`,
    60,
  )
  check(
    h,
    'D6. 어떤 이메일이든 같은 안내',
    (await h.text()) === t ||
      /아직 서버에 연결되지 않았어요/.test(await h.text()),
  )
})

await scenario('E-direct-reload-keyboard', async (h) => {
  await open(h)
  check(
    h,
    'E1. 직접 URL 접근(비회원)',
    /\/password\/reset$/.test(await h.ev(`location.pathname`)),
  )
  await type(h, 'kbd@example.com')
  await h.ev(`location.reload()`)
  await h.sleep(1000)
  await mustUntil(h, READY, 80)
  check(
    h,
    'E2. 새로고침: 처음 상태(입력·안내 초기화)',
    (await h.ev(`document.querySelector('input[type=email]').value`)) === '' &&
      !(await h.ev(`!!document.querySelector('[data-reset-state]')`)),
  )
  // 키보드: 입력에 포커스 → 입력 → Enter로 제출
  await h.ev(`document.querySelector('input[type=email]').focus()`)
  await type(h, 'kbd@example.com')
  await h.ev(`document.querySelector('input[type=email]').focus()`)
  await h.press('Enter', 'Enter', 13)
  await mustUntil(
    h,
    `!!document.querySelector('[data-reset-state=unavailable]')`,
    60,
  )
  check(h, 'E3. Enter로 제출된다', true)
  check(
    h,
    'E4. 탭 순서: 입력 → 요청 버튼 → 로그인 돌아가기',
    (
      await h.ev(
        `(()=>{const f=[...document.querySelectorAll('main input, main button, main a')].filter(e=>e.tabIndex>=0);return f.map(e=>e.tagName+(e.dataset.resetBack!==undefined?':back':'')).join(',')})()`,
      )
    ).includes('INPUT,BUTTON'),
  )
})

await scenario('F-responsive', async (h) => {
  for (const w of [390, 320, 195, 160]) {
    await h.vp(w, 844)
    await open(h)
    await type(h, 'name@example.com')
    await submit(h)
    await mustUntil(
      h,
      `!!document.querySelector('[data-reset-state=unavailable]')`,
      60,
    )
    const p =
      await h.ev(`(()=>{const small=[...document.querySelectorAll('main a, main button, main input')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<43.5}).map(e=>e.tagName);
      return {ov:document.documentElement.scrollWidth-window.innerWidth, small}})()`)
    check(
      h,
      `F1. ${w}px: 가로 넘침 없음·터치 영역 ≥44px`,
      p.ov <= 0 && p.small.length === 0,
      JSON.stringify(p),
    )
  }
})
