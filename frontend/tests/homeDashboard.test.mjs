// 로그인 홈(H01) 대시보드 개편: 이번 주 나의 활동 집계(월~일·기록일·운동/식단 독립·경계·미래·조회 실패와 0일 구분), 오늘의 기록, 최근 활동(최대 3건·정렬·상세 경로),
// 계정 분리, 추천 카드·검색 튜토리얼 제거와 조회 비중복, 랜딩의 검색 미리보기, 운영 환경의 저장소 구성(운동 기록은 로컬 저장소, 식단 기록은 없음)을 확인한다. 실제 서버·사용자 데이터는 쓰지 않는다.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, act, Weekly, Today, Recent, Shortcuts, Explore, Landing, content
const ME = 'member-a'
// 2026-11-18은 수요일이다. 이번 주는 11-16(월)~11-22(일).
const TODAY = '2026-11-18'

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  act = await server.ssrLoadModule('/src/home-activity/homeActivity.ts')
  const load = async (path) => (await server.ssrLoadModule(path)).default
  Weekly = await load('/src/components/home/HomeWeeklyActivity.tsx')
  Today = await load('/src/components/home/HomeTodayRecords.tsx')
  Recent = await load('/src/components/home/HomeRecentActivity.tsx')
  Shortcuts = await load('/src/components/home/HomeShortcuts.tsx')
  Explore = await load('/src/components/landing/LandingExplore.tsx')
  Landing = await load('/src/pages/GuestLandingPage.tsx')
  content = await server.ssrLoadModule('/src/components/home/homeContent.ts')
})
after(async () => {
  await server?.close()
})

const ready = (value) => ({ status: 'ready', value })
const exRec = (date, o = {}) => ({
  id: `ex-${date}-${o.n ?? 0}`,
  ownerId: ME,
  performedDate: date,
  sessionId: `s-${date}-${o.n ?? 0}`,
  completedAt: `${date}T10:${String(o.n ?? 0).padStart(2, '0')}:00`,
  exercises: [
    {
      exerciseNameSnapshot: o.name ?? '푸시업',
      completedSets: [{}],
    },
  ],
  ...o.extra,
})
const mealRec = (date, o = {}) => ({
  id: `meal-${date}-${o.n ?? 0}`,
  ownerId: ME,
  localDate: date,
  mealType: o.type ?? 'lunch',
  foodName: o.name ?? '닭가슴살',
  createdAt: `${date}T12:${String(o.n ?? 0).padStart(2, '0')}:00`,
  ...o.extra,
})
const exercise = (records, today = TODAY, skipped = 0) =>
  ready(act.normalizeExerciseActivity(records, skipped, today, ME))
const meal = (records, today = TODAY, skipped = 0) =>
  ready(act.normalizeMealActivity(records, skipped, today, ME))
const week = (ex, ml, today = TODAY) => act.buildWeeklyActivity(today, ex, ml)
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))

// ── 주간 범위 ────────────────────────────────────────────────────────────
test('주간 범위는 월요일부터 일요일이고 날짜 범위 문구가 만들어진다', () => {
  for (const today of ['2026-11-16', '2026-11-18', '2026-11-22']) {
    const w = week(exercise([], today), meal([], today), today)
    assert.equal(w.from, '2026-11-16', today)
    assert.equal(w.to, '2026-11-22', today)
    assert.equal(w.rangeLabel, '11월 16일 ~ 22일')
    assert.deepEqual(w.days.map((d) => d.weekday).join(''), '월화수목금토일')
  }
  // 일요일 다음 날(월요일)은 새 주다.
  assert.equal(week(exercise([]), meal([]), '2026-11-23').from, '2026-11-23')
})
test('달·해가 바뀌는 주의 범위 문구', () => {
  assert.equal(
    week(exercise([], '2026-12-01'), meal([], '2026-12-01'), '2026-12-01')
      .rangeLabel,
    '11월 30일 ~ 12월 6일',
  )
  assert.equal(
    week(exercise([], '2026-12-31'), meal([], '2026-12-31'), '2026-12-31')
      .rangeLabel,
    '12월 28일 ~ 1월 3일',
  )
})
test('오늘 날짜가 올바르지 않으면 주를 만들지 않는다', () => {
  assert.equal(week(exercise([]), meal([]), 'bad'), null)
  assert.equal(week(exercise([]), meal([]), ''), null)
})

