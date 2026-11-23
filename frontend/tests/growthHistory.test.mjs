// P14 경험치 내역 · P16 포인트 내역: 서버 값 검증(모르는 모양은 조회 실패) · 조회 상태 구분(연결 전·조회 실패·내역 없음·필터 결과 없음) ·
// 날짜별 묶음·정렬 · 부호·잔액·합계(서버 값만) · 경험치와 포인트 분리 · P01·P15 연결 · 라우트(회원 전용) · 가짜 내역·적립·차감 방지를 확인한다.
// 내역 API가 없어 적립·차감을 가장하는 테스트는 없다. 내역이 있는 상태는 시험용 가짜 서버 값을 화면에 직접 넘겨 "서버가 준 값만 보인다"는
// 규칙을 확인한다(실제 내역이 아니다). 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, hs, exp, pts, ExpView, PointView, Growth, PointSummary, Level, dest
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  hs = await load('/src/growth-history/historyState.ts')
  exp = await load('/src/growth-history/experienceHistory.ts')
  pts = await load('/src/growth-history/pointHistory.ts')
  ExpView = (
    await load('/src/components/mypage/history/ExperienceHistoryView.tsx')
  ).default
  PointView = (
    await load('/src/components/mypage/history/PointHistoryView.tsx')
  ).default
  Growth = (await load('/src/components/mypage/GrowthSummary.tsx')).default
  PointSummary = (await load('/src/components/mypage/PointSummary.tsx')).default
  Level = (await load('/src/components/level/LevelGuideView.tsx')).default
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

const expRaw = (entries, total) => ({ entries, total })
const e1 = {
  id: 'x1',
  occurredAt: '2026-11-20T10:30:00+09:00',
  activity: '운동 기록 저장',
  amount: 20,
}
const e2 = {
  id: 'x2',
  occurredAt: '2026-11-20T08:00:00+09:00',
  activity: '식단 기록 저장',
  amount: 10,
}
const e3 = {
  id: 'x3',
  occurredAt: '2026-11-18T21:00:00+09:00',
  activity: '주간 리포트 확인',
  amount: 5,
}
const pRaw = (entries, totals) => ({ entries, totals })
const p1 = {
  id: 'p1',
  occurredAt: '2026-11-20T10:30:00+09:00',
  kind: 'earn',
  reason: '운동 기록 보상',
  amount: 20,
  balanceAfter: 120,
}
const p2 = {
  id: 'p2',
  occurredAt: '2026-11-19T09:00:00+09:00',
  kind: 'use',
  reason: '사용 사유',
  amount: 10,
  balanceAfter: 100,
}

// ── 공통 상태·날짜 ────────────────────────────────────────────────────────
test('서버 연결은 아직 없다(source는 null)이고 연결이 없으면 조회하지 않는다', async () => {
  assert.equal(exp.createExperienceHistorySource(), null)
  assert.equal(pts.createPointHistorySource(), null)
  assert.deepEqual(await exp.runExperienceHistory(null, signal), {
    status: 'unavailable',
  })
  assert.deepEqual(await pts.runPointHistory(null, signal), {
    status: 'unavailable',
  })
})

test('조회 실패(예외·모르는 모양)는 내역 없음이 아니고, 0건일 때만 empty다', async () => {
  const src = (value) => ({ load: async () => value })
  const boom = {
    load: async () => {
      throw new Error('x')
    },
  }
  assert.deepEqual(await exp.runExperienceHistory(boom, signal), {
    status: 'error',
  })
  assert.deepEqual(await pts.runPointHistory(boom, signal), { status: 'error' })
  for (const odd of [null, 'x', {}, { entries: 'a' }, { entries: [null] }])
    assert.deepEqual(
      await exp.runExperienceHistory(src(odd), signal),
      { status: 'error' },
      JSON.stringify(odd),
    )
  assert.deepEqual(
    await exp.runExperienceHistory(src(expRaw([], null)), signal),
    { status: 'empty' },
  )
  assert.deepEqual(await pts.runPointHistory(src(pRaw([], null)), signal), {
    status: 'empty',
  })
  assert.equal(
    (await exp.runExperienceHistory(src(expRaw([e1], 20)), signal)).status,
    'ready',
  )
})

