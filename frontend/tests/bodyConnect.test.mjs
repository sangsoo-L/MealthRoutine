// F5 프론트 신체정보 서버 연결(계획 v1.3 5장·8장): 실제/모의 모드 선택 · POST 저장(입력한 항목만, 201+ID, 결과 분류, 자동 재전송 없음) ·
// GET metrics(X-Pin-Token, 값 변환, 0 보존, PIN 403 세 종류) · 서버 열람 표지(1분 기한, 객체 동일성, 조건부 폐기 R1·R2) ·
// PIN 토큰 폐기 알림(F5-D8, 늦은 PIN 변경 응답) · 확인 성공 뒤 표지 발행 직전 재검사(8.8.2) · 저장 결과의 stale·isCurrent(8.8.3) ·
// protected 상태의 소비자(홈·몸무게 기록·P01·P06·P05 문구).
// 실제 서버·실제 계정·실제 PIN·실제 신체 수치는 쓰지 않는다(가짜 fetch, 'pin-tok-1' 같은 가짜 토큰). 보류 Promise(deferred)로 순서를 강제한다.
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
} from './apiTestKit.mjs'

const envDir = mkdtempSync(join(tmpdir(), 'body-connect-env-'))
const storage = createStorage()
let realServer, mockServer
let body,
  src,
  mockSrc,
  store,
  tokens,
  reveal,
  status,
  types,
  repoTypes,
  verifyHook
let pin, session, backendModule, ctx, scope, entry, home, homeWeight
let Summary, SettingsView, VerifyBody, MockVerifyBody, messages

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
  body = await load('/src/body-measurements/serverBodySource.ts')
  src = await load('/src/body-measurements/bodySource.ts')
  types = await load('/src/body-measurements/bodyTypes.ts')
  repoTypes = await load('/src/body-measurements/bodyRepository.ts')
  status = await load('/src/body-measurements/useBodyMeasurementStatus.ts')
  store = await load('/src/body-access/bodyAccessStore.ts')
  reveal = await load('/src/body-access/useBodyReveal.ts')
  verifyHook = await load('/src/pin-settings/usePinVerify.ts')
  tokens = await load('/src/pin-settings/pinTokenStore.ts')
  pin = await load('/src/pin-settings/pinSource.ts')
  messages = await load('/src/pin-settings/pinSettingsMessages.ts')
  session = await load('/src/api/session.ts')
  backendModule = await load('/src/auth/serverBackend.ts')
  ctx = await load('/src/auth/authContext.ts')
  scope = await load('/src/auth/accountScope.ts')
  entry = await load('/src/components/mypage/weightLogEntry.ts')
  home = await load('/src/components/home/homeBodyInfo.ts')
  homeWeight = await load('/src/components/home/homeWeightCheck.ts')
  Summary = (await load('/src/components/mypage/BodyInfoSummary.tsx')).default
  SettingsView = (
    await load('/src/components/settings/body/BodySettingsView.tsx')
  ).default
  VerifyBody = (await load('/src/components/pin-settings/PinVerifyView.tsx'))
    .PinVerifyBody
  mockSrc = await mockServer.ssrLoadModule(
    '/src/body-measurements/bodySource.ts',
  )
  MockVerifyBody = (
    await mockServer.ssrLoadModule(
      '/src/components/pin-settings/PinVerifyView.tsx',
    )
  ).PinVerifyBody
})
after(async () => {
  await realServer?.close()
  await mockServer?.close()
  delete globalThis.sessionStorage
  rmSync(envDir, { recursive: true, force: true })
})
beforeEach(() => {
  storage.map.clear()
  store.revokeBodyAccess()
  tokens.clearPinToken()
})

const T0 = Date.parse('2026-11-24T03:00:00.000Z')
const MINUTE = 60_000
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const user = (id = '7') => ({
  id,
  email: `u${id}@example.test`,
  nickname: `nick${id}`,
  entitlement: 'free',
})

/** 가짜 fetch 세션으로 로그인하고 신체정보 서버 연결을 만든다. */
async function login(userId = 7) {
  const fake = createFakeServer()
  const s = session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  const backend = backendModule.createServerBackend(s)
  fake.on('POST /auth/login', loginOk(userId, 'access-A1'))
  fake.on('GET /users/me', me(userId))
  const result = await backend.login(`u${userId}@example.test`, 'x')
  assert.equal(result.ok, true)
  const work = ctx.createLoginWork(result.user)
  const request = s.request.bind(s)
  return {
    fake,
    work,
    owner: result.user.id,
    source: body.createServerBodySource(request),
    pinSourceAt: (clock) =>
      pin.createServerPinSource(result.user.id, request, () => clock.t),
  }
}

/** 확인 성공을 흉내 낸 토큰 저장 + 표지 발행(서버 P05 성공 직후 상태). */
function verified(work, owner, { token = 'pin-tok-1', now = T0 } = {}) {
  const guard = work.beginAccountWork()
  tokens.storePinToken(owner, token, now + 595_000, guard)
  const grant = store.issueServerBodyAccess({
    ownerId: owner,
    guard,
    alive: () => true,
    now,
  })
  assert.ok(grant, '표지 발행')
  return { guard, grant }
}

const metricsOk = (over = {}) =>
  ok({
    basedOn: {
      heightCm: 170.5,
      heightMeasuredAt: '2026-11-20T08:00:00',
      weightKg: 65,
      weightMeasuredAt: '2026-11-24T07:00:00',
    },
    bmi: 22.36,
    bmr: 1550,
    activityFactor: 1.2,
    tdee: 1860,
    formula: 'Mifflin-St Jeor',
    isEstimated: true,
    missingFields: [],
    notCalculableFields: [],
    ...over,
  })
const posts = (fake) =>
  fake.calls.filter((c) => c.key === 'POST /health/measurements')

// ── 모드 선택 ──

test('모드: 실제(개발 기본)는 서버 연결, 모의(VITE_DEV_AUTH=true)는 개발용 저장소, 계정 id가 없으면 null', () => {
  assert.equal(src.createBodySource('7').mode, 'server')
  assert.equal(src.createBodySource(''), null)
  // 기존 이름(개발용 검수 스크립트의 시드)은 모의 저장소만 돌려준다.
  assert.equal(src.createBodyRepository('7'), null)
  assert.equal(typeof mockSrc.createBodyRepository('7').save, 'function')
  assert.equal(mockSrc.createBodySource('7').mode, 'mock')
  assert.equal(
    typeof mockSrc.createBodySource('7').repository.getStatus,
    'function',
  )
  // 서버 연결에는 등록 여부 메서드가 없다(F5-D1, HEALTH8-15).
  assert.equal(src.createBodySource('7').source.getStatus, undefined)
})