// ── 집계 ─────────────────────────────────────────────────────────────────
test('기록일은 날짜 수다: 같은 날 여러 건도 1일, 운동과 식단은 독립이다', () => {
  const w = week(
    exercise([
      exRec('2026-11-16', { n: 1 }),
      exRec('2026-11-16', { n: 2 }),
      exRec('2026-11-17'),
    ]),
    meal([
      mealRec('2026-11-16', { n: 1 }),
      mealRec('2026-11-16', { n: 2, type: 'dinner' }),
      mealRec('2026-11-16', { n: 3, type: 'breakfast' }),
      mealRec('2026-11-18'),
      mealRec('2026-11-17'),
    ]),
  )
  assert.deepEqual(w.exercise, { status: 'ready', recordedDays: 2 })
  assert.deepEqual(w.meal, { status: 'ready', recordedDays: 3 })
})
test('주 경계: 지난 주 일요일·다음 주 월요일 기록은 이번 주에 들어가지 않는다', () => {
  const today = '2026-11-22' // 일요일
  const w = week(
    exercise(
      [exRec('2026-11-15'), exRec('2026-11-16'), exRec('2026-11-22')],
      today,
    ),
    meal([mealRec('2026-11-15'), mealRec('2026-11-22')], today),
    today,
  )
  assert.equal(w.exercise.recordedDays, 2) // 16일·22일
  assert.equal(w.meal.recordedDays, 1) // 22일
  assert.deepEqual(
    w.days
      .map((d) => [d.date, d.exercise, d.meal])
      .filter(([d]) => d === '2026-11-16'),
    [['2026-11-16', 'recorded', 'none']],
  )
})
test('오늘보다 뒤 날짜의 기록은 완료한 활동으로 세지 않고 미래로 표시한다', () => {
  const w = week(
    exercise([exRec('2026-11-20'), exRec('2026-11-18')]),
    meal([mealRec('2026-11-21')]),
  )
  assert.equal(w.exercise.recordedDays, 1)
  assert.equal(w.meal.recordedDays, 0)
  const byDate = Object.fromEntries(w.days.map((d) => [d.date, d]))
  assert.equal(byDate['2026-11-20'].exercise, 'future')
  assert.equal(byDate['2026-11-21'].meal, 'future')
  // 미래 기록은 "읽을 수 없는 기록"으로도 세지 않아 "없음" 확인을 해치지 않는다.
  assert.equal(
    act.normalizeMealActivity([mealRec('2026-11-21')], 0, TODAY, ME).unreadable,
    0,
  )
})
test('요일별 상태: 기록함·기록 없음·미래·오늘 표시', () => {
  const w = week(
    exercise([exRec('2026-11-16')]),
    meal([mealRec('2026-11-17'), mealRec('2026-11-18')]),
  )
  const by = Object.fromEntries(w.days.map((d) => [d.date, d]))
  assert.deepEqual(
    [by['2026-11-16'].exercise, by['2026-11-16'].meal],
    ['recorded', 'none'],
  )
  assert.deepEqual(
    [by['2026-11-17'].exercise, by['2026-11-17'].meal],
    ['none', 'recorded'],
  )
  assert.equal(by['2026-11-18'].isToday, true)
  assert.equal(by['2026-11-16'].isToday, false)
  assert.deepEqual(
    [by['2026-11-19'].exercise, by['2026-11-22'].meal],
    ['future', 'future'],
  )
})

// ── 조회 실패와 0일의 구분 ───────────────────────────────────────────────
test('읽는 중·연결 전·조회 실패는 0일이 아니며 다른 영역은 독립적으로 보인다', () => {
  for (const status of ['loading', 'unavailable', 'error']) {
    const w = week({ status }, meal([mealRec('2026-11-17')]))
    assert.deepEqual(w.exercise, { status }, status)
    assert.deepEqual(w.meal, { status: 'ready', recordedDays: 1 })
    const w2 = week(exercise([exRec('2026-11-17')]), { status })
    assert.deepEqual(w2.meal, { status }, status)
    assert.deepEqual(w2.exercise, { status: 'ready', recordedDays: 1 })
    // 읽지 못한 영역의 지난 날은 "기록 없음"이 아니라 확인 불가다.
    const by = Object.fromEntries(w.days.map((d) => [d.date, d]))
    assert.equal(by['2026-11-16'].exercise, 'unknown')
    assert.equal(by['2026-11-19'].exercise, 'future')
  }
})
test('기록이 없다고 확인된 경우에만 0일이다', () => {
  const w = week(exercise([]), meal([]))
  assert.deepEqual(w.exercise, { status: 'ready', recordedDays: 0 })
  assert.deepEqual(w.meal, { status: 'ready', recordedDays: 0 })
})
test('읽을 수 없는 기록이 있으면 0일이라고 하지 않고 그 날의 없음도 확인할 수 없다', () => {
  const w = week(
    ready(act.normalizeExerciseActivity([], 2, TODAY, ME)),
    meal([]),
  )
  assert.deepEqual(w.exercise, { status: 'error' })
  assert.equal(w.days[0].exercise, 'unknown')
  // 기록이 하나라도 읽히면 그 수는 보여 주되, 기록 없는 날은 확인 불가로 둔다.
  const some = week(
    ready(act.normalizeExerciseActivity([exRec('2026-11-16')], 1, TODAY, ME)),
    meal([]),
  )
  assert.deepEqual(some.exercise, { status: 'ready', recordedDays: 1 })
  assert.equal(some.days[1].exercise, 'unknown')
})

