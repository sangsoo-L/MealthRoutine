// F3 내 정보·프로필 최소 연결: 실제/모의 모드 분기 · 조회(GET /users/me + /users/me/profile → 화면 값) · 만 나이 경계 ·
// 닉네임 저장(PATCH 본문 {displayName}만, 서버가 저장한 값 반환, 409·400·연결 실패 구분, 자동 재전송 없음) ·
// 늦은 저장 응답(F3-R1·C1·C2: 정상 200은 반영, 로그아웃·다른 계정 로그인·같은 계정 재로그인·로그인 시작(응답 보류, 성공/실패)·
// 화면 이탈 뒤 응답은 로그인 정보와 화면 저장 기준·성공 표시 모두 반영 안 함) ·
// 운영 빌드에는 실제 연결 코드가 들어감.
// 실제 서버·실제 계정은 쓰지 않는다(가짜 fetch, 'tok-A1' 같은 가짜 토큰, 'x' 비밀번호). 보류 Promise(deferred)로 순서를 강제한다.
// 개인 .env.development.local의 VITE_DEV_AUTH 값이 결과를 바꾸지 않도록 빈 envDir을 쓴다. 대문자 드라이브(C:\)의 PowerShell에서도 같은 명령으로 실행한다.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { build, createServer } from 'vite'
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

const envDir = mkdtempSync(join(tmpdir(), 'profile-connect-env-'))
const storage = createStorage()
let realServer, mockServer
let prof, mockProf, session, backendModule, ctx, results, hookMod, http, core

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
  prof = await load('/src/profile/profile.ts')
  session = await load('/src/api/session.ts')
  backendModule = await load('/src/auth/serverBackend.ts')
  ctx = await load('/src/auth/authContext.ts')
  results = await load('/src/auth/authResults.ts')
  hookMod = await load('/src/profile/useProfile.ts')
  http = await load('/src/api/http.ts')
  core = await load('/src/api/core.ts')
  mockProf = await mockServer.ssrLoadModule('/src/profile/profile.ts')
})
after(async () => {
  await realServer?.close()
  await mockServer?.close()
  delete globalThis.sessionStorage
  rmSync(envDir, { recursive: true, force: true })
})
beforeEach(() => storage.map.clear())

/** 가짜 fetch를 쓰는 세션 하나 + 그 세션의 실제 인증 처리(serverBackend: 로그인 결과를 AuthUser로 바꾼다). */
function makeSession() {
  const fake = createFakeServer()
  const s = session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  const backend = backendModule.createServerBackend(s)
  const source = prof.createServerProfileSource(
    s.request.bind(s),
    () => new Date(2026, 10, 24),
  )
  return { fake, s, backend, source }
}

/** AuthProvider처럼 로그인 결과의 user 객체를 상태로 쓴다(로그인할 때마다 새 객체). */
async function loginAs(fake, backend, userId, token) {
  fake.on('POST /auth/login', loginOk(userId, token))
  fake.on('GET /users/me', me(userId))
  const result = await backend.login(`u${userId}@example.test`, 'x')
  assert.equal(result.ok, true)
  return result.user
}

const PROFILE = {
  displayName: 'nick7',
  birthDate: '2000-05-10',
  gender: 'female',
  regionCode: '11',
  profileImageUrl: null,
  exerciseLevel: 'beginner',
  phoneNumber: '010-1234-5678',
  dietaryPreferences: ['밥'],
}
const signal = () => new AbortController().signal

// ── 모드 분기 ──

test('모드: 개발 기본(실제 서버)은 서버 연결, 개발 VITE_DEV_AUTH=true(모의 로그인)는 연결 전(null)', () => {
  const real = prof.createProfileSource()
  assert.notEqual(real, null)
  assert.equal(typeof real.getProfile, 'function')
  assert.equal(typeof real.updateNickname, 'function')
  assert.equal(mockProf.createProfileSource(), null)
})

// ── 조회 ──

test('조회: 로그인 토큰으로 /users/me와 /users/me/profile을 읽어 이름·휴대폰·만 나이·성별만 채우고 서버에 없는 항목은 null', async () => {
  const { fake, backend, source } = makeSession()
  await loginAs(fake, backend, 7, 'tok-A1')
  fake.on('GET /users/me', me(7, { username: '홍길동' }))
  fake.on('GET /users/me/profile', ok(PROFILE))
  const data = await source.getProfile(signal())
  assert.deepEqual(data, {
    nickname: 'nick7',
    name: '홍길동',
    phone: '010-1234-5678',
    address: null,
    age: 26,
    sex: 'female',
    allergies: null,
    aiConsent: null,
  })
  const reads = fake.calls.slice(-2)
  assert.deepEqual(reads.map((c) => c.key).sort(), [
    'GET /users/me',
    'GET /users/me/profile',
  ])
  for (const call of reads) {
    assert.equal(call.headers.Authorization, 'Bearer tok-A1')
    // 프로필 조회에는 PIN이 필요 없다(Q-03).
    assert.equal(call.headers['X-Pin-Token'], undefined)
  }
})

test('조회: 프로필이 비어 있으면 null이고 regionCode·dietaryPreferences를 주소·알레르기로 바꾸지 않는다', () => {
  const today = new Date(2026, 10, 24)
  const data = prof.toProfileData(
    { userId: 1, username: null },
    { regionCode: '11', dietaryPreferences: ['우유'], gender: 'unknown' },
    today,
  )
  assert.deepEqual(data, {
    nickname: null,
    name: null,
    phone: null,
    address: null,
    age: null,
    sex: null,
    allergies: null,
    aiConsent: null,
  })
  for (const sex of ['male', 'female', 'other', 'undisclosed'])
    assert.equal(prof.toProfileData({}, { gender: sex }, today).sex, sex)
  assert.throws(() => prof.toProfileData(null, {}, today))
  assert.throws(() => prof.toProfileData({}, [], today))
})

test('조회 실패: 둘 중 하나라도 실패하거나 형식이 다르면 화면은 error(정보 없음으로 단정하지 않음)', async () => {
  const { fake, backend, source } = makeSession()
  await loginAs(fake, backend, 7, 'tok-A1')
  fake.on('GET /users/me', me(7))
  fake.on('GET /users/me/profile', fail(500, 'INTERNAL_ERROR'))
  assert.deepEqual(await prof.runGetProfile(source, signal()), {
    status: 'error',
  })
  fake.on('GET /users/me', me(7))
  fake.on('GET /users/me/profile', ok(null))
  assert.deepEqual(await prof.runGetProfile(source, signal()), {
    status: 'error',
  })
})

// ── 만 나이 ──

