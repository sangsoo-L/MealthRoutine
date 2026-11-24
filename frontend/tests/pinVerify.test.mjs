// P05 신체 정보 확인(확인 모드) · P01 열람 연결: 열람 권한(PIN 자격 결합·60초·다른 탭 변경 무효화) · 인증된 수치 조회 · 앱 수준 메모리 권한 ·
// 상태별 화면 · P01 마스킹/열람 표시 · P11·P12 복귀 허용 목록 · 운영 연결 전을 확인한다. 실제 서버·실제 PIN은 쓰지 않는다(테스트용 번호, 메모리 저장소).
// 기존 PIN 저장소 규칙(5회 잠금·변경·계정 정리)은 pinSettings.test.mjs가 다룬다. 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 모드(F4): 이 파일은 개발용 저장소·화면 본문(props)을 직접 불러와 모드와 무관하다. 그래도 개인 .env.development.local의
// VITE_DEV_AUTH 값이 결과를 바꾸지 않도록 빈 envDir과 VITE_DEV_AUTH 미설정(= 실제 모드)으로 서버를 만든다.
const envDir = mkdtempSync(join(tmpdir(), 'pin-verify-env-'))
let server, policy, messages, types, local, bodyMod, display, store, notice
let scope, VerifyBody, Summary, PinBody
const T0 = Date.parse('2026-11-21T00:00:00.000Z')
const PIN = '135790'
const OTHER = '246801'
const BODY_KEY = (owner) => `mealthroutine.dev.mock.body.${owner}`

before(async () => {
  delete process.env.VITE_DEV_AUTH
  server = await createServer({
    envDir,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  policy = await load('/src/pin-settings/pinSettingsPolicy.ts')
  messages = await load('/src/pin-settings/pinSettingsMessages.ts')
  types = await load('/src/exercise-goal/exerciseGoalTypes.ts')
  local = await load('/src/exercise-goal/local/localExerciseGoalRepository.ts')
  bodyMod = await load('/src/body-measurements/mock/mockBodyRepository.ts')
  display = await load('/src/body-measurements/bodyDisplay.ts')
  store = await load('/src/body-access/bodyAccessStore.ts')
  notice = await load('/src/body-access/bodyAccessNotice.ts')
  scope = await load('/src/auth/accountScope.ts')
  VerifyBody = (await load('/src/components/pin-settings/PinVerifyView.tsx'))
    .PinVerifyBody
  PinBody = (await load('/src/components/pin-settings/PinSettingsView.tsx'))
    .PinSettingsBody
  Summary = (await load('/src/components/mypage/BodyInfoSummary.tsx')).default
})
after(async () => {
  await server?.close()
  rmSync(envDir, { recursive: true, force: true })
})

let data, clock
beforeEach(() => {
  data = new Map()
  clock = T0
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => data.set(key, value),
      removeItem: (key) => data.delete(key),
    },
  }
  store.revokeBodyAccess()
})

const storage = () => globalThis.window.localStorage
const goal = (owner) =>
  local.createLocalExerciseGoalRepository(owner, {
    storage: storage(),
    crypto: webcrypto,
    now: () => clock,
    loadContext: async () => null,
  })
const body = (owner, repo) =>
  bodyMod.createMockBodyRepository({
    userId: owner,
    latencyMs: 0,
    verifyAccess: (access) => repo.verifyAccess(access),
  })
const seedBody = (owner, heightCm, weightKg) =>
  data.set(
    BODY_KEY(owner),
    JSON.stringify({ v: 1, heightCm, weightKg, updatedAt: 'x' }),
  )
const expired = (error) =>
  error instanceof types.ExerciseGoalError && error.code === 'expired'
const code = (name) => (error) =>
  error instanceof types.ExerciseGoalError && error.code === name
/** 로그인한 회원 하나에 PIN을 등록하고 키·몸무게를 넣어 둔다. */
async function member(owner = 'p05-owner', pin = PIN) {
  const repo = goal(owner)
  await repo.registerPin(pin, pin)
  seedBody(owner, 170.5, 65)
  return { owner, repo, bodyRepo: body(owner, repo) }
}
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))

