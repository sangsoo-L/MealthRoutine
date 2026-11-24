// [chrome 회귀] F2 실제 가입 연결(PR #27 리뷰 반영): 늦은 409 · 가입 완료 뒤 연결 안내 · 새 로그인 실패
// 실행: frontend에서 **실제 모드** 개발 서버(`VITE_DEV_AUTH`를 켜지 않은 `npm run dev -- --port 5199 --strictPort`)를 띄운 뒤
//       `node tests/chrome/specs/signup-connect.mjs`로 직접 실행한다. 다른 스크립트는 모의 모드(`VITE_DEV_AUTH=true`) 서버가 필요해
//       전체 실행(run.mjs) 목록에는 넣지 않았다. 모의 모드 서버에 붙으면 환경 오류(종료 코드 2)로 멈춘다.
// 백엔드·DB·실제 계정은 쓰지 않는다. 페이지가 열리기 전에 `/api/v1` 요청만 가짜 응답으로 바꾸는 스크립트를 심는다
// (새로고침해도 다시 심긴다). 규칙·요청 기록은 탭의 sessionStorage에 두어 새로고침 전후를 이어서 확인한다.
// 비밀번호 'Passw0rd!'는 가짜 문자열이다.
import { start } from '../lib/session.mjs'
import { failEnvironment } from '../lib/exitpolicy.mjs'
import { mustUntil, q, waitPath } from '../lib/history.mjs'

const check = (h, n, ok, d = '') => h.check(n, ok, d)

/**
 * 가짜 API. sessionStorage `__stubRules`의 규칙을 요청 시점에 읽는다.
 * 규칙: { kind: 'json', status, body } | { kind: 'network' } | { kind: 'hold' }(테스트가 __stub.release로 응답을 정할 때까지 멈춤).
 * 규칙이 없는 /api 요청은 네트워크 실패로 답하고 "unexpected"로 기록한다.
 */
const STUB = `(() => {
  const realFetch = window.fetch.bind(window)
  const read = (k, d) => { try { return JSON.parse(sessionStorage.getItem(k) ?? d) } catch { return JSON.parse(d) } }
  const log = (entry) => { const l = read('__stubLog', '[]'); l.push(entry); sessionStorage.setItem('__stubLog', JSON.stringify(l)) }
  const held = []
  const respond = (rule) => rule.kind === 'network'
    ? Promise.reject(new TypeError('stub network failure'))
    : Promise.resolve(new Response(rule.body === undefined ? null : JSON.stringify(rule.body), {
        status: rule.status, headers: { 'Content-Type': 'application/json' } }))
  window.__stub = {
    heldCount: () => held.length,
    release: (rule) => { const next = held.shift(); if (!next) return false; next(rule); return true },
  }
  window.fetch = (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href)
    if (!url.pathname.startsWith('/api/v1/')) return realFetch(input, init)
    const key = (init.method ?? 'GET').toUpperCase() + ' ' + url.pathname.slice('/api/v1'.length)
    const rule = read('__stubRules', '{}')[key]
    log({ key, unexpected: !rule })
    if (!rule) return Promise.reject(new TypeError('unexpected request ' + key))
    if (rule.kind === 'hold') return new Promise((resolve) => held.push(resolve)).then(respond)
    return respond(rule)
  }
})()`

const ok201 = {
  kind: 'json',
  status: 201,
  body: { success: true, message: '요청 성공', data: { userId: 501 } },
}
const conflict = (errorCode) => ({
  kind: 'json',
  status: 409,
  body: { success: false, message: 'msg', errorCode },
})
const NETWORK = { kind: 'network' }
const HINT = JSON.stringify({ v: 1, userId: 777 })

async function scenario(name, fn) {
  if (process.env.ONLY && process.env.ONLY !== name) return
  const h = await start(name)
  try {
    await h.vp(390, 844)
    await h.cdp('Page.addScriptToEvaluateOnNewDocument', { source: STUB })
    // 실제 모드인지 확인: 가입 체험은 모의 모드(DEV + VITE_DEV_AUTH=true)에서만 켜진다(F2-D8).
    await h.go('/signup', 600)
    await mustUntil(h, `!!document.querySelector('[name=fullName]')`, 100)
    const mockMode = await h.ev(
      `import('/src/signup-experience/signupExperience.ts').then((m) => m.signupExperienceAvailable)`,
    )
    if (mockMode !== false) {
      h.close()
      failEnvironment(
        '실제 모드 개발 서버가 필요해요(VITE_DEV_AUTH를 켜지 않은 npm run dev -- --port 5199 --strictPort).',
      )
    }
    await fn(h)
    const unexpected = (await stubLog(h)).filter((e) => e.unexpected)
    check(
      h,
      `${name}: 준비하지 않은 API 요청 없음`,
      unexpected.length === 0,
      JSON.stringify(unexpected),
    )
    if (h.problems.length)
      console.log('  (console problems)', h.problems.slice(0, 4))
  } catch (e) {
    check(h, `${name}: 예외 없이 진행`, false, e.message)
  } finally {
    h.close()
  }
}

