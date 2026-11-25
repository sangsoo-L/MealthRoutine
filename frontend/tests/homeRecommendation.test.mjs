// 회원 홈 "오늘의 추천" 개인화: 추천 규칙(우선순위·충돌·결정성), 읽지 못한 값과 기록 없음의 구분, 계정 분리, 잘못된 입력, 배너 표시,
// PIN 보호 데이터 비접근, 운영 환경의 저장 수단 부재를 확인한다. 외부 AI·서버·실제 사용자 데이터는 쓰지 않는다.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, policy, catalog, Banner, Personalized
const TODAY = '2026-11-18' // 수요일. 이번 주는 11-16(월)~11-22(일)
const ME = 'member-a'

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  policy = await server.ssrLoadModule(
    '/src/components/home/homeRecommendationPolicy.ts',
  )
  catalog = await server.ssrLoadModule(
    '/src/components/home/homeRecommendation.ts',
  )
  Banner = (
    await server.ssrLoadModule(
      '/src/components/home/HomeRecommendationBanner.tsx',
    )
  ).default
  Personalized = (
    await server.ssrLoadModule(
      '/src/components/home/HomePersonalizedRecommendation.tsx',
    )
  ).default
})
after(async () => {
  await server?.close()
})

const ready = (value) => ({ status: 'ready', value })
const counts = (o = {}) => ({
  total: 0,
  today: 0,
  week: 0,
  unreadable: 0,
  ...o,
})
const NONE = ready(counts())
const goal = (set, settable = true) => ready({ set, settable })
const input = (o = {}) => ({
  today: TODAY,
  exercise: NONE,
  meal: NONE,
  exerciseGoal: goal(true),
  ...o,
})
const pick = (o) => policy.selectHomeRecommendation(input(o)).id
const exerciseRecord = (date, owner = ME) => ({
  ownerId: owner,
  performedDate: date,
})
const mealRecord = (date, owner = ME) => ({ ownerId: owner, localDate: date })