// ── 입력 규칙·복귀 허용 목록·문구 ─────────────────────────────────────────
test('P05 입력 검증: 빈 값·숫자 아님·자릿수는 막고 6자리 숫자는 통과한다', () => {
  assert.match(policy.validatePinVerifyInput(''), /입력해 주세요/)
  assert.match(policy.validatePinVerifyInput('12ab56'), /숫자만/)
  assert.match(policy.validatePinVerifyInput('12345'), /6자리/)
  assert.equal(policy.validatePinVerifyInput('123456'), null)
})

test('P11·P12 복귀는 허용 목록의 경로만 쓰고 외부 주소·우회 경로·형식 오류는 버린다', () => {
  assert.equal(policy.BODY_UNLOCK_PATH, '/mypage/body/unlock')
  assert.equal(
    policy.safePinReturn('/mypage/body/unlock'),
    '/mypage/body/unlock',
  )
  assert.equal(policy.safePinReturn('/mypage'), '/mypage')
  assert.equal(policy.safePinReturn('/settings'), '/settings')
  for (const bad of [
    'https://evil.example/mypage',
    '//evil.example',
    '/\\evil',
    '/home',
    '/mypage?x=1',
    '/mypage#a',
    '/mypage/body/unlock/',
    'mypage',
    '',
    null,
    undefined,
    42,
    { from: '/mypage' },
  ])
    assert.equal(policy.safePinReturn(bad), null, String(bad))
  assert.deepEqual(
    policy.pinReturnForwardState({
      to: '/mypage/body/unlock',
      state: { from: '/mypage' },
    }),
    { from: '/mypage/body/unlock', fromState: { from: '/mypage' } },
  )
  assert.equal(policy.pinReturnForwardState(null), undefined)
})

test('만료 문구가 있고, 오류 문구는 남은 횟수만 알리며 입력한 번호를 담지 않는다', () => {
  assert.match(
    messages.pinSettingsMessage(new types.ExerciseGoalError('expired')),
    /열람 시간이 끝났어요/,
  )
  const wrong = messages.pinSettingsMessage(
    new types.ExerciseGoalError('pinWrong', undefined, 3),
  )
  assert.match(wrong, /\(2\/5\)/)
  assert.doesNotMatch(wrong, new RegExp(PIN))
})

test('P05 라우터 상태 표지는 잠금 안내 하나뿐이고 모양이 다르면 거절한다', () => {
  assert.equal(notice.isPinLockedState(notice.PIN_LOCKED_STATE), true)
  for (const bad of [
    null,
    undefined,
    {},
    { pinNotice: 'x' },
    'locked',
    { pinNotice: { token: 'a' } },
  ])
    assert.equal(notice.isPinLockedState(bad), false)
  // 표지에는 PIN·토큰·수치가 들어갈 자리가 없다.
  assert.deepEqual(Object.keys(notice.PIN_LOCKED_STATE), ['pinNotice'])
})

// ── 인증된 수치 조회(개발용 저장소) ───────────────────────────────────────
test('PIN 확인 전에는 수치를 읽을 수 없고, 확인하면 이 계정의 값만 읽는다', async () => {
  const { bodyRepo, repo } = await member()
  await assert.rejects(
    bodyRepo.getMeasurements({ token: 'none', expiresAt: clock + 60_000 }),
    expired,
  )
  const access = await repo.unlock(PIN)
  assert.equal(access.expiresAt, clock + 60_000)
  assert.deepEqual(await bodyRepo.getMeasurements(access), {
    heightCm: 170.5,
    weightKg: 65,
  })
})

test('등록되지 않은 항목은 null이고 임의의 값을 만들지 않는다', async () => {
  const { owner, repo, bodyRepo } = await member()
  seedBody(owner, null, 65)
  const access = await repo.unlock(PIN)
  assert.deepEqual(await bodyRepo.getMeasurements(access), {
    heightCm: null,
    weightKg: 65,
  })
  data.delete(BODY_KEY(owner))
  assert.deepEqual(await bodyRepo.getMeasurements(access), {
    heightCm: null,
    weightKg: null,
  })
})

test('다른 계정의 권한으로는 읽을 수 없고 다른 계정의 값도 돌려주지 않는다', async () => {
  const a = await member('owner-a')
  const b = await member('owner-b', OTHER)
  seedBody('owner-b', 188, 99)
  const accessA = await a.repo.unlock(PIN)
  await assert.rejects(b.bodyRepo.getMeasurements(accessA), expired)
  assert.deepEqual(await a.bodyRepo.getMeasurements(accessA), {
    heightCm: 170.5,
    weightKg: 65,
  })
})