test('날짜별로 최신순 묶음이고 날짜가 없는 항목은 맨 아래 "날짜 미기록"이다', () => {
  const undated = { id: 'u', occurredAt: null, activity: 'a', amount: 1 }
  const groups = hs.groupByDay([e3, undated, e2, e1])
  assert.equal(groups.length, 3)
  assert.deepEqual(
    groups[0].entries.map((e) => e.id),
    ['x1', 'x2'],
  )
  assert.deepEqual(
    groups[1].entries.map((e) => e.id),
    ['x3'],
  )
  assert.equal(groups[2].day, '날짜 미기록')
  assert.match(groups[0].day, /2026\.\s?11\.\s?20/)
  assert.equal(hs.timeLabel(null), null)
  assert.equal(hs.timeLabel('nope'), null)
  assert.match(hs.timeLabel('2026-11-20T10:30:00+09:00'), /10:30/)
})

// ── 서버 값 검증 ──────────────────────────────────────────────────────────
test('경험치 내역: 올바른 값만 받고 합계는 서버 값일 때만 쓴다(계산하지 않는다)', () => {
  const ok = exp.parseExperienceHistory(
    expRaw([{ ...e1, activity: '  운동 기록 저장 ' }], 320),
  )
  assert.deepEqual(ok.entries[0], { ...e1, activity: '운동 기록 저장' })
  assert.equal(ok.total, 320)
  assert.equal(
    exp.parseExperienceHistory(expRaw([e1, e2], undefined)).total,
    null,
  )
  assert.equal(exp.parseExperienceHistory(expRaw([e1, e2], -1)).total, null)
  for (const bad of [
    { ...e1, amount: -5 },
    { ...e1, amount: 1.5 },
    { ...e1, amount: '20' },
    { ...e1, activity: '  ' },
    { ...e1, id: 7 },
    { ...e1, occurredAt: 12 },
  ])
    assert.equal(
      exp.parseExperienceHistory(expRaw([bad], null)),
      null,
      JSON.stringify(bad),
    )
  assert.equal(exp.experienceAmountLabel(1234), '+1,234 EXP')
})

test('포인트 내역: 올바른 값만 받고 합계·거래 후 잔액은 서버 값일 때만 쓴다(내역으로 계산하지 않는다)', () => {
  const ok = pts.parsePointHistory(pRaw([p1, p2], { earned: 420, used: 100 }))
  assert.equal(ok.entries.length, 2)
  assert.deepEqual(ok.totals, { earned: 420, used: 100 })
  const noTotals = pts.parsePointHistory(pRaw([p1], undefined))
  assert.equal(noTotals.totals, null)
  assert.equal(pts.parsePointHistory(pRaw([p1], { earned: 1 })).totals, null)
  assert.equal(
    pts.parsePointHistory(pRaw([{ ...p1, balanceAfter: undefined }], null))
      .entries[0].balanceAfter,
    null,
  )
  for (const bad of [
    { ...p1, kind: 'bonus' },
    { ...p1, amount: -1 },
    { ...p1, amount: 2.5 },
    { ...p1, reason: '' },
    { ...p1, balanceAfter: -3 },
    { ...p1, balanceAfter: 'x' },
  ])
    assert.equal(
      pts.parsePointHistory(pRaw([bad], null)),
      null,
      JSON.stringify(bad),
    )
})

test('포인트 변동량은 부호와 유형 글자로 구분하고 필터·건수는 전체 기준이다', () => {
  assert.equal(
    pts.pointAmountLabel({ ...p1, kind: 'earn', amount: 1200 }),
    '+1,200 P',
  )
  assert.equal(pts.pointAmountLabel(p2), '−10 P')
  const entries = [p1, p2, { ...p1, id: 'p3' }]
  assert.deepEqual(pts.pointFilterCounts(entries), { all: 3, earn: 2, use: 1 })
  assert.deepEqual(
    pts.filterPointEntries(entries, 'use').map((e) => e.id),
    ['p2'],
  )
  assert.equal(pts.filterPointEntries(entries, 'all').length, 3)
  assert.deepEqual(
    pts.POINT_FILTERS.map((f) => pts.POINT_FILTER_LABEL[f]),
    ['전체', '적립', '사용'],
  )
})

// ── P14 화면 ──────────────────────────────────────────────────────────────
const readyLevel = { state: 'ready', data: { level: 3, progress: null } }
const expView = (state, level = { state: 'unavailable' }) =>
  render(createElement(ExpView, { level, state, onRetry: noop }))
const readyExp = (entries, total = null) => ({
  status: 'ready',
  data: { entries, total },
})

