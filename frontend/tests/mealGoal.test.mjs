import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// D01-4 식단 목표·I07 목표 미설정 안내 테스트: 정책·계산·검증·저장소·화면·라우트·범위. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Calc
let Policy
let Valid
let Repo
let Paths
let Form
let Row
let Required
let MealError

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
  Calc = await server.ssrLoadModule('/src/meal-goal/mealGoalCalculation.ts')
  Policy = await server.ssrLoadModule('/src/meal-goal/mealGoalPolicy.ts')
  Valid = await server.ssrLoadModule('/src/meal-goal/mealGoalValidation.ts')
  Repo = await server.ssrLoadModule(
    '/src/meal-goal/local/localMealGoalRepository.ts',
  )
  Paths = await server.ssrLoadModule('/src/meal-goal/mealGoalPaths.ts')
  MealError = (await server.ssrLoadModule('/src/meal-goal/mealGoalTypes.ts'))
    .MealGoalError
  Form = (
    await server.ssrLoadModule('/src/components/meal/goal/MealGoalForm.tsx')
  ).default
  Row = (
    await server.ssrLoadModule('/src/components/meal/goal/MealGoalRow.tsx')
  ).default
  Required = (
    await server.ssrLoadModule(
      '/src/components/meal/goal/MealGoalRequiredView.tsx',
    )
  ).default
})
after(async () => {
  await server.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

const PENDING = { version: 1, status: 'pendingExpertReview' }
const VERIFIED = { version: 1, status: 'verified' }
const profile = (over = {}) => ({
  age: 30,
  sex: 'male',
  heightCm: 175,
  weightKg: 70,
  ...over,
})
const input = (over = {}) => ({
  purpose: 'improve',
  level: null,
  activity: null,
  profile: profile(),
  ...over,
})
const calc = (over, options = {}) =>
  Calc.calculateMealGoal(input(over), {
    allowDevExample: false,
    policy: PENDING,
    ...options,
  })

// ── 정책 ──────────────────────────────────────────────────────────────────────
test('정책: 검증을 마친 계산 정책이 없고 저장은 활성화되지 않는다(알 수 없는 버전도 검증되지 않은 것이다)', () => {
  assert.equal(Policy.MEAL_GOAL_POLICIES.length, 1)
  assert.equal(Policy.MEAL_GOAL_POLICIES[0].status, 'pendingExpertReview')
  assert.equal(Policy.isPolicyVerified(1), false)
  assert.equal(Policy.isPolicyVerified(2), false)
  assert.equal(Policy.isMealGoalSaveEnabled(), false)
})

test('폼 구성: 초급·미확인은 간편, 중급은 활동량, 고급은 직접 조정이며 미확인을 초급으로 바꾸지 않는다', () => {
  assert.equal(Policy.mealGoalFormMode(null), 'simple')
  assert.equal(Policy.mealGoalFormMode('beginner'), 'simple')
  assert.equal(Policy.mealGoalFormMode('intermediate'), 'activity')
  assert.equal(Policy.mealGoalFormMode('advanced'), 'advanced')
  assert.equal(Policy.LEVELS.includes(null), false)
})

test('반환 경로: 허용 목록의 내부 경로만 쓰고 I03이 없으면 AI 서비스 안내로 연결한다', () => {
  const r = Paths.resolveReturnPath
  assert.equal(Paths.I03_IMPLEMENTED, false)
  assert.equal(r('/records/meal', '/x'), '/records/meal')
  assert.equal(r('/ai', '/records/meal'), '/ai')
  assert.equal(r('/ai/meal', '/records/meal'), '/ai') // I03 미구현
  for (const bad of [
    'https://evil.example',
    '//evil.example',
    '/records/exercise',
    '/records/meal?x=1',
    '/ai/meal#h',
    '',
    null,
    undefined,
    42,
  ])
    assert.equal(r(bad, '/records/meal'), '/records/meal', String(bad))
})

// ── 계산 ──────────────────────────────────────────────────────────────────────
test('계산: 목적·신체 정보·활동량(중급)이 빠지면 입력 부족이다', () => {
  assert.deepEqual(calc({ purpose: null }).missing, ['purpose'])
  assert.deepEqual(calc({ profile: null }).missing, ['profile'])
  assert.deepEqual(calc({ purpose: null, profile: null }).missing, [
    'purpose',
    'profile',
  ])
  assert.deepEqual(calc({ level: 'intermediate' }).missing, ['activity'])
  assert.equal(
    calc({ level: 'intermediate', activity: 'light' }).status,
    'policyPending',
  )
  assert.equal(calc({ level: 'intermediate' }).status, 'insufficientInput')
})

test('나이: 14세 미만 차단, 14~17세는 성인용 자동 계산 제한(검증된 정책을 주입해도), 100세 초과 차단', () => {
  for (const policy of [PENDING, VERIFIED]) {
    for (const allowDevExample of [false, true]) {
      const r = (age, purpose = 'improve') =>
        Calc.calculateMealGoal(input({ purpose, profile: profile({ age }) }), {
          allowDevExample,
          policy,
        })
      assert.deepEqual(r(13), { status: 'notCalculable', reason: 'ageTooLow' })
      assert.deepEqual(r(14), { status: 'notCalculable', reason: 'minor' })
      assert.deepEqual(r(17), { status: 'notCalculable', reason: 'minor' })
      assert.deepEqual(r(17, 'lose'), {
        status: 'notCalculable',
        reason: 'minor',
      })
      assert.notEqual(r(18).status, 'notCalculable')
      assert.notEqual(r(100).status, 'notCalculable')
      assert.deepEqual(r(101), {
        status: 'notCalculable',
        reason: 'ageTooHigh',
      })
    }
  }
})

test('나이·신체 정보 제한은 목적을 고르기 전에도 먼저 알린다', () => {
  assert.deepEqual(calc({ purpose: null, profile: profile({ age: 16 }) }), {
    status: 'notCalculable',
    reason: 'minor',
  })
  assert.deepEqual(calc({ purpose: null, profile: profile({ age: 13 }) }), {
    status: 'notCalculable',
    reason: 'ageTooLow',
  })
  assert.deepEqual(
    calc({ purpose: null, profile: profile({ weightKg: 20 }) }),
    {
      status: 'notCalculable',
      reason: 'bodyOutOfRange',
    },
  )
})

test('신체 정보가 계산 범위 밖이면 계산하지 않는다', () => {
  for (const over of [
    { heightCm: 99 },
    { heightCm: 231 },
    { weightKg: 24 },
    { weightKg: 251 },
  ])
    assert.deepEqual(calc({ profile: profile(over) }), {
      status: 'notCalculable',
      reason: 'bodyOutOfRange',
    })
})

test('검증 전 정책: 운영(예시 불허)은 값을 만들지 않고 policyPending이다', () => {
  for (const purpose of ['lose', 'improve', 'maintain'])
    assert.deepEqual(calc({ purpose }), { status: 'policyPending' })
})

test('개발용 계산 예시: 감량 외 목적만 시안 값 그대로 계산하고 검증된 결과(verified)로 보이지 않는다', () => {
  // 남성 30세 175cm 70kg: BMR = 10×70 + 6.25×175 − 5×30 + 5 = 1648.75, ×1.375 = 2267.03 → 2270
  const r = calc({}, { allowDevExample: true })
  assert.equal(r.status, 'devExample')
  assert.equal(r.example.kcal, 2270)
  assert.deepEqual(r.example.ratio, { carb: 60, protein: 15, fat: 25 })
  assert.deepEqual(r.example.grams, { carb: 341, protein: 85, fat: 63 })
  assert.equal(r.example.activity, 'light')
  assert.equal(r.example.activityChosen, false)
  const m = calc({ purpose: 'maintain' }, { allowDevExample: true })
  assert.deepEqual(m.example.ratio, { carb: 55, protein: 20, fat: 25 })
  // 감량은 열량 조정 기준이 검증되지 않아 예시도 만들지 않는다.
  assert.deepEqual(calc({ purpose: 'lose' }, { allowDevExample: true }), {
    status: 'notCalculable',
    reason: 'losePending',
  })
  // 여성 계수(−161)와 활동량 선택(중급)
  const f = calc(
    {
      profile: profile({ sex: 'female' }),
      level: 'intermediate',
      activity: 'active',
    },
    { allowDevExample: true },
  )
  assert.equal(f.example.activityChosen, true)
  assert.equal(f.example.activity, 'active')
  assert.equal(
    f.example.kcal,
    Math.round(((10 * 70 + 6.25 * 175 - 150 - 161) * 1.55) / 10) * 10,
  )
  // 초급·고급 폼에 들어온 활동량은 쓰지 않는다.
  const ignored = calc({ activity: 'active' }, { allowDevExample: true })
  assert.equal(ignored.example.activity, 'light')
  assert.equal(ignored.example.activityChosen, false)
})

test('검증된 정책이 주입되면 verified로 계산한다(감량 −500, 기초대사량 하한). 이 상태는 현재 어디에서도 만들어지지 않는다', () => {
  const lose = calc({ purpose: 'lose' }, { policy: VERIFIED })
  assert.equal(lose.status, 'verified')
  // tdee 2267.03 − 500 = 1767.03 → 1770 (기초대사량 1648.75보다 높다)
  assert.equal(lose.result.kcal, 1770)
  assert.deepEqual(lose.result.ratio, { carb: 55, protein: 20, fat: 25 })
  // 하한: 매우 활동적이지 않은 작은 체형에서 −500이 기초대사량 아래면 기초대사량으로 올린다.
  const small = calc(
    {
      purpose: 'lose',
      profile: profile({ sex: 'female', age: 60, heightCm: 150, weightKg: 40 }),
    },
    { policy: VERIFIED },
  )
  const bmr = 10 * 40 + 6.25 * 150 - 5 * 60 - 161
  assert.equal(
    small.result.kcal,
    Math.round(Math.max(bmr * 1.375 - 500, bmr) / 10) * 10,
  )
  assert.equal(
    Policy.MEAL_GOAL_POLICIES.some((p) => p.status === 'verified'),
    false,
  )
})

test('알 수 없는 정책 버전은 값을 만들지 않는다', () => {
  assert.deepEqual(Calc.calculateWithCurrentPolicy(input(), true, 99), {
    status: 'policyPending',
  })
})

test('에너지 환산: 탄수화물·단백질 4kcal/g, 지방 9kcal/g', () => {
  assert.deepEqual(
    Calc.ratioToGrams(2000, { carb: 50, protein: 20, fat: 30 }),
    { carb: 250, protein: 100, fat: 67 },
  )
})

// ── 저장 결정 ─────────────────────────────────────────────────────────────────
const draft = (over = {}) => ({
  purpose: 'improve',
  activity: '',
  kcal: '',
  carb: '',
  protein: '',
  fat: '',
  ...over,
})
const save = (over = {}) =>
  Calc.decideSave({
    draft: draft(),
    level: null,
    profile: profile(),
    profileUpdatedAt: '2026-11-19T00:00:00.000Z',
    policy: PENDING,
    ...over,
  })

test('저장 결정: 검증 전 정책은 올바른 입력도 저장할 수 없다(미확정 계산값 저장 차단)', () => {
  assert.deepEqual(save(), { ok: false, reason: 'policyPending' })
  assert.deepEqual(
    save({ level: 'intermediate', draft: draft({ activity: 'light' }) }),
    {
      ok: false,
      reason: 'policyPending',
    },
  )
  assert.deepEqual(
    save({
      level: 'advanced',
      draft: draft({ kcal: '2000', carb: '50', protein: '20', fat: '30' }),
    }),
    { ok: false, reason: 'policyPending' },
  )
})

test('저장 결정: 입력 오류·입력 부족·계산 불가를 구분한다', () => {
  assert.equal(save({ draft: draft({ purpose: '' }) }).reason, 'invalidInput')
  assert.equal(save({ profile: null }).reason, 'insufficientInput')
  assert.equal(save({ profile: profile({ age: 16 }) }).reason, 'notCalculable')
  assert.equal(
    save({ draft: draft({ purpose: 'lose' }), policy: PENDING }).reason,
    'policyPending',
  )
})

test('저장 결정(검증된 정책 주입): 목표에는 최종값과 정책 버전만 담고 신체 수치를 담지 않으며 미확인 수준은 null이다', () => {
  const r = save({ policy: VERIFIED })
  assert.equal(r.ok, true)
  assert.equal(r.goal.level, null) // 초급으로 바꾸지 않는다
  assert.equal(r.goal.activity, null)
  assert.equal(r.goal.source, 'calculated')
  assert.equal(r.goal.calculationVersion, 1)
  assert.equal(r.goal.kcal, 2270)
  assert.deepEqual(r.goal.basis, {
    profileUpdatedAt: '2026-11-19T00:00:00.000Z',
  })
  assert.doesNotMatch(JSON.stringify(r.goal), /age|sex|heightCm|weightKg|bmr/i)
  const mid = save({
    policy: VERIFIED,
    level: 'intermediate',
    draft: draft({ activity: 'sedentary' }),
  })
  assert.equal(mid.goal.level, 'intermediate')
  assert.equal(mid.goal.activity, 'sedentary')
})

test('저장 결정(검증된 정책 주입): 직접 조정한 열량은 허용 범위 정책이 없으면 저장하지 않는다', () => {
  const advanced = save({
    policy: VERIFIED,
    level: 'advanced',
    draft: draft({ kcal: '2000', carb: '50', protein: '20', fat: '30' }),
  })
  assert.deepEqual(advanced, { ok: false, reason: 'customRangePending' })
  assert.equal(Calc.SIHAN_CONSTANTS_V1.customKcalRange, undefined)
})

// ── 입력 검증 ─────────────────────────────────────────────────────────────────
test('폼 검증: 목적 필수, 중급 활동량 필수, 고급 열량·비율 형식과 합계 100', () => {
  const v = Valid.validateDraft
  assert.deepEqual(
    v(draft({ purpose: '' }), 'simple').map((i) => i.field),
    ['purpose'],
  )
  assert.deepEqual(v(draft(), 'simple'), [])
  assert.deepEqual(
    v(draft({ purpose: 'x' }), 'simple').map((i) => i.field),
    ['purpose'],
  )
  assert.deepEqual(
    v(draft(), 'activity').map((i) => i.field),
    ['activity'],
  )
  assert.deepEqual(v(draft({ activity: 'light' }), 'activity'), [])
  assert.deepEqual(
    v(draft({ activity: 'jog' }), 'activity').map((i) => i.field),
    ['activity'],
  )
  // 간편·중급 폼은 직접 조정 값을 검사하지 않는다.
  assert.deepEqual(v(draft({ kcal: 'abc' }), 'simple'), [])
  const ok = draft({ kcal: '2000', carb: '50', protein: '20', fat: '30' })
  assert.deepEqual(v(ok, 'advanced'), [])
  assert.deepEqual(
    v({ ...ok, kcal: '' }, 'advanced').map((i) => i.field),
    ['kcal'],
  )
  assert.deepEqual(
    v({ ...ok, kcal: '20.5' }, 'advanced').map((i) => i.field),
    ['kcal'],
  )
  assert.deepEqual(
    v({ ...ok, kcal: '0' }, 'advanced').map((i) => i.field),
    ['kcal'],
  )
  assert.deepEqual(
    v({ ...ok, kcal: '-5' }, 'advanced').map((i) => i.field),
    ['kcal'],
  )
  assert.deepEqual(
    v({ ...ok, carb: '50.5' }, 'advanced').map((i) => i.field),
    ['carb'],
  )
  assert.deepEqual(
    v({ ...ok, protein: '' }, 'advanced').map((i) => i.field),
    ['protein'],
  )
  assert.deepEqual(
    v({ ...ok, fat: '-1' }, 'advanced').map((i) => i.field),
    ['fat'],
  )
  const sum = v({ ...ok, fat: '31' }, 'advanced')
  assert.deepEqual(
    sum.map((i) => i.field),
    ['ratio'],
  )
  assert.match(sum[0].message, /합은 100%/)
  assert.equal(Valid.ratioTotal({ ...ok, fat: '31' }), 101)
  assert.equal(
    Valid.ratioTotal(draft({ carb: 'x', protein: '40', fat: '60' })),
    100,
  )
})

test('신체 정보 입력: 나이 14~100 정수, 성별은 남·여만(추정 없음), 키·몸무게는 계산 범위', () => {
  const p = (over = {}) =>
    Valid.parseProfileDraft({
      age: '30',
      sex: 'female',
      height: '165.5',
      weight: '55',
      ...over,
    })
  assert.equal(p().ok, true)
  assert.deepEqual(p().value, {
    age: 30,
    sex: 'female',
    heightCm: 165.5,
    weightKg: 55,
  })
  assert.equal(p({ age: '13' }).field, 'age')
  assert.equal(p({ age: '14' }).ok, true)
  assert.equal(p({ age: '100' }).ok, true)
  assert.equal(p({ age: '101' }).field, 'age')
  assert.equal(p({ age: '30.5' }).field, 'age')
  assert.equal(p({ age: '' }).field, 'age')
  assert.equal(p({ sex: '' }).field, 'sex')
  assert.equal(p({ sex: 'other' }).field, 'sex')
  assert.equal(p({ height: '99' }).field, 'height')
  assert.equal(p({ height: '170.55' }).field, 'height')
  assert.equal(p({ weight: 'abc' }).field, 'weight')
  assert.equal(p({ weight: '251' }).field, 'weight')
})

// ── 저장소 ────────────────────────────────────────────────────────────────────
function memoryStorage(initial = {}) {
  const data = { ...initial }
  const calls = { set: 0 }
  return {
    data,
    calls,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      calls.set += 1
      data[k] = v
    },
  }
}
const goalInput = (over = {}) => ({
  v: 1,
  calculationVersion: 1,
  source: 'calculated',
  purpose: 'improve',
  level: null,
  activity: null,
  kcal: 2270,
  ratio: { carb: 60, protein: 15, fat: 25 },
  basis: { profileUpdatedAt: '2026-11-19T00:00:00.000Z' },
  ...over,
})
const repoFor = (owner, storage, extra = {}) =>
  Repo.createLocalMealGoalRepository(owner, {
    storage,
    isVerified: () => true,
    now: () => new Date('2026-11-19T01:00:00.000Z'),
    ...extra,
  })
const KEY = (owner) => `mealthroutine.dev.meal-goal.value.${owner}`
const codeOf = async (promise) => {
  try {
    await promise
  } catch (error) {
    assert.ok(error instanceof MealError)
    return error.code
  }
  return null
}

test('저장소: 목표가 없으면 null이고, 기본 정책(검증 전)에서는 저장을 거부해 아무것도 쓰지 않는다', async () => {
  const storage = memoryStorage()
  const repo = Repo.createLocalMealGoalRepository('u1', { storage })
  assert.equal(await repo.getGoal(), null)
  assert.equal(
    await codeOf(repo.saveGoal({ goal: goalInput(), expectedRevision: null })),
    'policyPending',
  )
  assert.deepEqual(storage.data, {})
  assert.equal(storage.calls.set, 0)
})

test('저장소: 저장하면 revision 1, 수정하면 +1이고 값에 신체 수치가 없다', async () => {
  const storage = memoryStorage()
  const repo = repoFor('u1', storage)
  const first = await repo.saveGoal({
    goal: goalInput(),
    expectedRevision: null,
  })
  assert.equal(first.revision, 1)
  assert.equal(first.updatedAt, '2026-11-19T01:00:00.000Z')
  assert.deepEqual(await repo.getGoal(), first)
  const second = await repo.saveGoal({
    goal: goalInput({
      kcal: 2100,
      purpose: 'maintain',
      ratio: { carb: 55, protein: 20, fat: 25 },
    }),
    expectedRevision: 1,
  })
  assert.equal(second.revision, 2)
  assert.equal(second.kcal, 2100)
  assert.equal(Object.keys(storage.data).length, 1)
  assert.ok(KEY('u1') in storage.data)
  assert.doesNotMatch(storage.data[KEY('u1')], /age|sex|heightCm|weightKg|bmr/i)
})

test('저장소: 다른 탭에서 바뀌었으면(revision 불일치) 충돌이고 기존 목표는 그대로다', async () => {
  const storage = memoryStorage()
  const repo = repoFor('u1', storage)
  await repo.saveGoal({ goal: goalInput(), expectedRevision: null })
  const before = storage.data[KEY('u1')]
  assert.equal(
    await codeOf(
      repo.saveGoal({ goal: goalInput({ kcal: 1900 }), expectedRevision: 5 }),
    ),
    'conflict',
  )
  // 이미 목표가 있는데 "없다고 알고" 저장하는 경우도 충돌
  assert.equal(
    await codeOf(
      repo.saveGoal({
        goal: goalInput({ kcal: 1900 }),
        expectedRevision: null,
      }),
    ),
    'conflict',
  )
  assert.equal(storage.data[KEY('u1')], before)
})

test('저장소: 회원별로 분리되고 ownerId가 다른 값은 노출하지 않는다(손상 처리)', async () => {
  const storage = memoryStorage()
  const a = repoFor('a', storage)
  const b = repoFor('b', storage)
  await a.saveGoal({ goal: goalInput({ kcal: 2000 }), expectedRevision: null })
  assert.equal(await b.getGoal(), null)
  assert.equal((await a.getGoal()).kcal, 2000)
  await b.saveGoal({ goal: goalInput({ kcal: 1800 }), expectedRevision: null })
  assert.equal((await a.getGoal()).kcal, 2000)
  assert.equal((await b.getGoal()).kcal, 1800)
  // 계정 전환: b의 키에 a의 값이 들어 있으면(ownerId 불일치) 읽지 않는다.
  storage.data[KEY('b')] = storage.data[KEY('a')]
  assert.equal(await codeOf(b.getGoal()), 'corrupt')
  assert.equal(
    await codeOf(b.saveGoal({ goal: goalInput(), expectedRevision: 1 })),
    'corrupt',
  )
})

test('저장소: 손상된 값(JSON·구조·ownerId·버전)은 corrupt이고 목표 없음이 아니며 덮어쓰지 않는다', async () => {
  const good = {
    ownerId: 'u1',
    goal: {
      ...goalInput(),
      revision: 1,
      updatedAt: '2026-11-19T01:00:00.000Z',
    },
  }
  const bad = [
    'not json',
    '"x"',
    'null',
    JSON.stringify({ ownerId: 'u1' }),
    JSON.stringify({ ownerId: 'other', goal: good.goal }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, v: 2 } }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, kcal: 1.5 } }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, kcal: 0 } }),
    JSON.stringify({
      ownerId: 'u1',
      goal: { ...good.goal, ratio: { carb: 50, protein: 20, fat: 20 } },
    }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, purpose: 'gain' } }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, level: 'expert' } }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, revision: 0 } }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, basis: {} } }),
    JSON.stringify({ ownerId: 'u1', goal: { ...good.goal, updatedAt: 'x' } }),
  ]
  for (const raw of bad) {
    const storage = memoryStorage({ [KEY('u1')]: raw })
    const repo = repoFor('u1', storage)
    assert.equal(await codeOf(repo.getGoal()), 'corrupt', raw)
    assert.equal(
      await codeOf(repo.saveGoal({ goal: goalInput(), expectedRevision: 1 })),
      'corrupt',
      raw,
    )
    assert.equal(storage.data[KEY('u1')], raw) // 덮어쓰지 않았다
  }
  // 정상 값은 읽힌다.
  const ok = memoryStorage({ [KEY('u1')]: JSON.stringify(good) })
  assert.equal((await repoFor('u1', ok).getGoal()).kcal, 2270)
})

