// F2 가입 연결: 서버 규칙과 같은 프론트 검증(F2-D2), 실제/모의 모드 구분(F2-D1·D8), 가입 호출(5필드·auth none·실패 분류·재전송 없음),
// 제출 규칙(중복 제출·loading 유예·화면 이탈 뒤 늦은 응답, 보류 Promise로 순서 강제), 가입 완료 안내(F2-D3), 운영 빌드에 개발용 코드 없음.
// 실제 서버·실제 계정은 쓰지 않는다(가짜 fetch). 비밀번호는 'Passw0rd!' 같은 가짜 문자열이다.
// 개인 .env.development.local의 VITE_DEV_AUTH 값이 결과를 바꾸지 않도록 빈 envDir을 쓴다.
// 대문자 드라이브(C:\)의 PowerShell에서도 같은 명령으로 실행한다.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, RouterProvider, createMemoryRouter } from 'react-router'
import { build, createServer } from 'vite'
import {
  createFakeServer,
  createStorage,
  deferred,
  fail,
  flush,
  networkError,
  noContent,
  ok,
} from './apiTestKit.mjs'

const envDir = mkdtempSync(join(tmpdir(), 'signup-env-'))
const storage = createStorage()
let realServer, mockServer
let validation, steps, api, session, ctx, mockCtx, realPage, mockPage
let realExperience, mockExperience, realLogin

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
  validation = await load('/src/pages/signupValidation.ts')
  steps = await load('/src/pages/signupSteps.ts')
  api = await load('/src/auth/signupApi.ts')
  session = await load('/src/api/session.ts')
  ctx = await load('/src/auth/authContext.ts')
  realPage = (await load('/src/pages/SignupPage.tsx')).default
  realExperience = await load('/src/signup-experience/signupExperience.ts')
  realLogin = (await load('/src/pages/LoginPage.tsx')).default
  mockPage = (await mockServer.ssrLoadModule('/src/pages/SignupPage.tsx'))
    .default
  // 서버마다 모듈 인스턴스가 따로라서 Context도 그 서버의 것을 써야 한다.
  mockCtx = await mockServer.ssrLoadModule('/src/auth/authContext.ts')
  mockExperience = await mockServer.ssrLoadModule(
    '/src/signup-experience/signupExperience.ts',
  )
})
after(async () => {
  await realServer?.close()
  await mockServer?.close()
  delete globalThis.sessionStorage
  rmSync(envDir, { recursive: true, force: true })
})
beforeEach(() => storage.map.clear())

// ── 서버 규칙과 같은지: Java SignupRequest의 정규식 문자열을 읽어 같은 표본에서 결과를 비교한다 ──

const javaSource = readFileSync(
  new URL(
    '../../backend/src/main/java/com/healthlab/mealthroutine/backend/user/dto/SignupRequest.java',
    import.meta.url,
  ),
  'utf8',
)
function javaRule(name) {
  const match = javaSource.match(
    new RegExp(`${name} = "((?:[^"\\\\]|\\\\.)*)"`),
  )
  assert.ok(match, `${name}을 SignupRequest.java에서 찾지 못함`)
  // Java 문자열 이스케이프(\\)를 정규식 문자열로 되돌린다.
  return new RegExp(match[1].replace(/\\\\/g, '\\'))
}

const NAMES = [
  '홍길동',
  '이씨',
  '가나다라마바사아자차',
  '가나다라마바사아자차카',
  '홍',
  '홍길동A',
  'Hong',
  'Hong Gil Dong',
  'Hong  Gil',
  'Hong1',
  'H',
  'A'.repeat(30),
  'A'.repeat(31),
  '홍 길동',
  'Jo',
  'O Neil',
  "O'Neil",
  'ㄱㄴ',
]
const NICKNAMES = [
  '길동',
  '길동1234',
  '가나다라마바사아',
  '가나다라마바사아자',
  'ab',
  'a',
  'abcdefghijklmnop',
  'abcdefghijklmnopq',
  'ab c',
  'ab!',
  'Runner99',
  '런너A1',
  '가a',
  '12',
  '_ab',
]
const PASSWORDS = [
  'abcdefg1!',
  'Abcdefg1!',
  'Abcdefg1가',
  'Abc def1!',
  'abcdefgh1',
  'abcdefg!!',
  '12345678!',
  'a1!' + 'x'.repeat(61),
  'a1!' + 'x'.repeat(62),
  'a1!xxxx',
  'Pass_w0rd',
  'p@ss w0rd',
  'ÄBCdefg1!',
  'a1\\bcdefg',
  'a1`bcdefg',
  'a1~bcdefg',
  '',
]