// ── 저장(POST) ──

test('저장: POST /health/measurements에 입력한 항목만 JSON 숫자로 보내고, PIN 헤더를 붙이지 않으며 201+양의 정수 ID면 saved', async () => {
  const { fake, source } = await login()
  fake.on(
    'POST /health/measurements',
    ok({ measurementId: 11 }, 201),
    ok({ measurementId: 12 }, 201),
    ok({ measurementId: 13 }, 201),
  )
  assert.equal(await source.save({ heightCm: 170.5 }), 'saved')
  assert.equal(await source.save({ weightKg: 65 }), 'saved')
  assert.equal(await source.save({ heightCm: 171, weightKg: 64.5 }), 'saved')
  const calls = posts(fake)
  assert.deepEqual(
    calls.map((c) => c.body),
    [{ heightCm: 170.5 }, { weightKg: 65 }, { heightCm: 171, weightKg: 64.5 }],
  )
  for (const c of calls) {
    assert.equal(c.headers.Authorization, 'Bearer access-A1')
    assert.equal(c.headers['X-Pin-Token'], undefined)
    assert.equal('measuredAt' in c.body, false)
  }
})

test('저장: 둘 다 비면 요청하지 않고 invalid', async () => {
  const { fake, source } = await login()
  assert.equal(await source.save({}), 'invalid')
  assert.equal(posts(fake).length, 0)
})

test('저장 분류: 400→invalid, 다른 4xx·형식 깨진 4xx→failed, 5xx·네트워크·2xx 형식 오류·ID 이상→uncertain, 요청은 매번 1회(재전송 없음)', async () => {
  const cases = [
    [fail(400, 'INVALID_REQUEST'), 'invalid'],
    [fail(403, 'ACCOUNT_SUSPENDED'), 'failed'],
    [new Response('<html>', { status: 404 }), 'failed'],
    [fail(500, 'INTERNAL_ERROR'), 'uncertain'],
    [networkError(), 'uncertain'],
    [ok({ measurementId: 5 }, 200), 'uncertain'],
    [ok({ measurementId: 0 }, 201), 'uncertain'],
    [ok({ measurementId: '5' }, 201), 'uncertain'],
    [ok({}, 201), 'uncertain'],
    [new Response('not json', { status: 201 }), 'uncertain'],
  ]
  for (const [response, expected] of cases) {
    const { fake, source } = await login()
    fake.on('POST /health/measurements', response)
    assert.equal(await source.save({ heightCm: 170 }), expected, expected)
    assert.equal(posts(fake).length, 1)
  }
})

// ── metrics ──

test('metrics: GET /health/metrics에 X-Pin-Token을 붙이고 basedOn·추정값을 그대로 옮긴다(0은 정상 값, null 유지)', async () => {
  const { fake, source } = await login()
  fake.on(
    'GET /health/metrics',
    metricsOk(),
    metricsOk({
      basedOn: { heightCm: null, weightKg: 0.5 },
      bmi: null,
      bmr: 0,
      tdee: 0,
      missingFields: ['heightCm', 'birthDate', 'gender'],
    }),
  )
  const first = await source.metrics('pin-tok-1')
  assert.deepEqual(first, {
    ok: true,
    values: { heightCm: 170.5, weightKg: 65 },
    metrics: {
      bmi: 22.36,
      bmr: 1550,
      tdee: 1860,
      missingFields: [],
      notCalculableFields: [],
    },
  })
  const call = fake.calls.find((c) => c.key === 'GET /health/metrics')
  assert.equal(call.headers['X-Pin-Token'], 'pin-tok-1')
  assert.equal(call.headers.Authorization, 'Bearer access-A1')
  const second = await source.metrics('pin-tok-1')
  assert.equal(second.ok, true)
  assert.deepEqual(second.values, { heightCm: null, weightKg: 0.5 })
  assert.equal(second.metrics.bmr, 0)
  assert.equal(second.metrics.tdee, 0)
  assert.equal(second.metrics.bmi, null)
})

test('metrics 실패: PIN 403 세 종류는 이유별로, 5xx·네트워크·형식 오류(문자열 수치 포함)는 failed', async () => {
  const cases = [
    [fail(403, 'PIN_EXPIRED'), 'pinExpired'],
    [fail(403, 'PIN_REQUIRED'), 'pinRequired'],
    [fail(403, 'PIN_NOT_REGISTERED'), 'pinNotRegistered'],
    [fail(403, 'ACCOUNT_SUSPENDED'), 'failed'],
    [fail(500, 'INTERNAL_ERROR'), 'failed'],
    [networkError(), 'failed'],
    [ok({ basedOn: null }), 'failed'],
    [metricsOk({ bmi: '22.3' }), 'failed'],
    [metricsOk({ missingFields: null }), 'failed'],
  ]
  for (const [response, reason] of cases) {
    const { fake, source } = await login()
    fake.on('GET /health/metrics', response)
    assert.deepEqual(await source.metrics('pin-tok-1'), { ok: false, reason })
  }
})

// ── 서버 열람 표지 ──

test('표지 발행: 화면 생존·취소 안 됨·같은 로그인 작업·이 회원의 토큰이 모두 있어야 하고, 기한은 발행 시각+60초, 토큰 값은 담지 않는다', async () => {
  const { work, owner } = await login()
  const guard = work.beginAccountWork()
  // 토큰 없음
  assert.equal(
    store.issueServerBodyAccess({
      ownerId: owner,
      guard,
      alive: () => true,
      now: T0,
    }),
    null,
  )
  tokens.storePinToken(owner, 'pin-tok-1', T0 + 595_000, guard)
  assert.equal(
    store.issueServerBodyAccess({
      ownerId: owner,
      guard,
      alive: () => false,
      now: T0,
    }),
    null,
  )
  const aborted = new AbortController()
  aborted.abort()
  assert.equal(
    store.issueServerBodyAccess({
      ownerId: owner,
      guard,
      signal: aborted.signal,
      alive: () => true,
      now: T0,
    }),
    null,
  )
  assert.equal(
    store.issueServerBodyAccess({
      ownerId: 'other',
      guard,
      alive: () => true,
      now: T0,
    }),
    null,
  )
  assert.equal(store.getBodyAccess(), null)
  const grant = store.issueServerBodyAccess({
    ownerId: owner,
    guard,
    alive: () => true,
    now: T0 + 1000,
  })
  assert.equal(grant.kind, 'server')
  assert.equal(grant.revealUntil, T0 + 1000 + MINUTE)
  assert.equal(grant.pinEpoch, tokens.currentPinEpoch())
  assert.equal(JSON.stringify(grant).includes('pin-tok-1'), false)
  assert.equal(store.getBodyAccess(), grant)
})