test('저장소: 읽기·쓰기 실패와 저장 수단 없음을 목표 없음과 구분하고, 쓰기 실패는 기존 목표를 보존한다', async () => {
  // 읽기 예외
  const throwing = {
    getItem() {
      throw new Error('boom')
    },
    setItem() {},
  }
  assert.equal(await codeOf(repoFor('u1', throwing).getGoal()), 'load')
  // 쓰기 예외(용량 초과 등): 기존 값 보존
  const storage = memoryStorage()
  const repo = repoFor('u1', storage)
  await repo.saveGoal({ goal: goalInput(), expectedRevision: null })
  const before = storage.data[KEY('u1')]
  storage.setItem = () => {
    throw new Error('quota')
  }
  assert.equal(
    await codeOf(
      repo.saveGoal({ goal: goalInput({ kcal: 1900 }), expectedRevision: 1 }),
    ),
    'save',
  )
  assert.equal(storage.data[KEY('u1')], before)
  // 개발용 스위치
  for (const [flag, expected] of [
    ['unavailable', 'unavailable'],
    ['failLoad', 'load'],
  ]) {
    const s = memoryStorage({
      [`mealthroutine.dev.mock.flag.${flag}`]: 'mealGoal',
    })
    assert.equal(await codeOf(repoFor('u1', s).getGoal()), expected, flag)
  }
  const all = memoryStorage({ 'mealthroutine.dev.mock.flag.failLoad': 'all' })
  assert.equal(await codeOf(repoFor('u1', all).getGoal()), 'load')
  const other = memoryStorage({
    'mealthroutine.dev.mock.flag.failLoad': 'body',
  })
  assert.equal(await repoFor('u1', other).getGoal(), null)
  const failSave = memoryStorage({
    'mealthroutine.dev.mock.flag.failSave': 'mealGoal',
  })
  assert.equal(
    await codeOf(
      repoFor('u1', failSave).saveGoal({
        goal: goalInput(),
        expectedRevision: null,
      }),
    ),
    'save',
  )
  assert.equal(KEY('u1') in failSave.data, false)
})