test('P14 서버 연결 전: "아직 볼 수 없어요"이고 내역 없음이 아니며 수치·내역을 만들지 않는다', () => {
  const html = expView({ status: 'unavailable' })
  assert.match(html, /<h1[^>]*>경험치 내역<\/h1>/)
  assert.match(html, /경험치 내역을 아직 볼 수 없어요/)
  assert.match(html, /내역이 없다는 뜻이 아니에요/)
  assert.match(html, /data-history-state="unavailable"/)
  assert.doesNotMatch(
    html,
    /아직 경험치 내역이 없어요|data-experience-entry|data-history-list|\+\d+ EXP|합계|320/,
  )
  assert.match(html, /Lv\.–/)
  assert.match(html, /활동 레벨 연결 전/)
})

test('P14 조회 중·조회 실패·내역 없음은 서로 다른 안내다', () => {
  const loading = expView({ status: 'loading' })
  assert.match(loading, /경험치 내역을 불러오는 중이에요/)
  assert.doesNotMatch(
    loading,
    /아직 경험치 내역이 없어요|data-history-state="error"/,
  )
  const failed = expView({ status: 'error' })
  assert.match(failed, /role="alert"/)
  assert.match(failed, /경험치 내역을 불러오지 못했어요/)
  assert.match(failed, /내역이 없는 것은 아니에요/)
  assert.match(failed, /data-history-retry/)
  assert.doesNotMatch(failed, /아직 경험치 내역이 없어요/)
  const empty = expView({ status: 'empty' })
  assert.match(empty, /아직 경험치 내역이 없어요/)
  assert.match(empty, /data-history-state="empty"/)
  assert.doesNotMatch(
    empty,
    /아직 볼 수 없어요|불러오지 못했어요|data-history-retry/,
  )
})

test('P14 내역 있음: 날짜별 최신순으로 활동·시각·적립량이 보이고 합계는 서버 값일 때만 보인다', () => {
  const html = expView(readyExp([e3, e1, e2]), readyLevel)
  assert.match(html, /Lv\.3/)
  assert.equal((html.match(/data-experience-entry=/g) ?? []).length, 3)
  assert.equal((html.match(/data-history-day=/g) ?? []).length, 2)
  assert.ok(
    html.indexOf('운동 기록 저장') < html.indexOf('주간 리포트 확인'),
    '최신 날짜가 위',
  )
  assert.match(html, /\+20 EXP/)
  assert.match(html, /\+10 EXP/)
  assert.match(html, /10:30/)
  // 합계는 서버가 줬을 때만, 줬다면 서버 값 그대로다(35가 아닌 값도 그대로).
  assert.doesNotMatch(html, /data-history-total/)
  const withTotal = expView(readyExp([e1, e2], 777), readyLevel)
  assert.match(withTotal, /data-history-total[^>]*>[\s\S]*777 EXP/)
})

test('P14 현재 레벨 요약: 진행값이 있으면 다음 레벨까지를 보이고 없으면 수치를 만들지 않는다', () => {
  const withProgress = expView(
    { status: 'empty' },
    {
      state: 'ready',
      data: {
        level: 3,
        progress: { experience: 320, nextLevelExperience: 500 },
      },
    },
  )
  assert.match(withProgress, /현재 320 EXP · 다음 레벨까지 180 EXP/)
  assert.doesNotMatch(
    expView({ status: 'empty' }, readyLevel),
    /다음 레벨까지|현재 \d+ EXP/,
  )
})

test('P14 안내: 경험치는 포인트와 별도이고 지급·승급 기준 미확정이며 레벨 안내(P15)로 간다', () => {
  const html = expView({ status: 'unavailable' })
  assert.match(html, /포인트와 따로 관리돼요/)
  assert.match(
    html,
    /경험치 지급과 레벨이 오르는 기준은 아직 정해지지 않았어요/,
  )
  assert.ok(hrefs(html).includes('/mypage/level'))
})

test('P14는 포인트를 섞지 않는다(보유 포인트·P 단위 변동이 없다)', () => {
  const html = expView(readyExp([e1, e2], 30), readyLevel)
  assert.doesNotMatch(html, /보유 포인트|총 사용|\d\s?P(?![a-zA-Z])/)
})

// ── P16 화면 ──────────────────────────────────────────────────────────────
const pointView = (state, points = { state: 'unavailable' }, extra = {}) =>
  render(createElement(PointView, { points, state, onRetry: noop, ...extra }))
const readyPts = (entries, totals = null) => ({
  status: 'ready',
  data: { entries, totals },
})

