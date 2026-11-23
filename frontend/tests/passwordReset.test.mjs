import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// A04 비밀번호 재설정: 입력 검증·상태·서버 연결 경계·화면·라우트·A01 연결·범위. 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
let server
let Reset
let Form
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const text = (out) => out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Reset = await server.ssrLoadModule('/src/auth/passwordReset.ts')
  Form = (
    await server.ssrLoadModule('/src/components/auth/PasswordResetForm.tsx')
  ).default
})
after(async () => {
  await server.close()
})

const signal = new AbortController().signal

test('이메일 검증: 빈 값·형식 오류는 막고 앞뒤 공백은 무시하며 계정 조회는 하지 않는다', () => {
  const v = Reset.validateResetEmail
  assert.deepEqual(v(''), { ok: false, error: 'empty' })
  assert.deepEqual(v('   '), { ok: false, error: 'empty' })
  for (const bad of [
    'a',
    'a@',
    '@b.com',
    'a@b',
    'a b@c.com',
    'a@b..com',
    'a@@b.com',
    'a@b.c om',
    `${'a'.repeat(250)}@b.com`,
  ]) {
    assert.deepEqual(v(bad), { ok: false, error: 'format' }, bad)
  }
  assert.deepEqual(v('  name@example.com '), {
    ok: true,
    email: 'name@example.com',
  })
  assert.equal(v('a.b+c@sub.example.co.kr').ok, true)
})

test('서버 연결은 아직 없다: 연결이 없으면 요청하지 않고 연결 전이며 완료로 보지 않는다', async () => {
  assert.equal(Reset.createPasswordResetSource(), null)
  assert.equal(
    await Reset.runResetRequest(null, 'a@b.com', signal),
    'unavailable',
  )
})

test('요청 실행: 서버가 접수하면 done, 예외는 failed(완료로 보지 않는다)', async () => {
  const calls = []
  const ok = { requestReset: async (e) => void calls.push(e) }
  assert.equal(await Reset.runResetRequest(ok, 'a@b.com', signal), 'done')
  assert.deepEqual(calls, ['a@b.com'])
  const bad = {
    requestReset: async () => {
      throw new Error('x')
    },
  }
  assert.equal(await Reset.runResetRequest(bad, 'a@b.com', signal), 'failed')
})

test('안내 문구: 완료 문구는 계정 존재 여부를 알리지 않고, 연결 전은 메일이 발송되지 않았다고 알린다', () => {
  const m = Reset.RESET_MESSAGES
  assert.match(m.done, /가입된 계정이 있다면/)
  assert.doesNotMatch(m.done, /존재하지 않|없는 계정|찾을 수 없/)
  assert.match(m.unavailable, /발송되지 않았고/)
  assert.doesNotMatch(m.unavailable, /보냈어요/)
  assert.match(m.failed, /그대로 남아 있어요/)
})

const render = (props) => html(createElement(Form, { source: null, ...props }))

test('폼 초기: 라벨 연결 이메일 입력·요청 버튼·알림 영역이 있고 안내는 없다', () => {
  const out = render({})
  assert.match(out, /<label for="[^"]+"[^>]*>가입 이메일<\/label>/)
  assert.match(
    out,
    /<input[^>]*type="email"[^>]*autoComplete="email"|<input[^>]*autocomplete="email"/,
  )
  assert.match(out, /noValidate|novalidate/)
  assert.match(out, /<div role="alert"><\/div>/)
  assert.match(out, /<div role="status"><\/div>/)
  assert.match(text(out), /재설정 안내 요청/)
  assert.doesNotMatch(out, /data-reset-state/)
  assert.doesNotMatch(out, / aria-disabled=/)
})

test('입력 오류: 오류 문구가 입력에 연결되고 입력값은 유지된다', () => {
  for (const [error, message] of [
    ['empty', /이메일을 입력해 주세요/],
    ['format', /이메일 형식이 올바르지 않아요/],
  ]) {
    const out = render({ initial: { phase: 'invalid', email: 'abc', error } })
    assert.match(out, /value="abc"/)
    assert.match(out, /aria-invalid="true"/)
    const id = out.match(/aria-describedby="([^"]+)"/)[1]
    assert.match(out, new RegExp(`<p id="${id.replace(/:/g, '\:')}"`))
    assert.match(text(out), message)
  }
})

