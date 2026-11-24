// F1 인증 연결: 공통 호출(api/core.ts)과 인증 세션(api/session.ts). 계획 F1 v2.2 2.2·2.3·2.7·5-2.
// 순서는 보류 Promise(deferred)로 강제하고, 최종 값뿐 아니라 fetch 호출 순서·횟수와 "보내지 않아야 하는 요청의 부재"를 단언한다.
// 대문자 드라이브(C:\)의 PowerShell에서도 같은 명령으로 실행한다.
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import {
  createFakeServer,
  createStorage,
  deferred,
  fail,
  flush,
  loginOk,
  me,
  networkError,
  noContent,
  ok,
  refreshOk,
  within,
} from './apiTestKit.mjs'

let server, core, sessionModule
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  core = await server.ssrLoadModule('/src/api/core.ts')
  sessionModule = await server.ssrLoadModule('/src/api/session.ts')
})
after(async () => {
  await server?.close()
})

const HINT = 'mealthroutine.auth.hint'

function setup({ storage = createStorage(), sleep } = {}) {
  const fake = createFakeServer()
  const sleeps = []
  const session = sessionModule.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep:
      sleep ??
      ((ms) => {
        sleeps.push(ms)
        return Promise.resolve()
      }),
    refreshRetryDelayMs: 300,
  })
  const ended = []
  session.onSessionEnded((reason) => ended.push(reason))
  return { fake, session, storage, sleeps, ended }
}

async function loggedIn(userId = 1, token = 'access-A1') {
  const ctx = setup()
  ctx.fake.on('POST /auth/login', loginOk(userId, token))
  ctx.fake.on('GET /users/me', me(userId))
  const outcome = await ctx.session.login('a@example.test', 'pw')
  assert.equal(outcome.ok, true)
  ctx.fake.calls.length = 0
  return ctx
}

const hintOf = (storage) => {
  const raw = storage.map.get(HINT)
  return raw === undefined ? null : JSON.parse(raw)
}

/** 저장소 어디에도 토큰 문자열이 없어야 한다 */
function assertNoTokenInStorage(storage) {
  for (const value of storage.map.values())
    assert.ok(!/access-/.test(value), `토큰이 저장소에 있음: ${value}`)
}

async function rejectsWith(promise, status, errorCode) {
  await assert.rejects(promise, (error) => {
    assert.equal(error.name, 'ApiError')
    assert.equal(error.status, status)
    assert.equal(error.errorCode, errorCode)
    return true
  })
}

// ---------------------------------------------------------------- 공통 호출(core·request 기본)

test('응답 풀기: 성공은 data, 204·빈 본문은 해석하지 않고 undefined', async () => {
  const { fake, session } = setup()
  fake.on('GET /a', ok({ x: 1 }))
  fake.on('POST /b', noContent())
  fake.on('GET /c', new Response('', { status: 200 }))
  assert.deepEqual(await session.request('GET', '/a', { auth: 'none' }), {
    x: 1,
  })
  assert.equal(await session.request('POST', '/b', { auth: 'none' }), undefined)
  assert.equal(await session.request('GET', '/c', { auth: 'none' }), undefined)
  assert.equal(fake.calls[0].credentials, 'same-origin')
})

test('잘못된 응답: JSON 아님·형식 다름·success와 상태 불일치는 INVALID_RESPONSE', async () => {
  const { fake, session } = setup()
  fake.on('GET /a', new Response('<html>', { status: 200 }))
  fake.on('GET /b', new Response(JSON.stringify({ data: 1 }), { status: 200 }))
  fake.on(
    'GET /c',
    new Response(JSON.stringify({ success: true, data: 1 }), { status: 500 }),
  )
  fake.on('GET /d', new Response('oops', { status: 502 }))
  await rejectsWith(
    session.request('GET', '/a', { auth: 'none' }),
    200,
    'INVALID_RESPONSE',
  )
  await rejectsWith(
    session.request('GET', '/b', { auth: 'none' }),
    200,
    'INVALID_RESPONSE',
  )
  await rejectsWith(
    session.request('GET', '/c', { auth: 'none' }),
    500,
    'INVALID_RESPONSE',
  )
  await rejectsWith(
    session.request('GET', '/d', { auth: 'none' }),
    502,
    'INVALID_RESPONSE',
  )
})

test('ApiError: 서버 status·errorCode·message, 실패 상세 data, Retry-After 초를 보존한다', async () => {
  const { fake, session } = setup()
  fake.on('POST /x', fail(400, 'PIN_INVALID', { remainingAttempts: 3 }))
  fake.on(
    'POST /y',
    fail(429, 'TOO_MANY_REQUESTS', undefined, { 'Retry-After': '60' }),
  )
  await assert.rejects(
    session.request('POST', '/x', { auth: 'none', body: {} }),
    (e) => {
      assert.ok(e instanceof core.ApiError)
      assert.equal(e.status, 400)
      assert.equal(e.errorCode, 'PIN_INVALID')
      assert.equal(e.message, 'msg:PIN_INVALID')
      assert.deepEqual(e.data, { remainingAttempts: 3 })
      return true
    },
  )
  await assert.rejects(
    session.request('POST', '/y', { auth: 'none' }),
    (e) => e.retryAfter === 60,
  )
})

test('네트워크 실패는 status 0 NETWORK, 500도 자동 재전송하지 않는다, 취소는 AbortError 그대로', async () => {
  const { fake, session } = setup()
  fake.on('POST /a', networkError())
  fake.on('POST /b', fail(500, 'INTERNAL_ERROR'))
  await rejectsWith(
    session.request('POST', '/a', { auth: 'none' }),
    0,
    'NETWORK',
  )
  await rejectsWith(
    session.request('POST', '/b', { auth: 'none' }),
    500,
    'INTERNAL_ERROR',
  )
  assert.deepEqual(fake.keys(), ['POST /a', 'POST /b'])

  const hold = deferred()
  fake.on('GET /slow', hold)
  const controller = new AbortController()
  const pending = session.request('GET', '/slow', {
    auth: 'none',
    signal: controller.signal,
  })
  controller.abort()
  await assert.rejects(pending, (e) => e.name === 'AbortError')
})

