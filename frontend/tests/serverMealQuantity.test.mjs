import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// 식단 서버 저장소의 양 구분 ↔ 인분 변환 회귀 테스트(PR #30 리뷰 P1).
// api/http.ts를 가짜 백엔드로 바꿔 끼운다. 가짜 백엔드는 실제 백엔드 계산을 따른다:
// quantity 0.1 미만 거절, amountG = 1인분 중량 × quantity, 영양소 = 100g 기준값 × amountG / 100
const FAKE_HTTP = `
export class ApiError extends Error {
  constructor(status, errorCode) { super(errorCode); this.status = status; this.errorCode = errorCode }
}
export function apiRequest(method, path, options) { return globalThis.__fakeApi(method, path, options) }
`

let server
let Q
let repoModule
let Nutrition
let Sheet
let FoodRepo

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    plugins: [
      {
        name: 'fake-http',
        enforce: 'pre',
        load(id) {
          if (id.replace(/\\/g, '/').endsWith('/src/api/http.ts'))
            return FAKE_HTTP
        },
      },
    ],
  })
  Q = await server.ssrLoadModule('/src/food/server/mealQuantity.ts')
  repoModule = await server.ssrLoadModule(
    '/src/food/server/serverMealRepository.ts',
  )
  Nutrition = await server.ssrLoadModule('/src/food/foodNutrition.ts')
  Sheet = await server.ssrLoadModule(
    '/src/components/food/MealPortionSheet.tsx',
  )
  FoodRepo = await server.ssrLoadModule(
    '/src/food/server/serverFoodRepository.ts',
  )
})

after(async () => {
  await server?.close()
})

// 1인분 중량이 아주 작은 음식부터 큰 음식까지(리뷰 재현 사례 149g 포함)
const SERVINGS = [
  1, 5, 10, 33, 99, 100, 149, 150, 250, 333, 999, 1000, 2500, 5000,
]
const PORTIONS = ['less', 'normal', 'more']

let records
let patchCount
function installFakeBackend() {
  records = new Map()
  patchCount = 0
  let nextId = 1
  const ApiError = class extends Error {
    constructor(status) {
      super(String(status))
      this.status = status
    }
  }
  const build = (id, body, serving) => {
    const { quantity, foodId } = body.items[0]
    if (!(quantity >= 0.1)) throw new ApiError(400)
    const amountG = serving * quantity
    return {
      mealRecordId: id,
      mealAt: body.mealAt,
      mealType: body.mealType,
      recordType: 'actual',
      serving,
      items: [
        {
          mealItemId: id,
          foodId,
          foodName: `음식${foodId}`,
          quantity,
          amountG,
          caloriesKcal: (50 * amountG) / 100,
          carbohydrateG: (10 * amountG) / 100,
          proteinG: (3 * amountG) / 100,
          fatG: (1 * amountG) / 100,
        },
      ],
    }
  }
  globalThis.__fakeApi = async (method, path, options) => {
    if (method === 'POST' && path === '/meal-records') {
      const id = nextId++
      const serving = options.body.items[0].foodId // 테스트에서는 foodId = 1인분 중량
      const r = build(id, options.body, serving)
      records.set(id, r)
      return r
    }
    const m = path.match(/^\/meal-records\/(\d+)$/)
    if (m) {
      const r = records.get(Number(m[1]))
      if (!r) throw new ApiError(404)
      if (method === 'GET') return r
      if (method === 'PATCH') {
        patchCount++
        const next = build(
          r.mealRecordId,
          { ...r, items: options.body.items },
          r.serving,
        )
        records.set(r.mealRecordId, next)
        return next
      }
    }
    throw new Error(`unexpected ${method} ${path}`)
  }
}

beforeEach(installFakeBackend)

const createInput = (serving, portion, n) => ({
  requestId: `req-${serving}-${portion}-${n}`,
  localDate: '2026-11-24',
  mealType: 'lunch',
  food: { id: String(serving), name: `음식${serving}` },
  portion,
})

test('양 구분은 항상 0.5·1·1.5인분이고 서버 최소값 0.1 이상이다', () => {
  assert.deepEqual(
    PORTIONS.map((p) => Q.quantityOfPortion(p)),
    [0.5, 1, 1.5],
  )
  for (const p of PORTIONS) assert.ok(Q.quantityOfPortion(p) >= 0.1)
})

test('인분 → 양 구분 복원: 정확한 값과 경계값', () => {
  for (const p of PORTIONS)
    assert.equal(Q.portionOfQuantity(Q.quantityOfPortion(p)), p)
  assert.equal(Q.portionOfQuantity(0.1), 'less')
  assert.equal(Q.portionOfQuantity(0.74), 'less')
  assert.equal(Q.portionOfQuantity(0.75), 'normal')
  assert.equal(Q.portionOfQuantity(1.24), 'normal')
  assert.equal(Q.portionOfQuantity(1.25), 'more')
  assert.equal(Q.portionOfQuantity(2), 'more') // 다른 화면에서 저장한 2인분
})

test('어떤 1인분 중량이든 저장이 성공하고 다시 불러오면 같은 양 구분이다', async () => {
  const repo = repoModule.createServerMealRecordRepository('2')
  let n = 0
  for (const serving of SERVINGS) {
    for (const portion of PORTIONS) {
      const { record } = await repo.create(createInput(serving, portion, n++))
      assert.equal(record.portion, portion, `저장 직후 ${serving}g ${portion}`)
      const again = await repo.get(record.id)
      assert.equal(again.portion, portion, `재조회 ${serving}g ${portion}`)
      // 중량은 그 음식의 1인분 기준(반올림 없이 서버 값 그대로)
      assert.equal(
        again.weightGrams,
        Math.round(serving * Q.quantityOfPortion(portion)),
      )
    }
  }
})