test('저장소: 구조가 올바르지 않은 저장 요청은 거부한다', async () => {
  const storage = memoryStorage()
  const repo = repoFor('u1', storage)
  for (const goal of [
    goalInput({ kcal: 2000.5 }),
    goalInput({ kcal: -1 }),
    goalInput({ ratio: { carb: 50, protein: 30, fat: 30 } }),
    goalInput({ ratio: { carb: 50.5, protein: 29.5, fat: 20 } }),
    goalInput({ purpose: 'bulk' }),
    goalInput({ activity: 'sleeping' }),
    goalInput({ level: 'master' }),
    goalInput({ source: 'auto' }),
    goalInput({ calculationVersion: 0 }),
    goalInput({ basis: { profileUpdatedAt: 'x' } }),
    null,
  ])
    assert.equal(
      await codeOf(repo.saveGoal({ goal, expectedRevision: null })),
      'validation',
    )
  assert.equal(
    await codeOf(repo.saveGoal({ goal: goalInput(), expectedRevision: 0 })),
    'validation',
  )
  assert.deepEqual(storage.data, {})
  assert.throws(() => Repo.createLocalMealGoalRepository('', { storage }))
})

test('저장소: 운영 빌드는 저장 수단이 없고(null) localStorage를 운영 저장소처럼 쓰지 않는다', () => {
  const source = read('../src/meal-goal/mealGoalSource.ts')
  assert.match(
    source,
    /import\.meta\.env\.DEV\s*\?\s*await import\('\.\/local\/localMealGoalRepository\.ts'\)\s*:\s*null/,
  )
  assert.match(
    source,
    /local \? local\.createLocalMealGoalRepository\(ownerId\) : null/,
  )
  const view = code('../src/meal-goal/useMealGoal.ts')
  assert.match(view, /!repository\s*\?\s*\{ status: 'unavailable' \}/)
  assert.doesNotMatch(
    code('../src/meal-goal/mealGoalSource.ts'),
    /localStorage/,
  )
})

