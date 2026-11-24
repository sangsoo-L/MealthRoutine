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
let prof, mockProf, session, backendModule, ctx, results

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

test('저장 실패: 409 중복은 taken, 400은 rejected, 그 밖의 409·500·네트워크·응답 형식 오류는 failed이며 다시 보내지 않는다', async () => {
  const cases = [
    [fail(409, 'NICKNAME_ALREADY_EXISTS'), 'taken'],
    [fail(400, 'INVALID_REQUEST'), 'rejected'],
    [fail(409, 'SOMETHING_ELSE'), 'failed'],
    [fail(500, 'INTERNAL_ERROR'), 'failed'],
    [networkError(), 'failed'],
    [ok({ ...PROFILE, displayName: null }), 'failed'],
    [ok(null), 'failed'],
  ]
  for (const [response, phase] of cases) {
    const { fake, backend, source } = makeSession()
    await loginAs(fake, backend, 7, 'tok-A1')
    fake.on('PATCH /users/me/profile', response)
    assert.deepEqual(
      await prof.runUpdateNickname(source, '새닉', signal()),
      { phase },
      phase,
    )
    // 자동 재전송 없음: PATCH는 한 번뿐이다.
    assert.equal(
      fake.keys().filter((k) => k === 'PATCH /users/me/profile').length,
      1,
    )
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
  for (const phase of ['failed', 'taken', 'rejected'])
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

test('화면 연결(정적): Provider는 로그인 시작에 startLogin, user 교체는 replaceUser, 저장은 beginNicknameSave로 묶고 화면은 같은 판정을 쓴다', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const provider = strip(readFileSync('src/auth/AuthProvider.tsx', 'utf8'))
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
  const page = strip(readFileSync('src/pages/ProfileSettingsPage.tsx', 'utf8'))
  assert.match(page, /beginSave=\{beginNicknameSave\}/)
  assert.match(page, /key=\{user\.id\}/)
  const view = strip(
    readFileSync(
      'src/components/settings/profile/ProfileSettingsView.tsx',
      'utf8',
    ),
  )
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
  assert.ok(view.indexOf('setSavedNickname(patch.saved)') > aborted)
  assert.doesNotMatch(view, /setSavedNickname\((result|outcome)\.nickname\)/)
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
