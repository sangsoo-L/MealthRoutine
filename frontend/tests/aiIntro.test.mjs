import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// `/ai`(I01) 진입 구조 테스트: 로그인 상태에 따라 비회원 AI 소개 랜딩 / 회원 전용 AI 서비스 홈으로 나뉜다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Entry
let Page
let Landing
let Home
let Content
let AuthContext
let ReturnTo

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Entry = await server.ssrLoadModule('/src/ai/aiEntry.ts')
  Page = (await server.ssrLoadModule('/src/pages/AiPage.tsx')).default
  Landing = (await server.ssrLoadModule('/src/components/ai/AiLandingView.tsx'))
    .default
  Home = (await server.ssrLoadModule('/src/components/ai/AiHomeView.tsx'))
    .default
  Content = await server.ssrLoadModule('/src/components/ai/aiIntroContent.ts')
  ;({ AuthContext } = await server.ssrLoadModule('/src/auth/authContext.ts'))
  ReturnTo = await server.ssrLoadModule('/src/auth/returnTo.ts')
})
after(async () => {
  await server.close()
})

const noop = () => {}
const renderView = (View) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(View)))
const renderPage = (status) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext,
        {
          value: {
            status,
            user: null,
            login: async () => ({ ok: false, reason: 'unavailable' }),
            logout: noop,
          },
        },
        createElement(Page),
      ),
    ),
  )
const hrefs = (html) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
const featureBlock = (html, key) =>
  html.match(new RegExp(`data-ai-feature="${key}"[\\s\\S]*?</li>`))[0]

test('진입 판정: 회원은 홈, 비회원은 랜딩이고 확인 중·알 수 없는 상태는 어느 쪽도 아니다', () => {
  assert.equal(Entry.aiEntryKind('authenticated'), 'member')
  assert.equal(Entry.aiEntryKind('unauthenticated'), 'guest')
  for (const status of ['loading', '', 'unknown', undefined, null]) {
    assert.equal(Entry.aiEntryKind(status), 'pending', String(status))
  }
})

test('`/ai` 분기: 같은 페이지가 상태에 따라 랜딩/홈을 그리고 확인 중에는 아무것도 그리지 않는다', () => {
  const guest = renderPage('unauthenticated')
  assert.match(guest, /<h1[^>]*>밀스루틴 AI 코칭<\/h1>/)
  assert.match(guest, /data-ai-cta="guest"/)
  assert.doesNotMatch(guest, /AI 서비스 홈/)
  const member = renderPage('authenticated')
  assert.match(member, /<h1[^>]*>AI 서비스 홈<\/h1>/)
  assert.match(member, /data-ai-cta="member"/)
  assert.doesNotMatch(member, /밀스루틴 AI 코칭|로그인하기|회원가입/)
  // 인증 상태 확인 중: 잘못된 화면이 잠깐 보이지 않는다.
  assert.equal(renderPage('loading'), '')
  for (const html of [guest, member])
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1)
})

test('비회원 랜딩: 히어로·기능 4종·이용 흐름·무료 안내·고정 예시 링크·로그인/가입이 있고 제공 상태를 구분한다', () => {
  const html = renderView(Landing)
  assert.match(html, /제공 예정/)
  assert.match(html, /기본 운동·식단 기록과 기본 주간 리포트를 무료/)
  // 기능 4종과 상태
  for (const [key, status] of [
    ['exercise', 'guide'],
    ['meal', 'pending'],
    ['photo', 'pending'],
    ['weekly', 'available'],
  ]) {
    assert.match(
      html,
      new RegExp(`data-ai-feature="${key}" data-ai-status="${status}"`),
    )
  }
  assert.equal((html.match(/>준비 중</g) ?? []).length, 3)
  assert.equal((html.match(/>이용 가능</g) ?? []).length, 1)
  for (const title of [
    'AI 운동 플랜',
    'AI 식단 추천',
    '음식 사진 분석',
    '주간 기록 리포트',
  ])
    assert.ok(html.includes(title), title)
  // 이용 흐름 4단계, 무료 안내, 참고용 안내
  assert.match(html, /이용 흐름/)
  for (const step of ['로그인', '조건 선택', '초안 수정', '기록·회고'])
    assert.ok(html.includes(step), step)
  assert.match(html, /기본 기록은 무료예요/)
  assert.match(html, /참고용이며 의료적 진단을 대신하지 않아요/)
  // 고정 예시(I02) 링크
  assert.match(html, /data-ai-example-link/)
  assert.match(html, /AI 운동 플랜 미리보기/)
})