// ── 추천 유형과 우선순위 ─────────────────────────────────────────────────
test('A 첫 운동: 운동 기록이 없다고 확인되고 식단 기록은 있다고 확인되지 않으면 운동 찾기', () => {
  assert.equal(pick({}), 'first-exercise')
  const rec = policy.selectHomeRecommendation(input())
  assert.equal(rec.title, '첫 운동을 시작해 볼까요?')
  assert.equal(rec.href, '/exercises')
  assert.equal(rec.ctaLabel, '운동 찾아보기')
  assert.equal(rec.emoji, '💪')
  // 식단 기록을 읽지 못했어도 운동 기록이 없다는 사실은 그대로라 A다(식단에 대해서는 말하지 않는다).
  assert.equal(pick({ meal: { status: 'error' } }), 'first-exercise')
  assert.equal(pick({ meal: { status: 'unavailable' } }), 'first-exercise')
})
test('B 식단 기록: 오늘 식단 기록이 없다고 확인되면 식단 기록(운동 기록이 이미 있는 사용자)', () => {
  const exercise = ready(counts({ total: 3, today: 1, week: 2 }))
  const rec = policy.selectHomeRecommendation(input({ exercise }))
  assert.equal(rec.id, 'record-meal')
  assert.equal(rec.title, '오늘 먹은 음식을 기록해 보세요')
  assert.equal(rec.href, '/records/meal')
  assert.equal(rec.ctaLabel, '식단 기록하기')
  assert.equal(rec.emoji, '🍽️')
})
test('C 운동 기록: 식단은 오늘 기록했고 오늘 운동 기록이 없다고 확인되면 운동 기록', () => {
  const exercise = ready(counts({ total: 3, week: 2 }))
  const meal = ready(counts({ total: 5, today: 2, week: 4 }))
  const rec = policy.selectHomeRecommendation(input({ exercise, meal }))
  assert.equal(rec.id, 'record-exercise')
  assert.equal(rec.title, '오늘의 활동을 기록해 볼까요?')
  assert.equal(rec.href, '/records/exercise')
  assert.equal(rec.emoji, '🏋️')
})
test('D 목표 설정: 오늘 기록을 마쳤고 운동 목표가 없으며 목표 화면을 열 수 있을 때만', () => {
  const exercise = ready(counts({ total: 3, today: 1, week: 2 }))
  const meal = ready(counts({ total: 5, today: 2, week: 4 }))
  const rec = policy.selectHomeRecommendation(
    input({ exercise, meal, exerciseGoal: goal(false) }),
  )
  assert.equal(rec.id, 'set-exercise-goal')
  assert.equal(rec.href, '/records/exercise/goal')
  assert.equal(rec.returnHome, true)
  assert.equal(rec.emoji, '🎯')
  // 목표 화면의 선행 조건(건강 목표·이해도 확인)이 없으면 막힌 화면으로 보내지 않는다.
  assert.equal(
    pick({ exercise, meal, exerciseGoal: goal(false, false) }),
    'weekly-review',
  )
  // 목표가 이미 있으면 권하지 않는다.
  assert.equal(
    pick({ exercise, meal, exerciseGoal: goal(true) }),
    'weekly-review',
  )
})
test('E 주간 활동: 이번 주 기록이 있으면 주간 리포트이고 설명은 기록이 있는 쪽만 말한다', () => {
  const done = counts({ total: 4, today: 1, week: 2 })
  const both = policy.selectHomeRecommendation(
    input({ exercise: ready(done), meal: ready(done) }),
  )
  assert.equal(both.id, 'weekly-review')
  assert.equal(both.href, '/ai/weekly-report')
  assert.equal(both.returnHome, true)
  assert.equal(both.emoji, '📊')
  assert.equal(
    both.description,
    '지금까지 남긴 운동과 식단 기록을 확인해 보세요.',
  )
  const exerciseOnly = policy.selectHomeRecommendation(
    input({
      exercise: ready(done),
      meal: ready(counts({ total: 2, today: 1 })),
    }),
  )
  assert.equal(
    exerciseOnly.description,
    '이번 주에 남긴 운동 기록을 확인해 보세요.',
  )
  const mealOnly = policy.selectHomeRecommendation(
    input({
      exercise: ready(counts({ total: 2, today: 1 })),
      meal: ready(done),
    }),
  )
  assert.equal(
    mealOnly.description,
    '이번 주에 남긴 식단 기록을 확인해 보세요.',
  )
})
test('F 기본: 개인화할 상태가 없으면 기존 기본 추천이다', () => {
  const settled = ready(counts({ total: 4, today: 1 })) // 이번 주 기록 없음(오래된 기록)
  const rec = policy.selectHomeRecommendation(
    input({ exercise: settled, meal: settled }),
  )
  assert.equal(rec, catalog.DEFAULT_RECOMMENDATION)
  assert.equal(rec.title, '오늘은 가볍게 운동부터 시작해 볼까요?')
  assert.equal(rec.href, '/exercises')
})

// ── 우선순위·충돌 ────────────────────────────────────────────────────────
test('조건이 겹치면 우선순위가 높은 추천이 선택된다', () => {
  // 운동·식단 모두 오늘 기록 없음 + 목표 없음 + 이번 주 기록 있음: A 조건은 아니고(기록 있음) B가 C·D·E보다 먼저다.
  const exercise = ready(counts({ total: 3, week: 1 }))
  const meal = ready(counts({ total: 3, week: 1 }))
  assert.equal(
    pick({ exercise, meal, exerciseGoal: goal(false) }),
    'record-meal',
  )
  // 식단만 오늘 기록하면 C(운동 기록)가 D·E보다 먼저다.
  const mealToday = ready(counts({ total: 3, today: 1, week: 1 }))
  assert.equal(
    pick({ exercise, meal: mealToday, exerciseGoal: goal(false) }),
    'record-exercise',
  )
  // 기록이 하나도 없으면 A가 B·C(오늘 기록 없음)보다 먼저다.
  assert.equal(pick({ exerciseGoal: goal(false) }), 'first-exercise')
})
test('우선순위 표는 A→B→C→D→E 순서이고 기본 추천은 표 밖이다', () => {
  assert.deepEqual(
    policy.HOME_RECOMMENDATION_PRIORITY.map((rule) => rule.id),
    [
      'first-exercise',
      'record-meal',
      'record-exercise',
      'set-exercise-goal',
      'weekly-review',
    ],
  )
})
test('같은 상태는 항상 같은 추천이다(무작위·시각 의존 없음)', () => {
  const states = [
    input(),
    input({ exercise: ready(counts({ total: 2, week: 1 })) }),
    input({ meal: { status: 'error' }, exercise: { status: 'loading' } }),
  ]
  for (const state of states) {
    const first = JSON.stringify(policy.selectHomeRecommendation(state))
    for (let i = 0; i < 20; i++)
      assert.equal(
        JSON.stringify(policy.selectHomeRecommendation(structuredClone(state))),
        first,
      )
  }
})

