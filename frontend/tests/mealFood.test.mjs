import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// FAST-03: 식단 관리 1차(F01 연결·F02·D02·D01-1~3·D01)의 영양 계산·저장 모델·화면 구조.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 IndexedDB(저장·계정 격리·v1/v2→v3 업그레이드)와 화면 이동은 Chrome 스크립트(meals-food)가 검증한다.
let server
let N // foodNutrition.ts
let M // mealModel.ts
let MV // mealView.ts
let P // foodPaths.ts
let FoodsDev // devFoodSamples.ts
let FoodDetailView
let MealDashboardView
let MealDetailView
let MealRecordView
let MealPortionForm
let FavCtx
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  N = await server.ssrLoadModule('/src/food/foodNutrition.ts')
  M = await server.ssrLoadModule('/src/food/mealModel.ts')
  MV = await server.ssrLoadModule('/src/food/mealView.ts')
  P = await server.ssrLoadModule('/src/food/foodPaths.ts')
  FoodsDev = await server.ssrLoadModule('/src/food/dev/devFoodSamples.ts')
  FoodDetailView = (
    await server.ssrLoadModule('/src/components/food/FoodDetailView.tsx')
  ).default
  MealDashboardView = (
    await server.ssrLoadModule('/src/components/food/MealDashboardView.tsx')
  ).default
  MealDetailView = (
    await server.ssrLoadModule('/src/components/food/MealDetailView.tsx')
  ).default
  MealRecordView = (
    await server.ssrLoadModule('/src/components/food/MealRecordView.tsx')
  ).default
  MealPortionForm = (
    await server.ssrLoadModule('/src/components/food/MealPortionSheet.tsx')
  ).MealPortionForm
  FavCtx = (await server.ssrLoadModule('/src/food/foodFavorites.ts'))
    .FoodFavoritesContext
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(
    createElement(
      FavCtx.Provider,
      {
        value: {
          userId: 'u1',
          status: 'ready',
          ids: new Set(),
          savingIds: new Set(),
          failedIds: new Set(),
          toggle: async () => ({ ok: true }),
          reload: noop,
          activate: noop,
        },
      },
      createElement(MemoryRouter, null, element),
    ),
  )
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

const NOW = new Date('2026-11-18T03:00:00.000Z')
const food = (id) => FoodsDev.DEV_FOODS.find((f) => f.id === id)
const NO_KCAL = {
  id: 'dev-nokcal',
  name: '열량 미상 음식',
  per100g: { kcal: null, protein: 2, fat: 1, carb: 3 },
  source: { kind: 'dev-sample', label: '개발용 예시 데이터(테스트)' },
}

const rec = (over = {}) =>
  M.buildMealRecord({
    id: 'r1',
    ownerId: 'free',
    requestId: 'req-1',
    localDate: '2026-11-18',
    mealType: 'breakfast',
    food: food('dev-food-1'),
    portion: 'normal',
    now: NOW,
    ...over,
  })

// ── 개발용 예시 데이터 ──
test('개발용 예시 음식은 스토리보드 foodDB 4개를 값 그대로 담고 개발용 출처를 밝힌다', () => {
  assert.equal(FoodsDev.DEV_FOODS.length, 4)
  assert.deepEqual(
    FoodsDev.DEV_FOODS.map((f) => [f.name, f.category]),
    [
      ['현미밥', '한식'],
      ['닭가슴살', '한식'],
      ['그린 샐러드', '양식'],
      ['카페라테', '음료'],
    ],
  )
  assert.deepEqual(food('dev-food-1').per100g, {
    kcal: 153,
    protein: 3.1,
    fat: 1,
    carb: 33,
  })
  for (const f of FoodsDev.DEV_FOODS) {
    assert.equal(f.source.kind, 'dev-sample')
    assert.match(f.source.label, /개발용 예시/)
  }
})