test('이름 규칙: 서버 USERNAME_RULE(NAME-1)과 같은 결과', () => {
  const server = javaRule('USERNAME_RULE')
  for (const name of NAMES)
    assert.equal(validation.isValidName(name), server.test(name), name)
})

test('닉네임 규칙: 서버 NICKNAME_RULE(NAME-2)과 같은 결과', () => {
  const server = javaRule('NICKNAME_RULE')
  for (const nickname of NICKNAMES)
    assert.equal(
      validation.isValidNickname(nickname),
      server.test(nickname),
      nickname,
    )
})

test('비밀번호 규칙: 서버 PASSWORD_RULE(PW-1·PW-2)과 같은 결과(한글·공백·65자 거절, 대소문자 하나만 있어도 통과)', () => {
  const server = javaRule('PASSWORD_RULE')
  for (const password of PASSWORDS)
    assert.equal(
      validation.isPasswordReady(password, password),
      server.test(password),
      JSON.stringify(password),
    )
  // 대표 경계를 따로 못 박는다(표본 비교가 둘 다 틀리는 경우 대비).
  assert.equal(validation.isPasswordReady('abcdefg1!', 'abcdefg1!'), true)
  assert.equal(validation.isPasswordReady('Abcdefg1가', 'Abcdefg1가'), false)
  assert.equal(validation.isPasswordReady('Abc def1!', 'Abc def1!'), false)
  const max = 'a1!' + 'x'.repeat(61)
  assert.equal(validation.isPasswordReady(max, max), true)
  assert.equal(validation.isPasswordReady(max + 'x', max + 'x'), false)
})

test('이름·닉네임은 앞뒤 공백을 빼고 판단한다(서버에는 뺀 값을 보낸다)', () => {
  assert.equal(validation.isValidName('  홍길동 '), true)
  assert.equal(validation.isValidNickname(' 길동 '), true)
})

test('이메일: 형식 + 255자 이하(앞뒤 공백 제외)', () => {
  assert.equal(validation.checkEmailInput(' a@b.co '), null)
  assert.ok(validation.checkEmailInput('a@b'))
  const long = `${'a'.repeat(250)}@b.co`
  assert.equal(long.length, 255)
  assert.equal(validation.checkEmailInput(long), null)
  assert.ok(validation.checkEmailInput(`a${long}`))
})

// ── 모드별 단계·검증(F2-D1) ──

const filled = {
  name: '홍길동',
  phone: '',
  nickname: '길동',
  address: '',
  addressDetail: '',
  email: 'new@example.test',
  password: 'Passw0rd!',
  passwordConfirm: 'Passw0rd!',
  consent: true,
}
const NONE = { phone: false, email: false }

test('server 모드: 휴대폰·주소·인증 없이 제출 검증을 통과한다', () => {
  assert.equal(validation.validateSubmit(filled, NONE, 'server'), null)
  for (const step of [1, 2, 3])
    assert.equal(steps.validateStep(step, filled, NONE, 'server'), null)
})

test('mock 모드: 같은 입력이어도 기존처럼 휴대폰·인증이 막는다(가짜 인증을 server로 가져오지 않음)', () => {
  const error = validation.validateSubmit(filled, NONE, 'mock')
  assert.equal(error.region, 'identity')
})

test('두 모드 모두 새 규칙(D2)을 쓴다: 한글 섞인 비밀번호·9자 한글 닉네임은 거절', () => {
  for (const mode of ['server', 'mock']) {
    const verified = { phone: true, email: true }
    const base = {
      ...filled,
      phone: '01012345678',
      address: '대전광역시 서구',
      addressDetail: '1호',
    }
    assert.equal(
      validation.validateSubmit(
        { ...base, nickname: '가나다라마바사아자' },
        verified,
        mode,
      ).field,
      'nickname',
    )
    assert.equal(
      validation.validateSubmit(
        { ...base, password: 'Passw0rd가', passwordConfirm: 'Passw0rd가' },
        verified,
        mode,
      ).field,
      'password',
    )
  }
})