test('만 나이: 생일 전날·당일·다음 날, 연도 경계, 2월 29일, 만 0세, 미래·없는 날짜·형식 오류', () => {
  const at = (y, m, d) => new Date(y, m - 1, d)
  assert.equal(prof.ageOn('2000-05-10', at(2026, 5, 9)), 25)
  assert.equal(prof.ageOn('2000-05-10', at(2026, 5, 10)), 26)
  assert.equal(prof.ageOn('2000-05-10', at(2026, 5, 11)), 26)
  assert.equal(prof.ageOn('2000-12-31', at(2026, 12, 30)), 25)
  assert.equal(prof.ageOn('2000-12-31', at(2026, 12, 31)), 26)
  assert.equal(prof.ageOn('2001-01-01', at(2026, 12, 31)), 25)
  assert.equal(prof.ageOn('2001-01-01', at(2027, 1, 1)), 26)
  // 2월 29일 생일: 평년에는 3월 1일에 한 살 늘어난다.
  assert.equal(prof.ageOn('2004-02-29', at(2025, 2, 28)), 20)
  assert.equal(prof.ageOn('2004-02-29', at(2025, 3, 1)), 21)
  assert.equal(prof.ageOn('2004-02-29', at(2028, 2, 29)), 24)
  // 만 0세(생후 첫해)도 나이다.
  assert.equal(prof.ageOn('2026-11-24', at(2026, 11, 24)), 0)
  assert.equal(prof.ageOn('2026-03-01', at(2026, 11, 24)), 0)
  assert.equal(prof.ageOn('2025-11-25', at(2026, 11, 24)), 0)
  assert.equal(prof.ageOn('2025-11-24', at(2026, 11, 24)), 1)
  for (const bad of [
    '2026-11-25',
    '2001-02-30',
    '2001-13-01',
    '2001-2-3',
    '20010203',
    '',
    null,
    undefined,
    20010203,
  ])
    assert.equal(prof.ageOn(bad, at(2026, 11, 24)), null, String(bad))
  // 화면 표시: 만 0세는 "0세"로 보인다.
  const view = prof.profileFieldView(
    {
      status: 'ready',
      data: {
        name: null,
        phone: null,
        address: null,
        age: 0,
        sex: null,
        allergies: null,
        aiConsent: null,
      },
    },
    'identity',
  )
  assert.deepEqual(view, { kind: 'value', text: '0세' })
})

// ── 닉네임 저장 ──

test('저장: PATCH /users/me/profile 본문은 {displayName} 하나(앞뒤 공백 뺀 값)이고 서버가 저장한 값을 돌려준다', async () => {
  const { fake, backend, source } = makeSession()
  await loginAs(fake, backend, 7, 'tok-A1')
  fake.on('PATCH /users/me/profile', ok({ ...PROFILE, displayName: '새닉' }))
  const checked = prof.validateNickname(' 새닉 ')
  assert.equal(checked.ok, true)
  assert.deepEqual(
    await prof.runUpdateNickname(source, checked.nickname, signal()),
    { phase: 'saved', nickname: '새닉' },
  )
  const call = fake.calls.at(-1)
  assert.equal(call.key, 'PATCH /users/me/profile')
  assert.deepEqual(call.body, { displayName: '새닉' })
  assert.deepEqual(Object.keys(call.body), ['displayName'])
  assert.equal(call.headers.Authorization, 'Bearer tok-A1')
  // 서버가 다른 값으로 저장했다고 답하면 그 값이 결과다(입력값으로 대신하지 않는다).
  fake.on('PATCH /users/me/profile', ok({ ...PROFILE, displayName: 'Server1' }))
  assert.deepEqual(await prof.runUpdateNickname(source, '새닉', signal()), {
    phase: 'saved',
    nickname: 'Server1',
  })
})

test('저장 응답 분류(PR #29 P2-02·P3-1, F3-R29-QA): 200 + 계약에 맞는 닉네임만 saved, 비정상 성공·네트워크·5xx는 uncertain, 다시 보내지 않는다', async () => {
  const cases = [
    [fail(409, 'NICKNAME_ALREADY_EXISTS'), 'taken'],
    [fail(400, 'INVALID_REQUEST'), 'rejected'],
    [fail(400, 'SOMETHING_ELSE'), 'failed'],
    [fail(409, 'SOMETHING_ELSE'), 'failed'],
    [fail(403, 'ACCESS_DENIED'), 'failed'],
    [fail(500, 'INTERNAL_ERROR'), 'uncertain'],
    [fail(503, 'SERVICE_UNAVAILABLE'), 'uncertain'],
    [networkError(), 'uncertain'],
    // 200이 아닌 2xx(계약과 다름)
    [ok({ ...PROFILE, displayName: '새닉' }, 201), 'uncertain'],
    [noContent(), 'uncertain'],
    // 200인데 data·displayName이 계약과 다름
    [ok(null), 'uncertain'],
    [ok([]), 'uncertain'],
    [ok({ ...PROFILE, displayName: null }), 'uncertain'],
    [ok({ ...PROFILE, displayName: undefined }), 'uncertain'],
    [ok({ ...PROFILE, displayName: 123 }), 'uncertain'],
    [ok({ ...PROFILE, displayName: '' }), 'uncertain'],
    [ok({ ...PROFILE, displayName: '   ' }), 'uncertain'],
    [ok({ ...PROFILE, displayName: ' 새닉' }), 'uncertain'],
    [ok({ ...PROFILE, displayName: '새닉 ' }), 'uncertain'],
    [ok({ ...PROFILE, displayName: '가' }), 'uncertain'],
    [ok({ ...PROFILE, displayName: '닉네임!' }), 'uncertain'],
  ]
  for (const [response, phase] of cases) {
    const { fake, backend, source } = makeSession()
    await loginAs(fake, backend, 7, 'tok-A1')
    fake.on('PATCH /users/me/profile', response)
    assert.deepEqual(
      await prof.runUpdateNickname(source, '새닉', signal()),
      { phase },
      `${phase} ${JSON.stringify(response?.status ?? 'network')}`,
    )
    // 자동 재전송 없음: PATCH는 한 번뿐이다.
    assert.equal(
      fake.keys().filter((k) => k === 'PATCH /users/me/profile').length,
      1,
    )
  }
})

test('서버 닉네임 검사(serverNickname): 문자열·원문 앞뒤 공백 없음·NAME-2(가입과 같은 규칙)만 통과', () => {
  for (const ok of ['새닉', 'nick7', '한글닉네임여덟', 'abcdefghij123456'])
    assert.equal(prof.serverNickname(ok), ok, ok)
  for (const bad of [
    null,
    undefined,
    7,
    {},
    '',
    '  ',
    ' 새닉',
    '새닉 ',
    '가',
    '한글닉네임아홉자요',
    'abcdefghij1234567',
    '닉 네임',
    '닉네임!',
  ])
    assert.equal(prof.serverNickname(bad), null, String(bad))
})