// ── 화면 ──────────────────────────────────────────────────────────────────────
const savedGoal = (over = {}) => ({
  ...goalInput(),
  revision: 2,
  updatedAt: '2026-11-19T01:00:00.000Z',
  ...over,
})
const formProps = (over = {}) => ({
  level: null,
  levelSource: null,
  profile: {
    ...profile(),
    updatedAt: '2026-11-19T00:00:00.000Z',
    persisted: true,
  },
  existing: null,
  allowDevExample: false,
  save: async () => {},
  editProfile: noop,
  cancel: noop,
  ...over,
})
const form = (over) => html(createElement(Form, formProps(over)))

test('D01-4 폼(초급·미확인): 목적 세 가지만 묻고 활동량·직접 조정이 없으며 저장은 비활성이다', () => {
  for (const level of [null, 'beginner']) {
    const out = form({ level })
    assert.match(out, /data-meal-goal-form="simple"/)
    for (const label of ['체중 감량', '식습관 개선', '체중 유지'])
      assert.match(out, new RegExp(label))
    assert.equal((out.match(/name="goalPurpose"/g) ?? []).length, 3)
    assert.doesNotMatch(out, /name="goalActivity"|goalKcal|data-ratio-total/)
    assert.match(
      out,
      /data-meal-goal-save=""[^>]*aria-disabled="true"|aria-disabled="true"[^>]*data-meal-goal-save/,
    )
    assert.match(out, /목표 계산 기준의 검증이 아직 끝나지 않아/)
  }
  // 미확인은 이해도 문구로 알리고 초급으로 표시하지 않는다.
  const unknown = form({ level: null })
  assert.match(unknown, />미확인</)
  assert.match(unknown, /초급으로 저장하거나 평가하지 않아요/)
  assert.doesNotMatch(unknown, />초급</)
  assert.match(form({ level: 'beginner' }), />초급</)
})