// ── 읽지 못한 값과 "기록 없음"의 구분 ────────────────────────────────────
test('읽는 중·연결 전·조회 실패는 기록 없음으로 보지 않고 기본 추천이다', () => {
  for (const status of ['loading', 'unavailable', 'error']) {
    const fact = { status }
    assert.equal(
      pick({ exercise: fact, meal: fact, exerciseGoal: fact }),
      'start-with-exercise',
      `${status}`,
    )
  }
})
test('운동만 읽지 못하면 첫 운동·운동 기록 안내를 하지 않고, 식단은 읽은 값으로 안내한다', () => {
  for (const status of ['loading', 'unavailable', 'error']) {
    // 오늘 식단이 없다고 확인되면 B는 가능하다(식단 사실은 읽었다). A·C는 운동을 읽지 못해 불가능하다.
    assert.equal(pick({ exercise: { status } }), 'record-meal', status)
    const mealToday = ready(counts({ total: 2, today: 1, week: 1 }))
    assert.equal(
      pick({ exercise: { status }, meal: mealToday, exerciseGoal: goal(true) }),
      'weekly-review',
      status,
    )
  }
})
test('식단만 읽지 못하면 오늘 식단 기록 안내를 하지 않는다', () => {
  const exercise = ready(counts({ total: 3, today: 1, week: 2 }))
  for (const status of ['loading', 'unavailable', 'error'])
    assert.equal(pick({ exercise, meal: { status } }), 'weekly-review', status)
})
test('목표를 읽지 못하면 목표 설정을 권하지 않는다', () => {
  const exercise = ready(counts({ total: 3, today: 1 }))
  const meal = ready(counts({ total: 3, today: 1 }))
  for (const status of ['loading', 'unavailable', 'error'])
    assert.equal(
      pick({ exercise, meal, exerciseGoal: { status } }),
      'start-with-exercise',
      status,
    )
})
test('읽을 수 없는 기록이 있으면 "오늘 기록 없음"을 확인할 수 없어 기록 안내를 하지 않는다', () => {
  const exercise = ready(counts({ total: 3, today: 1, week: 1 }))
  const meal = ready(counts({ total: 2, today: 0, week: 1, unreadable: 1 }))
  assert.equal(pick({ exercise, meal }), 'weekly-review')
  // 운동 기록이 읽을 수 없는 행뿐이면 "없음"이 아니다.
  assert.equal(
    pick({ exercise: ready(counts({ unreadable: 2 })), meal: NONE }),
    'record-meal',
  )
})

