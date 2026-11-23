// P06 키·몸무게 입력 · P10 건강 목표 상세 설정: 화면 상태(조회 중/실패/연결 전/없음/있음)·입력 폼 재사용(시트 동작 유지)·값 비노출(PIN 보호)·
// P09·P01·P02 진입점·라우트(회원 전용)·기존 저장소 재사용을 확인한다. 저장 성공을 가장하는 테스트는 없다(저장은 기존 저장소가 하며
// 저장 완료 안내는 저장이 성공한 뒤에만 나온다). 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server,
  BodyView,
  GoalView,
  BodyForm,
  Summary,
  GoalSummary,
  Header,
  menu,
  dest
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  BodyView = (await load('/src/components/settings/body/BodySettingsView.tsx'))
    .default
  GoalView = (
    await load(
      '/src/components/settings/health-goal/HealthGoalSettingsView.tsx',
    )
  ).default
  BodyForm = (await load('/src/components/body-measurements/BodyInfoSheet.tsx'))
    .BodyInfoForm
  Summary = (await load('/src/components/mypage/BodyInfoSummary.tsx')).default
  GoalSummary = (await load('/src/components/mypage/HealthGoalSummary.tsx'))
    .default
  Header = (await load('/src/components/mypage/ProfileHeader.tsx')).default
  menu = await load('/src/settings/settingsMenu.ts')
  dest = await load('/src/mypage/destinations.ts')
})
after(async () => {
  await server?.close()
})

const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const noop = () => {}
const save = async () => {}
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
const both = { height: true, weight: true }
const none = { height: false, weight: false }

// ── P06 ───────────────────────────────────────────────────────────────────
const body = (state, props = {}) =>
  render(
    createElement(BodyView, {
      body: state,
      save,
      onRetry: noop,
      onCancel: noop,
      ...props,
    }),
  )
const ready = (value) => ({ status: 'ready', value })

test('P06 조회 중: 안내만 보이고 폼·등록 상태가 없다', () => {
  const html = body({ status: 'loading' })
  assert.match(html, /<h1[^>]*>키·몸무게 입력<\/h1>/)
  assert.match(html, /신체 정보를 불러오는 중이에요/)
  assert.doesNotMatch(html, /<form|data-body-status/)
})

test('P06 조회 실패: 알림과 다시 시도이며 입력 없음으로 단정하지 않는다', () => {
  const html = body({ status: 'error' })
  assert.match(html, /role="alert"/)
  assert.match(html, /입력한 정보가 없는 것은 아니에요/)
  assert.match(html, /data-body-retry/)
  assert.doesNotMatch(html, /<form|미입력/)
})

test('P06 연결 전(운영 빌드): 안내만 보이고 입력 폼·저장 버튼이 없으며 성공 표현이 없다', () => {
  const html = body({ status: 'unavailable' })
  assert.match(html, /신체 정보 입력 기능은 서비스 연결을 준비하고 있어요/)
  assert.match(html, /입력하거나 저장할 수 없어요/)
  assert.doesNotMatch(html, /<form|<input|저장하기|저장했어요|data-body-status/)
  assert.match(html, /data-body-back/)
})

test('P06 미등록: 키·몸무게 입력칸 두 개와 미입력 상태, 저장·취소가 있다', () => {
  const html = body(ready(none))
  assert.equal((html.match(/data-body-status=/g) ?? []).length, 2)
  assert.equal((html.match(/>미입력</g) ?? []).length, 2)
  assert.equal((html.match(/<input/g) ?? []).length, 2)
  assert.match(html, /<h2[^>]*>키·몸무게 입력<\/h2>/)
  assert.match(html, /inputMode="decimal"/)
  assert.match(html, /1~300cm, 소수점 첫째 자리까지/)
  assert.match(html, /1~500kg, 소수점 첫째 자리까지/)
  assert.match(html, /<label[^>]*>키<\/label>/)
  assert.match(html, /<label[^>]*>몸무게<\/label>/)
  assert.match(html, />저장하기</)
  assert.match(html, />취소</)
  assert.doesNotMatch(html, /다시 입력|data-body-weight-note|data-body-saved/)
})

test('P06 키만 등록: 키는 가려 두고 "다시 입력"을 열 수 있고 몸무게는 입력칸이다', () => {
  const html = body(ready({ height: true, weight: false }))
  assert.match(html, /data-body-reenter="height"/)
  assert.doesNotMatch(html, /data-body-reenter="weight"/)
  assert.equal((html.match(/<input/g) ?? []).length, 1)
  assert.match(html, /키 다시 입력/)
  // 등록된 값은 어디에도 없다(가려진 표시뿐).
  assert.doesNotMatch(html, /(?<![~\d.])\d+(\.\d)?\s?(cm|kg)\b/)
  assert.match(html, /\*\*\*/)
})

