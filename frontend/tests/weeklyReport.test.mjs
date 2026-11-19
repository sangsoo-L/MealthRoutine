import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// I05 주간 리포트·I05-1 기록 점수: 집계·점수 순수 함수와 화면 렌더링 테스트. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Report
let Score
let ReportView
let ScoreView
// 모듈 로드 뒤(before)에 정해지는 이번 주·지난주 범위
let range
let prevRange

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
  Report = await server.ssrLoadModule('/src/ai/weeklyReport.ts')
  Score = await server.ssrLoadModule('/src/ai/weeklyScore.ts')
  ReportView = (
    await server.ssrLoadModule('/src/components/ai/weekly/WeeklyReportView.tsx')
  ).default
  ScoreView = (
    await server.ssrLoadModule('/src/components/ai/weekly/WeeklyScoreView.tsx')
  ).default
  range = Report.weekRangeFor(TODAY, 0)
  prevRange = Report.weekRangeFor(TODAY, -1)
})
after(async () => {
  await server.close()
})

const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node))
const hrefs = (html) =>
  [...html.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

// 2026-11-19(목)이 속한 주: 월 11-16 ~ 일 11-22
const TODAY = '2026-11-19'
const exRec = (performedDate) => ({ performedDate })
const mealRec = (localDate, mealType) => ({ localDate, mealType })

// ── 점수 ──────────────────────────────────────────────────────────────────────
test('점수 산식: 운동 min(기록,3)/3×50 + 식단 min(끼,21)/21×50, 총점은 합을 한 번 반올림한다', () => {
  const s = (e, m) => Score.computeWeeklyScore(e, m)
  assert.equal(s(0, 0).total, 0)
  assert.equal(s(3, 21).total, 100)
  assert.deepEqual([s(1, 0).exercisePoints, s(1, 0).total], [17, 17]) // 16.67
  assert.deepEqual([s(2, 0).exercisePoints, s(2, 0).total], [33, 33])
  assert.deepEqual([s(0, 1).mealPoints, s(0, 1).total], [2, 2]) // 2.38
  assert.equal(s(0, 21).total, 50)
  assert.equal(s(3, 0).total, 50)
  assert.equal(s(1, 4).total, 26) // 16.67 + 9.52 = 26.19
  assert.equal(s(2, 10).total, 57) // 33.33 + 23.81 = 57.14
  // 명세 예: 운동 N/50 · 식단 N/50
  assert.equal(s(3, 21).exercisePoints, 50)
  assert.equal(s(3, 21).mealPoints, 50)
})

test('점수 상한·방어: 3회·21끼를 넘는 기록은 반영하지 않고, 음수·소수·NaN은 0 이상의 정수로 본다', () => {
  const s = (e, m) => Score.computeWeeklyScore(e, m)
  assert.equal(s(10, 99).total, 100)
  assert.equal(s(10, 0).exerciseCounted, 3)
  assert.equal(s(0, 99).mealCounted, 21)
  assert.equal(s(-5, -1).total, 0)
  assert.equal(s(Number.NaN, Number.POSITIVE_INFINITY).total, 0)
  assert.equal(s(2.9, 0).exerciseCounted, 2)
})

test('등급 경계: 90↑ 아주 꾸준해요 · 70↑ 잘하고 있어요 · 40↑ 조금만 더 힘내요 · 그 외 다시 시작해요', () => {
  const g = Score.gradeOf
  assert.equal(g(100), '아주 꾸준해요')
  assert.equal(g(90), '아주 꾸준해요')
  assert.equal(g(89), '잘하고 있어요')
  assert.equal(g(70), '잘하고 있어요')
  assert.equal(g(69), '조금만 더 힘내요')
  assert.equal(g(40), '조금만 더 힘내요')
  assert.equal(g(39), '다시 시작해요')
  assert.equal(g(0), '다시 시작해요')
  // 실제 계산에서의 경계: 3회+19끼 = 50 + 45.24 = 95, 3회+8끼 = 50+19.05 = 69
  assert.equal(Score.computeWeeklyScore(3, 8).total, 69)
  assert.equal(Score.computeWeeklyScore(3, 8).grade, '조금만 더 힘내요')
  assert.equal(Score.computeWeeklyScore(3, 9).total, 71)
  assert.equal(Score.computeWeeklyScore(3, 9).grade, '잘하고 있어요')
})

test('다음 주 제안 4종: 낮은 쪽 점수 기준이고 동점은 만점 여부로 나뉜다', () => {
  const pick = (e, m) => Score.suggestionFor(Score.computeWeeklyScore(e, m))
  // 운동 점수가 더 낮음
  assert.equal(pick(0, 21), '다음 주에는 짧은 운동부터 기록해 보세요.')
  assert.equal(pick(1, 21), '다음 주에는 짧은 운동부터 기록해 보세요.')
  // 식단 점수가 더 낮음
  assert.equal(pick(3, 0), '다음 주에는 하루 한 끼부터 기록해 보세요.')
  assert.equal(pick(3, 20), '다음 주에는 하루 한 끼부터 기록해 보세요.')
  // 같은 점수·만점 아님: 0/0, 그리고 1회(16.67) = 7끼(16.67)
  const both = '다음 주에는 운동과 식단을 하나씩 기록하는 것부터 시작해 보세요.'
  assert.equal(pick(0, 0), both)
  assert.equal(pick(1, 7), both)
  assert.equal(pick(2, 14), both)
  // 양쪽 만점
  assert.equal(
    pick(3, 21),
    '이번 주 기록을 잘 이어왔어요. 다음 주에도 꾸준히 기록해 보세요.',
  )
  assert.equal(pick(9, 40), pick(3, 21))
})

// ── 집계 ──────────────────────────────────────────────────────────────────────
test('주 계산: 월~일, 기기 날짜 기준이며 이번 주는 진행 중이고 지난주는 끝난 주다', () => {
  const now = Report.weekRangeFor(TODAY, 0)
  assert.deepEqual([now.from, now.to], ['2026-11-16', '2026-11-22'])
  assert.equal(now.inProgress, true)
  assert.equal(now.today, TODAY)
  assert.match(now.label, /^2026년 11월 \d주차$/)
  const last = Report.weekRangeFor(TODAY, -1)
  assert.deepEqual([last.from, last.to], ['2026-11-09', '2026-11-15'])
  assert.equal(last.inProgress, false)
  assert.equal(last.today, null)
  // 일요일 당일은 아직 진행 중이고, 다음 날(월)이면 그 주는 끝난다.
  assert.equal(Report.weekRangeFor('2026-11-22', 0).inProgress, true)
  assert.equal(Report.weekRangeFor('2026-11-23', -1).inProgress, false)
  assert.equal(Report.weekRangeFor('2026-11-23', 0).from, '2026-11-23')
  // 오프셋 방어
  for (const [value, expected] of [
    [undefined, 0],
    ['abc', 0],
    ['1', 0],
    ['-2', -2],
    [-1.5, 0],
    ['-9999', -104],
  ]) {
    assert.equal(Report.clampWeekOffset(value), expected, String(value))
  }
})

test('운동 집계: 완료 기록 1건 = 1회(같은 날 2건은 2회)이고 주 경계(월 00시·일 24시) 밖은 세지 않는다', () => {
  const range = Report.weekRangeFor(TODAY, 0)
  const week = Report.summarizeExerciseWeek(range, [
    exRec('2026-11-15'), // 지난 일요일
    exRec('2026-11-16'), // 월
    exRec('2026-11-16'), // 같은 날 두 번째
    exRec('2026-11-19'),
    exRec('2026-11-22'), // 일
    exRec('2026-11-23'), // 다음 월요일
  ])
  assert.equal(week.count, 4)
  assert.deepEqual(
    week.days.map((d) => d.count),
    [2, 0, 0, 1, 0, 0, 1],
  )
  assert.equal(week.activeDays, 3)
  assert.equal(week.lastDate, '2026-11-22')
  const empty = Report.summarizeExerciseWeek(range, [])
  assert.equal(empty.count, 0)
  assert.equal(empty.lastDate, null)
  assert.equal(empty.activeDays, 0)
})

test('식단 집계: 같은 날짜·같은 끼니는 1끼, 3끼(아침·점심·저녁) 밖의 값은 세지 않고 주 최대는 21끼다', () => {
  const range = Report.weekRangeFor(TODAY, 0)
  const week = Report.summarizeMealWeek(range, [
    mealRec('2026-11-16', 'breakfast'),
    mealRec('2026-11-16', 'breakfast'), // 같은 끼니 중복
    mealRec('2026-11-16', 'breakfast'),
    mealRec('2026-11-16', 'dinner'),
    mealRec('2026-11-17', 'lunch'),
    mealRec('2026-11-17', 'snack'), // 3끼 밖
    mealRec('2026-11-18', 'other'), // 3끼 밖
    mealRec('2026-11-15', 'lunch'), // 지난 주
    mealRec('2026-11-23', 'lunch'), // 다음 주
  ])
  assert.equal(week.slotCount, 3)
  assert.deepEqual(week.days[0].meals, {
    breakfast: true,
    lunch: false,
    dinner: true,
  })
  assert.equal(week.days[0].count, 2)
  assert.equal(week.days[1].count, 1)
  assert.equal(week.days[2].count, 0)
  assert.equal(week.recordedDays, 2)
  assert.equal(week.lastDate, '2026-11-17')
  // 한 주를 모두 채우면 21끼(기록이 여러 건이어도 넘지 않는다)
  const all = []
  for (let i = 0; i < 7; i += 1) {
    const date = `2026-11-${16 + i}`
    for (const meal of ['breakfast', 'lunch', 'dinner'])
      all.push(mealRec(date, meal), mealRec(date, meal))
  }
  assert.equal(Report.summarizeMealWeek(range, all).slotCount, 21)
})

test('지난주 비교: 비교할 지난주 기록이 없으면 증감을 생략하고, 있으면 차이만 낸다', () => {
  assert.equal(Report.changeFromPrevious(3, null), null)
  assert.equal(Report.changeFromPrevious(3, 0), null) // 0에서 늘었다고 단정하지 않는다
  assert.equal(Report.changeFromPrevious(3, 2), 1)
  assert.equal(Report.changeFromPrevious(1, 2), -1)
  assert.equal(Report.changeFromPrevious(2, 2), 0)
})

// ── 화면 ──────────────────────────────────────────────────────────────────────
const exerciseWeek = (dates) =>
  Report.summarizeExerciseWeek(range, dates.map(exRec))
const mealWeek = (items) =>
  Report.summarizeMealWeek(
    range,
    items.map(([d, m]) => mealRec(d, m)),
  )
const readyExercise = (dates, previousDates = []) => ({
  status: 'ready',
  skippedCount: 0,
  current: exerciseWeek(dates),
  previous: Report.summarizeExerciseWeek(prevRange, previousDates.map(exRec)),
})
const readyMeal = (items, previousItems = []) => ({
  status: 'ready',
  skippedCount: 0,
  current: mealWeek(items),
  previous: Report.summarizeMealWeek(
    prevRange,
    previousItems.map(([d, m]) => mealRec(d, m)),
  ),
})
const noop = () => {}
const reportHtml = (over = {}) =>
  render(
    createElement(ReportView, {
      range,
      today: TODAY,
      exercise: readyExercise(['2026-11-16', '2026-11-17']),
      meal: readyMeal([['2026-11-16', 'breakfast']]),
      goal: { status: 'none' },
      onOffsetChange: noop,
      onRetryExercise: noop,
      onRetryMeal: noop,
      scoreTo: '/ai/weekly-report/score',
      ...over,
    }),
  )

test('I05: 기록 카드 2장·주간 이동·평가 기준·평가하기가 있고 개인 목표가 없으면 목표 대비를 만들지 않는다', () => {
  const html = reportHtml()
  assert.match(html, /<h1[^>]*>주간 리포트<\/h1>/)
  assert.match(html, /data-exercise-count="2"/)
  assert.match(html, /data-meal-count="1"/)
  assert.match(html, /aria-label="이전 주"/)
  assert.match(html, /aria-label="다음 주"/)
  assert.match(html, /진행 중/)
  assert.match(html, /이렇게 평가해요/)
  assert.match(html, /운동 주 3회[\s\S]*50점/)
  assert.match(html, /식단 주 21끼[\s\S]*50점/)
  assert.match(html, />평가하기</)
  assert.ok(hrefs(html).includes('/ai/weekly-report/score'))
  assert.doesNotMatch(html, /data-goal-progress|개인 목표 주/)
  // 식단 목표가 없으므로 목표 칼로리·영양소 수치를 만들지 않는다.
  assert.doesNotMatch(html, /kcal|목표 열량/)
  // 요일별 기록(운동 7칸·식단 7행)
  assert.equal((html.match(/data-exercise-day=/g) ?? []).length, 7)
  assert.equal((html.match(/data-meal-day=/g) ?? []).length, 7)
})

test('I05: 개인 운동 목표(W01-1 daysPerWeek)가 있을 때만 목표 대비를 보이고 점수 기준(3회)과 따로 표시한다', () => {
  const html = reportHtml({ goal: { status: 'ready', daysPerWeek: 5 } })
  assert.match(html, /data-goal-progress/)
  // 개인 목표는 '회'가 아니라 운동한 '날' 기준이다(기록 2회·이틀 → 2일).
  assert.doesNotMatch(html, /\/ 목표 5회/)
  assert.match(html, /개인 목표 주 5일 · 운동한 날 2일 · 목표까지 3일/)
  assert.match(html, /aria-valuemax="5"/)
  // 점수 기준 안내는 목표와 무관하게 고정 3회·21끼다.
  assert.match(html, /운동 주 3회/)
  const reached = reportHtml({
    goal: { status: 'ready', daysPerWeek: 2 },
  })
  assert.match(reached, /목표 달성/)
  assert.doesNotMatch(reached, /목표까지/)
  // 목표를 읽지 못하거나 아직 읽는 중이어도 목표 대비를 만들지 않는다.
  for (const status of ['loading', 'error', 'unavailable', 'none'])
    assert.doesNotMatch(reportHtml({ goal: { status } }), /data-goal-progress/)
})

test('I05: 같은 날 운동 2회는 기록 2회·개인 목표 진행 1일이고, 목표가 없으면 진행 막대가 없다', () => {
  const html = reportHtml({
    exercise: readyExercise(['2026-11-16', '2026-11-16']),
    goal: { status: 'ready', daysPerWeek: 3 },
  })
  assert.match(html, /data-exercise-count="2"/)
  assert.match(html, /운동한 날 1일 · 목표까지 2일/)
  assert.match(html, /aria-valuenow="1"/)
  assert.match(html, /aria-valuetext="1일 \/ 목표 3일"/)
  assert.match(html, /width:33\.3/)
  const none = reportHtml({
    exercise: readyExercise(['2026-11-16', '2026-11-16']),
    goal: { status: 'none' },
  })
  assert.doesNotMatch(none, /data-goal-progress/)
  // 점수 기준(완료 세션 수)은 목표와 무관하다: 같은 날 2회 → 운동 2회.
  assert.equal(Score.computeWeeklyScore(2, 0).exerciseCounted, 2)
})

test('I05: 지난주 증감은 비교할 지난주 기록이 있을 때만 보인다', () => {
  const without = reportHtml()
  assert.doesNotMatch(without, /지난주보다|지난주와 같아요/)
  const withPrev = reportHtml({
    exercise: readyExercise(
      ['2026-11-16', '2026-11-17', '2026-11-18'],
      ['2026-11-09'],
    ),
    meal: readyMeal(
      [['2026-11-16', 'breakfast']],
      [
        ['2026-11-09', 'breakfast'],
        ['2026-11-09', 'lunch'],
      ],
    ),
  })
  assert.match(withPrev, /지난주보다 \+2회/)
  assert.match(withPrev, /지난주보다 −1끼/)
})

test('I05: 기록이 없으면 이번 주는 기록 CTA, 지난 주는 안내만 보이고 0·미실천으로 쓰지 않는다', () => {
  const now = reportHtml({
    exercise: readyExercise([]),
    meal: readyMeal([]),
  })
  assert.match(now, /아직 이번 주 운동 기록이 없어요/)
  assert.match(now, /아직 이번 주 식단 기록이 없어요/)
  assert.ok(hrefs(now).includes('/records/exercise'))
  assert.ok(hrefs(now).includes('/records/meal/record'))
  assert.doesNotMatch(now, /미실천|실천하지 못/)
  const past = render(
    createElement(ReportView, {
      range: prevRange,
      today: TODAY,
      exercise: readyExercise([]),
      meal: readyMeal([]),
      goal: { status: 'none' },
      onOffsetChange: noop,
      onRetryExercise: noop,
      onRetryMeal: noop,
      scoreTo: '/ai/weekly-report/score?offset=-1',
    }),
  )
  assert.match(past, /이 주에는 운동 기록이 없어요/)
  assert.match(past, /이 주에는 식단 기록이 없어요/)
  assert.ok(!hrefs(past).includes('/records/exercise'))
  assert.doesNotMatch(past, /진행 중/)
})

test('I05: 운동·식단은 로딩·오류·사용 불가를 따로 보이고 한쪽 실패가 다른 쪽을 가리지 않는다', () => {
  const loading = reportHtml({
    exercise: { status: 'loading' },
    meal: { status: 'loading' },
  })
  assert.match(loading, /운동 기록을 불러오는 중이에요/)
  assert.match(loading, /식단 기록을 불러오는 중이에요/)
  assert.doesNotMatch(loading, /data-exercise-count|data-meal-count/)
  const mixed = reportHtml({
    exercise: { status: 'error' },
    meal: readyMeal([['2026-11-16', 'lunch']]),
  })
  assert.match(mixed, /role="alert"/)
  assert.match(mixed, /운동 기록을 불러오지 못했어요/)
  assert.equal((mixed.match(/>다시 시도</g) ?? []).length, 1)
  assert.match(mixed, /data-meal-count="1"/)
  assert.doesNotMatch(mixed, /data-exercise-count/)
  const off = reportHtml({
    exercise: { status: 'unavailable' },
    meal: { status: 'unavailable' },
  })
  assert.match(off, /주간 운동 기록을 보여 드릴 수 없어요/)
  assert.match(off, /주간 식단 기록을 보여 드릴 수 없어요/)
})

const scoreHtml = (phase, over = {}) =>
  render(
    createElement(ScoreView, {
      range,
      today: TODAY,
      phase,
      exercise: readyExercise([]),
      meal: readyMeal([]),
      onRetryExercise: noop,
      onRetryMeal: noop,
      reportTo: '/ai/weekly-report',
      ...over,
    }),
  )
const resultPhase = (e, m, inProgress = true) => {
  const exercise = exerciseWeek(e)
  const meal = mealWeek(m)
  return {
    kind: 'result',
    score: Score.computeWeeklyScore(exercise.count, meal.slotCount),
    exercise,
    meal,
  }
}

test('I05-1: 계산 중에는 단계 3개를 보이고 점수는 아직 보이지 않는다', () => {
  const html = scoreHtml({ kind: 'calculating', step: 2 })
  assert.match(html, /주간 기록을 평가하고 있어요/)
  assert.match(html, /AI 없이 기록 수로 계산해요/)
  assert.match(html, /data-calc-step="done"[^>]*>[\s\S]*?운동 기록/)
  assert.match(html, /data-calc-step="active"[^>]*>[\s\S]*?식단 기록/)
  assert.match(html, /data-calc-step="wait"[^>]*>[\s\S]*?점수 계산/)
  assert.match(html, /motion-reduce:animate-none/)
  assert.doesNotMatch(html, /data-score-ring|다음 주 한 가지 제안/)
})

test('I05-1: 결과는 점수 링·등급·구성·요일별 기록·다음 주 제안을 보이고 AI 심층 코칭은 준비 중 안내뿐이다', () => {
  const phase = resultPhase(
    ['2026-11-16', '2026-11-17', '2026-11-18'],
    [
      ['2026-11-16', 'breakfast'],
      ['2026-11-16', 'lunch'],
      ['2026-11-17', 'dinner'],
    ],
  )
  const html = scoreHtml(phase)
  const total = Score.computeWeeklyScore(3, 3).total // 50 + 7.14 = 57
  assert.equal(total, 57)
  assert.match(html, new RegExp(`data-score-ring="${total}"`))
  assert.match(html, /aria-label="기록 점수 100점 만점에 57점"/)
  assert.match(html, /data-score-grade="조금만 더 힘내요"/)
  assert.match(html, /data-score-part="exercise"[\s\S]*?50<[\s\S]*?\/50점/)
  assert.match(html, /data-score-rounding-note/)
  assert.match(html, /운동 3회 \/ 3회/)
  assert.match(html, /식단 3끼 \/ 21끼/)
  assert.equal((html.match(/data-score-day=/g) ?? []).length, 7)
  assert.match(html, /다음 주에는 하루 한 끼부터 기록해 보세요\./)
  // 진행 중인 주 안내
  assert.match(html, /data-score-in-progress/)
  assert.match(html, /지금까지의 기록 기준/)
  // 심층 코칭: 준비 중, 버튼·체험 횟수 없음
  assert.match(html, /AI 심층 코칭/)
  assert.match(html, />준비 중</)
  assert.doesNotMatch(html, /<button|남은 체험|심층 분석하기/)
  assert.deepEqual(hrefs(html), ['/ai/weekly-report'])
})

test('I05-1: 구성 점수는 소수 첫째 자리까지 보이고 총점은 원점수 합을 한 번 반올림한다(운동 1회·식단 4끼)', () => {
  const score = Score.computeWeeklyScore(1, 4)
  assert.equal(score.total, 26) // 16.67 + 9.52 = 26.19
  assert.equal(Score.formatPoints(score.exerciseRaw), '16.7')
  assert.equal(Score.formatPoints(score.mealRaw), '9.5')
  assert.equal(Score.formatPoints(50), '50')
  assert.equal(Score.formatPoints(0), '0')
  // 총점·등급·제안 판정은 기존 정책 그대로
  assert.equal(score.grade, '다시 시작해요')
  assert.equal(
    Score.suggestionFor(score),
    '다음 주에는 하루 한 끼부터 기록해 보세요.',
  )
  const exercise = exerciseWeek(['2026-11-16'])
  const meal = mealWeek([
    ['2026-11-16', 'breakfast'],
    ['2026-11-16', 'lunch'],
    ['2026-11-17', 'breakfast'],
    ['2026-11-17', 'dinner'],
  ])
  const html = scoreHtml({ kind: 'result', score, exercise, meal })
  assert.match(html, /data-score-ring="26"/)
  assert.match(html, /data-score-part="exercise"[\s\S]*?16\.7[\s\S]*?\/50점/)
  assert.match(html, /data-score-part="meal"[\s\S]*?9\.5[\s\S]*?\/50점/)
  assert.match(html, /소수 첫째 자리까지 보여 줘요/)
  assert.match(html, /한 번\s*반올림/)
  assert.match(html, /aria-valuetext="16\.7점 \/ 50점"/)
  // 표시한 구성 점수(16.7+9.5=26.2)로 총점을 다시 계산하지 않는다.
  assert.doesNotMatch(html, /data-score-ring="26\.2"/)
})

test('I05-1: 기록이 없으면 0점과 미기록 안내를 구분하고, 3회를 넘는 기록은 반영 한도를 알린다', () => {
  const none = scoreHtml(resultPhase([], []))
  assert.match(none, /data-score-ring="0"/)
  assert.match(none, /data-score-grade="다시 시작해요"/)
  assert.match(none, /data-score-empty/)
  assert.match(none, /기록이 없는 것이지 실천하지 않았다는 뜻은 아니에요/)
  const over = scoreHtml(
    resultPhase(
      ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-19'],
      [],
    ),
  )
  assert.match(over, /운동 5회 \/ 3회 \(3회까지 반영\)/)
  assert.doesNotMatch(over, /data-score-empty/)
  // 끝난 주는 진행 중 안내가 없다
  const finishedRange = Report.weekRangeFor(TODAY, -1)
  const finished = scoreHtml(resultPhase([], []), { range: finishedRange })
  assert.doesNotMatch(finished, /data-score-in-progress/)
})

test('I05-1: 기록을 읽지 못하면 점수를 만들지 않고 오류·다시 시도를 보인다', () => {
  const html = scoreHtml(
    { kind: 'error' },
    { exercise: { status: 'error' }, meal: readyMeal([]) },
  )
  assert.match(html, /data-score-error/)
  assert.match(html, /기록을 불러오지 못했어요/)
  assert.match(html, />운동 기록 다시 시도</)
  assert.doesNotMatch(html, /data-score-ring|0점이에요/)
  const off = scoreHtml(
    { kind: 'error' },
    { exercise: { status: 'unavailable' }, meal: { status: 'unavailable' } },
  )
  assert.match(off, /점수를 계산할 수 없어요/)
  assert.doesNotMatch(off, /다시 시도/)
})

// ── 구조·범위 ─────────────────────────────────────────────────────────────────
test('구조: 계산 계층은 화면·저장소를 모르고 화면은 계산을 하지 않으며 저장소·API·체험 횟수 처리가 없다', () => {
  for (const file of [
    '../src/ai/weeklyReport.ts',
    '../src/ai/weeklyScore.ts',
  ]) {
    assert.doesNotMatch(
      code(file),
      /from 'react'|indexedDB|fetch\(|localStorage|sessionStorage/,
      file,
    )
  }
  for (const file of [
    '../src/ai/useWeeklyReport.ts',
    '../src/ai/useCalcSteps.ts',
    '../src/components/ai/weekly/WeeklyReportView.tsx',
    '../src/components/ai/weekly/WeeklyScoreView.tsx',
    '../src/pages/WeeklyReportPage.tsx',
    '../src/pages/WeeklyScorePage.tsx',
  ]) {
    assert.doesNotMatch(
      code(file),
      /indexedDB|localStorage|sessionStorage|fetch\(|\/api\/|\.create\(|\.update\(|\.delete\(|getExercisePlanAccess|getPhotoAnalysisAccess/,
      file,
    )
  }
  // 점수 계산은 화면 파일에 없다(순수 함수만 호출).
  assert.doesNotMatch(
    code('../src/components/ai/weekly/WeeklyScoreView.tsx'),
    /Math\.round|\/ 21|\* 50/,
  )
  // 기존 저장소 조회 훅 재사용
  const hook = code('../src/ai/useWeeklyReport.ts')
  assert.match(hook, /useRecordsInRange/)
  assert.match(hook, /useAllMealRecords/)
  assert.match(hook, /useExerciseGoalSummary/)
  // DB는 v6 그대로다.
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
})

test('라우트·진입점: I05·I05-1은 회원 전용(AuthGate 안)이고 W01·D01·I01에서 I05로 들어간다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const report = router.indexOf("path: 'ai/weekly-report',")
  const score = router.indexOf("path: 'ai/weekly-report/score',")
  const aiPage = router.indexOf("path: 'ai',")
  assert.ok(gate > 0 && report > gate && score > report)
  assert.ok(aiPage > 0) // I01은 공개 라우트(AuthGate 밖)라는 점은 Chrome 확인으로 본다
  assert.match(router.slice(report, report + 400), /screenId: 'I05'/)
  assert.match(router.slice(score, score + 400), /screenId: 'I05-1'/)
  assert.match(
    router.slice(score, score + 500),
    /parent: '\/ai\/weekly-report'/,
  )
  const w01 = read(
    '../src/components/exercise/dashboard/WeeklyExerciseSection.tsx',
  )
  assert.match(w01, /주간 리포트 보기/)
  assert.match(
    read('../src/pages/ExerciseDashboardPage.tsx'),
    /reportTo=\{usingSample \? undefined : weeklyReportPath\(\)\}/,
  )
  assert.match(
    read('../src/components/food/MealDashboardView.tsx'),
    /to=\{PATH_WEEKLY_REPORT\}/,
  )
  assert.match(
    read('../src/components/ai/aiIntroContent.ts'),
    /to: '\/ai\/weekly-report'/,
  )
})