test('저장 순서(P2-02): 비정상 성공·결과 미확인이면 로그인 정보 반영(commit)을 부르지 않는다', async () => {
  for (const response of [
    ok({ ...PROFILE, displayName: '' }, 201),
    ok({ ...PROFILE, displayName: '  ' }),
    noContent(),
    networkError(),
  ]) {
    const { fake, backend, source } = makeSession()
    await loginAs(fake, backend, 7, 'tok-A1')
    fake.on('PATCH /users/me/profile', response)
    let committed = 0
    const outcome = await prof.saveNickname(source, '새닉', signal(), {
      isCurrent: () => true,
      commit: () => {
        committed += 1
        return true
      },
    })
    assert.deepEqual(outcome, { phase: 'uncertain' })
    assert.equal(committed, 0)
    // 화면: 안내만 바뀌고 저장 기준·입력은 그대로
    assert.deepEqual(prof.saveOutcomePatch(outcome), { phase: 'uncertain' })
  }
})

// ── 늦은 저장 응답(F3-R1·C1·C2) ──

test('로그인 작업 번호(createLoginWork): 로그인 시작·로그인 정보 교체 뒤 이전 표식은 무효이고 다시 유효해지지 않는다', () => {
  const a = {
    id: '7',
    email: 'a@example.test',
    nickname: '옛닉',
    entitlement: 'free',
  }
  const work = ctx.createLoginWork(a)
  // 정상: 같은 작업이면 반영(새 객체), 번호는 그대로라 다음 저장도 유효
  const g1 = work.beginNicknameSave()
  assert.equal(g1.isCurrent(), true)
  const next = g1.commit('새닉')
  assert.deepEqual(next, { ...a, nickname: '새닉' })
  assert.notEqual(next, a)
  assert.equal(work.user, next)
  assert.equal(work.beginNicknameSave().isCurrent(), true)
  // 로그인 시작만으로 무효(C1). 결과가 실패라 user가 그대로여도 다시 유효해지지 않는다.
  const g2 = work.beginNicknameSave()
  work.startLogin()
  assert.equal(g2.isCurrent(), false)
  assert.equal(g2.commit('X'), null)
  assert.equal(work.user.nickname, '새닉')
  // 같은 회원 재로그인(교체)·다른 회원·로그아웃
  const g3 = work.beginNicknameSave()
  work.replaceUser({ ...a })
  assert.equal(g3.isCurrent(), false)
  assert.equal(g3.commit('X'), null)
  const g4 = work.beginNicknameSave()
  work.replaceUser({ ...a, id: '8' })
  assert.equal(g4.commit('X'), null)
  work.replaceUser(null)
  assert.equal(work.beginNicknameSave(), null)
  assert.equal(ctx.createLoginWork(null).beginNicknameSave(), null)
})

test('화면 반영(saveOutcomePatch): stale·연결 없음은 진행 표시만 끝내고 저장 기준·성공 표시를 바꾸지 않는다', () => {
  assert.deepEqual(prof.saveOutcomePatch('stale'), { phase: 'idle' })
  assert.deepEqual(prof.saveOutcomePatch(null), { phase: 'idle' })
  assert.deepEqual(prof.saveOutcomePatch({ phase: 'saved', nickname: 'S' }), {
    phase: 'saved',
    saved: 'S',
  })
  for (const phase of ['failed', 'taken', 'rejected', 'uncertain'])
    assert.deepEqual(prof.saveOutcomePatch({ phase }), { phase })
})

/**
 * AuthProvider와 같은 연결을 React 없이 만든다: 작업 번호(createLoginWork) + 실제 결과 반영(authResults.applyLoginResult) +
 * 로그인 시작 때 startLogin, user를 바꾸는 곳은 replaceUser, 로그아웃은 backend.clear + replaceUser(null),
 * beginNicknameSave의 commit은 반영할 때만 상태를 바꾸고 true. (Provider 코드가 이 연결과 같은지는 아래 정적 테스트가 확인한다.)
 * screen은 화면(ProfileSettingsView)의 저장 기준·입력·안내 상태이고 saveOutcomePatch로만 바뀐다.
 */
function makeProvider(backend) {
  const work = ctx.createLoginWork(null)
  const state = { user: null }
  const replaceUser = (next) => {
    work.replaceUser(next)
    state.user = next
  }
  const actions = {
    isCurrent: (gen) => backend.isCurrent(gen),
    clearAccountData() {},
    clearAccountScopedData() {},
    persist() {},
    setUser: replaceUser,
    setBooting() {},
    setConnectionNotice() {},
  }
  return {
    state,
    work,
    login(userId) {
      work.startLogin()
      return backend
        .login(`u${userId}@example.test`, 'x')
        .then((result) => results.applyLoginResult(result, actions))
    },
    logout() {
      backend.clear()
      replaceUser(null)
    },
    beginNicknameSave() {
      const guard = work.beginNicknameSave()
      if (guard === null) return null
      return {
        isCurrent: guard.isCurrent,
        commit(nickname) {
          const next = guard.commit(nickname)
          if (next === null) return false
          state.user = next
          return true
        },
      }
    },
  }
}

function screenAfter(screen, outcome) {
  const patch = prof.saveOutcomePatch(outcome)
  return patch.saved === undefined
    ? { ...screen, phase: patch.phase }
    : { nickname: patch.saved, saved: patch.saved, phase: patch.phase }
}

/**
 * 실제 세션으로 A 로그인 → 저장 시작(PATCH 보류) → 사이에 일어나는 일 → PATCH 200 해제 → (필요하면) 뒤처리.
 * 화면은 입력 '새닉', 저장 기준 'nick7'에서 시작한다.
 */
async function lateSaveScenario(between, afterPatch = async () => {}) {
  const { fake, s, backend, source } = makeSession()
  const app = makeProvider(backend)
  fake.on('POST /auth/login', loginOk(7, 'tok-A1'))
  fake.on('GET /users/me', me(7))
  assert.equal((await app.login(7)).ok, true)
  const startedWith = app.state.user
  const patch = deferred()
  fake.on('PATCH /users/me/profile', patch)
  const controller = new AbortController()
  const guard = app.beginNicknameSave()
  const saving = prof.saveNickname(source, '새닉', controller.signal, guard)
  await flush()
  assert.equal(fake.pending('PATCH /users/me/profile'), 0, 'PATCH가 나감')
  const ctxt = { fake, s, backend, app, controller }
  await between(ctxt)
  patch.resolve(ok({ ...PROFILE, displayName: '새닉' }))
  const outcome = await within(saving)
  const screen = screenAfter(
    { nickname: '새닉', saved: 'nick7', phase: 'saving' },
    outcome,
  )
  await afterPatch(ctxt)
  return { outcome, screen, state: app.state, startedWith, fake }
}