test('P06 모두 등록: 값은 보이지 않고 키만 다시 입력할 수 있으며 몸무게는 기록 이력으로 보낸다', () => {
  const html = body(ready(both))
  assert.equal(
    (html.match(/>등록됨</g) ?? []).length,
    4,
    '상태 행 2 + 폼의 가려진 행 2',
  )
  assert.match(html, /<h2[^>]*>키 다시 입력<\/h2>/)
  assert.match(html, /data-body-reenter="height"/)
  assert.doesNotMatch(html, /data-body-reenter="weight"/)
  assert.equal((html.match(/<input/g) ?? []).length, 0)
  assert.match(html, /data-body-weight-note/)
  assert.ok(hrefs(html).includes('/mypage#weight-log'))
  // 입력이 열리지 않았으므로 저장은 비활성이다.
  assert.match(
    html,
    /<button[^>]*type="submit"[^>]*disabled=""|<button[^>]*disabled=""[^>]*type="submit"/,
  )
  assert.doesNotMatch(html, /(?<![~\d.])\d+(\.\d)?\s?(cm|kg)\b/)
})

test('P06은 수치를 읽지 않고 2차 비밀번호 확인(P05)으로 보낸다', () => {
  const html = body(ready(both))
  assert.ok(hrefs(html).includes('/mypage/body/unlock'))
  assert.match(html, /2차 비밀번호로 신체 정보 보기/)
  assert.match(html, /등록한 값은 이 화면에 보이지 않아요/)
})

test('P06 저장 완료 안내는 저장 성공 상태 없이는 나오지 않는다', () => {
  for (const state of [
    { status: 'loading' },
    { status: 'unavailable' },
    { status: 'error' },
    ready(none),
    ready(both),
  ])
    assert.doesNotMatch(body(state), /저장했어요|data-body-saved/)
})

const form = (variant, status, extra = {}) =>
  render(
    createElement(BodyForm, {
      variant,
      status,
      save,
      close: noop,
      closing: false,
      ...extra,
    }),
  )

test('신체 정보 시트(home·mypage)는 그대로다: 등록된 항목은 다시 입력 없이 가려지고 입력은 누락 항목만이다', () => {
  for (const variant of ['home', 'mypage']) {
    const html = form(variant, { height: true, weight: false })
    assert.doesNotMatch(html, /다시 입력|data-body-reenter/)
    assert.equal((html.match(/<input/g) ?? []).length, 1)
    assert.match(html, /등록됨/)
    assert.match(html, /<button[^>]*type="submit"/)
    assert.doesNotMatch(html, /<button[^>]*type="submit"[^>]*disabled=""/)
  }
  assert.match(form('home', none), /저장하고 시작하기/)
  assert.match(form('mypage', none), />닫기</)
  assert.match(form('page', none), />취소</)
})

// ── P10 ───────────────────────────────────────────────────────────────────
const goalView = (state, props = {}) =>
  render(
    createElement(GoalView, {
      goal: state,
      knowledge: { status: 'unavailable' },
      save,
      onRetry: noop,
      onCancel: noop,
      ...props,
    }),
  )
const goalOf = (ratio) => ({
  focus: ratio > 50 ? 'exercise' : ratio < 50 ? 'meal' : 'balanced',
  exerciseRatio: ratio,
  mealRatio: 100 - ratio,
  updatedAt: '2026-11-20T00:00:00.000Z',
})

test('P10 조회 중·실패·연결 전은 서로 다르고 목표 없음이 아니다', () => {
  const loading = goalView({ status: 'loading' })
  assert.match(loading, /<h1[^>]*>건강 목표 상세 설정<\/h1>/)
  assert.match(loading, /불러오는 중이에요/)
  assert.doesNotMatch(loading, /data-goal-form|아직 설정한 건강 목표가 없어요/)
  const failed = goalView({ status: 'error' })
  assert.match(failed, /role="alert"/)
  assert.match(failed, /목표가 없는 것은 아니에요/)
  assert.match(failed, /data-goal-retry/)
  assert.doesNotMatch(failed, /data-goal-form|아직 설정한 건강 목표가 없어요/)
  const off = goalView({ status: 'unavailable' })
  assert.match(off, /건강 목표 기능은 서비스 연결을 준비하고 있어요/)
  assert.match(off, /건강 목표 정보를 아직 불러올 수 없어요/)
  assert.doesNotMatch(
    off,
    /data-goal-form|<input|저장하기|아직 설정한 건강 목표가 없어요|data-goal-saved/,
  )
  assert.match(off, /data-goal-back/)
})

