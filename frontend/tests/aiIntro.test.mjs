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
const featureBlock2 = (html, key) =>
  html.match(new RegExp(`data-ai-feature="${key}"[\\s\\S]*?</section>`))[0]
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
  assert.match(guest, /<h1[^>]*>AI 코칭<\/h1>/)
  assert.match(guest, /data-ai-cta="guest"/)
  assert.doesNotMatch(guest, /나에게 필요한 기능을 선택해 보세요/)
  const member = renderPage('authenticated')
  assert.match(member, /<h1[^>]*>AI 코칭<\/h1>/)
  assert.match(member, /data-ai-cta="member"/)
  assert.doesNotMatch(member, /밀스루틴 AI 코칭|로그인하기|회원가입/)
  // 인증 상태 확인 중: 잘못된 화면이 잠깐 보이지 않는다.
  assert.equal(renderPage('loading'), '')
  for (const html of [guest, member])
    assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1)
})

test('비회원 랜딩: 제목·삽화 → 운동·식단 카드 → 기록 목록 → 접이식 안내 → 의료 안내·가입 순서이고 기능은 한 번씩만 나온다', () => {
  const html = renderView(Landing)
  const order = [
    '>AI 코칭<',
    'data-ai-preview',
    'data-ai-feature="meal"',
    '기록을 더 쉽게',
    'data-ai-feature="weekly"',
    'data-ai-feature="photo"',
    '이용 방법과 체험 안내',
    '의료적 진단을 대신하지 않아요',
    '회원가입',
  ].map((text) => html.indexOf(text))
  assert.ok(
    order.every((i) => i >= 0),
    JSON.stringify(order),
  )
  assert.deepEqual(
    order,
    [...order].sort((x, y) => x - y),
  )
  // 이전 구성(큰 소개 카드·내부 예시 박스·운동명 3개·준비 중 목록 카드)은 없다.
  assert.doesNotMatch(
    html,
    /제공 예정|data-ai-hero-icons|밀스루틴 AI 코칭|준비 중인 AI 기능|월 푸시업|글루트 브리지|플랭크|AI 운동 플랜 미리보기/,
  )
  // 상단: 제목과 설명, 장식 삽화(접근성에서 숨김, 원본 비율 속성)
  assert.match(html, /<h1[^>]*>AI 코칭<\/h1>/)
  assert.match(html, /운동 플랜을 미리 보고, 한 주의 기록을 확인해요/)
  const img = html.match(/<img [^>]*data-ai-hero[^>]*>/)[0]
  assert.match(img, /alt=""/)
  assert.match(img, /aria-hidden="true"/)
  assert.match(img, /width="576"[^>]*height="457"|height="457"[^>]*width="576"/)
  // 운동 카드: 카드 전체가 하나의 링크이고 안에 다른 링크·버튼이 없다. 조건 요약은 I02와 같은 데이터다.
  const exercise = html.match(/<a [^>]*data-ai-preview[\s\S]*?<\/a>/)[0]
  assert.equal((exercise.match(/<a /g) ?? []).length, 1)
  assert.doesNotMatch(exercise, /<button/)
  assert.match(exercise, /AI 운동 플랜/)
  assert.match(exercise, />고정 예시</)
  assert.match(exercise, /맨몸 · 10분 · 초급/)
  assert.match(exercise, /예시 보기/)
  assert.match(exercise, /bg-exercise-soft/)
  assert.match(exercise, /text-exercise/)
  // 식단 카드: 준비 중이고 링크·화살표·클릭 효과가 없다. 식단 색을 쓴다.
  const meal = html
    .match(/data-ai-feature="meal"[\s\S]*?<\/ul>/)[0]
    .split('</li>')[0]
  assert.match(meal, /AI 식단 추천/)
  assert.match(meal, /목표에 맞춘 내일 식단/)
  assert.match(meal, />준비 중</)
  assert.match(meal, /bg-meal-soft/)
  assert.match(meal, /text-meal/)
  assert.doesNotMatch(meal, /<a |chevron|cursor-pointer|hover:|<button/)
  assert.match(
    html,
    /운동 플랜은 고정 예시예요\. 실제 AI 추천은 준비 중이에요\./,
  )
  // 기록 목록: 주간 리포트(기본 무료·로그인 후 이용)와 음식 사진 분석(준비 중)
  const records = html.match(
    /aria-labelledby="ai-records-title"[\s\S]*?<\/section>/,
  )[0]
  assert.match(records, /<h2[^>]*>기록을 더 쉽게<\/h2>/)
  assert.match(records, /주간 기록 리포트/)
  assert.match(records, /AI 없이 제공 · 로그인 후 이용/)
  assert.match(records, />기본 무료</)
  assert.match(records, /로그인하고 리포트 보기/)
  assert.match(records, /음식 사진 분석/)
  assert.match(records, /사진을 식단 입력 초안으로/)
  const photo = records.match(/data-ai-feature="photo"[\s\S]*?<\/li>/)[0]
  assert.match(photo, />준비 중</)
  assert.doesNotMatch(photo, /<a |chevron|cursor-pointer|hover:|<button/)
  // 네 기능은 각각 한 번씩만 나온다(접이식 안내의 권한 목록은 제외).
  const visible = html.slice(0, html.indexOf('data-ai-guide'))
  for (const title of [
    'AI 운동 플랜',
    'AI 식단 추천',
    '음식 사진 분석',
    '주간 기록 리포트',
  ])
    assert.equal(visible.split(title).length - 1, 1, title)
  // 접이식 안내: 이용 흐름 4단계·무료·사용 횟수·최초 5회·식단 목표 조건·사진 로그인 조건·준비 중 안내
  const guide = html.match(/data-ai-guide[\s\S]*?<\/details>/)[0]
  assert.match(guide, /<summary/)
  for (const step of ['로그인', '조건 선택', '초안 수정', '기록·회고'])
    assert.ok(guide.includes(step), step)
  assert.match(guide, /기본 기록과 기본 주간 리포트는 무료예요/)
  assert.match(
    guide,
    /무료 AI 체험은 가입 후 최초 5회이고 월간 초기화는 없어요/,
  )
  assert.match(guide, /자동으로 결제되지 않아요/)
  assert.match(
    guide,
    /식단 목표가 있어야 이용할 수 있고, 추천과 알레르기 정보 연결은 준비 중이에요/,
  )
  assert.match(guide, /음식 사진 분석은 로그인한 회원만 이용할 수 있어요/)
  assert.match(guide, /운동·식단 AI 공통 사용 횟수/)
  assert.match(guide, /AI 심층 코칭은 운동·식단 AI 공통 사용 횟수/)
  assert.doesNotMatch(
    guide,
    /유료 운동·종합 권한|운동 멤버십|식단 멤버십|종합 멤버십/,
  )
  // 의료 안내는 접이식 밖에 있고 긴 안내는 본문 크기(14px)다.
  const footer = html.slice(html.indexOf('<footer'))
  assert.match(footer, /참고용이며 의료적 진단을 대신하지 않아요/)
  assert.match(footer, /text-body/)
  assert.doesNotMatch(footer, /text-support/)
})

