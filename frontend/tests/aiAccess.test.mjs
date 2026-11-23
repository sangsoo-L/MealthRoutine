// 통합 AI 멤버십 정책 충돌 정리: AI 신규 요청 접근 상태는 멤버십 상품 유형이 아니라 서버가 확인한 통합 AI 사용량에서만 나온다.
// - 서버 미연결·조회 중·실패·사용량 없음·계약 불일치에서는 권한을 부여하지 않는다(unknown).
// - 서버가 확인한 잔여가 0이면 exhausted, 1 이상이면 available(무료 회원도 같다).
// - 옛 운동·식단·종합 멤버십 구분(Entitlement 값·접근 함수)이 없다.
// 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server, access, mem, entitlements, accounts
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  access = await load('/src/membership/aiAccess.ts')
  mem = await load('/src/membership/membership.ts')
  entitlements = await load('/src/auth/entitlements.ts')
  accounts = await load('/src/auth/dev/devAccounts.ts')
})
after(async () => {
  await server?.close()
})

const ready = (info) => ({ status: 'ready', info })
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
const read = (file) => strip(readFileSync(file, 'utf8'))

test('AI 접근 상태: 서버가 확인한 사용량으로만 정해지고 확인하지 못하면 항상 unknown이다', () => {
  const cases = [
    [{ status: 'loading' }, 'unknown'],
    [{ status: 'unavailable' }, 'unknown'],
    [{ status: 'error' }, 'unknown'],
    // 멤버십 종류만 있고 사용량이 없으면 유료 멤버십이어도 권한을 부여하지 않는다.
    [ready({ plan: 'pro' }), 'unknown'],
    [ready({ plan: 'basic', usage: null }), 'unknown'],
    // 무료 회원도 서버가 확인한 잔여가 있으면 이용할 수 있다.
    [ready({ plan: 'free', usage: { limit: 5, remaining: 5 } }), 'available'],
    [ready({ plan: 'free', usage: { limit: 5, remaining: 1 } }), 'available'],
    [ready({ plan: 'free', usage: { limit: 5, remaining: 0 } }), 'exhausted'],
    [ready({ plan: 'basic', usage: { limit: 30, remaining: 9 } }), 'available'],
    // 유료 멤버십이어도 잔여가 0이면 신규 요청은 제한된다.
    [ready({ plan: 'pro', usage: { limit: 100, remaining: 0 } }), 'exhausted'],
  ]
  for (const [state, expected] of cases)
    assert.equal(
      access.aiAccessFromState(state),
      expected,
      JSON.stringify(state),
    )
})

test('서버 연결이 없으면 AI 접근 상태는 unknown이다(연결은 아직 null)', () => {
  assert.equal(mem.MEMBERSHIP_SOURCE, null)
  assert.equal(mem.createMembershipSource(), null)
})

test('안내 문구: 소진은 신규 AI 요청만 제한하고 기록·조회는 계속 쓸 수 있으며, 확인 전 안내에는 숫자 잔여를 만들지 않는다', () => {
  assert.match(access.AI_EXHAUSTED_TEXT.title, /AI 사용 횟수를 모두 사용했어요/)
  assert.match(access.AI_EXHAUSTED_TEXT.body, /공통 사용 횟수/)
  assert.match(
    access.AI_EXHAUSTED_TEXT.body,
    /기록과 조회는 횟수와 상관없이 계속 쓸 수 있어요/,
  )
  assert.match(access.AI_USAGE_NOTE, /최초 5회/)
  assert.match(access.AI_USAGE_NOTE, /월간 초기화는 없어요/)
  assert.doesNotMatch(access.AI_USAGE_NOTE, /\d+회 남|남은 횟수[^.]*\d/)
})

test('옛 운동·식단·종합 멤버십 구분이 없다: Entitlement는 일반·베이직·프로이고 접근 함수는 없어졌다', () => {
  assert.deepEqual(Object.keys(entitlements.ENTITLEMENT_LABEL), [
    'free',
    'basic',
    'pro',
  ])
  assert.equal(entitlements.getExercisePlanAccess, undefined)
  assert.equal(entitlements.getPhotoAnalysisAccess, undefined)
  for (const label of Object.values(entitlements.ENTITLEMENT_LABEL))
    assert.doesNotMatch(label, /운동 멤버십|식단 멤버십|종합/)
  // 개발용 계정: 식별자(저장 키·테스트용)는 그대로이고 멤버십 유형만 일반·베이직·프로로 대응한다.
  assert.deepEqual(
    accounts.DEV_ACCOUNTS.map((a) => [a.id, a.entitlement]),
    [
      ['free', 'free'],
      ['exercise', 'basic'],
      ['meal', 'basic'],
      ['full', 'pro'],
    ],
  )
})

test('I02-1·I04 화면과 페이지는 멤버십 상품 유형(entitlement)을 읽지 않고 서버 사용량 상태만 쓴다', () => {
  for (const file of [
    'src/pages/AiExercisePlanPage.tsx',
    'src/pages/AiPhotoPage.tsx',
    'src/components/ai/exercise/ExercisePlanFlowView.tsx',
    'src/components/ai/photo/PhotoUploadView.tsx',
  ]) {
    const code = read(file)
    assert.doesNotMatch(
      code,
      /entitlement|getExercisePlanAccess|getPhotoAnalysisAccess|auth\/entitlements/,
      file,
    )
  }
  assert.match(read('src/pages/AiExercisePlanPage.tsx'), /useAiAccess\(\)/)
  assert.match(read('src/pages/AiPhotoPage.tsx'), /useAiAccessInfo\(\)/)
})

test('접근 상태 코드는 사용량을 계산·차감·저장하지 않고 서버 호출·저장소를 쓰지 않는다', () => {
  for (const file of [
    'src/membership/aiAccess.ts',
    'src/membership/useAiAccess.ts',
  ]) {
    const code = read(file)
    assert.doesNotMatch(
      code,
      /fetch\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|setItem|remaining\s*(-=|--)|--\s*remaining|decrement|deductUsage|consumeUsage/i,
      file,
    )
  }
})

test('옛 멤버십 상품 구분 문구가 AI 소개·랜딩·P01 요약 코드에 남아 있지 않다', () => {
  for (const file of [
    'src/components/ai/aiIntroContent.ts',
    'src/components/landing/landingContent.ts',
    'src/components/mypage/MembershipSummary.tsx',
    'src/auth/entitlements.ts',
    'src/auth/authTypes.ts',
  ])
    assert.doesNotMatch(
      readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
        .replace(/^\s*\*.*$/gm, ''),
      /운동 멤버십|식단 멤버십|종합 멤버십|유료 운동·종합|유료 식단·종합|운동·종합 권한|식단·종합 권한/,
      file,
    )
})

test('서버가 확인한 잔여 횟수는 서버 값 그대로이고 확인 전에는 null이다(숫자를 만들지 않는다)', () => {
  assert.equal(
    access.aiUsageRemaining(
      ready({ plan: 'free', usage: { limit: 5, remaining: 3 } }),
    ),
    3,
  )
  assert.equal(
    access.aiUsageRemaining(
      ready({ plan: 'pro', usage: { limit: 100, remaining: 0 } }),
    ),
    0,
  )
  for (const state of [
    { status: 'loading' },
    { status: 'unavailable' },
    { status: 'error' },
    ready({ plan: 'basic' }),
    ready({ plan: 'basic', usage: null }),
  ])
    assert.equal(access.aiUsageRemaining(state), null, JSON.stringify(state))
})
