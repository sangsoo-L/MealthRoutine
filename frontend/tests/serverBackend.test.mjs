// F1 인증 연결: serverBackend(서버 응답 → AuthUser), AuthProvider 반영 규칙(auth/authResults.ts), 화면 연결 정적 확인.
// Provider의 반영 순서는 React와 분리한 함수로 호출 순서를 직접 기록해 확인한다(최종 화면만으로 판정하지 않음, 계획 v2.2 정정).
// 대문자 드라이브(C:\)의 PowerShell에서도 같은 명령으로 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'
import {
  createFakeServer,
  createStorage,
  deferred,
  fail,
  flush,
  loginOk,
  me,
  noContent,
  refreshOk,
} from './apiTestKit.mjs'

let server, sessionModule, backendModule, results, scope, types, ctxModule, home
const storage = createStorage()
before(async () => {
  // 브라우저 sessionStorage 대역(accountScope·serverBackend가 전역으로 쓴다).
  globalThis.sessionStorage = storage
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  sessionModule = await load('/src/api/session.ts')
  backendModule = await load('/src/auth/serverBackend.ts')
  results = await load('/src/auth/authResults.ts')
  scope = await load('/src/auth/accountScope.ts')
  types = await load('/src/auth/authTypes.ts')
  ctxModule = await load('/src/auth/authContext.ts')
  home = await load('/src/pages/HomePage.tsx')
})
after(async () => {
  await server?.close()
  delete globalThis.sessionStorage
})
beforeEach(() => storage.map.clear())

const HINT = 'mealthroutine.auth.hint'
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const source = (file) => strip(readFileSync(file, 'utf8'))

function makeBackend() {
  const fake = createFakeServer()
  const session = sessionModule.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  return { fake, session, backend: backendModule.createServerBackend(session) }
}

/** 호출 순서를 기록하는 Provider 동작 대역 */
function recorder(isCurrent = () => true) {
  const log = []
  return {
    log,
    actions: {
      isCurrent,
      clearAccountData: () => {
        log.push('clear')
        scope.clearAccountScopedData()
      },
      clearAccountScopedData: () => {
        log.push('clearScoped')
        scope.clearAccountScopedData()
      },
      persist: () => log.push('persist'),
      setUser: (user) => log.push(['user', user ? user.id : null]),
      setBooting: (value) => log.push(['booting', value]),
      setConnectionNotice: (value) => log.push(['notice', value]),
    },
  }
}

// ---------------------------------------------------------------- 변환

test('AuthUser 변환: id는 문자열, nickname null이면 "회원"(실명·이메일 미사용), entitlement는 임시 free', () => {
  assert.deepEqual(
    backendModule.toAuthUser({
      userId: 7,
      email: 'a@example.test',
      nickname: null,
    }),
    { id: '7', email: 'a@example.test', nickname: '회원', entitlement: 'free' },
  )
  assert.equal(
    backendModule.toAuthUser({ userId: 1, email: null, nickname: '하나' })
      .nickname,
    '하나',
  )
  assert.equal(
    backendModule.toAuthUser({ userId: 1, email: null, nickname: null }).email,
    '',
  )
})

test('serverBackend.login: 성공은 gen 포함, 실패 사유 invalid·suspended(서버 문구)·unavailable', async () => {
  const { fake, backend } = makeBackend()
  fake.on(
    'POST /auth/login',
    loginOk(7, 'access-A1'),
    fail(401, 'LOGIN_FAILED'),
    fail(403, 'ACCOUNT_SUSPENDED'),
    fail(500, 'X'),
  )
  fake.on('GET /users/me', me(7, { nickname: null }))
  const okResult = await backend.login('a', 'b')
  assert.equal(okResult.ok, true)
  assert.equal(okResult.user.nickname, '회원')
  assert.equal(backend.isCurrent(okResult.gen), true)
  assert.deepEqual(await backend.login('a', 'b'), {
    ok: false,
    reason: 'invalid',
  })
  assert.deepEqual(await backend.login('a', 'b'), {
    ok: false,
    reason: 'suspended',
    message: 'msg:ACCOUNT_SUSPENDED',
  })
  assert.deepEqual(await backend.login('a', 'b'), {
    ok: false,
    reason: 'unavailable',
  })
})