test('운영 빌드 안전장치: 음식·식단 소스는 import.meta.env.DEV일 때만 개발 모듈을 불러온다', () => {
  for (const file of [
    '../src/food/foodSource.ts',
    '../src/food/mealSource.ts',
    '../src/food/foodFavoriteSource.ts',
  ]) {
    assert.match(read(file), /import\.meta\.env\.DEV\s*\?/, file)
  }
})

// ── 영양 계산 ──
test('선택량 영양값 = 100g 기준값 × 중량 ÷ 100이고 없는 값은 0이 아니라 null이다', () => {
  const s = N.scaleNutrition(food('dev-food-1').per100g, 150)
  assert.equal(s.kcal, 229.5)
  assert.equal(N.formatKcal(s.kcal), '230kcal')
  assert.equal(N.formatMacro(s.carb), '49.5g')
  const n = N.scaleNutrition(NO_KCAL.per100g, 100)
  assert.equal(n.kcal, null)
  assert.equal(N.formatKcal(n.kcal), null)
  assert.equal(n.protein, 2)
  // 0g 영양소는 정보 있음(0)이다.
  assert.equal(N.scaleNutrition(food('dev-food-2').per100g, 100).carb, 0)
  // 올바르지 않은 중량은 모두 null.
  for (const bad of [0, -5, Number.NaN, Infinity]) {
    assert.deepEqual(N.scaleNutrition(food('dev-food-1').per100g, bad), {
      kcal: null,
      protein: null,
      fat: null,
      carb: null,
    })
  }
})

test('양 구분 환산은 시안 예시 기준(1인분 100g, 0.5배·1배·1.5배)이다', () => {
  assert.equal(N.SAMPLE_SERVING_GRAMS, 100)
  assert.deepEqual(
    N.PORTIONS.map((p) => N.portionGrams(p)),
    [50, 100, 150],
  )
  assert.equal(N.portionLabel('less', 50), '적게 · 50g')
  assert.equal(N.portionLabel('normal', 100), '보통(1인분) · 100g')
})

test('합계는 값이 있는 기록만 더하고 비어 있는 기록이 있으면 불완전로 알린다', () => {
  const a = M.mealNutrition(rec())
  const b = M.mealNutrition(rec({ id: 'r2', food: NO_KCAL }))
  const t = N.sumNutrition([a, b])
  assert.equal(t.kcal, 153)
  assert.equal(t.kcalIncomplete, true)
  assert.equal(t.incomplete, true)
  assert.equal(t.incompleteCount, 1)
  assert.equal(MV.totalKcalText(t), '153kcal')
  assert.match(MV.incompleteNotice(t), /1개/)
  const none = N.sumNutrition([b])
  assert.equal(none.kcal, null)
  assert.equal(MV.totalKcalText(none), '미산정')
  assert.equal(MV.incompleteNotice(N.sumNutrition([a])), null)
})

test('탄단지 열량 비율은 4/4/9 환산이고 합이 항상 100이다', () => {
  for (const id of ['dev-food-1', 'dev-food-2', 'dev-food-3', 'dev-food-4']) {
    const share = N.macroShare([M.mealNutrition(rec({ food: food(id) }))])
    assert.ok(share, id)
    assert.equal(
      share.carbPercent + share.proteinPercent + share.fatPercent,
      100,
      id,
    )
  }
  // 하나라도 없으면 그 기록은 비율에서 제외, 쓸 기록이 없으면 null.
  const noMacro = {
    ...NO_KCAL,
    per100g: { kcal: 10, protein: null, fat: 1, carb: 1 },
  }
  assert.equal(N.macroShare([M.mealNutrition(rec({ food: noMacro }))]), null)
})

// ── 저장 모델 ──
test('기록 만들기: 양 구분에서 중량을 정하고 영양 스냅샷·출처를 함께 저장한다', () => {
  const r = rec({ portion: 'more' })
  assert.equal(r.weightGrams, 150)
  assert.equal(r.revision, 1)
  assert.equal(r.schemaVersion, M.MEAL_SCHEMA_VERSION)
  assert.deepEqual(r.nutritionSnapshot, food('dev-food-1').per100g)
  assert.equal(r.nutritionSource.kind, 'dev-sample')
  assert.equal(r.createdAt, r.updatedAt)
  // 스냅샷은 원본 객체와 별개다(나중에 음식 값이 바뀌어도 과거 기록은 그대로).
  assert.notEqual(r.nutritionSnapshot, food('dev-food-1').per100g)
})