test('표지 유효성: 기한 1ms 전은 유효, 기한과 같은 시각부터 무효(R1). 로그인 작업 변경·토큰 폐기·표지 교체도 무효', async () => {
  const { work, owner } = await login()
  const { grant } = verified(work, owner)
  assert.equal(store.isServerGrantLive(grant, grant.revealUntil - 1), true)
  assert.equal(store.isServerGrantLive(grant, grant.revealUntil), false)
  tokens.clearPinToken()
  assert.equal(store.isServerGrantLive(grant, T0), false)

  const second = verified(work, owner)
  work.startLogin()
  assert.equal(store.isServerGrantLive(second.grant, T0), false)

  const env = await login()
  const a = verified(env.work, env.owner)
  const b = verified(env.work, env.owner, { token: 'pin-tok-2' })
  assert.equal(store.isServerGrantLive(a.grant, T0), false)
  assert.equal(store.isServerGrantLive(b.grant, T0), true)
})

test('조건부 폐기(R2): 다른 표지면 아무것도 하지 않고, 같은 표지는 지우며 PIN 폐기 번호가 같을 때만 토큰도 버린다', async () => {
  const { work, owner } = await login()
  const a = verified(work, owner)
  const b = verified(work, owner, { token: 'pin-tok-2' })
  const epoch = tokens.currentPinEpoch()
  assert.equal(store.revokeBodyAccessIf(a.grant), false)
  assert.equal(store.getBodyAccess(), b.grant)
  assert.equal(tokens.getPinToken(owner, T0), 'pin-tok-2')
  assert.equal(tokens.currentPinEpoch(), epoch)
  assert.equal(store.revokeBodyAccessIf(b.grant), true)
  assert.equal(store.getBodyAccess(), null)
  assert.equal(tokens.getPinToken(owner, T0), null)

  // 표지는 현재인데 그 뒤 새 토큰이 저장됐다면(다른 확인), 표지만 지우고 새 토큰은 남긴다.
  const c = verified(work, owner, { token: 'pin-tok-3' })
  tokens.storePinToken(owner, 'pin-tok-4', T0 + 595_000, c.guard)
  assert.equal(store.revokeBodyAccessIf(c.grant), true)
  assert.equal(tokens.getPinToken(owner, T0), 'pin-tok-4')
})

test('토큰 알림(F5-D8): 폐기·저장 때 값 없이 알리고, 해제하면 더 이상 알리지 않는다', async () => {
  const { work, owner } = await login()
  const seen = []
  const off = tokens.subscribePinToken((...args) => seen.push(args))
  tokens.storePinToken(
    owner,
    'pin-tok-1',
    T0 + 595_000,
    work.beginAccountWork(),
  )
  tokens.clearPinToken()
  assert.deepEqual(seen, [[], []])
  off()
  tokens.clearPinToken()
  assert.equal(seen.length, 2)
})

test('계정 정리(로그인·로그아웃): 서버 표지와 토큰이 모두 사라진다', async () => {
  const { work, owner } = await login()
  verified(work, owner)
  scope.clearAccountScopedData()
  assert.equal(store.getBodyAccess(), null)
  assert.equal(tokens.getPinToken(owner, T0), null)
})

// ── 서버 열람 한 번의 결과 처리(loadServerReveal) ──

const reveal1 = (grant, source, signal, t) =>
  reveal.loadServerReveal(
    grant,
    source,
    signal ?? new AbortController().signal,
    () => t.t,
  )

test('열람: 현재 표지의 metrics 성공은 값과 추정값을 돌려주고 표지는 유지된다', async () => {
  const { fake, work, owner, source } = await login()
  const { grant } = verified(work, owner)
  fake.on('GET /health/metrics', metricsOk())
  const result = await reveal1(grant, source, null, { t: T0 + 1000 })
  assert.equal(result.kind, 'shown')
  assert.deepEqual(result.values, { heightCm: 170.5, weightKg: 65 })
  assert.equal(result.metrics.bmi, 22.36)
  assert.equal(store.getBodyAccess(), grant)
})

test('열람 R1: metrics를 1분 넘게 보류한 뒤 풀면 값을 내지 않고 그 표지만 가린다', async () => {
  const { fake, work, owner, source } = await login()
  const { grant } = verified(work, owner)
  const held = deferred()
  fake.on('GET /health/metrics', held)
  const clock = { t: T0 + 1000 }
  const pending = reveal1(grant, source, null, clock)
  await flush()
  clock.t = grant.revealUntil
  held.resolve(metricsOk())
  assert.deepEqual(await pending, { kind: 'hidden', notice: 'expired' })
  assert.equal(store.getBodyAccess(), null)
})

test('열람 R1: 보내기 전에 이미 기한이 지났거나 토큰이 없으면 요청하지 않고 가린다', async () => {
  const { fake, work, owner, source } = await login()
  const { grant } = verified(work, owner)
  assert.deepEqual(
    await reveal1(grant, source, null, { t: grant.revealUntil }),
    {
      kind: 'hidden',
      notice: 'expired',
    },
  )
  assert.equal(
    fake.calls.some((c) => c.key === 'GET /health/metrics'),
    false,
  )
})

test('열람 R2: 보류 중 사용자가 가리면, 이후 성공·403·5xx 어느 응답도 무시된다(새 상태를 건드리지 않음)', async () => {
  for (const response of [
    metricsOk(),
    fail(403, 'PIN_EXPIRED'),
    fail(403, 'PIN_REQUIRED'),
    fail(403, 'PIN_NOT_REGISTERED'),
    fail(500, 'INTERNAL_ERROR'),
  ]) {
    const { fake, work, owner, source } = await login()
    const { grant } = verified(work, owner)
    const held = deferred()
    fake.on('GET /health/metrics', held)
    const pending = reveal1(grant, source, null, { t: T0 + 1000 })
    await flush()
    assert.equal(store.revokeBodyAccessIf(grant), true)
    held.resolve(response)
    assert.deepEqual(await pending, { kind: 'ignored' })
  }
})