test('server 모드 노출: 휴대폰·주소는 값이 있어도 숨기고, 비밀번호는 이메일 형식만 맞으면 보인다', () => {
  const shown = steps.visibleFields(
    { ...filled, phone: '010', address: 'x', addressDetail: 'y', password: '' },
    NONE,
    'server',
  )
  assert.equal(shown.phone, false)
  assert.equal(shown.address, false)
  assert.equal(shown.addressDetail, false)
  assert.equal(shown.password, true)
  const mockShown = steps.visibleFields(
    { ...filled, password: '' },
    NONE,
    'mock',
  )
  assert.equal(mockShown.password, false)
})

test('server 모드 단계 이름·설명에 본인 확인·휴대폰·주소가 없다', () => {
  const server = steps.signupStepsFor('server')
  assert.equal(server.length, 3)
  assert.equal(server[0].label, '기본 정보')
  assert.doesNotMatch(JSON.stringify(server), /본인|휴대폰|주소/)
  assert.equal(steps.signupStepsFor('mock')[0].label, '본인 확인')
})

// ── 가입 호출(가짜 fetch) ──

function makeSession() {
  const fake = createFakeServer()
  const s = session.createAuthSession({
    fetch: fake.fetch,
    getStorage: () => storage,
    sleep: () => Promise.resolve(),
    refreshRetryDelayMs: 300,
  })
  return { fake, request: s.request.bind(s) }
}
const input = {
  name: ' 홍길동 ',
  nickname: ' 길동 ',
  email: ' New@Example.test ',
  password: ' Passw0rd! ',
  consent: true,
}

test('성공: 서버가 받는 5필드만, 토큰 없이(auth none) 한 번 보내고 로그인은 호출하지 않는다', async () => {
  const { fake, request } = makeSession()
  fake.on('POST /auth/signup', ok({ userId: 7 }, 201))
  assert.equal(await api.requestSignup(input, request), 'success')
  assert.deepEqual(fake.keys(), ['POST /auth/signup'])
  const [call] = fake.calls
  assert.deepEqual(call.body, {
    email: 'New@Example.test',
    password: ' Passw0rd! ',
    username: '홍길동',
    nickname: '길동',
    isAgreedTerm: true,
  })
  assert.equal(call.headers.Authorization, undefined)
  assert.doesNotMatch(
    JSON.stringify(call.body),
    /passwordConfirm|phone|address/,
  )
})

test('실패 분류: 409 이메일 / 409 닉네임 / 400 / 500 / 네트워크 — 모두 한 번만 보내고 다시 보내지 않는다', async () => {
  const cases = [
    [fail(409, 'EMAIL_UNAVAILABLE'), 'emailUnavailable'],
    [fail(409, 'NICKNAME_ALREADY_EXISTS'), 'nicknameTaken'],
    [fail(400, 'INVALID_REQUEST'), 'invalid'],
    [fail(500, 'INTERNAL_ERROR'), 'unavailable'],
    [networkError(), 'unavailable'],
  ]
  for (const [response, expected] of cases) {
    const { fake, request } = makeSession()
    fake.on('POST /auth/signup', response)
    assert.equal(await api.requestSignup(input, request), expected, expected)
    assert.equal(fake.calls.length, 1, expected)
  }
})

test('409라도 코드가 다르면 이메일·닉네임으로 단정하지 않는다', async () => {
  const { fake, request } = makeSession()
  fake.on('POST /auth/signup', fail(409, 'SOMETHING_ELSE'))
  assert.equal(await api.requestSignup(input, request), 'unavailable')
  assert.equal(api.classifySignupError(new Error('x')), 'unavailable')
})

// ── 성공 응답 검증(PR #27 리뷰 P2 ③): 201 + 양의 정수 userId만 성공 ──