test('경로 제한: 절대 주소·// ·역슬래시·상대 경로는 요청 없이 거부(Bearer가 다른 출처로 가지 않음)', async () => {
  const { fake, session } = await loggedIn()
  for (const bad of [
    '//evil.example/x',
    'https://evil.example/x',
    '/a//b',
    '/a\\b',
    'users/me',
    '/x?u=http://e',
  ]) {
    await rejectsWith(session.request('GET', bad), 0, 'INVALID_REQUEST')
  }
  assert.equal(fake.calls.length, 0)
})

test('추가 헤더는 전달, 예약 헤더는 대소문자와 상관없이 거부', async () => {
  const { fake, session } = await loggedIn()
  fake.on('GET /health/metrics', ok({}))
  await session.request('GET', '/health/metrics', {
    headers: { 'X-Pin-Token': 'pin-1' },
  })
  assert.equal(fake.calls[0].headers['X-Pin-Token'], 'pin-1')
  assert.equal(fake.calls[0].headers.Authorization, 'Bearer access-A1')
  for (const name of [
    'authorization',
    'AUTHORIZATION',
    'x-requested-with',
    'X-Requested-With',
  ]) {
    await rejectsWith(
      session.request('GET', '/a', { headers: { [name]: 'v' } }),
      0,
      'INVALID_REQUEST',
    )
  }
  await rejectsWith(
    session.request('POST', '/a', {
      body: {},
      headers: { 'content-TYPE': 'text/plain' },
    }),
    0,
    'INVALID_REQUEST',
  )
  assert.equal(fake.calls.length, 1)
})

test('본문은 일반 객체·배열만 JSON으로, FormData·Blob은 요청 없이 거부', async () => {
  const { fake, session } = setup()
  fake.on('POST /a', ok(null), ok(null))
  await session.request('POST', '/a', { auth: 'none', body: { a: 1 } })
  await session.request('POST', '/a', { auth: 'none', body: [1] })
  assert.equal(fake.calls[0].headers['Content-Type'], 'application/json')
  assert.deepEqual(fake.calls[0].body, { a: 1 })
  await rejectsWith(
    session.request('POST', '/a', { auth: 'none', body: new FormData() }),
    0,
    'INVALID_REQUEST',
  )
  await rejectsWith(
    session.request('POST', '/a', { auth: 'none', body: new Blob(['x']) }),
    0,
    'INVALID_REQUEST',
  )
  assert.equal(fake.calls.length, 2)
})

test('auth 모드: none은 로그인 중에도 토큰 없음, required는 토큰 없으면 요청 없이 LOGIN_REQUIRED, optional 비회원은 헤더 없이', async () => {
  const guest = setup()
  await rejectsWith(
    guest.session.request('GET', '/users/me'),
    401,
    'LOGIN_REQUIRED',
  )
  assert.equal(guest.fake.calls.length, 0)
  guest.fake.on('GET /posts', ok([]))
  await guest.session.request('GET', '/posts', { auth: 'optional' })
  assert.equal(guest.fake.auth(0), null)

  const { fake, session } = await loggedIn()
  fake.on('GET /posts', ok([]), ok([]))
  await session.request('GET', '/posts', { auth: 'none' })
  await session.request('GET', '/posts', { auth: 'optional' })
  assert.equal(fake.auth(0), null)
  assert.equal(fake.auth(1), 'Bearer access-A1')
})

// ---------------------------------------------------------------- 로그인

test('로그인 성공: login → 임시 토큰으로 /users/me 확인 → 확정, 힌트는 회원 ID만, 저장소에 토큰 없음', async () => {
  const { fake, session, storage } = setup()
  fake.on('POST /auth/login', loginOk(7, 'access-A1'))
  fake.on('GET /users/me', me(7))
  const outcome = await session.login('a@example.test', 'pw-1')
  assert.equal(outcome.ok, true)
  assert.equal(outcome.me.userId, 7)
  assert.ok(session.isCurrent(outcome.gen))
  assert.deepEqual(fake.keys(), ['POST /auth/login', 'GET /users/me'])
  assert.equal(fake.auth(0), null)
  assert.equal(fake.calls[0].headers['X-Requested-With'], undefined)
  assert.deepEqual(fake.calls[0].body, {
    email: 'a@example.test',
    password: 'pw-1',
  })
  assert.equal(fake.auth(1), 'Bearer access-A1')
  assert.deepEqual(hintOf(storage), { v: 1, userId: 7 })
  assertNoTokenInStorage(storage)
  fake.on('GET /x', ok(1))
  await session.request('GET', '/x')
  assert.equal(fake.auth(2), 'Bearer access-A1')
})

test('로그인 실패 매핑: LOGIN_FAILED→invalid, ACCOUNT_SUSPENDED→suspended(서버 문구), 500·네트워크→unavailable', async () => {
  const { fake, session, storage } = setup()
  fake.on(
    'POST /auth/login',
    fail(401, 'LOGIN_FAILED'),
    fail(403, 'ACCOUNT_SUSPENDED'),
    fail(500, 'INTERNAL_ERROR'),
    networkError(),
  )
  assert.equal((await session.login('a', 'b')).reason, 'invalid')
  const suspended = await session.login('a', 'b')
  assert.equal(suspended.reason, 'suspended')
  assert.equal(suspended.message, 'msg:ACCOUNT_SUSPENDED')
  assert.equal((await session.login('a', 'b')).reason, 'unavailable')
  assert.equal((await session.login('a', 'b')).reason, 'unavailable')
  assert.equal(storage.map.size, 0)
  assert.equal(fake.calls.filter((c) => c.key === 'GET /users/me').length, 0)
})