test('수치 조회는 권한 확인 수단이 없으면 거절한다(운영·미연결과 같은 방향)', async () => {
  const { repo } = await member()
  const access = await repo.unlock(PIN)
  const bare = bodyMod.createMockBodyRepository({
    userId: 'p05-owner',
    latencyMs: 0,
  })
  await assert.rejects(bare.getMeasurements(access), code('unavailable'))
})

test('60초가 지나면 타이머와 상관없이 저장소가 조회를 거절한다', async () => {
  const { bodyRepo, repo } = await member()
  const access = await repo.unlock(PIN)
  clock += 59_999
  assert.ok(await bodyRepo.getMeasurements(access))
  clock += 1
  await assert.rejects(bodyRepo.getMeasurements(access), expired)
  // 한 번 거절된 권한은 시계를 되돌려도 다시 살아나지 않는다.
  clock = T0
  await assert.rejects(bodyRepo.getMeasurements(access), expired)
})

test('숨기기(lock) 뒤에는 같은 권한으로 읽을 수 없다', async () => {
  const { bodyRepo, repo } = await member()
  const access = await repo.unlock(PIN)
  repo.lock(access)
  await assert.rejects(bodyRepo.getMeasurements(access), expired)
})

test('같은 탭에서 PIN을 바꾸면 이전 권한으로 읽을 수 없다', async () => {
  const { bodyRepo, repo } = await member()
  const access = await repo.unlock(PIN)
  await repo.changePin(PIN, OTHER, OTHER)
  await assert.rejects(bodyRepo.getMeasurements(access), expired)
  // 새 PIN으로 다시 확인하면 읽을 수 있다.
  const again = await repo.unlock(OTHER)
  assert.ok(await bodyRepo.getMeasurements(again))
})

test('다른 탭에서 PIN을 바꾸면 이 탭의 열람 권한이 무효가 된다(권한 Map을 건드리지 않는 변경)', async () => {
  const { owner, bodyRepo, repo } = await member()
  // 탭 A: 열람 권한 획득.
  const access = await repo.unlock(PIN)
  assert.ok(await bodyRepo.getMeasurements(access))
  // 탭 B: 같은 계정의 저장된 PIN 자격이 다른 값으로 바뀐다. 탭 B의 권한 Map은 탭 A에 닿지 않으므로
  // 여기서는 저장소(localStorage)의 자격만 바꾼다(실제 다른 탭의 changePin이 남기는 결과와 같다).
  const otherData = new Map()
  const tabB = local.createLocalExerciseGoalRepository(owner, {
    storage: {
      getItem: (key) => otherData.get(key) ?? null,
      setItem: (key, value) => otherData.set(key, value),
    },
    crypto: webcrypto,
    now: () => clock,
  })
  await tabB.registerPin(OTHER, OTHER)
  const key = local.PIN_KEY_PREFIX + owner
  data.set(key, otherData.get(key))
  // 탭 A: 기존 권한으로 수치 조회 → 거부된다.
  await assert.rejects(bodyRepo.getMeasurements(access), expired)
  assert.throws(() => repo.verifyAccess(access), expired)
})

test('PIN 자격 식별 값이 화면 쪽 값(권한 토큰·오류)에 노출되지 않는다', async () => {
  const { owner, repo } = await member()
  const access = await repo.unlock(PIN)
  assert.deepEqual(Object.keys(access).sort(), ['expiresAt', 'token'])
  const stored = JSON.parse(data.get(local.PIN_KEY_PREFIX + owner))
  const dump = JSON.stringify(access)
  assert.ok(!dump.includes(stored.hash) && !dump.includes(stored.salt))
  const error = await repo.unlock('000000').catch((e) => e)
  assert.ok(!JSON.stringify(error).includes(stored.hash))
  assert.ok(!String(error.message).includes(stored.hash))
})

