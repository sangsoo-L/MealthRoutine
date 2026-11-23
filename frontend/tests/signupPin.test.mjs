// P05 가입 설정 모드(/signup/pin): 상태별 화면(가입 체험·연결 전·로그인 회원), 문구·링크, PIN을 저장하지 않는 구조, 라우트·A03 연결을 확인한다.
// 실제 서버·실제 PIN은 쓰지 않는다. 입력 검증 규칙은 pinSettings 테스트가 이미 확인하므로 여기서는 이 화면이 새로 정하는 것만 본다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, Body, policy
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  Body = (
    await server.ssrLoadModule('/src/components/pin-settings/SignupPinView.tsx')
  ).SignupPinBody
  policy = await server.ssrLoadModule('/src/pin-settings/pinSettingsPolicy.ts')
})
after(async () => {
  await server?.close()
})

const render = (state) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/signup/pin'] },
      createElement(Body, { state, onSubmit: async () => null }),
    ),
  )
const text = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')

test('경로·다음 화면 상수', () => {
  assert.equal(policy.SIGNUP_PIN_PATH, '/signup/pin')
  assert.equal(policy.SIGNUP_PIN_NEXT_PATH, '/onboarding/assessment')
  assert.equal(policy.SIGNUP_PATH, '/signup')
})

test('연결 전(운영·체험 아님): 제목 하나, 안내, 폼은 비활성이고 이전은 회원가입', () => {
  const html = render('unavailable')
  const t = text(html)
  assert.equal((html.match(/<h1/g) ?? []).length, 1)
  assert.match(t, /2차 비밀번호 설정/)
  assert.match(t, /지금은 설정할 수 없어요/)
  // 신체 정보 보호용이며 로그인 비밀번호와 구분한다.
  assert.match(t, /로그인 비밀번호와는 별개/)
  assert.match(t, /신체 정보/)
  // 입력 두 칸(설정·확인)과 비활성 다음 버튼, 회원가입으로 가는 이전 링크.
  assert.equal((html.match(/<input/g) ?? []).length, 2)
  assert.equal((html.match(/<input[^>]*disabled=""/g) ?? []).length, 2)
  assert.match(html, /<button[^>]*type="submit"[^>]*disabled=""/)
  assert.match(html, /<a[^>]*href="\/signup"[^>]*>[^<]*이전/)
  // 등록 성공 표현이 없다.
  assert.doesNotMatch(t, /등록(됐|되었|완료)|설정(됐|되었|완료)|저장(됐|되었)/)
})

test('가입 체험 중: 입력이 열려 있고 "저장되지 않는다"는 안내가 폼 앞에 있다', () => {
  const html = render('experience')
  const t = text(html)
  assert.match(t, /저장되지 않아요/)
  assert.equal((html.match(/<input[^>]*disabled=""/g) ?? []).length, 0)
  assert.match(t, /다음/)
  assert.doesNotMatch(t, /지금은 설정할 수 없어요/)
  assert.ok(html.indexOf('저장되지 않아요') < html.indexOf('<form'))
  // 입력은 숫자 6자리 마스킹 칸이고 자동완성을 끈다.
  assert.match(html, /type="password"/)
  assert.match(html, /autoComplete="off"|autocomplete="off"/)
  assert.match(html, /maxLength="6"|maxlength="6"/)
})

test('로그인한 회원: 폼 대신 P11 등록으로 안내한다', () => {
  const html = render('member')
  assert.equal((html.match(/<input/g) ?? []).length, 0)
  assert.match(text(html), /이미 로그인한 회원/)
  assert.match(html, /href="\/settings\/pin\/register"/)
})

test('PIN을 저장하지 않는다: 저장소·라우터 state·PIN 저장소·URL을 쓰지 않는다', () => {
  for (const file of [
    'src/components/pin-settings/SignupPinView.tsx',
    'src/pages/SignupPinPage.tsx',
  ]) {
    const code = read(file).replace(/\/\*[\s\S]*?\*\//g, '')
    const noComments = code
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/^import type .*$/gm, '')
    assert.doesNotMatch(
      noComments,
      /localStorage|sessionStorage|indexedDB|useLocation|useSearchParams|registerPin|usePinSettings|usePinStatus|document\.cookie|fetch\(/,
      file,
    )
  }
  // 제출 핸들러는 값을 받지 않는다(받을 수 없으니 어디에도 남지 않는다).
  const view = read('src/components/pin-settings/SignupPinView.tsx')
  assert.match(view, /useCallback\(async \(\): Promise<PinSubmitResult/)
  // 이동은 state 없이 경로만 쓴다.
  assert.match(view, /navigate\(SIGNUP_PIN_NEXT_PATH\)/)
})

test('라우트: /signup/pin은 P05, 가입과 같이 하단 탭이 없고 제목은 화면이 그린다', () => {
  const router = read('src/app/router.tsx')
  assert.match(router, /path: 'signup\/pin'/)
  const handle = router.match(/const signupPinHandle[^{]*\{([\s\S]*?)\n\}/)?.[1]
  assert.ok(handle)
  assert.match(handle, /screenId: 'P05'/)
  assert.match(handle, /focus: true/)
  assert.match(handle, /ownH1: true/)
  // 인증 가드를 두지 않는다(가입 단계는 비회원이다).
  const block = router.match(
    /path: 'signup\/pin'[\s\S]*?handle: signupPinHandle/,
  )
  assert.ok(block)
  assert.doesNotMatch(block[0], /AuthGate|AuthOrExperienceGate/)
})

test('A03 가입 체험 제출은 /signup/pin으로 이동한다(이해도 확인으로 바로 가지 않는다)', () => {
  const signup = read('src/pages/SignupPage.tsx')
  assert.match(signup, /navigate\(SIGNUP_PIN_PATH\)/)
  assert.doesNotMatch(signup, /navigate\('\/onboarding\/assessment'\)/)
})
