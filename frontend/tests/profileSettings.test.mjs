// P02 프로필과 개인정보 설정: 닉네임 검증(가입과 같은 NAME-2, F3-D2) · 항목별 표시 규칙(연결 전/정보 없음/값, 휴대폰 마스킹) ·
// 조회·저장 상태 · 화면 구성 · P09 연결 · 라우트(회원 전용) · 계정 분리와 신체 정보 비침범을 확인한다.
// 서버 값이 필요한 경우(값 표시·저장)는 시험용 가짜 source/데이터를 화면에 직접 넘겨 "서버가 준 값만 보여 준다"는 규칙을 확인한다
// (실제 개인정보가 아니다). 실제 서버 연결(F3)·모드 분기·늦은 응답은 tests/profileConnect.test.mjs가 확인한다.
// 개인 .env.development.local의 VITE_DEV_AUTH 값이 결과를 바꾸지 않도록 빈 envDir을 쓴다. 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

const envDir = mkdtempSync(join(tmpdir(), 'profile-env-'))
let server, prof, View, menu
before(async () => {
  server = await createServer({
    envDir,
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  prof = await server.ssrLoadModule('/src/profile/profile.ts')
  View = (
    await server.ssrLoadModule(
      '/src/components/settings/profile/ProfileSettingsView.tsx',
    )
  ).default
  menu = await server.ssrLoadModule('/src/settings/settingsMenu.ts')
})
after(async () => {
  await server?.close()
  rmSync(envDir, { recursive: true, force: true })
})

const signal = new AbortController().signal
const noop = () => {}
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const account = { nickname: '일반회원', email: 'member.free@example.com' }
const empty = {
  name: null,
  phone: null,
  address: null,
  age: null,
  sex: null,
  allergies: null,
  aiConsent: null,
}
const filled = {
  name: '시험이름',
  phone: '010-1234-5678',
  address: '시험 도로명 1 (상세 101호)',
  age: 29,
  sex: 'female',
  allergies: ['땅콩', '우유'],
  aiConsent: true,
}
const fakeSource = {
  getProfile: async () => filled,
  updateNickname: async (nickname) => nickname,
}
const ready = (data) => ({ status: 'ready', data })

// ── 닉네임·마스킹·표시 규칙 ───────────────────────────────────────────────
test('닉네임은 가입과 같은 서버 규칙(NAME-2)이고 앞뒤 공백을 뺀 값으로 판단·저장한다', () => {
  for (const bad of [
    '',
    ' ',
    'a',
    '가',
    'a b',
    '닉 네임',
    '😀😀',
    'ab!',
    '가'.repeat(9),
    'a'.repeat(17),
  ])
    assert.deepEqual(
      prof.validateNickname(bad),
      { ok: false, error: 'invalid' },
      bad,
    )
  assert.deepEqual(prof.validateNickname(' 닉네임 '), {
    ok: true,
    nickname: '닉네임',
  })
  for (const good of ['가나', '가'.repeat(8), 'ab', 'a'.repeat(16), '길동12'])
    assert.equal(prof.validateNickname(good).ok, true, good)
  assert.match(
    prof.NICKNAME_ERROR_MESSAGE.invalid,
    /한글이 있으면 2~8자, 없으면 2~16자/,
  )
  assert.match(prof.NICKNAME_HELP_TEXT, /한글이 있으면 2~8자, 없으면 2~16자/)
  // 예전 규칙(2~20자) 상수는 남아 있지 않다.
  assert.equal(prof.NICKNAME_MAX, undefined)
})

test('휴대폰은 일부만 보이고 짧거나 이상한 값은 전부 가린다', () => {
  assert.equal(prof.maskPhone('010-1234-5678'), '010-****-5678')
  assert.equal(prof.maskPhone('01012345678'), '010-****-5678')
  assert.equal(prof.maskPhone('+82 10 1234 5678'), '821-****-5678')
  assert.equal(prof.maskPhone('1234'), '***')
  assert.equal(prof.maskPhone(''), '***')
  assert.ok(!prof.maskPhone('010-1234-5678').includes('1234'))
})

test('서버 값이 없을 때(조회 중·연결 전·실패)는 값 대신 상태로 구분해 보이고 정보 없음과 섞이지 않는다', () => {
  for (const status of ['loading', 'unavailable', 'error']) {
    for (const key of [
      'name',
      'phone',
      'identity',
      'address',
      'allergies',
      'aiConsent',
    ])
      assert.deepEqual(prof.profileFieldView({ status }, key), {
        kind: 'status',
        status,
      })
  }
  assert.equal(prof.FIELD_STATUS_TEXT.unavailable, '연결 전')
  assert.equal(prof.FIELD_STATUS_TEXT.empty, '등록된 정보 없음')
  assert.notEqual(
    prof.FIELD_STATUS_TEXT.unavailable,
    prof.FIELD_STATUS_TEXT.empty,
  )
})

test('서버가 값을 주지 않은 항목은 "등록된 정보 없음"이고 값은 지어내지 않는다', () => {
  const state = ready(empty)
  for (const key of [
    'name',
    'phone',
    'identity',
    'address',
    'allergies',
    'aiConsent',
  ])
    assert.deepEqual(
      prof.profileFieldView(state, key),
      { kind: 'status', status: 'empty' },
      key,
    )
  assert.equal(prof.isProfileEmpty(state), true)
  // 공백뿐인 글자도 값이 아니다.
  assert.deepEqual(
    prof.profileFieldView(ready({ ...empty, name: '  ' }), 'name'),
    {
      kind: 'status',
      status: 'empty',
    },
  )
  assert.equal(prof.isProfileEmpty({ status: 'unavailable' }), false)
})

test('서버 값은 그대로 보이되 휴대폰은 마스킹하고 나이·성별·알레르기·동의를 구분한다', () => {
  const state = ready(filled)
  const text = (key) => prof.profileFieldView(state, key).text
  assert.equal(text('name'), '시험이름')
  assert.equal(text('phone'), '010-****-5678')
  assert.equal(text('identity'), '29세 · 여성')
  assert.equal(text('address'), '시험 도로명 1 (상세 101호)')
  assert.equal(text('allergies'), '땅콩, 우유')
  assert.equal(text('aiConsent'), '동의함')
  assert.equal(prof.isProfileEmpty(state), false)
  const view = (patch, key) =>
    prof.profileFieldView(ready({ ...empty, ...patch }), key)
  assert.equal(view({ age: 30 }, 'identity').text, '30세')
  assert.equal(view({ sex: 'male' }, 'identity').text, '남성')
  // 서버 gender 4종을 모두 표시한다(F3-D4). 만 0세도 나이다.
  assert.equal(view({ sex: 'other' }, 'identity').text, '기타')
  assert.equal(view({ sex: 'undisclosed' }, 'identity').text, '밝히지 않음')
  assert.equal(view({ age: 0 }, 'identity').text, '0세')
  assert.equal(view({ age: -1, sex: null }, 'identity').status, 'empty')
  assert.equal(view({ age: 999 }, 'identity').status, 'empty')
  assert.equal(view({ allergies: [] }, 'allergies').text, '없음')
  assert.equal(view({ allergies: [' ', ''] }, 'allergies').text, '없음')
  assert.equal(view({ aiConsent: false }, 'aiConsent').text, '동의하지 않음')
})

// ── 연결(source)·상태 ─────────────────────────────────────────────────────
test('연결이 없으면(source null) 조회·저장을 하지 않는다', async () => {
  assert.deepEqual(await prof.runGetProfile(null, signal), {
    status: 'unavailable',
  })
  assert.equal(await prof.runUpdateNickname(null, '닉네임', signal), null)
})

test('조회·저장은 서버가 응답한 때만 성공이고, 저장 결과에는 서버가 저장한 닉네임이 담기며 예외는 실패다', async () => {
  assert.deepEqual(await prof.runGetProfile(fakeSource, signal), {
    status: 'ready',
    data: filled,
  })
  const bad = {
    getProfile: async () => {
      throw new Error('x')
    },
    updateNickname: async () => {
      throw new Error('x')
    },
  }
  assert.deepEqual(await prof.runGetProfile(bad, signal), { status: 'error' })
  assert.deepEqual(await prof.runUpdateNickname(fakeSource, '닉네임', signal), {
    phase: 'saved',
    nickname: '닉네임',
  })
  // 서버가 다른 값으로 저장했다고 답하면 그 값이 결과다(입력값으로 대신하지 않는다).
  const other = { ...fakeSource, updateNickname: async () => '서버값' }
  assert.deepEqual(await prof.runUpdateNickname(other, '닉네임', signal), {
    phase: 'saved',
    nickname: '서버값',
  })
  assert.deepEqual(await prof.runUpdateNickname(bad, '닉네임', signal), {
    phase: 'failed',
  })
})

// ── 화면 ──────────────────────────────────────────────────────────────────
const view = (props = {}) =>
  render(
    createElement(View, {
      account,
      state: { status: 'unavailable' },
      onRetry: noop,
      source: null,
      cancelTo: '/settings',
      ...props,
    }),
  )

test('P02 구성: 제목·01 프로필·02 가입 개인정보·03 건강 관리 동의·계정 정보·취소', () => {
  const html = view()
  assert.match(html, /<h1[^>]*>프로필과 개인정보 설정<\/h1>/)
  assert.match(html, /<h2[^>]*>[\s\S]*01[\s\S]*프로필<\/h2>/)
  assert.match(html, /<h2[^>]*>[\s\S]*02[\s\S]*가입 개인정보<\/h2>/)
  assert.match(html, /<h2[^>]*>[\s\S]*03[\s\S]*건강 관리 동의<\/h2>/)
  // 계정 값은 로그인 계정에서 온다.
  assert.match(html, /value="일반회원"/)
  assert.match(html, /member\.free@example\.com/)
  assert.match(html, /읽기 전용/)
  assert.match(html, /<label[^>]*for="[^"]*"[^>]*>[^<]*닉네임/)
  assert.match(html, /autoComplete="nickname"/)
  assert.match(html, /aria-required="true"/)
  assert.match(
    html,
    /한글·영문·숫자로 입력해 주세요\. 한글이 있으면 2~8자, 없으면 2~16자예요\./,
  )
  assert.doesNotMatch(html, /2~20자/)
  assert.match(
    html,
    /data-profile-cancel[^>]*href="\/settings"|href="\/settings"[^>]*data-profile-cancel/,
  )
  // 비밀번호는 A04로, 건강 목표·신체 정보는 마이페이지로 보내고 이 화면이 다루지 않는다.
  assert.match(html, /href="\/password\/reset"/)
  // 건강 목표·키·몸무게·잠금 관리는 각 화면으로 보내고 이 화면이 값을 다루지 않는다(P10·P06·P01).
  assert.match(
    html,
    /href="\/settings\/health-goal"[^>]*>[\s\S]*건강 목표 설정/,
  )
  assert.match(html, /href="\/settings\/body"[^>]*>[\s\S]*키·몸무게 입력/)
  assert.match(html, /href="\/mypage"[^>]*>[\s\S]*잠금 관리/)
  assert.doesNotMatch(html, /키\s*\*\*\*|몸무게\s*\*\*\*|BMI/)
})

test('P02 서버 연결 전: 안내·"연결 전" 항목·비활성 저장·사진 변경 비활성이며 저장·가짜 개인정보 표현이 없다', () => {
  const html = view()
  assert.match(html, /프로필·개인정보 기능이 아직 서버에 연결되지 않았어요/)
  assert.match(html, /닉네임을 바꿔도 저장되지 않아요/)
  assert.equal(
    (html.match(/data-profile-status="unavailable"/g) ?? []).length,
    6,
  )
  assert.doesNotMatch(
    html,
    /data-profile-status="empty"|data-profile-state="empty"/,
  )
  assert.match(
    html,
    /data-profile-submit[^>]*disabled=""|disabled=""[^>]*data-profile-submit/,
  )
  assert.match(
    html,
    /<button[^>]*disabled=""[^>]*data-profile-photo|<button[^>]*data-profile-photo[^>]*disabled=""/,
  )
  assert.match(html, /서버에 연결되면 닉네임을 저장할 수 있어요/)
  assert.doesNotMatch(html, /저장했어요|저장되었어요|변경되었어요/)
  assert.doesNotMatch(html, /010-|\d{3}-\*{4}-\d{4}|세 ·/)
})

test('P02 조회 중·실패: 안내만 보이고 정보 없음으로 단정하지 않으며 실패는 다시 시도가 있다', () => {
  const loading = view({ state: { status: 'loading' } })
  assert.match(loading, /내 정보를 불러오는 중이에요/)
  assert.equal(
    (loading.match(/data-profile-status="loading"/g) ?? []).length,
    6,
  )
  const failed = view({ state: { status: 'error' } })
  assert.match(failed, /role="alert"/)
  assert.match(failed, /등록된 정보가 없는 것은 아니에요/)
  assert.match(failed, /data-profile-retry/)
  assert.equal((failed.match(/data-profile-status="error"/g) ?? []).length, 6)
  assert.doesNotMatch(failed, /등록된 정보 없음/)
})

test('P02 정보 없음: 서버가 값을 주지 않은 항목은 "등록된 정보 없음"이고 연결 전과 구분된다', () => {
  const html = view({ state: ready(empty), source: fakeSource })
  assert.match(html, /아직 등록된 개인정보가 없어요/)
  assert.equal((html.match(/data-profile-status="empty"/g) ?? []).length, 6)
  assert.doesNotMatch(html, /연결 전<|data-profile-status="unavailable"/)
  // 계정 값은 정보 없음과 무관하게 보인다.
  assert.match(html, /member\.free@example\.com/)
})

test('P02 정상 조회: 서버 값이 읽기 전용으로 보이고 휴대폰은 일부만 보인다', () => {
  const html = view({ state: ready(filled), source: fakeSource })
  assert.match(html, /시험이름/)
  assert.match(html, /010-\*\*\*\*-5678/)
  assert.doesNotMatch(html, /1234-5678|010-1234/)
  assert.match(html, /29세 · 여성/)
  // F3-R2: 항목 이름은 "나이·성별"이다(본인인증으로 확인한 값처럼 보이지 않는다).
  assert.match(html, /data-profile-row="나이·성별"/)
  assert.match(html, /<dt[^>]*>나이·성별</)
  assert.doesNotMatch(
    html,
    /data-profile-row="본인인증[^"]*"|<dt[^>]*>본인인증/,
  )
  assert.match(html, /시험 도로명 1/)
  assert.match(html, /땅콩, 우유/)
  assert.match(html, />동의함</)
  // 읽기 전용 값은 입력칸이 아니다(닉네임 한 칸만 입력).
  assert.equal((html.match(/<input/g) ?? []).length, 1)
  assert.doesNotMatch(html, /data-profile-state="empty"|data-profile-status=/)
})

test('P02 연결됨(시험용 source): 안내가 없고, 변경이 있을 때만 저장이 활성이다', () => {
  const same = view({ state: ready(filled), source: fakeSource })
  assert.doesNotMatch(
    same,
    /data-profile-state="unavailable"|서버에 연결되면 닉네임을/,
  )
  // 바꾸지 않았으면 저장은 비활성(저장할 것이 없다).
  assert.match(
    same,
    /data-profile-submit[^>]*disabled=""|disabled=""[^>]*data-profile-submit/,
  )
  const changed = view({
    state: ready(filled),
    source: fakeSource,
    initial: { nickname: '새닉네임' },
  })
  assert.doesNotMatch(changed, /data-profile-submit[^>]*disabled=""/)
  assert.match(changed, /value="새닉네임"/)
})

test('P02 닉네임 오류: 안내·aria-invalid·aria-describedby가 연결되고 유효하면 오류가 없다', () => {
  const html = view({
    source: fakeSource,
    state: ready(filled),
    initial: { nickname: 'a', shown: true, phase: 'invalid' },
  })
  assert.match(
    html,
    /닉네임은 한글·영문·숫자로 입력해 주세요\. 한글이 있으면 2~8자, 없으면 2~16자예요\./,
  )
  assert.match(html, /aria-invalid="true"/)
  const errorId = html.match(/id="([^"]*-nickname-error)"/)?.[1]
  assert.ok(errorId)
  assert.match(html, new RegExp(`aria-describedby="[^"]*${errorId}`))
  assert.match(html, /닉네임을 확인해 주세요/)
  const ok = view({
    source: fakeSource,
    state: ready(filled),
    initial: { nickname: '정상닉네임', shown: true },
  })
  assert.doesNotMatch(ok, /aria-invalid="true"/)
})