const unchangedScreen = { nickname: '새닉', saved: 'nick7', phase: 'idle' }

test('R1 정상: 저장 중 아무 일도 없으면 서버가 저장한 닉네임이 로그인 정보와 화면 저장 기준에 함께 반영된다', async () => {
  const { outcome, screen, state, startedWith } = await lateSaveScenario(
    async () => {},
  )
  assert.deepEqual(outcome, { phase: 'saved', nickname: '새닉' })
  assert.deepEqual(screen, { nickname: '새닉', saved: '새닉', phase: 'saved' })
  assert.equal(state.user.id, '7')
  assert.equal(state.user.nickname, '새닉')
  assert.notEqual(state.user, startedWith)
})

test('R1 정상 + 토큰 재발급: refresh만 일어난 같은 로그인 작업이면 계속 반영된다', async () => {
  const { fake, backend, source } = makeSession()
  const app = makeProvider(backend)
  fake.on('POST /auth/login', loginOk(7, 'tok-A1'))
  fake.on('GET /users/me', me(7))
  await app.login(7)
  // 첫 PATCH는 만료 → 재발급(새 토큰 확인) → 같은 요청 1회 재시도 200
  fake.on('PATCH /users/me/profile', fail(401, 'TOKEN_EXPIRED'))
  fake.on('POST /auth/token/refresh', ok({ accessToken: 'tok-A2' }))
  fake.on('GET /users/me', me(7))
  fake.on('PATCH /users/me/profile', ok({ ...PROFILE, displayName: '새닉' }))
  const outcome = await prof.saveNickname(
    source,
    '새닉',
    signal(),
    app.beginNicknameSave(),
  )
  assert.deepEqual(outcome, { phase: 'saved', nickname: '새닉' })
  assert.equal(app.state.user.nickname, '새닉')
  assert.equal(fake.calls.at(-1).headers.Authorization, 'Bearer tok-A2')
})

test('R1 로그아웃: 저장 중 로그아웃하면 늦은 200은 로그인 정보·화면 모두 반영하지 않는다(공통 호출은 응답을 그대로 돌려줌)', async () => {
  const { outcome, screen, state } = await lateSaveScenario(
    async ({ fake, app }) => {
      fake.on('POST /auth/logout', noContent())
      app.logout()
      await flush()
    },
  )
  assert.equal(outcome, 'stale')
  assert.deepEqual(screen, unchangedScreen)
  assert.equal(state.user, null)
})

test('R1 다른 계정 로그인: 저장 중 B로 로그인하면 늦은 200이 B와 화면을 바꾸지 않는다', async () => {
  const { outcome, screen, state } = await lateSaveScenario(
    async ({ fake, app }) => {
      fake.on('POST /auth/logout', noContent())
      app.logout()
      fake.on('POST /auth/login', loginOk(8, 'tok-B1'))
      fake.on('GET /users/me', me(8))
      await app.login(8)
    },
  )
  assert.equal(outcome, 'stale')
  assert.deepEqual(screen, unchangedScreen)
  assert.equal(state.user.id, '8')
  assert.equal(state.user.nickname, 'nick8')
})

test('R1 같은 계정 재로그인(완료): 회원 ID가 같아도 새 로그인 작업이면 로그인 정보·화면 저장 기준·성공 표시 모두 불변', async () => {
  const { outcome, screen, state, startedWith } = await lateSaveScenario(
    async ({ fake, app }) => {
      fake.on('POST /auth/login', loginOk(7, 'tok-A2'))
      fake.on('GET /users/me', me(7, { nickname: 'FreshLogin' }))
      await app.login(7)
    },
  )
  assert.equal(outcome, 'stale')
  assert.deepEqual(screen, unchangedScreen)
  assert.notEqual(state.user, startedWith)
  assert.equal(state.user.nickname, 'FreshLogin')
})

test('C1 로그인 시작~응답 사이(성공): 로그인 응답을 보류한 채 이전 PATCH가 먼저 오면 버리고, 로그인 성공 뒤에도 되살아나지 않는다', async () => {
  let loginTask
  const loginGate = deferred()
  const { outcome, screen, state } = await lateSaveScenario(
    async ({ fake, app }) => {
      // 로그아웃 없이 새 로그인 시작(AuthContext 경로 실험), 응답 보류
      fake.on('POST /auth/login', loginGate)
      fake.on('GET /users/me', me(7, { nickname: 'FreshLogin' }))
      loginTask = app.login(7)
      await flush()
      // 아직 로그인 결과 전: user 객체는 그대로지만 작업은 무효다.
      assert.equal(app.state.user.id, '7')
    },
    async () => {
      loginGate.resolve(loginOk(7, 'tok-A2'))
      assert.equal((await within(loginTask)).ok, true)
    },
  )
  assert.equal(outcome, 'stale')
  assert.deepEqual(screen, unchangedScreen)
  assert.equal(state.user.nickname, 'FreshLogin')
})

test('C1 로그인 시작~응답 사이(실패): 새 로그인이 LOGIN_FAILED로 끝나 user가 그대로여도 이전 PATCH 결과는 반영하지 않는다', async () => {
  let loginTask, startedUser
  const loginGate = deferred()
  const { outcome, screen, state } = await lateSaveScenario(
    async ({ fake, app }) => {
      startedUser = app.state.user
      fake.on('POST /auth/login', loginGate)
      loginTask = app.login(7)
      await flush()
    },
    async () => {
      loginGate.resolve(fail(401, 'LOGIN_FAILED'))
      assert.equal((await within(loginTask)).ok, false)
    },
  )
  assert.equal(outcome, 'stale')
  assert.deepEqual(screen, unchangedScreen)
  // 실패 처리에서는 user를 바꾸지 않는다 → 같은 객체·옛 닉네임 그대로
  assert.equal(state.user, startedUser)
  assert.equal(state.user.nickname, 'nick7')
})

test('C1 실패 결과도 무효 작업이면 버린다: 로그인 시작 뒤 도착한 409는 화면에 "이미 사용 중" 안내를 만들지 않는다', async () => {
  const { fake, backend, source } = makeSession()
  const app = makeProvider(backend)
  fake.on('POST /auth/login', loginOk(7, 'tok-A1'))
  fake.on('GET /users/me', me(7))
  await app.login(7)
  const patch = deferred()
  fake.on('PATCH /users/me/profile', patch)
  const saving = prof.saveNickname(
    source,
    '새닉',
    signal(),
    app.beginNicknameSave(),
  )
  await flush()
  fake.on('POST /auth/login', deferred())
  app.login(7)
  patch.resolve(fail(409, 'NICKNAME_ALREADY_EXISTS'))
  assert.equal(await within(saving), 'stale')
})