test('로그인 회원 ≠ /users/me 회원, 또는 확인 GET 401: 실패·토큰 미확정·보상 logout 1회', async () => {
  for (const meResponse of [
    me(99),
    fail(401, 'INVALID_TOKEN'),
    fail(503, 'UNAVAILABLE'),
  ]) {
    const { fake, session, storage } = setup()
    fake.on('POST /auth/login', loginOk(7, 'access-A1'))
    fake.on('GET /users/me', meResponse)
    fake.on('POST /auth/logout', noContent())
    const outcome = await session.login('a', 'b')
    assert.equal(outcome.reason, 'unavailable')
    await flush()
    assert.deepEqual(fake.keys(), [
      'POST /auth/login',
      'GET /users/me',
      'POST /auth/logout',
    ])
    assert.equal(fake.calls[2].headers['X-Requested-With'], 'XMLHttpRequest')
    assert.equal(fake.auth(2), null)
    assert.equal(storage.map.size, 0)
    await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
    assert.equal(fake.calls.length, 3)
  }
})

test('③ 로그인 확인 전 임시 토큰은 일반 보호 요청에 쓰이지 않는다', async () => {
  const { fake, session } = setup()
  const meHold = deferred()
  fake.on('POST /auth/login', loginOk(7, 'access-A1'))
  fake.on('GET /users/me', meHold)
  const pending = session.login('a', 'b')
  await flush()
  await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
  assert.deepEqual(fake.keys(), ['POST /auth/login', 'GET /users/me'])
  meHold.resolve(me(7))
  assert.equal((await pending).ok, true)
})

test('보상 logout은 지금 세대일 때만: 확인 실패 전에 새 로그인이 시작됐으면 보내지 않는다', async () => {
  const { fake, session } = setup()
  const meHold = deferred()
  fake.on('POST /auth/login', loginOk(7, 'access-A1'), loginOk(8, 'access-B1'))
  fake.on('GET /users/me', meHold, me(8))
  const first = session.login('a', 'b')
  await flush()
  const second = session.login('c', 'd')
  meHold.resolve(fail(401, 'INVALID_TOKEN'))
  assert.equal((await first).ok, false)
  assert.equal((await second).ok, true)
  await flush()
  assert.ok(!fake.keys().includes('POST /auth/logout'))
})

test('① 정상 로그인은 자기 세대 때문에 버려지지 않는다(성공 때 세대를 올리지 않음)', async () => {
  const { fake, session } = setup()
  fake.on('POST /auth/login', loginOk(7, 'access-A1'))
  fake.on('GET /users/me', me(7))
  const outcome = await session.login('a', 'b')
  assert.ok(session.isCurrent(outcome.gen))
})

test('세대: logout 뒤 늦게 끝난 login 성공은 인증을 복원하지 않는다', async () => {
  const { fake, session, storage } = setup()
  const meHold = deferred()
  fake.on('POST /auth/login', loginOk(7, 'access-A1'))
  fake.on('GET /users/me', meHold)
  fake.on('POST /auth/logout', noContent())
  const pending = session.login('a', 'b')
  await flush()
  void session.logout()
  meHold.resolve(me(7))
  const outcome = await pending
  assert.equal(outcome.ok, false)
  assert.equal(storage.map.size, 0)
  await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
})

// ---------------------------------------------------------------- 쿠키 변경 대기열(F-2)

test('순서: logout 응답 전 새 login은 logout 응답 뒤에 보낸다', async () => {
  const { fake, session } = await loggedIn()
  const logoutHold = deferred()
  fake.on('POST /auth/logout', logoutHold)
  fake.on('POST /auth/login', loginOk(8, 'access-B1'))
  fake.on('GET /users/me', me(8))
  void session.logout()
  const pending = session.login('c', 'd')
  await flush()
  assert.deepEqual(fake.keys(), ['POST /auth/logout'])
  logoutHold.resolve(noContent())
  assert.equal((await pending).ok, true)
  assert.deepEqual(fake.keys(), [
    'POST /auth/logout',
    'POST /auth/login',
    'GET /users/me',
  ])
})

test('순서: cookieChanging 요청(비밀번호 변경) 진행 중 login은 그 응답 뒤에 보낸다', async () => {
  const { fake, session } = await loggedIn()
  const pwHold = deferred()
  fake.on('PATCH /users/me/password', pwHold)
  fake.on('POST /auth/login', loginOk(1, 'access-A2'))
  fake.on('GET /users/me', me(1))
  const change = session.request('PATCH', '/users/me/password', {
    body: {},
    cookieChanging: true,
  })
  await flush()
  const login = session.login('a', 'b')
  await flush()
  assert.deepEqual(fake.keys(), ['PATCH /users/me/password'])
  pwHold.resolve(noContent())
  await change
  assert.equal((await login).ok, true)
  assert.deepEqual(fake.keys(), [
    'PATCH /users/me/password',
    'POST /auth/login',
    'GET /users/me',
  ])
})

test('④ 대기열 작업이 실패해도 다음 login은 실행된다', async () => {
  const { fake, session } = setup()
  fake.on('POST /auth/login', networkError(), loginOk(7, 'access-A1'))
  fake.on('GET /users/me', me(7))
  assert.equal((await session.login('a', 'b')).reason, 'unavailable')
  assert.equal((await within(session.login('a', 'b'))).ok, true)
})