test('P02 저장 중·실패·완료: 중복 제출을 막고 실패는 입력 유지를 알리며 완료는 서버 저장 상태에서만 나온다', () => {
  const props = {
    source: fakeSource,
    state: ready(filled),
    initial: { nickname: '새닉네임' },
  }
  const saving = view({
    ...props,
    initial: { ...props.initial, phase: 'saving' },
  })
  assert.match(saving, /aria-busy="true"/)
  assert.match(saving, /닉네임을 저장하고 있어요/)
  assert.match(
    saving,
    /data-profile-submit[^>]*disabled=""|disabled=""[^>]*data-profile-submit/,
  )
  assert.match(saving, /저장하는 중…/)
  const failed = view({
    ...props,
    initial: { ...props.initial, phase: 'failed' },
  })
  assert.match(failed, /저장하지 못했어요/)
  assert.match(failed, /입력한 내용은 그대로 남아 있으니/)
  assert.doesNotMatch(failed, /data-profile-submit[^>]*disabled=""/)
  const taken = view({
    ...props,
    initial: { ...props.initial, phase: 'taken' },
  })
  assert.match(taken, /data-profile-save="taken"/)
  assert.match(taken, /이미 사용 중인 닉네임입니다/)
  const rejected = view({
    ...props,
    initial: { ...props.initial, phase: 'rejected' },
  })
  assert.match(rejected, /data-profile-save="rejected"/)
  assert.match(rejected, /요청을 처리하지 못했어요/)
  const uncertain = view({
    ...props,
    initial: { ...props.initial, phase: 'uncertain' },
  })
  assert.match(uncertain, /data-profile-save="uncertain"/)
  assert.match(uncertain, /저장 결과를 확인하지 못했어요/)
  assert.doesNotMatch(uncertain, /저장하지 못했어요/)
  // 저장 중에는 닉네임 입력이 읽기 전용이다(PR #29 P2-01)
  const nicknameInput = (html) =>
    html.match(/<input[^>]*name="profileNickname"[^>]*>/)?.[0] ?? ''
  assert.match(nicknameInput(saving), /readOnly=""/i)
  assert.doesNotMatch(nicknameInput(failed), /readOnly=""/i)
  for (const html of [taken, rejected, failed, uncertain])
    assert.doesNotMatch(html, /닉네임을 저장했어요/)
  const saved = view({
    ...props,
    initial: { ...props.initial, phase: 'saved' },
  })
  assert.match(saved, /data-profile-save="saved"[^>]*>닉네임을 저장했어요\./)
  const idle = view(props)
  assert.doesNotMatch(idle, /닉네임을 저장했어요|data-profile-save=/)
  // 서버가 없으면 저장 완료 표시가 나올 경로가 없다(연결 전 화면에는 저장 상태 표시가 없다).
  assert.doesNotMatch(view(), /data-profile-save=/)
})

