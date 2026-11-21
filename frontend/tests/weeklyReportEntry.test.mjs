import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// W01·D01 → I05 주간 리포트 진입 연결 테스트. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Next

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
  Next = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/NextExerciseSection.tsx',
    )
  ).default
})
after(async () => {
  await server.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
const plan = (status = 'ready') => ({
  state:
    status === 'ready' ? { status, plans: [], skippedCount: 0 } : { status },
  today: '2026-11-18',
  onRetry: noop,
})
const section = (over = {}) =>
  html(
    createElement(Next, {
      slot: { status: 'unavailable' },
      onRetry: noop,
      ...over,
    }),
  )

test('W01 다음 운동 준비하기: 주간 리포트가 "주간 리포트 보기" 링크(/ai/weekly-report)로 활성화되고 준비 중 표시가 없다', () => {
  const out = section({ plan: plan(), reportTo: '/ai/weekly-report' })
  assert.match(out, /data-next-report/)
  assert.ok(hrefs(out).includes('/ai/weekly-report'))
  assert.match(out, />주간 리포트 보기</)
  // 접힌 요약과 항목 어디에도 주간 리포트가 준비 중이라는 표시가 없다.
  assert.doesNotMatch(out, /주간 리포트\(준비 중\)|주간 리포트 모두 준비 중/)
  assert.doesNotMatch(out, /주간 리포트<\/h3>[\s\S]{0,500}준비 중/)
  assert.match(out, /내일 운동 계획 · 주간 리포트/)
  // 같은 I05로 가는 링크 하나이며 운동 전용 리포트 경로를 만들지 않는다.
  assert.deepEqual(
    hrefs(out).filter((h) => /weekly|report/.test(h)),
    ['/ai/weekly-report'],
  )
})

test('W01 다음 운동 준비하기: 기본 리포트를 AI·유료 기능처럼 쓰지 않고 운동·식단 통합 리포트임을 알린다', () => {
  const out = section({ plan: plan(), reportTo: '/ai/weekly-report' })
  assert.match(out, /운동·식단 기록으로 한 주를 돌아봐요/)
  assert.match(out, /기록 수로 계산하고 AI를 쓰지 않아요/)
  assert.doesNotMatch(out, /체험|유료|멤버십|AI 분석|AI 코칭|남은 횟수/)
})

test('W01 다음 운동 준비하기: 계획 저장소가 없어도 주간 리포트는 활성이고 계획만 준비 중이다', () => {
  const out = section({
    plan: plan('unavailable'),
    reportTo: '/ai/weekly-report',
  })
  assert.match(out, /내일 운동 계획\(준비 중\) · 주간 리포트/)
  assert.ok(hrefs(out).includes('/ai/weekly-report'))
  const noPlan = section({ reportTo: '/ai/weekly-report' })
  assert.match(noPlan, /내일 운동 계획\(준비 중\) · 주간 리포트/)
  assert.ok(hrefs(noPlan).includes('/ai/weekly-report'))
})

test('W01 다음 운동 준비하기: 경로가 없으면(개발용 예시) 기존처럼 주간 리포트는 준비 중이고 링크가 없다', () => {
  const out = section({ plan: plan() })
  assert.doesNotMatch(out, /data-next-report/)
  assert.ok(!hrefs(out).includes('/ai/weekly-report'))
  assert.match(out, /주간 리포트\(준비 중\)/)
  assert.match(out, /주간 리포트<\/h3>[\s\S]{0,500}준비 중/)
})

test('연결: W01 두 곳(주간 카드·다음 운동 준비하기)과 D01(오늘 섭취)이 같은 I05 경로로 들어가고 진입 화면을 이전으로 넘긴다', () => {
  const page = read('../src/pages/ExerciseDashboardPage.tsx')
  assert.equal(
    (
      page.match(
        /reportTo=\{usingSample \? undefined : weeklyReportPath\(\)\}/g,
      ) ?? []
    ).length,
    2,
  )
  const next = code(
    '../src/components/exercise/dashboard/NextExerciseSection.tsx',
  )
  assert.match(next, /state=\{\{ from: PATH_DASHBOARD \}\}/)
  const meal = code('../src/components/food/MealDashboardView.tsx')
  assert.match(
    meal,
    /to=\{PATH_WEEKLY_REPORT\}\s*state=\{\{ from: PATH_MEAL \}\}/,
  )
  // 새 리포트 경로·화면을 만들지 않았다(I05·I05-1 두 경로뿐).
  const router = read('../src/app/router.tsx')
  assert.deepEqual(
    [...router.matchAll(/path: '(ai\/weekly-report[^']*)'/g)].map((m) => m[1]),
    ['ai/weekly-report', 'ai/weekly-report/score'],
  )
})

test('뒤로 가기: 주 이동·점수 화면을 거쳐도 처음 진입한 화면(W01·D01)이 이어지고, 직접 접속하면 I01로 간다', () => {
  const report = code('../src/pages/WeeklyReportPage.tsx')
  // 주 이동은 history state를 비우지 않는다.
  assert.match(report, /state: location\.state/)
  assert.match(report, /useBackNavigation\('\/ai'\)/)
  assert.match(report, /entryFrom=\{entry\?\.to\}/)
  const view = code('../src/components/ai/weekly/WeeklyReportView.tsx')
  assert.match(view, /fromState: \{ from: entryFrom \}/)
  const score = code('../src/pages/WeeklyScorePage.tsx')
  assert.match(score, /useBackNavigation\('\/ai\/weekly-report'\)/)
  assert.match(score, /reportState=\{back\?\.state\}/)
  assert.match(
    code('../src/components/ai/weekly/WeeklyScoreView.tsx'),
    /state=\{reportState\}/,
  )
  // 상위 화면(직접 접속 시 복귀 경로)은 그대로다.
  const router = read('../src/app/router.tsx')
  const i05 = router.indexOf("path: 'ai/weekly-report',")
  assert.match(router.slice(i05, i05 + 400), /parent: '\/ai'/)
})

test('정책 유지: 주간 리포트 진입 파일은 체험 횟수·권한·결제·저장소 쓰기·API를 다루지 않는다', () => {
  for (const file of [
    '../src/components/exercise/dashboard/NextExerciseSection.tsx',
    '../src/pages/WeeklyReportPage.tsx',
    '../src/pages/WeeklyScorePage.tsx',
  ]) {
    assert.doesNotMatch(
      code(file),
      /entitlement|getExercisePlanAccess|trial|payment|membership|fetch\(|\/api\/|indexedDB|localStorage|sessionStorage/i,
      file,
    )
  }
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
})