test('R2 cookieChanging은 auth none·비회원 optional에서도 대기열을 거친다(진행 중 login 응답 뒤에 전송, 토큰 없음)', async () => {
  for (const auth of ['none', 'optional']) {
    const { fake, session } = setup()
    const loginHold = deferred()
    fake.on('POST /auth/login', loginHold)
    fake.on('POST /public-cookie', noContent())
    const login = session.login('a', 'b')
    await flush()
    const request = session.request('POST', '/public-cookie', {
      auth,
      cookieChanging: true,
      body: {},
    })
    await flush()
    assert.deepEqual(fake.keys(), ['POST /auth/login'], auth)
    loginHold.resolve(fail(401, 'LOGIN_FAILED'))
    await login
    await request
    assert.deepEqual(
      fake.keys(),
      ['POST /auth/login', 'POST /public-cookie'],
      auth,
    )
    assert.equal(fake.auth(1), null, auth)
  }
})

test('R4 보상 logout을 등록한 뒤·실행하기 전에 새 login이 시작되면 실행 직전 재확인으로 건너뛴다', async () => {
  const { fake, session } = setup()
  const meHold = deferred()
  const blocker = deferred()
  fake.on('POST /auth/login', loginOk(7, 'access-A1'), loginOk(8, 'access-B1'))
  fake.on('GET /users/me', meHold, me(8))
  fake.on('POST /public-cookie', blocker)
  const first = session.login('a', 'b')
  await flush()
  // 세션과 무관한 cookieChanging 요청으로 대기열을 붙잡는다(이 작업은 세대가 바뀌어도 건너뛰지 않음).
  const occupy = session.request('POST', '/public-cookie', {
    auth: 'none',
    cookieChanging: true,
  })
  await flush()
  // login A 확인 실패 → 보상 logout이 대기열(/public-cookie 뒤)에 등록된다(등록 시점에는 A가 지금 세대).
  meHold.resolve(fail(401, 'INVALID_TOKEN'))
  assert.equal((await first).ok, false)
  // 등록 후·실행 전 세대 변경
  const second = session.login('c', 'd')
  blocker.resolve(noContent())
  await occupy
  assert.equal((await second).ok, true)
  // 보상 logout은 보내지 않았고, login B는 그 자리 뒤에서 실행됐다.
  assert.deepEqual(fake.keys(), [
    'POST /auth/login',
    'GET /users/me',
    'POST /public-cookie',
    'POST /auth/login',
    'GET /users/me',
  ])
})

test('⑥ 명시적 logout 뒤 아직 보내지 않은 이전 세대 재발급은 건너뛰고, logout은 건너뛰지 않는다', async () => {
  const { fake, session } = await loggedIn()
  const pwHold = deferred()
  fake.on('PATCH /users/me/password', pwHold)
  fake.on('GET /x', fail(401, 'TOKEN_EXPIRED'))
  fake.on('POST /auth/logout', noContent())
  // 대기열을 붙잡아 재발급이 대기열 안에서 기다리게 만든다.
  const change = session.request('PATCH', '/users/me/password', {
    body: {},
    cookieChanging: true,
  })
  await flush()
  const request = session.request('GET', '/x')
  await flush()
  void session.logout()
  pwHold.resolve(noContent())
  await change
  await rejectsWith(request, 401, 'TOKEN_EXPIRED')
  await flush()
  assert.deepEqual(fake.keys(), [
    'PATCH /users/me/password',
    'GET /x',
    'POST /auth/logout',
  ])
})

test('④ cookieChanging 요청의 TOKEN_EXPIRED → 재발급 → 재시도가 교착 없이 끝나고 재시도도 대기열을 거친다', async () => {
  const { fake, session } = await loggedIn()
  fake.on('PATCH /users/me/password', fail(401, 'TOKEN_EXPIRED'), noContent())
  fake.on('POST /auth/token/refresh', refreshOk('access-A2'))
  fake.on('GET /users/me', me(1))
  await within(
    session.request('PATCH', '/users/me/password', {
      body: {},
      cookieChanging: true,
    }),
  )
  assert.deepEqual(fake.keys(), [
    'PATCH /users/me/password',
    'POST /auth/token/refresh',
    'GET /users/me',
    'PATCH /users/me/password',
  ])
  assert.equal(fake.auth(3), 'Bearer access-A2')
})

test('cookieChanging 재시도도 세대 확인: 재발급 중 로그아웃하면 이전 회원 요청을 다시 보내지 않는다', async () => {
  const { fake, session } = await loggedIn()
  const refreshHold = deferred()
  fake.on('PATCH /users/me/password', fail(401, 'TOKEN_EXPIRED'))
  fake.on('POST /auth/token/refresh', refreshHold)
  fake.on('POST /auth/logout', noContent())
  const change = session.request('PATCH', '/users/me/password', {
    body: {},
    cookieChanging: true,
  })
  await flush()
  void session.logout()
  refreshHold.resolve(refreshOk('access-A2'))
  await assert.rejects(change)
  await flush()
  assert.deepEqual(fake.keys(), [
    'PATCH /users/me/password',
    'POST /auth/token/refresh',
    'POST /auth/logout',
  ])
})

// ---------------------------------------------------------------- 재발급

test('재발급: TOKEN_EXPIRED → refresh(X-Requested-With, Bearer 없음) → /users/me → 원요청 1회 재시도', async () => {
  const { fake, session } = await loggedIn()
  fake.on('POST /records', fail(401, 'TOKEN_EXPIRED'), ok({ id: 5 }, 201))
  fake.on('POST /auth/token/refresh', refreshOk('access-A2'))
  fake.on('GET /users/me', me(1))
  assert.deepEqual(
    await session.request('POST', '/records', { body: { a: 1 } }),
    { id: 5 },
  )
  assert.deepEqual(fake.keys(), [
    'POST /records',
    'POST /auth/token/refresh',
    'GET /users/me',
    'POST /records',
  ])
  assert.equal(fake.calls[1].headers['X-Requested-With'], 'XMLHttpRequest')
  assert.equal(fake.auth(1), null)
  assert.equal(fake.auth(2), 'Bearer access-A2')
  assert.equal(fake.auth(3), 'Bearer access-A2')
})

