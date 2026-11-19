import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// 신체 정보 저장·검증 정합성: 저장 정상·계산 가능 / 저장 정상·계산 범위 밖 / 실제 손상을 구분하는지,
// 그리고 W01-1의 saveProfile이 같은 객체의 다른 필드를 지우지 않는지 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let policy
let validation
let goalMod
let goalTypes
let bodyMod
let messages
let ProfileForm
let storage
let failWrite

const BODY_KEY = (owner) => `mealthroutine.dev.mock.body.${owner}`
const GOAL_KEY = (owner) => `mealthroutine.dev.exercise-goal.value.${owner}`
const NOW = '2026-11-13T00:00:00.000Z'
const META = (owner = 'a', age = 33, sex = 'female') => ({
  ownerId: owner,
  age,
  sex,
})
const context = {
  healthGoal: {
    focus: 'balanced',
    exerciseRatio: 50,
    mealRatio: 50,
    updatedAt: '2026-11-11T00:00:00.000Z',
  },
  exerciseTier: 'beginner',
  knowledgeSource: 'assessment',
}

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
  policy = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalPolicy.ts',
  )
  validation = await server.ssrLoadModule(
    '/src/body-measurements/bodyValidation.ts',
  )
  goalMod = await server.ssrLoadModule(
    '/src/exercise-goal/local/localExerciseGoalRepository.ts',
  )
  goalTypes = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalTypes.ts',
  )
  bodyMod = await server.ssrLoadModule(
    '/src/body-measurements/mock/mockBodyRepository.ts',
  )
  messages = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalMessages.ts',
  )
  ProfileForm = (
    await server.ssrLoadModule(
      '/src/components/exercise/goal/GoalProfileForm.tsx',
    )
  ).default
})
after(async () => {
  await server?.close()
})
beforeEach(() => {
  failWrite = false
  storage = createStorage()
  globalThis.window = { localStorage: storage }
})

const goalRepo = (owner) =>
  goalMod.createLocalExerciseGoalRepository(owner, {
    storage,
    crypto: webcrypto,
    now: () => Date.parse(NOW),
    loadContext: async () => structuredClone(context),
  })
const bodyRepo = (owner) =>
  bodyMod.createMockBodyRepository({ userId: owner, latencyMs: 0 })
async function unlocked(owner = 'a') {
  const repo = goalRepo(owner)
  await repo.registerPin('123456', '123456')
  return { repo, access: await repo.unlock('123456') }
}
const putBody = (owner, value) =>
  storage.setItem(
    BODY_KEY(owner),
    typeof value === 'string' ? value : JSON.stringify(value),
  )
const body = (extra = {}) => ({
  v: 1,
  heightCm: 161,
  weightKg: 64,
  updatedAt: NOW,
  exerciseGoalProfile: META(),
  ...extra,
})
const raw = (owner = 'a') => JSON.parse(storage.getItem(BODY_KEY(owner)))
const code = (expected) => (error) =>
  error instanceof goalTypes.ExerciseGoalError && error.code === expected
const profileOf = (overrides = {}) => ({
  age: 33,
  sex: 'female',
  heightCm: 161,
  weightKg: 64,
  updatedAt: NOW,
  ...overrides,
})

// ── 1. 입력 범위의 경계값 ──────────────────────────────────────────────
test('P06 저장 허용 범위(키 1~300cm·몸무게 1~500kg, 소수점 첫째 자리)의 경계값', () => {
  const { isValidMeasurement, HEIGHT_RANGE, WEIGHT_RANGE } = validation
  for (const v of [1, 300, 170.5])
    assert.ok(isValidMeasurement(v, HEIGHT_RANGE))
  for (const v of [0.9, 300.1, 0, -1, 170.55, Number.NaN, '170'])
    assert.ok(!isValidMeasurement(v, HEIGHT_RANGE), String(v))
  for (const v of [1, 500, 65.5]) assert.ok(isValidMeasurement(v, WEIGHT_RANGE))
  for (const v of [0.9, 500.1, 0, 65.55, Number.POSITIVE_INFINITY])
    assert.ok(!isValidMeasurement(v, WEIGHT_RANGE), String(v))
})

