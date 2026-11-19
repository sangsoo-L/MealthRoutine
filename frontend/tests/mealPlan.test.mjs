import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// FAST-04B: 내일 식단 계획(D02-1) 모델·화면과 "계획은 실제 섭취와 섞이지 않는다" 원칙.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 IndexedDB(저장·계정 격리·자정 경계·v1/v2/v3→v4 업그레이드)는 Chrome 스크립트(meals-plan)가 검증한다.
let server
let P // mealPlanModel.ts
let M // mealModel.ts
let FoodsDev // devFoodSamples.ts
let PathsMod // foodPaths.ts
let RecordView
let PortionForm
let Dashboard
let FavCtx
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
// 주석을 뺀 코드만 본다(주석은 설명을 위해 다른 저장소 이름을 말할 수 있다).
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  P = await server.ssrLoadModule('/src/food/mealPlanModel.ts')
  M = await server.ssrLoadModule('/src/food/mealModel.ts')
  FoodsDev = await server.ssrLoadModule('/src/food/dev/devFoodSamples.ts')
  PathsMod = await server.ssrLoadModule('/src/food/foodPaths.ts')
  RecordView = (
    await server.ssrLoadModule('/src/components/food/MealRecordView.tsx')
  ).default
  PortionForm = (
    await server.ssrLoadModule('/src/components/food/MealPortionSheet.tsx')
  ).MealPortionForm
  Dashboard = (
    await server.ssrLoadModule('/src/components/food/MealDashboardView.tsx')
  ).default
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
          ids: new Set(['dev-food-2']),
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
const food = (id) => FoodsDev.DEV_FOODS.find((f) => f.id === id)
const NO_KCAL = {
  id: 'dev-nokcal',
  name: '열량 미상 음식',
  per100g: { kcal: null, protein: 2, fat: 1, carb: 3 },
  source: { kind: 'dev-sample', label: '개발용 예시 데이터(테스트)' },
}
const NOW = new Date('2026-11-18T03:00:00.000Z')
let seq = 0
const plan = (over = {}) =>
  P.buildMealPlan({
    id: `p${++seq}`,
    ownerId: 'free',
    requestId: `req-${seq}`,
    planDate: '2026-11-19',
    mealType: 'lunch',
    food: food('dev-food-1'),
    portion: 'normal',
    now: new Date(NOW.getTime() + seq * 1000),
    ...over,
  })

// ── 모델 ──
test('계획 만들기: planDate·양 구분의 중량·영양 스냅샷·출처(dev-sample)·revision 1을 저장한다', () => {
  const r = plan({ portion: 'more' })
  assert.equal(r.planDate, '2026-11-19')
  assert.equal(r.weightGrams, 150)
  assert.equal(r.revision, 1)
  assert.equal(r.schemaVersion, P.MEAL_PLAN_SCHEMA_VERSION)
  assert.deepEqual(r.nutritionSnapshot, food('dev-food-1').per100g)
  assert.notEqual(r.nutritionSnapshot, food('dev-food-1').per100g)
  assert.equal(r.nutritionSource.kind, 'dev-sample')
  assert.equal(r.createdAt, r.updatedAt)
  // 실제 섭취 기록과 달리 날짜 필드는 planDate다(localDate를 쓰지 않는다).
  assert.ok(!('localDate' in r))
})

test('계획 만들기: 날짜·끼니·양 구분·음식 정보가 올바르지 않으면 null이다', () => {
  assert.equal(plan({ planDate: '2026-13-40' }), null)
  assert.equal(plan({ mealType: 'snack' }), null)
  assert.equal(plan({ portion: 'huge' }), null)
  assert.equal(plan({ food: { ...NO_KCAL, name: '  ' } }), null)
  assert.equal(
    plan({ food: { ...NO_KCAL, per100g: { ...NO_KCAL.per100g, fat: -1 } } }),
    null,
  )
  assert.equal(
    plan({ food: { ...NO_KCAL, source: { kind: 'real-api', label: 'x' } } }),
    null,
  )
  // 값이 없는 영양소(null)는 그대로 저장된다(0으로 바꾸지 않는다).
  assert.equal(plan({ food: NO_KCAL }).nutritionSnapshot.kcal, null)
})