test('비회원 랜딩: 공통 글자·모서리 토큰만 쓰고(22·15·14·12px, 12px 모서리) 예외 크기·큰 모서리를 쓰지 않는다', () => {
  const html = renderView(Landing)
  assert.match(html, /<h1 class="text-app-title[^"]*font-semibold/)
  assert.match(html, /<h2[^>]*class="text-section-title[^"]*font-semibold/)
  assert.match(html, /text-body/)
  assert.match(html, /text-support/)
  assert.match(html, /rounded-card/)
  assert.doesNotMatch(
    html,
    /text-metric|text-xl|text-lg|text-base|text-sm\b|text-2xl|rounded-\[|rounded-2xl|rounded-3xl|shadow-/,
  )
  // 설명은 400, 제목·행 제목은 600이다(font-bold 등 다른 굵기 없음).
  assert.doesNotMatch(html, /font-bold|font-medium|font-extrabold/)
})

test('비회원 랜딩: 이동은 고정 예시(I02)·로그인·회원가입뿐이고 회원 전용 화면과 준비 중 기능에는 링크·버튼이 없다', () => {
  const html = renderView(Landing)
  assert.deepEqual(hrefs(html), ['/ai/exercise', '/login', '/signup'])
  assert.equal((html.match(/href="\/ai\/exercise"/g) ?? []).length, 1)
  assert.equal((html.match(/href="\/login"/g) ?? []).length, 1)
  assert.doesNotMatch(html, /\/ai\/weekly-report"/)
  assert.doesNotMatch(html, /<button/)
  // 주간 리포트 행이 로그인 링크이고, 접근성 이름에 "로그인하고 리포트 보기"가 들어 있다.
  const weekly = html.match(/<a [^>]*data-ai-feature="weekly"[\s\S]*?<\/a>/)[0]
  assert.match(weekly, /data-ai-status="available"/)
  assert.match(weekly, /href="\/login"/)
  assert.match(weekly, /sr-only[^>]*>, 로그인하고 리포트 보기</)
  // 비회원에게 운동 플랜·식단은 준비 중(guide) 상태다.
  assert.match(html, /data-ai-feature="exercise" data-ai-status="guide"/)
  assert.match(html, /data-ai-feature="meal" data-ai-status="guide"/)
  // 로그인은 로그인 후 주간 리포트로 돌아오게 하고 그 값은 기존 returnTo 검증을 통과한다.
  assert.equal(
    ReturnTo.safeReturnTo({ returnTo: '/ai/weekly-report' }),
    '/ai/weekly-report',
  )
  assert.match(
    read('../src/components/ai/AiLandingView.tsx'),
    /state=\{\{ returnTo: '\/ai\/weekly-report' \}\}/,
  )
  // "로그인하면 AI 추천을 바로 이용"으로 오해할 문구는 없다.
  assert.doesNotMatch(html, /바로 이용|AI 기능이 준비되면 로그인한 회원이 바로/)
})

test('회원 허브: 대표(운동 플랜)→보조(리포트·식단)→준비 중(사진) 구성, 상태·연결·이용 조건 유지, 안내는 접이식이다', () => {
  const html = renderView(Home)
  for (const [key, status] of [
    ['exercise', 'local'],
    ['meal', 'guide'],
    ['photo', 'pending'],
    ['weekly', 'available'],
  ]) {
    assert.match(
      html,
      new RegExp(`data-ai-feature="${key}" data-ai-status="${status}"`),
    )
  }
  // 순서: 대표 카드 → 주간 리포트 → 식단 → 준비 중 → 접이식 안내 → 기록 바로가기
  const order = [
    'data-ai-main',
    'data-ai-feature="weekly"',
    'data-ai-feature="meal"',
    'data-ai-feature="photo"',
    'data-ai-guide',
    'data-ai-cta="member"',
  ].map((text) => html.indexOf(text))
  assert.ok(
    order.every((i) => i >= 0),
    JSON.stringify(order),
  )
  assert.deepEqual(
    order,
    [...order].sort((x, y) => x - y),
  )
  // 연결: 운동 플랜 조건 선택(I02-1)·안내(I02), 주간 리포트(I05), 식단 플랜(I03), 사진 고르기(I04, 2026-11-22 추가), 기록 화면.
  assert.deepEqual(hrefs(html), [
    '/ai/exercise/plan',
    '/ai/exercise',
    '/ai/weekly-report',
    '/ai/meal',
    '/ai/meal/photo',
    '/records/exercise',
    '/records/meal',
  ])
  assert.doesNotMatch(html, /<button/)
  // 대표 카드: 로컬 예시임을 밝히고 채움 버튼은 하나뿐이다. "이용 가능"과 섞이지 않는다.
  const exercise = featureBlock2(html, 'exercise')
  assert.match(exercise, /로컬 예시/)
  assert.match(exercise, /실제 AI 추천이 아닌 로컬 예시예요/)
  assert.doesNotMatch(exercise, /이용 가능/)
  assert.match(exercise, /운동 조건 선택하고 예시 받기/)
  assert.match(exercise, /AI 운동 플랜 안내 보기/)
  assert.equal((html.match(/bg-brand px-4/g) ?? []).length, 1)
  // 주간 리포트: AI 없이 제공되는 기본 리포트(이용 가능)
  const weekly = featureBlock2(html, 'weekly')
  assert.match(weekly, /이용 가능/)
  assert.match(weekly, /AI 없이 제공되는 기본 주간 리포트예요/)
  assert.match(weekly, /주간 리포트 보기/)
  // 식단 플랜은 목표 확인·조건 선택(I03)까지만 열려 있고 상태는 "준비 중"이다(추천 AI·서버 미연결). 추천이 즉시 나온다고 쓰지 않는다.
  const meal = featureBlock2(html, 'meal')
  assert.match(meal, /준비 중/)
  assert.doesNotMatch(meal, /이용 가능/)
  assert.match(meal, /식단 조건 선택하기/)
  assert.match(
    meal,
    /식단 목표가 있어야 이용할 수 있고, 추천 결과는 준비 중이에요/,
  )
  // 사진 분석: 준비 중 행(행 자체는 클릭 효과 없음). 분석 서버는 없지만 사진을 골라 볼 수 있는 I04 링크 하나만 둔다(2026-11-22, 사용자 승인된 I04 구현)
  const photo = featureBlock(html, 'photo')
  assert.match(photo, /준비 중/)
  assert.equal((photo.match(/<a /g) ?? []).length, 1)
  assert.match(photo, /<a [^>]*href="\/ai\/meal\/photo"/)
  assert.match(photo, /사진 골라 보기/)
  assert.match(photo, /분석은 준비 중이에요\. 사진을 미리 골라 볼 수만 있어요/)
  assert.ok(!photo.includes('<button'))
  assert.doesNotMatch(
    photo.replace(/<a [\s\S]*?<\/a>/, ''),
    /cursor-pointer|hover:/,
  )
  // 접이식 안내: 상태 안내·이용 흐름·이용 범위(합산 5회·무료·결제)
  const guide = html.match(/data-ai-guide[\s\S]*?<\/details>/)[0]
  assert.match(guide, /<summary/)
  assert.match(guide, /상태 안내/)
  assert.match(guide, /지금 바로 이용할 수 있어요/)
  assert.match(guide, /로컬 예시로 체험할 수 있어요\. 실제 AI 추천은 아니에요/)
  assert.match(guide, /아직 제공 전이에요/)
  assert.match(guide, /이용 흐름/)
  assert.match(
    guide,
    /무료 AI 체험은 가입 후 최초 5회이고 월간 초기화는 없어요/,
  )
  assert.match(guide, /기본 기록과 기본 주간 리포트는 무료/)
  assert.match(guide, /자동으로 결제되지 않아요/)
  assert.match(guide, /운동·식단 AI 공통 사용 횟수/)
  // 의료 안내는 접이식 밖에서 읽을 수 있는 크기로 있고 기록 바로가기가 있다.
  const footer = html.slice(html.indexOf('<footer'))
  assert.match(footer, /참고용이며 의료적 진단을 대신하지 않아요/)
  assert.match(footer, /기록은 지금 바로 시작해요/)
  // 의료 안내는 12px 보조 안내, 기록 링크는 14px 링크다(공통 타입 스케일).
  assert.match(
    footer,
    /role="note"[^>]*text-support|text-support[^>]*>[^<]*참고용/,
  )
  // 회원 허브는 공통 글자·모서리 토큰만 쓴다(예외 크기·큰 모서리 없음).
  assert.match(html, /<h1 class="text-app-title/)
  assert.doesNotMatch(
    html,
    /text-metric|text-xl|text-lg|text-base|text-sm|rounded-\[|shadow-/,
  )
  assert.match(html, /rounded-card/)
  assert.doesNotMatch(html, /남은 체험|체험 \d회 남/)
})

test('확장성: 두 화면은 같은 기능 목록(AI_FEATURES)에서 그리고 새 기능은 항목 하나로 더해진다', () => {
  const keys = Content.AI_FEATURES.map((f) => f.key)
  assert.deepEqual(keys, ['exercise', 'meal', 'photo', 'weekly'])
  assert.equal(new Set(keys).size, keys.length)
  const keysOf = (html) => [
    ...new Set([...html.matchAll(/data-ai-feature="(\w+)"/g)].map((m) => m[1])),
  ]
  // 두 화면 모두 대표 카드·리포트·준비 중 목록으로 나뉘어 같은 기능 집합(AI_FEATURES)을 그린다.
  assert.deepEqual([...keysOf(renderView(Home))].sort(), [...keys].sort())
  assert.deepEqual([...keysOf(renderView(Landing))].sort(), [...keys].sort())
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
  assert.equal(Content.effectiveStatus(feature('meal'), 'member'), 'guide')
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