test('W01-1 계산 가능 범위(18~100세·100~230cm·25~250kg)의 경계값은 대상 여부만 나눈다', () => {
  const reasons = (o) => policy.goalProfileIneligibility(profileOf(o))
  assert.deepEqual(reasons({}), [])
  for (const o of [
    { age: 18 },
    { age: 100 },
    { heightCm: 100 },
    { heightCm: 230 },
    { weightKg: 25 },
    { weightKg: 250 },
  ])
    assert.deepEqual(reasons(o), [], JSON.stringify(o))
  assert.deepEqual(reasons({ age: 17 }), ['age'])
  assert.deepEqual(reasons({ age: 101 }), ['age'])
  assert.deepEqual(reasons({ heightCm: 99.9 }), ['height'])
  assert.deepEqual(reasons({ heightCm: 230.1 }), ['height'])
  assert.deepEqual(reasons({ weightKg: 24.9 }), ['weight'])
  assert.deepEqual(reasons({ weightKg: 250.1 }), ['weight'])
  assert.deepEqual(reasons({ age: 17, heightCm: 50, weightKg: 300 }), [
    'age',
    'height',
    'weight',
  ])
})

test('계산에 쓰는 검증(validGoalProfile)은 이전과 같고 범위 밖은 계산을 거부한다', () => {
  assert.equal(policy.validGoalProfile(profileOf()), true)
  assert.equal(policy.validGoalProfile(profileOf({ heightCm: 50 })), false)
  assert.equal(policy.validGoalProfile(profileOf({ age: 17 })), false)
  const draft = {
    purpose: 'learn',
    activityId: 'bodyweight-strength',
    targetWeightKg: '64',
    daysPerWeek: '3',
    minutesPerSession: '10',
  }
  const result = policy.calculateExerciseGoal(
    draft,
    context,
    profileOf({ heightCm: 50 }),
    new Date(NOW),
  )
  assert.equal(result.ok, false)
  assert.equal(result.issues[0].field, 'profile')
})

test('저장 구조 검사는 계산 범위 밖의 정상 값을 통과시키고 손상 값만 거른다', () => {
  const ok = policy.isStoredGoalProfile
  assert.equal(ok(profileOf()), true)
  assert.equal(ok(profileOf({ heightCm: 50 })), true)
  assert.equal(ok(profileOf({ weightKg: 300 })), true)
  assert.equal(ok(profileOf({ age: 17 })), true)
  for (const bad of [
    profileOf({ sex: 'x' }),
    profileOf({ age: 33.5 }),
    profileOf({ age: Number.NaN }),
    profileOf({ heightCm: Number.NaN }),
    profileOf({ heightCm: 170.55 }),
    profileOf({ heightCm: 0 }),
    profileOf({ weightKg: 501 }),
    profileOf({ updatedAt: 'not a date' }),
    null,
    'text',
  ])
    assert.equal(ok(bad), false, JSON.stringify(bad))
})

// ── 2. 저장 정상·계산 가능 / 저장 정상·계산 불가 / 손상 ───────────────────
test('저장 정상·계산 가능: 프로필을 그대로 돌려주고 대상 사유가 없다', async () => {
  putBody('a', body())
  const { repo, access } = await unlocked()
  const profile = await repo.getProfile(access)
  assert.equal(profile.age, 33)
  assert.deepEqual(policy.goalProfileIneligibility(profile), [])
})

test('저장 정상·계산 불가: 손상 오류 없이 프로필을 돌려주고 사유를 알려 준다', async () => {
  putBody('a', body({ heightCm: 50 }))
  const { repo, access } = await unlocked()
  const profile = await repo.getProfile(access)
  assert.equal(profile.heightCm, 50)
  assert.deepEqual(policy.goalProfileIneligibility(profile), ['height'])
  assert.equal((await repo.getProfilePrefill(access)).heightCm, 50)
  assert.equal((await repo.getProfilePrefill(access)).weightKg, 64)
  putBody('a', body({ weightKg: 300 }))
  assert.deepEqual(
    policy.goalProfileIneligibility(await repo.getProfile(access)),
    ['weight'],
  )
  putBody('a', body({ exerciseGoalProfile: META('a', 17) }))
  assert.deepEqual(
    policy.goalProfileIneligibility(await repo.getProfile(access)),
    ['age'],
  )
})