test('불일치는 남은 횟수가 줄고 5회째에 잠기며 기존 열람 권한을 지우지는 않는다(자격이 그대로이므로)', async () => {
  const { repo } = await member()
  const access = await repo.unlock(PIN)
  for (const remaining of [4, 3, 2, 1]) {
    const error = await repo.unlock('000000').catch((e) => e)
    assert.equal(error.code, 'pinWrong')
    assert.equal(error.remaining, remaining)
  }
  const lockedError = await repo.unlock('000000').catch((e) => e)
  assert.equal(lockedError.code, 'locked')
  assert.equal(lockedError.retryAt, clock + 5 * 60_000)
  // 잠긴 동안에는 올바른 PIN도 막힌다. 5분 뒤에는 다시 확인할 수 있다.
  await assert.rejects(repo.unlock(PIN), code('locked'))
  clock += 5 * 60_000
  assert.ok(await repo.unlock(PIN))
  assert.equal((await repo.getPinStatus()).retryAt, null)
  assert.ok(access)
})

// ── 앱 수준 메모리 권한 ───────────────────────────────────────────────────
test('열람 권한 메모리: 넣고, 읽고, 폐기하며 알림을 보낸다', async () => {
  const { owner, repo } = await member()
  const access = await repo.unlock(PIN)
  let calls = 0
  const off = store.subscribeBodyAccess(() => (calls += 1))
  assert.equal(store.getBodyAccess(), null)
  store.grantBodyAccess(owner, access)
  assert.deepEqual(store.getBodyAccess(), { ownerId: owner, access })
  store.revokeBodyAccess()
  assert.equal(store.getBodyAccess(), null)
  store.revokeBodyAccess() // 없으면 아무 일도 하지 않는다
  assert.equal(calls, 2)
  off()
  store.grantBodyAccess(owner, access)
  assert.equal(calls, 2)
})

test('새 권한이 들어오면 이전 권한은 저장소에서도 폐기되고, 메모리 권한만으로 수치를 읽을 수는 없다', async () => {
  const { owner, repo, bodyRepo } = await member()
  const first = await repo.unlock(PIN)
  store.grantBodyAccess(owner, first)
  const second = await repo.unlock(PIN)
  store.grantBodyAccess(owner, second)
  await assert.rejects(bodyRepo.getMeasurements(first), expired)
  assert.ok(await bodyRepo.getMeasurements(second))
  // 저장소가 폐기한 권한은 메모리에 남아 있어도 읽을 수 없다.
  repo.lock(second)
  assert.equal(store.getBodyAccess().access.token, second.token)
  await assert.rejects(bodyRepo.getMeasurements(second), expired)
})

test('로그인·로그아웃(계정 정리)이 열람 권한을 폐기한다', async () => {
  const { owner, repo, bodyRepo } = await member()
  const access = await repo.unlock(PIN)
  store.grantBodyAccess(owner, access)
  scope.clearAccountScopedData()
  assert.equal(store.getBodyAccess(), null)
  await assert.rejects(bodyRepo.getMeasurements(access), expired)
})

test('열람 권한 메모리·화면 훅은 저장소·URL·로그에 권한을 남기는 API를 쓰지 않는다', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  for (const file of [
    'src/body-access/bodyAccessStore.ts',
    'src/body-access/useBodyReveal.ts',
    'src/pin-settings/usePinVerify.ts',
    'src/components/pin-settings/PinVerifyView.tsx',
    'src/components/pin-settings/PinVerifyForm.tsx',
  ]) {
    const code = strip(readFileSync(file, 'utf8'))
    assert.doesNotMatch(
      code,
      /localStorage|sessionStorage|indexedDB|console\.|history\.(push|replace)State|document\.cookie/,
      file,
    )
  }
  // 라우터 state로 보내는 값은 잠금 표지뿐이다(권한 토큰·PIN·수치는 state에 넣지 않는다).
  const view = strip(
    readFileSync('src/components/pin-settings/PinVerifyView.tsx', 'utf8'),
  )
  assert.match(view, /state: PIN_LOCKED_STATE/)
  assert.doesNotMatch(view, /state:\s*\{[^}]*(access|token|pin|values)/i)
})

// ── 화면: P05 확인 모드 ───────────────────────────────────────────────────
const noop = () => {}
const verify = (props) =>
  render(
    createElement(VerifyBody, {
      status: { kind: 'ready', configured: true, retryAt: null },
      locked: false,
      submit: async () => null,
      onVerified: noop,
      onLocked: noop,
      reload: noop,
      cancelTo: '/mypage',
      ...props,
    }),
  )