test('C2 계약: 표식이 유효해 보여도 로그인 정보 반영(commit)이 거절되면 화면도 stale로 버린다', async () => {
  const { fake, backend, source } = makeSession()
  await loginAs(fake, backend, 7, 'tok-A1')
  fake.on('PATCH /users/me/profile', ok({ ...PROFILE, displayName: '새닉' }))
  const outcome = await prof.saveNickname(source, '새닉', signal(), {
    isCurrent: () => true,
    commit: () => false,
  })
  assert.equal(outcome, 'stale')
  assert.deepEqual(prof.saveOutcomePatch(outcome), { phase: 'idle' })
})

test('R1 화면 이탈: 응답 전에 중단하면 stale로 끝나고 아무것도 반영하지 않는다("취소됨"으로 안내하지 않음)', async () => {
  const { outcome, state, startedWith } = await lateSaveScenario(
    async ({ controller }) => {
      controller.abort()
      await flush()
    },
  )
  assert.equal(outcome, 'stale')
  assert.equal(state.user, startedWith)
  assert.equal(state.user.nickname, 'nick7')
})

test('저장 순서: 실패·중복이면 commit을 부르지 않고, 표식이 없으면(로그아웃 상태) 저장 표식은 null', async () => {
  for (const response of [
    fail(409, 'NICKNAME_ALREADY_EXISTS'),
    fail(500, 'INTERNAL_ERROR'),
  ]) {
    const { fake, backend, source } = makeSession()
    await loginAs(fake, backend, 7, 'tok-A1')
    fake.on('PATCH /users/me/profile', response)
    let committed = false
    const outcome = await prof.saveNickname(source, '새닉', signal(), {
      isCurrent: () => true,
      commit() {
        committed = true
        return true
      },
    })
    assert.notEqual(outcome.phase, 'saved')
    assert.equal(committed, false)
  }
  const { backend } = makeSession()
  assert.equal(makeProvider(backend).beginNicknameSave(), null)
})

// ── 화면 연결(정적) ──

/**
 * 정적 검사(PR #29 P3-2): 파일 내용을 읽는 함수를 받아 같은 검사를 한다. 윈도우 체크아웃(.gitattributes `* text=auto` → CRLF)에서도
 * 결과가 같도록 읽은 내용의 줄바꿈을 LF로 맞추고 주석을 뺀다.
 */
const normalizeSource = (text) =>
  text.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
function wiringChecks(read) {
  const provider = read('src/auth/AuthProvider.tsx')
  // user 상태를 직접 바꾸는 곳은 replaceUser(작업 번호 증가)와 commit 성공뿐이다.
  assert.equal((provider.match(/setUser\(/g) ?? []).length, 2)
  assert.match(provider, /work\.replaceUser\(next\)\s*\n\s*setUser\(next\)/)
  assert.match(provider, /setUser: replaceUser/)
  assert.match(provider, /replaceUser\(null\)/)
  assert.doesNotMatch(provider, /setUser\(null\)/)
  // 로그인 시작(새 요청을 만들 때)에 작업 번호를 올린다 — 진행 중 요청을 돌려주는 경우는 제외.
  const login = provider.slice(provider.indexOf('const login = useCallback'))
  assert.ok(
    login.indexOf('if (pendingRef.current) return pendingRef.current') <
      login.indexOf('work.startLogin()'),
  )
  assert.ok(
    login.indexOf('work.startLogin()') < login.indexOf('const task = run()'),
  )
  assert.match(
    provider,
    /const next = guard\.commit\(nickname\)\s*\n\s*if \(next === null\) return false\s*\n\s*setUser\(next\)\s*\n\s*return true/,
  )
  assert.match(provider, /beginNicknameSave,\n\s*\}\),/)
  const page = read('src/pages/ProfileSettingsPage.tsx')
  assert.match(page, /beginSave=\{beginNicknameSave\}/)
  assert.match(page, /key=\{user\.id\}/)
  const view = read('src/components/settings/profile/ProfileSettingsView.tsx')
  // 표식은 요청 전에 받아 saveNickname에 넘기고, 결과는 중단 확인 뒤 saveOutcomePatch로만 반영한다.
  assert.match(
    view,
    /const guard = beginSave \? beginSave\(\) : undefined\s*\n\s*if \(guard === null\) return/,
  )
  assert.match(
    view,
    /await saveNickname\(\s*source,\s*result\.nickname,\s*controller\.signal,\s*guard,\s*\)/,
  )
  assert.ok(view.indexOf('beginSave()') < view.indexOf('await saveNickname('))
  const aborted = view.indexOf('if (controller.signal.aborted) return')
  assert.ok(aborted > view.indexOf('await saveNickname('))
  assert.ok(view.indexOf('saveOutcomePatch(outcome)') > aborted)
  assert.ok(view.indexOf('setEditor({ input: saved, saved })') > aborted)
  assert.doesNotMatch(view, /setEditor\(\{[^}]*(result|outcome)\.nickname/)
}

test('화면 연결(정적): Provider는 로그인 시작에 startLogin, user 교체는 replaceUser, 저장은 beginNicknameSave로 묶고 화면은 같은 판정을 쓴다', () => {
  wiringChecks((path) => normalizeSource(readFileSync(path, 'utf8')))
})

test('정적 검사 줄바꿈(P3-2): 같은 파일을 CRLF로 바꿔 넣어도 같은 검사를 통과하고, 정규화가 없으면 실패한다', () => {
  const crlf = (path) => readFileSync(path, 'utf8').replace(/\r?\n/g, '\r\n')
  wiringChecks((path) => normalizeSource(crlf(path)))
  // 대조군: 정규화 없이 CRLF 그대로면 줄바꿈을 직접 쓰는 검사가 실패한다(이 테스트가 실제로 CRLF를 넣고 있다는 확인).
  assert.throws(() =>
    wiringChecks((path) =>
      crlf(path).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''),
    ),
  )
})

// ── 최신 닉네임 동기화와 늦은 조회(PR #29 P2-03) ──

const editor = (input, saved) => ({ input, saved })

test('동기화(syncNicknameBaseline): 기준은 새 서버 값, 입력은 깨끗할 때만 따라가고 미저장·저장 중 입력은 보존', () => {
  // 깨끗함(앞뒤 공백만 다른 입력도 깨끗함)
  assert.deepEqual(
    prof.syncNicknameBaseline(editor('nick7', 'nick7'), '최신', false),
    editor('최신', '최신'),
  )
  assert.deepEqual(
    prof.syncNicknameBaseline(editor(' nick7 ', 'nick7'), '최신', false),
    editor('최신', '최신'),
  )
  // 미저장 입력 보존
  assert.deepEqual(
    prof.syncNicknameBaseline(editor('작성중', 'nick7'), '최신', false),
    editor('작성중', '최신'),
  )
  // 저장 중: 입력은 그대로(응답이 정리), 기준만
  assert.deepEqual(
    prof.syncNicknameBaseline(editor('nick7', 'nick7'), '최신', true),
    editor('nick7', '최신'),
  )
  // 같은 값이 들어와도 기준을 다시 맞춘다(같은 닉네임 재로그인 뒤 기준이 다른 값이던 경우)
  assert.deepEqual(
    prof.syncNicknameBaseline(editor('옛GET', '옛GET'), 'nick7', false),
    editor('nick7', 'nick7'),
  )
})

