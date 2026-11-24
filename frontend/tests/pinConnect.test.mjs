// F4 프론트 PIN 서버 연결(계획 v1.2 5장): 실제/모의 모드 선택 · 4개 API의 경로·본문·성공 상태 코드 · 서버 오류 → 화면 오류 변환 ·
// 결과 미확인(등록·변경)과 연결 실패(조회·확인) 구분, 자동 재전송·모의 전환 없음 · PIN 토큰 메모리 보관(요청 시작 기준 만료, 응답 검증) ·
// 늦은 응답 무효화(로그인 작업 표식 R1 + PIN 자체 폐기 번호 v1.2 R1) · 잠금 화면(F4-D4: 안내만, 제출 허용, 재조회 버튼) · 같은 번호 허용(F4-D7).
// 실제 서버·실제 계정·실제 PIN은 쓰지 않는다(가짜 fetch, 'tok-A1' 같은 가짜 토큰, 테스트용 번호). 보류 Promise(deferred)로 순서를 강제한다.
// 개인 .env.development.local의 VITE_DEV_AUTH 값이 결과를 바꾸지 않도록 빈 envDir을 쓴다. 윈도우 PowerShell에서도 같은 명령으로 실행한다.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
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
  within,
} from './apiTestKit.mjs'

const envDir = mkdtempSync(join(tmpdir(), 'pin-connect-env-'))
const storage = createStorage()
let realServer, mockServer
let pin, mockPin, store, messages, policy, types, session, backendModule
let ctx, scope, Body