test('계획 수정: 양과 중량·revision만 바뀌고 스냅샷·날짜·요청 id는 그대로다', () => {
  const r = plan()
  const later = new Date('2026-11-18T05:00:00.000Z')
  const u = P.buildMealPlanUpdate(r, { portion: 'less', now: later })
  assert.equal(u.portion, 'less')
  assert.equal(u.weightGrams, 50)
  assert.equal(u.revision, 2)
  assert.equal(u.updatedAt, later.toISOString())
  assert.equal(u.createdAt, r.createdAt)
  assert.equal(u.planDate, r.planDate)
  assert.equal(u.requestId, r.requestId)
  assert.deepEqual(u.nutritionSnapshot, r.nutritionSnapshot)
  assert.equal(P.buildMealPlanUpdate(r, { portion: 'x', now: later }), null)
})

test('저장소에서 읽은 값 검증: 손상 행은 null이고 실제 섭취 기록 모양은 계획으로 읽지 않는다', () => {
  const r = plan()
  assert.deepEqual(P.parseMealPlan(JSON.parse(JSON.stringify(r))), r)
  const bad = (patch) => P.parseMealPlan({ ...r, ...patch })
  assert.equal(bad({ schemaVersion: 9 }), null)
  assert.equal(bad({ planDate: '2026-02-31' }), null)
  assert.equal(bad({ mealType: 'brunch' }), null)
  assert.equal(bad({ weightGrams: 0 }), null)
  assert.equal(bad({ nutritionSnapshot: { kcal: 1 } }), null)
  assert.equal(bad({ nutritionSource: { kind: 'x', label: 'y' } }), null)
  assert.equal(bad({ revision: 0 }), null)
  assert.equal(P.parseMealPlan(null), null)
  // 실제 섭취 기록(localDate)은 계획으로 읽히지 않고, 계획(planDate)은 실제 기록으로 읽히지 않는다.
  const asRecord = M.buildMealRecord({
    id: 'x1',
    ownerId: 'free',
    requestId: 'rq-1',
    localDate: '2026-11-19',
    mealType: 'lunch',
    food: food('dev-food-1'),
    portion: 'normal',
    now: NOW,
  })
  assert.equal(P.parseMealPlan(asRecord), null)
  assert.equal(M.parseMealRecord(r), null)
})

test('같은 요청 재전송 판정과 계획 날짜 열림 판정(오늘·지난 날짜는 닫힘)', () => {
  const a = plan()
  assert.equal(P.sameMealPlanContent(a, plan({ id: 'zz' })), true)
  assert.equal(P.sameMealPlanContent(a, plan({ portion: 'more' })), false)
  assert.equal(
    P.sameMealPlanContent(a, plan({ planDate: '2026-11-20' })),
    false,
  )
  assert.equal(P.isPlanDateOpen('2026-11-19', '2026-11-18'), true)
  assert.equal(P.isPlanDateOpen('2026-11-18', '2026-11-18'), false)
  assert.equal(P.isPlanDateOpen('2026-11-17', '2026-11-18'), false)
})

test('끼니별 묶음·합계 계산은 계획에도 같은 함수를 쓴다(스냅샷 × 중량 ÷ 100)', () => {
  const a = plan({ mealType: 'breakfast' })
  const b = plan({
    mealType: 'lunch',
    food: food('dev-food-2'),
    portion: 'more',
  })
  const g = M.groupByMeal([b, a])
  assert.deepEqual(
    g.breakfast.map((x) => x.id),
    [a.id],
  )
  assert.deepEqual(
    g.lunch.map((x) => x.id),
    [b.id],
  )
  assert.equal(M.mealNutrition(b).kcal, 247.5)
})