test('기록 만들기: 날짜·끼니·양 구분·음식 정보가 올바르지 않으면 null이다', () => {
  assert.equal(rec({ localDate: '2026-13-40' }), null)
  assert.equal(rec({ mealType: 'snack' }), null)
  assert.equal(rec({ portion: 'huge' }), null)
  assert.equal(rec({ food: { ...NO_KCAL, name: '  ' } }), null)
  assert.equal(
    rec({ food: { ...NO_KCAL, per100g: { ...NO_KCAL.per100g, fat: -1 } } }),
    null,
  )
  assert.equal(
    rec({ food: { ...NO_KCAL, source: { kind: 'real-api', label: 'x' } } }),
    null,
  )
})

test('기록 수정: 양과 중량·revision만 바뀌고 스냅샷은 그대로다', () => {
  const r = rec()
  const later = new Date('2026-11-18T05:00:00.000Z')
  const u = M.buildMealUpdate(r, { portion: 'less', now: later })
  assert.equal(u.portion, 'less')
  assert.equal(u.weightGrams, 50)
  assert.equal(u.revision, 2)
  assert.equal(u.updatedAt, later.toISOString())
  assert.equal(u.createdAt, r.createdAt)
  assert.deepEqual(u.nutritionSnapshot, r.nutritionSnapshot)
  assert.equal(u.requestId, r.requestId)
  assert.equal(M.buildMealUpdate(r, { portion: 'x', now: later }), null)
})

test('저장소에서 읽은 값 검증: 손상 행은 null이고 정상 행은 그대로다', () => {
  const r = rec()
  assert.deepEqual(M.parseMealRecord(JSON.parse(JSON.stringify(r))), r)
  const bad = (patch) => M.parseMealRecord({ ...r, ...patch })
  assert.equal(bad({ schemaVersion: 9 }), null)
  assert.equal(bad({ mealType: 'brunch' }), null)
  assert.equal(bad({ weightGrams: 0 }), null)
  assert.equal(bad({ weightGrams: M.MAX_WEIGHT_GRAMS + 1 }), null)
  assert.equal(bad({ nutritionSnapshot: { kcal: 1 } }), null)
  assert.equal(bad({ nutritionSource: { kind: 'x', label: 'y' } }), null)
  assert.equal(bad({ revision: 0 }), null)
  assert.equal(bad({ createdAt: 'yesterday' }), null)
  assert.equal(M.parseMealRecord(null), null)
  assert.equal(M.parseMealRecord([]), null)
})

test('같은 요청의 재전송 판정과 끼니별 묶음(등록 순서)', () => {
  const a = rec()
  assert.equal(M.sameMealContent(a, rec({ id: 'x' })), true)
  assert.equal(M.sameMealContent(a, rec({ portion: 'more' })), false)
  const lunch = rec({
    id: 'r2',
    mealType: 'lunch',
    now: new Date('2026-11-18T04:00:00.000Z'),
  })
  const second = rec({
    id: 'r3',
    now: new Date('2026-11-18T05:00:00.000Z'),
  })
  const g = M.groupByMeal([second, lunch, a])
  assert.deepEqual(
    g.breakfast.map((r) => r.id),
    ['r1', 'r3'],
  )
  assert.deepEqual(
    g.lunch.map((r) => r.id),
    ['r2'],
  )
  assert.deepEqual(g.dinner, [])
  assert.equal(M.mealTypeFromParam('lunch'), 'lunch')
  assert.equal(M.mealTypeFromParam('record'), null)
  assert.equal(M.mealTypeFromParam(undefined), null)
})