/** 같은 출처의 빈 페이지에서 규칙·힌트를 정한 뒤 시작한다(앱이 뜨기 전에 sessionStorage가 준비돼 있어야 함). */
async function prepare(h, rules, { hint = false } = {}) {
  await h.go('/__stub-blank', 300)
  await h.ev(`(() => {
    sessionStorage.clear()
    sessionStorage.setItem('__stubRules', ${q(JSON.stringify(rules))})
    ${hint ? `sessionStorage.setItem('mealthroutine.auth.hint', ${q(HINT)})` : ''}
  })()`)
}
const setRules = (h, rules) =>
  h.ev(`sessionStorage.setItem('__stubRules', ${q(JSON.stringify(rules))})`)
const stubLog = (h) =>
  h.ev(`JSON.parse(sessionStorage.getItem('__stubLog') ?? '[]')`)
const count = async (h, key) =>
  (await stubLog(h)).filter((e) => e.key === key).length

const SIGNUP = 'POST /auth/signup'
const REFRESH = 'POST /auth/token/refresh'
const LOGIN = 'POST /auth/login'

const has = (h, name) => h.ev(`!!document.querySelector('[name=${name}]')`)
const invalid = (h, name) =>
  h.ev(
    `document.querySelector('[name=${name}]')?.getAttribute('aria-invalid') === 'true'`,
  )
const activeName = (h) =>
  h.ev(
    `document.activeElement?.getAttribute('name') ?? document.activeElement?.tagName`,
  )
const clickNext = (h) => h.click('^다음$')

/** 1·2단계를 채우고 3단계(계정 정보)까지 간다. */
async function fillToStep3(h, { nickname = '길동이' } = {}) {
  await h.go('/signup', 600)
  await mustUntil(h, `!!document.querySelector('[name=fullName]')`, 100)
  await h.setVal('[name=fullName]', '홍길동')
  await clickNext(h)
  await mustUntil(h, `!!document.querySelector('[name=nickname]')`, 60)
  await h.setVal('[name=nickname]', nickname)
  await clickNext(h)
  await mustUntil(h, `!!document.querySelector('[name=email]')`, 60)
  await h.setVal('[name=email]', 'f2.stub@example.test')
  await mustUntil(h, `!!document.querySelector('[name=password]')`, 60)
  await h.setVal('[name=password]', 'Passw0rd!')
  await h.setVal('[name=passwordConfirm]', 'Passw0rd!')
  await h.ev(`document.querySelector('[name=consent]').click()`)
  await mustUntil(h, `!!document.querySelector('button[type=submit]')`, 60)
}
const submit = (h) => h.ev(`document.querySelector('form').requestSubmit()`)
/** 가입 요청이 멈춘(hold) 상태가 될 때까지 기다린다. */
const waitHeld = (h) => mustUntil(h, `window.__stub.heldCount() === 1`, 60)
const release = (h, rule) => h.ev(`window.__stub.release(${q(rule)})`)

await scenario('A-late-409-email-changed', async (h) => {
  await prepare(h, { [SIGNUP]: { kind: 'hold' } })
  await fillToStep3(h)
  await submit(h)
  await waitHeld(h)
  // 응답을 기다리는 동안 이메일을 바꾸고 포커스를 비밀번호 칸으로 옮긴다.
  await h.setVal('[name=email]', 'changed@example.test')
  await h.ev(`document.querySelector('[name=password]').focus()`)
  await release(h, conflict('EMAIL_UNAVAILABLE'))
  await h.sleep(500)
  check(
    h,
    'A1. 이메일을 바꾼 뒤 온 409는 이메일 칸에 오류를 붙이지 않는다',
    !(await invalid(h, 'email')) && !(await h.has('사용할 수 없는 이메일')),
  )
  check(
    h,
    'A2. 단계가 그대로(3단계)',
    (await has(h, 'email')) && !(await has(h, 'nickname')),
  )
  check(
    h,
    'A3. 포커스가 그대로(비밀번호 칸)',
    (await activeName(h)) === 'password',
    await activeName(h),
  )
  check(
    h,
    'A4. 가입 요청은 1번, 자동 재전송 없음',
    (await count(h, SIGNUP)) === 1,
  )
  check(h, 'A5. 제출 중 표시가 풀린다', !(await h.has('가입하는 중')))
})