async function devServer(devAuth) {
  if (devAuth) process.env.VITE_DEV_AUTH = 'true'
  else delete process.env.VITE_DEV_AUTH
  const server = await createServer({
    envDir,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  delete process.env.VITE_DEV_AUTH
  return server
}

before(async () => {
  globalThis.sessionStorage = storage
  realServer = await devServer(false)
  mockServer = await devServer(true)
  const load = (path) => realServer.ssrLoadModule(path)
  pin = await load('/src/pin-settings/pinSource.ts')
  store = await load('/src/pin-settings/pinTokenStore.ts')
  messages = await load('/src/pin-settings/pinSettingsMessages.ts')
  policy = await load('/src/pin-settings/pinSettingsPolicy.ts')
  types = await load('/src/exercise-goal/exerciseGoalTypes.ts')
  session = await load('/src/api/session.ts')
  backendModule = await load('/src/auth/serverBackend.ts')
  ctx = await load('/src/auth/authContext.ts')
  scope = await load('/src/auth/accountScope.ts')
  Body = (await load('/src/components/pin-settings/PinSettingsView.tsx'))
    .PinSettingsBody
  mockPin = await mockServer.ssrLoadModule('/src/pin-settings/pinSource.ts')
})
after(async () => {
  await realServer?.close()
  await mockServer?.close()
  delete globalThis.sessionStorage
  rmSync(envDir, { recursive: true, force: true })
})
beforeEach(() => {
  storage.map.clear()
  store.clearPinToken()
})

const T0 = Date.parse('2026-11-24T03:00:00.000Z')
const PIN = '012345'
const NEW_PIN = '987654'

/** 가짜 fetch 세션 + 서버 PIN 연결. clock.t를 바꾸면 PIN 연결이 보는 시각이 바뀐다. */
function makeSession() {
  const fake = createFakeServer()
  const s = session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  const backend = backendModule.createServerBackend(s)
  const clock = { t: T0 }
  const sourceFor = (ownerId) =>
    pin.createServerPinSource(ownerId, s.request.bind(s), () => clock.t)
  return { fake, s, backend, clock, sourceFor }
}

/** 로그인하고 AuthProvider처럼 로그인 작업 번호(createLoginWork)를 만든다. */
async function login(userId = 7, token = 'tok-A1') {
  const env = makeSession()
  env.fake.on('POST /auth/login', loginOk(userId, token))
  env.fake.on('GET /users/me', me(userId))
  const result = await env.backend.login(`u${userId}@example.test`, 'x')
  assert.equal(result.ok, true)
  const user = result.user
  const work = ctx.createLoginWork(user)
  return { ...env, user, work, source: env.sourceFor(user.id) }
}

const tokenOk = (pinToken = 'pin-tok-1', expiresIn = 600) =>
  ok({ pinToken, expiresIn })
const E = () => types.ExerciseGoalError
const C = () => pin.PinConnectError
const isCode = (Cls, code) => (error) =>
  error instanceof Cls && error.code === code
const bodyOf = (fake, key) => fake.calls.filter((c) => c.key === key)

// ── 모드 선택 ──

test('모드: 개발 기본(실제)은 서버 연결이고 모의 저장소 경로가 없다, VITE_DEV_AUTH=true(모의)는 개발용 저장소를 감싼다', () => {
  const real = pin.createPinSource('u1')
  assert.equal(real.mode, 'server')
  assert.equal(real.mockGoal, undefined)
  assert.equal(typeof real.verify, 'function')
  const mock = mockPin.createPinSource('u1')
  assert.equal(mock.mode, 'mock')
  assert.equal(typeof mock.mockGoal?.unlock, 'function')
  assert.equal(mock.verify, undefined)
})

// ── 등록 여부 조회 ──

test('조회: GET /users/me/pin/status에 로그인 토큰을 붙이고 registered·locked만 쓴다(잠금 시각은 해석하지 않음, retryAt=null)', async () => {
  const { fake, source } = await login()
  fake.on(
    'GET /users/me/pin/status',
    ok({ registered: true, locked: true, lockedUntil: '2026-11-24T12:10:00' }),
    ok({ registered: false, locked: false, lockedUntil: null }),
  )
  assert.deepEqual(await source.getStatus(), {
    configured: true,
    locked: true,
    retryAt: null,
  })
  assert.deepEqual(await source.getStatus(), {
    configured: false,
    locked: false,
    retryAt: null,
  })
  const calls = bodyOf(fake, 'GET /users/me/pin/status')
  assert.equal(calls[0].headers.Authorization, 'Bearer tok-A1')
  assert.equal(calls[0].body, undefined)
})

test('조회 실패: 네트워크·5xx·형식 오류·200 아닌 성공은 연결 실패(connection)이고 다시 보내지 않는다', async () => {
  const { fake, source } = await login()
  fake.on(
    'GET /users/me/pin/status',
    networkError(),
    fail(500, 'INTERNAL_ERROR'),
    ok({ registered: 'yes', locked: false }),
    ok({ registered: true, locked: false }, 201),
  )
  for (let i = 0; i < 4; i += 1)
    await assert.rejects(source.getStatus(), isCode(C(), 'connection'))
  assert.equal(bodyOf(fake, 'GET /users/me/pin/status').length, 4)
})

// ── 등록(PUT) ──

test('등록: PUT 본문은 {newPin} 문자열 하나(확인값 미전송), 200만 성공, 응답 토큰은 보관하지 않는다(F4-D5)', async () => {
  const { fake, source, user, work } = await login()
  fake.on('PUT /users/me/pin', tokenOk('reg-tok'), tokenOk('reg-tok-2'))
  // source 자체는 공용 PIN 상태를 건드리지 않는다(폐기는 표식 확인 뒤 submitPinSettings가 한다, F4-C1)
  const before = store.currentPinEpoch()
  assert.equal(await source.register(PIN, PIN), undefined)
  assert.equal(store.currentPinEpoch(), before)
  const [call] = bodyOf(fake, 'PUT /users/me/pin')
  assert.deepEqual(call.body, { newPin: PIN })
  assert.equal(typeof call.body.newPin, 'string')
  assert.equal(store.getPinToken(user.id, T0), null)
  // 제출 경로의 등록 성공은 PIN 자체 폐기(진행 중 확인 응답 무효화)
  const values = { current: '', next: PIN, confirm: PIN }
  assert.deepEqual(
    await pin.submitPinSettings(
      source,
      'register',
      values,
      work.beginAccountWork(),
    ),
    { kind: 'done' },
  )
  assert.ok(store.currentPinEpoch() > before)
  assert.equal(store.getPinToken(user.id, T0), null)
})

test('등록 실패: 409 PIN_ALREADY_SET→pinExists, 400 INVALID_REQUEST→pinFormat, 네트워크·5xx·200 아닌 성공→결과 미확인(재전송 없음)', async () => {
  const { fake, source } = await login()
  fake.on(
    'PUT /users/me/pin',
    fail(409, 'PIN_ALREADY_SET'),
    fail(400, 'INVALID_REQUEST'),
    networkError(),
    fail(503, 'SERVICE_UNAVAILABLE'),
    noContent(),
  )
  await assert.rejects(source.register(PIN, PIN), isCode(E(), 'pinExists'))
  await assert.rejects(source.register(PIN, PIN), isCode(E(), 'pinFormat'))
  for (let i = 0; i < 3; i += 1)
    await assert.rejects(
      source.register(PIN, PIN),
      isCode(C(), 'uncertainRegister'),
    )
  assert.equal(bodyOf(fake, 'PUT /users/me/pin').length, 5)
})

// ── 변경(PATCH) ──

test('변경: PATCH 본문은 {newPin, currentPin}뿐(currentPassword·확인값 없음), 204만 성공, 성공하면 보관 토큰을 버린다', async () => {
  const { fake, source, user, work } = await login()
  store.storePinToken(user.id, 'old', T0 + 60_000, work.beginAccountWork())
  fake.on('PATCH /users/me/pin', noContent())
  const values = { current: PIN, next: NEW_PIN, confirm: NEW_PIN }
  assert.deepEqual(
    await pin.submitPinSettings(
      source,
      'change',
      values,
      work.beginAccountWork(),
    ),
    { kind: 'done' },
  )
  const [call] = bodyOf(fake, 'PATCH /users/me/pin')
  assert.deepEqual(call.body, { newPin: NEW_PIN, currentPin: PIN })
  assert.equal(store.getPinToken(user.id, T0), null)
})

test('변경 실패 변환: PIN_INVALID(+남은 횟수)·PIN_LOCKED(해제 시각 없음, 토큰 폐기)·PIN_NOT_REGISTERED·INVALID_REQUEST·429(Retry-After)', async () => {
  const { fake, source, user, work } = await login()
  fake.on(
    'PATCH /users/me/pin',
    fail(400, 'PIN_INVALID', { remainingAttempts: 3, lockedUntil: null }),
    fail(400, 'PIN_INVALID', { remainingAttempts: 'x' }),
    fail(403, 'PIN_LOCKED', { lockedUntil: '2026-11-24T12:10:00' }),
    fail(403, 'PIN_NOT_REGISTERED'),
    fail(400, 'INVALID_REQUEST'),
    fail(429, 'TOO_MANY_REQUESTS', null, { 'Retry-After': '30' }),
    fail(429, 'TOO_MANY_REQUESTS'),
  )
  const change = () => source.change(PIN, NEW_PIN, NEW_PIN)
  await assert.rejects(change(), (e) => {
    assert.ok(e instanceof E())
    assert.equal(e.code, 'pinWrong')
    assert.equal(e.remaining, 3)
    assert.equal(
      messages.pinSettingsMessage(e),
      '현재 2차 비밀번호가 일치하지 않아요. (2/5)',
    )
    return true
  })
  await assert.rejects(
    change(),
    (e) => e.code === 'pinWrong' && e.remaining === undefined,
  )
  // 지금 로그인 작업의 잠금: 제출 결과는 잠금 오류 그대로(화면 표시) + 이 탭 토큰 폐기
  store.storePinToken(user.id, 'tok', T0 + 60_000, work.beginAccountWork())
  const locked = await pin.submitPinSettings(
    source,
    'change',
    { current: PIN, next: NEW_PIN, confirm: NEW_PIN },
    work.beginAccountWork(),
  )
  assert.equal(locked.kind, 'failed')
  assert.ok(locked.error instanceof E())
  assert.equal(locked.error.code, 'locked')
  assert.equal(locked.error.retryAt, undefined)
  assert.equal(messages.isPinLockedError(locked.error), true)
  assert.equal(store.getPinToken(user.id, T0), null)
  await assert.rejects(change(), isCode(E(), 'pinMissing'))
  await assert.rejects(change(), isCode(E(), 'pinFormat'))
  await assert.rejects(change(), (e) => {
    assert.ok(e instanceof C())
    assert.equal(e.code, 'rateLimited')
    assert.equal(e.retryAfter, 30)
    assert.equal(
      messages.pinSettingsMessage(e),
      '요청이 너무 많아요. 30초 뒤 다시 시도해 주세요.',
    )
    return true
  })
  await assert.rejects(change(), (e) => {
    assert.equal(e.retryAfter, undefined)
    assert.equal(
      messages.pinSettingsMessage(e),
      '요청이 너무 많아요. 잠시 뒤 다시 시도해 주세요.',
    )
    return true
  })
})

test('변경 결과 미확인(R4): 네트워크·5xx·204 아닌 성공은 uncertainChange, 기존 save 문구("바뀌지 않았어요")를 쓰지 않고 재전송하지 않는다', async () => {
  const { fake, source } = await login()
  fake.on(
    'PATCH /users/me/pin',
    networkError(),
    fail(500, 'INTERNAL_ERROR'),
    ok(null),
  )
  for (let i = 0; i < 3; i += 1)
    await assert.rejects(source.change(PIN, NEW_PIN, NEW_PIN), (e) => {
      assert.ok(e instanceof C())
      assert.equal(e.code, 'uncertainChange')
      const text = messages.pinSettingsMessage(e)
      assert.equal(
        text,
        '변경 결과를 확인하지 못했어요. 화면을 다시 열어 현재 상태를 확인해 주세요.',
      )
      assert.doesNotMatch(text, /바뀌지 않았어요/)
      return true
    })
  assert.equal(bodyOf(fake, 'PATCH /users/me/pin').length, 3)
  assert.match(
    messages.pinSettingsMessage(new (C())('uncertainRegister')),
    /^등록 결과를 확인하지 못했어요/,
  )
  assert.equal(
    messages.pinSettingsMessage(new (C())('connection')),
    '서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
  )
})

test('서버 잠금 문구는 해제 시각을 단정하지 않고(최대 10분), 모의 잠금 문구(5분)는 그대로다', () => {
  assert.match(messages.PIN_SERVER_LOCKED_MESSAGE, /최대 10분/)
  assert.doesNotMatch(messages.PIN_SERVER_LOCKED_MESSAGE, /10분 뒤/)
  assert.match(messages.PIN_LOCKED_MESSAGE, /5분 뒤/)
  assert.equal(messages.isPinLockedError(new (E())('locked')), true)
  assert.equal(messages.isPinLockedError(new (E())('pinWrong')), false)
})

// ── 확인(verify)과 토큰 보관 ──

test('확인 성공: POST 본문 {pin}, 토큰은 저장소에만 있고 결과·저장소 API에는 없다', async () => {
  const { fake, source, user, work } = await login()
  fake.on('POST /users/me/pin/verify', tokenOk('pin-tok-1'))
  const result = await source.verify(PIN, work.beginAccountWork())
  assert.deepEqual(result, { ok: true })
  assert.doesNotMatch(JSON.stringify(result), /pin-tok-1/)
  assert.deepEqual(bodyOf(fake, 'POST /users/me/pin/verify')[0].body, {
    pin: PIN,
  })
  assert.equal(store.getPinToken(user.id, T0), 'pin-tok-1')
  assert.equal(store.getPinToken('someone-else', T0), null)
  // 다른 회원으로 읽으면 지운다
  assert.equal(store.getPinToken(user.id, T0), null)
  // 세션 저장소에 PIN·토큰 흔적이 없다(로그인 힌트만 있을 수 있다)
  for (const value of storage.map.values()) {
    assert.doesNotMatch(String(value), /pin-tok-1|012345/)
  }
})

test('만료(R2): 요청 시작 + min(expiresIn,600)초 − 5초. 응답 지연이 길어도 늦어지지 않고, 경계 시각에는 쓸 수 없다', async () => {
  for (const [delay, expiresIn, seconds] of [
    [0, 600, 595],
    [5_000, 600, 595],
    [20_000, 600, 595],
    [20_000, 900, 595],
    [0, 60, 55],
  ]) {
    const { fake, source, user, work, clock } = await login()
    const d = deferred()
    fake.on('POST /users/me/pin/verify', d)
    clock.t = T0
    const pending = source.verify(PIN, work.beginAccountWork())
    await flush()
    clock.t = T0 + delay
    d.resolve(tokenOk('t', expiresIn))
    assert.deepEqual(await within(pending), { ok: true })
    const end = T0 + seconds * 1000
    assert.equal(
      store.getPinToken(user.id, end - 1),
      't',
      `${delay}/${expiresIn}`,
    )
    assert.equal(store.getPinToken(user.id, end), null, `${delay}/${expiresIn}`)
  }
})

test('만료(R2): 받는 시점에 이미 만료면 저장·성공하지 않는다(expired)', async () => {
  const { fake, source, user, work, clock } = await login()
  const d = deferred()
  fake.on('POST /users/me/pin/verify', d)
  const pending = source.verify(PIN, work.beginAccountWork())
  await flush()
  clock.t = T0 + 595_000
  d.resolve(tokenOk('late'))
  assert.deepEqual(await within(pending), { ok: false, reason: 'expired' })
  assert.equal(store.getPinToken(user.id, T0), null)
})

test('응답 검증(R2): 빈 토큰·expiresIn 0·음수·소수·문자열·누락은 연결 실패이고 저장하지 않는다', async () => {
  const { fake, source, user, work } = await login()
  const bad = [
    ok({ pinToken: '', expiresIn: 600 }),
    ok({ pinToken: 't', expiresIn: 0 }),
    ok({ pinToken: 't', expiresIn: -1 }),
    ok({ pinToken: 't', expiresIn: 1.5 }),
    ok({ pinToken: 't', expiresIn: '600' }),
    ok({ pinToken: 't' }),
    ok(null),
  ]
  fake.on('POST /users/me/pin/verify', ...bad)
  for (let i = 0; i < bad.length; i += 1)
    await assert.rejects(
      source.verify(PIN, work.beginAccountWork()),
      isCode(C(), 'connection'),
    )
  assert.equal(store.getPinToken(user.id, T0), null)
})

test('확인 실패 변환: PIN_INVALID·PIN_NOT_REGISTERED·네트워크(connection), PIN_LOCKED는 보관 토큰도 버린다', async () => {
  const { fake, source, user, work } = await login()
  fake.on(
    'POST /users/me/pin/verify',
    fail(400, 'PIN_INVALID', { remainingAttempts: 1 }),
    fail(403, 'PIN_NOT_REGISTERED'),
    networkError(),
    fail(403, 'PIN_LOCKED', { lockedUntil: '2026-11-24T12:10:00' }),
  )
  const guard = work.beginAccountWork()
  await assert.rejects(
    source.verify(PIN, guard),
    (e) => e.code === 'pinWrong' && e.remaining === 1,
  )
  await assert.rejects(source.verify(PIN, guard), isCode(E(), 'pinMissing'))
  await assert.rejects(source.verify(PIN, guard), isCode(C(), 'connection'))
  store.storePinToken(user.id, 'tok', T0 + 60_000, guard)
  await assert.rejects(source.verify(PIN, guard), isCode(E(), 'locked'))
  assert.equal(store.getPinToken(user.id, T0), null)
})

test('표식이 없거나(로그인 전) 다른 회원·이미 무효면 요청을 보내지 않고 stale', async () => {
  const { fake, source, work, user } = await login()
  assert.deepEqual(await source.verify(PIN, null), {
    ok: false,
    reason: 'stale',
  })
  const other = ctx.createLoginWork({ ...user, id: 'other' }).beginAccountWork()
  assert.deepEqual(await source.verify(PIN, other), {
    ok: false,
    reason: 'stale',
  })
  const old = work.beginAccountWork()
  work.startLogin()
  assert.deepEqual(await source.verify(PIN, old), {
    ok: false,
    reason: 'stale',
  })
  assert.equal(bodyOf(fake, 'POST /users/me/pin/verify').length, 0)
})

/** verify를 보류해 두고 change(env)를 실행한 뒤 응답을 풀면 stale이고 아무것도 저장하지 않는지 본다. */
async function staleAfter(change, { response = tokenOk('late') } = {}) {
  const env = await login()
  const d = deferred()
  env.fake.on('POST /users/me/pin/verify', d)
  const controller = new AbortController()
  const pending = env.source.verify(
    PIN,
    env.work.beginAccountWork(),
    controller.signal,
  )
  await flush()
  await change({ ...env, controller })
  d.resolve(response)
  const result = await within(pending)
  assert.deepEqual(result, { ok: false, reason: 'stale' })
  assert.equal(store.getPinToken(env.user.id, T0), null)
  return env
}

test('늦은 확인 응답(R1): ① 새 로그인 시작 ② 로그아웃 ③ 계정 전환 ④ 세션 종료(계정 정리) ⑥ 요청 취소 → 저장 없음 + stale', async () => {
  await staleAfter(({ work }) => work.startLogin())
  await staleAfter(({ work }) => work.replaceUser(null))
  await staleAfter(({ work, user }) => work.replaceUser({ ...user, id: '8' }))
  await staleAfter(({ work }) => {
    scope.clearAccountScopedData()
    work.replaceUser(null)
  })
  await staleAfter(({ controller }) => controller.abort())
  // 같은 회원의 새 로그인이 성공한 뒤에도 이전 응답은 무효다
  await staleAfter(({ work, user }) => {
    work.startLogin()
    work.replaceUser({ ...user })
  })
})

test('늦은 확인 응답(v1.2 R1): 로그인 표식이 유효해도 ⑦ PIN 변경 성공 ⑧ 등록 성공 ⑨ clearPinToken ⑩ PIN_LOCKED 수신 뒤면 stale', async () => {
  const values = { current: PIN, next: NEW_PIN, confirm: NEW_PIN }
  await staleAfter(async ({ fake, source, work }) => {
    fake.on('PATCH /users/me/pin', noContent())
    const r = await pin.submitPinSettings(
      source,
      'change',
      values,
      work.beginAccountWork(),
    )
    assert.deepEqual(r, { kind: 'done' })
  })
  await staleAfter(async ({ fake, source, work }) => {
    fake.on('PUT /users/me/pin', tokenOk('reg'))
    const r = await pin.submitPinSettings(
      source,
      'register',
      values,
      work.beginAccountWork(),
    )
    assert.deepEqual(r, { kind: 'done' })
  })
  await staleAfter(() => store.clearPinToken())
  await staleAfter(async ({ fake, source, work }) => {
    fake.on('PATCH /users/me/pin', fail(403, 'PIN_LOCKED'))
    const r = await pin.submitPinSettings(
      source,
      'change',
      values,
      work.beginAccountWork(),
    )
    assert.equal(r.kind, 'failed')
    assert.equal(r.error.code, 'locked')
  })
  // 보류 중 오류 응답이 와도 그 사이 폐기됐으면 화면에 오류를 반영하지 않는다(stale)
  await staleAfter(() => store.clearPinToken(), {
    response: fail(400, 'PIN_INVALID', { remainingAttempts: 2 }),
  })
})

/**
 * F4-C1: 이전 로그인 작업 A의 요청을 보류 → 로그인 작업을 B로 바꾸고(계정 정리 포함) B의 PIN 토큰을 실제로 저장 →
 * A 응답을 풀면 stale이고 **B 토큰과 그때의 pinEpoch가 그대로**인지 본다. switchTo는 계정 전환(다른 회원)과
 * 같은 회원 재로그인 두 가지로 돌린다.
 */
async function keepsNewWork(start, response, switchTo) {
  const env = await login()
  const d = deferred()
  const guardA = env.work.beginAccountWork()
  const pending = start(env, d, guardA)
  await flush()
  // 로그인 작업 B: 로그인 시작 → 계정 정리 → 결과 반영(AuthProvider·authResults와 같은 순서)
  env.work.startLogin()
  scope.clearAccountScopedData()
  const userB = switchTo(env.user)
  env.work.replaceUser(userB)
  store.storePinToken(
    userB.id,
    'tok-B',
    T0 + 60_000,
    env.work.beginAccountWork(),
  )
  const epochB = store.currentPinEpoch()
  d.resolve(response)
  const result = await within(pending)
  assert.equal(store.getPinToken(userB.id, T0), 'tok-B')
  assert.equal(store.currentPinEpoch(), epochB)
  return result
}

const SWITCHES = [
  ['계정 전환', (user) => ({ ...user, id: '8' })],
  ['같은 회원 재로그인', (user) => ({ ...user })],
]
const SUBMIT_VALUES = { current: PIN, next: NEW_PIN, confirm: NEW_PIN }

test('F4-C1 회귀: 로그인 작업이 바뀐 뒤 도착한 ① verify PIN_LOCKED ② PATCH 성공 ③ PATCH PIN_LOCKED ④ PUT 성공은 stale이고 새 작업의 토큰·pinEpoch를 건드리지 않는다', async () => {
  for (const [name, switchTo] of SWITCHES) {
    // ① verify PIN_LOCKED
    const r1 = await keepsNewWork(
      ({ fake, source }, d, guardA) => {
        fake.on('POST /users/me/pin/verify', d)
        return source.verify(PIN, guardA)
      },
      fail(403, 'PIN_LOCKED', { lockedUntil: '2026-11-24T12:10:00' }),
      switchTo,
    )
    assert.deepEqual(r1, { ok: false, reason: 'stale' }, name)
    // ② PATCH 성공
    const r2 = await keepsNewWork(
      ({ fake, source }, d, guardA) => {
        fake.on('PATCH /users/me/pin', d)
        return pin.submitPinSettings(source, 'change', SUBMIT_VALUES, guardA)
      },
      noContent(),
      switchTo,
    )
    assert.deepEqual(r2, { kind: 'stale' }, name)
    // ③ PATCH PIN_LOCKED
    const r3 = await keepsNewWork(
      ({ fake, source }, d, guardA) => {
        fake.on('PATCH /users/me/pin', d)
        return pin.submitPinSettings(source, 'change', SUBMIT_VALUES, guardA)
      },
      fail(403, 'PIN_LOCKED', { lockedUntil: '2026-11-24T12:10:00' }),
      switchTo,
    )
    assert.deepEqual(r3, { kind: 'stale' }, name)
    // ④ PUT 성공
    const r4 = await keepsNewWork(
      ({ fake, source }, d, guardA) => {
        fake.on('PUT /users/me/pin', d)
        return pin.submitPinSettings(source, 'register', SUBMIT_VALUES, guardA)
      },
      tokenOk('reg'),
      switchTo,
    )
    assert.deepEqual(r4, { kind: 'stale' }, name)
  }
})

test('F4-C1: 지금 로그인 작업의 잠금은 그대로 오류로 전달되고 이 탭 토큰은 폐기된다(verify·변경 제출 모두)', async () => {
  const { fake, source, user, work } = await login()
  fake.on('POST /users/me/pin/verify', fail(403, 'PIN_LOCKED'))
  fake.on('PATCH /users/me/pin', fail(403, 'PIN_LOCKED'))
  store.storePinToken(user.id, 'tok', T0 + 60_000, work.beginAccountWork())
  let before = store.currentPinEpoch()
  await assert.rejects(
    source.verify(PIN, work.beginAccountWork()),
    isCode(E(), 'locked'),
  )
  assert.equal(store.getPinToken(user.id, T0), null)
  assert.ok(store.currentPinEpoch() > before)

  store.storePinToken(user.id, 'tok2', T0 + 60_000, work.beginAccountWork())
  before = store.currentPinEpoch()
  const r = await pin.submitPinSettings(
    source,
    'change',
    SUBMIT_VALUES,
    work.beginAccountWork(),
  )
  assert.equal(r.kind, 'failed')
  assert.equal(r.error.code, 'locked')
  assert.equal(messages.isPinLockedError(r.error), true)
  assert.equal(store.getPinToken(user.id, T0), null)
  assert.ok(store.currentPinEpoch() > before)
})

test('F4-C1: 같은 로그인 작업 안에서 폐기 번호가 바뀐 뒤 도착한 verify PIN_LOCKED는 화면 반영 없이(stale) 이 계정 잠금이므로 토큰을 폐기한다(계획 3.4 ②)', async () => {
  const { fake, source, user, work } = await login()
  const d = deferred()
  fake.on('POST /users/me/pin/verify', d)
  const pending = source.verify(PIN, work.beginAccountWork())
  await flush()
  // 같은 회원·같은 로그인 작업에서 다른 확인이 먼저 성공해 토큰을 저장(폐기 번호 증가) → 이전 응답은 stale
  store.storePinToken(
    user.id,
    'same-user',
    T0 + 60_000,
    work.beginAccountWork(),
  )
  const before = store.currentPinEpoch()
  d.resolve(fail(403, 'PIN_LOCKED'))
  assert.deepEqual(await within(pending), { ok: false, reason: 'stale' })
  // 계정이 잠겼다는 사실은 그대로이므로 같은 로그인 작업의 토큰은 보수적으로 버린다
  assert.equal(store.getPinToken(user.id, T0), null)
  assert.ok(store.currentPinEpoch() > before)
})

test('⑪ 두 확인이 겹치면 늦게 도착한 이전 응답이 먼저 저장된 새 토큰을 덮지 못한다', async () => {
  const { fake, source, user, work } = await login()
  const first = deferred()
  const second = deferred()
  fake.on('POST /users/me/pin/verify', first, second)
  const p1 = source.verify(PIN, work.beginAccountWork())
  const p2 = source.verify(PIN, work.beginAccountWork())
  await flush()
  second.resolve(tokenOk('new'))
  assert.deepEqual(await within(p2), { ok: true })
  first.resolve(tokenOk('old'))
  assert.deepEqual(await within(p1), { ok: false, reason: 'stale' })
  assert.equal(store.getPinToken(user.id, T0), 'new')
})

test('⑫ PIN 폐기·범용 표식은 F3 로그인 작업 번호를 바꾸지 않는다(닉네임 저장 표식 유지)', async () => {
  const { user, work } = await login()
  const nickname = work.beginNicknameSave()
  const account = work.beginAccountWork()
  assert.equal(account.userId, user.id)
  store.clearPinToken()
  store.storePinToken(user.id, 't', T0 + 1000, account)
  store.clearPinToken()
  assert.equal(nickname.isCurrent(), true)
  assert.equal(account.isCurrent(), true)
  assert.notEqual(nickname.commit('새닉'), null)
  // 닉네임 반영도 범용 표식을 무효로 만들지 않는다(같은 로그인 작업)
  assert.equal(account.isCurrent(), true)
  work.startLogin()
  assert.equal(account.isCurrent(), false)
})

test('토큰 읽기: 로그인 작업이 바뀌면(로그아웃 등) 읽을 때 지우고, 계정 정리(로그인·로그아웃·세션 종료)는 바로 비운다', async () => {
  const { user, work } = await login()
  store.storePinToken(user.id, 't', T0 + 60_000, work.beginAccountWork())
  work.replaceUser(null)
  assert.equal(store.getPinToken(user.id, T0), null)
  const again = await login()
  store.storePinToken(
    again.user.id,
    't2',
    T0 + 60_000,
    again.work.beginAccountWork(),
  )
  const before = store.currentPinEpoch()
  scope.clearAccountScopedData()
  assert.equal(store.getPinToken(again.user.id, T0), null)
  assert.ok(store.currentPinEpoch() > before)
})

// ── 등록·변경 제출(화면 훅이 쓰는 판정) ──

test('제출: 서버 모드는 표식이 없으면 보내지 않고, 응답 도착 때 표식이 무효면 성공·실패 모두 stale', async () => {
  const { fake, source, work } = await login()
  const values = { current: PIN, next: NEW_PIN, confirm: NEW_PIN }
  assert.deepEqual(
    await pin.submitPinSettings(source, 'change', values, null),
    { kind: 'stale' },
  )
  assert.equal(bodyOf(fake, 'PATCH /users/me/pin').length, 0)

  fake.on('PATCH /users/me/pin', noContent())
  assert.deepEqual(
    await pin.submitPinSettings(
      source,
      'change',
      values,
      work.beginAccountWork(),
    ),
    { kind: 'done' },
  )

  for (const response of [
    noContent(),
    fail(400, 'PIN_INVALID', { remainingAttempts: 4 }),
  ]) {
    const d = deferred()
    fake.on('PATCH /users/me/pin', d)
    const pending = pin.submitPinSettings(
      source,
      'change',
      values,
      work.beginAccountWork(),
    )
    await flush()
    work.replaceUser(null)
    d.resolve(response)
    assert.deepEqual(await within(pending), { kind: 'stale' })
    work.replaceUser({ id: '7', nickname: 'n' })
  }

  fake.on('PUT /users/me/pin', fail(409, 'PIN_ALREADY_SET'))
  const failed = await pin.submitPinSettings(
    source,
    'register',
    values,
    work.beginAccountWork(),
  )
  assert.equal(failed.kind, 'failed')
  assert.equal(failed.error.code, 'pinExists')
})

test('제출: 모의 모드는 기존처럼 표식을 보지 않고 확인값까지 저장소에 넘긴다', async () => {
  const seen = []
  const mock = {
    mode: 'mock',
    register: async (...args) => seen.push(['register', ...args]),
    change: async (...args) => seen.push(['change', ...args]),
  }
  const values = { current: PIN, next: NEW_PIN, confirm: '111111' }
  assert.deepEqual(
    await pin.submitPinSettings(mock, 'register', values, null),
    { kind: 'done' },
  )
  assert.deepEqual(await pin.submitPinSettings(mock, 'change', values, null), {
    kind: 'done',
  })
  assert.deepEqual(seen, [
    ['register', NEW_PIN, '111111'],
    ['change', PIN, NEW_PIN, '111111'],
  ])
})

// ── 같은 번호(F4-D7) ──

test('같은 번호 변경: 서버 모드(allowSame)는 허용하고 모의 모드(기본)는 기존처럼 막는다', () => {
  const same = { current: PIN, next: PIN, confirm: PIN }
  assert.equal(
    policy.validatePinForm('change', same, { allowSame: true }),
    null,
  )
  assert.deepEqual(policy.validatePinForm('change', same), {
    field: 'new',
    message: '현재와 다른 새 비밀번호를 입력해 주세요.',
  })
  // 허용해도 형식·확인 불일치 검사는 그대로다
  assert.equal(
    policy.validatePinForm(
      'change',
      { current: PIN, next: PIN, confirm: '1' },
      { allowSame: true },
    ).field,
    'confirm',
  )
})

// ── 잠금 화면(F4-D4, 계획 3.6) ──

function render(props) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Body, {
        done: false,
        locked: false,
        submit: async () => null,
        reload: () => {},
        ...props,
      }),
    ),
  )
}
const ready = (configured, locked = false) => ({
  kind: 'ready',
  configured,
  retryAt: null,
  locked,
})
const submitButton = (html) => html.match(/<button type="submit"([^>]*)>/)?.[1]
const isDisabled = (attributes) => /(^|\s)disabled=""/.test(attributes)

