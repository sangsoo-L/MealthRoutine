import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// S8-2: W01 최근 기록·완료 안내의 상세 링크(W15 읽기 전용) 렌더링과 연결 구조. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Recent
let Parts
let Result
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Recent = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/RecentRecordsSection.tsx',
    )
  ).default
  Parts = await server.ssrLoadModule(
    '/src/components/exercise/dashboard/WorkoutStartParts.tsx',
  )
  Result = await server.ssrLoadModule('/src/exercise/useWorkoutResult.ts')
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const item = (over = {}) => ({
  id: 'r1',
  sessionId: 'sess-1',
  performedDate: '2026-11-16',
  title: '스쿼트 외 1개',
  exerciseCount: 2,
  completedSetCount: 4,
  measuredMs: null,
  ...over,
})
const recent = (items, skippedCount = 0) =>
  createElement(Recent, {
    slot: { status: 'ready', data: { items, skippedCount } },
    sharedUnavailable: false,
    onRetry: noop,
  })

test('최근 기록: 세션 id가 있는 항목에만 W15 읽기 전용 링크를 보이고 이름에 날짜·제목이 들어간다', () => {
  const out = html(recent([item(), item({ id: 'r2', sessionId: undefined })]))
  // S8-4B: 제목 옆 "전체 기록 보기"(W10) 링크는 기록 상세 링크와 따로 센다.
  const links = [...out.matchAll(/<a [^>]*href="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((href) => href !== '/records/exercise/my')
  assert.deepEqual(links, ['/records/exercise/result?session=sess-1'])
  assert.match(out, /기록 자세히 보기/)
  assert.match(out, /스쿼트 외 1개/)
  assert.match(out, /sr-only">: 11\. 16\. 스쿼트 외 1개|sr-only">: 11월 16일/)
})

test('최근 기록: 세션 id의 특수문자는 주소에서 인코딩된다', () => {
  assert.equal(
    Result.resultPathFor('a b/c'),
    '/records/exercise/result?session=a%20b%2Fc',
  )
  const out = html(recent([item({ sessionId: 'a b/c' })]))
  assert.match(out, /href="\/records\/exercise\/result\?session=a%20b%2Fc"/)
})

test('최근 기록: 개발용 예시(세션 id 없음)에는 링크가 없다', () => {
  const out = html(recent([item({ sessionId: undefined })]))
  // 기록 상세 링크가 없다(제목 옆 "전체 기록 보기"(W10) 링크만 있다).
  assert.doesNotMatch(out, /기록 자세히 보기/)
  assert.doesNotMatch(out, /href="\/records\/exercise\/result/)
})

test('최근 기록: 빈 상태·조회 실패는 기존 안내를 쓰고 예시 기록을 보이지 않는다', () => {
  const empty = html(
    createElement(Recent, {
      slot: { status: 'empty' },
      sharedUnavailable: false,
      onRetry: noop,
    }),
  )
  assert.match(empty, /아직 저장된 운동 기록이 없어요/)
  assert.doesNotMatch(empty, /기록 자세히 보기/)
  const error = html(
    createElement(Recent, {
      slot: { status: 'error' },
      sharedUnavailable: false,
      onRetry: noop,
    }),
  )
  assert.match(error, /최근 운동 기록을 불러오지 못했어요/)
  assert.doesNotMatch(error, /기록 자세히 보기|스쿼트/)
})

const doneControls = {
  status: 'ready',
  active: null,
  decision: { kind: 'done' },
  busy: false,
  error: null,
  panel: null,
  reload: noop,
  start: noop,
  resume: noop,
  openAbandon: noop,
  chooseAbandonAndStart: noop,
  confirmAbandon: noop,
  closePanel: noop,
}
const startAction = (recordPath) =>
  html(createElement(Parts.StartAction, { controls: doneControls, recordPath }))

test('완료 안내: 저장된 기록 경로가 있을 때만 "운동 기록 자세히 보기" 링크를 더하고 기존 안내는 유지한다', () => {
  const withPath = startAction('/records/exercise/result?session=sess-9')
  assert.match(withPath, /오늘 운동을 마쳤어요/)
  assert.match(withPath, /같은 목록은 다시 시작하지/)
  assert.match(
    withPath,
    /<a [^>]*href="\/records\/exercise\/result\?session=sess-9"[^>]*>운동 기록 자세히 보기<\/a>/,
  )
  for (const none of [null, undefined]) {
    const out = startAction(none)
    assert.match(out, /오늘 운동을 마쳤어요/)
    assert.doesNotMatch(out, /<a |운동 기록 자세히 보기/)
  }
})

test('완료 안내 링크는 다시 시작 버튼을 만들지 않는다', () => {
  assert.doesNotMatch(
    startAction('/records/exercise/result?session=s'),
    /이 목록으로 바로 운동 시작/,
  )
})

test('연결 구조: 페이지는 보여 주는 목록 id로 완료 기록을 찾고, 초급 추천 진입은 오늘의 운동 다음(보조 행동)이다', () => {
  const page = read('../src/pages/ExerciseDashboardPage.tsx')
  assert.match(page, /doneSessionByList\.get\(list\.id\)/)
  assert.match(page, /resultPathFor\(doneSessionId\)/)
  assert.match(page, /recordPath=\{recordPath\}/)
  // 진행 중 카드 → 오늘의 운동(주요 행동) → 초급 추천 진입(보조 행동) 순서(대시보드 UI/UX 개선: 오늘 행동을 첫 화면에)
  const order = [
    '<ActiveSessionCard',
    '<TodayExerciseSection',
    '<BeginnerPlanEntry />',
  ].map((needle) => page.indexOf(needle))
  assert.ok(
    order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2],
  )
  // 개발용 예시를 쓰는 중에는 저장된 기록을 섞지 않는다
  const hook = read('../src/exercise/useExerciseDashboard.ts')
  assert.match(hook, /usingSample\s*\?\s*data\.slots/)
  assert.match(
    hook,
    /useDashboardRecords\(user\?\.id \?\? null, today, !usingSample\)/,
  )
  assert.match(hook, /usingSample \? NO_DONE/)
})

test('조회 훅: 계정 id로만 저장소를 만들고 영역마다 독립적으로 실패하며 실패를 예시로 채우지 않는다', () => {
  const hook = read('../src/exercise/useDashboardRecords.ts')
  assert.match(hook, /createWorkoutRecordRepository\(userId\)/)
  assert.match(hook, /Promise\.allSettled/)
  assert.match(hook, /listByDateRange\(week\.from, week\.to\)/)
  assert.match(hook, /listByDateRange\(recentRangeFrom\(today\), today\)/)
  assert.match(hook, /loaded\.key === key/) // 계정·날짜가 바뀐 지난 조회 결과는 쓰지 않는다
  assert.doesNotMatch(hook, /sample|dev\/dashboardSample/)
  // 세션 저장소(진행 중 세션)를 읽지 않는다
  assert.doesNotMatch(hook, /createWorkoutSessionRepository|getActive/)
})

test('저장소·스키마 보호: 이번 변경이 IndexedDB 저장소 코드와 추천·W11·W14·W15 로직을 건드리지 않는다', () => {
  // 새 파일은 저장소를 만들지 않고 기존 조회 함수만 쓴다
  for (const path of [
    '../src/exercise/dashboardRecords.ts',
    '../src/exercise/useDashboardRecords.ts',
  ]) {
    const source = read(path)
    assert.doesNotMatch(
      source,
      /indexedDB|createObjectStore|STORE_|onupgradeneeded/,
    )
    assert.doesNotMatch(source, /\.(put|add|delete|clear)\(/)
  }
})