test('식단 경로 도우미', () => {
  assert.equal(P.mealDetailPath('dinner'), '/records/meal/dinner')
  assert.equal(P.foodDetailPath('dev-food-1'), '/foods/dev-food-1')
  assert.equal(P.recordMealPath(), '/records/meal/record')
  assert.equal(
    P.recordMealPath({ meal: 'lunch', food: 'dev-food-2' }),
    '/records/meal/record?meal=lunch&food=dev-food-2',
  )
  assert.equal(P.recordMealPath({ edit: 'r1' }), '/records/meal/record?edit=r1')
})

// ── 화면 ──
const ready = (records, skippedCount = 0) => ({
  status: 'ready',
  records,
  skippedCount,
})

test('D01: 기록이 없으면 빈 상태·D02 링크·끼니 카드 3개(빈 끼니는 그 끼니의 D02)·준비 중 안내를 보이고 목표 열량을 만들지 않는다', () => {
  const out = html(
    createElement(MealDashboardView, {
      plans: { status: 'ready', records: [], skippedCount: 0 },
      localDate: '2026-11-18',
      records: ready([]),
      onRetry: noop,
    }),
  )
  assert.match(out, /<h1[^>]*>식단 기록<\/h1>/)
  assert.match(
    out,
    /<time datetime="2026-11-18"[^>]*>11월 18일 수요일<\/time>/i,
  )
  assert.match(out, /아직 기록 없음/)
  assert.equal((out.match(/data-meal-card=/g) ?? []).length, 3)
  const links = hrefs(out)
  // 실제로 확인된 빈 끼니는 상세를 거치지 않고 그 끼니가 골라진 D02로 바로 간다.
  for (const href of [
    '/records/exercise',
    '/records/meal/record',
    '/records/meal/record?meal=breakfast',
    '/records/meal/record?meal=lunch',
    '/records/meal/record?meal=dinner',
  ]) {
    assert.ok(links.includes(href), href)
  }
  for (const href of [
    '/records/meal/breakfast',
    '/records/meal/lunch',
    '/records/meal/dinner',
  ]) {
    assert.ok(!links.includes(href), href)
  }
  assert.match(out, /aria-label="아침 기록하기 \(아직 기록하지 않았어요\)"/)
  // 목표 준비 중 안내는 식단 관리 한 곳에만 둔다.
  assert.equal((out.match(/목표 설정은 준비 중이에요/g) ?? []).length, 1)
  assert.doesNotMatch(out, /목표 열량은 식단 목표 설정이 준비되면/)
  assert.match(out, /식단 목표/)
  assert.match(out, /내 식단 리스트/)
  assert.match(out, /준비 중/)
  assert.doesNotMatch(out, /목표 열량\s*[0-9]/)
  assert.doesNotMatch(out, /data-today-kcal/)
})

test('D01: 기록이 있으면 오늘 열량·탄단지 합계와 끼니 카드 요약을 보인다', () => {
  const out = html(
    createElement(MealDashboardView, {
      plans: { status: 'ready', records: [], skippedCount: 0 },
      localDate: '2026-11-18',
      records: ready([
        rec(),
        rec({ id: 'r2', food: food('dev-food-2'), mealType: 'lunch' }),
      ]),
      onRetry: noop,
    }),
  )
  assert.match(out, /data-today-kcal[^>]*>318kcal/)
  assert.match(out, /현미밥/)
  assert.match(out, /닭가슴살/)
  assert.match(out, /오늘 기록함/)
  assert.doesNotMatch(out, /불완전/)
  // 기록이 있는 끼니는 끼니 상세, 빈 끼니(저녁)는 D02로 간다.
  const links = hrefs(out)
  assert.ok(links.includes('/records/meal/breakfast'))
  assert.ok(links.includes('/records/meal/lunch'))
  assert.ok(links.includes('/records/meal/record?meal=dinner'))
})