test('serverBackend.restore는 동기 복원을 하지 않고 남은 개발용 세션을 지운다, persist는 아무것도 저장하지 않는다', () => {
  const { backend } = makeBackend()
  storage.map.set(types.DEV_SESSION_KEY, '{"v":1,"accountId":"x"}')
  assert.equal(backend.restore(), null)
  assert.equal(storage.map.has(types.DEV_SESSION_KEY), false)
  backend.persist({ id: '1', email: '', nickname: 'n', entitlement: 'free' })
  assert.equal(storage.map.size, 0)
})

test('serverBackend.clear는 서버 logout을 보낸다(X-Requested-With)', async () => {
  const { fake, backend } = makeBackend()
  fake.on('POST /auth/logout', noContent())
  backend.clear()
  await flush()
  assert.deepEqual(fake.keys(), ['POST /auth/logout'])
  assert.equal(fake.calls[0].headers['X-Requested-With'], 'XMLHttpRequest')
})

// ---------------------------------------------------------------- Provider 반영 규칙

test('시작 확인 ok(같은 회원): 계정 데이터는 지우지 않고 user 설정 → 안내 끄기 → loading 끝', () => {
  const { log, actions } = recorder()
  const user = { id: '1', email: '', nickname: 'n', entitlement: 'free' }
  results.applyResumeResult(
    {
      gen: 1,
      ok: true,
      user,
      switchedAccount: false,
      activate: () => (log.push('activate'), true),
    },
    actions,
  )
  assert.deepEqual(log, [
    'activate',
    ['user', '1'],
    ['notice', false],
    ['booting', false],
  ])
})

test('D10 ① 계정 전환: A 데이터(계정별 키·고정 접두어 운동 초안 키·등록된 메모리 정리)를 지운 뒤에 activate(B 토큰 공개)·setUser(B), 힌트 B', async () => {
  const { fake, backend } = makeBackend()
  storage.map.set(HINT, JSON.stringify({ v: 1, userId: 1 }))
  storage.map.set(scope.accountScopedKey('1', 'comment-draft'), 'A의 초안')
  storage.map.set('mealthroutine.account.workout-draft', 'A의 운동 초안')
  storage.map.set('mealthroutine.other', '계정과 무관')
  const log = []
  scope.registerAccountCleanup(() => log.push('memoryCleanup'))
  fake.on('POST /auth/token/refresh', refreshOk('access-B1'))
  fake.on('GET /users/me', me(2))
  const result = await backend.resume()
  assert.equal(result.switchedAccount, true)
  assert.equal(result.user.id, '2')
  const rec = recorder((gen) => backend.isCurrent(gen))
  const activate = result.activate
  results.applyResumeResult(
    {
      ...result,
      activate: () => {
        // activate(=B 토큰 공개) 시점에 A 데이터가 이미 없어야 한다(Codex R1).
        assert.equal(
          storage.map.has(scope.accountScopedKey('1', 'comment-draft')),
          false,
        )
        rec.log.push('activate')
        return activate()
      },
    },
    {
      ...rec.actions,
      setUser: (user) => {
        // setUser 시점에 A 데이터가 이미 없어야 한다.
        assert.equal(
          storage.map.has(scope.accountScopedKey('1', 'comment-draft')),
          false,
        )
        assert.equal(
          storage.map.has('mealthroutine.account.workout-draft'),
          false,
        )
        rec.log.push(['user', user.id])
      },
    },
  )
  assert.deepEqual(rec.log, [
    'clear',
    'activate',
    ['user', '2'],
    ['notice', false],
    ['booting', false],
  ])
  assert.ok(log.includes('memoryCleanup'))
  assert.deepEqual(JSON.parse(storage.map.get(HINT)), { v: 1, userId: 2 })
  assert.equal(storage.map.get('mealthroutine.other'), '계정과 무관')
  assert.ok(!fake.keys().includes('POST /auth/logout'))
})

