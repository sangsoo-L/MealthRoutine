import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// I03~I03-3 AI 식단 플랜 테스트: 단계 입력 모델·상태 변경 규칙·서버 계약 경계·화면(상태별)·라우트·범위 준수.
// 대문자 드라이브(C:\)의 PowerShell에서 실행한다(소문자 경로의 Git Bash에서는 React 인스턴스가 둘로 갈라질 수 있다).
let server
let Flow
let State
let Contract
let Api
let Paths
let Dev
let GoalView
let MealsView
let FoodsView
let ResultView
let picked

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
  const load = (path) => server.ssrLoadModule(path)
  Flow = await load('/src/ai/meal/mealPlanFlow.ts')
  State = await load('/src/ai/meal/mealPlanFlowState.ts')
  Contract = await load('/src/ai/meal/mealPlanContract.ts')
  Api = await load('/src/ai/meal/mealPlanApi.ts')
  Paths = await load('/src/ai/meal/mealPlanPaths.ts')
  Dev = await load('/src/ai/meal/devGoalPreview.ts')
  GoalView = (await load('/src/components/ai/meal/MealPlanGoalView.tsx'))
    .default
  MealsView = (await load('/src/components/ai/meal/MealPlanMealsView.tsx'))
    .default
  FoodsView = (await load('/src/components/ai/meal/MealPlanFoodsView.tsx'))
    .default
  ResultView = (await load('/src/components/ai/meal/MealPlanResultView.tsx'))
    .default
  picked = Flow.toggleMeal(Flow.EMPTY_SELECTION, 'lunch', DATE) // 점심만 고른 선택
})
after(async () => {
  await server.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) => [...out.matchAll(/href="([^"]+)"/g)].map((m) => m[1])
const text = (out) =>
  out
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

const DATE = '2026-11-20'
const sel = (over = {}) => ({
  ...Flow.EMPTY_SELECTION,
  ...over,
})
const goalFixture = (over = {}) => ({
  v: 1,
  calculationVersion: 1,
  source: 'calculated',
  purpose: 'maintain',
  level: null,
  activity: null,
  kcal: 1900,
  ratio: { carb: 50, protein: 30, fat: 20 },
  basis: { profileUpdatedAt: '2026-01-01T00:00:00.000Z' },
  revision: 1,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
})

// ── 단계 입력 모델 ────────────────────────────────────────────────────────────

test('AI 추천 기본 열량: 하루 2000kcal에서 선택 끼니 수와 무관하게 끼니당 700kcal', () => {
  assert.equal(Flow.suggestedSelectedCalories(2000, 1), 700)
  assert.equal(Flow.suggestedSelectedCalories(2000, 2), 700)
  assert.equal(Flow.suggestedSelectedCalories(2000, 3), 700)
  assert.equal(Flow.suggestedSelectedCalories(2100, 1), 700)
  assert.equal(Flow.suggestedSelectedCalories(2100, 3), 700)
  assert.equal(Flow.suggestedSelectedCalories(1500, 3), 500)
})
test('끼니 선택: 항상 아침·점심·저녁 순서이고 처음 고를 때 날짜가 정해진다', () => {
  let s = Flow.toggleMeal(Flow.EMPTY_SELECTION, 'dinner', DATE)
  s = Flow.toggleMeal(s, 'breakfast', '2099-01-01')
  assert.deepEqual([...s.meals], ['breakfast', 'dinner'])
  assert.equal(s.targetDate, DATE) // 이미 정해진 날짜는 바뀌지 않는다
  s = Flow.toggleMeal(s, 'breakfast', DATE)
  assert.deepEqual([...s.meals], ['dinner'])
})

test('모두 선택은 전체 해제로도 쓰이고, 끼니가 없으면 단계를 마친 것이 아니다', () => {
  let s = Flow.toggleAllMeals(Flow.EMPTY_SELECTION, DATE)
  assert.deepEqual([...s.meals], ['breakfast', 'lunch', 'dinner'])
  assert.equal(Flow.allMealsSelected(s), true)
  assert.equal(Flow.isMealsComplete(s), true)
  s = Flow.toggleAllMeals(s, DATE)
  assert.deepEqual([...s.meals], [])
  assert.equal(Flow.isMealsComplete(s), false)
  assert.equal(Flow.isRequestReady(s), false)
})

test('식품 구분을 바꾸면 맞지 않는 음식 종류가 풀리고 어떤 종류가 풀렸는지 알려 준다', () => {
  let c = Flow.INITIAL_CONDITIONS
  c = Flow.setFoodType(c, '식재료').conditions
  c = Flow.toggleKind(c, '곡류')
  c = Flow.toggleKind(c, '육류')
  assert.deepEqual([...c.kinds], ['곡류', '육류'])
  // 이 구분에 없는 종류는 켜지지 않는다
  assert.deepEqual([...Flow.toggleKind(c, '면류').kinds], ['곡류', '육류'])
  const change = Flow.setFoodType(c, '음식·요리')
  assert.deepEqual([...change.conditions.kinds], [])
  assert.deepEqual([...change.droppedKinds], ['곡류', '육류'])
  // 전체로 바꾸면 모든 종류가 유효하다
  assert.deepEqual(
    [...Flow.setFoodType(c, null).conditions.kinds],
    ['곡류', '육류'],
  )
  assert.equal(Flow.isConditionsValid(c), true)
  assert.equal(
    Flow.isConditionsValid({ ...c, type: '가공식품', kinds: ['곡류'] }),
    false,
  )
})

test('넓은 음식 범주를 토글하고 초기화하면 제외 조건도 해제된다', () => {
  let c = Flow.toggleExcludedGroup(Flow.INITIAL_CONDITIONS, 'chicken')
  c = Flow.toggleExcludedGroup(c, 'coffee')
  assert.deepEqual(c.excludedFoodGroups, ['chicken', 'coffee'])
  assert.equal(Flow.hasAnyCondition(c), true)
  assert.equal(Flow.describeConditions(c).excluded, '닭고기류 · 커피 음료')
  c = Flow.toggleExcludedGroup(c, 'chicken')
  assert.deepEqual(c.excludedFoodGroups, ['coffee'])
  c = Flow.toggleExcludedGroup(c, 'coffee')
  assert.equal(Flow.hasAnyCondition(c), false)
})

test('제외 음식 선택·초기화 판정', () => {
  let c = Flow.toggleExcluded(Flow.INITIAL_CONDITIONS, 'a')
  c = Flow.toggleExcluded(c, 'b')
  assert.deepEqual([...c.excludedFoodIds], ['a', 'b'])
  assert.equal(Flow.hasAnyCondition(c), true)
  c = Flow.toggleExcluded(Flow.toggleExcluded(c, 'a'), 'b')
  assert.equal(Flow.hasAnyCondition(c), false)
  assert.equal(Flow.hasAnyCondition(Flow.INITIAL_CONDITIONS), false)
})

test('앞 입력이 없으면 앞 단계로 돌려보낸다(직접 접근·새로고침)', () => {
  const empty = Flow.EMPTY_SELECTION
  assert.equal(Flow.redirectStep('goal', empty), null)
  assert.equal(Flow.redirectStep('meals', empty), null)
  assert.equal(Flow.redirectStep('foods', empty), 'meals')
  assert.equal(Flow.redirectStep('plan', empty), 'meals')
  const picked = Flow.toggleMeal(empty, 'lunch', DATE)
  assert.equal(Flow.redirectStep('foods', picked), null)
  assert.equal(Flow.redirectStep('plan', picked), null)
  const broken = {
    ...picked,
    conditions: { type: '가공식품', kinds: ['곡류'], excludedFoodIds: [] },
  }
  assert.equal(Flow.redirectStep('plan', broken), 'foods')
})

test('조건 요약: 고르지 않은 조건은 전체·없음이고 음식 이름을 지어내지 않는다', () => {
  assert.deepEqual(Flow.describeConditions(Flow.INITIAL_CONDITIONS), {
    type: '전체',
    kinds: '전체',
    excluded: '없음',
  })
  const c = { type: '식재료', kinds: ['곡류', '채소'], excludedFoodIds: ['x'] }
  assert.deepEqual(Flow.describeConditions(c), {
    type: '식재료',
    kinds: '곡류 · 채소',
    excluded: '선택한 음식',
  })
  assert.equal(Flow.describeConditions(c, () => '현미밥').excluded, '현미밥')
})

test('단계 이름·경로는 확정 URL이다', () => {
  assert.deepEqual(Flow.STEP_ORDER, ['goal', 'meals', 'foods', 'plan'])
  assert.deepEqual(
    Flow.STEP_ORDER.map((step) => Flow.STEP_PATH[step]),
    ['/ai/meal', '/ai/meal/meals', '/ai/meal/foods', '/ai/meal/plan'],
  )
  assert.equal(Paths.PATH_AI_MEAL, '/ai/meal')
  assert.deepEqual(
    Flow.STEP_ORDER.map((step) => Flow.STEP_LABEL[step]),
    ['목표 확인', '끼니 선택', '음식 조건', '추천 확인'],
  )
})

// ── 흐름 상태(순수 reducer) ───────────────────────────────────────────────────
test('목표 시점: 처음은 기록만 하고, 같으면 그대로이며, 달라지면 선택과 요청을 비우고 안내한다', () => {
  let s = State.initialFlowState('u1')
  s = State.flowReducer(s, { type: 'toggleMeal', meal: 'lunch', date: DATE })
  s = State.flowReducer(s, { type: 'syncGoal', stamp: 'g1' })
  assert.equal(s.goalStamp, 'g1')
  assert.deepEqual([...s.selection.meals], ['lunch']) // 처음 본 목표는 선택을 지우지 않는다
  const same = State.flowReducer(s, { type: 'syncGoal', stamp: 'g1' })
  assert.equal(same, s)
  const changed = State.flowReducer(s, { type: 'syncGoal', stamp: 'g2' })
  assert.deepEqual([...changed.selection.meals], [])
  assert.equal(changed.request.status, 'idle')
  assert.equal(changed.notice, State.GOAL_CHANGED_NOTICE)
  assert.equal(changed.goalStamp, 'g2')
})

test('날짜 변경: 선택한 날짜와 내일이 달라지면 선택과 요청을 비운다', () => {
  let s = State.flowReducer(State.initialFlowState('u1'), {
    type: 'toggleMeal',
    meal: 'dinner',
    date: DATE,
  })
  assert.equal(State.flowReducer(s, { type: 'syncDate', date: DATE }), s)
  s = State.flowReducer(s, { type: 'syncDate', date: '2026-11-21' })
  assert.deepEqual([...s.selection.meals], [])
  assert.equal(s.selection.targetDate, null)
  assert.equal(s.notice, State.DATE_CHANGED_NOTICE)
  // 선택이 없으면(날짜 미정) 바꿀 것이 없다
  const empty = State.initialFlowState('u1')
  assert.equal(
    State.flowReducer(empty, { type: 'syncDate', date: DATE }),
    empty,
  )
})

test('끼니·조건이 바뀌면 이전 요청 상태는 요청 전으로 돌아간다(이전 결과를 새 조건의 결과로 보이지 않는다)', () => {
  let s = State.flowReducer(State.initialFlowState('u1'), {
    type: 'toggleMeal',
    meal: 'lunch',
    date: DATE,
  })
  s = State.flowReducer(s, {
    type: 'setRequest',
    request: { status: 'unavailable' },
  })
  assert.equal(s.request.status, 'unavailable')
  s = State.flowReducer(s, { type: 'toggleKind', kind: '면류' }) // 식품 구분이 전체라 유효
  assert.equal(s.request.status, 'idle')
  s = State.flowReducer(s, {
    type: 'setRequest',
    request: { status: 'analyzing' },
  })
  s = State.flowReducer(s, { type: 'toggleExcluded', foodId: 'f1' })
  assert.equal(s.request.status, 'idle')
})

test('식품 구분 변경 충돌은 안내 문구를 남기고 다른 조작은 그 안내를 지운다', () => {
  let s = State.initialFlowState('u1')
  s = State.flowReducer(s, { type: 'setFoodType', value: '식재료' })
  s = State.flowReducer(s, { type: 'toggleKind', kind: '곡류' })
  s = State.flowReducer(s, { type: 'setFoodType', value: '가공식품' })
  assert.match(s.notice, /곡류/)
  assert.deepEqual([...s.selection.conditions.kinds], [])
  s = State.flowReducer(s, { type: 'toggleKind', kind: '간식' })
  assert.equal(s.notice, null)
  s = State.flowReducer(s, { type: 'resetConditions' })
  assert.equal(s.selection.conditions.type, null)
  assert.deepEqual([...s.selection.conditions.kinds], [])
})

test('요청 번호: 무효가 된 요청의 늦은 결과는 버린다(계정·조건·목표·날짜 변경, 취소)', () => {
  const ready = {
    status: 'ready',
    result: { requestId: 'r', targetDate: DATE, meals: [] },
  }
  const begin = (state, id) =>
    State.flowReducer(state, { type: 'beginRequest', id })
  const finish = (state, id) =>
    State.flowReducer(state, { type: 'finishRequest', id, request: ready })
  let s = State.flowReducer(State.initialFlowState('u1'), {
    type: 'toggleMeal',
    meal: 'lunch',
    date: DATE,
  })
  s = begin(s, 1)
  assert.equal(s.request.status, 'analyzing')
  assert.equal(s.activeRequestId, 1)
  // 같은 번호의 결과는 받는다
  const done = finish(s, 1)
  assert.equal(done.request.status, 'ready')
  assert.equal(done.activeRequestId, null)
  // 다른 번호의 결과는 버린다
  assert.equal(finish(s, 2), s)
  // 조건 변경·취소·목표 변경·날짜 변경·계정 변경 뒤에 도착한 결과는 버린다
  const changed = State.flowReducer(s, { type: 'toggleKind', kind: '면류' })
  assert.equal(changed.activeRequestId, null)
  assert.equal(finish(changed, 1).request.status, 'idle')
  const cancelled = State.flowReducer(s, {
    type: 'setRequest',
    request: { status: 'idle' },
  })
  assert.equal(finish(cancelled, 1).request.status, 'idle')
  let withGoal = State.flowReducer(s, { type: 'syncGoal', stamp: 'g1' })
  withGoal = begin(withGoal, 3)
  const goalChanged = State.flowReducer(withGoal, {
    type: 'syncGoal',
    stamp: 'g2',
  })
  assert.equal(finish(goalChanged, 3).request.status, 'idle')
  const dateChanged = State.flowReducer(s, {
    type: 'syncDate',
    date: '2099-01-01',
  })
  assert.equal(finish(dateChanged, 1).request.status, 'idle')
  const otherOwner = State.flowReducer(s, { type: 'reset', owner: 'u2' })
  assert.equal(finish(otherOwner, 1), otherOwner)
  assert.equal(otherOwner.request.status, 'idle')
})

test('바뀐 것이 없는 조작은 진행 중 요청과 안내를 건드리지 않는다', () => {
  let s = State.flowReducer(State.initialFlowState('u1'), {
    type: 'toggleMeal',
    meal: 'lunch',
    date: DATE,
  })
  s = State.flowReducer(s, { type: 'beginRequest', id: 7 })
  // 규칙상 무시되는 종류 선택, 이미 비어 있는 조건 초기화, 같은 식품 구분 선택
  assert.equal(
    State.flowReducer(s, { type: 'toggleKind', kind: '없는 종류' }),
    s,
  )
  assert.equal(State.flowReducer(s, { type: 'resetConditions' }), s)
  assert.equal(State.flowReducer(s, { type: 'setFoodType', value: null }), s)
  // 실제로 바뀌면 요청은 무효가 된다
  assert.equal(
    State.flowReducer(s, { type: 'toggleExcluded', foodId: 'f' })
      .activeRequestId,
    null,
  )
})

test('끼니를 모두 풀면 날짜도 비우고, 충돌 안내는 음식 조건 단계에서만 보인다', () => {
  let s = Flow.toggleMeal(Flow.EMPTY_SELECTION, 'lunch', DATE)
  assert.equal(s.targetDate, DATE)
  s = Flow.toggleMeal(s, 'lunch', DATE)
  assert.equal(s.targetDate, null)
  s = Flow.toggleAllMeals(Flow.toggleAllMeals(Flow.EMPTY_SELECTION, DATE), DATE)
  assert.equal(s.targetDate, null)
  let state = State.flowReducer(State.initialFlowState('u1'), {
    type: 'setFoodType',
    value: '식재료',
  })
  state = State.flowReducer(state, { type: 'toggleKind', kind: '곡류' })
  state = State.flowReducer(state, { type: 'setFoodType', value: '가공식품' })
  assert.equal(state.noticeStep, 'foods')
  // 목표·날짜 변경 안내는 어느 단계에서나 보인다
  const dated = State.flowReducer(
    State.flowReducer(State.initialFlowState('u1'), {
      type: 'toggleMeal',
      meal: 'lunch',
      date: DATE,
    }),
    { type: 'syncDate', date: '2099-01-01' },
  )
  assert.equal(dated.noticeStep, null)
  assert.ok(dated.notice)
})

test('계정이 바뀌면 처음 상태로 돌아간다', () => {
  let s = State.flowReducer(State.initialFlowState('u1'), {
    type: 'toggleAllMeals',
    date: DATE,
  })
  s = State.flowReducer(s, { type: 'reset', owner: 'u2' })
  assert.equal(s.owner, 'u2')
  assert.deepEqual([...s.selection.meals], [])
  assert.equal(s.goalStamp, null)
})

// ── 서버 계약 경계 ────────────────────────────────────────────────────────────
const request = {
  targetDate: DATE,
  meals: ['lunch'],
  foodType: null,
  foodKinds: [],
  excludedFoodIds: [],
  goalUpdatedAt: 'g1',
}
const signal = new AbortController().signal
const resultFixture = {
  requestId: 'r1',
  targetDate: DATE,
  meals: [
    {
      meal: 'lunch',
      target: { kcal: 600, carbG: 80, proteinG: 30, fatG: 15 },
      totals: { kcal: 580, carbG: null, proteinG: 28, fatG: 14 },
      items: [
        {
          foodId: 'f1',
          foodName: '테스트 음식',
          quantity: 150,
          unit: 'g',
          nutrients: { kcal: 300, carbG: 40, proteinG: null, fatG: 5 },
          allergenNotes: null,
          reason: '근거 문구',
        },
      ],
    },
  ],
}

test('개발 환경에서는 추천 소스를 만들고, 연결이 없을 때는 요청하지 않는다', async () => {
  assert.equal(typeof Contract.createMealPlanSource()?.requestPlan, 'function')
  assert.deepEqual(await Contract.runPlanRequest(null, request, signal), {
    status: 'unavailable',
  })
})

test('AI 추천 직접 호출: 세 끼는 각각 700kcal로 POST 3회, 탭별 결과는 구분', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body)
    calls.push(body)
    const meal = body.meal_types[0]
    return {
      ok: true,
      json: async () => ({
        status: 'generated',
        meals: [{
          meal_type: meal,
          estimated_calories_kcal: 700,
          reason: '끼니별 식단',
          foods: [{
            food_id: 123,
            food_name: `${meal} 테스트 음식`,
            quantity: 1,
            nutrients: { calories_kcal: 700 },
          }],
        }],
      }),
    }
  }
  try {
    const result = await Api.createLocalMealPlanSource().requestPlan({
      ...request,
      meals: ['breakfast', 'lunch', 'dinner'],
      targetCaloriesKcal: 700,
    }, new AbortController().signal)
    assert.equal(calls.length, 3)
    assert.deepEqual(calls.map((body) => body.meal_types), [
      ['breakfast'], ['lunch'], ['dinner'],
    ])
    assert.deepEqual(calls.map((body) => body.target_calories_kcal), [700, 700, 700])
    assert.deepEqual(result.meals.map((item) => item.meal), [
      'breakfast', 'lunch', 'dinner',
    ])
    assert.deepEqual(result.meals.map((item) => item.totals.kcal), [700, 700, 700])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AI 추천 직접 호출: 개발용 ID를 무시하고 넓은 제외 범주를 FastAPI로 보낸다', async () => {
  const previous = globalThis.fetch
  let payload = null
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body)
    return { ok: true, json: async () => ({
      status: 'generated',
      meals: [{
        meal_type: 'lunch',
        estimated_calories_kcal: 701,
        foods: [{ food_id: 42, food_name: '현미밥', quantity: 1 }],
      }],
    }) }
  }
  try {
    await Api.createLocalMealPlanSource().requestPlan({
      ...request,
      targetCaloriesKcal: 700,
      excludedFoodIds: ['dev-food-2', '31'],
      excludedFoodGroups: ['chicken', 'coffee'],
    }, new AbortController().signal)
    assert.deepEqual(payload.excluded_food_groups, ['chicken', 'coffee'])
    assert.deepEqual(payload.excluded_food_ids, [31])
  } finally {
    globalThis.fetch = previous
  }
})