test('조회 닉네임: GET displayName은 계약에 맞을 때만 ProfileData.nickname이고, 아니면 null(기준을 지우지 않음)', () => {
  const today = new Date(2026, 10, 24)
  assert.equal(
    prof.toProfileData({}, { displayName: '최신닉' }, today).nickname,
    '최신닉',
  )
  for (const bad of [undefined, null, '', '  ', ' 최신닉', '가'])
    assert.equal(
      prof.toProfileData({}, { displayName: bad }, today).nickname,
      null,
    )
})

/**
 * 페이지(ProfileSettingsPage)와 같은 판정을 React 없이 만든다: 조회 판정(createReadGate: 로그인 작업 표식 + 저장 버전),
 * 같은 회원 재로그인 감지(마운트 때 표식 → user가 바뀌면 isCurrent 확인 → loginEpoch). 연결이 같은지는 정적 검사가 본다.
 */
function makePage(user) {
  const work = ctx.createLoginWork(user)
  const page = {
    work,
    version: 0,
    loginEpoch: 0,
    marker: work.beginNicknameSave(),
    seenUser: work.user,
  }
  page.beginRead = prof.createReadGate(
    () => work.beginNicknameSave(),
    () => page.version,
  )
  /** AuthProvider가 user를 바꾼 뒤 페이지가 다시 그려질 때 */
  page.render = () => {
    if (page.seenUser === work.user) return
    page.seenUser = work.user
    if (!page.marker?.isCurrent()) {
      page.marker = work.beginNicknameSave()
      page.loginEpoch += 1
    }
  }
  return page
}
const USER7 = {
  id: '7',
  email: 'u7@example.test',
  nickname: 'nick7',
  entitlement: 'free',
}

/** 조회를 보류해 두고 between을 실행한 뒤 조회 응답을 풀어, 그 결과를 반영해도 되는지(판정)와 결과를 돌려준다. */
async function lateRead(page, between, displayName) {
  const { fake, backend, source } = makeSession()
  await loginAs(fake, backend, 7, 'tok-A1')
  const meD = deferred()
  const profD = deferred()
  fake.on('GET /users/me', meD)
  fake.on('GET /users/me/profile', profD)
  const read = page.beginRead()
  const reading = prof.runGetProfile(source, signal())
  await flush()
  await between()
  meD.resolve(me(7))
  profD.resolve(ok({ ...PROFILE, displayName }))
  const state = await within(reading)
  assert.equal(state.status, 'ready')
  return { fresh: read.fresh(), nickname: state.data.nickname }
}

test('P2-03 경로 ①: 조회 보류 → 같은 ID 재로그인 완료(닉네임 변경) → 예전 조회는 버리고, 기준은 새 로그인 정보 닉네임', async () => {
  const page = makePage(USER7)
  let ed = editor('nick7', 'nick7')
  const r = await lateRead(
    page,
    () => {
      page.work.startLogin()
      page.work.replaceUser({ ...USER7, nickname: '새로그인닉' })
      page.render()
    },
    '옛조회닉',
  )
  assert.equal(r.fresh, false, '이전 로그인 작업의 조회는 버린다')
  assert.equal(page.loginEpoch, 1)
  // loginEpoch가 바뀌면 화면은 로그인 정보 닉네임으로 기준을 맞춘다
  ed = prof.syncNicknameBaseline(ed, page.work.user.nickname, false)
  assert.deepEqual(ed, editor('새로그인닉', '새로그인닉'))
  // 새 로그인 작업에서 다시 시작한 조회는 반영된다
  const again = await lateRead(page, () => {}, '새로그인닉')
  assert.equal(again.fresh, true)
})

test('P2-03 경로 ① 같은 닉네임 재로그인: 닉네임 문자열이 같아도 새 로그인 작업으로 감지하고, 화면 기준을 로그인 정보 값으로 되돌린다', async () => {
  const page = makePage(USER7)
  // 그 전에 최신 조회가 다른 닉네임을 기준으로 만들어 둔 상태
  let ed = prof.syncNicknameBaseline(editor('nick7', 'nick7'), '조회닉', false)
  assert.deepEqual(ed, editor('조회닉', '조회닉'))
  const r = await lateRead(
    page,
    () => {
      page.work.startLogin()
      page.work.replaceUser({ ...USER7 }) // 같은 ID·같은 닉네임, 새 객체
      page.render()
    },
    '조회닉',
  )
  assert.equal(r.fresh, false)
  assert.equal(page.loginEpoch, 1, '같은 닉네임이어도 새 로그인 작업')
  ed = prof.syncNicknameBaseline(ed, page.work.user.nickname, false)
  assert.deepEqual(ed, editor('nick7', 'nick7'))
  // 미저장 입력이 있었다면 보존
  assert.deepEqual(
    prof.syncNicknameBaseline(
      editor('작성중', '조회닉'),
      page.work.user.nickname,
      false,
    ),
    editor('작성중', 'nick7'),
  )
})

test('P2-03 경로 ②: 조회 보류 → 저장 성공(PATCH 200) 반영 → 예전 조회는 버린다(기준을 되돌리지 않음)', async () => {
  const page = makePage(USER7)
  let ed = editor('새닉', 'nick7')
  const r = await lateRead(
    page,
    () => {
      // 화면이 저장 성공을 반영: 기준·입력 = 서버 값, 저장 버전 +1(onSaved)
      ed = editor('새닉', '새닉')
      page.version += 1
    },
    'nick7',
  )
  assert.equal(r.fresh, false, '저장 성공 전에 시작한 조회는 버린다')
  assert.deepEqual(ed, editor('새닉', '새닉'))
  // 저장 뒤 시작한 조회는 반영된다
  assert.equal((await lateRead(page, () => {}, '새닉')).fresh, true)
})

test('P2-03: 자기 저장 성공(commit)은 같은 로그인 작업이라 재로그인으로 보지 않는다(loginEpoch 불변, 다시 조회 없음)', () => {
  const page = makePage(USER7)
  const guard = page.work.beginNicknameSave()
  assert.notEqual(guard.commit('새닉'), null)
  page.render() // user 객체는 바뀜
  assert.equal(page.loginEpoch, 0)
  assert.equal(page.marker.isCurrent(), true)
  // 로그아웃(다른 계정 전환은 페이지 key로 새로 마운트)
  page.work.replaceUser(null)
  page.render()
  assert.equal(page.loginEpoch, 1)
})