test('D01-4 폼(중급·고급): 중급은 활동량 세 가지, 고급은 열량·탄단지 입력과 비율 합계를 보인다', () => {
  const mid = form({ level: 'intermediate' })
  assert.match(mid, /data-meal-goal-form="activity"/)
  assert.equal((mid.match(/name="goalActivity"/g) ?? []).length, 3)
  for (const label of [
    '거의 앉아서 생활해요',
    '가볍게 움직여요',
    '자주 움직여요',
  ])
    assert.match(mid, new RegExp(label))
  // 활동계수 숫자는 사용자에게 검증된 수치처럼 안내하지 않는다.
  assert.doesNotMatch(mid, /1\.2|1\.375|1\.55/)
  assert.doesNotMatch(mid, /goalKcal/)
  const adv = form({ level: 'advanced' })
  assert.match(adv, /data-meal-goal-form="advanced"/)
  assert.match(adv, /name="goalKcal"/)
  for (const name of ['goal-carb', 'goal-protein', 'goal-fat'])
    assert.match(adv, new RegExp(`name="${name}"`))
  assert.match(adv, /data-ratio-total="0"/)
  assert.match(adv, /열량의 허용 범위 기준은 검증 전이라/)
  assert.doesNotMatch(adv, /name="goalActivity"/)
})