test('P16 서버 연결 전: 보유 포인트·합계는 연결 전이고 "아직 볼 수 없어요"이며 내역·필터가 없다', () => {
  const html = pointView({ status: 'unavailable' })
  assert.match(html, /<h1[^>]*>포인트 내역<\/h1>/)
  assert.match(html, /포인트 내역을 아직 볼 수 없어요/)
  assert.match(html, /내역이 없다는 뜻이 아니에요/)
  assert.match(html, /아직 연결되지 않았어요/)
  assert.match(html, /data-point-total="총 적립"[\s\S]*?연결 전/)
  assert.match(html, /data-point-total="총 사용"[\s\S]*?연결 전/)
  assert.doesNotMatch(
    html,
    /아직 포인트 내역이 없어요|data-point-entry|data-point-filter|[+−]\d+ P|420|320/,
  )
})

test('P16 조회 중·조회 실패·내역 없음·선택 유형 내역 없음은 서로 다른 안내다', () => {
  assert.match(
    pointView({ status: 'loading' }),
    /포인트 내역을 불러오는 중이에요/,
  )
  const failed = pointView({ status: 'error' })
  assert.match(failed, /role="alert"/)
  assert.match(failed, /내역이 없는 것은 아니에요/)
  assert.match(failed, /data-history-retry/)
  assert.doesNotMatch(failed, /아직 포인트 내역이 없어요/)
  const empty = pointView({ status: 'empty' })
  assert.match(empty, /아직 포인트 내역이 없어요/)
  assert.doesNotMatch(empty, /아직 볼 수 없어요|data-point-filter/)
  const filtered = pointView(
    readyPts([p1]),
    { state: 'unavailable' },
    { initialFilter: 'use' },
  )
  assert.match(filtered, /data-history-state="filtered"/)
  assert.match(filtered, /이 유형의 내역이 없어요/)
  assert.match(filtered, /보유 포인트와 합계는 전체 기준 그대로예요/)
})

test('P16 내역 있음: 유형·시각·사유·부호가 붙은 변동량이 날짜별 최신순으로 보이고 거래 후 잔액은 서버 값일 때만 보인다', () => {
  const html = pointView(
    readyPts([p2, { ...p1, balanceAfter: null }], { earned: 420, used: 100 }),
    { state: 'ready', data: { balance: 320 } },
  )
  assert.equal((html.match(/data-point-entry=/g) ?? []).length, 2)
  assert.ok(
    html.indexOf('운동 기록 보상') < html.indexOf('사용 사유'),
    '최신 날짜가 위',
  )
  assert.match(html, /\+20 P/)
  assert.match(html, /−10 P/)
  assert.match(html, /data-point-kind="earn"[\s\S]*?적립/)
  assert.match(html, /data-point-kind="use"[\s\S]*?사용/)
  assert.match(html, /잔액 100 P/)
  // 서버가 거래 후 잔액을 주지 않은 항목에는 잔액을 만들어 쓰지 않는다.
  assert.equal((html.match(/잔액 \d+ P/g) ?? []).length, 1)
  // 보유 포인트와 합계는 서버·기존 출처 값이다.
  assert.match(html, /320/)
  assert.match(html, /data-point-total="총 적립"[\s\S]*?420 P/)
  assert.match(html, /data-point-total="총 사용"[\s\S]*?100 P/)
})

test('P16 합계는 서버가 주지 않으면 내역을 더해 계산하지 않고 "확인 전"이다', () => {
  const html = pointView(readyPts([p1, p2], null), {
    state: 'ready',
    data: { balance: 50 },
  })
  assert.match(html, /data-point-total="총 적립"[\s\S]*?확인 전/)
  assert.match(html, /data-point-total="총 사용"[\s\S]*?확인 전/)
  assert.doesNotMatch(html, /20 P<\/dd>|10 P<\/dd>/)
})

test('P16 필터: 전체·적립·사용과 건수가 있고 기본은 전체이며 선택한 유형만 보인다', () => {
  const entries = [p1, p2, { ...p1, id: 'p3', reason: '또 다른 적립' }]
  const html = pointView(readyPts(entries))
  // 버튼 하나씩(속성 순서와 무관하게) 꺼내 검사한다.
  const button = (key) =>
    html
      .split('<button')
      .find((chunk) => chunk.includes(`data-point-filter="${key}"`))
      ?.split('</button>')[0] ?? ''
  assert.equal((html.match(/data-point-filter=/g) ?? []).length, 3)
  for (const [key, label, count, pressed] of [
    ['all', '전체', 3, 'true'],
    ['earn', '적립', 2, 'false'],
    ['use', '사용', 1, 'false'],
  ]) {
    const b = button(key)
    assert.match(b, new RegExp(`aria-pressed="${pressed}"`), key)
    assert.ok(b.includes(label) && b.includes(`>${count}<`), key)
  }
  const onlyUse = pointView(
    readyPts(entries),
    { state: 'unavailable' },
    { initialFilter: 'use' },
  )
  assert.equal((onlyUse.match(/data-point-entry=/g) ?? []).length, 1)
  assert.match(onlyUse, /사용 사유/)
})