test('D01: 3끼 카드·게이지·진행 막대: 같은 끼니는 합산하고 목표 없이 비율만 보이고 완료 수는 기록한 끼니 수다', () => {
  const out = html(
    createElement(MealDashboardView, {
      plans: { status: 'ready', records: [], skippedCount: 0 },
      localDate: '2026-11-18',
      records: ready([
        rec(),
        rec({ id: 'r2', food: food('dev-food-2') }),
        rec({ id: 'r3', food: food('dev-food-2'), mealType: 'dinner' }),
      ]),

      onRetry: noop,
    }),
  )
  // 가로 3개 카드(아침·점심·저녁만)
  assert.deepEqual(
    [...out.matchAll(/data-meal-card="(\w+)"/g)].map((m) => m[1]),
    ['breakfast', 'lunch', 'dinner'],
  )
  assert.doesNotMatch(out, /snack|간식|기타/)
  assert.match(out, /grid-cols-\[repeat\(auto-fit,minmax\(5\.5rem,1fr\)\)\]/)
  // 같은 아침 기록 2건의 열량을 합산(153 + 165 = 318)
  const breakfast = out.match(/data-meal-card="breakfast"[\s\S]*?<\/li>/)[0]
  assert.match(breakfast, />318kcal</)
  assert.match(breakfast, /기록함/)
  // 점심은 비어 있어 추가 안내와 D02 링크, 완료 수는 3끼 중 2끼
  const lunch = out.match(/data-meal-card="lunch"[\s\S]*?<\/li>/)[0]
  assert.match(lunch, /기록 추가/)
  assert.match(lunch, /meal=lunch/)
  assert.match(out, /data-meal-gauge="2"/)
  assert.match(out, /aria-label="3끼 중 2끼 기록"/)
  assert.match(out, /3끼 중 2끼 기록/)
  // 영양소 진행 막대 3개(목표 대비가 아닌 열량 비율), 목표·남은 열량·달성률 문구 없음
  assert.equal((out.match(/role="progressbar"/g) ?? []).length, 3)
  assert.match(out, /목표와 비교하지 않아요/)
  assert.doesNotMatch(out, /(남은 열량|달성률|목표 열량)\s*[0-9]/)
})

test('D01: 기록이 없으면 게이지·진행 막대를 그리지 않고, 확인 전 상태에서도 그리지 않는다', () => {
  for (const records of [
    { status: 'ready', records: [], skippedCount: 0 },
    { status: 'loading' },
    { status: 'error' },
    { status: 'unavailable' },
  ]) {
    const out = html(
      createElement(MealDashboardView, {
        plans: { status: 'ready', records: [], skippedCount: 0 },
        localDate: '2026-11-18',
        records,
        onRetry: noop,
      }),
    )
    assert.doesNotMatch(out, /data-meal-gauge|role="progressbar"/)
  }
})

test('D01: 열량 정보가 없는 기록은 합계를 불완전으로 알리고 0으로 채우지 않는다', () => {
  const out = html(
    createElement(MealDashboardView, {
      plans: { status: 'ready', records: [], skippedCount: 0 },
      localDate: '2026-11-18',
      records: ready([rec({ food: NO_KCAL })]),
      onRetry: noop,
    }),
  )
  assert.match(out, /data-today-kcal[^>]*>미산정/)
  assert.match(out, /불완전/)
  assert.doesNotMatch(out, />0kcal</)
})