await scenario('B-late-409-nickname-changed-on-previous-step', async (h) => {
  await prepare(h, { [SIGNUP]: { kind: 'hold' } })
  await fillToStep3(h)
  await submit(h)
  await waitHeld(h)
  // 이전 단계(2단계)로 돌아가 닉네임을 바꾸고, 포커스는 닉네임 칸에 둔 채 응답을 받는다.
  await h.ev(
    `document.querySelector('[aria-label="이전 단계로 이동"]').click()`,
  )
  await mustUntil(h, `!!document.querySelector('[name=nickname]')`, 60)
  await h.setVal('[name=nickname]', '새닉네임')
  const before = await activeName(h)
  await release(h, conflict('NICKNAME_ALREADY_EXISTS'))
  await h.sleep(500)
  check(
    h,
    'B1. 닉네임을 바꾼 뒤 온 409는 닉네임 칸에 오류를 붙이지 않는다',
    !(await invalid(h, 'nickname')) && !(await h.has('이미 사용 중인 닉네임')),
  )
  check(
    h,
    'B2. 단계가 그대로(2단계)',
    (await has(h, 'nickname')) && !(await has(h, 'email')),
  )
  check(
    h,
    'B3. 포커스가 그대로',
    (await activeName(h)) === before,
    `${before} → ${await activeName(h)}`,
  )
  check(h, 'B4. 가입 요청은 1번', (await count(h, SIGNUP)) === 1)
})

await scenario('C-409-same-values', async (h) => {
  await prepare(h, { [SIGNUP]: { kind: 'hold' } })
  await fillToStep3(h)
  // 연속 제출: 보내는 중에는 요청을 더 만들지 않는다.
  await submit(h)
  await submit(h)
  await h.press('Enter', 'Enter', 13)
  await waitHeld(h)
  await h.sleep(300)
  check(h, 'C1. 연속 제출에도 가입 요청은 1번', (await count(h, SIGNUP)) === 1)
  // 대소문자만 바꾼 이메일은 서버 기준으로 같은 값이다 → 기존 안내.
  await h.setVal('[name=email]', 'F2.Stub@Example.test')
  await h.ev(`document.querySelector('[name=password]').focus()`)
  await release(h, conflict('EMAIL_UNAVAILABLE'))
  await mustUntil(
    h,
    `document.querySelector('[name=email]')?.getAttribute('aria-invalid') === 'true'`,
    40,
  )
  check(
    h,
    'C2. 같은 이메일의 409는 이메일 칸에 표시',
    await h.has('사용할 수 없는 이메일'),
  )
  check(
    h,
    'C3. 포커스가 이메일 칸으로 이동',
    (await activeName(h)) === 'email',
    await activeName(h),
  )
  // 닉네임 409(값 그대로): 2단계로 이동해 닉네임 칸에 표시한다.
  await setRules(h, { [SIGNUP]: conflict('NICKNAME_ALREADY_EXISTS') })
  await h.setVal('[name=email]', 'f2.other@example.test')
  await submit(h)
  await mustUntil(
    h,
    `document.querySelector('[name=nickname]')?.getAttribute('aria-invalid') === 'true'`,
    40,
  )
  check(
    h,
    'C4. 같은 닉네임의 409는 2단계 닉네임 칸에 표시',
    (await has(h, 'nickname')) && (await h.has('이미 사용 중인 닉네임')),
  )
  check(
    h,
    'C5. 포커스가 닉네임 칸으로 이동',
    (await activeName(h)) === 'nickname',
    await activeName(h),
  )
  check(h, 'C6. 가입 요청은 제출 횟수(2번)만큼', (await count(h, SIGNUP)) === 2)
})

const SIGNED_UP = '회원가입이 완료됐어요'
const CONNECTION = '서버에 연결할 수 없어요'