const rawJson = (text, status) =>
  new Response(text, {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

test('성공 응답 검증: 201 + 양의 정수 userId일 때만 success, 그 밖의 성공 응답은 unconfirmed(한 번만 보냄)', async () => {
  const cases = [
    ['정상 201', ok({ userId: 7 }, 201), 'success'],
    ['큰 정수 201', ok({ userId: Number.MAX_SAFE_INTEGER }, 201), 'success'],
    ['data 빈 객체 201', ok({}, 201), 'unconfirmed'],
    ['data null 201', ok(null, 201), 'unconfirmed'],
    [
      'data 누락 201',
      rawJson('{"success":true,"message":"m"}', 201),
      'unconfirmed',
    ],
    ['본문 없는 201', new Response(null, { status: 201 }), 'unconfirmed'],
    ['userId 0', ok({ userId: 0 }, 201), 'unconfirmed'],
    ['userId 음수', ok({ userId: -3 }, 201), 'unconfirmed'],
    ['userId 소수', ok({ userId: 1.5 }, 201), 'unconfirmed'],
    ['userId 문자열', ok({ userId: '7' }, 201), 'unconfirmed'],
    ['userId 범위 밖', ok({ userId: 2 ** 53 }, 201), 'unconfirmed'],
    ['userId 배열 data', ok([7], 201), 'unconfirmed'],
    ['본문 없는 204', noContent(), 'unconfirmed'],
    ['정상 본문의 200', ok({ userId: 7 }, 200), 'unconfirmed'],
    ['JSON 아닌 201', rawJson('created', 201), 'unconfirmed'],
    ['기존 400', fail(400, 'INVALID_REQUEST'), 'invalid'],
    ['기존 409 이메일', fail(409, 'EMAIL_UNAVAILABLE'), 'emailUnavailable'],
    ['기존 409 닉네임', fail(409, 'NICKNAME_ALREADY_EXISTS'), 'nicknameTaken'],
  ]
  for (const [name, response, expected] of cases) {
    const { fake, request } = makeSession()
    fake.on('POST /auth/signup', response)
    assert.equal(await api.requestSignup(input, request), expected, name)
    // 자동 재전송·로그인 호출 없음
    assert.deepEqual(fake.keys(), ['POST /auth/signup'], name)
  }
})

test('expectStatus는 지정한 호출에만 적용된다: 옵션 없는 호출은 200·204를 그대로 성공으로 돌려준다', async () => {
  const { fake, request } = makeSession()
  fake.on('GET /plain', ok({ a: 1 }), noContent(), ok({ a: 2 }, 201))
  assert.deepEqual(await request('GET', '/plain', { auth: 'none' }), { a: 1 })
  assert.equal(await request('GET', '/plain', { auth: 'none' }), undefined)
  assert.deepEqual(await request('GET', '/plain', { auth: 'none' }), { a: 2 })
  // 지정하면 다른 2xx는 INVALID_RESPONSE(상태 코드는 그대로), 실패 응답 해석은 기존과 같다.
  fake.on('GET /strict', ok({ a: 1 }, 200), fail(409, 'X_CONFLICT'))
  await assert.rejects(
    request('GET', '/strict', { auth: 'none', expectStatus: 201 }),
    (e) => e.status === 200 && e.errorCode === 'INVALID_RESPONSE',
  )
  await assert.rejects(
    request('GET', '/strict', { auth: 'none', expectStatus: 201 }),
    (e) => e.status === 409 && e.errorCode === 'X_CONFLICT',
  )
})

test('expectStatus에 200~299 정수가 아닌 값은 요청을 보내기 전에 막는다', async () => {
  for (const bad of [404, 199, 300, 201.5, Number.NaN]) {
    const { fake, request } = makeSession()
    await assert.rejects(
      request('GET', '/plain', { auth: 'none', expectStatus: bad }),
      (e) => e.status === 0 && e.errorCode === 'INVALID_REQUEST',
      String(bad),
    )
    assert.equal(fake.calls.length, 0)
  }
})

// ── 늦은 409(PR #27 리뷰 P2 ①): 서버 비교 기준으로 지금 값과 대조 ──

test('conflictStillApplies: 이메일은 trim+소문자, 닉네임은 trim+소문자(DB 대소문자 무시)로 비교한다', () => {
  const sent = { email: ' New@Example.test ', nickname: ' GilDong ' }
  const same = (current, outcome) =>
    api.conflictStillApplies(outcome, sent, { ...sent, ...current })
  // 같은 값(공백·대소문자만 다름) → 그대로 안내
  assert.equal(same({ email: 'new@example.TEST' }, 'emailUnavailable'), true)
  assert.equal(same({ nickname: 'gildong' }, 'nicknameTaken'), true)
  // 값이 바뀜 → 이전 값의 결과라 반영하지 않음
  assert.equal(same({ email: 'other@example.test' }, 'emailUnavailable'), false)
  assert.equal(same({ nickname: 'GilDong2' }, 'nicknameTaken'), false)
  // 다른 필드가 바뀐 것은 상관없다
  assert.equal(same({ nickname: '다른닉' }, 'emailUnavailable'), true)
  assert.equal(same({ email: 'x@example.test' }, 'nicknameTaken'), true)
})

test('화면 연결(정적): 409는 conflictStillApplies가 참일 때만 showError, unconfirmed는 이동 없이 안내', () => {
  const signup = source('src/pages/SignupPage.tsx')
  const conflict = signup.slice(
    signup.indexOf("case 'emailUnavailable':"),
    signup.indexOf("case 'invalid':"),
  )
  assert.match(
    conflict,
    /if \(!conflictStillApplies\(outcome, submitted, latestValuesRef\.current\)\)\s*return/,
  )
  assert.ok(
    conflict.indexOf('conflictStillApplies') < conflict.indexOf('showError'),
  )
  // 제출한 값은 요청 전에 기억하고, 비교 대상은 응답 시점의 최신 입력이다.
  assert.match(
    signup,
    /const submitted = \{ email: values\.email, nickname: values\.nickname \}\s*const outcome = await submitSignupOnce\(/,
  )
  assert.match(signup, /latestValuesRef\.current = values/)
  const unconfirmed = signup.slice(
    signup.indexOf("case 'unconfirmed':"),
    signup.indexOf('default:', signup.indexOf("case 'unconfirmed':")),
  )
  assert.match(
    unconfirmed,
    /setSubmitError\(SIGNUP_MESSAGES\.signupUnconfirmed\)/,
  )
  assert.doesNotMatch(unconfirmed, /navigate|submitToServer|submitSignupOnce/)
  assert.ok(validation.SIGNUP_MESSAGES.signupUnconfirmed.includes('로그인'))
})

// ── 제출 규칙(보류 Promise로 순서 강제) ──

test('중복 제출: 보내는 중 두 번째 제출은 blocked, 요청은 1번', async () => {
  const { fake, request } = makeSession()
  const gate = deferred()
  fake.on('POST /auth/signup', gate)
  const inFlight = { current: false }
  const options = { status: 'unauthenticated', isMounted: () => true, request }
  const first = api.submitSignupOnce(input, inFlight, options)
  await flush()
  assert.equal(await api.submitSignupOnce(input, inFlight, options), 'blocked')
  assert.equal(fake.calls.length, 1)
  gate.resolve(ok({ userId: 1 }, 201))
  assert.equal(await first, 'success')
  assert.equal(inFlight.current, false)
})

test('loading 중·로그인 상태에서는 보내지 않는다(확인이 끝난 뒤 비회원이면 그때 1번)', async () => {
  const { fake, request } = makeSession()
  const inFlight = { current: false }
  let started = 0
  const base = { isMounted: () => true, request, onStart: () => (started += 1) }
  assert.equal(
    await api.submitSignupOnce(input, inFlight, { ...base, status: 'loading' }),
    'blocked',
  )
  assert.equal(
    await api.submitSignupOnce(input, inFlight, {
      ...base,
      status: 'authenticated',
    }),
    'blocked',
  )
  assert.equal(fake.calls.length, 0)
  assert.equal(started, 0)
  fake.on('POST /auth/signup', ok({ userId: 2 }, 201))
  assert.equal(
    await api.submitSignupOnce(input, inFlight, {
      ...base,
      status: 'unauthenticated',
    }),
    'success',
  )
  assert.equal(fake.calls.length, 1)
  assert.equal(started, 1)
})

test('응답 전에 화면을 떠나면 stale: 결과(이동·오류)를 반영하지 않는다', async () => {
  const { fake, request } = makeSession()
  const gate = deferred()
  fake.on('POST /auth/signup', gate)
  let mounted = true
  const pending = api.submitSignupOnce(
    input,
    { current: false },
    {
      status: 'unauthenticated',
      isMounted: () => mounted,
      request,
    },
  )
  await flush()
  mounted = false
  gate.resolve(fail(409, 'EMAIL_UNAVAILABLE'))
  assert.equal(await pending, 'stale')
})

test('onStart는 요청을 보내기 전에 한 번 불린다', async () => {
  const { fake, request } = makeSession()
  const log = []
  fake.on('POST /auth/signup', () => {
    log.push('fetch')
    return ok({ userId: 3 }, 201)
  })
  await api.submitSignupOnce(
    input,
    { current: false },
    {
      status: 'unauthenticated',
      isMounted: () => true,
      onStart: () => log.push('start'),
      request,
    },
  )
  assert.deepEqual(log, ['start', 'fetch'])
})

// ── 가입 완료 안내(F2-D3) ──

test('가입 완료 state는 signedUp 표시 하나뿐이고 returnTo가 없다', () => {
  assert.deepEqual({ ...api.SIGNED_UP_STATE }, { signedUp: true })
  assert.equal(api.isSignedUpState({ signedUp: true }), true)
  for (const state of [
    null,
    undefined,
    {},
    { signedUp: 'true' },
    { signedUp: 1 },
    'signedUp',
  ])
    assert.equal(api.isSignedUpState(state), false)
})

const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const source = (p) =>
  strip(readFileSync(new URL(`../${p}`, import.meta.url), 'utf8'))

test('화면 연결(정적): 가입 성공은 /login + SIGNED_UP_STATE, 로그인 화면은 isSignedUpState로 안내', () => {
  const signup = source('src/pages/SignupPage.tsx')
  assert.match(
    signup,
    /navigate\('\/login', \{ replace: true, state: SIGNED_UP_STATE \}\)/,
  )
  assert.match(signup, /submitSignupOnce\(/)
  // 비밀번호·입력값을 router state에 넣지 않는다.
  assert.doesNotMatch(signup, /state: \{[^}]*password/)
  const login = source('src/pages/LoginPage.tsx')
  assert.match(login, /isSignedUpState\(location\.state\)/)
  assert.match(login, /SIGNED_UP_NOTICE/)
})

// ── 모드별 화면·체험 경계(F2-D1·D8) ──

function auth(status) {
  return {
    status,
    user: null,
    connectionNotice: false,
    dismissConnectionNotice() {},
    login: async () => ({ ok: false, reason: 'invalid' }),
    logout() {},
  }
}
function render(Page, status, context = ctx) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/signup'] },
      createElement(
        context.AuthContext.Provider,
        { value: auth(status) },
        createElement(Page),
      ),
    ),
  )
}

test('실제 모드 화면: 1단계는 이름만, 휴대폰·본인인증 없음 / 모의 모드는 기존 본인 확인', () => {
  const real = render(realPage, 'unauthenticated')
  assert.match(real, /기본 정보/)
  assert.doesNotMatch(real, /휴대폰|본인인증|본인 확인/)
  const mock = render(mockPage, 'unauthenticated', mockCtx)
  assert.match(mock, /본인 확인/)
})

test('로그인 회원은 가입 폼을 그리지 않는다(/home으로 이동, D4)', () => {
  const html = render(realPage, 'authenticated')
  assert.doesNotMatch(html, /<form/)
})

test('loading 중에도 폼(입력)은 그린다', () => {
  assert.match(render(realPage, 'loading'), /<form/)
})

test('체험 모듈: 실제 모드에서는 꺼져 있고, 모의 모드에서 남긴 표지가 있어도 읽지 않는다(D8)', () => {
  // 체험 모듈은 window.sessionStorage를 쓴다(Node에는 window가 없어 이 테스트에서만 대역을 둔다).
  globalThis.window = { sessionStorage: storage }
  try {
    assert.equal(realExperience.signupExperienceAvailable, false)
    assert.equal(mockExperience.signupExperienceAvailable, true)
    mockExperience.startSignupExperience()
    assert.equal(mockExperience.isSignupExperienceActive(), true)
    assert.ok(storage.map.size > 0, '모의 모드가 표지를 남김')
    assert.equal(realExperience.isSignupExperienceActive(), false)
  } finally {
    delete globalThis.window
  }
})

test('운영 빌드: VITE_DEV_AUTH=true여도 실제 가입 호출이 들어가고 개발용 인증번호·예시 주소·체험 모듈은 빠진다', async () => {
  // 앞서 띄운 개발 서버가 NODE_ENV를 development로 바꿔 두므로, 운영 빌드 동안만 production으로 둔다.
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
  const outputs = (Array.isArray(result) ? result : [result]).flatMap(
    (r) => r.output,
  )
  const code = outputs
    .filter((o) => o.type === 'chunk')
    .map((o) => o.code)
    .join('\n')
  // 번들이 커서 실패 메시지에 본문을 싣지 않는다.
  assert.ok(code.includes('/auth/signup'), '실제 가입 호출 경로가 번들에 있음')
  assert.ok(!code.includes('react.development'), '운영 빌드여야 함')
  for (const devOnly of [
    '654321',
    '둔산로',
    '시안 인증번호',
    '개발용 인증번호',
    'devSignupExperience',
  ])
    assert.equal(code.includes(devOnly), false, devOnly)
})

// ── F2-1(Codex 검토): 가입 완료 안내와 과거 시작 확인 실패 안내가 겹치지 않음 ──

function renderLogin(state, connectionNotice) {
  // LoginPage는 useMatches를 쓰므로 data router로 그린다.
  const router = createMemoryRouter(
    [{ path: '/login', element: createElement(realLogin) }],
    { initialEntries: [{ pathname: '/login', state }] },
  )
  return renderToStaticMarkup(
    createElement(
      ctx.AuthContext.Provider,
      { value: { ...auth('unauthenticated'), connectionNotice } },
      createElement(RouterProvider, { router }),
    ),
  )
}
const SIGNED_UP_TEXT = '회원가입이 완료됐어요'
const CONNECTION_TEXT = '서버에 연결할 수 없어요'

test('가입 완료 표지가 있어도 지금 떠 있는 시작 확인 실패는 보인다(새로고침 뒤 새 실패, PR #27 리뷰 P2 ②)', () => {
  const html = renderLogin(api.SIGNED_UP_STATE, true)
  assert.ok(html.includes(SIGNED_UP_TEXT))
  assert.ok(html.includes(CONNECTION_TEXT))
  // 가입 화면이 지난 경고를 지우고 오면(connectionNotice false) 완료 안내만 보인다.
  const cleared = renderLogin(api.SIGNED_UP_STATE, false)
  assert.ok(cleared.includes(SIGNED_UP_TEXT))
  assert.equal(cleared.includes(CONNECTION_TEXT), false)
})

test('가입을 거치지 않은 로그인 화면은 기존대로 시작 확인 실패 안내를 보인다(F1-D7 유지)', () => {
  const html = renderLogin(null, true)
  assert.ok(html.includes(CONNECTION_TEXT))
  assert.equal(html.includes(SIGNED_UP_TEXT), false)
  assert.equal(renderLogin(null, false).includes(CONNECTION_TEXT), false)
})

test('지난 시작 확인 경고는 가입 성공 때만 지우고, 로그인 화면은 가입 표지로 경고를 숨기지 않는다(정적)', () => {
  const login = source('src/pages/LoginPage.tsx')
  // 새 로그인 실패(noticeVisible)는 단독 조건, 시작 확인 실패는 connectionNotice만 본다.
  assert.match(
    login,
    /\{noticeVisible \|\|\s*\(connectionNotice &&\s*!submitting/,
  )
  assert.doesNotMatch(login, /hideStartupNotice/)
  assert.match(login, /<LoginForm \/>/)
  const signup = source('src/pages/SignupPage.tsx')
  const success = signup.slice(
    signup.indexOf("case 'success':"),
    signup.indexOf("case 'emailUnavailable':"),
  )
  assert.match(
    success,
    /dismissConnectionNotice\(\)\s*navigate\('\/login', \{ replace: true, state: SIGNED_UP_STATE \}\)/,
  )
  // 실패·409·unconfirmed에서는 지우지 않는다(서버에 닿았는지 확정되지 않았거나 가입이 끝나지 않음).
  assert.equal(signup.match(/dismissConnectionNotice\(\)/g).length, 1)
  const provider = source('src/auth/AuthProvider.tsx')
  assert.match(
    provider,
    /const dismissConnectionNotice = useCallback\(\(\) => \{\s*setConnectionNotice\(false\)\s*\}, \[\]\)/,
  )
})