test('D01: 불러오는 중·준비 중·오류 상태가 구분되고 오류에는 다시 시도가 있다', () => {
  const view = (records) =>
    html(
      createElement(MealDashboardView, {
        plans: { status: 'ready', records: [], skippedCount: 0 },
        localDate: '2026-11-18',
        records,
        onRetry: noop,
      }),
    )
  // 확인 전(불러오는 중·준비 중·오류)에는 "기록 없음"·"아직 기록하지 않았어요"·0으로 단정하지 않고, 끼니 칸은 이동하지 않는다.
  const loading = view({ status: 'loading' })
  assert.match(loading, /불러오는 중/)
  const unavailable = view({ status: 'unavailable' })
  assert.match(unavailable, /준비 중이에요/)
  const error = view({ status: 'error' })
  assert.match(error, /role="alert"/)
  assert.match(error, /다시 시도/)
  assert.equal((error.match(/>다시 시도</g) ?? []).length, 1)
  for (const out of [loading, unavailable, error]) {
    assert.doesNotMatch(out, /아직 기록 없음|아직 기록하지 않았어요|>0kcal</)
    assert.doesNotMatch(out, /data-today-kcal/)
    assert.equal((out.match(/data-meal-card=/g) ?? []).length, 3)
    const links = hrefs(out)
    assert.ok(
      !links.some((href) =>
        /^\/records\/meal\/(breakfast|lunch|dinner)$|meal=/.test(href),
      ),
    )
    // 새 기록은 조회 상태와 별개로 할 수 있다.
    assert.ok(links.includes('/records/meal/record'))
  }
  assert.match(loading, /확인하는 중이에요/)
  assert.match(error, /불러오지 못했어요/)
})

test('D01: 읽을 수 없는 기록이 있으면 읽을 수 있는 기록만 보여 주고 누락 사실을 오늘 섭취와 끼니 영역에 알린다', () => {
  const out = html(
    createElement(MealDashboardView, {
      plans: { status: 'ready', records: [], skippedCount: 0 },
      localDate: '2026-11-18',
      records: ready([rec()], 2),
      onRetry: noop,
    }),
  )
  assert.match(out, /data-today-kcal/)
  assert.match(out, /읽을 수 없는 기록 2개가 있어 합계와 끼니에서 제외했어요/)
  assert.match(out, /읽을 수 없는 기록 2개를 제외했어요/)
})

const detailProps = (over = {}) => ({
  meal: 'breakfast',
  localDate: '2026-11-18',
  records: ready([]),
  deleteTargetId: null,
  deleting: false,
  deleteError: null,
  notice: null,
  onAskDelete: noop,
  onConfirmDelete: noop,
  onCancelDelete: noop,
  onRetry: noop,
  ...over,
})

test('D01-1~3: 세 끼니가 같은 구조이고 끼니 전환·추가 링크가 이 끼니를 가리킨다', () => {
  for (const [meal, label] of [
    ['breakfast', '아침'],
    ['lunch', '점심'],
    ['dinner', '저녁'],
  ]) {
    const out = html(createElement(MealDetailView, detailProps({ meal })))
    assert.match(out, new RegExp(`<h1[^>]*>${label} 식단`))
    assert.match(out, new RegExp(`아직 ${label} 기록이 없어요`))
    const links = hrefs(out)
    assert.ok(links.includes('/records/meal/breakfast'))
    assert.ok(links.includes('/records/meal/lunch'))
    assert.ok(links.includes('/records/meal/dinner'))
    assert.ok(links.includes(`/records/meal/record?meal=${meal}`))
    assert.equal((out.match(/aria-current="page"/g) ?? []).length, 1)
  }
})

test('D01-1: 이 끼니의 기록만 보이고 수정은 D02 ?edit=, 삭제는 확인 패널을 거친다', () => {
  const records = ready([
    rec(),
    rec({ id: 'r2', mealType: 'lunch', food: food('dev-food-2') }),
  ])
  const out = html(createElement(MealDetailView, detailProps({ records })))
  assert.match(out, /현미밥/)
  assert.doesNotMatch(out, /닭가슴살/)
  assert.ok(hrefs(out).includes('/records/meal/record?edit=r1'))
  assert.match(out, /aria-label="삭제: 현미밥"/)
  assert.doesNotMatch(out, /삭제 확인/)
  const confirm = html(
    createElement(
      MealDetailView,
      detailProps({ records, deleteTargetId: 'r1' }),
    ),
  )
  assert.match(confirm, /현미밥 삭제 확인/)
  assert.match(confirm, /되돌릴 수 없어요/)
})