test('식단 계획 경로 도우미와 승인된 URL', () => {
  assert.equal(PathsMod.PATH_MEAL_PLAN, '/records/meal/plan')
  assert.equal(PathsMod.mealPlanPath(), '/records/meal/plan')
  assert.equal(
    PathsMod.mealPlanPath({ meal: 'dinner', food: 'dev-food-2' }),
    '/records/meal/plan?meal=dinner&food=dev-food-2',
  )
  assert.equal(
    PathsMod.mealPlanPath({ edit: 'p1' }),
    '/records/meal/plan?edit=p1',
  )
})

// ── D02-1 화면 ──
const ready = (records, skippedCount = 0) => ({
  status: 'ready',
  records,
  skippedCount,
})
const view = (variant, over = {}) =>
  html(
    createElement(RecordView, {
      variant,
      localDate: '2026-11-19',
      meal: 'lunch',
      onMealChange: noop,
      tab: 'search',
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
      ...over,
    }),
  )

test('D02-1: 내일 계획 배지·제목·계획 날짜·계획 저장(D01)이 있고 오늘 기록 문구는 없다', () => {
  const out = view('plan', {
    records: ready([
      plan({ mealType: 'lunch' }),
      plan({ mealType: 'dinner', food: food('dev-food-2'), portion: 'more' }),
    ]),
  })
  assert.match(out, /내일 계획 · 실제 섭취 아님/)
  assert.match(out, /<h1[^>]*>내일 식단 계획<\/h1>/)
  assert.match(out, /계획 날짜 2026-11-19/)
  // 개수와 예상 열량(153 + 247.5 = 400.5 → 401)을 실제 기록과 구분해 "예상"으로 표시한다.
  assert.match(out, /내일 계획 2개 · 예상 401kcal/)
  assert.match(out, /내일 계획한 음식/)
  assert.match(out, /aria-label="점심 계획"/)
  assert.match(out, /aria-label="저녁 계획"/)
  // 하단 링크는 저장이 아니라 D01로 돌아가는 동작이라 "계획 마치기"다(계획은 등록할 때 이미 저장된다).
  assert.match(out, />계획 마치기</)
  assert.doesNotMatch(out, /내일 계획 저장/)
  assert.match(out, /오늘 섭취량에 합산되지 않아요/)
  assert.ok(hrefs(out).includes('/records/meal'))
  assert.doesNotMatch(out, /오늘 실제 기록|오늘 식단 기록|오늘 기록 저장/)
  assert.equal((out.match(/data-meal-record=/g) ?? []).length, 2)
})

test('D02-1: 끼니 선택·음식 검색/즐겨찾기·수정·삭제 흐름은 D02와 같은 구성이다', () => {
  const out = view('plan', { records: ready([plan()]) })
  assert.equal((out.match(/role="radio"/g) ?? []).length, 3)
  assert.equal((out.match(/data-food-pick=/g) ?? []).length, 4)
  assert.match(out, /role="tab"[^>]*aria-selected="true"[^>]*>음식 검색/)
  assert.match(out, /aria-label="수정: 현미밥"/)
  assert.match(out, /aria-label="삭제: 현미밥"/)
  // 영양정보 링크의 돌아올 경로는 계획 화면이다(링크 자체는 F02).
  assert.ok(hrefs(out).includes('/foods/dev-food-1'))
  const target = plan()
  const confirm = view('plan', {
    records: ready([target]),
    deleteTargetId: target.id,
  })
  assert.match(confirm, /삭제 확인/)
})