test('열람 R2: 이전 표지 A의 응답(성공·PIN 403 세 종류·5xx)이 새 표지 B가 생긴 뒤 와도 B의 표지·토큰·폐기 번호를 건드리지 않는다', async () => {
  for (const response of [
    metricsOk(),
    fail(403, 'PIN_EXPIRED'),
    fail(403, 'PIN_REQUIRED'),
    fail(403, 'PIN_NOT_REGISTERED'),
    fail(500, 'INTERNAL_ERROR'),
    networkError(),
  ]) {
    const { fake, work, owner, source } = await login()
    const a = verified(work, owner)
    const held = deferred()
    fake.on('GET /health/metrics', held)
    const pending = reveal1(a.grant, source, null, { t: T0 + 1000 })
    await flush()
    // 새 P05 확인: 새 토큰과 새 표지 B
    const b = verified(work, owner, { token: 'pin-tok-2', now: T0 + 2000 })
    const epoch = tokens.currentPinEpoch()
    held.resolve(response)
    assert.deepEqual(await pending, { kind: 'ignored' })
    assert.equal(store.getBodyAccess(), b.grant)
    assert.equal(tokens.getPinToken(owner, T0 + 3000), 'pin-tok-2')
    assert.equal(tokens.currentPinEpoch(), epoch)
    assert.equal(store.isServerGrantLive(b.grant, T0 + 3000), true)
  }
})

test('열람 R2: 같은 회원의 새 로그인(계정 정리)·PIN 폐기 뒤 도착한 성공은 값을 내지 않는다', async () => {
  {
    const { fake, work, owner, source } = await login()
    const { grant } = verified(work, owner)
    const held = deferred()
    fake.on('GET /health/metrics', held)
    const pending = reveal1(grant, source, null, { t: T0 + 1000 })
    await flush()
    work.startLogin()
    scope.clearAccountScopedData()
    held.resolve(metricsOk())
    assert.deepEqual(await pending, { kind: 'ignored' })
  }
  {
    const { fake, work, owner, source } = await login()
    const { grant } = verified(work, owner)
    const held = deferred()
    fake.on('GET /health/metrics', held)
    const pending = reveal1(grant, source, null, { t: T0 + 1000 })
    await flush()
    tokens.clearPinToken() // 예: 설정 화면 PIN 변경 성공
    held.resolve(metricsOk())
    const result = await pending
    assert.notEqual(result.kind, 'shown')
    assert.equal(store.getBodyAccess(), null)
  }
})

test('열람: 현재 표지의 PIN_EXPIRED·PIN_REQUIRED는 expired, PIN_NOT_REGISTERED·5xx·네트워크는 error — 그 표지와 토큰만 폐기', async () => {
  const cases = [
    [fail(403, 'PIN_EXPIRED'), 'expired'],
    [fail(403, 'PIN_REQUIRED'), 'expired'],
    [fail(403, 'PIN_NOT_REGISTERED'), 'error'],
    [fail(500, 'INTERNAL_ERROR'), 'error'],
    [networkError(), 'error'],
  ]
  for (const [response, notice] of cases) {
    const { fake, work, owner, source } = await login()
    const { grant } = verified(work, owner)
    fake.on('GET /health/metrics', response)
    assert.deepEqual(await reveal1(grant, source, null, { t: T0 + 1000 }), {
      kind: 'hidden',
      notice,
    })
    assert.equal(store.getBodyAccess(), null)
    assert.equal(tokens.getPinToken(owner, T0 + 1000), null)
  }
})

test('열람: 화면이 요청을 취소(정리)하면 결과를 무시한다', async () => {
  const { fake, work, owner, source } = await login()
  const { grant } = verified(work, owner)
  fake.on('GET /health/metrics', deferred())
  const controller = new AbortController()
  const pending = reveal1(grant, source, controller.signal, { t: T0 + 1000 })
  await flush()
  controller.abort()
  assert.deepEqual(await pending, { kind: 'ignored' })
  assert.equal(store.getBodyAccess(), grant)
})

test('열람 R1(F5-D8): 표시 중 설정 화면의 늦은 PIN 변경 응답(204)이 토큰을 지우면, 렌더·focus 없이 알림만으로 표지가 사라진다', async () => {
  const { fake, work, owner, source, pinSourceAt } = await login()
  // 설정 화면에서 PIN 변경 요청을 먼저 보낸다(응답 보류). 화면을 떠나도 F4는 요청을 취소하지 않는다.
  const patch = deferred()
  fake.on('PATCH /users/me/pin', patch)
  const changing = pin.submitPinSettings(
    pinSourceAt({ t: T0 }),
    'change',
    { current: '012345', next: '987654', confirm: '987654' },
    work.beginAccountWork(),
  )
  await flush()
  // 그 사이 P05 확인 → P01 표시
  const { grant } = verified(work, owner)
  fake.on('GET /health/metrics', metricsOk())
  assert.equal(
    (await reveal1(grant, source, null, { t: T0 + 1000 })).kind,
    'shown',
  )
  // P01 훅과 같은 방식으로 구독한다(표지가 살아 있지 않으면 그 표지만 폐기). 렌더·focus 이벤트는 일으키지 않는다.
  let notified = 0
  const off = tokens.subscribePinToken(() => {
    notified += 1
    if (!store.isServerGrantLive(grant, T0 + 2000))
      store.revokeBodyAccessIf(grant)
  })
  patch.resolve(noContent())
  assert.deepEqual(await changing, { kind: 'done' })
  off()
  assert.equal(notified, 1)
  assert.equal(store.getBodyAccess(), null)
})

test('열람 R1(F5-D8): 늦은 PIN_LOCKED 응답도 같은 경로로 표지를 지운다', async () => {
  const { fake, work, owner, source, pinSourceAt } = await login()
  const patch = deferred()
  fake.on('PATCH /users/me/pin', patch)
  const changing = pin.submitPinSettings(
    pinSourceAt({ t: T0 }),
    'change',
    { current: '000000', next: '987654', confirm: '987654' },
    work.beginAccountWork(),
  )
  await flush()
  const { grant } = verified(work, owner)
  fake.on('GET /health/metrics', metricsOk())
  assert.equal(
    (await reveal1(grant, source, null, { t: T0 + 1000 })).kind,
    'shown',
  )
  const off = tokens.subscribePinToken(() => {
    if (!store.isServerGrantLive(grant, T0 + 2000))
      store.revokeBodyAccessIf(grant)
  })
  patch.resolve(fail(403, 'PIN_LOCKED', { lockedUntil: '2026-11-24T12:10:00' }))
  assert.equal((await changing).kind, 'failed')
  off()
  assert.equal(store.getBodyAccess(), null)
})

// ── 확인 성공 뒤 표지 발행 직전 재검사(8.8.2) ──

