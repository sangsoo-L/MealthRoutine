// P03 멤버십과 결제 관리(통합 AI 멤버십: 무료 최초 5회 · 베이직 월 30회 · 프로 월 100회, 운동·식단 공통 사용량):
// 멤버십·사용량 표시 규칙(조회 중·무료·베이직·프로·소진·조회 실패·연결 전) · 운동·식단별 상품 구분 없음 · 가격·결제 내역을 만들지 않음 ·
// 결제·멤버십 변경 버튼 비활성 · 사용량을 프론트엔드가 차감·저장하지 않음 · P09·P01 연결 · 라우트(회원 전용)를 확인한다.
// 결제 API가 없어 결제 성공을 가장하는 테스트는 없다. 서버 값이 필요한 상태는 시험용 가짜 멤버십 정보를 화면에 직접 넘겨
// "서버가 준 값만 보인다"는 규칙을 확인한다(실제 멤버십이 아니다). 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, mem, View, Summary, aiContent, menu, dest
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  mem = await load('/src/membership/membership.ts')
  View = (
    await load('/src/components/settings/membership/MembershipSettingsView.tsx')
  ).default
  Summary = (await load('/src/components/mypage/MembershipSummary.tsx')).default
  aiContent = await load('/src/components/ai/aiIntroContent.ts')
  menu = await load('/src/settings/settingsMenu.ts')
  dest = await load('/src/mypage/destinations.ts')
})
after(async () => {
  await server?.close()
})

const signal = new AbortController().signal
const noop = () => {}
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
const view = (state) => render(createElement(View, { state, onRetry: noop }))
const ready = (info) => ({ status: 'ready', info })
const freeInfo = { plan: 'free', usage: { limit: 5, remaining: 3 } }
const freeExhausted = { plan: 'free', usage: { limit: 5, remaining: 0 } }
const basicInfo = {
  plan: 'basic',
  usage: { limit: 30, remaining: 12 },
  nextResetAt: '2026-12-20T00:00:00+09:00',
  breakdown: { exercise: 11, meal: 7 },
}
const proInfo = {
  plan: 'pro',
  usage: { limit: 100, remaining: 0 },
  nextResetAt: '2026-12-20T00:00:00+09:00',
}
const PRICE = /[\d,]+\s?원|₩|카드 번호|카드번호/

// ── 계약·표시 규칙 ────────────────────────────────────────────────────────
test('서버 연결은 아직 없다(source는 null)이고 연결이 없으면 조회하지 않는다', async () => {
  assert.equal(mem.createMembershipSource(), null)
  assert.deepEqual(await mem.runGetMembership(null, signal), {
    status: 'unavailable',
  })
})

test('멤버십은 서버가 응답했고 아는 모양일 때만 ready이며 예외·모르는 모양은 조회 실패다', async () => {
  const make = (value) => ({ getMembership: async () => value })
  for (const info of [freeInfo, basicInfo, proInfo, { plan: 'basic' }])
    assert.deepEqual(await mem.runGetMembership(make(info), signal), {
      status: 'ready',
      info,
    })
  const bad = {
    getMembership: async () => {
      throw new Error('x')
    },
  }
  assert.deepEqual(await mem.runGetMembership(bad, signal), { status: 'error' })
  for (const odd of [
    null,
    {},
    'basic',
    { plan: 'vip' },
    // 옛 운동·식단·종합 구분 값은 통합 멤버십에 없는 모양이다.
    { plan: 'exercise' },
    { plan: 'meal' },
    { plan: 'full' },
    { plan: 'basic', usage: { limit: 30, remaining: 31 } },
    { plan: 'basic', usage: { limit: 30, remaining: -1 } },
    { plan: 'basic', usage: { limit: 30.5, remaining: 1 } },
    { plan: 'basic', usage: { limit: 30 } },
    { plan: 'basic', nextResetAt: 5 },
    { plan: 'basic', breakdown: { exercise: 1 } },
    { plan: 'basic', breakdown: { exercise: -1, meal: 0 } },
  ])
    assert.deepEqual(
      await mem.runGetMembership(make(odd), signal),
      { status: 'error' },
      JSON.stringify(odd),
    )
})