test('P2-03: 최신 조회(같은 작업·같은 버전)는 반영되고 깨끗한 입력만 따라가며, 유효값 없는 조회는 기준을 지우지 않는다', async () => {
  const page = makePage(USER7)
  const r = await lateRead(page, () => {}, '최신닉')
  assert.deepEqual(r, { fresh: true, nickname: '최신닉' })
  assert.deepEqual(
    prof.syncNicknameBaseline(editor('nick7', 'nick7'), r.nickname, false),
    editor('최신닉', '최신닉'),
  )
  assert.deepEqual(
    prof.syncNicknameBaseline(editor('작성중', 'nick7'), r.nickname, false),
    editor('작성중', '최신닉'),
  )
  const empty = await lateRead(page, () => {}, '  ')
  assert.deepEqual(empty, { fresh: true, nickname: null })
  // 화면은 nickname이 문자열일 때만 동기화한다(정적 검사) → 기준 유지
})

test('P2-03: 조회 판정은 로그인 전(표식 없음)이면 거짓이고, 판정 함수는 로그인 정보를 바꾸지 않는다', () => {
  const gate = prof.createReadGate(
    () => null,
    () => 0,
  )
  assert.equal(gate().fresh(), false)
  const page = makePage(USER7)
  const before = page.work.user
  const read = page.beginRead()
  assert.equal(read.fresh(), true)
  assert.equal(read.version, 0)
  assert.equal(page.work.user, before)
})

test('Codex 재검토 P2(같은 턴): PATCH 200과 예전 GET이 같은 턴에 끝나 GET이 유효 판정을 통과해도, 편집기 적용 때 저장 버전으로 걸러 입력·기준·로그인 정보가 PATCH 결과를 유지한다', async () => {
  const { fake, backend, source } = makeSession()
  const app = makeProvider(backend)
  fake.on('POST /auth/login', loginOk(7, 'tok-A1'))
  fake.on('GET /users/me', me(7))
  assert.equal((await app.login(7)).ok, true)
  // 화면: 저장 버전(편집기 상태와 페이지 ref가 같은 횟수로 올린다)
  let saveVersion = 0
  let editorState = { input: '새닉', saved: 'nick7' }
  const gate = prof.createReadGate(
    () => app.beginNicknameSave(),
    () => saveVersion,
  )
  // 1) 조회 시작(저장 버전 0) — 응답 보류
  const meD = deferred()
  const profD = deferred()
  fake.on('GET /users/me', meD)
  fake.on('GET /users/me/profile', profD)
  const read = gate()
  let freshAtArrival = null
  const reading = prof.runGetProfile(source, signal()).then((state) => {
    // useProfile이 상태에 넣기 전 판정
    freshAtArrival = read.fresh()
    return state.status === 'ready'
      ? { ...state, readVersion: read.version }
      : state
  })
  // 2) 저장 시작 — 응답 보류
  const patchD = deferred()
  fake.on('PATCH /users/me/profile', patchD)
  const saving = prof
    .saveNickname(source, '새닉', signal(), app.beginNicknameSave())
    .then((outcome) => {
      // 화면이 저장 결과를 반영: 입력·기준 + 저장 버전 +1
      const patch = prof.saveOutcomePatch(outcome)
      if (patch.saved !== undefined) {
        editorState = { input: patch.saved, saved: patch.saved }
        saveVersion += 1
      }
      return outcome
    })
  await flush()
  // 3) 같은 턴에 두 응답을 푼다(GET이 먼저 판정을 받도록 GET부터)
  meD.resolve(me(7))
  profD.resolve(ok({ ...PROFILE, displayName: 'nick7' }))
  patchD.resolve(ok({ ...PROFILE, displayName: '새닉' }))
  const [state, outcome] = await within(Promise.all([reading, saving]))
  assert.deepEqual(outcome, { phase: 'saved', nickname: '새닉' })
  // 경합이 실제로 재현됐다: 예전 GET이 상태에 들어가기 전 판정은 통과했다
  assert.equal(freshAtArrival, true, '같은 턴 경합 재현(판정 통과)')
  assert.equal(state.readVersion, 0)
  assert.equal(saveVersion, 1)
  // 4) 같은 렌더에서 편집기가 조회를 적용하려 할 때: 버전이 달라 적용하지 않는다
  const incoming = prof.readNicknameToApply(state, saveVersion)
  assert.equal(incoming, null)
  if (incoming !== null)
    editorState = prof.syncNicknameBaseline(editorState, incoming, false)
  assert.deepEqual(editorState, { input: '새닉', saved: '새닉' })
  // 로그인 정보(전역 닉네임)도 PATCH 결과 그대로
  assert.equal(app.state.user.nickname, '새닉')
})

test('조회 적용 판정(readNicknameToApply): 시작 때 저장 버전이 지금과 같을 때만, 문자열 닉네임만', () => {
  const ready = (nickname, readVersion) => ({
    status: 'ready',
    data: { nickname },
    ...(readVersion === undefined ? {} : { readVersion }),
  })
  assert.equal(prof.readNicknameToApply(ready('최신', 2), 2), '최신')
  assert.equal(prof.readNicknameToApply(ready('최신', 1), 2), null)
  assert.equal(
    prof.readNicknameToApply(ready('최신'), 5),
    '최신',
    '버전 없는 시험용 상태',
  )
  assert.equal(prof.readNicknameToApply(ready(null, 0), 0), null)
  for (const status of ['loading', 'error', 'unavailable'])
    assert.equal(prof.readNicknameToApply({ status }, 0), null)
})

test('재조회 중 표시(shownProfileState, 계획 v2): 오래된 조회를 버리고 다시 읽는 동안 보이던 ready를 유지하고, 없으면 loading', () => {
  const ready = { status: 'ready', data: { nickname: 'n' } }
  const error = { status: 'error' }
  const shown = hookMod.shownProfileState
  const at = (attempt, resetKey, state) => ({ attempt, resetKey, state })
  assert.equal(shown(null, 0, null, 0).status, 'loading')
  assert.equal(shown(at(0, 0, ready), 0, null, 0), ready)
  // 버린 뒤 다시 읽는 중: 이전 ready 유지
  assert.equal(shown(at(0, 0, ready), 1, 1, 0), ready)
  // 다시 읽는 중이어도 이전 결과가 오류면 loading
  assert.equal(shown(at(0, 0, error), 1, 1, 0).status, 'loading')
  // 일반 다시 시도(재조회 표시 아님)는 loading
  assert.equal(shown(at(0, 0, ready), 1, null, 0).status, 'loading')
  // 새 로그인 작업(resetKey)이면 이전 결과를 보이지 않는다
  assert.equal(shown(at(0, 0, ready), 0, null, 1).status, 'loading')
  assert.equal(shown(at(0, 0, ready), 1, 1, 1).status, 'loading')
})