// ── 잘못된 데이터·계정 분리 ──────────────────────────────────────────────
test('날짜가 잘못되었거나 비어 있는 기록은 현재 날짜로 바꾸지 않고 읽을 수 없는 기록으로 센다', () => {
  const ex = act.normalizeExerciseActivity(
    [
      exRec('2026-11-17'),
      { ...exRec('2026-11-17'), performedDate: 'not-a-date', id: 'bad-1' },
      { ...exRec('2026-11-17'), performedDate: undefined, id: 'bad-2' },
      null,
      undefined,
    ],
    NaN,
    TODAY,
    ME,
  )
  assert.deepEqual(ex.dates, ['2026-11-17'])
  assert.equal(ex.unreadable, 4)
  assert.equal(ex.todayCount, 0)
  assert.equal(ex.recent.length, 1)
  const ml = act.normalizeMealActivity(
    [
      mealRec('2026-11-17'),
      { ...mealRec('2026-11-17'), mealType: 'brunch', id: 'bad' },
    ],
    0,
    TODAY,
    ME,
  )
  assert.equal(ml.unreadable, 1)
  assert.deepEqual(ml.dates, ['2026-11-17'])
})
test('다른 계정의 기록은 집계·최근 활동에 들어가지 않는다', () => {
  const ex = act.normalizeExerciseActivity(
    [
      exRec('2026-11-18', { extra: { ownerId: 'someone-else' } }),
      exRec('2026-11-17'),
    ],
    0,
    TODAY,
    ME,
  )
  assert.deepEqual(ex.dates, ['2026-11-17'])
  assert.equal(ex.unreadable, 1)
  assert.ok(ex.recent.every((item) => item.date === '2026-11-17'))
  const only = week(
    ready(
      act.normalizeExerciseActivity(
        [exRec('2026-11-17', { extra: { ownerId: 'someone-else' } })],
        0,
        TODAY,
        ME,
      ),
    ),
    meal([]),
  )
  // 다른 계정의 기록만 있으면 이 계정의 "0일"이 아니라 확인할 수 없는 상태다.
  assert.deepEqual(only.exercise, { status: 'error' })
})

// ── 오늘의 기록 ──────────────────────────────────────────────────────────
test('오늘의 기록 상태: 있음·없음(확인됨)·읽는 중·연결 전·실패·읽을 수 없는 기록', () => {
  assert.deepEqual(
    act.todayStatusOf(
      exercise([exRec(TODAY, { n: 1 }), exRec(TODAY, { n: 2 })]),
    ),
    { status: 'some', count: 2 },
  )
  assert.deepEqual(act.todayStatusOf(exercise([exRec('2026-11-17')])), {
    status: 'none',
  })
  for (const status of ['loading', 'unavailable', 'error'])
    assert.deepEqual(act.todayStatusOf({ status }), { status })
  assert.deepEqual(
    act.todayStatusOf(ready(act.normalizeMealActivity([], 1, TODAY, ME))),
    { status: 'error' },
  )
})