test('재발급 single-flight: 동시 3요청이 재발급 1번을 공유한다', async () => {
  const { fake, session } = await loggedIn()
  const refreshHold = deferred()
  fake.on('GET /a', fail(401, 'TOKEN_EXPIRED'), ok('a'))
  fake.on('GET /b', fail(401, 'TOKEN_EXPIRED'), ok('b'))
  fake.on('GET /c', fail(401, 'TOKEN_EXPIRED'), ok('c'))
  fake.on('POST /auth/token/refresh', refreshHold)
  fake.on('GET /users/me', me(1))
  const all = Promise.all(
    ['/a', '/b', '/c'].map((p) => session.request('GET', p)),
  )
  await flush()
  refreshHold.resolve(refreshOk('access-A2'))
  assert.deepEqual(await all, ['a', 'b', 'c'])
  assert.equal(
    fake.keys().filter((k) => k === 'POST /auth/token/refresh').length,
    1,
  )
  assert.equal(fake.keys().filter((k) => k === 'GET /users/me').length, 1)
})

test('한 요청의 취소는 공유 재발급을 취소하지 않는다', async () => {
  const { fake, session } = await loggedIn()
  const refreshHold = deferred()
  fake.on('GET /a', fail(401, 'TOKEN_EXPIRED'))
  fake.on('GET /b', fail(401, 'TOKEN_EXPIRED'), ok('b'))
  fake.on('POST /auth/token/refresh', refreshHold)
  fake.on('GET /users/me', me(1))
  const controller = new AbortController()
  const a = session.request('GET', '/a', { signal: controller.signal })
  const b = session.request('GET', '/b')
  await flush()
  controller.abort()
  await assert.rejects(a, (e) => e.name === 'AbortError')
  assert.equal(
    fake.calls.find((c) => c.key === 'POST /auth/token/refresh').signal,
    undefined,
  )
  refreshHold.resolve(refreshOk('access-A2'))
  assert.equal(await b, 'b')
  assert.equal(fake.keys().filter((k) => k === 'GET /a').length, 1)
})

test('재발급 뒤 늦게 온 옛 토큰의 401은 재발급 없이 현재 토큰으로 1회 재시도', async () => {
  const { fake, session } = await loggedIn()
  const slowHold = deferred()
  fake.on('GET /slow', slowHold, ok('slow'))
  fake.on('GET /fast', fail(401, 'TOKEN_EXPIRED'), ok('fast'))
  fake.on('POST /auth/token/refresh', refreshOk('access-A2'))
  fake.on('GET /users/me', me(1))
  const slow = session.request('GET', '/slow')
  await flush()
  assert.equal(await session.request('GET', '/fast'), 'fast')
  slowHold.resolve(fail(401, 'TOKEN_EXPIRED'))
  assert.equal(await slow, 'slow')
  assert.equal(
    fake.keys().filter((k) => k === 'POST /auth/token/refresh').length,
    1,
  )
  assert.equal(fake.calls.at(-1).headers.Authorization, 'Bearer access-A2')
})

test('재시도도 401이면 반복 없이 실패하고 지금 세대·토큰이면 로컬 종료(서버 logout 없음)', async () => {
  const { fake, session, ended, storage } = await loggedIn()
  fake.on('GET /a', fail(401, 'TOKEN_EXPIRED'), fail(401, 'TOKEN_EXPIRED'))
  fake.on('POST /auth/token/refresh', refreshOk('access-A2'))
  fake.on('GET /users/me', me(1))
  await rejectsWith(session.request('GET', '/a'), 401, 'TOKEN_EXPIRED')
  assert.deepEqual(fake.keys(), [
    'GET /a',
    'POST /auth/token/refresh',
    'GET /users/me',
    'GET /a',
  ])
  assert.deepEqual(ended, ['expired'])
  assert.equal(storage.map.size, 0)
})

test('REFRESH_INVALID: 300ms 대기 후 1회 재시도, 두 번째도 실패면 종료(재발급 최대 2시도, 원요청 재전송 없음)', async () => {
  const { fake, session, ended, sleeps } = await loggedIn()
  fake.on('POST /records', fail(401, 'TOKEN_EXPIRED'))
  fake.on(
    'POST /auth/token/refresh',
    fail(401, 'REFRESH_INVALID'),
    fail(401, 'REFRESH_INVALID'),
  )
  await rejectsWith(
    session.request('POST', '/records', { body: {} }),
    401,
    'TOKEN_EXPIRED',
  )
  assert.deepEqual(fake.keys(), [
    'POST /records',
    'POST /auth/token/refresh',
    'POST /auth/token/refresh',
  ])
  assert.deepEqual(sleeps, [300])
  assert.deepEqual(ended, ['expired'])
})

test('REFRESH_INVALID 뒤 재시도 성공이면 세션 유지', async () => {
  const { fake, session, ended } = await loggedIn()
  fake.on('GET /a', fail(401, 'TOKEN_EXPIRED'), ok('a'))
  fake.on(
    'POST /auth/token/refresh',
    fail(401, 'REFRESH_INVALID'),
    refreshOk('access-A2'),
  )
  fake.on('GET /users/me', me(1))
  assert.equal(await session.request('GET', '/a'), 'a')
  assert.deepEqual(ended, [])
})

test('refresh 네트워크·500은 세션 유지, 원요청은 그 오류로 실패하고 재전송 없음', async () => {
  const { fake, session, ended, storage } = await loggedIn()
  fake.on(
    'POST /records',
    fail(401, 'TOKEN_EXPIRED'),
    fail(401, 'TOKEN_EXPIRED'),
  )
  fake.on(
    'POST /auth/token/refresh',
    networkError(),
    fail(500, 'INTERNAL_ERROR'),
  )
  await rejectsWith(
    session.request('POST', '/records', { body: {} }),
    0,
    'NETWORK',
  )
  await rejectsWith(
    session.request('POST', '/records', { body: {} }),
    500,
    'INTERNAL_ERROR',
  )
  assert.equal(fake.keys().filter((k) => k === 'POST /records').length, 2)
  assert.deepEqual(ended, [])
  assert.deepEqual(hintOf(storage), { v: 1, userId: 1 })
})

