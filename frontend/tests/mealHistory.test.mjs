import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// FAST-04: 식단 리스트(D03)·이전 식단 상세(D03-1)의 날짜 계산·화면 구조와 D01 연결.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 IndexedDB 조회와 화면 이동은 Chrome 스크립트(meals-history)가 검증한다.
let server
let H // mealHistory.ts
let M // mealModel.ts
let FoodsDev // devFoodSamples.ts
let ListView
let PreviousView
let Pie
let DashboardView
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  H = await server.ssrLoadModule('/src/food/mealHistory.ts')
  M = await server.ssrLoadModule('/src/food/mealModel.ts')
  FoodsDev = await server.ssrLoadModule('/src/food/dev/devFoodSamples.ts')
  ListView = (
    await server.ssrLoadModule('/src/components/food/MealListView.tsx')
  ).default
  const previous = await server.ssrLoadModule(
    '/src/components/food/MealPreviousView.tsx',
  )
  PreviousView = previous.default
  Pie = previous.MealKcalPie
  DashboardView = (
    await server.ssrLoadModule('/src/components/food/MealDashboardView.tsx')
  ).default
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
const food = (id) => FoodsDev.DEV_FOODS.find((f) => f.id === id)
const NO_KCAL = {
  id: 'dev-nokcal',
  name: '열량 미상 음식',
  per100g: { kcal: null, protein: 2, fat: 1, carb: 3 },
  source: { kind: 'dev-sample', label: '개발용 예시 데이터(테스트)' },
}
const NO_NUTRITION = {
  id: 'dev-nonutrition',
  name: '영양정보 없는 음식',
  per100g: { kcal: null, protein: null, fat: null, carb: null },
  source: { kind: 'dev-sample', label: '개발용 예시 데이터(테스트)' },
}
let seq = 0
const rec = (localDate, mealType, f, portion = 'normal') =>
  M.buildMealRecord({
    id: `r${++seq}`,
    ownerId: 'free',
    requestId: `req-${seq}`,
    localDate,
    mealType,
    food: f,
    portion,
    now: new Date(`2026-11-18T0${(seq % 9) + 1}:00:00.000Z`),
  })

const TODAY = '2026-11-18' // 수요일

// ── 날짜 계산 ──
test('주간: 월요일 시작 7일, 일요일도 같은 주, 주차는 월요일이 속한 달 기준', () => {
  assert.deepEqual(H.weekDates('2026-11-18'), [
    '2026-11-16',
    '2026-11-17',
    '2026-11-18',
    '2026-11-19',
    '2026-11-20',
    '2026-11-21',
    '2026-11-22',
  ])
  assert.equal(H.mondayOf('2026-11-22'), '2026-11-16')
  assert.equal(H.mondayOf('2026-11-16'), '2026-11-16')
  assert.equal(H.weekLabel('2026-11-18'), '2026년 11월 3주차')
  assert.equal(H.weekPeriod('2026-11-18'), '11.16 ~ 11.22')
  // 달을 넘기는 주(11/30~12/6)는 월요일이 속한 11월의 마지막 주다.
  assert.equal(H.weekLabel('2026-11-30'), '2026년 11월 5주차')
  assert.equal(H.weekLabel('2026-12-04'), '2026년 11월 5주차')
  assert.equal(H.weekLabel('2026-12-07'), '2026년 12월 1주차')
  assert.equal(H.weekPeriod('2026-12-02'), '11.30 ~ 12.6')
})