test('계산 불가 프로필로는 목표를 저장할 수 없고 기존 목표는 그대로다', async () => {
  putBody('a', body())
  const { repo, access } = await unlocked()
  const eligible = await repo.getProfile(access)
  const draft = {
    purpose: 'learn',
    activityId: 'bodyweight-strength',
    targetWeightKg: '64',
    daysPerWeek: '3',
    minutesPerSession: '10',
  }
  await repo.saveGoal(access, draft, context, eligible)
  const savedGoal = storage.getItem(GOAL_KEY('a'))
  assert.ok(savedGoal)
  putBody('a', body({ heightCm: 50 }))
  const ineligible = await repo.getProfile(access)
  await assert.rejects(
    repo.saveGoal(access, draft, context, ineligible),
    code('validation'),
  )
  assert.equal(storage.getItem(GOAL_KEY('a')), savedGoal)
})

test('실제 손상 데이터는 기존 정책대로 손상 오류다', async () => {
  const { repo, access } = await unlocked()
  const cases = {
    '다른 계정의 나이·성별': body({ exerciseGoalProfile: META('other') }),
    '성별 값 오류': body({ exerciseGoalProfile: META('a', 33, 'x') }),
    '나이가 정수가 아님': body({ exerciseGoalProfile: META('a', 33.5) }),
    '나이가 숫자가 아님': body({
      exerciseGoalProfile: { ownerId: 'a', age: '33', sex: 'female' },
    }),
    '버전 불일치': body({ v: 2 }),
    '객체가 아님': '123',
    'JSON이 아님': '{broken',
    '갱신 시각 오류': body({ updatedAt: 'not a date' }),
  }
  for (const [name, value] of Object.entries(cases)) {
    putBody('a', value)
    await assert.rejects(repo.getProfile(access), code('corrupt'), name)
  }
})

test('키·몸무게가 비었거나 신체 정보 기준으로 무효이면 손상이 아니라 입력 필요(프로필 없음)다', async () => {
  const { repo, access } = await unlocked()
  const stored = body()
  delete stored.heightCm
  putBody('a', stored)
  assert.equal(await repo.getProfile(access), null)
  const prefill = await repo.getProfilePrefill(access)
  assert.equal(prefill.heightCm, undefined)
  assert.equal(prefill.weightKg, 64)
  putBody('a', body({ heightCm: 0 }))
  assert.equal(await repo.getProfile(access), null)
  putBody('a', body({ weightKg: 'abc' }))
  assert.equal(await repo.getProfile(access), null)
  putBody('a', body({ weightKg: 600 }))
  assert.equal(await repo.getProfile(access), null)
})

test('나이·성별 항목이 없거나 객체가 아닌 정상 신체 정보는 기존처럼 프로필 없음이다', async () => {
  putBody('a', { v: 1, heightCm: 50, weightKg: 65, updatedAt: NOW })
  const { repo, access } = await unlocked()
  assert.equal(await repo.getProfile(access), null)
  putBody('a', body({ exerciseGoalProfile: 'text' }))
  assert.equal(await repo.getProfile(access), null)
  putBody('a', { v: 1, heightCm: 50, weightKg: 65, updatedAt: NOW })
  assert.equal((await repo.getProfilePrefill(access)).heightCm, 50)
})