test('D01-4 폼: 검증 전 정책의 운영 표시는 계산 값을 보이지 않고, 개발 환경의 예시는 "검증되지 않은 시안 계산 예시"로만 보인다', () => {
  const existing = savedGoal({ purpose: 'improve' })
  const prod = form({ existing, allowDevExample: false })
  assert.match(prod, /data-meal-goal-calc="policyPending"/)
  assert.match(prod, /전문가가 검증하고 있어요/)
  assert.doesNotMatch(prod, /[0-9,]+ kcal/)
  assert.doesNotMatch(prod, /data-meal-goal-calc="example"|시안 계산 예시/)
  const dev = form({ existing, allowDevExample: true })
  assert.match(dev, /data-meal-goal-calc="example"/)
  assert.match(dev, /검증되지 않은 시안 계산 예시 · 개발 환경에서만 보여요/)
  assert.match(dev, /권장 열량이\s*아니고 저장되지 않아요/)
  assert.match(dev, /하루 2,270 kcal/)
  assert.match(dev, /\(예시\)/)
  // 저장은 여전히 비활성
  assert.match(dev, /aria-disabled="true"/)
  // 감량은 개발 예시도 계산하지 않는다.
  const lose = form({
    existing: savedGoal({ purpose: 'lose' }),
    allowDevExample: true,
  })
  assert.match(lose, /열량 조정 기준은 아직 전문가 검증 전이라 계산하지 않아요/)
  assert.doesNotMatch(lose, /data-meal-goal-calc="example"/)
})