test('8.8.2: 실제 verify가 ok로 끝난 뒤 발행 전에 재로그인·계정 전환·PIN 폐기·화면 이탈이 있으면 표지를 만들지 않는다', async () => {
  const changes = {
    재로그인: (env) => env.work.startLogin(),
    계정전환: (env) => env.work.replaceUser(user('8')),
    PIN폐기: () => tokens.clearPinToken(),
    화면이탈: (env) => env.controller.abort(),
    언마운트: (env) => (env.alive = false),
  }
  for (const [name, change] of Object.entries(changes)) {
    tokens.clearPinToken()
    store.revokeBodyAccess()
    const env = await login()
    const clock = { t: T0 }
    env.controller = new AbortController()
    env.alive = true
    env.fake.on(
      'POST /users/me/pin/verify',
      ok({ pinToken: 'pin-tok-1', expiresIn: 600 }),
    )
    const guard = env.work.beginAccountWork()
    const outcome = await env
      .pinSourceAt(clock)
      .verify('012345', guard, env.controller.signal)
    assert.deepEqual(outcome, { ok: true }, name)
    change(env)
    const grant = store.issueServerBodyAccess({
      ownerId: env.owner,
      guard,
      signal: env.controller.signal,
      alive: () => env.alive,
      now: T0,
    })
    assert.equal(grant, null, name)
    assert.equal(store.getBodyAccess(), null, name)
  }
  // 정상 흐름은 발행 1회
  const env = await login()
  env.fake.on(
    'POST /users/me/pin/verify',
    ok({ pinToken: 'pin-tok-1', expiresIn: 600 }),
  )
  const guard = env.work.beginAccountWork()
  assert.deepEqual(await env.pinSourceAt({ t: T0 }).verify('012345', guard), {
    ok: true,
  })
  const grant = store.issueServerBodyAccess({
    ownerId: env.owner,
    guard,
    alive: () => true,
    now: T0,
  })
  assert.equal(store.getBodyAccess(), grant)
})

test('8.8.2: 확인을 시작한 로그인 작업이 끝났다면, 그 사이 새 로그인에서 저장된 유효한 토큰이 있어도 이전 확인으로는 발행하지 않는다', async () => {
  const env = await login()
  env.fake.on(
    'POST /users/me/pin/verify',
    ok({ pinToken: 'pin-tok-1', expiresIn: 600 }),
  )
  const oldGuard = env.work.beginAccountWork()
  assert.deepEqual(
    await env.pinSourceAt({ t: T0 }).verify('012345', oldGuard),
    { ok: true },
  )
  // 같은 회원의 새 로그인 작업 → 새 확인이 새 토큰을 저장(이전 확인의 화면은 아직 표지를 만들지 않음)
  env.work.startLogin()
  env.work.replaceUser(user(env.owner))
  const newGuard = env.work.beginAccountWork()
  tokens.storePinToken(env.owner, 'pin-tok-2', T0 + 595_000, newGuard)
  assert.equal(tokens.getPinToken(env.owner, T0), 'pin-tok-2')
  assert.equal(
    store.issueServerBodyAccess({
      ownerId: env.owner,
      guard: oldGuard,
      alive: () => true,
      now: T0,
    }),
    null,
  )
  assert.equal(store.getBodyAccess(), null)
})

// ── 토큰이 1분보다 먼저 만료되는 경우(F5-C2, F5-D9) ──

test('F5-D9: getPinTokenExpiresAt은 쓸 수 있는 토큰의 만료 시각만 주고(값 없음), 없거나 다른 회원·만료·로그인 변경이면 null', async () => {
  const { work, owner } = await login()
  assert.equal(tokens.getPinTokenExpiresAt(owner, T0), null)
  const guard = work.beginAccountWork()
  tokens.storePinToken(owner, 'pin-tok-1', T0 + 30_000, guard)
  assert.equal(tokens.getPinTokenExpiresAt(owner, T0), T0 + 30_000)
  assert.equal(typeof tokens.getPinTokenExpiresAt(owner, T0), 'number')
  assert.equal(tokens.getPinTokenExpiresAt('other', T0), null)
  tokens.storePinToken(owner, 'pin-tok-2', T0 + 30_000, guard)
  assert.equal(tokens.getPinTokenExpiresAt(owner, T0 + 30_000), null)
  tokens.storePinToken(owner, 'pin-tok-3', T0 + 30_000, guard)
  work.startLogin()
  assert.equal(tokens.getPinTokenExpiresAt(owner, T0), null)
})

test('F5-C2: verify 응답이 594초 늦게 와 토큰이 1초만 남으면 열람 기한도 그 만료 시각(1분보다 이름), 그 시각에 무효', async () => {
  const env = await login()
  const clock = { t: T0 }
  const held = deferred()
  env.fake.on('POST /users/me/pin/verify', held)
  const guard = env.work.beginAccountWork()
  const pending = env.pinSourceAt(clock).verify('012345', guard)
  await flush()
  clock.t = T0 + 594_000
  held.resolve(ok({ pinToken: 'pin-tok-1', expiresIn: 600 }))
  assert.deepEqual(await pending, { ok: true })
  const tokenExpiresAt = tokens.getPinTokenExpiresAt(env.owner, clock.t)
  assert.equal(tokenExpiresAt, T0 + 595_000)
  const grant = store.issueServerBodyAccess({
    ownerId: env.owner,
    guard,
    alive: () => true,
    now: clock.t,
  })
  assert.equal(grant.revealUntil, tokenExpiresAt)
  assert.ok(grant.revealUntil < clock.t + MINUTE)
  assert.equal(store.isServerGrantLive(grant, grant.revealUntil - 1), true)
  assert.equal(store.isServerGrantLive(grant, grant.revealUntil), false)
})

test('F5-C2: 토큰이 넉넉하면 열람 기한은 그대로 발행+1분', async () => {
  const { work, owner } = await login()
  const { grant } = verified(work, owner, { now: T0 })
  assert.equal(grant.revealUntil, T0 + MINUTE)
})

test('F5-C2: 이전 표지(짧은 토큰)의 기한 처리가 새 확인의 표지·토큰을 건드리지 않는다', async () => {
  const { work, owner } = await login()
  const guard = work.beginAccountWork()
  tokens.storePinToken(owner, 'pin-tok-short', T0 + 1_000, guard)
  const a = store.issueServerBodyAccess({
    ownerId: owner,
    guard,
    alive: () => true,
    now: T0,
  })
  assert.equal(a.revealUntil, T0 + 1_000)
  // 새 P05 확인: 새 토큰·새 표지 B
  const b = verified(work, owner, { token: 'pin-tok-long', now: T0 + 500 })
  const epoch = tokens.currentPinEpoch()
  // P01 타이머가 A의 기한에 하는 일(그 표지만 조건부 폐기)
  assert.equal(store.revokeBodyAccessIf(a), false)
  assert.equal(store.getBodyAccess(), b.grant)
  assert.equal(tokens.getPinToken(owner, T0 + 2_000), 'pin-tok-long')
  assert.equal(tokens.currentPinEpoch(), epoch)
  assert.equal(store.isServerGrantLive(b.grant, T0 + 2_000), true)
})