test('날짜·횟수는 서버 값이 올바를 때만 보이고 아니면 "확인 전"이며 사용량 비율은 표시 계산일 뿐이다', () => {
  assert.match(
    mem.membershipDateLabel('2026-12-20T00:00:00+09:00'),
    /2026\.\s?12\.\s?20/,
  )
  for (const bad of [null, undefined, 'nope'])
    assert.equal(mem.membershipDateLabel(bad), '확인 전')
  assert.equal(mem.usageCountLabel(3), '3회')
  assert.equal(mem.usageCountLabel(0), '0회')
  for (const bad of [null, undefined, -1, 1.5, Number.NaN])
    assert.equal(mem.usageCountLabel(bad), '확인 전')
  assert.deepEqual(mem.usageProgress({ limit: 30, remaining: 12 }), {
    used: 18,
    percent: 60,
  })
  assert.deepEqual(mem.usageProgress({ limit: 0, remaining: 0 }), {
    used: 0,
    percent: 0,
  })
  assert.equal(mem.isUsageExhausted(freeExhausted), true)
  assert.equal(mem.isUsageExhausted(freeInfo), false)
  assert.equal(mem.isUsageExhausted({ plan: 'basic' }), false)
})

test('정책 상수: 무료 최초 총 5회(월간 초기화 없음) · 베이직 월 30회 · 프로 월 100회(권장안·승인 전)', () => {
  const by = Object.fromEntries(mem.MEMBERSHIP_PLANS.map((p) => [p.plan, p]))
  assert.deepEqual(Object.keys(by), ['free', 'basic', 'pro'])
  assert.equal(by.free.count, '가입 후 최초 총 5회')
  assert.equal(by.free.renewal, '월간 초기화 없음')
  assert.equal(by.free.confirmed, true)
  assert.equal(by.basic.count, '매월 30회')
  assert.equal(by.pro.count, '매월 100회')
  assert.equal(by.basic.confirmed, false)
  assert.equal(by.pro.confirmed, false)
  assert.deepEqual(mem.MEMBERSHIP_PLAN_LABEL, {
    free: '무료',
    basic: '베이직',
    pro: '프로',
  })
})

// ── 상태별 화면 ───────────────────────────────────────────────────────────
test('P03 조회 중: 확인 중으로만 보이고 멤버십·잔여 횟수·결제 표현이 없다', () => {
  const html = view({ status: 'loading' })
  assert.match(html, /<h1[^>]*>멤버십과 결제 관리<\/h1>/)
  assert.match(html, /data-membership-subscription="loading"[^>]*>확인 중…/)
  assert.match(html, /data-membership-usage="loading"/)
  assert.doesNotMatch(
    html,
    /무료 멤버십|베이직 멤버십|프로 멤버십|data-membership-state|data-membership-remaining|role="progressbar"/,
  )
})