test('D01-4 폼: 14~17세는 성인용 자동 계산을 적용하지 않고, 저장하지 않은 정보임을 알린다', () => {
  const minor = form({
    existing: savedGoal(),
    allowDevExample: true,
    profile: {
      ...profile({ age: 16 }),
      updatedAt: '2026-11-19T00:00:00.000Z',
      persisted: false,
    },
  })
  assert.match(minor, /14~17세에는 성인용 자동 열량 계산을 적용하지 않아요/)
  assert.match(minor, /data-meal-goal-calc="notCalculable"/)
  assert.doesNotMatch(minor, /data-meal-goal-calc="example"/)
  assert.match(minor, /이 나이의 정보는 저장하지 않고 이 화면에서만 써요/)
  assert.match(minor, /직접 입력한 정보이며 본인인증 정보는 아니에요/)
})

test('D01 식단 목표 행: 불러오는 중·조회 실패·저장 수단 없음·목표 없음·목표 있음을 서로 다르게 안내한다', () => {
  const row = (state) => html(createElement(Row, { state, onRetry: noop }))
  const loading = row({ status: 'loading' })
  assert.match(loading, /data-meal-goal-row="loading"/)
  assert.match(loading, /불러오는 중이에요/)
  const error = row({ status: 'error' })
  assert.match(error, /data-meal-goal-row="error"/)
  assert.match(error, /현재 식단 목표를 불러올 수 없어요/)
  assert.match(error, /목표가 없는 것은 아니에요/)
  assert.match(error, />다시 시도</)
  assert.doesNotMatch(error, /식단 목표 정하기/)
  const unavailable = row({ status: 'unavailable' })
  assert.match(unavailable, /data-meal-goal-row="unavailable"/)
  assert.match(unavailable, /준비 중/)
  assert.deepEqual(hrefs(unavailable), [])
  const empty = row({ status: 'ready', goal: null })
  assert.match(empty, /data-meal-goal-row="empty"/)
  assert.match(empty, /식단 목표 정하기/)
  assert.deepEqual(hrefs(empty), ['/records/meal/goal'])
  // 계산 기준이 검증 전이라 저장할 수 없다는 사실을 정확히 알린다.
  assert.match(empty, /전문가 검증이 끝나야 목표를 저장할 수 있어요/)
  const filled = row({ status: 'ready', goal: savedGoal() })
  assert.match(filled, /data-meal-goal-row="filled"/)
  assert.match(filled, /하루 2,270 kcal/)
  assert.match(filled, /식습관 개선/)
  assert.match(filled, /탄수화물 60% · 단백질 15% · 지방 25%/)
  assert.match(filled, /목표 다시 정하기/)
  assert.deepEqual(hrefs(filled), ['/records/meal/goal'])
})