test('P10 목표 없음: 빈 안내와 설정 폼(간편 선택 세 가지)이 있고 현재 목표 값은 없다', () => {
  const html = goalView({ status: 'ready', goal: null })
  assert.match(html, /아직 설정한 건강 목표가 없어요/)
  assert.match(html, /<h2[^>]*>건강 목표 설정<\/h2>/)
  assert.doesNotMatch(html, /data-goal-current/)
  const radios = html.match(/type="radio"/g) ?? []
  assert.equal(radios.length, 3)
  for (const label of ['운동 중심', '식단 중심', '균형 관리'])
    assert.match(html, new RegExp(label))
  assert.match(html, />저장하기</)
  assert.match(html, />취소</)
})

test('P10 목표 있음: 현재 목표(방향·비율)가 보이고 선택은 그 목표에서 시작하며 변경 폼이다', () => {
  const html = goalView({ status: 'ready', goal: goalOf(70) })
  assert.match(html, /data-goal-current/)
  assert.match(html, /운동 70% · 식단 30%/)
  assert.match(html, /<h2[^>]*>건강 목표 변경<\/h2>/)
  assert.match(
    html,
    /<input[^>]*value="70"[^>]*checked=""|<input[^>]*checked=""[^>]*value="70"/,
  )
  assert.doesNotMatch(html, /아직 설정한 건강 목표가 없어요/)
})

test('P10은 직접 설정(중급·고급 이해도)에서도 기존 슬라이더(20~80%, 10% 단위)를 쓴다', () => {
  const levels = {
    exercise: { tier: 'advanced', source: 'assessment' },
    meal: { tier: 'advanced', source: 'assessment' },
  }
  const html = goalView(
    { status: 'ready', goal: goalOf(60) },
    { knowledge: { status: 'ready', levels } },
  )
  assert.match(html, /type="range"/)
  assert.match(html, /min="20"/)
  assert.match(html, /max="80"/)
  assert.match(html, /step="10"/)
})

test('P10 관련 목표 링크: 운동 목표(W01-1)·식단 목표(D01-4)·알레르기·프로필(P02)', () => {
  const html = goalView({ status: 'ready', goal: null })
  assert.ok(hrefs(html).includes('/records/exercise/goal'))
  assert.ok(hrefs(html).includes('/records/meal/goal'))
  assert.ok(hrefs(html).includes('/settings/profile'))
  assert.match(html, /알레르기·프로필 수정/)
})

test('P10 저장 완료 안내는 저장 성공 상태 없이는 나오지 않는다', () => {
  for (const state of [
    { status: 'loading' },
    { status: 'unavailable' },
    { status: 'error' },
    { status: 'ready', goal: null },
    { status: 'ready', goal: goalOf(50) },
  ])
    assert.doesNotMatch(goalView(state), /저장했어요|data-goal-saved/)
})

// ── 진입점 ────────────────────────────────────────────────────────────────
test('P09 설정: 키·몸무게(P06)·건강 목표(P10)가 링크이고 "이전"이 설정으로 돌아온다', () => {
  const items = menu.SETTINGS_MENU_GROUPS.flatMap((g) => g.items)
  const p06 = items.find((i) => i.screenId === 'P06')
  const p10 = items.find((i) => i.screenId === 'P10')
  assert.deepEqual([p06.to, p06.returnHere], ['/settings/body', true])
  assert.deepEqual([p10.to, p10.returnHere], ['/settings/health-goal', true])
  // 새 카테고리 없이 계정·설정 그룹 안에 있다.
  const account = menu.SETTINGS_MENU_GROUPS.find((g) => g.id === 'account')
  assert.ok(account.items.includes(p06) && account.items.includes(p10))
  assert.deepEqual(
    menu.SETTINGS_MENU_GROUPS.map((g) => g.id),
    ['activity', 'account', 'membership', 'support'],
  )
})

test('P01 연결 대상: P06·P10·P02 경로가 채워졌고 P05는 그대로다', () => {
  assert.equal(dest.MY_DESTINATIONS.bodyEdit.to, '/settings/body')
  assert.equal(dest.MY_DESTINATIONS.healthGoal.to, '/settings/health-goal')
  assert.equal(dest.MY_DESTINATIONS.profile.to, '/settings/profile')
  assert.equal(dest.MY_DESTINATIONS.bodyUnlock.to, '/mypage/body/unlock')
})

const summary = (state) => render(createElement(Summary, { body: state, save }))