// ── 3. 수정 후 계산 재시도 ────────────────────────────────────────────
test('계산 불가였던 값을 범위 안으로 고쳐 저장하면 목표를 다시 계산·저장할 수 있다', async () => {
  putBody('a', body({ heightCm: 50 }))
  const { repo, access } = await unlocked()
  assert.deepEqual(
    policy.goalProfileIneligibility(await repo.getProfile(access)),
    ['height'],
  )
  // 범위 밖 값을 그대로 목표 프로필로 저장하는 것은 거부한다.
  await assert.rejects(
    repo.saveProfile(access, {
      age: 33,
      sex: 'female',
      heightCm: 50,
      weightKg: 64,
    }),
    code('validation'),
  )
  assert.equal(raw().heightCm, 50)
  await repo.saveProfile(access, {
    age: 33,
    sex: 'female',
    heightCm: 161,
    weightKg: 64,
  })
  const fixed = await repo.getProfile(access)
  assert.deepEqual(policy.goalProfileIneligibility(fixed), [])
  const goal = await repo.saveGoal(
    access,
    {
      purpose: 'learn',
      activityId: 'bodyweight-strength',
      targetWeightKg: '64',
      daysPerWeek: '3',
      minutesPerSession: '10',
    },
    context,
    fixed,
  )
  assert.equal(goal.profile.heightCm, 161)
})

// ── 4. saveProfile의 기존 필드 보존 ───────────────────────────────────
test('saveProfile은 같은 객체의 다른 필드를 지우지 않고 키·몸무게·나이·성별만 바꾼다', async () => {
  putBody('a', {
    v: 1,
    heightCm: 170,
    weightKg: 65,
    updatedAt: '2026-01-01T00:00:00.000Z',
    weightHistoryNote: { keep: [1, 2, 3] },
    futureField: 'x',
  })
  const { repo, access } = await unlocked()
  await repo.saveProfile(access, {
    age: 40,
    sex: 'male',
    heightCm: 175.5,
    weightKg: 70.2,
  })
  const stored = raw()
  assert.deepEqual(stored.weightHistoryNote, { keep: [1, 2, 3] })
  assert.equal(stored.futureField, 'x')
  assert.equal(stored.heightCm, 175.5)
  assert.equal(stored.weightKg, 70.2)
  assert.deepEqual(stored.exerciseGoalProfile, META('a', 40, 'male'))
  assert.equal(stored.v, 1)
  assert.equal(stored.updatedAt, NOW)
})

test('저장된 신체 정보가 없을 때의 saveProfile은 기존처럼 새 객체를 만든다', async () => {
  const { repo, access } = await unlocked()
  await repo.saveProfile(access, {
    age: 33,
    sex: 'female',
    heightCm: 161,
    weightKg: 64,
  })
  assert.deepEqual(raw(), {
    v: 1,
    heightCm: 161,
    weightKg: 64,
    updatedAt: NOW,
    exerciseGoalProfile: META('a'),
  })
})

test('손상된 저장 객체는 saveProfile이 덮어쓰지 않고 손상 오류로 거부한다', async () => {
  const { repo, access } = await unlocked()
  const input = { age: 33, sex: 'female', heightCm: 161, weightKg: 64 }
  for (const value of ['{broken', '123', JSON.stringify(body({ v: 2 }))]) {
    putBody('a', value)
    const before = storage.getItem(BODY_KEY('a'))
    await assert.rejects(
      repo.saveProfile(access, input),
      code('corrupt'),
      value,
    )
    assert.equal(storage.getItem(BODY_KEY('a')), before, value)
  }
})

test('저장 실패는 기존 신체 정보를 그대로 둔다', async () => {
  putBody('a', body({ futureField: 'x' }))
  const { repo, access } = await unlocked()
  const before = storage.getItem(BODY_KEY('a'))
  const input = { age: 34, sex: 'male', heightCm: 170, weightKg: 60 }
  failWrite = true
  await assert.rejects(repo.saveProfile(access, input), code('save'))
  failWrite = false
  assert.equal(storage.getItem(BODY_KEY('a')), before)
  storage.setItem('mealthroutine.dev.mock.flag.failSave', 'body')
  await assert.rejects(repo.saveProfile(access, input), code('save'))
  assert.equal(storage.getItem(BODY_KEY('a')), before)
})

