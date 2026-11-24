import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
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