test('⑤ refresh 200 뒤 확인 GET 503: 세션·힌트 유지, 원요청 재전송 없음 / 401: 로컬 종료, 재전송 없음', async () => {
  {
    const { fake, session, ended, storage } = await loggedIn()
    fake.on('POST /records', fail(401, 'TOKEN_EXPIRED'), ok('again'))
    fake.on('POST /auth/token/refresh', refreshOk('access-A2'))
    fake.on('GET /users/me', fail(503, 'UNAVAILABLE'))
    await rejectsWith(
      session.request('POST', '/records', { body: {} }),
      503,
      'UNAVAILABLE',
    )
    assert.equal(fake.keys().filter((k) => k === 'POST /records').length, 1)
    assert.deepEqual(ended, [])
    assert.deepEqual(hintOf(storage), { v: 1, userId: 1 })
    // 후보 토큰은 확정되지 않았다: 다음 요청은 이전 토큰을 쓴다.
    fake.on('GET /z', ok('z'))
    await session.request('GET', '/z')
    assert.equal(fake.calls.at(-1).headers.Authorization, 'Bearer access-A1')
  }
  {
    const { fake, session, ended } = await loggedIn()
    fake.on('POST /records', fail(401, 'TOKEN_EXPIRED'))
    fake.on('POST /auth/token/refresh', refreshOk('access-A2'))
    fake.on('GET /users/me', fail(401, 'INVALID_TOKEN'))
    await rejectsWith(
      session.request('POST', '/records', { body: {} }),
      401,
      'TOKEN_EXPIRED',
    )
    assert.equal(fake.keys().filter((k) => k === 'POST /records').length, 1)
    assert.deepEqual(ended, ['expired'])
  }
})

test('D10 ② 사용 중 재발급 결과가 다른 회원 B: 후보 B 토큰은 확인 GET 1회에만, 업무 요청·대기 요청 재전송 없음, accountChanged 로컬 종료', async () => {
  const { fake, session, ended, storage } = await loggedIn(1, 'access-A1')
  const refreshHold = deferred()
  fake.on('POST /records', fail(401, 'TOKEN_EXPIRED'))
  fake.on('PATCH /profile', fail(401, 'TOKEN_EXPIRED'))
  fake.on('POST /auth/token/refresh', refreshHold)
  fake.on('GET /users/me', me(2))
  const post = session.request('POST', '/records', { body: { kcal: 1 } })
  const patch = session.request('PATCH', '/profile', { body: { n: 1 } })
  await flush()
  refreshHold.resolve(refreshOk('access-B1'))
  await rejectsWith(post, 401, 'TOKEN_EXPIRED')
  await rejectsWith(patch, 401, 'TOKEN_EXPIRED')
  const withB = fake.calls.filter(
    (c) => c.headers.Authorization === 'Bearer access-B1',
  )
  assert.deepEqual(
    withB.map((c) => c.key),
    ['GET /users/me'],
  )
  assert.equal(fake.keys().filter((k) => k === 'POST /records').length, 1)
  assert.equal(fake.keys().filter((k) => k === 'PATCH /profile').length, 1)
  assert.ok(!fake.keys().includes('POST /auth/logout'))
  assert.deepEqual(ended, ['accountChanged'])
  assert.equal(storage.map.size, 0)
  await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
})

test('새 login 뒤 옛 요청의 401은 새 세션을 지우지 않는다', async () => {
  const { fake, session, ended } = await loggedIn(1, 'access-A1')
  const oldHold = deferred()
  fake.on('GET /old', oldHold)
  fake.on('POST /auth/login', loginOk(2, 'access-B1'))
  fake.on('GET /users/me', me(2))
  const old = session.request('GET', '/old')
  await flush()
  assert.equal((await session.login('b', 'c')).ok, true)
  oldHold.resolve(fail(401, 'INVALID_TOKEN'))
  await rejectsWith(old, 401, 'INVALID_TOKEN')
  assert.deepEqual(ended, [])
  fake.on('GET /x', ok(1))
  await session.request('GET', '/x')
  assert.equal(fake.calls.at(-1).headers.Authorization, 'Bearer access-B1')
})

// ---------------------------------------------------------------- 401/403 표

test('401/403 표: 응답별 재발급 여부·로컬 종료 여부·원요청 재전송 여부', async () => {
  const table = [
    // [응답, 재발급, 종료 사유(null=종료 없음)]
    [() => fail(401, 'INVALID_TOKEN'), false, 'expired'],
    [() => fail(401, 'LOGIN_REQUIRED'), false, 'expired'],
    [() => fail(403, 'ACCOUNT_SUSPENDED'), false, 'suspended'],
    [() => fail(403, 'PIN_REQUIRED'), false, null],
    [() => fail(403, 'PIN_EXPIRED'), false, null],
    [() => fail(403, 'PIN_LOCKED'), false, null],
    [() => fail(403, 'PIN_NOT_REGISTERED'), false, null],
    [() => fail(403, 'ACCESS_DENIED'), false, null],
    [() => fail(403, 'CSRF_REJECTED'), false, null],
    [() => fail(500, 'INTERNAL_ERROR'), false, null],
    [() => networkError(), false, null],
  ]
  for (const mode of ['required', 'optional']) {
    for (const [response, refreshes, endReason] of table) {
      const { fake, session, ended } = await loggedIn()
      fake.on('POST /r', response())
      await assert.rejects(
        session.request('POST', '/r', { auth: mode, body: {} }),
      )
      assert.equal(fake.keys().includes('POST /auth/token/refresh'), refreshes)
      assert.equal(fake.keys().filter((k) => k === 'POST /r').length, 1)
      assert.deepEqual(
        ended,
        endReason ? [endReason] : [],
        `${mode} ${fake.calls[0].key}`,
      )
    }
  }
  // none 모드는 어떤 응답이든 세션을 건드리지 않는다.
  for (const [response] of table) {
    const { fake, session, ended } = await loggedIn()
    fake.on('POST /r', response())
    await assert.rejects(
      session.request('POST', '/r', { auth: 'none', body: {} }),
    )
    assert.deepEqual(ended, [])
    assert.equal(fake.calls.length, 1)
  }
  // none·비회원 optional의 TOKEN_EXPIRED도 재발급하지 않는다.
  const { fake, session } = await loggedIn()
  fake.on('POST /r', fail(401, 'TOKEN_EXPIRED'))
  await assert.rejects(session.request('POST', '/r', { auth: 'none' }))
  assert.deepEqual(fake.keys(), ['POST /r'])
})