test('입력 오류와 만료된 열람 권한으로는 저장하지 않는다', async () => {
  putBody('a', body())
  const { repo, access } = await unlocked()
  const before = storage.getItem(BODY_KEY('a'))
  await assert.rejects(
    repo.saveProfile(access, {
      age: 17,
      sex: 'female',
      heightCm: 161,
      weightKg: 64,
    }),
    code('validation'),
  )
  repo.lock(access)
  await assert.rejects(
    repo.saveProfile(access, {
      age: 33,
      sex: 'female',
      heightCm: 161,
      weightKg: 64,
    }),
    code('expired'),
  )
  assert.equal(storage.getItem(BODY_KEY('a')), before)
})

test('계정 A의 saveProfile은 계정 B의 신체 정보를 바꾸지 않는다', async () => {
  putBody('b', body({ exerciseGoalProfile: META('b', 41, 'male') }))
  const beforeB = storage.getItem(BODY_KEY('b'))
  const { repo, access } = await unlocked('a')
  await repo.saveProfile(access, {
    age: 33,
    sex: 'female',
    heightCm: 161,
    weightKg: 64,
  })
  assert.equal(storage.getItem(BODY_KEY('b')), beforeB)
  const keys = [...storage.data.keys()].filter((k) => k.includes('.body.'))
  assert.deepEqual(keys.sort(), [BODY_KEY('a'), BODY_KEY('b')])
})

test('홈 시트의 저장과 목표 화면의 saveProfile이 번갈아 쓰여도 서로의 필드를 지우지 않는다', async () => {
  const { repo, access } = await unlocked()
  await repo.saveProfile(access, {
    age: 33,
    sex: 'female',
    heightCm: 161,
    weightKg: 64,
  })
  await bodyRepo('a').save({ weightKg: 62 })
  assert.deepEqual(raw().exerciseGoalProfile, META('a'))
  await repo.saveProfile(access, {
    age: 33,
    sex: 'female',
    heightCm: 162,
    weightKg: 62,
  })
  assert.deepEqual(raw().exerciseGoalProfile, META('a'))
  assert.equal(raw().heightCm, 162)
})

test('PIN 보호: 열람 권한이 없으면 프로필도 사전 입력값도 읽히지 않는다', async () => {
  putBody('a', body({ heightCm: 50 }))
  const repo = goalRepo('a')
  await repo.registerPin('123456', '123456')
  const access = await repo.unlock('123456')
  repo.lock(access)
  await assert.rejects(repo.getProfile(access), code('expired'))
  await assert.rejects(repo.getProfilePrefill(access), code('expired'))
})

// ── 5. 안내 문구와 수정 화면 ──────────────────────────────────────────
test('계산 불가 안내는 해당 항목의 범위만 말하고 사용자의 수치를 담지 않는다', () => {
  const m = messages.ineligibleGoalMessage
  const height = m(['height'])
  assert.match(height, /키/)
  assert.match(height, /100~230cm/)
  assert.doesNotMatch(height, /몸무게|나이/)
  const all = m(['age', 'height', 'weight'])
  assert.match(all, /18~100세/)
  assert.match(all, /100~230cm/)
  assert.match(all, /25~250kg/)
  assert.doesNotMatch(height, /\b50\b|\b300\b/)
})

test('수정 화면은 안내 문구를 보여 주고 기존 입력란·접근성 참조를 유지한다', () => {
  const html = renderToStaticMarkup(
    createElement(ProfileForm, {
      profile: profileOf({ heightCm: 50 }),
      notice: messages.ineligibleGoalMessage(['height']),
      save: async () => {},
      cancel: () => {},
    }),
  )
  assert.match(html, /role="note"/)
  assert.match(html, /100~230cm/)
  assert.match(html, /id="goal-profile-height"/)
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
  for (const [, ref] of html.matchAll(
    /aria-(?:labelledby|describedby)="([^"]+)"/g,
  ))
    for (const id of ref.split(' ')) assert.ok(ids.has(id), id)
  const plain = renderToStaticMarkup(
    createElement(ProfileForm, {
      profile: null,
      save: async () => {},
      cancel: () => {},
    }),
  )
  assert.doesNotMatch(plain, /role="note"/)
})