test('D02-1: 개발용 예시 음식임을 표시하고, 저장소·음식이 없으면 준비 중으로 안내하며 등록을 막는다', () => {
  assert.match(view('plan'), /개발용 예시 데이터\(스토리보드 foodDB\)/)
  const off = view('plan', { canRecord: false })
  assert.match(off, /식단 계획 기능을 준비 중이에요/)
  assert.match(off, /aria-disabled="true"[^>]*aria-label="선택: 현미밥"/)
  assert.match(
    view('plan', { records: { status: 'unavailable' } }),
    /식단 계획 저장을 준비 중이에요/,
  )
  assert.match(
    view('plan', { records: { status: 'loading' } }),
    /내일 계획을 불러오는 중이에요/,
  )
  const err = view('plan', { records: { status: 'error' } })
  assert.match(err, /내일 계획을 불러오지 못했어요/)
  assert.match(err, /다시 시도/)
  assert.match(
    view('plan', { records: ready([], 2) }),
    /읽을 수 없는 계획 2개를 제외했어요/,
  )
})

test('D02는 그대로다: 같은 컴포넌트의 기록 모드는 기존 문구와 저장 링크를 쓴다', () => {
  const out = view('record', { localDate: '2026-11-18' })
  assert.match(out, /오늘 실제 기록/)
  assert.match(out, /<h1[^>]*>오늘 식단 기록<\/h1>/)
  assert.match(out, /기록 날짜 2026-11-18/)
  assert.match(out, /오늘 기록 저장/)
  assert.doesNotMatch(out, /내일 계획/)
})

test('양 선택 팝업: 계획 모드는 "먹을 양"·"얼마나 먹을지" 문구를 쓰고 기록 모드는 그대로다', () => {
  const props = {
    mode: 'new',
    foodName: '현미밥',
    per100g: food('dev-food-1').per100g,
    initialPortion: 'normal',
    meal: 'lunch',
    onMealChange: noop,
    busy: false,
    error: null,
    onSubmit: noop,
    onCancel: noop,
  }
  const planOut = html(
    createElement(PortionForm, { ...props, variant: 'plan' }),
  )
  assert.match(planOut, /얼마나 먹을지/)
  assert.match(planOut, /aria-label="먹을 양"/)
  assert.match(planOut, /시안 예시 기준/)
  const recordOut = html(createElement(PortionForm, props))
  assert.match(recordOut, /얼마나 먹었는지/)
  assert.match(recordOut, /aria-label="먹은 양"/)
})

// ── D01 연결: 계획 건수는 실제 섭취와 구분해 표시한다 ──
const dash = (over = {}) =>
  html(
    createElement(Dashboard, {
      localDate: '2026-11-18',
      records: ready([
        M.buildMealRecord({
          id: 'r1',
          ownerId: 'free',
          requestId: 'rq-d1',
          localDate: '2026-11-18',
          mealType: 'breakfast',
          food: food('dev-food-4'),
          portion: 'normal',
          now: NOW,
        }),
      ]),
      recordedDays: 1,
      plans: ready([]),
      onRetry: noop,
      ...over,
    }),
  )

test('D01: 내일 식단 계획 행은 D02-1 링크이고 계획 건수·예상 열량이 있어도 오늘 섭취 열량에 더하지 않는다', () => {
  const none = dash()
  const noneRow = none.match(/data-meal-plan="empty"[\s\S]*?<\/a>/)[0]
  assert.doesNotMatch(noneRow, /준비 중/)
  assert.match(noneRow, /아직 계획한 음식이 없어요/)
  assert.match(noneRow, /내일 계획하기/)
  assert.ok(hrefs(none).includes('/records/meal/plan'))
  // 계획이 3개 있어도 오늘 섭취(카페라테 60kcal)는 그대로다.
  const withPlans = dash({
    plans: ready([
      plan({ food: food('dev-food-1') }),
      plan({ food: food('dev-food-2'), portion: 'more' }),
      plan({ food: food('dev-food-3') }),
    ]),
  })
  assert.match(withPlans, /data-today-kcal[^>]*>60kcal/)
  const row = withPlans.match(/data-meal-plan="filled"[\s\S]*?<\/a>/)[0]
  // 날짜(기계 판독값 포함)·개수·예상 열량과 "실제 섭취 아님"을 함께 보인다.
  assert.match(row, /<time datetime="2026-11-19">11월 19일 목요일<\/time>/i)
  assert.match(row, /계획 3개 · 예상 436kcal/)
  assert.match(row, /실제 섭취 아님/)
  assert.match(row, /계획 보기/)
  // 계획이 끼니 카드(실제 기록)에 나타나지 않는다.
  const cards = withPlans.match(/data-meal-card[\s\S]*?<\/ul>/)[0]
  assert.doesNotMatch(cards, /현미밥|닭가슴살|그린 샐러드/)
})