test('P01 신체 정보: P06 링크가 있고 연결 전에는 링크를 두지 않는다(P05 열람 링크는 그대로)', () => {
  const html = summary(ready(both))
  assert.match(html, /href="\/settings\/body"[^>]*>[\s\S]*키·몸무게 입력·수정/)
  assert.ok(hrefs(html).includes('/mypage/body/unlock'))
  assert.doesNotMatch(
    summary({ status: 'unavailable' }),
    /href="\/settings\/body"/,
  )
})

test('P01 건강 목표: P10 링크가 있고 시트 버튼은 그대로이며 연결 전에는 링크가 없다', () => {
  const props = (goal) => ({
    goal,
    knowledge: { status: 'unavailable' },
    save,
    onRetry: noop,
  })
  const html = render(
    createElement(GoalSummary, props({ status: 'ready', goal: goalOf(70) })),
  )
  assert.match(
    html,
    /href="\/settings\/health-goal"[^>]*>[\s\S]*건강 목표 상세 설정/,
  )
  assert.match(html, />목표 변경</)
  const empty = render(
    createElement(GoalSummary, props({ status: 'ready', goal: null })),
  )
  assert.match(empty, />목표 설정하기</)
  assert.ok(hrefs(empty).includes('/settings/health-goal'))
  const off = render(
    createElement(GoalSummary, props({ status: 'unavailable' })),
  )
  assert.doesNotMatch(off, /\/settings\/health-goal/)
})

test('P01 프로필 머리글: 프로필(아바타·이름)이 P02 링크이고 설정 버튼(P09)은 그대로다', () => {
  const html = render(
    createElement(Header, { nickname: '일반회원', entitlement: 'free' }),
  )
  assert.match(
    html,
    /data-profile-link[^>]*href="\/settings\/profile"|href="\/settings\/profile"[^>]*data-profile-link/,
  )
  assert.match(html, /프로필과 개인정보 설정/)
  assert.match(html, /일반회원님/)
  assert.ok(hrefs(html).includes('/settings'))
  assert.match(html, /aria-label="상세 설정"/)
})

// ── 라우트·재사용 ─────────────────────────────────────────────────────────
test('라우트: P06·P10은 승인 경로·회원 전용(AuthGate)·하단 탭 마이·상위 P09·h1 직접', () => {
  const router = readFileSync('src/app/router.tsx', 'utf8')
  for (const [path, id] of [
    ['settings/body', 'P06'],
    ['settings/health-goal', 'P10'],
  ]) {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > 0, path)
    const block = router.slice(
      at,
      router.indexOf('} satisfies RouteHandle', at),
    )
    assert.match(block, new RegExp(`screenId: '${id}'`))
    assert.match(block, /tab: 'my'/)
    assert.match(block, /ownH1: true/)
    assert.match(block, /parent: '\/settings'/)
    const before = router.slice(0, at)
    assert.ok(
      before.lastIndexOf('element: <AuthGate />') >
        before.lastIndexOf('element: <AuthOrExperienceGate />'),
      path,
    )
  }
})

test('P06·P10은 기존 저장소·폼을 재사용하고 새 저장소·서버 호출·열람 권한 코드를 만들지 않는다', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const read = (file) => strip(readFileSync(file, 'utf8'))
  const body = read('src/pages/BodySettingsPage.tsx')
  const goal = read('src/pages/HealthGoalSettingsPage.tsx')
  // 기존 훅(저장소)을 쓴다. 저장소 생성 함수나 Mock을 직접 부르지 않는다.
  assert.match(body, /useBodyMeasurementStatus/)
  assert.match(goal, /useHealthGoal/)
  // 계정이 바뀌면 key로 새로 시작한다.
  assert.match(body, /key=\{user\.id\}/)
  assert.match(goal, /key=\{user\.id\}/)
  for (const file of [
    'src/pages/BodySettingsPage.tsx',
    'src/pages/HealthGoalSettingsPage.tsx',
    'src/components/settings/body/BodySettingsView.tsx',
    'src/components/settings/health-goal/HealthGoalSettingsView.tsx',
  ]) {
    const code = read(file)
    assert.doesNotMatch(
      code,
      /fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\.|\/api\/v1|createBodyRepository|createGoalRepository|\/mock\//,
      file,
    )
    // P05 열람 권한·PIN 저장소를 가져오지 않는다(수치를 읽지 않는다).
    assert.doesNotMatch(
      code,
      /from '[^']*(body-access|useBodyReveal|exercise-goal|usePinStatus|usePinVerify)[^']*'/,
      file,
    )
  }
  // 시트와 화면이 같은 폼을 쓴다(중복 구현 없음).
  assert.match(
    read('src/components/settings/body/BodySettingsView.tsx'),
    /BodyInfoForm/,
  )
  assert.match(
    read('src/components/settings/health-goal/HealthGoalSettingsView.tsx'),
    /GoalForm/,
  )
})
