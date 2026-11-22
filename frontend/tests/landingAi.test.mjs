import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 비로그인 메인 랜딩(H01)의 AI 소개 섹션: 기능 4종의 사실대로의 상태, `/ai`로 가는 CTA, 인증 보호 유지. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Section
let Content
let GuestPage

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Section = (
    await server.ssrLoadModule('/src/components/landing/LandingAiServices.tsx')
  ).default
  Content = await server.ssrLoadModule(
    '/src/components/landing/landingContent.ts',
  )
  GuestPage = (await server.ssrLoadModule('/src/pages/GuestLandingPage.tsx'))
    .default
})
after(async () => {
  await server.close()
})

const render = (View) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, createElement(View)))
const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

test('메인 랜딩 AI 섹션: 기능 4종을 소개하고 제공 상태를 사실대로 구분한다', () => {
  const html = render(Section)
  for (const title of [
    'AI 운동 플랜',
    'AI 식단 추천',
    '음식 사진 분석',
    '주간 운동·식단 기록 분석',
  ])
    assert.ok(html.includes(title), title)
  assert.equal((html.match(/data-landing-ai-item=/g) ?? []).length, 4)
  const items = html
    .split('<li ')
    .filter((part) => part.includes('data-landing-ai-item='))
  const block = (title) => {
    const found = items.find((part) => part.includes(title))
    assert.ok(found, title)
    return found
  }
  // 운동 플랜: 로컬 예시는 로그인 후, 실제 AI는 준비 중
  const exercise = text(block('AI 운동 플랜'))
  assert.match(exercise, /로컬 예시 체험 · 로그인 후/)
  assert.match(exercise, /실제 AI 추천은 준비 중/)
  // 식단 추천·사진 분석: 준비 중
  for (const title of ['AI 식단 추천', '음식 사진 분석']) {
    const b = text(block(title))
    assert.match(b, /준비 중/)
    assert.match(b, /예정이에요/)
    assert.doesNotMatch(b, /이용 가능|체험/)
  }
  // 주간 기록 분석: 로그인 후 이용, AI 없는 기본 분석
  const weekly = text(block('주간 운동·식단 기록 분석'))
  assert.match(weekly, /로그인 후 이용/)
  assert.match(weekly, /AI 없이 무료/)
  assert.equal((html.match(/data-landing-ai-item="pending"/g) ?? []).length, 2)
  assert.equal((html.match(/data-landing-ai-item="login"/g) ?? []).length, 2)
  // 미구현 AI 기능을 제공 중이라고 쓰지 않는다.
  assert.doesNotMatch(
    text(html),
    /이용 가능해요|지금 바로 이용|AI가 분석해|추천해 드려요/,
  )
  assert.match(html, /참고용이며 의료적 진단을 대신하지 않아요/)
})

test('메인 랜딩 CTA: "AI 서비스 자세히 알아보기"가 /ai로 가는 링크이고 로그인 화면으로 보내지 않는다', () => {
  assert.equal(Content.LANDING_AI.ctaLabel, 'AI 서비스 자세히 알아보기')
  assert.equal(Content.LANDING_AI.ctaTo, '/ai')
  const html = render(Section)
  assert.match(html, /data-landing-ai-cta=""[^>]*>AI 서비스 자세히 알아보기/)
  const links = [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(links, ['/ai'])
  assert.doesNotMatch(html, /\/login|returnTo/)
  assert.doesNotMatch(html, /<button/)
  // 비로그인 메인 랜딩 전체에서도 섹션과 CTA가 보인다.
  const page = render(GuestPage)
  assert.match(page, /id="landing-ai-title"/)
  assert.match(page, /AI 서비스 자세히 알아보기/)
})

test('진입 정책: /ai는 로그인 강제 없이 인증 분기(aiEntryKind)를 쓰고, 회원 전용 AI 화면의 보호는 그대로다', () => {
  const router = read('../src/app/router.tsx')
  const aiRoute = router.slice(router.indexOf("path: 'ai',"))
  assert.match(aiRoute.slice(0, 400), /element: <AiPage \/>/)
  assert.doesNotMatch(aiRoute.slice(0, 600), /AuthGate|Navigate|redirect/)
  assert.match(read('../src/pages/AiPage.tsx'), /aiEntryKind\(status\)/)
  assert.doesNotMatch(read('../src/pages/AiPage.tsx'), /Navigate|redirect/)
  // I02는 공개(AuthGate 밖), I02-1·I05·I05-1은 AuthGate 안
  const gate = router.indexOf('element: <AuthGate />')
  assert.doesNotMatch(
    router.slice(
      router.indexOf("path: 'ai/exercise',"),
      router.indexOf("path: 'ai/exercise',") + 600,
    ),
    /AuthGate/,
  )
  for (const path of [
    'ai/exercise/plan',
    'ai/weekly-report',
    'ai/weekly-report/score',
  ])
    assert.ok(router.indexOf(`path: '${path}',`) > gate, path)
  // 비로그인 랜딩의 다른 AI 진입점(헤더·푸터)은 새로 만들지 않았고, 랜딩 화면은 하단 탭을 그리지 않는다.
  assert.match(read('../src/app/router.tsx'), /landing: true/)
  assert.doesNotMatch(
    read('../src/components/landing/landingContent.ts'),
    /LANDING_FOOTER[\s\S]*'\/ai'/,
  )
})

test('범위: 섹션은 저장소·API·체험 처리가 없고 다른 랜딩 섹션 파일은 AI 관련 값을 갖지 않는다', () => {
  const code = read('../src/components/landing/LandingAiServices.tsx')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  assert.doesNotMatch(
    code,
    /indexedDB|localStorage|sessionStorage|fetch\(|\/api\/|useAuth|useState|useEffect/,
  )
  // 새 애니메이션·이미지 없음
  assert.doesNotMatch(code, /animate-|<img|landingImages/)
})