test('P16 사유는 HTML이 아니라 글자로 표시한다(이스케이프)', () => {
  const html = pointView(
    readyPts([{ ...p1, reason: '<img src=x onerror=alert(1)>' }]),
  )
  assert.doesNotMatch(html, /<img src=x/)
  assert.match(html, /&lt;img/)
})

test('P16 안내: 적립 기준·사용처·유효기간 미확정과 경험치와 별도 관리를 알리고 경험치 수량이 없다', () => {
  const html = pointView(readyPts([p1]), { state: 'unavailable' })
  assert.match(
    html,
    /포인트 적립 기준·사용처·유효기간은 아직 정해지지 않았어요/,
  )
  assert.match(html, /경험치와 따로 관리돼요/)
  assert.doesNotMatch(html, /\d\s?EXP/)
})

// ── 진입점·라우트·보호 ────────────────────────────────────────────────────
test('P01·P15 연결: 경험치 내역·포인트 내역 경로가 채워졌고 링크가 나타난다', () => {
  assert.equal(dest.MY_DESTINATIONS.experienceHistory.to, '/mypage/experience')
  assert.equal(dest.MY_DESTINATIONS.pointHistory.to, '/mypage/points')
  const growth = render(
    createElement(Growth, {
      level: { state: 'unavailable' },
      knowledge: { status: 'unavailable' },
      onRetryKnowledge: noop,
    }),
  )
  assert.ok(hrefs(growth).includes('/mypage/experience'))
  assert.match(growth, />경험치 내역</)
  const point = render(
    createElement(PointSummary, { points: { state: 'unavailable' } }),
  )
  assert.ok(hrefs(point).includes('/mypage/points'))
  assert.match(point, /포인트 내역/)
  const guide = render(
    createElement(Level, {
      level: { state: 'unavailable' },
      knowledge: { status: 'unavailable' },
    }),
  )
  assert.ok(hrefs(guide).includes('/mypage/experience'))
  assert.match(guide, /경험치 내역 보기/)
})

test('라우트: P14·P16은 승인 경로·회원 전용(AuthGate)·하단 탭 마이·상위 P01·h1 직접', () => {
  const router = readFileSync('src/app/router.tsx', 'utf8')
  for (const [path, id] of [
    ['mypage/experience', 'P14'],
    ['mypage/points', 'P16'],
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
    assert.match(block, /parent: '\/mypage'/)
    const before = router.slice(0, at)
    assert.ok(
      before.lastIndexOf('element: <AuthGate />') >
        before.lastIndexOf('element: <AuthOrExperienceGate />'),
      path,
    )
  }
})

test('P14·P16은 계정별로 분리되고(key) 서버 호출·저장소를 쓰지 않으며 경험치·포인트를 적립·차감하는 코드가 없다', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const read = (file) => strip(readFileSync(file, 'utf8'))
  for (const file of [
    'src/pages/ExperienceHistoryPage.tsx',
    'src/pages/PointHistoryPage.tsx',
  ]) {
    const code = read(file)
    assert.match(code, /key=\{user\.id\}/, file)
    assert.match(code, /if \(!user\) return null/, file)
    // 개발용 값 안내는 개발 서버에서만(운영 번들에서 제거).
    assert.match(code, /import\.meta\.env\.DEV &&/, file)
  }
  for (const file of [
    'src/growth-history/historyState.ts',
    'src/growth-history/experienceHistory.ts',
    'src/growth-history/pointHistory.ts',
    'src/growth-history/useHistory.ts',
    'src/components/mypage/history/HistoryParts.tsx',
    'src/components/mypage/history/ExperienceHistoryView.tsx',
    'src/components/mypage/history/PointHistoryView.tsx',
  ]) {
    const code = read(file)
    assert.doesNotMatch(
      code,
      /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console\.|\/api\/v1|setItem/,
      file,
    )
    assert.doesNotMatch(
      code,
      /earnPoints|usePoints|spendPoints|grantExperience|addExperience|deductPoints|awardPoints/i,
      file,
    )
  }
  // 경험치와 포인트 계약은 서로를 가져오지 않는다.
  assert.doesNotMatch(
    read('src/growth-history/experienceHistory.ts'),
    /pointHistory/,
  )
  assert.doesNotMatch(
    read('src/growth-history/pointHistory.ts'),
    /experienceHistory/,
  )
})