test('D02: 끼니 선택·음식 검색/즐겨찾기 탭·오늘 기록 목록·저장 링크를 갖춘다', () => {
  const out = html(
    createElement(MealRecordView, {
      localDate: '2026-11-18',
      meal: null,
      onMealChange: noop,
      tab: 'search',
      onTabChange: noop,
      query: '',
      onQueryChange: noop,
      foods: { status: 'ready', foods: FoodsDev.DEV_FOODS },
      favoriteIds: new Set(['dev-food-2']),
      favoritesStatus: 'ready',
      records: ready([rec()]),
      canRecord: true,
      notice: null,
      onPick: noop,
      onEditRecord: noop,
      deleteTargetId: null,
      deleting: false,
      deleteError: null,
      onAskDelete: noop,
      onConfirmDelete: noop,
      onCancelDelete: noop,
      onRetryFoods: noop,
      onRetryRecords: noop,
    }),
  )
  assert.match(out, /오늘 식단 기록/)
  assert.match(out, /음식을 등록할 끼니를 먼저 골라 주세요/)
  assert.equal((out.match(/role="radio"/g) ?? []).length, 3)
  assert.equal((out.match(/data-food-pick=/g) ?? []).length, 4)
  assert.match(out, /role="tab"[^>]*aria-selected="true"[^>]*>음식 검색/)
  assert.match(out, /data-meal-record="r1"/)
  assert.ok(hrefs(out).includes('/records/meal'))
  assert.ok(hrefs(out).includes('/foods/dev-food-1'))
})

test('D02: 즐겨찾기 탭은 즐겨찾기한 음식만, 저장소가 없으면 준비 중을 알리고 선택은 막는다', () => {
  const base = {
    localDate: '2026-11-18',
    meal: 'lunch',
    onMealChange: noop,
    tab: 'favorites',
    onTabChange: noop,
    query: '',
    onQueryChange: noop,
    foods: { status: 'ready', foods: FoodsDev.DEV_FOODS },
    favoriteIds: new Set(['dev-food-2']),
    favoritesStatus: 'ready',
    records: ready([]),
    canRecord: true,
    notice: null,
    onPick: noop,
    onEditRecord: noop,
    deleteTargetId: null,
    deleting: false,
    deleteError: null,
    onAskDelete: noop,
    onConfirmDelete: noop,
    onCancelDelete: noop,
    onRetryFoods: noop,
    onRetryRecords: noop,
  }
  const fav = html(createElement(MealRecordView, base))
  assert.equal((fav.match(/data-food-pick=/g) ?? []).length, 1)
  assert.match(fav, /data-food-pick="dev-food-2"/)
  const empty = html(
    createElement(MealRecordView, { ...base, favoriteIds: new Set() }),
  )
  assert.match(empty, /즐겨찾기한 음식이 없어요/)
  const off = html(
    createElement(MealRecordView, {
      ...base,
      tab: 'search',
      canRecord: false,
    }),
  )
  assert.match(off, /식단 기록 기능을 준비 중이에요/)
  assert.match(off, /aria-disabled="true"[^>]*aria-label="선택: 현미밥"/)
})

test('양 선택 팝업: 적게·보통·많이에 중량과 예상 열량을 보이고 열량이 없으면 정보 없음, 시안 예시 기준을 밝힌다', () => {
  const props = {
    mode: 'new',
    foodName: '현미밥',
    per100g: food('dev-food-1').per100g,
    initialPortion: 'normal',
    meal: 'breakfast',
    onMealChange: noop,
    busy: false,
    error: null,
    onSubmit: noop,
    onCancel: noop,
  }
  const out = html(createElement(MealPortionForm, props))
  assert.match(out, /적게/)
  assert.match(out, /보통 \(1인분\)|보통<!-- --> <!-- -->\(1인분\)|보통.*1인분/)
  assert.match(out, /50g/)
  assert.match(out, /150g/)
  assert.match(out, /예상 77kcal|예상 <!-- -->77kcal|77kcal/)
  assert.match(out, /시안 예시 기준/)
  assert.doesNotMatch(out, /끼니를 먼저 골라 주세요/)
  const noMeal = html(createElement(MealPortionForm, { ...props, meal: null }))
  assert.match(noMeal, /끼니를 먼저 골라 주세요/)
  const noKcal = html(
    createElement(MealPortionForm, { ...props, per100g: NO_KCAL.per100g }),
  )
  assert.match(noKcal, /열량 정보 없음/)
  const edit = html(createElement(MealPortionForm, { ...props, mode: 'edit' }))
  assert.doesNotMatch(edit, /aria-label="끼니"/)
  assert.match(edit, /수정 저장/)
})