// ── 요약(정규화)·계정 분리·잘못된 데이터 ─────────────────────────────────
test('운동 기록 요약: 오늘·이번 주(월~일)·전체를 세고 같은 날 여러 건도 건수로 센다', () => {
  const c = policy.summarizeExerciseActivity(
    [
      exerciseRecord('2026-11-18'),
      exerciseRecord('2026-11-18'),
      exerciseRecord('2026-11-16'), // 이번 주 월요일
      exerciseRecord('2026-11-15'), // 지난 주 일요일
      exerciseRecord('2026-10-01'),
    ],
    0,
    TODAY,
    ME,
  )
  assert.deepEqual(c, { total: 5, today: 2, week: 3, unreadable: 0 })
})
test('식단 기록 요약: 날짜 기준으로 오늘·이번 주를 센다', () => {
  const c = policy.summarizeMealActivity(
    [
      mealRecord('2026-11-18'),
      mealRecord('2026-11-22'),
      mealRecord('2026-11-23'),
    ],
    1,
    TODAY,
    ME,
  )
  assert.deepEqual(c, { total: 3, today: 1, week: 2, unreadable: 1 })
})
test('다른 계정의 기록은 세지 않고 읽을 수 없는 기록으로 취급한다', () => {
  const c = policy.summarizeExerciseActivity(
    [
      exerciseRecord('2026-11-18', 'someone-else'),
      exerciseRecord('2026-11-17'),
    ],
    0,
    TODAY,
    ME,
  )
  assert.deepEqual(c, { total: 1, today: 0, week: 1, unreadable: 1 })
  // 다른 계정의 기록뿐이면 이 계정의 "기록 없음"이 아니라 확인할 수 없는 상태다 → A를 권하지 않는다.
  const onlyOthers = policy.summarizeExerciseActivity(
    [exerciseRecord('2026-11-18', 'someone-else')],
    0,
    TODAY,
    ME,
  )
  assert.equal(
    pick({
      exercise: ready(onlyOthers),
      meal: ready(counts({ total: 1, today: 1 })),
    }),
    'start-with-exercise',
  )
})
test('날짜가 잘못된 기록·비어 있는 항목은 읽을 수 없는 기록으로 세고 오류 없이 처리한다', () => {
  const c = policy.summarizeMealActivity(
    [
      mealRecord('2026-11-18'),
      mealRecord('not-a-date'),
      mealRecord(undefined),
      null,
      undefined,
    ],
    NaN,
    TODAY,
    ME,
  )
  assert.deepEqual(c, { total: 1, today: 1, week: 1, unreadable: 4 })
  // 오늘 날짜가 올바르지 않으면 오늘·이번 주를 세지 않는다.
  assert.deepEqual(
    policy.summarizeMealActivity([mealRecord('2026-11-18')], 0, 'bad', ME),
    { total: 1, today: 0, week: 0, unreadable: 0 },
  )
})
test('잘못된 입력은 개인화하지 않고 기본 추천으로 돌아간다', () => {
  const broken = [
    null,
    undefined,
    {},
    { today: 'bad', exercise: NONE, meal: NONE, exerciseGoal: goal(false) },
    input({ exercise: undefined }),
    input({ meal: null }),
  ]
  for (const value of broken)
    assert.equal(
      policy.selectHomeRecommendation(value).id,
      'start-with-exercise',
    )
})
test('값이 이상한 사실(음수·숫자 아님·비어 있음)은 확인된 사실로 쓰지 않는다', () => {
  // 운동 사실이 이상하면 운동 기반 안내(A·C)는 하지 않고, 올바른 식단 사실로만 판단한다.
  for (const value of [
    { total: -1, today: 0, week: 0, unreadable: 0 },
    { total: 'x', today: 0, week: 0, unreadable: 0 },
    { total: 1.5, today: 0, week: 0, unreadable: 0 },
    null,
    {},
  ])
    assert.equal(pick({ exercise: ready(value) }), 'record-meal')
  // 식단 사실까지 이상하면 기본 추천이다.
  assert.equal(
    pick({ exercise: ready(null), meal: ready({ total: NaN }) }),
    'start-with-exercise',
  )
})