test('서버 모드 잠금: "최대 10분" 안내, 저장 버튼 활성(서버가 판정), "잠금 상태 다시 확인" 버튼, 개발용 모의 안내 없음', () => {
  const html = render({
    mode: 'change',
    status: ready(true, true),
    locked: true,
    connection: 'server',
  })
  assert.match(html, /role="alert"[^>]*>[^<]*최대 10분/)
  assert.doesNotMatch(html, /5분 뒤/)
  assert.equal(isDisabled(submitButton(html)), false)
  assert.match(html, /data-pin-lock-recheck/)
  assert.match(html, /<button type="button"[^>]*>잠금 상태 다시 확인<\/button>/)
  assert.doesNotMatch(html, /개발 서버 전용 모의 기능/)
})

test('PR #35 리뷰: 변경 요청 처리 중에는 "잠금 상태 다시 확인"이 비활성, 처리가 끝나면 다시 활성', () => {
  const recheck = (html) =>
    html.match(
      /<button type="button"([^>]*)data-pin-lock-recheck-button=""/,
    )?.[1] ??
    html.match(
      /<button type="button"[^>]*data-pin-lock-recheck-button=""[^>]*>/,
    )?.[0]
  const props = {
    mode: 'change',
    status: ready(true, true),
    locked: true,
    connection: 'server',
  }
  const busy = render({ ...props, submitting: true })
  const idle = render({ ...props, submitting: false })
  assert.ok(recheck(busy), '재확인 버튼')
  assert.match(
    busy.match(/<button[^>]*data-pin-lock-recheck-button=""[^>]*>/)[0],
    /\sdisabled=""/,
  )
  assert.doesNotMatch(
    idle.match(/<button[^>]*data-pin-lock-recheck-button=""[^>]*>/)[0],
    /\sdisabled=""/,
  )
})