test('F02: 음식명·분류·100g 기준·선택량·알레르기 확인 불가·출처를 보이고 회원에게만 즐겨찾기·기록 링크를 준다', () => {
  const view = (isMember, grams = 150, f = FoodsDev.DEV_FOODS[0]) =>
    html(
      createElement(FoodDetailView, {
        food: f,
        grams,
        onGramsChange: noop,
        isMember,
      }),
    )
  const member = view(true)
  assert.match(member, /<h1[^>]*>현미밥/)
  assert.match(member, /한식/)
  assert.match(member, /data-food-kcal[^>]*>230/)
  assert.match(member, /확인 불가/)
  assert.match(member, /개발용 예시 데이터/)
  assert.match(member, /실제 운영 데이터가 아니에요/)
  assert.ok(hrefs(member).includes('/records/meal/record?food=dev-food-1'))
  assert.match(member, /aria-label="식단에 기록: 현미밥"/)
  const guest = view(false)
  assert.doesNotMatch(guest, /aria-label="식단에 기록:/)
  assert.match(guest, /로그인하면 즐겨찾기/)
  // 열량이 없는 음식은 0이 아니라 정보 없음.
  const noKcal = view(true, 100, {
    ...FoodsDev.DEV_FOODS[0],
    id: 'x',
    name: '열량 미상',
    per100g: NO_KCAL.per100g,
  })
  assert.match(noKcal, /data-food-kcal[^>]*>정보 없음/)
  assert.doesNotMatch(noKcal, /data-food-kcal[^>]*>0</)
})

// ── 라우트 ──
test('라우트: D01은 정식 페이지, D02는 하단 탭 없는 집중 화면, 끼니 상세는 고정 경로 뒤에 있다', () => {
  const source = read('../src/app/router.tsx')
  assert.match(
    source,
    /path: 'records\/meal',\s*element: <MealDashboardPage \/>/,
  )
  const dashboard = source.slice(source.indexOf("path: 'records/meal',"))
  assert.match(dashboard, /screenId: 'D01'[\s\S]*?parent: null/)
  assert.match(dashboard, /transition: 'fade'/)
  const record = source.indexOf("path: 'records/meal/record'")
  const detail = source.indexOf("path: 'records/meal/:meal'")
  assert.ok(
    record > 0 && detail > record,
    '고정 경로가 :meal보다 먼저여야 한다',
  )
  assert.match(
    source.slice(record, detail),
    /screenId: 'D02'[\s\S]*?focus: true[\s\S]*?parent: '\/records\/meal'/,
  )
  assert.match(source.slice(detail, detail + 700), /D01-1·D01-2·D01-3/)
  // F02는 AuthGate 밖(공개) 라우트다.
  const food = source.indexOf("path: 'foods/:foodId'")
  const gate = source.indexOf('element: <AuthGate />')
  assert.ok(food > 0 && food < gate, 'F02는 AuthGate 밖에 있어야 한다')
  assert.match(
    source.slice(food, food + 600),
    /screenId: 'F02'[\s\S]*?parent: '\/foods'/,
  )
})

test('운동 즐겨찾기와 음식 즐겨찾기는 저장 위치가 분리되어 있다', () => {
  const dev = read('../src/dev-mock/devMockStorage.ts')
  assert.match(dev, /'foodFavorite'/)
  const mock = read('../src/food/mock/mockFoodFavoriteRepository.ts')
  assert.match(mock, /foodFavorite/)
})