test('처리 상태별 화면: 준비·요청 중은 버튼이 막히고, 연결 전·실패·완료는 서로 다른 안내다', () => {
  const states = {}
  for (const phase of [
    'preparing',
    'requesting',
    'unavailable',
    'failed',
    'done',
  ]) {
    states[phase] = render({ initial: { phase, email: 'a@b.com' } })
    assert.match(
      states[phase],
      new RegExp(`data-reset-state="${phase}"`),
      phase,
    )
    assert.match(states[phase], /value="a@b.com"/, phase)
  }
  for (const phase of ['preparing', 'requesting']) {
    assert.match(states[phase], /<button[^>]* aria-disabled="true"/, phase)
    assert.match(text(states[phase]), /요청 중…/)
  }
  for (const phase of ['unavailable', 'failed', 'done']) {
    assert.doesNotMatch(states[phase], / aria-disabled=/, phase)
    assert.match(states[phase], /tabindex="-1"/i, phase)
  }
  assert.match(text(states.unavailable), /서버에 연결되지 않았어요/)
  assert.match(text(states.failed), /처리하지 못했어요/)
  assert.match(text(states.done), /재설정 안내를 보냈어요/)
  // 연결 전·실패 화면에는 완료 문구가 없다
  for (const phase of ['unavailable', 'failed']) {
    assert.doesNotMatch(text(states[phase]), /안내를 보냈어요/, phase)
  }
})

test('실제 화면은 완료를 만들 수 없다: 서버 연결이 없고 시험용 초기 상태를 넘기지 않는다', () => {
  const page = code('../src/pages/PasswordResetPage.tsx')
  assert.match(page, /createPasswordResetSource\(\)/)
  assert.doesNotMatch(page, /initial=/)
  const form = code('../src/components/auth/PasswordResetForm.tsx')
  // 완료는 runResetRequest가 서버 접수를 확인했을 때만 정해진다
  assert.match(form, /setPhase\(result\)/)
  assert.doesNotMatch(form, /setPhase\('done'\)/)
  // 저장·계정 조회·네트워크를 직접 쓰지 않는다
  for (const file of [
    '../src/auth/passwordReset.ts',
    '../src/components/auth/PasswordResetForm.tsx',
    '../src/pages/PasswordResetPage.tsx',
  ]) {
    assert.doesNotMatch(
      code(file),
      /localStorage|sessionStorage|indexedDB|fetch\(|axios|useAuth|login\(/,
      file,
    )
  }
})

test('라우트: /password/reset은 비회원 포함 누구나 접근하고 상위 화면은 로그인이다', () => {
  const router = read('../src/app/router.tsx')
  const at = router.indexOf("path: 'password/reset',")
  assert.ok(at > 0)
  const gate = router.indexOf('element: <AuthGate />')
  assert.ok(at < gate, 'AuthGate 밖(비회원 접근)')
  assert.match(router.slice(at, at + 200), /passwordResetHandle/)
  const handle = router.slice(router.indexOf('const passwordResetHandle'))
  assert.match(handle.slice(0, 500), /screenId: 'A04'/)
  assert.match(handle.slice(0, 500), /parent: '\/login'/)
  assert.match(handle.slice(0, 500), /bodyBack: true/)
})

test('A01 연결: 비밀번호 링크는 A04로 가고 검증된 복귀 경로만 이어 가며, A04의 로그인 복귀가 그 경로를 돌려준다', () => {
  const login = code('../src/pages/LoginPage.tsx')
  assert.match(login, /to="\/password\/reset"/)
  assert.match(login, /state=\{returnTo \? \{ returnTo \} : undefined\}/)
  assert.match(login, /safeReturnTo\(location\.state\)/)
  const page = code('../src/pages/PasswordResetPage.tsx')
  assert.match(page, /to="\/login"/)
  assert.match(page, /safeReturnTo\(location\.state\)/)
  assert.match(page, /BackLink parent=\{parent\}/)
})