test('I07: 목표 없음이 확인됐을 때만 안내 본문이 보이고, 조회 중·실패·저장 수단 없음은 목표 없음으로 단정하지 않는다', () => {
  const view = (state, returnTo = '/ai') =>
    html(createElement(Required, { state, returnTo, onRetry: noop }))
  const missing = view({ status: 'ready', goal: null })
  assert.match(missing, /data-meal-goal-required="missing"/)
  assert.equal((missing.match(/<h1[ >]/g) ?? []).length, 1)
  assert.match(missing, /AI 식단 플랜/)
  assert.match(missing, /식단 목표가 아직 설정되지 않았어요/)
  assert.match(missing, /목표가 없으면 이용할 수 없어요/)
  assert.match(
    missing,
    /data-meal-goal-cta=""[^>]*>식단 목표 정하기|식단 목표 정하기<\/a>/,
  )
  assert.deepEqual(hrefs(missing), ['/records/meal/goal', '/records/meal'])
  assert.match(
    missing,
    /전문가 검증을 기다리고 있어서 지금은 목표를\s*저장할 수 없어요/,
  )
  for (const status of ['loading', 'error', 'unavailable']) {
    const out = view({ status })
    assert.match(out, new RegExp(`data-meal-goal-required="${status}"`))
    assert.doesNotMatch(out, /식단 목표가 아직 설정되지 않았어요/)
    assert.doesNotMatch(out, /data-meal-goal-cta/)
  }
  assert.match(view({ status: 'error' }), />다시 시도</)
  assert.deepEqual(hrefs(view({ status: 'unavailable' })), ['/ai'])
})

// ── 라우트·범위 ───────────────────────────────────────────────────────────────
test('라우트: D01-4·I07은 회원 전용이고 I07의 상위 화면은 I01이며(I03↔I07 반복 방지) I03 라우트는 만들지 않았다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const goal = router.indexOf("path: 'records/meal/goal',")
  const required = router.indexOf("path: 'ai/meal/goal-required',")
  assert.ok(gate > 0 && goal > gate && required > gate)
  const goalBody = router.slice(goal, goal + 500)
  assert.match(goalBody, /screenId: 'D01-4'/)
  assert.match(goalBody, /parent: '\/records\/meal'/)
  assert.match(goalBody, /ownH1: true/)
  assert.match(goalBody, /domain: 'meal'/)
  const reqBody = router.slice(required, required + 500)
  assert.match(reqBody, /screenId: 'I07'/)
  assert.match(reqBody, /parent: '\/ai'/)
  assert.doesNotMatch(reqBody, /parent: '\/ai\/meal'/)
  assert.match(reqBody, /ownH1: true/)
  // I03(AI 식단 플랜)은 아직 없다: 미구현 화면을 만들거나 노출하지 않는다.
  assert.doesNotMatch(router, /path: 'ai\/meal',/)
  assert.doesNotMatch(router, /screenId: 'I03/)
  // I07 페이지는 목표가 있으면 돌아갈 곳으로 replace 이동하고 돌아갈 곳은 검증한다.
  const page = code('../src/pages/MealGoalRequiredPage.tsx')
  assert.match(page, /<Navigate to=\{returnTo\} replace \/>/)
  assert.match(page, /resolveReturnPath/)
  const goalPage = code('../src/pages/MealGoalPage.tsx')
  assert.match(goalPage, /resolveReturnPath\(from, PATH_MEAL\)/)
})

test('범위 준수: 기존 운동 목표 저장소는 PIN·프로필만 호출하고 식단 목표 파일은 DB·네트워크·AI·멤버십을 다루지 않는다', () => {
  const hook = code('../src/meal-goal/useMealGoalForm.ts')
  assert.doesNotMatch(
    hook,
    /exerciseRepository\.(saveGoal|getGoal|getSummary)\b/,
  )
  for (const method of [
    'getPinStatus',
    'registerPin',
    'unlock',
    'getProfile',
    'getProfilePrefill',
    'saveProfile',
  ])
    assert.match(hook, new RegExp(`exerciseRepository\\.${method}\\(`))
  for (const file of [
    '../src/meal-goal/mealGoalTypes.ts',
    '../src/meal-goal/mealGoalPolicy.ts',
    '../src/meal-goal/mealGoalCalculation.ts',
    '../src/meal-goal/mealGoalValidation.ts',
    '../src/meal-goal/mealGoalSource.ts',
    '../src/meal-goal/local/localMealGoalRepository.ts',
    '../src/meal-goal/useMealGoal.ts',
    '../src/meal-goal/useMealGoalForm.ts',
    '../src/pages/MealGoalPage.tsx',
    '../src/pages/MealGoalRequiredPage.tsx',
  ])
    assert.doesNotMatch(
      code(file),
      /indexedDB|sessionStorage|fetch\(|\/api\/|entitlement|trial|payment|membership|getExercisePlanAccess/i,
      file,
    )
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
  // 식단 기록·내일 계획 모델은 가져오지 않는다.
  assert.doesNotMatch(
    code('../src/meal-goal/useMealGoalForm.ts'),
    /mealPlan|mealRecord|MealPlanRepository/,
  )
})

test('목표 모델: 계산 상수는 시안 값 그대로이고 "검증 전" 표시가 코드에 남아 있다', () => {
  const calcSource = read('../src/meal-goal/mealGoalCalculation.ts')
  assert.match(calcSource, /검증되지 않은 시안 예시/)
  assert.match(calcSource, /전문가 검토 필요/)
  assert.deepEqual(Calc.SIHAN_CONSTANTS_V1.activityFactor, {
    sedentary: 1.2,
    light: 1.375,
    active: 1.55,
  })
  assert.equal(Calc.SIHAN_CONSTANTS_V1.purposeDelta.lose, -500)
  assert.equal(Calc.SIHAN_CONSTANTS_V1.purposeDelta.improve, 0)
  assert.equal(Calc.SIHAN_CONSTANTS_V1.purposeDelta.maintain, 0)
})