test('D10 ③ 오래된 B 확정 결과(그 사이 로그인 C): token·힌트·A 데이터 정리·안내·loading 어느 것도 바꾸지 않는다', async () => {
  const { fake, backend } = makeBackend()
  storage.map.set(HINT, JSON.stringify({ v: 1, userId: 1 }))
  const meB = deferred()
  fake.on('POST /auth/token/refresh', refreshOk('access-B1'))
  fake.on('GET /users/me', meB, me(3))
  fake.on('POST /auth/login', loginOk(3, 'access-C1'))
  const resume = backend.resume()
  await flush()
  const loginC = await (async () => {
    const pending = backend.login('c', 'd')
    await flush()
    return pending
  })()
  void loginC
  meB.resolve(me(2))
  const result = await resume
  // C가 확정된 뒤 C의 임시 데이터가 생겼다고 가정한다.
  storage.map.set(scope.accountScopedKey('3', 'comment-draft'), 'C의 초안')
  const rec = recorder((gen) => backend.isCurrent(gen))
  results.applyResumeResult(result, rec.actions)
  assert.deepEqual(rec.log, [])
  // 오래된 결과는 확정 수단(activate) 없이 실패 결과로 끝난다.
  assert.equal(result.ok, false)
  assert.equal(
    storage.map.get(scope.accountScopedKey('3', 'comment-draft')),
    'C의 초안',
  )
  assert.deepEqual(JSON.parse(storage.map.get(HINT)), { v: 1, userId: 3 })
})

test('시작 확인 ended: 계정 데이터 정리 후 로그아웃 / transient(D7): 사용자 그대로·연결 안내', () => {
  {
    const { log, actions } = recorder()
    results.applyResumeResult({ gen: 1, ok: false, kind: 'ended' }, actions)
    assert.deepEqual(log, ['clear', ['user', null], ['booting', false]])
  }
  {
    const { log, actions } = recorder()
    results.applyResumeResult({ gen: 1, ok: false, kind: 'transient' }, actions)
    assert.deepEqual(log, [
      ['notice', true],
      ['booting', false],
    ])
  }
})

test('로그인 결과: 오래된 성공은 반영하지 않고 unavailable, 정상 성공은 정리 → persist → setUser 순서', () => {
  const user = { id: '1', email: '', nickname: 'n', entitlement: 'free' }
  {
    const { log, actions } = recorder(() => false)
    assert.deepEqual(
      results.applyLoginResult({ ok: true, user, gen: 4 }, actions),
      { ok: false, reason: 'unavailable' },
    )
    assert.deepEqual(log, [])
  }
  {
    const { log, actions } = recorder(() => true)
    assert.equal(
      results.applyLoginResult({ ok: true, user, gen: 4 }, actions).ok,
      true,
    )
    assert.deepEqual(log, [
      'clearScoped',
      'persist',
      ['user', '1'],
      ['notice', false],
      ['booting', false],
    ])
  }
  {
    const { log, actions } = recorder()
    const failed = { ok: false, reason: 'invalid' }
    assert.equal(results.applyLoginResult(failed, actions), failed)
    // 수동 로그인 실패도 시작 확인을 대체했으므로 loading을 끝낸다(Codex R3).
    assert.deepEqual(log, [['booting', false]])
  }
})

test('R3 시작 확인 중 수동 로그인 실패: 오래된 확인 GET을 풀기 전에 loading이 끝나고, 늦게 끝난 시작 확인은 현재 상태를 바꾸지 않는다', async () => {
  const { fake, backend } = makeBackend()
  storage.map.set(HINT, JSON.stringify({ v: 1, userId: 1 }))
  const meHold = deferred()
  fake.on('POST /auth/token/refresh', refreshOk('access-A1'))
  fake.on('GET /users/me', meHold)
  fake.on('POST /auth/login', fail(401, 'LOGIN_FAILED'))
  const resume = backend.resume()
  await flush()
  const rec = recorder((gen) => backend.isCurrent(gen))
  const loginResult = await backend.login('a', 'wrong')
  results.applyLoginResult(loginResult, rec.actions)
  assert.deepEqual(rec.log, [['booting', false]])
  // 이제야 오래된 시작 확인이 끝난다(같은 회원 A여도 반영하지 않음).
  meHold.resolve(me(1))
  const stale = await resume
  results.applyResumeResult(stale, rec.actions)
  assert.deepEqual(rec.log, [['booting', false]])
  assert.equal(stale.ok, false)
})