test('P05 기본: 제목·설명·마스킹 6자리 입력·확인·취소·1분 안내', () => {
  const html = verify({})
  assert.match(html, /<h1[^>]*>신체 정보 확인<\/h1>/)
  assert.match(html, /1분 동안 신체 정보를 확인할 수 있어요/)
  assert.match(html, /type="password"/)
  assert.match(html, /inputMode="numeric"/)
  assert.match(html, /maxLength="6"/)
  assert.match(html, /autoComplete="off"/)
  assert.match(html, /<label[^>]*>2차 비밀번호<\/label>/)
  assert.match(html, /aria-busy="false"/)
  assert.match(html, />확인<\/button>/)
  assert.match(html, /href="\/mypage"[^>]*>취소/)
  assert.match(
    html,
    /신체 정보는 1분 동안만 표시되며, 화면을 벗어나면 다시 가려져요/,
  )
  assert.doesNotMatch(html, /disabled=""/)
  // 숫자 6자리 입력 외에 값·수치·토큰이 없다.
  assert.doesNotMatch(html, /value="[^"]+"/)
})

test('P05 취소는 허용된 복귀 지점으로 이동한다', () => {
  const html = verify({ cancelTo: '/settings' })
  assert.match(html, /href="\/settings"[^>]*>취소/)
})

test('P05 확인 중·조회 실패는 폼을 열지 않고 실패를 미등록으로 보지 않는다', () => {
  const checking = verify({ status: { kind: 'checking' } })
  assert.match(checking, /등록 여부를 확인하고 있어요/)
  assert.doesNotMatch(checking, /<form|먼저 2차 비밀번호를 등록/)
  const failed = verify({ status: { kind: 'error' } })
  assert.match(failed, /role="alert"/)
  assert.match(failed, /다시 확인하기/)
  assert.doesNotMatch(failed, /<form|먼저 2차 비밀번호를 등록/)
})

test('P05 미등록: P11 등록 링크가 있고 입력·확인은 비활성이다', () => {
  const html = verify({
    status: { kind: 'ready', configured: false, retryAt: null },
  })
  assert.match(html, /먼저 2차 비밀번호를 등록해 주세요/)
  assert.match(html, /href="\/settings\/pin\/register"/)
  assert.equal((html.match(/<input[^>]*disabled=""/g) ?? []).length, 1)
  assert.match(
    html,
    /<button[^>]*type="submit"[^>]*disabled=""|<button[^>]*disabled=""[^>]*type="submit"/,
  )
})

test('P05 연결 전(운영 빌드): 지정 안내만 보이고 입력·확인은 비활성이며 성공 표현이 없다', () => {
  const html = verify({ status: { kind: 'unavailable' } })
  assert.match(html, /신체 정보 확인 기능은 서비스 연결을 준비하고 있어요/)
  assert.match(html, /<input[^>]*disabled=""/)
  assert.match(html, /<button[^>]*disabled=""/)
  assert.doesNotMatch(html, /확인했어요|성공|열람 중/)
})

test('P05 잠금: 잠금 안내가 보이고 확인은 비활성이다', () => {
  const html = verify({ locked: true })
  assert.match(html, /role="alert"/)
  assert.match(html, /5회 일치하지 않아 잠시 제한됐어요/)
  assert.match(html, /aria-invalid="true"/)
  assert.match(
    html,
    /<button[^>]*type="submit"[^>]*disabled=""|<button[^>]*disabled=""[^>]*type="submit"/,
  )
})

// ── 화면: P11·P12 복귀 ────────────────────────────────────────────────────
const pinBody = (props) =>
  render(
    createElement(PinBody, {
      mode: 'register',
      status: { kind: 'ready', configured: false, retryAt: null },
      done: false,
      locked: false,
      submit: async () => null,
      reload: noop,
      ...props,
    }),
  )

test('P11·P12 기본 복귀는 그대로다(진입 화면이 없으면 상세 설정·마이페이지)', () => {
  const done = pinBody({ done: true })
  assert.match(done, /href="\/settings"[^>]*>상세 설정으로/)
  assert.match(done, /href="\/mypage"[^>]*>마이페이지로/)
  const form = pinBody({})
  assert.match(form, /href="\/settings"[^>]*>취소/)
})