// ── 진입점·라우트·보호 ─────────────────────────────────────────────────────
test('P09 설정: 프로필·개인정보가 P02로 연결되고 "이전"이 설정으로 돌아온다', () => {
  const item = menu.SETTINGS_MENU_GROUPS.flatMap((g) => g.items).find(
    (i) => i.screenId === 'P02',
  )
  assert.equal(item.to, '/settings/profile')
  assert.equal(item.returnHere, true)
  assert.equal(item.label, '프로필·개인정보')
})

test('라우트: P02는 승인 경로·회원 전용(AuthGate)·하단 탭 마이·상위 P09·h1 직접', () => {
  const router = readFileSync('src/app/router.tsx', 'utf8')
  const at = router.indexOf("path: 'settings/profile'")
  assert.ok(at > 0)
  const block = router.slice(at, router.indexOf('} satisfies RouteHandle', at))
  assert.match(block, /screenId: 'P02'/)
  assert.match(block, /tab: 'my'/)
  assert.match(block, /ownH1: true/)
  assert.match(block, /parent: '\/settings'/)
  const before = router.slice(0, at)
  assert.ok(
    before.lastIndexOf('element: <AuthGate />') >
      before.lastIndexOf('element: <AuthOrExperienceGate />'),
  )
})

test('P02는 계정별로 분리되고(key) 직접 fetch·저장소·신체 정보·PIN 코드를 쓰지 않는다(서버 호출은 공통 apiRequest로만)', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const page = strip(readFileSync('src/pages/ProfileSettingsPage.tsx', 'utf8'))
  // 계정이 바뀌면 key로 새로 시작해 이전 사용자의 입력·조회 상태가 남지 않는다.
  assert.match(page, /key=\{user\.id\}/)
  assert.match(page, /if \(!user\) return null/)
  const files = [
    'src/profile/profile.ts',
    'src/profile/useProfile.ts',
    'src/pages/ProfileSettingsPage.tsx',
    'src/components/settings/profile/ProfileSettingsView.tsx',
  ]
  for (const file of files) {
    const code = strip(readFileSync(file, 'utf8'))
    assert.doesNotMatch(
      code,
      /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console\.|\/api\/v1/,
      file,
    )
    // 신체 정보(P05·P06)·PIN·열람 권한 코드를 가져오지 않는다.
    assert.doesNotMatch(
      code,
      /from '[^']*(body-measurements|body-access|exercise-goal|pin-settings)[^']*'/,
      file,
    )
  }
})