// ── 최근 활동 ────────────────────────────────────────────────────────────
const recent = (ex, ml) => act.buildRecentActivity(ex, ml)
test('최근 활동은 운동·식단을 합쳐 최신순 최대 3건이다', () => {
  const view = recent(
    exercise([exRec('2026-11-18'), exRec('2026-11-16'), exRec('2026-11-10')]),
    meal([
      mealRec('2026-11-17'),
      mealRec('2026-11-17', { n: 1, type: 'dinner' }),
      mealRec('2026-11-01'),
    ]),
  )
  assert.equal(view.status, 'ready')
  assert.equal(view.items.length, 3)
  assert.deepEqual(
    view.items.map((i) => [i.kind, i.date]),
    [
      ['exercise', '2026-11-18'],
      ['meal', '2026-11-17'],
      ['meal', '2026-11-17'],
    ],
  )
  assert.deepEqual(view.missing, [])
})
test('정렬: 기록 날짜 → 같은 날은 시각 최신순 → 같으면 id 순, 시각이 없으면 뒤로 간다', () => {
  const view = recent(
    exercise([
      exRec('2026-11-17', { n: 5 }),
      exRec('2026-11-17', { n: 30 }),
      {
        ...exRec('2026-11-17', { n: 1 }),
        completedAt: 'broken',
        id: 'ex-broken',
      },
    ]),
    meal([]),
  )
  assert.deepEqual(
    view.items.map((i) => i.id),
    ['ex-2026-11-17-30', 'ex-2026-11-17-5', 'ex-broken'],
  )
  // 시각이 같으면 id 순으로 항상 같은 순서다.
  const tie = recent(
    exercise([
      { ...exRec('2026-11-17'), id: 'b', completedAt: '2026-11-17T09:00:00' },
      { ...exRec('2026-11-17'), id: 'a', completedAt: '2026-11-17T09:00:00' },
    ]),
    meal([]),
  )
  assert.deepEqual(
    tie.items.map((i) => i.id),
    ['a', 'b'],
  )
  // 입력 순서가 달라도 결과가 같다.
  const one = recent(
    exercise([exRec('2026-11-16'), exRec('2026-11-17')]),
    meal([]),
  )
  const two = recent(
    exercise([exRec('2026-11-17'), exRec('2026-11-16')]),
    meal([]),
  )
  assert.deepEqual(one, two)
})
test('날짜가 잘못된 기록·미래 기록은 최근 활동에 넣지 않는다', () => {
  const view = recent(
    exercise([
      exRec('2026-11-17'),
      exRec('2026-11-25'),
      { ...exRec('2026-11-18'), performedDate: 'bad', id: 'bad' },
    ]),
    meal([]),
  )
  assert.deepEqual(
    view.items.map((i) => i.date),
    ['2026-11-17'],
  )
})
test('최근 활동 항목은 확인된 필드만 쓰고 상세 경로는 기존 화면이다', () => {
  const view = recent(
    exercise([
      {
        ...exRec(TODAY, { n: 7 }),
        exercises: [
          { exerciseNameSnapshot: '푸시업', completedSets: [{}] },
          { exerciseNameSnapshot: '스쿼트', completedSets: [{}] },
          { exerciseNameSnapshot: '플랭크', completedSets: [] },
        ],
      },
    ]),
    meal([
      mealRec(TODAY, { type: 'dinner', name: '샐러드' }),
      mealRec('2026-11-15', { type: 'breakfast', name: '현미밥' }),
    ]),
  )
  const items = Object.fromEntries(view.items.map((i) => [i.title, i]))
  assert.equal(
    items['푸시업 외 1개'].to,
    '/records/exercise/result?session=s-2026-11-18-7',
  )
  assert.equal(items['푸시업 외 1개'].meta, '오늘 10:07 완료')
  assert.equal(items['샐러드'].to, '/records/meal/dinner')
  assert.equal(items['샐러드'].meta, '오늘 · 저녁')
  assert.equal(items['현미밥'].to, '/records/meal/previous/2026-11-15')
  assert.equal(items['현미밥'].meta, '11월 15일 · 아침')
  // 세션 id가 없으면 없는 상세 경로를 만들지 않고 운동 기록 목록으로 보낸다.
  const noSession = recent(
    exercise([{ ...exRec('2026-11-17'), sessionId: undefined }]),
    meal([]),
  )
  assert.equal(noSession.items[0].to, '/records/exercise/my')
})
test('빈 상태는 두 영역을 모두 읽었고 읽을 수 없는 기록이 없을 때만이다', () => {
  assert.deepEqual(recent(exercise([]), meal([])), { status: 'empty' })
  assert.equal(recent(exercise([]), { status: 'error' }).status, 'error')
  assert.equal(recent(exercise([]), { status: 'unavailable' }).status, 'error')
  assert.equal(
    recent(ready(act.normalizeExerciseActivity([], 1, TODAY, ME)), meal([]))
      .status,
    'error',
  )
})
test('읽는 중·모두 실패·모두 연결 전은 각각 구분하고, 한 영역만 읽으면 그 기록과 함께 알린다', () => {
  assert.equal(
    recent({ status: 'loading' }, meal([mealRec('2026-11-17')])).status,
    'loading',
  )
  assert.equal(recent({ status: 'error' }, { status: 'error' }).status, 'error')
  assert.equal(
    recent({ status: 'unavailable' }, { status: 'unavailable' }).status,
    'unavailable',
  )
  assert.equal(
    recent({ status: 'unavailable' }, { status: 'error' }).status,
    'error',
  )
  const partial = recent({ status: 'error' }, meal([mealRec('2026-11-17')]))
  assert.equal(partial.status, 'ready')
  assert.deepEqual(partial.missing, ['exercise'])
  assert.equal(partial.items.length, 1)
})