test('날짜 더하기는 연·월 경계와 윤년을 넘어도 올바르다', () => {
  assert.equal(H.addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(H.addDays('2028-02-28', 1), '2028-02-29')
  assert.equal(H.addDays('2027-02-28', 1), '2027-03-01')
  assert.equal(H.addDays('2026-01-01', -1), '2025-12-31')
  assert.equal(H.dateText('2026-11-18'), '11월 18일 (수)')
  assert.equal(H.dateText('2026-11-22'), '11월 22일 (일)')
})

test('선택 날짜 보정과 주 이동: 잘못된·미래 날짜는 오늘, 같은 요일 유지, 미래면 오늘', () => {
  assert.equal(H.clampToToday('2026-11-10', TODAY), '2026-11-10')
  assert.equal(H.clampToToday('2026-11-18', TODAY), TODAY)
  assert.equal(H.clampToToday('2026-11-19', TODAY), TODAY)
  assert.equal(H.clampToToday('2026-02-31', TODAY), TODAY)
  assert.equal(H.clampToToday('가나다', TODAY), TODAY)
  assert.equal(H.clampToToday(null, TODAY), TODAY)
  assert.equal(H.shiftWeek('2026-11-18', -1, TODAY), '2026-11-11')
  assert.equal(H.shiftWeek('2026-11-11', 1, TODAY), TODAY)
  assert.equal(H.shiftWeek('2026-11-17', 1, TODAY), TODAY)
  assert.equal(H.shiftWeek('2026-11-04', 1, TODAY), '2026-11-11')
})

test('날짜별 묶음·기록한 날·지난 기록한 날·이전/다음 기록', () => {
  const rice = food('dev-food-1')
  const records = [
    rec('2026-11-10', 'breakfast', rice),
    rec('2026-11-16', 'lunch', rice),
    rec('2026-11-16', 'dinner', rice),
    rec(TODAY, 'breakfast', rice),
  ]
  const byDate = H.groupRecordsByDate(records)
  assert.equal(byDate.size, 3)
  assert.equal(byDate.get('2026-11-16').length, 2)
  assert.deepEqual(H.recordedDates(byDate), ['2026-11-10', '2026-11-16', TODAY])
  const past = H.pastRecordedDates(byDate, TODAY)
  assert.deepEqual(past, ['2026-11-10', '2026-11-16'])
  assert.deepEqual(H.adjacentDates(past, '2026-11-16'), {
    previous: '2026-11-10',
    next: null,
  })
  assert.deepEqual(H.adjacentDates(past, '2026-11-10'), {
    previous: null,
    next: '2026-11-16',
  })
  assert.deepEqual(H.adjacentDates(past, '2026-11-12'), {
    previous: '2026-11-10',
    next: '2026-11-16',
  })
  assert.deepEqual(H.adjacentDates([], '2026-11-12'), {
    previous: null,
    next: null,
  })
})

test('주간 요약: 오늘까지 기록한 날 수와 열량을 계산할 수 있는 날의 평균(목표 대비는 없다)', () => {
  const days = H.weekDates(TODAY)
  const byDate = H.groupRecordsByDate([
    rec('2026-11-16', 'breakfast', food('dev-food-1')), // 153
    rec('2026-11-17', 'lunch', food('dev-food-2')), // 165
    rec(TODAY, 'dinner', NO_KCAL), // 열량 없음 → 평균에서 제외
  ])
  const s = H.weekSummary(byDate, days, TODAY)
  assert.equal(s.recordedDays, 3)
  assert.equal(s.averageKcal, (153 + 165) / 2)
  assert.deepEqual(H.weekSummary(H.groupRecordsByDate([]), days, TODAY), {
    recordedDays: 0,
    averageKcal: null,
  })
  // 미래 날짜의 기록은 세지 않는다.
  const future = H.groupRecordsByDate([
    rec('2026-11-20', 'lunch', food('dev-food-1')),
  ])
  assert.equal(H.weekSummary(future, days, TODAY).recordedDays, 0)
  // 열량이 모두 없으면 평균은 0이 아니라 null이다.
  const none = H.groupRecordsByDate([rec('2026-11-16', 'lunch', NO_KCAL)])
  assert.equal(H.weekSummary(none, days, TODAY).averageKcal, null)
})

test('끼니별 열량 비율: 합이 100이고 열량이 없는 끼니는 0으로 채우지 않고 제외한다', () => {
  const share = H.mealKcalShare([
    rec('2026-11-16', 'breakfast', food('dev-food-1')), // 153
    rec('2026-11-16', 'lunch', food('dev-food-2')), // 165
    rec('2026-11-16', 'dinner', food('dev-food-3'), 'more'), // 52.5
  ])
  assert.equal(share.items.length, 3)
  assert.equal(
    share.items.reduce((a, b) => a + b.percent, 0),
    100,
  )
  assert.equal(share.totalKcal, 153 + 165 + 52.5)
  const partial = H.mealKcalShare([
    rec('2026-11-16', 'breakfast', food('dev-food-1')),
    rec('2026-11-16', 'dinner', NO_KCAL),
  ])
  assert.deepEqual(
    partial.items.map((i) => [i.meal, i.percent]),
    [['breakfast', 100]],
  )
  assert.equal(H.mealKcalShare([rec('2026-11-16', 'dinner', NO_KCAL)]), null)
  assert.equal(H.mealKcalShare([]), null)
})

// ── D03 화면 ──
const ready = (records, skippedCount = 0) => ({
  status: 'ready',
  records,
  skippedCount,
})
const listHtml = (records, over = {}) => {
  const state = over.state ?? ready(records)
  return html(
    createElement(ListView, {
      today: TODAY,
      selected: over.selected ?? TODAY,
      state,
      byDate: H.groupRecordsByDate(records),
      onSelect: noop,
      onShiftWeek: noop,
      onRetry: noop,
      ...over,
    }),
  )
}
const SAMPLE = () => [
  rec('2026-11-16', 'breakfast', food('dev-food-1')),
  rec('2026-11-16', 'lunch', food('dev-food-2')),
  rec(TODAY, 'breakfast', food('dev-food-3')),
]

test('D03: 주간 선택(주차·기간·이전/다음 주)과 월~일 7개 요일 버튼, 기록한 날·미래 표시', () => {
  const out = listHtml(SAMPLE())
  assert.match(out, /<h1[^>]*>식단 리스트<\/h1>/)
  assert.match(out, /data-week-label[^>]*>2026년 11월 3주차/)
  assert.match(out, /11\.16 ~ 11\.22/)
  assert.equal((out.match(/data-day="/g) ?? []).length, 7)
  assert.match(out, /aria-label="이전 주"/)
  // 이번 주면 다음 주는 비활성이다.
  assert.match(
    out,
    /aria-label="다음 주"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*aria-label="다음 주"/,
  )
  // 기록한 날(16일)은 글자로도 알린다. 미래(19일~)는 비활성이다.
  assert.match(out, /aria-label="11월 16일 \(월\), 기록 있음"/)
  assert.match(out, /aria-label="11월 17일 \(화\)"/)
  assert.match(out, /aria-label="11월 18일 \(수\) 오늘, 기록 있음"/)
  assert.match(
    out,
    /aria-label="11월 19일 \(목\), 선택할 수 없음"[^>]*|aria-disabled="true"[^>]*data-day="2026-11-19"/,
  )
  assert.equal(
    (
      out.match(
        /data-day="2026-11-(19|20|21|22)"[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-day="2026-11-(19|20|21|22)"/g,
      ) ?? []
    ).length,
    4,
  )
  assert.match(out, /data-week-summary[^>]*>기록한 날 2일 · 하루 평균 /)
  assert.match(out, /오늘로 이동/)
})

test('D03: 지난 날을 고르면 카드 전체가 D03-1 링크이고 끼니별 음식과 탄단지 비율을 보인다', () => {
  const out = listHtml(SAMPLE(), { selected: '2026-11-16' })
  assert.ok(hrefs(out).includes('/records/meal/previous/2026-11-16'))
  assert.match(out, /data-day-card="2026-11-16"/)
  assert.match(out, /data-day-kcal[^>]*>318kcal/)
  assert.match(out, /data-macro-share/)
  assert.match(out, /data-meal-row="breakfast"[\s\S]*현미밥/)
  assert.match(out, /data-meal-row="lunch"[\s\S]*닭가슴살/)
  assert.match(out, /data-meal-row="dinner"[\s\S]*기록 없음/)
  // 지난 날에는 D02 버튼이 없다.
  assert.ok(!hrefs(out).includes('/records/meal/record'))
})

test('D03: 오늘을 고르면 D02로 이어지는 버튼이 있고, 기록이 없으면 안내만 있다', () => {
  const out = listHtml(SAMPLE())
  assert.match(out, /오늘 식단 이어서 기록하기/)
  assert.ok(hrefs(out).includes('/records/meal/record'))
  assert.ok(!hrefs(out).some((h) => h.startsWith('/records/meal/previous')))
  const onlyPast = [rec('2026-11-16', 'lunch', food('dev-food-1'))]
  const none = listHtml(onlyPast)
  assert.match(none, /오늘은 아직 기록한 식단이 없어요/)
  assert.match(none, /오늘 식단 기록하기/)
  const empty = listHtml(onlyPast, { selected: '2026-11-17' })
  assert.match(empty, /이 날은 기록한 식단이 없어요/)
  assert.ok(!hrefs(empty).some((h) => h.startsWith('/records/meal/previous')))
})

test('D03: 등록된 식단이 하나도 없으면 주간 선택을 숨기고 등록 안내를 보인다', () => {
  const out = listHtml([])
  assert.match(out, /아직 등록된 식단이 없어요/)
  assert.match(out, /식단 등록하기/)
  assert.ok(hrefs(out).includes('/records/meal/record'))
  assert.doesNotMatch(out, /data-day="/)
  assert.doesNotMatch(out, /aria-label="이전 주"/)
})

test('D03: 불러오는 중·준비 중·실패는 서로 다른 안내이고 영양정보가 없으면 비율을 생략한다', () => {
  assert.match(listHtml([], { state: { status: 'loading' } }), /불러오는 중/)
  assert.match(
    listHtml([], { state: { status: 'unavailable' } }),
    /준비 중이에요/,
  )
  const err = listHtml([], { state: { status: 'error' } })
  assert.match(err, /role="alert"/)
  assert.match(err, /다시 시도/)
  const noNutrition = listHtml([rec('2026-11-16', 'lunch', NO_NUTRITION)], {
    selected: '2026-11-16',
  })
  assert.doesNotMatch(noNutrition, /data-macro-share/)
  assert.match(noNutrition, /비율은 보여 드리지/)
  assert.match(noNutrition, /data-day-kcal[^>]*>미산정/)
  const skipped = listHtml(SAMPLE(), { state: ready(SAMPLE(), 2) })
  assert.match(skipped, /읽을 수 없는 기록 2개/)
})

// ── D03-1 화면 ──
const prevHtml = (records, over = {}) =>
  html(
    createElement(PreviousView, {
      date: '2026-11-16',
      state: ready(records),
      records,
      meal: 'breakfast',
      previous: null,
      next: null,
      onMealChange: noop,
      onRetry: noop,
      ...over,
    }),
  )
const DAY = () => [
  rec('2026-11-16', 'breakfast', food('dev-food-1')),
  rec('2026-11-16', 'breakfast', food('dev-food-3'), 'more'),
  rec('2026-11-16', 'dinner', food('dev-food-2')),
]

test('D03-1: 지난 식단 배지·날짜·하루 영양 요약·끼니 버튼·선택한 끼니의 음식 카드를 보인다(읽기 전용)', () => {
  const out = prevHtml(DAY())
  assert.match(out, /지난 식단/)
  assert.match(out, /<h1[^>]*>11월 16일 \(월\) 식단<\/h1>/)
  assert.match(out, /data-day-kcal[^>]*>371kcal/)
  assert.match(out, /data-macro-share/)
  assert.equal((out.match(/role="radio"/g) ?? []).length, 3)
  assert.match(out, /id="prev-meal-breakfast"[^>]*aria-checked="true"/)
  // 기본은 아침이라 아침 음식만 보인다.
  assert.equal((out.match(/data-meal-record=/g) ?? []).length, 2)
  assert.match(out, /현미밥/)
  assert.match(out, /그린 샐러드/)
  assert.doesNotMatch(out, /닭가슴살/)
  assert.match(out, /보통\(1인분\) · 100g/)
  assert.match(out, /많이 · 150g/)
  assert.match(out, /음식 2개/)
  // 읽기 전용: 수정·삭제 버튼과 D02 수정 링크가 없다.
  assert.doesNotMatch(out, /수정|삭제/)
  assert.ok(!hrefs(out).some((h) => h.includes('edit=')))
})

test('D03-1: 고른 끼니만 보이고 기록 없는 끼니는 안내한다', () => {
  const dinner = prevHtml(DAY(), { meal: 'dinner' })
  assert.match(dinner, /id="prev-meal-dinner"[^>]*aria-checked="true"/)
  assert.match(dinner, /닭가슴살/)
  assert.doesNotMatch(dinner, /현미밥/)
  const lunch = prevHtml(DAY(), { meal: 'lunch' })
  assert.match(lunch, /이 끼니는 기록하지 않았어요/)
  assert.equal((lunch.match(/data-meal-record=/g) ?? []).length, 0)
})

test('D03-1: 이전·다음 기록 링크는 있는 쪽만 보이고 끼니를 유지하며 D03(고른 날짜)로 돌아갈 상태를 넘긴다', () => {
  const both = prevHtml(DAY(), {
    previous: '2026-11-10',
    next: '2026-11-17',
    meal: 'dinner',
  })
  assert.ok(
    hrefs(both).includes('/records/meal/previous/2026-11-10?meal=dinner'),
  )
  assert.ok(
    hrefs(both).includes('/records/meal/previous/2026-11-17?meal=dinner'),
  )
  assert.match(both, /이전 기록/)
  assert.match(both, /다음 기록/)
  const onlyPrev = prevHtml(DAY(), { previous: '2026-11-10' })
  assert.match(onlyPrev, /이전 기록/)
  assert.doesNotMatch(onlyPrev, /다음 기록/)
  const none = prevHtml(DAY())
  assert.doesNotMatch(none, /기록한 날 이동/)
})

test('D03-1: 지난 기록이 없거나 그 날 기록이 없으면 빈 상태, 불러오는 중·준비 중·실패는 각각 안내한다', () => {
  const noPast = prevHtml([], { date: null })
  assert.match(noPast, /지난 기록이 없어요/)
  assert.match(noPast, /식단 기록하기/)
  assert.ok(hrefs(noPast).includes('/records/meal/record'))
  const emptyDay = prevHtml([])
  assert.match(emptyDay, /이 날은 기록한 식단이 없어요/)
  assert.ok(hrefs(emptyDay).includes('/records/meal/list?date=2026-11-16'))
  assert.match(prevHtml([], { state: { status: 'loading' } }), /불러오는 중/)
  assert.match(
    prevHtml([], { state: { status: 'unavailable' } }),
    /준비 중이에요/,
  )
  const err = prevHtml([], { state: { status: 'error' } })
  assert.match(err, /role="alert"/)
  assert.match(err, /다시 시도/)
})

test('D03-1: 영양정보가 없는 음식은 0이 아니라 "열량 정보 없음"·"정보 없음"이고 합계는 불완전으로 알린다', () => {
  const out = prevHtml([
    rec('2026-11-16', 'breakfast', NO_KCAL),
    rec('2026-11-16', 'breakfast', food('dev-food-1')),
  ])
  assert.match(out, /열량 정보 없음/)
  assert.match(out, /data-day-kcal[^>]*>153kcal/)
  assert.match(out, /불완전/)
  assert.doesNotMatch(out, />0kcal</)
})

test('D03-1: 끼니별 열량 원형 그래프는 조각마다 이름·kcal·%를 글자로 보이고 합이 100이다', () => {
  const share = H.mealKcalShare(DAY())
  const out = html(createElement(Pie, { share }))
  assert.match(out, /data-meal-pie/)
  assert.match(out, /role="img"/)
  for (const label of ['아침', '저녁']) assert.match(out, new RegExp(label))
  const percents = [...out.matchAll(/font-semibold text-content">(\d+)%/g)].map(
    (m) => Number(m[1]),
  )
  assert.equal(
    percents.reduce((a, b) => a + b, 0),
    100,
  )
  // 영양소 색 토큰이 승인 전이라 임의 색(hex)을 쓰지 않는다.
  assert.doesNotMatch(out, /#[0-9a-fA-F]{6}/)
})

// ── D01 연결 ──
const dashboard = (over = {}) =>
  html(
    createElement(DashboardView, {
      localDate: TODAY,
      records: ready([]),
      recordedDays: 5,
      plans: { status: 'ready', records: [], skippedCount: 0 },
      onRetry: noop,
      ...over,
    }),
  )

test('D01: 내 식단 리스트는 기록한 날 수와 D03 링크, 즐겨찾는 음식은 P07 음식 탭 링크이고 구현된 항목에는 준비 중이 없다', () => {
  const out = dashboard()
  assert.match(out, /기록한 날 5일/)
  assert.match(out, /식단 리스트 보기/)
  assert.ok(hrefs(out).includes('/records/meal/list'))
  assert.ok(hrefs(out).includes('/favorites?tab=food'))
  const listRow = out.match(
    /aria-label="내 식단 리스트"[\s\S]*?<\/div><\/div>/,
  )[0]
  assert.doesNotMatch(listRow, /준비 중/)
  const favRow = out.match(
    /aria-label="즐겨찾는 음식"[\s\S]*?<\/div><\/div>/,
  )[0]
  assert.doesNotMatch(favRow, /준비 중/)
  // 아직 구현하지 않은 항목(식단 목표)만 준비 중이고, 내일 식단 계획은 D02-1 링크다.
  assert.match(out, /aria-label="식단 목표"[\s\S]*?준비 중/)
  const planRow = out.match(
    /aria-label="내일 식단 계획"[\s\S]*?<\/div><\/div>/,
  )[0]
  assert.doesNotMatch(planRow, /준비 중/)
  assert.ok(hrefs(out).includes('/records/meal/plan'))
  assert.equal(dashboard({ recordedDays: null }).includes('기록한 날'), false)
})

// ── 라우트 ──
test('라우트: D03·D03-1은 회원 전용 정식 화면이고 끼니 상세 경로보다 먼저 정의되어 있다', () => {
  const source = read('../src/app/router.tsx')
  const list = source.indexOf("path: 'records/meal/list'")
  const previous = source.indexOf("path: 'records/meal/previous/:date?'")
  const meal = source.indexOf("path: 'records/meal/:meal'")
  const gate = source.indexOf('element: <AuthGate />')
  assert.ok(gate > 0 && list > gate && previous > list && meal > previous)
  assert.match(
    source.slice(list, previous),
    /screenId: 'D03'[\s\S]*?parent: '\/records\/meal'/,
  )
  assert.match(
    source.slice(previous, meal),
    /screenId: 'D03-1'[\s\S]*?parent: '\/records\/meal\/list'/,
  )
})