test('음식 종류 선택: 면류와 식품 구분이 API 본문에 독립된 조건으로 전달된다', async () => {
  const originalFetch = globalThis.fetch
  let payload = null
  globalThis.fetch = async (_url, options) => {
    payload = JSON.parse(options.body)
    return { ok: true, json: async () => ({
      status: 'generated',
      meals: [{ meal_type: 'lunch', estimated_calories_kcal: 700,
        foods: [{ food_id: 100, food_name: '우동_일식', quantity: 1 }] }],
    }) }
  }
  try {
    await Api.createLocalMealPlanSource().requestPlan({
      ...request, meals: ['lunch'], targetCaloriesKcal: 700,
      foodType: '음식·요리', foodKinds: ['면류'], excludedFoodGroups: ['dairy'],
    }, new AbortController().signal)
    assert.equal(payload.food_type, '음식·요리')
    assert.deepEqual(payload.food_kinds, ['면류'])
    assert.deepEqual(payload.excluded_food_groups, ['dairy'])
    assert.deepEqual(payload.meal_types, ['lunch'])
    assert.equal(payload.target_calories_kcal, 700)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('AI 추천 직접 호출: 점심 하나 선택 시 700kcal로 POST 1회', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (_url, options) => {
    calls.push(JSON.parse(options.body))
    return { ok: true, json: async () => ({
      status: 'generated',
      meals: [{
        meal_type: 'lunch',
        estimated_calories_kcal: 700,
        foods: [{ food_id: 100, food_name: '점심 식단', quantity: 1 }],
      }],
    }) }
  }
  try {
    const result = await Api.createLocalMealPlanSource().requestPlan({
      ...request, meals: ['lunch'], targetCaloriesKcal: 700,
    }, new AbortController().signal)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].meal_types, ['lunch'])
    assert.equal(calls[0].target_calories_kcal, 700)
    assert.equal(result.meals[0].meal, 'lunch')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('요청 실행: 결과·결과 없음·오류를 구분하고 예외를 결과 없음으로 바꾸지 않는다', async () => {
  const run = (requestPlan) =>
    Contract.runPlanRequest({ requestPlan }, request, signal)
  const ready = await run(async () => resultFixture)
  assert.equal(ready.status, 'ready')
  assert.equal(ready.result.requestId, 'r1')
  assert.deepEqual(await run(async () => null), { status: 'empty' })
  assert.deepEqual(await run(async () => ({ ...resultFixture, meals: [] })), {
    status: 'empty',
  })
  assert.deepEqual(
    await run(async () => {
      throw new Error('x')
    }),
    { status: 'error' },
  )
})

// ── 개발 전용 검증 상태 ───────────────────────────────────────────────────────
test('개발용 검증 상태: 알려진 상태만 읽고 이동 때 상태 이름만 이어 간다', () => {
  assert.equal(Dev.parseDevGoalPreview('?devGoal=ready'), 'ready')
  assert.equal(Dev.parseDevGoalPreview('?devGoal=missing'), 'missing')
  assert.equal(Dev.parseDevGoalPreview('?devGoal=nope'), null)
  assert.equal(Dev.parseDevGoalPreview(''), null)
  assert.equal(Dev.devGoalSearch(null), '')
  assert.equal(Dev.devGoalSearch('error'), '?devGoal=error')
  assert.deepEqual(Dev.devGoalState('loading'), { status: 'loading' })
  assert.deepEqual(Dev.devGoalState('missing'), { status: 'ready', goal: null })
  assert.equal(Dev.devGoalState('ready').status, 'ready')
  assert.notEqual(Dev.devGoalState('ready').goal, null)
})

test('개발용 검증 상태는 개발 서버에서만 켜지고 저장소·정책·API를 건드리지 않는다', () => {
  const hook = code('../src/ai/meal/useMealPlanGoal.ts')
  assert.match(hook, /import\.meta\.env\.DEV \? parseDevGoalPreview/)
  const gate = code('../src/components/ai/meal/MealPlanGate.tsx')
  assert.match(gate, /import\.meta\.env\.DEV && preview !== null/)
  const preview = code('../src/ai/meal/devGoalPreview.ts')
  assert.doesNotMatch(
    preview,
    /localStorage|sessionStorage|indexedDB|fetch\(|saveGoal|createMealGoalRepository|mealGoalSource/,
  )
})

// ── 화면: I03 목표 확인 ───────────────────────────────────────────────────────
test('I03: 목표 열량·비율은 보여 주고 탄단지 g은 환산하지 않고 연결 대기로 둔다', () => {
  const out = html(createElement(GoalView, { goal: goalFixture() }))
  const t = text(out)
  assert.match(t, /하루 1,900 kcal/)
  assert.match(t, /탄수화물 50%/)
  assert.match(t, /단백질 30%/)
  assert.match(t, /지방 20%/)
  assert.equal((out.match(/data-plan-macro-grams=/g) ?? []).length, 3)
  assert.equal((t.match(/g 목표량 연결 대기/g) ?? []).length, 3)
  // 환산한 g 숫자(예: 237.5g)가 없다
  assert.doesNotMatch(t, /\d+(\.\d+)?\s?g\b(?! 목표량)/)
  assert.match(out, /data-plan-step="goal"/)
  assert.match(t, /1 \/ 4 · 목표 확인/)
})

test('I03: 계산 기준이 검증되지 않은 목표는 그 사실을 알린다', () => {
  const out = html(createElement(GoalView, { goal: goalFixture() }))
  assert.match(out, /data-plan-goal-unverified/)
  assert.match(text(out), /계산 기준 검증 전/)
  assert.match(text(out), /서버에서 확인한 값이 연결되면/)
})

test('I03: 알레르기는 연결 전이며 없음으로 표시하지 않고 안전 여부를 판정하지 않는다', () => {
  const out = html(createElement(GoalView, { goal: goalFixture() }))
  const t = text(out)
  assert.match(t, /알레르기 정보/)
  assert.match(t, /연결 전/)
  assert.match(t, /알레르기가 없다는 뜻이 아니에요/)
  assert.match(t, /프로필 관리\(P02\)는 준비 중/)
  assert.doesNotMatch(t, /알레르기 없음/)
  assert.doesNotMatch(t, /안전해요|안전합니다/)
})

test('I03: 연결은 끼니 선택(I03-1)·목표 수정(D01-4)이고 남은 체험 횟수는 표시하지 않는다', () => {
  const out = html(createElement(GoalView, { goal: goalFixture() }))
  assert.deepEqual(hrefs(out), ['/records/meal/goal', '/ai/meal/meals'])
  assert.doesNotMatch(text(out), /남은|회 남|차감/)
  // 개발 검증 상태를 이어 가면 이동 주소도 이어진다
  const dev = html(
    createElement(GoalView, {
      goal: goalFixture(),
      devSearch: '?devGoal=ready',
    }),
  )
  assert.ok(hrefs(dev).includes('/ai/meal/meals?devGoal=ready'))
  assert.match(out, /<details[^>]*data-plan-source/)
})

// ── 화면: I03-1 끼니 선택 ─────────────────────────────────────────────────────
const mealsProps = (over = {}) => ({
  tomorrow: DATE,
  selection: Flow.EMPTY_SELECTION,
  targets: { status: 'unavailable' },
  notice: null,
  onToggleMeal: noop,
  onToggleAll: noop,
  onDismissNotice: noop,
  onNext: noop,
  ...over,
})

test('I03-1: 끼니 선택이 없으면 다음 버튼이 막혀 있고 이유를 글자로 알린다', () => {
  const out = html(createElement(MealsView, mealsProps()))
  const next = out.match(/<button[^>]*data-plan-next[^>]*>/)[0]
  assert.match(next, /aria-disabled="true"/)
  assert.match(next, /aria-describedby="plan-meals-summary"/)
  assert.match(text(out), /추천받을 끼니를 하나 이상 골라 주세요/)
  assert.equal((out.match(/aria-pressed="false"/g) ?? []).length, 3) // 세 끼니
  // 모두 선택 버튼은 눌림 상태 대신 라벨이 상태를 말한다(라벨과 aria-pressed를 함께 바꾸면 의미가 모호하다)
  const allButton = out.match(/<button[^>]*data-plan-meal-all[^>]*>/)[0]
  assert.doesNotMatch(allButton, /aria-pressed/)
  assert.match(text(out), /세 끼 모두 선택/)
  assert.match(text(out), /내일 · 11월 20일/)
})

test('I03-1: 선택한 끼니는 눌린 상태·요약으로 알리고 다음 버튼이 열린다', () => {
  const selection = Flow.toggleMeal(
    Flow.toggleMeal(Flow.EMPTY_SELECTION, 'breakfast', DATE),
    'dinner',
    DATE,
  )
  const out = html(createElement(MealsView, mealsProps({ selection })))
  assert.match(out, /data-plan-meal="breakfast"[^>]*>/)
  assert.match(
    out.match(/<button[^>]*data-plan-meal="breakfast"[^>]*>/)[0],
    /aria-pressed="true"/,
  )
  assert.match(
    out.match(/<button[^>]*data-plan-meal="lunch"[^>]*>/)[0],
    /aria-pressed="false"/,
  )
  assert.match(text(out), /아침 · 저녁 2끼를 골랐어요/)
  assert.doesNotMatch(
    out.match(/<button[^>]*data-plan-next[^>]*>/)[0],
    / aria-disabled=/,
  )
})

test('I03-1: 세 끼 모두 선택 상태에서는 버튼 라벨이 전체 해제로 바뀐다', () => {
  const selection = Flow.toggleAllMeals(Flow.EMPTY_SELECTION, DATE)
  const out = html(createElement(MealsView, mealsProps({ selection })))
  assert.doesNotMatch(
    out.match(/<button[^>]*data-plan-meal-all[^>]*>/)[0],
    /aria-pressed/,
  )
  assert.match(text(out), /전체 해제/)
  assert.doesNotMatch(text(out), /세 끼 모두 선택/)
  assert.match(text(out), /아침 · 점심 · 저녁 3끼를 골랐어요/)
})

test('I03-1: 끼니별 목표량은 서버 값만 쓴다(없으면 연결 대기, 값이 없으면 정보 없음, 합계·배분을 계산하지 않는다)', () => {
  const waiting = text(html(createElement(MealsView, mealsProps())))
  assert.equal((waiting.match(/목표량 연결 대기/g) ?? []).length, 3)
  assert.doesNotMatch(waiting, /30%|40%/)
  const ready = text(
    html(
      createElement(
        MealsView,
        mealsProps({
          targets: {
            status: 'ready',
            value: {
              meals: [
                {
                  meal: 'breakfast',
                  target: { kcal: 500, carbG: null, proteinG: 25, fatG: 10 },
                },
              ],
            },
          },
        }),
      ),
    ),
  )
  assert.match(ready, /500 kcal · 탄수화물 정보 없음 · 단백질 25g · 지방 10g/)
  assert.match(ready, /목표량 정보 없음/) // 서버가 주지 않은 끼니
  for (const status of ['loading', 'error']) {
    assert.doesNotMatch(
      text(html(createElement(MealsView, mealsProps({ targets: { status } })))),
      /목표량 연결 대기/,
    )
  }
})

test('I03-1: 이전은 I03, 안내는 상태 영역으로 나온다', () => {
  const out = html(
    createElement(MealsView, mealsProps({ notice: '날짜가 바뀌었어요' })),
  )
  assert.deepEqual(hrefs(out), ['/ai/meal'])
  // 읽어 주는 영역은 안내 안쪽이 아니라 바깥에 항상 있고, 안내가 없을 때도 DOM에 남는다(비어 있다가 채워지면 알려 준다)
  assert.match(out, /<div role="status"[^>]*><div data-plan-notice/)
  const none = html(createElement(MealsView, mealsProps()))
  assert.match(none, /<div role="status" class="empty:hidden"><\/div>/)
  assert.doesNotMatch(none, /data-plan-notice/)
})

// ── 화면: I03-2 음식 조건 ─────────────────────────────────────────────────────
const foodsProps = (over = {}) => ({
  selection: picked,
  foods: { status: 'unavailable' },
  candidates: { status: 'unavailable' },
  notice: null,
  onSetType: noop,
  onToggleKind: noop,
  onToggleExcludedGroup: noop,
  onReset: noop,
  onDismissNotice: noop,
  onNext: noop,
  ...over,
})

test('I03-2: 식품 구분은 단일 선택(전체·음식·요리·가공식품·식재료)이고 기본은 전체다', () => {
  const out = html(createElement(FoodsView, foodsProps()))
  const radios = [...out.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(
    (m) => m[0],
  )
  assert.equal(radios.length, 4)
  assert.equal(radios.filter((r) => /checked=""/.test(r)).length, 1)
  assert.match(text(out), /식품 구분 전체 ✓ 음식·요리 가공식품 식재료/)
  assert.match(text(out), /점심/)
})

test('I03-2: 음식 종류는 선택한 식품 구분에 속한 종류만 다중 선택으로 보인다', () => {
  const type = Flow.setFoodType(picked.conditions, '식재료').conditions
  const selection = {
    ...picked,
    conditions: Flow.toggleKind(type, '곡류'),
  }
  const out = html(createElement(FoodsView, foodsProps({ selection })))
  const boxes = [...out.matchAll(/<input[^>]*name="plan-food-kind"[^>]*>/g)]
  assert.equal(boxes.length, 5) // 곡류·육류·채소·과일·수산물
  assert.equal(boxes.filter((m) => /checked=""/.test(m[0])).length, 1)
  assert.doesNotMatch(out, /면류|국·찌개/)
  assert.match(text(out), /선택한 조건 식품 구분 식재료 음식 종류 곡류/)
})

test('I03-2: 후보 수는 서버 값만 쓰고 연결 전이면 알 수 없다고 알린다(개발용 음식 4개로 세지 않는다)', () => {
  const waiting = text(html(createElement(FoodsView, foodsProps())))
  assert.match(
    waiting,
    /계산 가능한 후보 수는 서버가 연결된 뒤에 확인할 수 있어요/,
  )
  assert.doesNotMatch(waiting, /후보 \d/)
  const ready = text(
    html(
      createElement(
        FoodsView,
        foodsProps({ candidates: { status: 'ready', value: { count: 1234 } } }),
      ),
    ),
  )
  assert.match(ready, /계산 가능한 후보 1,234개/)
})

test('I03-2: 서버가 후보 0개라고 알려 준 경우에만 추천 생성이 막힌다', () => {
  const none = html(
    createElement(
      FoodsView,
      foodsProps({ candidates: { status: 'ready', value: { count: 0 } } }),
    ),
  )
  const next = none.match(/<button[^>]*data-plan-next[^>]*>/)[0]
  assert.match(next, /aria-disabled="true"/)
  assert.match(text(none), /후보가 없어서 추천을 만들 수 없어요/)
  for (const candidates of [
    { status: 'unavailable' },
    { status: 'loading' },
    { status: 'error' },
  ]) {
    const out = html(createElement(FoodsView, foodsProps({ candidates })))
    assert.doesNotMatch(
      out.match(/<button[^>]*data-plan-next[^>]*>/)[0],
      / aria-disabled=/,
    )
  }
})

test('I03-2: 메뉴명 기준 넓은 제외 범주를 선택하고, 알레르기 안전과 구분한다', () => {
  const conditions = Flow.toggleExcludedGroup(
    Flow.toggleExcludedGroup(picked.conditions, 'chicken'),
    'coffee',
  )
  const out = html(createElement(FoodsView, foodsProps({
    selection: { ...picked, conditions },
  })))
  const visible = text(out)
  assert.match(visible, /닭고기류/)
  assert.match(visible, /커피 음료/)
  assert.match(visible, /2개 선택/)
  assert.match(visible, /메뉴 이름 기반 기호 필터/)
  assert.match(visible, /알레르기 안전성을 보장하지 않습니다/)
  assert.doesNotMatch(out, /dev-food-1|개발용 예시 데이터/)
  assert.match(visible, /제외 음식 닭고기류 · 커피 음료/)
})

test('I03-2: 조건이 없으면 초기화가 막히고 전체 추천 안내가 나온다. 이전은 I03-1', () => {
  const out = html(createElement(FoodsView, foodsProps()))
  assert.match(
    out.match(/<button[^>]*data-plan-reset[^>]*>/)[0],
    /aria-disabled="true"/,
  )
  assert.match(text(out), /조건 없이 모든 음식에서 추천받아요/)
  assert.deepEqual(hrefs(out), ['/ai/meal/meals'])
  const touched = html(
    createElement(
      FoodsView,
      foodsProps({
        selection: {
          ...picked,
          conditions: Flow.setFoodType(picked.conditions, '가공식품')
            .conditions,
        },
      }),
    ),
  )
  assert.doesNotMatch(
    touched.match(/<button[^>]*data-plan-reset[^>]*>/)[0],
    / aria-disabled=/,
  )
})

// ── 화면: I03-3 추천·등록 ─────────────────────────────────────────────────────
const resultProps = (request, over = {}) => ({
  selection: picked,
  request,
  foodNameOf: () => null,
  onRequest: noop,
  onCancel: noop,
  onRetry: noop,
  ...over,
})

test('I03-3 연결 전: 결과를 만들지 않고 연결 전·이용 횟수 미사용을 알린다', () => {
  const out = html(
    createElement(ResultView, resultProps({ status: 'unavailable' })),
  )
  const t = text(out)
  assert.match(t, /AI 식단 추천은 연결 전이에요/)
  assert.match(t, /추천 결과를 만들지 않았고 이용 횟수도 쓰지 않았어요/)
  assert.doesNotMatch(out, /data-plan-result=/)
  assert.doesNotMatch(out, /data-plan-item=/)
  assert.doesNotMatch(t, /kcal/)
  assert.deepEqual(
    [...out.matchAll(/data-plan-(retry|change|request|cancel)=/g)].map(
      (m) => m[1],
    ),
    ['change'], // 연결 전에는 다시 요청이 없고 조건 변경만 있다
  )
})

test('I03-3: 요청 전·준비·분석 중·결과 없음·오류가 서로 다른 화면 상태다', () => {
  const state = (status) =>
    html(createElement(ResultView, resultProps({ status })))
  const idle = state('idle')
  assert.match(idle, /data-plan-state="idle"/)
  assert.match(idle, /data-plan-request=/)
  assert.match(text(idle), /추천 요청하기/)
  const preparing = state('preparing')
  assert.match(preparing, /aria-busy="true"/)
  assert.match(text(preparing), /추천 요청을 준비하고 있어요/)
  assert.doesNotMatch(preparing, /data-plan-cancel/)
  const analyzing = state('analyzing')
  assert.match(
    analyzing,
    /role="status"[^>]*aria-busy="true"|aria-busy="true"[^>]*role="status"/,
  )
  assert.match(analyzing, /data-plan-cancel=/)
  const empty = state('empty')
  assert.match(empty, /data-plan-retry=/)
  assert.match(text(empty), /이번 요청은 이용 횟수를 쓰지 않았어요/)
  const error = state('error')
  assert.match(error, /role="alert"/)
  assert.match(error, /data-plan-retry=/)
  assert.match(text(error), /입력한 조건은 그대로 남아 있어요/)
})

test('I03-3 결과: 서버가 준 값만 그대로 그리고 없는 값은 정보 없음이며 합계를 만들지 않는다', () => {
  const out = html(
    createElement(
      ResultView,
      resultProps({ status: 'ready', result: resultFixture }),
    ),
  )
  const t = text(out)
  assert.match(out, /data-plan-result="r1"/)
  assert.match(t, /테스트 음식/)
  assert.match(t, /150g/)
  assert.match(t, /추천 근거 근거 문구/)
  assert.match(t, /단백질 정보 없음/) // 항목의 null 값
  assert.match(t, /탄수화물 정보 없음/) // 합계의 null 값
  // 서버가 준 끼니 합계(580)를 그대로 쓰며 항목(300)을 더해 만든 값이 아니다
  assert.match(t, /열량 580 kcal/)
  assert.match(t, /열량 600 kcal/)
  assert.match(t, /원재료·알레르기 정보를 확인할 수 없어요/)
  assert.match(t, /안전하다는 뜻이 아니/)
})

test('I03-3: 등록 영역은 막혀 있고 등록 완료를 알리지 않으며 D02-1 화면으로만 안내한다', () => {
  for (const status of ['unavailable', 'ready']) {
    const out = html(
      createElement(
        ResultView,
        resultProps(
          status === 'ready' ? { status, result: resultFixture } : { status },
        ),
      ),
    )
    const button = out.match(/<button[^>]*data-plan-register-button[^>]*>/)[0]
    assert.match(button, /aria-disabled="true"/)
    assert.match(out.match(/<input[^>]*type="checkbox"[^>]*>/)[0], /disabled/)
    assert.doesNotMatch(text(out), /등록했어요|등록되었어요|추가했어요/)
    assert.match(text(out), /지금은 등록되지 않고/)
    assert.ok(hrefs(out).includes('/records/meal/plan'))
  }
})

test('I03-3: 개발 검증 상태를 이어 가면 이전·조건 변경 주소에도 이어진다', () => {
  const out = html(
    createElement(
      ResultView,
      resultProps({ status: 'unavailable' }, { devSearch: '?devGoal=ready' }),
    ),
  )
  assert.deepEqual(
    hrefs(out).filter((href) => href.startsWith('/ai/meal')),
    ['/ai/meal/foods?devGoal=ready', '/ai/meal/foods?devGoal=ready'],
  )
})

test('I03-3: 요청한 조건 요약과 이전(I03-2) 이동이 있다', () => {
  const out = html(
    createElement(
      ResultView,
      resultProps(
        { status: 'unavailable' },
        {
          selection: {
            ...picked,
            conditions: {
              type: '식재료',
              kinds: ['곡류'],
              excludedFoodIds: ['x'],
            },
          },
          foodNameOf: () => '현미밥',
        },
      ),
    ),
  )
  const t = text(out)
  assert.match(t, /날짜·끼니 11월 20일 \(금\) · 점심/)
  assert.match(t, /식품 구분 식재료/)
  assert.match(t, /음식 종류 곡류/)
  assert.match(t, /제외 음식 현미밥/)
  assert.ok(hrefs(out).includes('/ai/meal/foods'))
  assert.match(t, /4 \/ 4 · 추천 확인/)
})

// ── 라우트·연결 ───────────────────────────────────────────────────────────────
test('라우트: 4개 화면은 확정 URL의 회원 전용 라우트이고 상위 화면 체인이 이어진다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const rows = [
    ['ai/meal', 'I03', "parent: '/ai'", false],
    ['ai/meal/meals', 'I03-1', "parent: '/ai/meal'", true],
    ['ai/meal/foods', 'I03-2', "parent: '/ai/meal/meals'", true],
    ['ai/meal/plan', 'I03-3', "parent: '/ai/meal/foods'", true],
  ]
  for (const [path, id, parent, bodyBack] of rows) {
    const at = router.indexOf(`path: '${path}',`)
    assert.ok(at > gate, `${path}는 AuthGate 안`)
    const body = router.slice(at, at + 520)
    assert.match(body, new RegExp(`screenId: '${id}'`))
    assert.ok(body.includes(parent), `${id} 상위 화면`)
    assert.match(body, /tab: 'ai'/)
    assert.match(body, /ownH1: true/)
    assert.match(body, /domain: 'meal'/)
    assert.equal(/bodyBack: true/.test(body), bodyBack, `${id} bodyBack`)
  }
})

test('Provider는 인증 안쪽·라우터 바깥의 앱 수준에 있다', () => {
  const app = code('../src/App.tsx')
  const auth = app.indexOf('<AuthProvider>')
  const flow = app.indexOf('<MealPlanFlowProvider>')
  const route = app.indexOf('<RouterProvider')
  assert.ok(auth >= 0 && flow > auth && route > flow)
  const provider = code('../src/ai/meal/MealPlanFlowProvider.tsx')
  assert.match(provider, /authStatus === 'authenticated'/)
  assert.match(provider, /type: 'reset'/)
  assert.match(provider, /controller\.abort\(\)/)
  // 메모리에만 둔다: 새로고침하면 앞 입력이 없어 앞 단계로 돌아간다
  assert.doesNotMatch(provider, /sessionStorage|localStorage|indexedDB/)
})

test('I03 복귀 경로: I03이 구현되어 I07·D01-4가 I03으로 돌아갈 수 있다', async () => {
  const Goal = await server.ssrLoadModule('/src/meal-goal/mealGoalPaths.ts')
  assert.equal(Goal.I03_IMPLEMENTED, true)
  assert.equal(Goal.resolveReturnPath('/ai/meal', '/ai'), '/ai/meal')
  assert.equal(Goal.PATH_MEAL_GOAL_REQUIRED, '/ai/meal/goal-required')
  const gate = code('../src/components/ai/meal/MealPlanGate.tsx')
  // 목표 없음 → I07(replace, 돌아갈 곳은 I03 시작 화면)
  assert.match(
    gate,
    /<Navigate\s+to=\{PATH_MEAL_GOAL_REQUIRED\}\s+replace\s+state=\{\{ returnTo: PATH_AI_MEAL \}\}/,
  )
  // 조회 실패·저장 수단 없음을 목표 없음으로 처리하지 않는다
  assert.match(gate, /state\.status === 'error'/)
  assert.match(gate, /state\.status === 'unavailable'/)
  assert.match(gate, /if \(goal === null\)/)
})

test('I01: 식단 카드는 회원에게만 I03 링크를 주고 상태는 준비 중이다(AI 운동 플랜 카드는 그대로)', async () => {
  const Content = await server.ssrLoadModule(
    '/src/components/ai/aiIntroContent.ts',
  )
  const meal = Content.AI_FEATURES.find((f) => f.key === 'meal')
  assert.equal(meal.status, 'guide')
  assert.deepEqual(
    meal.links.map((l) => [l.to, l.memberOnly]),
    [['/ai/meal', true]],
  )
  assert.equal(
    Content.STATUS_LABEL[Content.effectiveStatus(meal, 'member')],
    '준비 중',
  )
  assert.equal(
    Content.STATUS_LABEL[Content.effectiveStatus(meal, 'guest')],
    '준비 중',
  )
  const exercise = Content.AI_FEATURES.find((f) => f.key === 'exercise')
  assert.equal(exercise.status, 'local')
  assert.equal(exercise.links.length, 2)
})

// ── 범위 준수 ─────────────────────────────────────────────────────────────────
function sourceFiles(dir) {
  return readdirSync(new URL(dir, import.meta.url), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => `${dir}${entry.name}`)
}

test('범위 준수: API 어댑터 이외의 AI 화면은 저장·네트워크 코드를 쓰지 않는다', () => {
  const files = [
    ...sourceFiles('../src/ai/meal/'),
    ...sourceFiles('../src/components/ai/meal/'),
    '../src/pages/AiMealPlanPage.tsx',
    '../src/pages/AiMealSelectPage.tsx',
    '../src/pages/AiMealFoodsPage.tsx',
    '../src/pages/AiMealResultPage.tsx',
  ]
  assert.ok(files.length >= 20)
  for (const file of files) {
    const body = code(file)
    // 기존 프론트엔드 계산·추천 코드를 연결하지 않는다
    assert.doesNotMatch(
      body,
      /mealGoalCalculation|ratioToGrams|foodNutrition|exercisePlan|weeklyScore|exercise\/recommend|portionGrams|PORTION_RATIO/,
      `${file}: 계산·추천 코드 연결`,
    )
    // 저장·네트워크·체험 횟수·권한을 다루지 않는다
    // 직전 AI 직접 연결 패치의 mealPlanApi.ts만 실제 HTTP 요청을 담당한다.
    if (file.endsWith('/mealPlanApi.ts')) {
      assert.match(body, /fetch\(/)
    } else {
      assert.doesNotMatch(
        body,
        /localStorage|sessionStorage|indexedDB|fetch\(|axios|XMLHttpRequest/,
        `${file}: 저장·네트워크`,
      )
    }
    assert.doesNotMatch(
      body,
      /MealPlanRepository|mealPlanSource|mealGoalSource|saveGoal|saveFromDraft|entitlement|aiTrial/,
      `${file}: 저장소·권한`,
    )
  }
})

test('범위 준수: 영양값·목표량을 곱하거나 나누어 만드는 식이 없다', () => {
  const files = [
    ...sourceFiles('../src/ai/meal/'),
    ...sourceFiles('../src/components/ai/meal/'),
  ]
  for (const file of files) {
    const body = code(file)
    assert.doesNotMatch(
      body,
      /\*\s*(0\.[34]|goal\.|kcal|ratio)|\/\s*(100|4|9)\b|reduce\(/,
      `${file}: 계산식`,
    )
  }
})

test('범위 준수: 기존 식단 기록·계획 저장소와 운동 목표 코드는 이 흐름에서 바뀌지 않았다', () => {
  // 이 흐름이 새로 만든 파일은 식단 기록·계획 저장소를 import하지 않는다(위 검사) 이 시험은 저장소 쪽에 I03 흔적이 없음을 확인한다.
  for (const file of [
    '../src/food/mealPlanRepository.ts',
    '../src/food/local/indexedDbMealPlanRepository.ts',
    '../src/food/mealRepository.ts',
  ]) {
    assert.doesNotMatch(code(file), /ai\/meal|AiMeal|MealPlanFlow/)
  }
  assert.match(
    read('../src/food/local/indexedDbMealPlanRepository.ts'),
    /./, // 파일이 있다
  )
})