test('PR #35 리뷰 정적: 화면의 재확인(reload)은 제출 처리 중이면 무시하고, 제출 결과의 등록 상태 재조회는 내부 refresh로 한다', () => {
  const hook = strip(readFileSync('src/pin-settings/usePinSettings.ts', 'utf8'))
  assert.match(
    hook,
    /const reload = useCallback\(\(\) => \{\s*if \(submitting\.current\) return\s*refresh\(\)/,
  )
  assert.match(hook, /error\.code === 'pinMissing'\)\s*refresh\(\)/)
  assert.match(hook, /setPending\(true\)/)
  assert.match(
    hook,
    /finally \{\s*submitting\.current = false\s*setPending\(false\)/,
  )
  const view = strip(
    readFileSync('src/components/pin-settings/PinSettingsView.tsx', 'utf8'),
  )
  assert.match(view, /disabled=\{submitting\}/)
  assert.match(view, /submitting=\{submitting\}/)
})

test('서버 모드 잠금 아님: 안내·재조회 버튼 없이 폼만, 개발용 모의 안내 없음', () => {
  const html = render({
    mode: 'change',
    status: ready(true),
    connection: 'server',
  })
  assert.doesNotMatch(
    html,
    /data-pin-lock-recheck|잠금 상태 다시 확인|role="alert"/,
  )
  assert.equal(isDisabled(submitButton(html)), false)
  assert.doesNotMatch(html, /개발 서버 전용 모의 기능/)
})

test('모의 모드 잠금(회귀): 5분 문구·저장 버튼 비활성·재조회 버튼 없음·개발용 안내 유지', () => {
  const html = render({ mode: 'change', status: ready(true), locked: true })
  assert.match(html, /role="alert"[^>]*>[^<]*5분 뒤/)
  assert.equal(isDisabled(submitButton(html)), true)
  assert.doesNotMatch(html, /잠금 상태 다시 확인/)
  assert.match(html, /개발 서버 전용 모의 기능/)
})

// ── 정적 확인 ──

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')

test('정적: PIN 연결·토큰 저장소는 storage·console·history·cookie를 쓰지 않고, 서버 구현은 개발용 저장소를 부르지 않는다', () => {
  for (const file of [
    'src/pin-settings/pinSource.ts',
    'src/pin-settings/pinTokenStore.ts',
    'src/pin-settings/usePinSettings.ts',
    'src/pin-settings/usePinStatus.ts',
  ]) {
    assert.doesNotMatch(
      strip(readFileSync(file, 'utf8')),
      /localStorage|sessionStorage|indexedDB|console\.|history\.(push|replace)State|document\.cookie/,
      file,
    )
  }
  const source = strip(readFileSync('src/pin-settings/pinSource.ts', 'utf8'))
  const server = source.slice(
    source.indexOf('export function createServerPinSource'),
    source.indexOf('function createMockPinSource'),
  )
  assert.ok(server.length > 100)
  assert.doesNotMatch(
    server,
    /createExerciseGoalRepository|repository|mockGoal/,
  )
  // 모의 저장소는 모의 모드 분기에서만 만든다(서버 실패 시 자동 전환 없음)
  const factory = source.slice(
    source.indexOf('export function createPinSource'),
  )
  assert.match(
    factory,
    /if \(MOCK_AUTH\) \{\s*const repository = createExerciseGoalRepository\(ownerId\)/,
  )
  assert.match(
    source,
    /const MOCK_AUTH =\s*import\.meta\.env\.DEV && import\.meta\.env\.VITE_DEV_AUTH === 'true'/,
  )
})

test('정적: 화면 훅은 범용 표식으로 제출하고, P05 훅은 서버 모드에서 범용 표식으로 확인한 뒤 commit으로만 표지를 만든다(F5, 모의는 개발용 저장소)', () => {
  const settings = strip(
    readFileSync('src/pin-settings/usePinSettings.ts', 'utf8'),
  )
  assert.match(settings, /beginAccountWork\(\)/)
  assert.match(settings, /submitPinSettings\(source, mode, values, guard\)/)
  assert.match(settings, /if \(outcome\.kind === 'stale'\) return null/)
  const verify = strip(readFileSync('src/pin-settings/usePinVerify.ts', 'utf8'))
  // F5: P05도 서버 상태를 읽고(serverStatus 옵션 없음), 범용 표식으로 확인한다. 표지는 commit 안에서만 만든다(8.8.2).
  assert.doesNotMatch(verify, /serverStatus: false/)
  assert.match(verify, /source\?\.mockGoal \?\? null/)
  assert.match(verify, /beginAccountWork\(\)/)
  assert.match(verify, /source\.verify\(pin, guard, signal\)/)
  assert.match(verify, /commit: \(\) =>\s*issueServerBodyAccess\(/)
  const view = strip(
    readFileSync('src/components/pin-settings/PinSettingsView.tsx', 'utf8'),
  )
  assert.equal((view.match(/allowSamePin/g) ?? []).length, 1)
  assert.ok(
    view.indexOf("connection === 'server'") < view.indexOf('allowSamePin'),
  )
})