test('비회원 랜딩: 회원 전용 화면으로는 링크하지 않고(로그인 안내만), 미구현 기능에는 링크·버튼이 없다', () => {
  const html = renderView(Landing)
  // 이동 링크: 운동 플랜 안내 카드, 고정 예시 보기(둘 다 I02), 로그인, 회원가입
  assert.deepEqual(hrefs(html), [
    '/ai/exercise',
    '/ai/exercise',
    '/login',
    '/signup',
  ])
  assert.doesNotMatch(html, /\/ai\/weekly-report/)
  assert.doesNotMatch(html, /<button/)
  // 주간 리포트는 이용 가능하지만 로그인 후다.
  const weekly = featureBlock(html, 'weekly')
  assert.match(weekly, /이용 가능/)
  assert.match(weekly, /data-ai-login-note/)
  assert.match(weekly, /로그인 후 이용할 수 있어요/)
  assert.ok(!weekly.includes('<a '))
  // 식단·사진은 준비 중이고 링크가 없다.
  for (const key of ['meal', 'photo']) {
    const block = featureBlock(html, key)
    assert.match(block, /준비 중/)
    assert.ok(!block.includes('<a '))
  }
  // 운동 플랜은 기능이 준비 중이라는 점을 유지한다(안내 링크만).
  const exercise = featureBlock(html, 'exercise')
  assert.match(exercise, /준비 중/)
  assert.doesNotMatch(exercise, /이용 가능/)
  // 로그인 링크는 /ai로 복귀하고 그 값은 기존 returnTo 검증을 통과한다.
  assert.equal(ReturnTo.safeReturnTo({ returnTo: '/ai' }), '/ai')
  assert.match(
    read('../src/components/ai/AiLandingView.tsx'),
    /state=\{\{ returnTo: '\/ai' \}\}/,
  )
})

test('회원 홈: 기능 카드 4종과 상태(운동 플랜은 로컬 예시), 연결(I02·I02-1·I05)과 준비 중 유지, 상태 안내·이용 흐름·이용 범위가 있다', () => {
  const html = renderView(Home)
  for (const [key, status] of [
    ['exercise', 'local'],
    ['meal', 'pending'],
    ['photo', 'pending'],
    ['weekly', 'available'],
  ]) {
    assert.match(
      html,
      new RegExp(`data-ai-feature="${key}" data-ai-status="${status}"`),
    )
  }
  // 연결: 운동 플랜 안내(I02)와 조건 선택(I02-1), 주간 리포트(I05), 기록 화면. 식단 추천·사진 분석은 링크 없음.
  assert.deepEqual(hrefs(html), [
    '/ai/exercise',
    '/ai/exercise/plan',
    '/ai/weekly-report',
    '/records/exercise',
    '/records/meal',
  ])
  assert.ok(!featureBlock(html, 'meal').includes('<a '))
  assert.ok(!featureBlock(html, 'photo').includes('<a '))
  assert.doesNotMatch(html, /<button/)
  assert.match(html, /상태 안내/)
  assert.match(html, /지금 바로 이용할 수 있어요/)
  assert.match(html, /로컬 예시로 체험할 수 있어요\. 실제 AI 추천은 아니에요/)
  assert.match(html, /아직 제공 전이에요/)
  // 운동 플랜 카드는 "로컬 예시"로 구분하고 "이용 가능"(주간 리포트)과 섞이지 않는다.
  const exercise = featureBlock(html, 'exercise')
  assert.match(exercise, /로컬 예시/)
  assert.doesNotMatch(exercise, /이용 가능/)
  assert.match(exercise, /운동 조건 선택하고 예시 받기/)
  assert.match(featureBlock(html, 'weekly'), /이용 가능/)
  assert.match(html, /이용 흐름/)
  assert.match(html, /합산 5회 체험/)
  assert.match(html, /기본 기록과 기본 주간 리포트는 무료/)
  assert.match(html, /자동으로 결제되지 않아요/)
  assert.match(html, /참고용이며 의료적 진단을 대신하지 않아요/)
  assert.match(html, /AI 기능은 준비 중이에요/)
  assert.doesNotMatch(html, /남은 체험|체험 \d회 남/)
})