test('응답 분류 보완(Codex 재검토): 4xx는 본문이 깨져도 failed, 보내기 전에 막힌 호출(상태 0 INVALID_REQUEST)은 failed, 네트워크(상태 0 NETWORK)만 uncertain', async () => {
  assert.equal(
    core.NETWORK_ERROR,
    'NETWORK',
    '분류가 쓰는 네트워크 코드와 공통 호출 상수가 같다',
  )
  for (const [status, body] of [
    [400, 'not json'],
    [409, '<html>'],
    [404, ''],
  ]) {
    const { fake, backend, source } = makeSession()
    await loginAs(fake, backend, 7, 'tok-A1')
    fake.on('PATCH /users/me/profile', new Response(body, { status }))
    assert.deepEqual(
      await prof.runUpdateNickname(source, '새닉', signal()),
      { phase: 'failed' },
      `${status}`,
    )
  }
  const throwing = (error) =>
    prof.createServerProfileSource(async () => {
      throw error
    })
  const cases = [
    [new http.ApiError(0, 'INVALID_REQUEST', 'x'), 'failed'],
    [new http.ApiError(0, core.NETWORK_ERROR, 'x'), 'uncertain'],
    [new http.ApiError(201, http.INVALID_RESPONSE, 'x'), 'uncertain'],
    [new http.ApiError(422, http.INVALID_RESPONSE, 'x'), 'failed'],
  ]
  for (const [error, phase] of cases)
    assert.deepEqual(
      await prof.runUpdateNickname(throwing(error), '새닉', signal()),
      { phase },
      `${error.status} ${error.errorCode}`,
    )
})

test('P2-01·P2-03 화면 연결(정적): 저장 중 입력 잠금, 동기화는 서버 값만, 오래된 조회는 버리고 다시 읽음, 전역 닉네임은 commit 경로뿐', () => {
  const read = (path) => normalizeSource(readFileSync(path, 'utf8'))
  const view = read('src/components/settings/profile/ProfileSettingsView.tsx')
  // P2-01: readOnly + 입력 핸들러의 동기 확인(값 반영 전에 반환)
  assert.match(view, /readOnly=\{busy\}/)
  const handler = view.slice(view.indexOf('function handleNickname'))
  const guardAt = handler.indexOf('if (savingRef.current) return')
  assert.ok(guardAt > 0, '입력 핸들러의 저장 중 확인')
  assert.ok(guardAt < handler.indexOf('setEditor('))
  // P2-03: 조회 닉네임은 문자열일 때만, 재로그인은 loginEpoch 변경 때 로그인 정보 닉네임으로
  assert.match(
    view,
    /const incoming = readNicknameToApply\(state, saveVersion\)\s*\n\s*if \(incoming !== null\)\s*\n\s*setEditor\(\(e\) => syncNicknameBaseline\(e, incoming, busy\)\)/,
  )
  assert.match(
    view,
    /if \(seenEpoch !== loginEpoch\) \{\s*\n\s*setSeenEpoch\(loginEpoch\)\s*\n\s*setEditor\(\(e\) => syncNicknameBaseline\(e, account\.nickname, busy\)\)/,
  )
  // 저장 성공 반영과 같은 갱신에서 화면 저장 버전을 올리고, 그 뒤 페이지에 알린다(같은 턴 경합 방지)
  const savedAt = view.indexOf('setEditor({ input: saved, saved })')
  assert.ok(savedAt > 0)
  assert.match(
    view.slice(savedAt),
    /^setEditor\(\{ input: saved, saved \}\)\s*\n\s*setSaveVersion\(\(v\) => v \+ 1\)\s*\n[^]*?onSaved\?\.\(\)/,
  )
  // 동기화 경로에서 로그인 정보를 바꾸지 않는다(commit·beginSave 호출은 저장 경로뿐)
  assert.equal((view.match(/beginSave\(\)/g) ?? []).length, 1)
  assert.doesNotMatch(view, /\.commit\(/)
  const page = read('src/pages/ProfileSettingsPage.tsx')
  assert.match(page, /key=\{user\.id\}/)
  assert.match(
    page,
    /if \(!marker\?\.isCurrent\(\)\) \{\s*\n\s*setMarker\(beginNicknameSave\(\)\)\s*\n\s*setLoginEpoch/,
  )
  assert.match(
    page,
    /createReadGate\(beginNicknameSave, \(\) => saveVersion\.current\)/,
  )
  assert.match(page, /resetKey: loginEpoch/)
  assert.match(page, /onSaved=\{onSaved\}/)
  assert.doesNotMatch(page, /\.commit\(/)
  assert.doesNotMatch(
    page,
    /nickname\s*[!=]==/,
    '재로그인을 닉네임 문자열 비교로 판정하지 않는다',
  )
  const hook = read('src/profile/useProfile.ts')
  const freshAt = hook.indexOf('if (read !== null && !read.fresh()) {')
  assert.ok(freshAt > 0)
  const retryAt = hook.indexOf('setAttempt(attempt + 1)', freshAt)
  assert.ok(retryAt > freshAt)
  assert.ok(hook.indexOf('setSilentAttempt(attempt + 1)', freshAt) > freshAt)
  assert.ok(retryAt < hook.indexOf('setLoaded({', freshAt))
  assert.match(hook, /const read = beginRead \? beginRead\(\) : null/)
  // 반영하는 조회에는 시작 때의 저장 버전을 붙인다
  assert.match(hook, /readVersion: read\.version/)
  assert.match(
    hook,
    /state: shownProfileState\(loaded, attempt, silentAttempt, resetKey\)/,
  )
})

// ── 운영 빌드 ──

test('운영 빌드: VITE_DEV_AUTH=true여도 프로필 실제 연결 코드가 들어간다', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  process.env.NODE_ENV = 'production'
  process.env.VITE_DEV_AUTH = 'true'
  let result
  try {
    result = await build({
      envDir,
      mode: 'production',
      logLevel: 'silent',
      build: { write: false },
    })
  } finally {
    delete process.env.VITE_DEV_AUTH
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
  }
  const code = (Array.isArray(result) ? result : [result])
    .flatMap((r) => r.output)
    .filter((o) => o.type === 'chunk')
    .map((o) => o.code)
    .join('\n')
  assert.ok(
    code.includes('/users/me/profile'),
    '프로필 조회·저장 경로가 번들에 있음',
  )
  assert.ok(code.includes('displayName'), 'displayName 변환이 번들에 있음')
  assert.ok(!code.includes('react.development'), '운영 빌드여야 함')
})