test('세션 종료 통지는 1회, 명시적 logout 뒤에는 통지 없음', async () => {
  const { fake, session, ended } = await loggedIn()
  fake.on('GET /a', fail(401, 'INVALID_TOKEN'))
  fake.on('GET /b', fail(401, 'INVALID_TOKEN'))
  await assert.rejects(session.request('GET', '/a'))
  await rejectsWith(session.request('GET', '/b'), 401, 'LOGIN_REQUIRED')
  assert.deepEqual(ended, ['expired'])

  const second = await loggedIn()
  second.fake.on('POST /auth/logout', noContent())
  const held = deferred()
  second.fake.on('GET /c', held)
  const c = second.session.request('GET', '/c')
  await flush()
  void second.session.logout()
  held.resolve(fail(401, 'INVALID_TOKEN'))
  await assert.rejects(c)
  assert.deepEqual(second.ended, [])
})

// ---------------------------------------------------------------- 앱 시작 확인(resume)

function withHint(userId) {
  const storage = createStorage()
  storage.map.set(HINT, JSON.stringify({ v: 1, userId }))
  return storage
}

test('시작 확인: 힌트 없음·손상·다른 형식·저장소 차단이면 요청 없이 null', async () => {
  for (const storage of [
    createStorage(),
    (() => {
      const s = createStorage()
      s.map.set(HINT, '{oops')
      return s
    })(),
    (() => {
      const s = createStorage()
      s.map.set(HINT, JSON.stringify({ v: 1, userId: '7' }))
      return s
    })(),
    createStorage({ broken: true }),
  ]) {
    const { fake, session } = setup({ storage })
    assert.equal(session.resume(), null)
    assert.equal(fake.calls.length, 0)
    // 손상·다른 형식 힌트는 지운다(차단된 저장소는 지울 수 없어 그대로 둔다).
    assert.equal(storage.map.size, 0)
  }
})

test('시작 확인: 힌트 A·쿠키 A → refresh(대기열)·/users/me 1회씩, 확정, StrictMode 이중 호출은 같은 작업', async () => {
  const storage = withHint(1)
  const { fake, session } = setup({ storage })
  fake.on('POST /auth/token/refresh', refreshOk('access-A1'))
  fake.on('GET /users/me', me(1))
  const first = session.resume()
  const second = session.resume()
  assert.equal(first, second)
  const outcome = await first
  assert.equal(outcome.ok, true)
  assert.equal(outcome.switchedAccount, false)
  assert.deepEqual(fake.keys(), ['POST /auth/token/refresh', 'GET /users/me'])
  assert.equal(fake.calls[0].headers['X-Requested-With'], 'XMLHttpRequest')
  fake.on('GET /x', ok(1))
  await session.request('GET', '/x')
  assert.equal(fake.calls.at(-1).headers.Authorization, 'Bearer access-A1')
  assertNoTokenInStorage(storage)
})

test('시작 확인: 확정 실패(REFRESH_INVALID 2회·확인 GET 401·정지)는 ended + 힌트 삭제', async () => {
  const cases = [
    [[fail(401, 'REFRESH_INVALID'), fail(401, 'REFRESH_INVALID')], []],
    [[refreshOk('access-A1')], [fail(401, 'INVALID_TOKEN')]],
    [[fail(403, 'ACCOUNT_SUSPENDED')], []],
    [[refreshOk('access-A1')], [fail(403, 'ACCOUNT_SUSPENDED')]],
  ]
  for (const [refreshes, mes] of cases) {
    const storage = withHint(1)
    const { fake, session } = setup({ storage })
    fake.on('POST /auth/token/refresh', ...refreshes)
    if (mes.length) fake.on('GET /users/me', ...mes)
    const outcome = await session.resume()
    assert.equal(outcome.kind, 'ended')
    assert.equal(storage.map.size, 0)
    assert.ok(!fake.keys().includes('POST /auth/logout'))
  }
})

test('시작 확인 D7: 네트워크·5xx·형식 오류는 transient, 힌트 유지, 일반 요청은 bootstrap하지 않음', async () => {
  for (const [refresh, meResponse] of [
    [networkError(), null],
    [fail(502, 'BAD_GATEWAY'), null],
    [ok({}), null],
    [refreshOk('access-A1'), fail(503, 'UNAVAILABLE')],
  ]) {
    const storage = withHint(1)
    const { fake, session } = setup({ storage })
    fake.on('POST /auth/token/refresh', refresh)
    if (meResponse) fake.on('GET /users/me', meResponse)
    const outcome = await session.resume()
    assert.equal(outcome.kind, 'transient')
    assert.deepEqual(hintOf(storage), { v: 1, userId: 1 })
    const before = fake.calls.length
    await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
    assert.equal(fake.calls.length, before)
    // 같은 페이지에서는 시작 확인을 새로 만들지 않는다: 같은 세대면 이미 끝난 작업을 그대로 돌려주고 요청은 늘지 않는다.
    const again = session.resume()
    assert.equal((await again).kind, 'transient')
    assert.equal(fake.calls.length, before)
  }
})

