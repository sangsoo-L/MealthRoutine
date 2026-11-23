import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// 신체 정보 Mock 저장소의 데이터 무결성 검증. 같은 저장 객체에 들어 있는 운동 목표용 나이·성별(exerciseGoalProfile)이
// 키·몸무게 저장으로 사라지지 않는지 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let bodyMod
let goalMod
let goalTypes
let storage
let failWrite

const BODY_KEY = (owner) => `mealthroutine.dev.mock.body.${owner}`

function createStorage() {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite) throw new Error('quota')
      data.set(key, value)
    },
    removeItem: (key) => data.delete(key),
  }
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  bodyMod = await server.ssrLoadModule(
    '/src/body-measurements/mock/mockBodyRepository.ts',
  )
  goalMod = await server.ssrLoadModule(
    '/src/exercise-goal/local/localExerciseGoalRepository.ts',
  )
  goalTypes = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalTypes.ts',
  )
})
after(async () => {
  await server?.close()
})
beforeEach(() => {
  failWrite = false
  storage = createStorage()
  globalThis.window = { localStorage: storage }
})

const bodyRepo = (owner) =>
  bodyMod.createMockBodyRepository({ userId: owner, latencyMs: 0 })
const goalRepo = (owner) =>
  goalMod.createLocalExerciseGoalRepository(owner, {
    storage,
    crypto: webcrypto,
    loadContext: async () => null,
  })
const raw = (owner) => JSON.parse(storage.getItem(BODY_KEY(owner)))

/** 운동 목표 화면이 하는 대로 PIN을 만들고 나이·성별과 신체 정보를 저장한다. */
async function seedGoalProfile(owner, overrides = {}) {
  const goal = goalRepo(owner)
  await goal.registerPin('123456', '123456')
  const access = await goal.unlock('123456')
  await goal.saveProfile(access, {
    age: 33,
    sex: 'female',
    heightCm: 161,
    weightKg: 64,
    ...overrides,
  })
  return { goal, access }
}
const META = (owner) => ({ ownerId: owner, age: 33, sex: 'female' })

test('키만 저장해도 나이·성별이 유지되고 몸무게도 그대로다', async () => {
  const { goal, access } = await seedGoalProfile('a')
  await bodyRepo('a').save({ heightCm: 170.5 })
  assert.deepEqual(raw('a').exerciseGoalProfile, META('a'))
  assert.equal(raw('a').heightCm, 170.5)
  assert.equal(raw('a').weightKg, 64)
  const profile = await goal.getProfile(access)
  assert.equal(profile.age, 33)
  assert.equal(profile.sex, 'female')
  assert.equal(profile.heightCm, 170.5)
})

test('몸무게만 저장해도 나이·성별이 유지되고 키도 그대로다', async () => {
  const { goal, access } = await seedGoalProfile('a')
  await bodyRepo('a').save({ weightKg: 62.3 })
  assert.deepEqual(raw('a').exerciseGoalProfile, META('a'))
  assert.equal(raw('a').heightCm, 161)
  assert.equal(raw('a').weightKg, 62.3)
  const profile = await goal.getProfile(access)
  assert.equal(profile.age, 33)
  assert.equal(profile.sex, 'female')
  assert.equal(profile.weightKg, 62.3)
})

test('키·몸무게를 함께 저장해도 나이·성별이 유지된다', async () => {
  const { goal, access } = await seedGoalProfile('a')
  await bodyRepo('a').save({ heightCm: 165, weightKg: 60 })
  assert.deepEqual(raw('a').exerciseGoalProfile, META('a'))
  const profile = await goal.getProfile(access)
  assert.equal(profile.age, 33)
  assert.equal(profile.sex, 'female')
  assert.equal(profile.heightCm, 165)
  assert.equal(profile.weightKg, 60)
})