await scenario('D-startup-warning-then-signup-then-reload', async (h) => {
  // 경로 1: 시작 확인(refresh)이 연결 실패 → 로그인 화면에 경고 → 같은 문서에서 가입 성공 → 경고는 사라지고 완료 안내만.
  await prepare(h, { [REFRESH]: NETWORK, [SIGNUP]: ok201 }, { hint: true })
  await h.go('/login', 900)
  await mustUntil(h, `/${CONNECTION}/.test(document.body.innerText)`, 80)
  check(h, 'D1. 시작 확인 실패로 로그인 화면에 연결 경고가 보인다', true)
  const refreshBefore = await count(h, REFRESH)
  // 같은 문서 안에서 가입 화면으로 이동(새로고침 없음)
  await h.ev(
    `[...document.querySelectorAll('a')].find(a => a.getAttribute('href') === '/signup').click()`,
  )
  await waitPath(h, '^/signup$')
  await mustUntil(h, `!!document.querySelector('[name=fullName]')`, 100)
  await h.setVal('[name=fullName]', '홍길동')
  await clickNext(h)
  await mustUntil(h, `!!document.querySelector('[name=nickname]')`, 60)
  await h.setVal('[name=nickname]', '길동이')
  await clickNext(h)
  await mustUntil(h, `!!document.querySelector('[name=email]')`, 60)
  await h.setVal('[name=email]', 'f2.stub@example.test')
  await mustUntil(h, `!!document.querySelector('[name=password]')`, 60)
  await h.setVal('[name=password]', 'Passw0rd!')
  await h.setVal('[name=passwordConfirm]', 'Passw0rd!')
  await h.ev(`document.querySelector('[name=consent]').click()`)
  await submit(h)
  await waitPath(h, '^/login$')
  await mustUntil(h, `/${SIGNED_UP}/.test(document.body.innerText)`, 60)
  check(h, 'D2. 가입 성공 → 로그인 화면에 완료 안내', true)
  check(
    h,
    'D3. 이전 시작 확인 경고는 사라졌다',
    !(await h.has(CONNECTION, 'body')),
  )
  check(
    h,
    'D4. 같은 문서 흐름(refresh 재요청 없음)·로그인 호출 없음',
    (await count(h, REFRESH)) === refreshBefore &&
      (await count(h, LOGIN)) === 0,
  )

  // 경로 2: 가입 완료 상태의 로그인 화면을 실제로 새로고침 → 힌트가 남아 새 refresh가 나가고 실패 → 로그인 전에 경고가 보인다.
  check(
    h,
    'D5. 새로고침 전 세션 복원 힌트가 남아 있다',
    (await h.ev(`sessionStorage.getItem('mealthroutine.auth.hint')`)) === HINT,
  )
  await h.cdp('Page.reload', {})
  await h.sleep(900)
  await mustUntil(h, `!!document.querySelector('input[type=email]')`, 150)
  await mustUntil(h, `/${CONNECTION}/.test(document.body.innerText)`, 80)
  check(
    h,
    'D6. 새로고침 뒤 새 refresh 요청이 나갔다',
    (await count(h, REFRESH)) === refreshBefore + 1,
  )
  check(
    h,
    'D7. 가입 완료 표지가 남아 있어도 새 연결 실패가 로그인 전에 보인다',
    (await h.has(SIGNED_UP, 'body')) && (await h.has(CONNECTION, 'body')),
  )
  check(h, 'D8. 로그인 요청은 보내지 않았다', (await count(h, LOGIN)) === 0)
})

await scenario('E-signup-then-login-request-fails', async (h) => {
  // 경로 3: 시작 확인 경고가 없는 상태(힌트 없음)에서 가입 → 로그인 제출 → /auth/login만 실패 → 연결 실패 표시.
  await prepare(h, { [SIGNUP]: ok201, [LOGIN]: NETWORK })
  await fillToStep3(h)
  await submit(h)
  await waitPath(h, '^/login$')
  await mustUntil(h, `/${SIGNED_UP}/.test(document.body.innerText)`, 60)
  check(
    h,
    'E1. 가입 성공 → 로그인 화면, 자동 로그인·refresh 없음',
    (await count(h, LOGIN)) === 0 &&
      (await count(h, REFRESH)) === 0 &&
      (await h.path()) === '/login',
  )
  check(h, 'E2. 시작 확인 경고 없음', !(await h.has(CONNECTION, 'body')))
  await h.setVal('input[type=email]', 'f2.stub@example.test')
  await h.setVal('input[type=password]', 'Passw0rd!')
  await h.ev(`document.querySelector('form').requestSubmit()`)
  await mustUntil(h, `/${CONNECTION}/.test(document.body.innerText)`, 60)
  check(h, 'E3. 새 로그인 요청의 연결 실패가 보인다', true)
  check(
    h,
    'E4. /auth/login 1번만 실패, refresh 없음',
    (await count(h, LOGIN)) === 1 && (await count(h, REFRESH)) === 0,
  )
  check(h, 'E5. 로그인 화면에 머문다', (await h.path()) === '/login')
})

await scenario('F-unconfirmed-success-response', async (h) => {
  // 201이지만 userId가 없는 응답: 가입 화면에 머물러 안내, 로그인 화면 이동·재전송 없음.
  await prepare(h, {
    [SIGNUP]: {
      kind: 'json',
      status: 201,
      body: { success: true, message: 'm', data: {} },
    },
  })
  await fillToStep3(h)
  await submit(h)
  await mustUntil(
    h,
    `/가입 결과를 확인하지 못했어요/.test(document.body.innerText)`,
    60,
  )
  check(
    h,
    'F1. 가입 화면에 머물러 확인 불가 안내',
    (await h.path()) === '/signup',
  )
  check(
    h,
    'F2. 가입 요청 1번, 로그인 호출 없음',
    (await count(h, SIGNUP)) === 1 && (await count(h, LOGIN)) === 0,
  )
})