test('D01: 계획 저장소가 없으면(운영 빌드) 내일 식단 계획만 준비 중이고, 불러오는 중에도 합산하지 않는다', () => {
  const off = dash({ plans: { status: 'unavailable' } })
  assert.match(off, /aria-label="내일 식단 계획"[\s\S]*?준비 중/)
  assert.ok(!hrefs(off).includes('/records/meal/plan'))
  // 확인 중은 "계획 없음"·"내일 계획하기"와 합치지 않는다.
  const loading = dash({ plans: { status: 'loading' } })
  assert.match(
    loading,
    /data-meal-plan="loading"[\s\S]*?내일 계획을 확인하는 중이에요/,
  )
  assert.doesNotMatch(
    loading,
    /아직 계획한 음식이 없어요|내일 계획하기|계획 보기/,
  )
  assert.match(loading, /data-today-kcal[^>]*>60kcal/)
})

test('D01: 내일 계획은 아침·점심·저녁 3끼 기준 상태를 보이고 오늘 끼니 카드와 섞이지 않는다', () => {
  const out = dash({
    plans: ready([plan({ mealType: 'lunch' }), plan({ mealType: 'dinner' })]),
  })
  const meals = out.match(/data-plan-meals[\s\S]*?<\/span><\/span>/)[0]
  assert.match(meals, /data-plan-meal="breakfast"[^>]*>[\s\S]*?아침 미계획/)
  assert.match(meals, /data-plan-meal="lunch"[^>]*>[\s\S]*?점심 계획함/)
  assert.match(meals, /data-plan-meal="dinner"[^>]*>[\s\S]*?저녁 계획함/)
  // 실제 섭취 끼니 카드(3개)는 계획의 영향을 받지 않는다.
  assert.equal((out.match(/data-meal-card=/g) ?? []).length, 3)
  assert.match(out, /data-meal-gauge="1"/)
  const none = dash()
  assert.equal((none.match(/미계획/g) ?? []).length, 3)
})

test('D01: 계획 조회만 실패하면 계획 전용 다시 시도를 보이고 오늘 섭취는 그대로다', () => {
  const out = dash({ plans: { status: 'error' }, onRetryPlans: noop })
  const area = out.match(/data-meal-plan="error"[\s\S]*?<\/button>/)[0]
  assert.match(area, /role="alert"/)
  assert.match(area, /내일 계획을 불러오지 못했어요/)
  assert.match(area, />다시 시도</)
  assert.doesNotMatch(out, /아직 계획한 음식이 없어요|내일 계획하기/)
  assert.match(out, /data-today-kcal[^>]*>60kcal/)
})

test('D01: 읽을 수 없는 계획이 있으면 개수와 함께 알리고, 열량 정보가 없는 계획을 0kcal로 채우지 않는다', () => {
  const out = dash({
    plans: ready([plan({ food: NO_KCAL })], 1),
  })
  const area = out.match(/data-meal-plan="filled"[\s\S]*?(?=<\/section>)/)[0]
  assert.match(area, /계획 1개 · 예상 열량 미산정/)
  assert.match(area, /열량 정보가 없는 계획은 예상 열량에서 빠졌어요/)
  assert.match(area, /읽을 수 없는 계획 1개를 제외했어요/)
  assert.doesNotMatch(area, /0kcal/)
})