test('나이·성별이 없던 신규 회원은 기존처럼 저장되고 없는 필드를 만들지 않는다', async () => {
  const status = await bodyRepo('new').save({ heightCm: 170, weightKg: 65 })
  assert.deepEqual(status, { height: true, weight: true })
  const stored = raw('new')
  assert.equal(stored.v, 1)
  assert.equal(stored.heightCm, 170)
  assert.equal(stored.weightKg, 65)
  assert.equal('exerciseGoalProfile' in stored, false)
  assert.equal(typeof stored.updatedAt, 'string')
})

test('계정 A의 저장은 계정 B의 데이터를 바꾸지 않는다', async () => {
  await seedGoalProfile('a')
  await seedGoalProfile('b', {
    age: 41,
    sex: 'male',
    heightCm: 180,
    weightKg: 80,
  })
  const beforeB = storage.getItem(BODY_KEY('b'))
  await bodyRepo('a').save({ weightKg: 61 })
  assert.equal(storage.getItem(BODY_KEY('b')), beforeB)
  assert.equal(raw('b').exerciseGoalProfile.age, 41)
  assert.equal(raw('a').exerciseGoalProfile.age, 33)
})

test('저장한 값은 계정 id를 단 자기 키에만 쓰인다', async () => {
  await bodyRepo('a').save({ heightCm: 170, weightKg: 65 })
  const keys = [...storage.data.keys()].filter((k) => k.includes('.body.'))
  assert.deepEqual(keys, [BODY_KEY('a')])
})

test('저장 실패는 기존 데이터를 그대로 두고 쓰기 실패도 같다', async () => {
  await seedGoalProfile('a')
  const before = storage.getItem(BODY_KEY('a'))
  storage.setItem('mealthroutine.dev.mock.flag.failSave', 'body')
  await assert.rejects(bodyRepo('a').save({ weightKg: 60 }), {
    reason: 'failed',
  })
  assert.equal(storage.getItem(BODY_KEY('a')), before)
  storage.data.delete('mealthroutine.dev.mock.flag.failSave')
  failWrite = true
  await assert.rejects(bodyRepo('a').save({ weightKg: 60 }), {
    reason: 'failed',
  })
  failWrite = false
  assert.equal(storage.getItem(BODY_KEY('a')), before)
})

test('잘못된 입력은 거부하고 기존 데이터를 그대로 둔다', async () => {
  await seedGoalProfile('a')
  const before = storage.getItem(BODY_KEY('a'))
  for (const input of [
    {},
    { heightCm: 0 },
    { weightKg: 501 },
    { heightCm: 170.55 },
  ])
    await assert.rejects(bodyRepo('a').save(input), { reason: 'invalid' })
  assert.equal(storage.getItem(BODY_KEY('a')), before)
})

test('입력하지 않은 항목의 유효하지 않은 기존 값은 이어받지 않되 나머지 필드는 보존한다', async () => {
  await seedGoalProfile('a')
  const stored = raw('a')
  storage.setItem(
    BODY_KEY('a'),
    JSON.stringify({ ...stored, heightCm: 0, futureField: { keep: true } }),
  )
  const status = await bodyRepo('a').save({ weightKg: 62 })
  assert.deepEqual(status, { height: false, weight: true })
  const after = raw('a')
  assert.equal('heightCm' in after, false)
  assert.deepEqual(after.exerciseGoalProfile, META('a'))
  assert.deepEqual(after.futureField, { keep: true })
})

test('기존 조회는 등록 여부만 돌려주고 수치·나이·성별을 담지 않는다', async () => {
  await seedGoalProfile('a')
  const status = await bodyRepo('a').getStatus()
  assert.deepEqual(status, { height: true, weight: true })
  assert.deepEqual(Object.keys(status).sort(), ['height', 'weight'])
  const empty = await bodyRepo('nobody').getStatus()
  assert.deepEqual(empty, { height: false, weight: false })
})

test('보존된 나이·성별은 PIN 확인 없이는 읽히지 않는다', async () => {
  const { goal, access } = await seedGoalProfile('a')
  await bodyRepo('a').save({ weightKg: 62 })
  goal.lock(access)
  await assert.rejects(
    goal.getProfile(access),
    (error) =>
      error instanceof goalTypes.ExerciseGoalError && error.code === 'expired',
  )
})