test('P05에서 온 P11·P12는 취소·완료가 P05로 돌아가고 마이페이지 링크는 남는다', () => {
  const returnTo = { to: '/mypage/body/unlock', state: { from: '/mypage' } }
  const done = pinBody({ done: true, returnTo })
  assert.match(
    done,
    /href="\/mypage\/body\/unlock"[^>]*>신체 정보 확인으로 돌아가기/,
  )
  assert.match(done, /href="\/mypage"[^>]*>마이페이지로/)
  assert.doesNotMatch(done, /상세 설정으로/)
  assert.match(done, /키·몸무게·BMI는 계속 가려져 있어요/)
  const form = pinBody({ returnTo })
  assert.match(form, /href="\/mypage\/body\/unlock"[^>]*>취소/)
  const change = pinBody({
    mode: 'change',
    status: { kind: 'ready', configured: true, retryAt: null },
    returnTo,
  })
  assert.match(change, /href="\/mypage\/body\/unlock"[^>]*>취소/)
})

// ── 화면: P01 신체 정보 ───────────────────────────────────────────────────
const summary = (props) =>
  render(
    createElement(Summary, {
      body: { status: 'ready', value: { height: true, weight: true } },
      save: async () => {},
      ...props,
    }),
  )
const reveal = (state, notice = null) => ({ state, notice, hide: noop })

test('BMI는 kg/(m²)를 소수 첫째 자리로 계산하고 값이 없으면 계산하지 않는다', () => {
  assert.equal(display.calculateBmi(170.5, 65), 22.4)
  assert.equal(display.calculateBmi(180, 80), 24.7)
  assert.equal(display.calculateBmi(null, 65), null)
  assert.equal(display.calculateBmi(170, null), null)
  assert.equal(display.calculateBmi(0, 65), null)
  assert.equal(display.calculateBmi(170, 700), null)
})

test('P01 기본은 마스킹이고 수치가 없으며 P05로 가는 링크가 보인다(이동 state는 이전 화면 경로뿐)', () => {
  const html = summary({})
  assert.equal((html.match(/\*\*\*/g) ?? []).length, 3)
  assert.doesNotMatch(html, /\d+(\.\d)?\s?(cm|kg)/)
  assert.match(html, /보호 중/)
  assert.match(
    html,
    /href="\/mypage\/body\/unlock"[^>]*>2차 비밀번호로 신체 정보 보기/,
  )
  assert.doesNotMatch(html, /다시 숨기기|열람 중/)
})

test('P01 열람 중: 키·몸무게·BMI가 보이고 숨기기 버튼과 1분 안내가 있다', () => {
  const html = summary({
    reveal: reveal({
      status: 'revealed',
      values: { heightCm: 170.5, weightKg: 65 },
    }),
  })
  assert.match(html, /170\.5cm/)
  assert.match(html, /65kg/)
  assert.match(html, />22\.4</)
  assert.match(html, /열람 중/)
  assert.match(html, /신체 정보 다시 숨기기/)
  assert.match(html, /1분 뒤 또는 화면을 벗어나면 다시 가려져요/)
  assert.doesNotMatch(html, /\*\*\*|href="\/mypage\/body\/unlock"/)
})

test('P01 열람 중 등록되지 않은 항목은 미등록, BMI는 계산 불가이고 값을 지어내지 않는다', () => {
  const html = summary({
    body: { status: 'ready', value: { height: false, weight: true } },
    reveal: reveal({
      status: 'revealed',
      values: { heightCm: null, weightKg: 65 },
    }),
  })
  assert.match(html, /미등록/)
  assert.match(html, /65kg/)
  assert.match(html, /계산 불가/)
  assert.doesNotMatch(html, /cm</)
})

test('P01 권한이 끝나 마스킹으로 돌아가면 이전에 보인 수치가 마크업 어디에도 남지 않는다', () => {
  const values = { heightCm: 171.3, weightKg: 64.2 }
  const shown = summary({ reveal: reveal({ status: 'revealed', values }) })
  assert.match(shown, /171\.3cm/)
  const masked = summary({ reveal: reveal({ status: 'masked' }, 'expired') })
  assert.doesNotMatch(masked, /171\.3|64\.2|cm<|kg</)
  assert.match(masked, /\*\*\*/)
  assert.match(masked, /열람 시간이 끝나 신체 정보를 다시 가렸어요/)
  assert.match(masked, /role="status"/)
})