// ── 문구·경로 ────────────────────────────────────────────────────────────
test('모든 추천의 문구는 부담을 주지 않고 이동 경로는 라우터에 있는 정식 화면이다', () => {
  const router = readFileSync(join(process.cwd(), 'src/app/router.tsx'), 'utf8')
  const all = [
    catalog.DEFAULT_RECOMMENDATION,
    catalog.FIRST_EXERCISE_RECOMMENDATION,
    catalog.RECORD_MEAL_RECOMMENDATION,
    catalog.RECORD_EXERCISE_RECOMMENDATION,
    catalog.SET_GOAL_RECOMMENDATION,
    catalog.weeklyReviewRecommendation({ exercise: true, meal: true }),
    catalog.weeklyReviewRecommendation({ exercise: true, meal: false }),
    catalog.weeklyReviewRecommendation({ exercise: false, meal: true }),
  ]
  for (const rec of all) {
    assert.equal(rec.availability, 'available', rec.id)
    assert.equal(rec.label, '오늘의 추천')
    assert.ok(rec.condition.length > 0)
    const route = rec.href.replace(/^\//, '')
    assert.ok(
      router.includes(`path: '${route}'`),
      `${rec.id}: ${rec.href} 라우트 없음`,
    )
    // 안 한 것을 지적하거나 강요하는 말, 확인되지 않은 상태의 단정이 없다.
    assert.doesNotMatch(
      `${rec.title} ${rec.description} ${rec.ctaLabel}`,
      /안 했|못 했|하지 못|실패|게으|꼭 |반드시|해야|부족|아직 .*않/,
      rec.id,
    )
  }
})
test('식단 목표는 저장 기능이 없어 목표 추천의 이동 대상이 아니다', () => {
  assert.equal(catalog.SET_GOAL_RECOMMENDATION.href, '/records/exercise/goal')
  for (const rule of policy.HOME_RECOMMENDATION_PRIORITY)
    assert.notEqual(rule.id, 'set-meal-goal')
})

// ── 표시 ─────────────────────────────────────────────────────────────────
const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
test('배너는 추천에 따라 문구·아이콘·CTA 링크만 바뀌고 같은 카드 틀을 쓴다', () => {
  const shell = /rounded-card bg-brand-soft px-\[20px\] py-6/
  const htmls = [
    catalog.DEFAULT_RECOMMENDATION,
    catalog.FIRST_EXERCISE_RECOMMENDATION,
    catalog.RECORD_MEAL_RECOMMENDATION,
    catalog.RECORD_EXERCISE_RECOMMENDATION,
    catalog.SET_GOAL_RECOMMENDATION,
    catalog.weeklyReviewRecommendation({ exercise: true, meal: true }),
  ].map((recommendation) => ({
    recommendation,
    html: render(createElement(Banner, { recommendation })),
  }))
  for (const { recommendation, html } of htmls) {
    assert.match(html, shell, recommendation.id)
    assert.match(html, new RegExp(`data-recommendation="${recommendation.id}"`))
    assert.match(html, new RegExp(`href="${recommendation.href}"`))
    assert.ok(html.includes(recommendation.title))
    assert.ok(html.includes(recommendation.ctaLabel))
    assert.match(
      html,
      new RegExp(`aria-hidden="true"[^>]*>${recommendation.emoji}`),
    )
    assert.equal((html.match(/<h2/g) ?? []).length, 1)
    assert.doesNotMatch(html, /화면 준비 중/)
  }
})
test('개인화 배너는 읽는 동안(서버 렌더링처럼 조회가 끝나기 전) 기본 추천을 보인다', () => {
  const html = render(createElement(Personalized, { userId: ME, today: TODAY }))
  assert.match(html, /data-recommendation="start-with-exercise"/)
  assert.ok(html.includes('오늘은 가볍게 운동부터 시작해 볼까요?'))
  assert.doesNotMatch(html, /첫 운동|기록해/)
})

// ── PIN 보호 데이터·저장 방식 비변경 ─────────────────────────────────────
test('추천 조회 훅은 PIN 보호 데이터·검증·열람 권한 API를 호출하지 않는다', () => {
  const source = readFileSync(
    join(process.cwd(), 'src/home-recommendation/useHomeRecommendation.ts'),
    'utf8',
  )
  assert.doesNotMatch(
    source,
    /\.(unlock|registerPin|changePin|lock|getProfile|getProfilePrefill|saveProfile|getGoal|saveGoal|getPinStatus)\(/,
  )
  assert.doesNotMatch(
    source,
    /useExerciseGoal\b|GoalPinForm|bodyRepository|body-measurements/,
  )
  // 목표는 대시보드가 쓰는 요약(횟수·시간만)과 선행 조건 확인만 읽는다.
  assert.match(source, /\.getSummary\(\)/)
  assert.match(source, /loadExerciseGoalContext/)
})
test('운영 환경(NODE_ENV=production)에서는 운동 기록은 로컬 저장소, 식단 기록은 서버 저장소가 있고 목표 저장소는 없다. 저장소가 없는 사실은 연결 전이다', () => {
  const script = `
    import { createServer } from 'vite'
    const server = await createServer({
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    })
    const workout = await server.ssrLoadModule('/src/exercise/workoutSource.ts')
    const meal = await server.ssrLoadModule('/src/food/mealSource.ts')
    const goal = await server.ssrLoadModule('/src/exercise-goal/exerciseGoalSource.ts')
    console.log(JSON.stringify({
      env: process.env.NODE_ENV,
      workout: workout.createWorkoutRecordRepository('u') !== null,
      meal: meal.createMealRecordRepository('u')?.kind ?? null,
      goal: goal.createExerciseGoalRepository('u'),
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
  const result = JSON.parse(out.trim().split('\n').at(-1))
  assert.deepEqual(result, {
    env: 'production',
    workout: true, // 운동 완료 기록은 운영 빌드에서도 IndexedDB 로컬 저장소
    meal: 'server', // 식단 기록은 백엔드에 연결됨
    goal: null,
  })
  // 저장소가 없는 사실(운영 빌드의 목표)은 훅이 unavailable로 만든다. 아래는 세 사실 모두 저장소가 없을 때 규칙이 기본 추천을 고르는지 본다(위 테스트).
  const unavailable = { status: 'unavailable' }
  assert.equal(
    policy.selectHomeRecommendation({
      today: TODAY,
      exercise: unavailable,
      meal: unavailable,
      exerciseGoal: unavailable,
    }).id,
    'start-with-exercise',
  )
})