test('양 구분을 바꾸지 않고 수정 저장하면 중량·영양소가 그대로다', async () => {
  const repo = repoModule.createServerMealRecordRepository('2')
  let n = 0
  for (const serving of SERVINGS) {
    for (const portion of PORTIONS) {
      const { record } = await repo.create(createInput(serving, portion, n++))
      const before = await repo.get(record.id)
      const saved = await repo.update(record.id, {
        expectedRevision: before.revision,
        portion: before.portion,
      })
      const afterGet = await repo.get(record.id)
      assert.equal(saved.weightGrams, before.weightGrams)
      assert.equal(afterGet.weightGrams, before.weightGrams)
      assert.deepEqual(afterGet.nutritionSnapshot, before.nutritionSnapshot)
    }
  }
  assert.equal(patchCount, 0, '변경 없는 수정은 서버에 PATCH를 보내지 않는다')
})

test('양 구분을 바꾸면 새 인분으로 저장되고 복원도 맞다', async () => {
  const repo = repoModule.createServerMealRecordRepository('2')
  const { record } = await repo.create(createInput(149, 'more', 0))
  const saved = await repo.update(record.id, {
    expectedRevision: record.revision,
    portion: 'less',
  })
  assert.equal(saved.portion, 'less')
  assert.equal(saved.weightGrams, Math.round(149 * 0.5))
  assert.equal((await repo.get(record.id)).portion, 'less')
  assert.equal(patchCount, 1)
})

// PR #30 재검수 NEW-P1: 저장 전 안내(예상 중량·열량)와 실제 저장값이 같은 기준이어야 한다.
const PER100G = { kcal: 50, protein: 3, fat: 1, carb: 10 } // 가짜 백엔드와 같은 100g 기준값

test('저장 전 예상 중량·열량 = 저장 후 기록(1인분이 다른 여러 음식)', async () => {
  const repo = repoModule.createServerMealRecordRepository('2')
  let n = 0
  for (const serving of SERVINGS) {
    for (const portion of PORTIONS) {
      const previewGrams = Nutrition.portionGrams(portion, serving)
      const previewKcal = Nutrition.scaleNutrition(PER100G, previewGrams).kcal
      const { record } = await repo.create(createInput(serving, portion, n++))
      const at = `${serving}g ${portion}`
      assert.equal(record.weightGrams, Math.round(previewGrams), at)
      const savedKcal = Nutrition.scaleNutrition(
        record.nutritionSnapshot,
        record.weightGrams,
      ).kcal
      assert.ok(
        Math.abs(savedKcal - previewKcal) <= 0.5 + 0.01 * previewKcal,
        at,
      )
      // 수정 시트도 같은 1인분으로 계산한다
      assert.equal(record.servingGrams, serving, at)
    }
  }
})

test('리뷰 재현 사례: 1인분 550g 음식 "많이"는 안내도 저장도 825g', async () => {
  assert.equal(Nutrition.portionGrams('more', 550), 825)
  const repo = repoModule.createServerMealRecordRepository('2')
  const { record } = await repo.create(createInput(550, 'more', 0))
  assert.equal(record.weightGrams, 825)
})

test('양 선택 시트: 서버 음식은 그 음식의 1인분 기준으로 안내하고 100g 고정 문구를 쓰지 않는다', () => {
  const props = {
    mode: 'new',
    foodName: '가자미 매운탕',
    per100g: PER100G,
    servingGrams: 550,
    initialPortion: 'normal',
    meal: 'lunch',
    busy: false,
    error: null,
    onSubmit() {},
    onCancel() {},
  }
  const html = renderToStaticMarkup(createElement(Sheet.MealPortionForm, props))
  assert.match(html, /275g/)
  assert.match(html, /550g/)
  assert.match(html, /825g/)
  assert.match(html, /예상 413kcal/) // 825g × 50kcal/100g
  assert.match(html, /1인분\(550g\)/)
  assert.doesNotMatch(html, /1인분은 100g/)
  // 1인분을 모르는 개발용 예시 음식은 기존 시안 기준 안내를 유지한다
  const sample = renderToStaticMarkup(
    createElement(Sheet.MealPortionForm, { ...props, servingGrams: undefined }),
  )
  assert.match(sample, /1인분은 100g/)
})

test('서버 음식 목록은 백엔드와 같은 기준으로 1인분 중량을 담는다', async () => {
  globalThis.__fakeApi = async (method, path) => {
    assert.equal(method, 'GET')
    assert.match(path, /^\/foods\?page=0/)
    const base = {
      category: null,
      brand: null,
      servingUnit: 'g',
      caloriesKcal: 50,
      carbohydrateG: 10,
      proteinG: 3,
      fatG: 1,
    }
    return {
      content: [
        {
          ...base,
          foodId: 1,
          name: '가',
          servingSize: 100,
          referenceServingSize: 550,
        },
        {
          ...base,
          foodId: 2,
          name: '나',
          servingSize: 100,
          referenceServingSize: null,
        },
      ],
      page: 0,
      size: 2000,
      totalElements: 2,
      totalPages: 1,
    }
  }
  const foods = await FoodRepo.serverFoodRepository.list()
  assert.deepEqual(
    foods.map((f) => f.servingGrams),
    [550, 100],
  )
})