test('F5-C2 정적: P01 타이머는 서버 표지의 revealUntil(토큰 만료를 반영한 기한)로 가린다', () => {
  const hook = read('src/body-access/useBodyReveal.ts')
  assert.match(hook, /active\.kind === 'server' \? active\.revealUntil/)
  assert.match(hook, /setTimeout\(\s*\(\) => revoke\(active, 'expired'\)/)
  const accessStore = read('src/body-access/bodyAccessStore.ts')
  assert.match(
    accessStore,
    /Math\.min\(now \+ SERVER_REVEAL_MS, tokenExpiresAt\)/,
  )
})

// ── P05 실패 결과의 최종 소비자 재검사(F5-C1) ──

async function verifyWith(response) {
  const env = await login()
  env.fake.on('POST /users/me/pin/verify', response)
  const life = { alive: true, controller: new AbortController() }
  const guard = env.work.beginAccountWork()
  let missing = 0
  const pending = verifyHook.verifyOnServer({
    source: env.pinSourceAt({ t: T0 }),
    pin: '012345',
    ownerId: env.owner,
    guard,
    life,
    onPinMissing: () => (missing += 1),
  })
  return { env, life, pending, missing: () => missing }
}

test('F5-C1: PIN_LOCKED 실패를 돌려준 뒤 폼이 받기 전에 새 로그인·계정 전환·화면 이탈이 있으면 isCurrent가 거짓(잠금 이동·문구 없음), 새 토큰은 보존', async () => {
  for (const change of ['재로그인', '계정전환', '화면이탈', '취소']) {
    const { env, life, pending } = await verifyWith(fail(403, 'PIN_LOCKED'))
    const result = await pending
    assert.equal(result.ok, false, change)
    assert.equal(result.isCurrent(), true, change)
    // 훅이 결과를 돌려준 뒤 ~ 폼이 소비하기 전
    if (change === '재로그인') env.work.startLogin()
    else if (change === '계정전환') env.work.replaceUser(user('8'))
    else if (change === '화면이탈') life.alive = false
    else life.controller.abort()
    const newGuard = env.work.beginAccountWork()
    if (newGuard)
      tokens.storePinToken(
        newGuard.userId,
        'pin-tok-new',
        T0 + 595_000,
        newGuard,
      )
    assert.equal(result.isCurrent(), false, change)
    if (newGuard)
      assert.equal(
        tokens.getPinToken(newGuard.userId, T0),
        'pin-tok-new',
        change,
      )
    tokens.clearPinToken()
  }
})

test('F5-C1: 응답 도착 때 이미 로그인이 바뀌었거나 화면을 떠났으면 결과 자체가 null, 현재 작업의 실패는 그대로 전달(PIN_NOT_REGISTERED는 재조회 요청)', async () => {
  {
    const env = await login()
    const held = deferred()
    env.fake.on('POST /users/me/pin/verify', held)
    const life = { alive: true, controller: new AbortController() }
    const pending = verifyHook.verifyOnServer({
      source: env.pinSourceAt({ t: T0 }),
      pin: '012345',
      ownerId: env.owner,
      guard: env.work.beginAccountWork(),
      life,
    })
    await flush()
    env.work.startLogin()
    held.resolve(fail(400, 'PIN_INVALID', { remainingAttempts: 3 }))
    assert.equal(await pending, null)
  }
  {
    const { pending, missing } = await verifyWith(
      fail(403, 'PIN_NOT_REGISTERED'),
    )
    const result = await pending
    assert.equal(result.ok, false)
    assert.equal(result.isCurrent(), true)
    assert.equal(missing(), 1)
  }
  {
    const { pending } = await verifyWith(
      fail(400, 'PIN_INVALID', { remainingAttempts: 2 }),
    )
    const result = await pending
    assert.equal(result.error.code, 'pinWrong')
    assert.equal(result.isCurrent(), true)
  }
  {
    const { pending } = await verifyWith(
      ok({ pinToken: 'pin-tok-1', expiresIn: 600 }),
    )
    const result = await pending
    assert.equal(result.ok, true)
    assert.equal(typeof result.commit, 'function')
  }
})

test('F5-C1: 실패 응답이 오기 전에 화면을 떠났으면(취소 전이라도) 결과는 null이고 등록 상태 재조회도 하지 않는다', async () => {
  const env = await login()
  const held = deferred()
  env.fake.on('POST /users/me/pin/verify', held)
  const life = { alive: true, controller: new AbortController() }
  let missing = 0
  const pending = verifyHook.verifyOnServer({
    source: env.pinSourceAt({ t: T0 }),
    pin: '012345',
    ownerId: env.owner,
    guard: env.work.beginAccountWork(),
    life,
    onPinMissing: () => (missing += 1),
  })
  await flush()
  life.alive = false
  held.resolve(fail(403, 'PIN_NOT_REGISTERED'))
  assert.equal(await pending, null)
  assert.equal(missing, 0)
})

test('F5-C1 정적: 폼은 실패 결과의 isCurrent를 입력 비우기·문구·잠금 이동보다 먼저 확인한다', () => {
  const form = read('src/components/pin-settings/PinVerifyForm.tsx')
  const check = form.indexOf('if (!result.ok && !result.isCurrent()) return')
  assert.ok(check > 0, '실패 결과 재검사')
  for (const after of [
    "setPin('')",
    'onLocked()',
    'setError(pinSettingsMessage',
  ])
    assert.ok(check < form.indexOf(after), after)
})

// ── 저장 결과(8.8.3) ──

const fakeGuard = (userId = '7') => {
  const g = { userId, valid: true, isCurrent: () => g.valid }
  return g
}

test('저장 결과: 서버 성공은 saved+isCurrent, 시작 때 표식이 없거나 다른 회원이면 보내지 않고 stale', async () => {
  const { fake, source } = await login()
  fake.on('POST /health/measurements', ok({ measurementId: 3 }, 201))
  const guard = fakeGuard()
  const server = { mode: 'server', source }
  const saved = await status.saveBodyMeasurement({
    source: server,
    input: { heightCm: 170 },
    userId: '7',
    guard,
    alive: () => true,
  })
  assert.equal(saved.kind, 'saved')
  assert.equal(saved.isCurrent(), true)
  guard.valid = false
  // 결과를 받은 뒤 로그인이 바뀌면 isCurrent가 거짓 → 화면은 반영하지 않는다.
  assert.equal(types.isLiveSaveOutcome(saved), false)
  for (const g of [null, fakeGuard('8')]) {
    assert.deepEqual(
      await status.saveBodyMeasurement({
        source: server,
        input: { heightCm: 170 },
        userId: '7',
        guard: g,
        alive: () => true,
      }),
      { kind: 'stale' },
    )
  }
  assert.equal(posts(fake).length, 1)
})

test('저장 결과 R3: POST 보류 중 재로그인·계정 전환·화면 이탈 후 201·400·5xx가 와도 모두 stale(문구·상태 반영 없음)', async () => {
  for (const response of [
    ok({ measurementId: 3 }, 201),
    fail(400, 'INVALID_REQUEST'),
    fail(500, 'INTERNAL_ERROR'),
  ]) {
    for (const change of ['login', 'leave']) {
      const { fake, source } = await login()
      const held = deferred()
      fake.on('POST /health/measurements', held)
      const guard = fakeGuard()
      let alive = true
      const pending = status.saveBodyMeasurement({
        source: { mode: 'server', source },
        input: { weightKg: 60 },
        userId: '7',
        guard,
        alive: () => alive,
      })
      await flush()
      if (change === 'login') guard.valid = false
      else alive = false
      held.resolve(response)
      assert.deepEqual(await pending, { kind: 'stale' })
      assert.equal(posts(fake).length, 1)
    }
  }
})

test('저장 결과: 네트워크 오류(서버 저장 후 응답 유실)는 uncertain이고 다시 보내지 않는다', async () => {
  const { fake, source } = await login()
  fake.on('POST /health/measurements', networkError())
  const result = await status.saveBodyMeasurement({
    source: { mode: 'server', source },
    input: { heightCm: 170 },
    userId: '7',
    guard: fakeGuard(),
    alive: () => true,
  })
  assert.equal(result.kind, 'uncertain')
  assert.equal(posts(fake).length, 1)
})

test('저장 결과(모의 계약 유지): 저장소의 BodySaveError(invalid)→invalid, 그 밖 예외→failed, 성공은 등록 여부를 onMockSaved로, stale이면 알리지 않는다', async () => {
  const repo = (impl) => ({ mode: 'mock', repository: { save: impl } })
  const call = (source, guard = fakeGuard(), onMockSaved) =>
    status.saveBodyMeasurement({
      source,
      input: { heightCm: 170 },
      userId: '7',
      guard,
      alive: () => true,
      onMockSaved,
    })
  const invalid = await call(
    repo(async () => {
      throw new repoTypes.BodySaveError('invalid')
    }),
  )
  assert.equal(invalid.kind, 'invalid')
  const failed = await call(
    repo(async () => {
      throw new repoTypes.BodySaveError('failed')
    }),
  )
  assert.equal(failed.kind, 'failed')
  const seen = []
  const saved = await call(
    repo(async () => ({ height: true, weight: false })),
    fakeGuard(),
    (v) => seen.push(v),
  )
  assert.equal(saved.kind, 'saved')
  assert.deepEqual(seen, [{ height: true, weight: false }])
  const guard = fakeGuard()
  const held = deferred()
  const pending = call(
    repo(() => held.promise),
    guard,
    (v) => seen.push(v),
  )
  guard.valid = false
  held.resolve({ height: true, weight: true })
  assert.deepEqual(await pending, { kind: 'stale' })
  assert.equal(seen.length, 1)
})

// ── protected 상태의 소비자(R4) ──

test('protected: 누락이 아니고, 홈 안내·월간 몸무게 카드·마이페이지 몸무게 기록 모두 보이지 않는다(모의 기록으로 들어가지 않음)', () => {
  const protectedState = { status: 'protected' }
  assert.equal(types.hasMissingBodyInfo(protectedState), false)
  assert.deepEqual(home.selectHomeBodyInfoView(protectedState), {
    kind: 'banner',
  })
  const weight = {
    status: 'ready',
    value: {
      today: '2026-11-24',
      lastRecordedOn: null,
      nextDueOn: null,
      needsCheck: false,
      reason: 'no-history',
      legacyWeightUndated: false,
      consistent: true,
    },
  }
  // F5-C3: 운영(몸무게 기록 저장소 없음 = unavailable)을 포함해 몸무게 기록 상태와 상관없이 숨긴다.
  for (const w of [
    weight,
    { status: 'loading' },
    { status: 'error' },
    { status: 'unavailable' },
  ]) {
    for (const retrying of [false, true])
      assert.deepEqual(
        entry.selectWeightLogEntry({
          body: protectedState,
          weight: w,
          retrying,
        }),
        { kind: 'hidden' },
        w.status,
      )
  }
  // 모의 모드의 기존 "연결 전" 안내는 그대로다.
  assert.deepEqual(
    entry.selectWeightLogEntry({
      body: { status: 'ready', value: { height: true, weight: true } },
      weight: { status: 'unavailable' },
      retrying: false,
    }),
    { kind: 'unavailable' },
  )
  assert.deepEqual(
    homeWeight.selectHomeWeightView({
      body: protectedState,
      weight,
      dismissal: null,
    }),
    { kind: 'none' },
  )
  assert.equal(
    homeWeight.selectHomeWeightRetry({
      body: protectedState,
      weight,
      retrying: false,
    }),
    'none',
  )
})

const MASKED = { state: { status: 'masked' }, notice: null, hide: () => {} }
const noSave = async () => ({ kind: 'stale' })

test('P01 protected: 값을 가리고 미입력·입력 시트 버튼 없이 열람·입력 링크만 둔다. 잠금 복귀 안내는 서버 문구(최대 10분)', () => {
  const html = render(
    createElement(Summary, {
      body: { status: 'protected' },
      save: noSave,
      reveal: MASKED,
      lockedNotice: true,
    }),
  )
  assert.doesNotMatch(html, /미입력/)
  assert.doesNotMatch(html, /키·몸무게 입력하기/)
  assert.match(html, /2차 비밀번호로 신체 정보 보기/)
  assert.match(html, /data-body-edit-link/)
  assert.match(html, /최대 10분/)
  assert.doesNotMatch(html, /5분 뒤/)
  assert.equal((html.match(/\*\*\*/g) ?? []).length, 3)
})

test('P01 서버 열람: 키·몸무게·서버 BMI(다시 계산하지 않음)와 추정값을 보이고, 0은 0kcal, null은 계산 불가와 이유 안내', () => {
  const html = render(
    createElement(Summary, {
      body: { status: 'protected' },
      save: noSave,
      reveal: {
        state: {
          status: 'revealed',
          values: { heightCm: 170.5, weightKg: 65 },
          metrics: {
            bmi: 99.99,
            bmr: 0,
            tdee: null,
            missingFields: ['birthDate', 'gender'],
            notCalculableFields: [],
          },
        },
        notice: null,
        hide: () => {},
      },
    }),
  )
  assert.match(html, /170\.5cm/)
  assert.match(html, /65kg/)
  // 키·몸무게로 계산하면 22.4지만 서버 값 그대로 보인다.
  assert.match(html, /99\.99/)
  assert.doesNotMatch(html, /22\.4/)
  assert.match(html, /0kcal/)
  assert.match(html, /계산 불가/)
  assert.match(html, /생년월일·성별 정보가 있어야 계산할 수 있어요/)
  assert.match(html, /추정값/)
})

test('P06 protected: 등록 상태 줄 없이 안내와 열람 링크, 키·몸무게 두 칸 선택 입력, 몸무게 기록 안내·돌아가기 없음', () => {
  const html = render(
    createElement(SettingsView, {
      body: { status: 'protected' },
      save: noSave,
      onRetry: () => {},
      onCancel: () => {},
    }),
  )
  assert.match(html, /data-body-state="protected"/)
  assert.match(html, /data-body-unlock/)
  assert.equal((html.match(/inputMode="decimal"/gi) ?? []).length, 2)
  assert.doesNotMatch(html, /등록됨|미입력/)
  assert.doesNotMatch(html, /data-body-weight-link|data-body-back/)
  assert.match(html, /새로 잰 값만 입력해도 돼요/)
})

test('P05 문구: 실제 모드는 "모의 기능" 안내가 없고, 모의 모드에만 있다. 서버 잠금 안내는 제출을 막지 않는다', () => {
  const props = {
    status: { kind: 'ready', configured: true, retryAt: null, locked: true },
    locked: false,
    submit: async () => null,
    onVerified: () => {},
    onLocked: () => {},
    reload: () => {},
    cancelTo: '/mypage',
  }
  const real = render(
    createElement(VerifyBody, {
      ...props,
      connection: 'server',
      serverLocked: true,
    }),
  )
  assert.doesNotMatch(real, /모의 기능/)
  assert.match(real, /data-pin-server-locked/)
  assert.match(
    real,
    new RegExp(messages.PIN_SERVER_LOCKED_MESSAGE.slice(0, 12)),
  )
  // 입력·확인 버튼이 막히지 않는다(판정은 서버).
  assert.doesNotMatch(real, /<button type="submit"[^>]*\sdisabled=""/)
  const mock = render(
    createElement(MockVerifyBody, {
      ...props,
      status: { kind: 'ready', configured: true, retryAt: null },
    }),
  )
  assert.match(mock, /모의 기능/)
})

// ── PR #37 리뷰: 선택 입력에서 비운 칸의 오류(F5 P06) ──

test('PR #37 정적: 선택 입력에서 비운 칸은 검사 대신 오류를 지우고(입력·포커스 이동), 제출 때 보내지 않는 칸의 오류도 지우며, 저장 성공 뒤 오류를 비운다', () => {
  const form = readFileSync(
    'src/components/body-measurements/BodyInfoSheet.tsx',
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  assert.match(
    form,
    /const optionalEmpty = \(value: string\) => optional && value\.trim\(\) === ''/,
  )
  // onChange: 비운 선택 칸이면 clearError가 validate보다 먼저
  assert.match(
    form,
    /if \(optionalEmpty\(e\.target\.value\)\) clearError\(field\.id\)\s*else if \(error\) validate\(field\.id, e\.target\.value\)/,
  )
  // onBlur도 같은 규칙
  assert.match(
    form,
    /onBlur=\{\(e\) => \{\s*if \(optionalEmpty\(e\.target\.value\)\) clearError\(field\.id\)/,
  )
  // 제출: 보내지 않는 선택 칸의 오류 정리
  assert.match(
    form,
    /if \(!targets\.includes\(field\)\) clearError\(field\.id\)/,
  )
  // 저장 성공(화면에 머무는 경우): 입력과 오류를 함께 비움
  assert.match(
    form,
    /setValues\(\{ height: '', weight: '' \}\)\s*setErrors\(\{\}\)/,
  )
})

// ── 정적: 연결 규칙 ──

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const read = (file) => strip(readFileSync(file, 'utf8'))

test('정적: P01 열람 훅은 조건부 폐기만 쓰고 토큰 알림을 구독한다, 폼·P01은 반영 직전 isCurrent, P05는 commit 성공 때만 이동', () => {
  const hook = read('src/body-access/useBodyReveal.ts')
  assert.doesNotMatch(hook, /revokeBodyAccess\(\)/)
  assert.match(hook, /subscribePinToken\(recheck\)/)
  assert.match(hook, /revokeBodyAccessIf\(leaving\)/)
  const form = read('src/components/body-measurements/BodyInfoSheet.tsx')
  // 반영 직전 재확인이 있어야 하고(없으면 indexOf -1이라 순서 비교만으로는 통과해 버린다), 저장 성공 처리보다 앞에 있다.
  const liveCheck = form.indexOf(
    'if (outcome !== null && !isLiveSaveOutcome(outcome))',
  )
  assert.ok(liveCheck > 0, '폼 반영 전 isLiveSaveOutcome 확인')
  assert.ok(liveCheck < form.indexOf("outcome?.kind === 'saved'"))
  const summary = read('src/components/mypage/BodyInfoSummary.tsx')
  assert.match(
    summary,
    /isLiveSaveOutcome\(outcome\)\)\s*revokeBodyAccessIf\(started\)/,
  )
  const view = read('src/components/pin-settings/PinVerifyView.tsx')
  assert.match(view, /if \(commit\(\)\) void navigate\(/)
  // 수치·토큰을 저장소·로그에 남기지 않는다.
  for (const file of [
    'src/body-measurements/serverBodySource.ts',
    'src/body-access/bodyAccessStore.ts',
    'src/body-access/useBodyReveal.ts',
  ])
    assert.doesNotMatch(
      read(file),
      /localStorage|sessionStorage|indexedDB|console\./,
      file,
    )
})