test('P01 불러오는 중에도 수치는 없고 숨기기를 할 수 있다', () => {
  const html = summary({ reveal: reveal({ status: 'loading' }) })
  assert.match(html, /aria-busy="true"/)
  assert.match(html, /불러오는 중/)
  assert.doesNotMatch(html, /\d+(\.\d)?\s?(cm|kg)/)
  assert.match(html, /신체 정보 다시 숨기기/)
})

test('P01 다시 가려진 이유 안내: 화면 이탈·불러오기 실패·5회 불일치 잠금', () => {
  assert.match(
    summary({ reveal: reveal({ status: 'masked' }, 'hidden') }),
    /화면을 벗어나 신체 정보를 다시 가렸어요/,
  )
  assert.match(
    summary({ reveal: reveal({ status: 'masked' }, 'error') }),
    /불러오지 못해 가려 두었어요/,
  )
  const locked = summary({ lockedNotice: true })
  assert.match(locked, /5회 일치하지 않아 잠시 제한됐어요/)
  assert.match(locked, /\*\*\*/)
})

test('P01 연결 전(운영 빌드): 링크 없이 연결 전으로만 보이고 수치가 없다', () => {
  const html = summary({ body: { status: 'unavailable' } })
  assert.match(html, /2차 비밀번호로 신체 정보 보기/)
  assert.match(html, /연결 전/)
  assert.doesNotMatch(html, /href="\/mypage\/body\/unlock"/)
  assert.doesNotMatch(html, /다시 숨기기|열람 중/)
  assert.equal((html.match(/\*\*\*/g) ?? []).length, 3)
})

test('P01 조회 중·실패에서도 P05로 갈 수 있고 누락 안내는 하지 않는다', () => {
  for (const status of ['loading', 'error']) {
    const html = summary({ body: { status } })
    assert.match(html, /href="\/mypage\/body\/unlock"/)
    assert.doesNotMatch(html, /키·몸무게 입력하기/)
  }
})

// ── 라우트·운영 분리 ──────────────────────────────────────────────────────
test('P05 라우트: 승인된 경로·회원 전용·상위 P01·하단 탭 유지, 가입 설정 경로는 없다', () => {
  const router = readFileSync('src/app/router.tsx', 'utf8')
  const block = router.slice(router.indexOf("path: 'mypage/body/unlock'"))
  const handle = block.slice(0, block.indexOf('} satisfies RouteHandle'))
  assert.match(handle, /element: <PinVerifyPage \/>/)
  assert.match(handle, /screenId: 'P05'/)
  assert.match(handle, /tab: 'my'/)
  assert.match(handle, /focus: false/)
  assert.match(handle, /ownH1: true/)
  assert.match(handle, /parent: '\/mypage'/)
  // AuthGate 아래(회원 전용)에 있어야 한다: 이 경로 앞의 가장 가까운 게이트가 AuthGate다.
  const before = router.slice(0, router.indexOf("path: 'mypage/body/unlock'"))
  assert.ok(
    before.lastIndexOf('element: <AuthGate />') >
      before.lastIndexOf('element: <AuthOrExperienceGate />'),
  )
  // 가입 설정 모드(`/signup/pin`)는 사용자 승인으로 별도 라우트를 만들었다(signupPin 테스트). 이 확인 화면과 섞이지 않고 회원 전용 가드 밖(가입 단계)에 있어야 한다.
  const signupPin = router.indexOf("path: 'signup/pin'")
  assert.ok(signupPin >= 0)
  assert.match(
    router.slice(signupPin, signupPin + 400),
    /element: <SignupPinPage \/>/,
  )
  assert.ok(signupPin < router.indexOf('element: <AuthGate />'))
})

test('P05의 PIN 입력·열람 화면은 개발용 저장소 파일을 직접 불러오지 않는다(DEV 분기의 source만)', () => {
  const direct = /exercise-goal\/local\/|body-measurements\/mock\//
  const files = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (/\.(ts|tsx)$/.test(name)) files.push(path)
    }
  }
  for (const dir of [
    'src/body-access',
    'src/pin-settings',
    'src/components/pin-settings',
  ])
    walk(dir)
  files.push(
    'src/pages/PinVerifyPage.tsx',
    'src/components/mypage/BodyInfoSummary.tsx',
  )
  for (const file of files)
    assert.doesNotMatch(readFileSync(file, 'utf8'), direct, file)
})