// ── 화면 ─────────────────────────────────────────────────────────────────
const weeklyHtml = (props) =>
  render(
    createElement(Weekly, {
      today: TODAY,
      exercise: exercise([]),
      meal: meal([]),
      onRetryExercise: () => {},
      onRetryMeal: () => {},
      ...props,
    }),
  )
test('이번 주 나의 활동 카드: 제목·날짜 범위·두 수치·7일 표시·상세 링크', () => {
  const html = weeklyHtml({
    exercise: exercise([exRec('2026-11-16'), exRec('2026-11-17')]),
    meal: meal([
      mealRec('2026-11-16'),
      mealRec('2026-11-17'),
      mealRec('2026-11-18'),
    ]),
  })
  assert.match(html, /<h2[^>]*>이번 주 나의 활동<\/h2>/)
  assert.match(html, /11월 16일 ~ 22일/)
  assert.match(html, /운동 기록일[\s\S]*?>2<[^>]*>일/)
  assert.match(html, /식단 기록일[\s\S]*?>3<[^>]*>일/)
  assert.equal(
    (html.match(/<li class="flex flex-col items-center/g) ?? []).length,
    7,
  )
  assert.match(html, /11월 16일 월요일, 운동 기록 있음, 식단 기록 있음/)
  assert.match(html, /11월 18일 수요일, 오늘, 운동 기록 없음, 식단 기록 있음/)
  assert.match(html, /11월 19일 목요일, 아직 오지 않은 날/)
  assert.match(html, /href="\/ai\/weekly-report"/)
  assert.match(html, /주간 활동 자세히 보기/)
  assert.match(html, /이번 주 기록/)
  assert.match(html, /bg-exercise"[\s\S]*?운동[\s\S]*?bg-meal"[\s\S]*?식단/)
})
test('조회 상태별 표시: 읽는 중(자리 표시)·연결 전·실패는 0일로 보이지 않는다', () => {
  const loading = weeklyHtml({
    exercise: { status: 'loading' },
    meal: { status: 'loading' },
  })
  assert.match(loading, /animate-pulse/)
  assert.match(loading, /불러오는 중/)
  assert.doesNotMatch(loading, /text-metric/)
  const failed = weeklyHtml({
    exercise: { status: 'error' },
    meal: meal([mealRec('2026-11-17')]),
  })
  assert.match(failed, /기록을 확인하지 못했어요/)
  assert.match(failed, /다시 확인/)
  assert.equal((failed.match(/text-metric/g) ?? []).length, 1) // 식단 수치만 보인다
  const off = weeklyHtml({
    exercise: { status: 'unavailable' },
    meal: { status: 'unavailable' },
  })
  assert.match(off, /기록 기능 연결 전이에요/)
  assert.doesNotMatch(off, /text-metric/)
  // 같은 최소 높이를 지켜 카드 크기가 크게 변하지 않는다.
  for (const html of [loading, failed, off])
    assert.equal((html.match(/min-h-24/g) ?? []).length, 2)
})
test('빠른 실행: 제목이 있고 6개 바로가기의 이름·경로가 그대로이고 커뮤니티는 C01로 연결된다', () => {
  const html = render(createElement(Shortcuts))
  assert.match(html, /<h2[^>]*>빠른 실행<\/h2>/)
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(hrefs, [
    '/records/exercise',
    '/records/meal',
    '/ai',
    '/exercises',
    '/foods',
    '/community',
  ])
  for (const label of [
    '운동 기록',
    '식단 기록',
    'AI 코칭',
    '운동 찾기',
    '음식 찾기',
    '커뮤니티',
  ])
    assert.ok(html.includes(`<span>${label}</span>`), label)
  // 커뮤니티가 C01로 연결되어 준비 중 표시는 없다.
  assert.doesNotMatch(html, /준비 중/)
  assert.deepEqual(
    content.HOME_SHORTCUTS.map((s) => s.label),
    ['운동 기록', '식단 기록', 'AI 코칭', '운동 찾기', '음식 찾기', '커뮤니티'],
  )
  assert.equal(
    content.HOME_SHORTCUTS.find((s) => s.label === '커뮤니티').to,
    '/community',
  )
})
test('오늘의 기록: 운동·식단 줄과 상태·이동 문구', () => {
  const html = render(
    createElement(Today, {
      exercise: exercise([exRec(TODAY)]),
      meal: meal([]),
    }),
  )
  assert.match(html, /<h2[^>]*>오늘의 기록<\/h2>/)
  assert.match(html, /오늘 1건 기록했어요/)
  assert.match(html, /상세 보기/)
  assert.match(html, /아직 기록이 없어요/)
  assert.match(html, /href="\/records\/exercise"/)
  assert.match(html, /href="\/records\/meal"/)
  const unknown = render(
    createElement(Today, {
      exercise: { status: 'error' },
      meal: { status: 'loading' },
    }),
  )
  assert.doesNotMatch(unknown, /아직 기록이 없어요/)
  assert.match(unknown, /기록을 확인하지 못했어요/)
  assert.match(unknown, /확인하는 중이에요/)
})
test('최근 활동 화면: 목록·빈 상태·읽는 중·실패 문구', () => {
  const view = recent(
    exercise([exRec('2026-11-17')]),
    meal([mealRec('2026-11-16')]),
  )
  const html = render(createElement(Recent, { view, onRetry: () => {} }))
  assert.match(html, /<h2[^>]*>최근 활동<\/h2>/)
  assert.equal((html.match(/data-recent-kind/g) ?? []).length, 2)
  assert.match(html, /href="\/records\/exercise\/result\?session=/)
  const empty = render(
    createElement(Recent, { view: { status: 'empty' }, onRetry: () => {} }),
  )
  assert.match(empty, /아직 남긴 활동이 없어요\./)
  assert.match(empty, /운동이나 식단을 기록하면 이곳에서 확인할 수 있어요\./)
  const failed = render(
    createElement(Recent, { view: { status: 'error' }, onRetry: () => {} }),
  )
  assert.doesNotMatch(failed, /아직 남긴 활동이 없어요/)
  assert.match(failed, /불러오지 못했어요/)
  const loading = render(
    createElement(Recent, { view: { status: 'loading' }, onRetry: () => {} }),
  )
  assert.doesNotMatch(loading, /아직 남긴 활동이 없어요/)
  assert.match(loading, /animate-pulse/)
  const off = render(
    createElement(Recent, {
      view: { status: 'unavailable' },
      onRetry: () => {},
    }),
  )
  assert.doesNotMatch(off, /아직 남긴 활동이 없어요/)
})

// ── 추천·튜토리얼 제거, 조회 비중복, 보호 데이터 ─────────────────────────
const read = (path) => readFileSync(join(process.cwd(), path), 'utf8')
/** 주석을 뺀 코드만(제거한 기능을 설명하는 주석 문장은 검사 대상이 아니다). */
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    return statSync(path).isDirectory()
      ? sourceFiles(path)
      : /\.(ts|tsx)$/.test(name)
        ? [path]
        : []
  })
}
test('로그인 홈은 오늘의 추천과 검색 튜토리얼을 렌더링하지 않고 추천용 조회도 하지 않는다', () => {
  const page = code('src/pages/MemberHomePage.tsx')
  assert.doesNotMatch(
    page,
    /^import .*(HomePersonalizedRecommendation|HomeRecommendationBanner|useHomeRecommendation|HomeDiscovery)/m,
  )
  assert.doesNotMatch(
    page,
    /<(HomePersonalizedRecommendation|HomeRecommendationBanner|HomeDiscovery)\b/,
  )
  assert.doesNotMatch(page, /처음이라면 여기부터|HOME_GUIDE/)
  // 추천 모듈 파일은 남아 있고 다른 곳이 쓰지 않는다.
  const root = join(process.cwd(), 'src')
  const users = sourceFiles(root)
    .filter((f) =>
      /useHomeRecommendation|HomePersonalizedRecommendation/.test(
        readFileSync(f, 'utf8'),
      ),
    )
    .map((f) => relative(root, f).replaceAll('\\', '/'))
    .sort()
  assert.deepEqual(users, [
    'components/home/HomePersonalizedRecommendation.tsx',
    'home-recommendation/useHomeRecommendation.ts',
  ])
})
test('운동·식단 기록은 홈에서 한 번씩만 읽고 세 영역은 따로 조회하지 않는다', () => {
  const hook = code('src/home-activity/useHomeActivity.ts')
  assert.equal((hook.match(/useRecordsInRange\(/g) ?? []).length, 1)
  assert.equal((hook.match(/useAllMealRecords\(/g) ?? []).length, 1)
  const page = code('src/pages/MemberHomePage.tsx')
  assert.equal((page.match(/useHomeActivity\(/g) ?? []).length, 1)
  for (const file of [
    'HomeWeeklyActivity',
    'HomeTodayRecords',
    'HomeRecentActivity',
  ]) {
    const source = code(`src/components/home/${file}.tsx`)
    assert.doesNotMatch(
      source,
      /useRecordsInRange|useAllMealRecords|useMealRecords|createWorkoutRecordRepository|createMealRecordRepository|useEffect/,
      file,
    )
  }
})
test('홈 기록 집계는 PIN 보호 데이터·신체 정보·목표 저장소에 접근하지 않는다', () => {
  for (const file of [
    'src/home-activity/homeActivity.ts',
    'src/home-activity/useHomeActivity.ts',
  ]) {
    const source = code(file)
    assert.doesNotMatch(
      source,
      /body-measurements|exercise-goal|meal-goal|weight-log|unlock\(|registerPin|changePin|getProfile/,
      file,
    )
  }
})

// ── 랜딩 ─────────────────────────────────────────────────────────────────
test('비회원 랜딩: 검색 튜토리얼(3단계·운동/음식 미리보기·예시 표기)이 둘러보기 섹션에 있고 중복 타일이 없다', () => {
  const html = render(createElement(Explore))
  assert.match(html, /id="explore"/)
  assert.match(html, /가입 없이 둘러보기/)
  for (const step of ['검색어 입력', '조건 선택', '결과 확인'])
    assert.ok(html.includes(step), step)
  assert.match(html, /운동 검색/)
  assert.match(html, /음식 검색/)
  assert.equal((html.match(/검색 화면 미리보기 · 예시/g) ?? []).length, 2)
  assert.match(html, /난이도/)
  assert.match(html, /운동 부위/)
  assert.match(html, /운동 도구/)
  assert.match(html, /식품 구분/)
  assert.match(html, /음식 종류/)
  assert.match(html, /열량 · 단백질/)
  assert.ok(html.includes(content.HOME_GUIDE_TEXT.guestNote))
  // 눌리는 것은 시작하기 링크 두 개뿐이다(기존 타일 두 개와 겹치지 않는다).
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(hrefs, ['/exercises', '/foods'])
  assert.doesNotMatch(html, /준비 중/)
  // 미리보기는 실제 검색 결과가 아니라 예시 그림이다.
  assert.equal((html.match(/role="img"/g) ?? []).length, 2)
})
test('비회원 랜딩 전체: Hero·가입 CTA·로그인 링크가 그대로이고 검색 안내는 한 번만 나온다', () => {
  const html = render(createElement(Landing))
  assert.match(html, /무료로 시작하기/)
  assert.match(html, /href="\/signup"/)
  assert.match(html, /href="\/login"/)
  assert.equal((html.match(/검색어 입력/g) ?? []).length, 1)
  assert.equal((html.match(/id="explore"/g) ?? []).length, 1)
  // 로그인한 사용자의 기록처럼 보이는 영역이 없다.
  assert.doesNotMatch(html, /이번 주 나의 활동|최근 활동|오늘의 기록/)
})

// ── 운영 환경 ────────────────────────────────────────────────────────────
test('운영 환경(NODE_ENV=production)에서는 운동 기록은 로컬 저장소, 식단 기록은 서버 저장소를 쓴다. 저장소가 없는 영역은 연결 전이다', () => {
  const script = `
    import { createServer } from 'vite'
    const server = await createServer({
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    })
    const workout = await server.ssrLoadModule('/src/exercise/workoutSource.ts')
    const meal = await server.ssrLoadModule('/src/food/mealSource.ts')
    console.log(JSON.stringify({
      env: process.env.NODE_ENV,
      workout: workout.createWorkoutRecordRepository('u') !== null,
      meal: meal.createMealRecordRepository('u')?.kind ?? null,
    }))
    await server.close()
  `
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    {
      cwd: process.cwd(),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
    },
  )
  assert.deepEqual(JSON.parse(out.trim().split('\n').at(-1)), {
    env: 'production',
    workout: true, // 운동 완료 기록은 운영 빌드에서도 IndexedDB 로컬 저장소
    meal: 'server', // 식단 기록은 백엔드에 연결됨
  })
  // 저장소가 없는 영역은 훅이 unavailable로 만들고 화면은 0일·기록 없음 대신 연결 전 안내를 보인다.
  // 아래는 두 영역 모두 저장소가 없을 때의 규칙이다.
  const w = week({ status: 'unavailable' }, { status: 'unavailable' })
  assert.deepEqual(
    [w.exercise, w.meal],
    [{ status: 'unavailable' }, { status: 'unavailable' }],
  )
  assert.equal(
    recent({ status: 'unavailable' }, { status: 'unavailable' }).status,
    'unavailable',
  )
})

// ── 7일 활동 트래커의 원형 인디케이터 ───────────────────────────────────
test('트래커 원: 기록 있음은 영역 색 채움, 없음은 빈 원, 확인 불가는 점선 원, 미래는 원 없이 대시', () => {
  const html = weeklyHtml({
    exercise: exercise([exRec('2026-11-16')]),
    meal: meal([mealRec('2026-11-17')]),
  })
  const strip = html.slice(html.indexOf('<ol aria-label="이번 주 요일별 기록"'))
  const day = (n) => strip.split('<li ')[n]
  // 월(16): 운동만 → 채운 운동 원 1개 + 빈 원 1개
  assert.equal((day(1).match(/size-3[^"]*bg-exercise/g) ?? []).length, 1)
  assert.equal((day(1).match(/border-muted\/40/g) ?? []).length, 1)
  assert.doesNotMatch(day(1), /bg-meal/)
  // 화(17): 식단만 → 채운 식단 원 1개 + 빈 원 1개
  assert.equal((day(2).match(/size-3[^"]*bg-meal/g) ?? []).length, 1)
  assert.equal((day(2).match(/border-muted\/40/g) ?? []).length, 1)
  // 수(18, 오늘): 둘 다 없음 → 빈 원 2개, 오늘은 연한 블루 배경과 블루 글자
  assert.equal((day(3).match(/border-muted\/40/g) ?? []).length, 2)
  assert.match(day(3), /bg-brand-soft/)
  assert.match(day(3), /text-brand/)
  // 오늘이 아닌 날에는 배경 강조가 없다.
  for (const n of [1, 2, 4, 5, 6, 7])
    assert.doesNotMatch(day(n), /bg-brand-soft/)
  // 목(19)~일(22): 미래 → 원 없이 옅은 대시 2개
  for (const n of [4, 5, 6, 7]) {
    assert.doesNotMatch(day(n), /size-3[^"]*(rounded-full)/)
    assert.equal((day(n).match(/h-px w-2 bg-line/g) ?? []).length, 2)
  }
  // 둘 다 기록한 날
  const both = weeklyHtml({
    exercise: exercise([exRec('2026-11-17')]),
    meal: meal([mealRec('2026-11-17')]),
  })
  const bothDay = both.slice(both.indexOf('<ol aria-label')).split('<li ')[2]
  assert.match(bothDay, /bg-exercise/)
  assert.match(bothDay, /bg-meal/)
})
test('트래커 원: 부분 조회 실패는 실패한 영역만 점선 원이고 정상 영역은 유지된다', () => {
  const html = weeklyHtml({
    exercise: { status: 'error' },
    meal: meal([mealRec('2026-11-16')]),
  })
  const strip = html.slice(html.indexOf('<ol aria-label'))
  const monday = strip.split('<li ')[1]
  assert.equal((monday.match(/border-dashed/g) ?? []).length, 1) // 운동만 확인 불가
  assert.equal((monday.match(/size-3[^"]*bg-meal/g) ?? []).length, 1) // 식단은 기록 있음 그대로
  assert.match(monday, /운동 확인할 수 없음, 식단 기록 있음/)
  // 확인 불가는 기록 없음(연한 테두리 빈 원)과 다른 모양이다.
  const tuesday = strip.split('<li ')[2]
  assert.equal((tuesday.match(/border-dashed/g) ?? []).length, 1)
  assert.equal((tuesday.match(/border-muted\/40/g) ?? []).length, 1)
})