test('P03 서버 연결 전: 안내와 "연결 전"이며 서버에서 확인하지 않은 멤버십·잔여 횟수를 지어내지 않는다', () => {
  const html = view({ status: 'unavailable' })
  assert.match(html, /멤버십·사용량 정보가 아직 서버에 연결되지 않았어요/)
  assert.match(
    html,
    /data-membership-subscription="unavailable"[\s\S]*?연결 전/,
  )
  assert.match(html, /data-membership-usage="unavailable"[\s\S]*?연결 전/)
  assert.doesNotMatch(
    html,
    /무료 멤버십|베이직 멤버십|프로 멤버십|data-membership-remaining|role="progressbar"|다음 사용량 갱신일|data-membership-exhausted=""|\d+회 남음/,
  )
  // 운동·식단별 사용 내역도 서버가 주지 않으면 숫자를 만들지 않는다.
  assert.match(html, /data-membership-breakdown="empty"/)
  assert.doesNotMatch(html, /data-membership-row="breakdown-/)
})

test('P03 조회 실패: 알림과 다시 시도이며 무료라고 단정하지 않는다', () => {
  const html = view({ status: 'error' })
  assert.match(html, /role="alert"/)
  assert.match(html, /무료 멤버십이라는 뜻은 아니에요/)
  assert.match(html, /data-membership-retry/)
  assert.match(
    html,
    /data-membership-subscription="error"[^>]*>불러오지 못했어요/,
  )
  assert.doesNotMatch(
    html,
    /무료 멤버십<|data-membership-remaining|role="progressbar"/,
  )
})

test('P03 무료(서버 확인): 무료 멤버십·잔여 횟수·진행 표시가 보이고 갱신일 대신 월간 초기화 없음이다', () => {
  const html = view(ready(freeInfo))
  assert.match(html, /data-membership-subscription="ready"[^>]*>무료 멤버십/)
  assert.match(html, /data-membership-remaining="3"[^>]*>3<[\s\S]*?회 남음/)
  assert.match(html, /총 5회 중 2회 사용/)
  const bar = html.match(/<div role="progressbar"[^>]*>/)[0]
  assert.match(bar, /aria-valuemax="5"/)
  assert.match(bar, /aria-valuenow="2"/)
  assert.match(html, /width:40%/)
  assert.match(html, /data-membership-row="reset"[\s\S]*?월간 초기화 없음/)
  assert.doesNotMatch(
    html,
    /다음 사용량 갱신일|data-membership-state|data-membership-exhausted=""/,
  )
  assert.match(html, /멤버십 시작하기/)
  // 서버가 사용량을 주지 않으면 확인 전이다.
  const noUsage = view(ready({ plan: 'free' }))
  assert.match(noUsage, /data-membership-usage="unknown"[\s\S]*?확인 전/)
  assert.doesNotMatch(noUsage, /role="progressbar"/)
})

test('P03 유료(서버 확인): 멤버십·잔여·다음 사용량 갱신일·운동·식단별 사용 내역이 서버 값 그대로 보인다', () => {
  const html = view(ready(basicInfo))
  assert.match(html, /베이직 멤버십/)
  assert.match(html, /data-membership-remaining="12"/)
  assert.match(html, /총 30회 중 18회 사용/)
  assert.match(html, /width:60%/)
  assert.match(html, /다음 사용량 갱신일[\s\S]*?2026\.\s?12\.\s?20/)
  assert.match(html, /data-membership-breakdown="ready"/)
  assert.match(html, /data-membership-row="breakdown-exercise"[\s\S]*?11회/)
  assert.match(html, /data-membership-row="breakdown-meal"[\s\S]*?7회/)
  assert.match(html, /멤버십 변경하기/)
  assert.doesNotMatch(html, /사용량 갱신<\/dt>|구독 해지하기/)
  // 갱신일을 서버가 주지 않으면 지어내지 않는다.
  assert.match(
    view(ready({ ...basicInfo, nextResetAt: null })),
    /다음 사용량 갱신일[\s\S]*?확인 전/,
  )
  // 사용 내역이 없으면 숫자 없이 안내만 있다.
  const noBreakdown = view(ready({ ...basicInfo, breakdown: null }))
  assert.match(noBreakdown, /data-membership-breakdown="empty"/)
  assert.doesNotMatch(noBreakdown, /data-membership-row="breakdown-/)
  assert.match(view(ready({ plan: 'pro' })), /프로 멤버십/)
})

test('P03 사용 횟수 소진(서버 확인): 무료는 다시 채워지지 않는다고, 유료는 갱신일을 알리고 기록·조회는 계속 쓸 수 있다고 안내한다', () => {
  const free = view(ready(freeExhausted))
  assert.match(free, /data-membership-exhausted=""/)
  assert.match(free, /매월 다시 채워지지 않아요/)
  assert.match(free, /data-membership-remaining="0"/)
  assert.match(free, /width:100%/)
  const pro = view(ready(proInfo))
  assert.match(
    pro,
    /data-membership-exhausted=""[\s\S]*?이번 달 AI 사용 횟수를 모두 사용했어요[\s\S]*?2026\.\s?12\.\s?20/,
  )
  const proNoDate = view(ready({ ...proInfo, nextResetAt: null }))
  assert.match(proNoDate, /다음 사용량 갱신일에 다시 쓸 수 있어요/)
  // 정적 안내(기록·조회는 계속 가능)는 상태와 상관없이 항상 있다.
  for (const html of [
    view(ready(freeInfo)),
    free,
    pro,
    view({ status: 'unavailable' }),
  ])
    assert.match(
      html,
      /AI 사용 횟수를 모두 쓰면 AI 기능은 이용할 수 없어요[\s\S]*?기록과 조회는 횟수와 상관없이 계속 쓸 수 있어요/,
    )
  // 소진이 아니면 소진 알림은 없다.
  assert.doesNotMatch(view(ready(basicInfo)), /data-membership-exhausted=""/)
})

test('P03은 운동·식단별 멤버십 상품 구분이 없고 운동 AI·식단 AI가 공통 사용량을 공유한다고 알린다', () => {
  for (const state of [
    { status: 'unavailable' },
    ready(freeInfo),
    ready(basicInfo),
    ready(proInfo),
  ]) {
    const html = view(state)
    assert.doesNotMatch(
      html,
      /운동 멤버십|식단 멤버십|종합 멤버십|운동·종합|식단·종합|회원 유형|일반 회원/,
    )
    assert.match(html, /운동 AI와 식단 AI는 같은 횟수를 함께 사용해요/)
    assert.match(html, /운동·식단 기록과 조회는 AI 사용 횟수를 쓰지 않아요/)
  }
})

test('P03 결제·멤버십 변경 버튼은 어떤 상태에서도 비활성이고 누르면 성공하는 동작이 없으며 준비 중이라고 알린다', () => {
  const states = [
    { status: 'loading' },
    { status: 'unavailable' },
    { status: 'error' },
    ready(freeInfo),
    ready(basicInfo),
    ready(proInfo),
  ]
  for (const state of states) {
    const html = view(state)
    const block = html.slice(html.indexOf('data-membership-actions'))
    const buttons = block.match(/<button[^>]*>/g) ?? []
    assert.equal(buttons.length, 1, JSON.stringify(state))
    assert.match(buttons[0], /disabled=""/, JSON.stringify(state))
    assert.match(html, /결제와 멤버십 변경 기능은 준비 중이에요/)
    assert.match(html, /결제·멤버십 변경은 준비가 끝나면 이용할 수 있어요/)
  }
  // 연결 전·조회 실패·조회 중에는 멤버십 상태에 맞는 이름(시작·변경)을 쓰지 않는다.
  const off = view({ status: 'unavailable' })
  assert.doesNotMatch(
    off.slice(off.indexOf('data-membership-actions')),
    /시작하기|변경하기/,
  )
  assert.match(off, /멤버십 관리하기/)
})

test('P03은 가격·결제 방식·환불을 만들지 않고 결제 내역·카드 정보도 보이지 않는다', () => {
  for (const state of [
    { status: 'unavailable' },
    ready(freeInfo),
    ready(basicInfo),
  ]) {
    const html = view(state)
    assert.match(html, /요금과 결제 방식은 아직 정해지지 않았어요/)
    assert.match(html, /표시할 결제 내역이 없어요/)
    assert.match(html, /내역을 예시로 만들어 보여 주지 않아요/)
    assert.match(html, /자동으로 결제되지 않아요/)
    assert.doesNotMatch(html, PRICE)
  }
})

test('P03 비교: 무료 최초 5회·베이직 월 30회·프로 월 100회이고 유료 횟수는 권장안(최종 승인 전)으로 표시되며 현재 멤버십이 표시된다', () => {
  const html = view({ status: 'unavailable' })
  assert.match(html, /무료·베이직·프로 비교/)
  assert.equal((html.match(/data-membership-plan="/g) ?? []).length, 3)
  assert.match(
    html,
    /data-membership-plan="free"[\s\S]*?AI 가입 후 최초 총 5회[\s\S]*?월간 초기화 없음/,
  )
  assert.match(html, /data-membership-plan="basic"[\s\S]*?AI 매월 30회/)
  assert.match(html, /data-membership-plan="pro"[\s\S]*?AI 매월 100회/)
  assert.equal((html.match(/권장안 · 최종 승인 전/g) ?? []).length, 2)
  assert.match(html, /가격과 결제 방식도 아직 정해지지 않았어요/)
  // 서버에서 확인하지 않으면 "현재 멤버십" 표시는 없다(제목 "현재 멤버십"과 구분해 칩만 센다).
  assert.doesNotMatch(html, /<span[^>]*>현재 멤버십<\/span>/)
  // 서버에서 확인한 멤버십 한 곳에만 "현재 멤버십" 칩이 붙는다.
  const basic = view(ready(basicInfo))
  assert.equal((basic.match(/<span[^>]*>현재 멤버십<\/span>/g) ?? []).length, 1)
  assert.match(
    basic,
    /data-membership-plan="basic"[\s\S]*?현재 멤버십[\s\S]*?data-membership-plan="pro"/,
  )
  // 옛 비교표 표현은 없다.
  assert.doesNotMatch(html, /횟수 제한 없음|합산 5회 체험/)
})

test('P03은 기존 AI 기능 정의(AI_FEATURES)와 링크를 재사용하되 상품별 이용 조건 문구는 쓰지 않는다', () => {
  const html = view({ status: 'unavailable' })
  assert.equal(
    (html.match(/data-membership-feature="/g) ?? []).length,
    aiContent.AI_FEATURES.length,
  )
  for (const feature of aiContent.AI_FEATURES) {
    assert.ok(html.includes(feature.title), feature.title)
    for (const link of feature.links ?? [])
      assert.ok(hrefs(html).includes(link.to), link.to)
  }
  assert.doesNotMatch(html, /이용 조건:/)
  assert.ok(hrefs(html).includes('/ai/exercise/plan'))
  assert.ok(hrefs(html).includes('/ai/meal'))
  assert.ok(hrefs(html).includes('/ai/weekly-report'))
})

test('P03 FAQ: 확정된 정책만 쓰고 접힌 채로 시작한다', () => {
  const html = view({ status: 'unavailable' })
  assert.match(html, /무료 체험 FAQ/)
  assert.equal(
    (html.match(/<details/g) ?? []).length,
    mem.MEMBERSHIP_FAQ.length,
  )
  assert.match(html, /가입 후 최초 총 5회까지 쓸 수 있어요/)
  assert.match(html, /월간 초기화는 없고/)
  assert.match(html, /베이직·프로의 사용 횟수는 매월 갱신돼요/)
  assert.doesNotMatch(html, /<details[^>]*open/)
})

// ── 진입점·라우트·보호 ────────────────────────────────────────────────────
test('P09 설정: 멤버십 관리가 P03 링크이고 "이전"이 설정으로 돌아온다', () => {
  const item = menu.SETTINGS_MENU_GROUPS.flatMap((g) => g.items).find(
    (i) => i.screenId === 'P03',
  )
  assert.deepEqual(
    [item.to, item.returnHere, item.label],
    ['/settings/membership', true, '멤버십 관리'],
  )
})

test('P01 멤버십 상태: 일반은 "멤버십 보기"·유료는 "멤버십 관리"로 P03에 연결되고 가격·결제 표현이 없다', () => {
  assert.equal(dest.MY_DESTINATIONS.membership.to, '/settings/membership')
  const free = render(createElement(Summary, { entitlement: 'free' }))
  assert.match(free, /href="\/settings\/membership"[^>]*>[\s\S]*멤버십 보기/)
  const paid = render(createElement(Summary, { entitlement: 'pro' }))
  assert.match(paid, /href="\/settings\/membership"[^>]*>[\s\S]*멤버십 관리/)
  for (const html of [free, paid])
    assert.doesNotMatch(html, /[\d,]+\s?원|결제일|다음 결제/)
})

test('라우트: P03은 승인 경로·회원 전용(AuthGate)·하단 탭 마이·상위 P09·h1 직접', () => {
  const router = readFileSync('src/app/router.tsx', 'utf8')
  const at = router.indexOf("path: 'settings/membership'")
  assert.ok(at > 0)
  const block = router.slice(at, router.indexOf('} satisfies RouteHandle', at))
  assert.match(block, /screenId: 'P03'/)
  assert.match(block, /tab: 'my'/)
  assert.match(block, /ownH1: true/)
  assert.match(block, /parent: '\/settings'/)
  const before = router.slice(0, at)
  assert.ok(
    before.lastIndexOf('element: <AuthGate />') >
      before.lastIndexOf('element: <AuthOrExperienceGate />'),
  )
})

test('P03은 계정별로 분리되고(key) 서버 호출·저장소·결제 SDK·PIN·신체 정보 코드를 쓰지 않으며 구독 상태를 저장하지 않는다', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const read = (file) => strip(readFileSync(file, 'utf8'))
  const page = read('src/pages/MembershipSettingsPage.tsx')
  assert.match(page, /key=\{user\.id\}/)
  assert.match(page, /if \(!user\) return null/)
  for (const file of [
    'src/membership/membership.ts',
    'src/membership/useMembership.ts',
    'src/pages/MembershipSettingsPage.tsx',
    'src/components/settings/membership/MembershipSettingsView.tsx',
  ]) {
    const code = read(file)
    assert.doesNotMatch(
      code,
      /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console\.|\/api\/v1|stripe|toss|iamport|payment-intent|setItem/i,
      file,
    )
    assert.doesNotMatch(
      code,
      /from '[^']*(body-access|body-measurements|exercise-goal|pin-settings|health-goal)[^']*'/,
      file,
    )
  }
  // 이 앱은 구독 상태를 바꾸는 호출(생성·변경·해지)을 계약에 두지 않는다.
  assert.doesNotMatch(
    read('src/membership/membership.ts'),
    /subscribe\(|cancelSubscription|upgrade|startCheckout|createPayment/i,
  )
  // 사용량을 차감·갱신하는 코드가 없다(잔여 횟수와 갱신일은 서버 값을 그대로 보인다).
  for (const file of [
    'src/membership/membership.ts',
    'src/membership/useMembership.ts',
    'src/components/settings/membership/MembershipSettingsView.tsx',
  ])
    assert.doesNotMatch(
      read(file),
      /remaining\s*(-=|--)|--\s*remaining|decrement|consumeUsage|deductUsage|useUsage|setUsage|setRemaining/i,
      file,
    )
})