test('확장성: 두 화면은 같은 기능 목록(AI_FEATURES)에서 그리고 새 기능은 항목 하나로 더해진다', () => {
  const keys = Content.AI_FEATURES.map((f) => f.key)
  assert.deepEqual(keys, ['exercise', 'meal', 'photo', 'weekly'])
  assert.equal(new Set(keys).size, keys.length)
  for (const View of [Landing, Home]) {
    const html = renderView(View)
    assert.deepEqual(
      [...html.matchAll(/data-ai-feature="(\w+)"/g)].map((m) => m[1]),
      keys,
    )
  }
  // 회원 전용 링크 표시와 상태가 데이터에 있다.
  const feature = (key) => Content.AI_FEATURES.find((f) => f.key === key)
  assert.deepEqual(
    feature('weekly').links.map((l) => [l.to, l.memberOnly]),
    [['/ai/weekly-report', true]],
  )
  assert.deepEqual(
    feature('exercise').links.map((l) => [l.to, l.memberOnly]),
    [
      ['/ai/exercise', false],
      ['/ai/exercise/plan', true],
    ],
  )
  assert.deepEqual(Content.STATUS_LABEL, {
    available: '이용 가능',
    local: '로컬 예시',
    guide: '준비 중',
    pending: '준비 중',
  })
  // 로컬 예시는 회원에게만 열려 있어 비회원에게는 안내만 가능한 상태(guide)로 보인다.
  assert.equal(Content.effectiveStatus(feature('exercise'), 'member'), 'local')
  assert.equal(Content.effectiveStatus(feature('exercise'), 'guest'), 'guide')
  assert.equal(Content.effectiveStatus(feature('weekly'), 'guest'), 'available')
  assert.equal(Content.effectiveStatus(feature('meal'), 'member'), 'pending')
})

test('임의 결과 없음: 추천 운동·영양값·점수·남은 횟수 같은 수치를 만들지 않는다', () => {
  for (const View of [Landing, Home]) {
    const text = renderView(View)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
    assert.doesNotMatch(text, /\d+\s*kcal|\d+\s*점|\d+\s*세트|\d+\s*PT/)
  }
  // 허용한 숫자는 합산 5회뿐이다(단계 번호는 화면에서 만든다).
  const joined = JSON.stringify([
    Content.AI_FEATURES,
    Content.AI_COMMON,
    Content.AI_HOME,
    Content.AI_LANDING,
  ])
  assert.deepEqual([...new Set(joined.match(/\d+/g) ?? [])], ['5'])
})

test('범위 준수: 저장소·체험 횟수 저장·API 호출이 없고 라우트·기존 화면은 그대로다', () => {
  for (const file of [
    '../src/components/ai/AiLandingView.tsx',
    '../src/components/ai/AiHomeView.tsx',
    '../src/components/ai/AiFeatureCard.tsx',
    '../src/components/ai/aiIntroContent.ts',
    '../src/ai/aiEntry.ts',
    '../src/pages/AiPage.tsx',
  ]) {
    assert.doesNotMatch(
      code(file),
      /indexedDB|localStorage|sessionStorage|fetch\(|\/api\/|getExercisePlanAccess|getPhotoAnalysisAccess/,
      file,
    )
  }
  const router = read('../src/app/router.tsx')
  const route = router.slice(router.indexOf("path: 'ai',"))
  assert.match(route.slice(0, 400), /element: <AiPage \/>/)
  assert.match(route.slice(0, 600), /screenId: 'I01'/)
  assert.match(route.slice(0, 600), /tab: 'ai'/)
  assert.match(route.slice(0, 600), /ownH1: true/)
  assert.doesNotMatch(route.slice(0, 600), /AuthGate/)
  // I02는 공개 그대로, I05·I05-1은 AuthGate 안(회원 전용) 그대로다.
  const i02 = router.slice(router.indexOf("path: 'ai/exercise',"))
  assert.doesNotMatch(i02.slice(0, 600), /AuthGate/)
  const gate = router.indexOf('element: <AuthGate />')
  assert.ok(router.indexOf("path: 'ai/weekly-report',") > gate)
  assert.ok(router.indexOf("path: 'ai/weekly-report/score',") > gate)
  // 하단 AI 탭과 홈 바로가기는 그대로이고 W12 AI 카드는 로컬 예시로 연결된다.
  assert.match(read('../src/app/routeHandle.ts'), /to: '\/ai'/)
  assert.match(read('../src/components/home/homeContent.ts'), /to: '\/ai'/)
  assert.match(
    read('../src/pages/ExerciseMethodPage.tsx'),
    /to=\{PATH_AI_PLAN\}/,
  )
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
})