// ── 분리 원칙(소스 수준) ──
test('분리: 계획 저장소는 실제 기록 저장소를, 실제 기록 저장소·집계는 계획을 참조하지 않는다', () => {
  const planRepo = code('../src/food/local/indexedDbMealPlanRepository.ts')
  assert.doesNotMatch(planRepo, /STORE_MEALS\b|mealsByOwner|mealRecords/)
  assert.match(planRepo, /STORE_MEAL_PLANS/)
  const recordRepo = code('../src/food/local/indexedDbMealRepository.ts')
  assert.doesNotMatch(recordRepo, /STORE_MEAL_PLANS|mealPlans|MealPlan/)
  for (const file of [
    '../src/food/mealHistory.ts',
    '../src/food/useAllMealRecords.ts',
    '../src/food/useMealRecords.ts',
    '../src/components/food/MealListView.tsx',
    '../src/components/food/MealPreviousView.tsx',
    '../src/components/food/MealDetailView.tsx',
    '../src/pages/MealListPage.tsx',
    '../src/pages/MealPreviousPage.tsx',
    '../src/pages/MealDetailPage.tsx',
    '../src/pages/MealRecordPage.tsx',
  ]) {
    assert.doesNotMatch(code(file), /mealPlan|MealPlan|useMealPlans/, file)
  }
  // 모델 파일도 서로 방향이 한쪽이다: 기록 모델은 계획 모델을 모른다.
  assert.doesNotMatch(code('../src/food/mealModel.ts'), /mealPlan|MealPlan/)
  // D01 페이지는 계획을 별도 훅으로만 읽고, 오늘 합계에 쓰는 records에는 계획을 넣지 않는다.
  const dashPage = code('../src/pages/MealDashboardPage.tsx')
  assert.match(dashPage, /useMealPlans/)
  assert.doesNotMatch(dashPage, /records=\{[^}]*plans/)
})

test('운영 빌드 안전장치와 DB v4 단계: 계획 소스는 DEV일 때만 불러오고 업그레이드는 저장소만 추가한다', () => {
  assert.match(
    read('../src/food/mealPlanSource.ts'),
    /import\.meta\.env\.DEV\s*\?/,
  )
  const db = read('../src/exercise/local/exerciseDb.ts')
  // 버전은 이후 단계(v5 workoutPlans)에서 올라갈 수 있으므로 v4 단계의 내용만 본다.
  const v4 = db.slice(
    db.indexOf('if (oldVersion < 4)'),
    db.indexOf('if (oldVersion < 5)'),
  )
  assert.match(v4, /createObjectStore\(STORE_MEAL_PLANS/)
  assert.match(v4, /\['ownerId', 'planDate'\]/)
  assert.match(v4, /\['ownerId', 'requestId'\]/)
  assert.doesNotMatch(v4, /deleteObjectStore|deleteIndex|clear\(/)
  // 만든 시각 계산의 안전: 저장소는 계획 날짜가 오늘 이후인지 저장 시점의 시계로 확인한다.
  const repo = read('../src/food/local/indexedDbMealPlanRepository.ts')
  assert.match(repo, /isPlanDateOpen/)
  assert.match(repo, /invalidPlanDate/)
})

test('라우트: D02-1은 AuthGate 안의 집중 화면(하단 탭 없음)이고 끼니 상세 경로보다 먼저 정의되어 있다', () => {
  const source = read('../src/app/router.tsx')
  const gate = source.indexOf('element: <AuthGate />')
  const plan = source.indexOf("path: 'records/meal/plan'")
  const meal = source.indexOf("path: 'records/meal/:meal'")
  assert.ok(gate > 0 && plan > gate && meal > plan)
  assert.match(
    source.slice(plan, meal),
    /screenId: 'D02-1'[\s\S]*?focus: true[\s\S]*?parent: '\/records\/meal'/,
  )
})