test('D10 ① 시작 확인 힌트 A·쿠키 B: 회원 확인 GET은 허용, activate(=A 정리 완료) 전 업무 요청은 요청 없이 차단, 그 뒤에만 B로 요청', async () => {
  const storage = withHint(1)
  storage.map.set('mealthroutine.account.1.draft', 'A draft')
  const { fake, session, ended } = setup({ storage })
  fake.on('POST /auth/token/refresh', refreshOk('access-B1'))
  fake.on('GET /users/me', me(2))
  const outcome = await session.resume()
  assert.equal(outcome.ok, true)
  assert.equal(outcome.switchedAccount, true)
  assert.equal(outcome.me.userId, 2)
  // 서버 확인은 끝났지만 아직 확정 전: B 토큰은 회원 확인 GET에만 쓰였다.
  assert.deepEqual(fake.keys(), ['POST /auth/token/refresh', 'GET /users/me'])
  assert.equal(fake.auth(1), 'Bearer access-B1')
  assert.deepEqual(hintOf(storage), { v: 1, userId: 1 })
  // Codex R1 재현 순서: 정리 전 A 초안을 읽어 업무 요청 → 요청 없이 LOGIN_REQUIRED(본문 A·토큰 B 전송 0회)
  const draft = storage.map.get('mealthroutine.account.1.draft')
  await rejectsWith(
    session.request('POST', '/save', { body: { draft } }),
    401,
    'LOGIN_REQUIRED',
  )
  assert.equal(
    fake.calls.filter((c) => c.headers.Authorization === 'Bearer access-B1')
      .length,
    1,
  )
  assert.equal(fake.keys().includes('POST /save'), false)
  // A 정리(호출하는 쪽) 뒤 activate → 그때 B 확정
  storage.map.delete('mealthroutine.account.1.draft')
  assert.equal(outcome.activate(), true)
  assert.deepEqual(hintOf(storage), { v: 1, userId: 2 })
  fake.on('POST /save', ok(1))
  await session.request('POST', '/save', { body: {} })
  assert.equal(fake.calls.at(-1).headers.Authorization, 'Bearer access-B1')
  assert.deepEqual(ended, [])
  assert.ok(!fake.keys().includes('POST /auth/logout'))
})

test('D10 ① activate 전에 수동 로그인이 시작되면 activate는 false이고 B 토큰·힌트를 확정하지 않는다', async () => {
  const storage = withHint(1)
  const { fake, session } = setup({ storage })
  const loginHold = deferred()
  fake.on('POST /auth/token/refresh', refreshOk('access-B1'))
  fake.on('GET /users/me', me(2))
  fake.on('POST /auth/login', loginHold)
  const outcome = await session.resume()
  const login = session.login('c', 'd')
  assert.equal(outcome.activate(), false)
  assert.deepEqual(hintOf(storage), { v: 1, userId: 1 })
  await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
  loginHold.resolve(fail(401, 'LOGIN_FAILED'))
  assert.equal((await login).reason, 'invalid')
  await rejectsWith(session.request('GET', '/x'), 401, 'LOGIN_REQUIRED')
  assert.ok(!fake.keys().includes('GET /x'))
})

test('② 시작 확인 A의 /users/me를 보류한 채 수동 login C: A가 먼저든 나중이든 C만 확정, 늦은 결과는 힌트를 바꾸지 않음', async () => {
  for (const order of ['resume-first', 'login-first']) {
    const storage = withHint(1)
    const { fake, session } = setup({ storage })
    const meA = deferred()
    const meC = deferred()
    fake.on('POST /auth/token/refresh', refreshOk('access-B1'))
    fake.on('GET /users/me', meA, meC)
    fake.on('POST /auth/login', loginOk(3, 'access-C1'))
    const resume = session.resume()
    await flush()
    const login = session.login('c', 'd')
    await flush()
    if (order === 'resume-first') {
      meA.resolve(me(2))
      await flush()
      meC.resolve(me(3))
    } else {
      meC.resolve(me(3))
      await flush()
      meA.resolve(me(2))
    }
    const resumed = await resume
    const loggedInC = await login
    assert.equal(session.isCurrent(resumed.gen), false, order)
    assert.equal(loggedInC.ok, true)
    assert.ok(session.isCurrent(loggedInC.gen))
    assert.deepEqual(hintOf(storage), { v: 1, userId: 3 }, order)
    fake.on('GET /x', ok(1))
    await session.request('GET', '/x')
    assert.equal(
      fake.calls.at(-1).headers.Authorization,
      'Bearer access-C1',
      order,
    )
  }
})

test('시작 확인의 REFRESH_INVALID 재시도 대기 중 수동 login이 시작되면 두 번째 refresh를 보내지 않는다', async () => {
  const storage = withHint(1)
  const sleepHold = deferred()
  const { fake, session } = setup({ storage, sleep: () => sleepHold.promise })
  fake.on('POST /auth/token/refresh', fail(401, 'REFRESH_INVALID'))
  fake.on('POST /auth/login', loginOk(3, 'access-C1'))
  fake.on('GET /users/me', me(3))
  const resume = session.resume()
  await flush()
  const login = session.login('c', 'd')
  sleepHold.resolve()
  assert.equal((await login).ok, true)
  const resumed = await resume
  assert.equal(session.isCurrent(resumed.gen), false)
  assert.equal(
    fake.keys().filter((k) => k === 'POST /auth/token/refresh').length,
    1,
  )
})