test('세션 종료 통지: 계정 데이터 정리 후 user null(서버 logout을 부르지 않음)', () => {
  const { log, actions } = recorder()
  results.applySessionEnded(actions)
  assert.deepEqual(log, ['clear', ['user', null]])
  const body = source('src/auth/authResults.ts').match(
    /export function applySessionEnded[\s\S]*?\n}/,
  )[0]
  assert.ok(!body.includes('logout'))
})

// ---------------------------------------------------------------- 화면 연결(정적·렌더)

test('AuthProvider: 결과 반영은 authResults를 거치고, Effect 정리·종료 통지에서 서버 logout(authBackend.clear)을 부르지 않는다', () => {
  const text = source('src/auth/AuthProvider.tsx')
  assert.match(text, /applyResumeResult\(result, actions\)/)
  assert.match(
    text,
    /onSessionEnded\?\.\(\(\) => applySessionEnded\(actions\)\)/,
  )
  assert.match(text, /authBackend\.resume\?\.\(\)/)
  // 두 Effect(시작 확인 구독·종료 통지 구독)는 login 정의 앞에 있다. 그 구간에 서버 logout 호출이 없어야 한다.
  const effects = text.slice(
    text.indexOf('useEffect('),
    text.indexOf('const login = useCallback'),
  )
  assert.equal(effects.split('useEffect(').length - 1, 2)
  assert.ok(!effects.includes('authBackend.clear'))
  assert.ok(!effects.includes('logout'))
  assert.match(
    text,
    /if \(pendingRef\.current === task\) pendingRef\.current = null/,
  )
  // 수동 로그인 예외에서도 loading을 끝낸다(R3).
  assert.match(text, /catch \{\s*actions\.setBooting\(false\)/)
})

test('authBackend: 기본은 serverBackend, 개발 서버 + VITE_DEV_AUTH=true일 때만 개발용 계정(자동 전환 없음)', () => {
  const text = source('src/auth/authBackend.ts')
  assert.match(
    text,
    /import\.meta\.env\.DEV && import\.meta\.env\.VITE_DEV_AUTH === 'true'/,
  )
  assert.match(text, /: serverBackend/)
  assert.ok(!/catch|unavailable/.test(text))
  const settings = source('src/components/settings/SettingsAccountActions.tsx')
  assert.match(
    settings,
    /import\.meta\.env\.DEV && import\.meta\.env\.VITE_DEV_AUTH === 'true' \?/,
  )
})

test('LoginPage: 연결 실패 문구(F1-MESSAGE-1), 정지는 서버 문구, 시작 확인 연결 안내를 같은 문구로', () => {
  const text = readFileSync('src/pages/LoginPage.tsx', 'utf8')
  assert.ok(
    text.includes("'서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.'"),
  )
  assert.ok(!text.includes('로그인 흐름 체험입니다'))
  assert.match(text, /result\.reason === 'suspended'/)
  assert.match(text, /result\.message \?\? FORM_MESSAGES\.suspendedFallback/)
  assert.match(text, /connectionNotice &&/)
})

test('HomePage: 확인 중(loading)에는 비회원 랜딩을 그리지 않는다', () => {
  const value = {
    status: 'loading',
    user: null,
    connectionNotice: false,
    login: async () => ({ ok: false, reason: 'unavailable' }),
    logout: () => {},
  }
  const html = renderToStaticMarkup(
    createElement(
      ctxModule.AuthContext,
      { value },
      createElement(home.default),
    ),
  )
  assert.equal(html, '')
})

test('힌트 키는 계정별 정리 접두어를 쓰지 않는다', () => {
  assert.equal(
    sessionModule.AUTH_HINT_KEY.startsWith(scope.ACCOUNT_SCOPE_PREFIX),
    false,
  )
})
