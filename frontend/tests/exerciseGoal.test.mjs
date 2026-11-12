import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server,
  policy,
  activityPolicy,
  types,
  local,
  GoalForm,
  PinForm,
  ProfileForm,
  GoalPage,
  AuthContext
const profile = {
  age: 30,
  sex: 'male',
  heightCm: 170,
  weightKg: 80,
  updatedAt: '2026-11-12T00:00:00.000Z',
}
const reportedProfile = {
  ...profile,
  age: 33,
  sex: 'female',
  heightCm: 161,
  weightKg: 64,
}
const contextFor = (tier = 'beginner', focus = 'balanced') => ({
  healthGoal: {
    focus,
    exerciseRatio: focus === 'meal' ? 30 : focus === 'exercise' ? 70 : 50,
    mealRatio: focus === 'meal' ? 70 : focus === 'exercise' ? 30 : 50,
    updatedAt: '2026-11-11T00:00:00.000Z',
  },
  exerciseTier: tier,
  knowledgeSource: tier === null ? 'unknown' : 'assessment',
})
const draftFor = (purpose = 'learn') => ({
  purpose,
  activityId: 'bodyweight-strength',
  targetWeightKg: '80',
  daysPerWeek: '3',
  minutesPerSession: '20',
})

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
  })
  policy = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalPolicy.ts',
  )
  activityPolicy = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalActivity.ts',
  )
  types = await server.ssrLoadModule('/src/exercise-goal/exerciseGoalTypes.ts')
  local = await server.ssrLoadModule(
    '/src/exercise-goal/local/localExerciseGoalRepository.ts',
  )
  GoalForm = (
    await server.ssrLoadModule(
      '/src/components/exercise/goal/ExerciseGoalForm.tsx',
    )
  ).default
  PinForm = (
    await server.ssrLoadModule('/src/components/exercise/goal/GoalPinForm.tsx')
  ).default
  ProfileForm = (
    await server.ssrLoadModule(
      '/src/components/exercise/goal/GoalProfileForm.tsx',
    )
  ).default
  GoalPage = (await server.ssrLoadModule('/src/pages/ExerciseGoalPage.tsx'))
    .default
  ;({ AuthContext } = await server.ssrLoadModule('/src/auth/authContext.ts'))
})
after(async () => {
  await server?.close()
})

function fixture(owner = 'test-member') {
  const data = new Map()
  let failWrite = false
  let clock = Date.parse('2026-11-12T00:00:00.000Z')
  let context = contextFor()
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failWrite) throw new Error('quota')
      data.set(key, value)
    },
  }
  const repository = local.createLocalExerciseGoalRepository(owner, {
    storage,
    crypto: webcrypto,
    now: () => clock,
    loadContext: async () => structuredClone(context),
  })
  return {
    owner,
    data,
    storage,
    repository,
    setContext: (value) => {
      context = value
    },
    advance: (ms) => {
      clock += ms
    },
    failWrites: (value) => {
      failWrite = value
    },
  }
}
const code = (expected) => (error) =>
  error instanceof types.ExerciseGoalError && error.code === expected
async function setup(f) {
  await f.repository.registerPin('123456', '123456')
  return f.repository.unlock('123456')
}

test('초급·미확인은 간편, 중급·고급은 직접 설정이며 식단 이해도를 사용하지 않는다', () => {
  for (const tier of ['beginner', null])
    assert.equal(policy.exerciseGoalMode(tier), 'simple')
  for (const tier of ['intermediate', 'advanced'])
    assert.equal(policy.exerciseGoalMode(tier), 'detailed')
  const normal = { ...profile, weightKg: 60 }
  assert.deepEqual(policy.goalPurposes('simple', normal), [
    'learn',
    'maintain',
    'lose',
  ])
  assert.deepEqual(policy.goalPurposes('detailed', normal), [
    'lose',
    'bulk',
    'maintain',
  ])
})
test('운동 알아가기는 주 3회·10분을 저장하고 임의 BMI 감량을 체중에 적용하지 않는다', () => {
  for (const age of [18, 30, 65, 100])
    for (const focus of ['exercise', 'meal', 'balanced']) {
      const result = policy.calculateExerciseGoal(
        draftFor('learn'),
        contextFor('beginner', focus),
        { ...profile, age },
      )
      assert.equal(result.ok, true)
      assert.equal(result.goal.targetWeightKg, 80)
      assert.equal(result.goal.daysPerWeek, 3)
      assert.equal(result.goal.minutesPerSession, 10)
      assert.equal(result.goal.weeklyMinutes, 30)
      assert.equal(result.goal.calculationVersion, 4)
      assert.equal(result.goal.activityId, 'bodyweight-strength')
    }
  const normal = { ...profile, weightKg: 60 }
  assert.equal(
    policy.calculateExerciseGoal(draftFor('maintain'), contextFor(), normal)
      .goal.targetWeightKg,
    60,
  )
})
test('선택한 맨몸 운동의 순수 추가 에너지와 4주 체중 환산량을 계산한다', () => {
  const general = activityPolicy.activityEnergyReference(
    64,
    3,
    10,
    'bodyweight-strength',
  )
  assert.equal(general.weeks, 4)
  assert.equal(general.weeklyMinutes, 30)
  assert.equal(general.weeklyNetKcal, 64)
  assert.equal(general.periodNetKcal, 256)
  assert.ok(Math.abs(general.energyEquivalentKg - 256 / 7700) < 1e-10)
  const core = activityPolicy.activityEnergyReference(64, 3, 10, 'light-core')
  assert.ok(Math.abs(core.periodNetKcal - 230.4) < 1e-8)
  const circuit = activityPolicy.activityEnergyReference(
    64,
    3,
    10,
    'light-circuit',
  )
  assert.equal(circuit.periodNetKcal, 320)
  const doubleTime = activityPolicy.activityEnergyReference(
    64,
    3,
    20,
    'bodyweight-strength',
  )
  assert.equal(doubleTime.periodNetKcal, 512)
  assert.equal(
    activityPolicy.activityEnergyReference(32, 3, 10, 'bodyweight-strength')
      .periodNetKcal,
    128,
  )
})

test('맨몸 운동 미선택·미지원 종류와 잘못된 활동량을 계산·저장하지 않는다', () => {
  for (const activityId of ['', undefined, 'running', 'toString', 3]) {
    assert.equal(
      activityPolicy.activityEnergyReference(64, 3, 10, activityId),
      null,
    )
    for (const purpose of ['learn', 'lose']) {
      const result = policy.calculateExerciseGoal(
        { ...draftFor(purpose), activityId },
        contextFor(),
        reportedProfile,
      )
      assert.equal(result.ok, false)
      assert.equal(result.issues[0].field, 'activityId')
    }
  }
  for (const [weight, days, minutes] of [
    [NaN, 3, 10],
    [Infinity, 3, 10],
    [0, 3, 10],
    [64, 0, 10],
    [64, 8, 10],
    [64, 3, -1],
    [64, 3, 10.5],
  ])
    assert.equal(
      activityPolicy.activityEnergyReference(
        weight,
        days,
        minutes,
        'bodyweight-strength',
      ),
      null,
    )
})

test('감량 시작 횟수·시간은 초급·건강 목표를 반영하고 단계 증가는 자동 저장하지 않는다', () => {
  for (const [tier, age, focus, minutes] of [
    ['beginner', 33, 'balanced', 20],
    ['beginner', 33, 'meal', 15],
    ['beginner', 65, 'balanced', 10],
    [null, 33, 'balanced', 10],
  ]) {
    const context = contextFor(tier, focus)
    const plan = activityPolicy.beginnerLossPlan(context, age)
    const result = policy.calculateExerciseGoal(draftFor('lose'), context, {
      ...reportedProfile,
      age,
    })
    assert.equal(result.goal.daysPerWeek, 3)
    assert.equal(result.goal.minutesPerSession, minutes)
    assert.equal(result.goal.weeklyMinutes, minutes * 3)
    assert.equal(plan[0].minutesPerSession, minutes)
    assert.equal(plan.at(-1).minutesPerSession, 30)
    assert.ok(plan.every((step) => step.daysPerWeek === 3))
  }
})

test('운동 종류 변경은 환산량에 반영되며 감량 목표 체중·달성 기간으로 바꾸지 않는다', () => {
  for (const activityId of [
    'light-core',
    'bodyweight-strength',
    'light-circuit',
  ]) {
    const learning = policy.calculateExerciseGoal(
      { ...draftFor('learn'), activityId },
      contextFor(),
      reportedProfile,
    ).goal
    assert.equal(learning.targetWeightKg, 64)
    assert.deepEqual(policy.parseExerciseGoal(learning), learning)
    const loss = policy.calculateExerciseGoal(
      { ...draftFor('lose'), activityId },
      contextFor(),
      reportedProfile,
    ).goal
    assert.equal(loss.targetWeightKg, 60.8)
    assert.equal('targetDate' in loss, false)
    assert.equal(
      policy.parseExerciseGoal({ ...learning, activityId: undefined }),
      null,
    )
    assert.equal(
      policy.parseExerciseGoal({ ...learning, activityId: 'unsupported' }),
      null,
    )
  }
})

test('초급 첫 감량은 최대 5%이며 BMI 19.25 기준 체중 아래로 내리지 않는다', () => {
  assert.equal(policy.REFERENCE_BMI, 20.75)
  assert.equal(policy.LOSS_REFERENCE_BMI, 19.25)
  assert.equal(policy.INITIAL_LOSS_FRACTION, 0.05)
  assert.equal(
    policy.calculateExerciseGoal(draftFor('lose'), contextFor(), profile).goal
      .targetWeightKg,
    76,
  )
  assert.equal(
    policy.calculateExerciseGoal(draftFor('lose'), contextFor(), {
      ...profile,
      weightKg: 60,
    }).goal.targetWeightKg,
    57,
  )
  assert.equal(
    policy.calculateExerciseGoal(draftFor('lose'), contextFor(), {
      ...profile,
      heightCm: 100,
      weightKg: 25,
    }).ok,
    false,
  )
  assert.equal(
    policy.calculateExerciseGoal(draftFor('lose'), contextFor(), {
      ...profile,
      weightKg: 57,
    }).goal.targetWeightKg,
    55.7,
  )
})

test('33세 여성 161cm·64kg의 첫 목표는 49.9kg 대신 60.8kg으로 계산한다', () => {
  const result = policy.calculateExerciseGoal(
    draftFor('lose'),
    contextFor(),
    reportedProfile,
  )
  assert.equal(result.ok, true)
  assert.ok(
    Math.abs(policy.beginnerBmiGoals(reportedProfile).currentBmi - 24.6904) <
      0.0001,
  )
  assert.equal(result.goal.targetWeightKg, 60.8)
  assert.ok(
    Math.abs(reportedProfile.weightKg - result.goal.targetWeightKg - 3.2) <
      1e-8,
  )
  assert.equal(result.goal.calculationVersion, 4)
  assert.deepEqual(policy.parseExerciseGoal(result.goal), result.goal)
})
test('체중 유지는 반올림 전 BMI 18.5 이상~23 미만일 때만 표시·저장한다', () => {
  for (const [weightKg, allowed] of [
    [73.9, false],
    [74, true],
    [91.9, true],
    [92, false],
    [100, false],
  ]) {
    const p = { ...profile, heightCm: 200, weightKg }
    for (const tier of ['beginner', null, 'intermediate', 'advanced']) {
      assert.equal(
        policy
          .goalPurposes(policy.exerciseGoalMode(tier), p)
          .includes('maintain'),
        allowed,
      )
      const result = policy.calculateExerciseGoal(
        { ...draftFor('maintain'), targetWeightKg: String(weightKg) },
        contextFor(tier),
        p,
      )
      assert.equal(result.ok, allowed)
    }
  }
})

test('낮은 BMI에서는 학습 체중을 더 낮추지 않고 더 큰 감량이 불가능한 선택지를 숨긴다', () => {
  const low = { ...profile, weightKg: 50 }
  assert.deepEqual(policy.goalPurposes('simple', low), ['learn'])
  assert.equal(
    policy.calculateExerciseGoal(draftFor('learn'), contextFor(), low).goal
      .targetWeightKg,
    50,
  )
  assert.equal(
    policy.calculateExerciseGoal(draftFor('lose'), contextFor(), low).ok,
    false,
  )
  const nearReference = { ...profile, weightKg: 55.8 }
  assert.equal(policy.beginnerBmiGoals(nearReference).canLose, false)
})

test('자동 참고 체중은 소수점 한 자리로 올림하며 감량이 학습보다 크고 BMI 하한을 지킨다', () => {
  for (const heightCm of [100, 150, 170, 200, 230])
    for (const weightKg of [25, 50, 60, 80, 100, 250]) {
      const p = { ...profile, heightCm, weightKg }
      const bmi = policy.beginnerBmiGoals(p)
      const learn = policy.calculateExerciseGoal(
        draftFor('learn'),
        contextFor(),
        p,
      ).goal
      assert.ok(learn.targetWeightKg <= weightKg)
      assert.ok(learn.targetWeightKg >= 25)
      assert.ok(
        Math.abs(
          learn.targetWeightKg * 10 - Math.round(learn.targetWeightKg * 10),
        ) < 1e-8,
      )
      if (bmi.currentBmi >= 18.5)
        assert.ok(learn.targetWeightKg / (heightCm / 100) ** 2 >= 18.5)
      else assert.equal(learn.targetWeightKg, weightKg)
      if (bmi.canLose) {
        const loss = policy.calculateExerciseGoal(
          draftFor('lose'),
          contextFor(),
          p,
        ).goal
        assert.ok(loss.targetWeightKg < learn.targetWeightKg)
        assert.ok(loss.targetWeightKg / (heightCm / 100) ** 2 >= 19.25)
        assert.ok(weightKg - loss.targetWeightKg <= weightKg * 0.05 + 1e-8)
      }
    }
})

test('건강 목표 관리 비중은 시작 계획에 반영되고 시간은 의료적 최적값으로 계산하지 않는다', () => {
  const exercise = policy.calculateExerciseGoal(
    draftFor('lose'),
    contextFor('beginner', 'exercise'),
    profile,
  ).goal
  const meal = policy.calculateExerciseGoal(
    draftFor('lose'),
    contextFor('beginner', 'meal'),
    profile,
  ).goal
  assert.equal(exercise.daysPerWeek, 3)
  assert.equal(meal.daysPerWeek, 3)
  assert.equal(exercise.minutesPerSession, 20)
  assert.equal(meal.minutesPerSession, 15)
})
test('직접 설정에서 체중·횟수·시간이 실제 저장 목표에 반영된다', () => {
  const result = policy.calculateExerciseGoal(
    {
      purpose: 'bulk',
      targetWeightKg: '82.5',
      daysPerWeek: '4',
      minutesPerSession: '35',
    },
    contextFor('advanced'),
    profile,
  )
  assert.equal(result.ok, true)
  assert.equal(result.goal.targetWeightKg, 82.5)
  assert.equal(result.goal.weeklyMinutes, 140)
})
test('목표 방향·BMI 하한·소수점·빈 값·범위를 검증한다', () => {
  const context = contextFor('intermediate')
  const detailed = { ...draftFor('lose'), targetWeightKg: '76' }
  for (const draft of [
    { ...draftFor('lose'), targetWeightKg: '85' },
    { ...draftFor('lose'), targetWeightKg: '50' },
    { ...draftFor('bulk'), targetWeightKg: '79' },
    { ...detailed, targetWeightKg: '' },
    { ...detailed, targetWeightKg: '80.01' },
    { ...detailed, daysPerWeek: '0' },
    { ...detailed, daysPerWeek: '8' },
    { ...detailed, minutesPerSession: '0' },
    { ...detailed, minutesPerSession: '21' },
    { ...detailed, minutesPerSession: '185' },
    { ...detailed, minutesPerSession: 'NaN' },
  ])
    assert.equal(
      policy.calculateExerciseGoal(draft, context, profile).ok,
      false,
      JSON.stringify(draft),
    )
  assert.equal(
    policy.calculateExerciseGoal(detailed, context, profile).ok,
    true,
  )
  for (const targetWeightKg of ['59', '61'])
    assert.equal(
      policy.calculateExerciseGoal(
        { ...draftFor('maintain'), targetWeightKg },
        context,
        { ...profile, weightKg: 60 },
      ).ok,
      true,
    )
  assert.equal(
    policy.calculateExerciseGoal(
      { ...draftFor('maintain'), targetWeightKg: '62' },
      context,
      { ...profile, weightKg: 60 },
    ).ok,
    false,
  )
})
test('미성년·잘못된 신체 정보·변조 목표를 거부한다', () => {
  assert.equal(
    policy.calculateExerciseGoal(draftFor(), contextFor(), {
      ...profile,
      age: 17,
    }).ok,
    false,
  )
  assert.equal(
    policy.calculateExerciseGoal(draftFor(), contextFor(), {
      ...profile,
      heightCm: 0,
    }).ok,
    false,
  )
  const goal = policy.calculateExerciseGoal(
    draftFor(),
    contextFor(),
    profile,
  ).goal
  assert.deepEqual(policy.parseExerciseGoal(goal), goal)
  assert.equal(policy.parseExerciseGoal({ ...goal, weeklyMinutes: 9999 }), null)
  assert.equal(policy.parseExerciseGoal({ ...goal, targetWeightKg: 1 }), null)
})
const legacyGoal = (
  purpose = 'learn',
  context = contextFor('beginner', 'meal'),
) => ({
  v: 1,
  purpose,
  mode: policy.exerciseGoalMode(context.exerciseTier),
  targetWeightKg: purpose === 'lose' ? 76 : 80,
  daysPerWeek: context.healthGoal.focus === 'meal' ? 2 : 3,
  minutesPerSession: purpose === 'learn' ? 10 : 20,
  weeklyMinutes:
    (context.healthGoal.focus === 'meal' ? 2 : 3) *
    (purpose === 'learn' ? 10 : 20),
  context,
  profile,
  updatedAt: profile.updatedAt,
})
const fixedBmiGoal = () => ({
  v: 1,
  calculationVersion: 2,
  purpose: 'lose',
  mode: 'simple',
  targetWeightKg: 49.9,
  daysPerWeek: 3,
  minutesPerSession: 20,
  weeklyMinutes: 60,
  context: contextFor(),
  profile: reportedProfile,
  updatedAt: profile.updatedAt,
})

test('고정 BMI 버전 2 목표도 원래 수치로 읽고 새 계산으로 오판하지 않는다', () => {
  const previous = fixedBmiGoal()
  assert.deepEqual(policy.parseExerciseGoal(previous), previous)
  assert.equal(
    policy.parseExerciseGoal({ ...previous, targetWeightKg: 60.8 }),
    null,
  )
  const learn = {
    ...previous,
    purpose: 'learn',
    targetWeightKg: 63.8,
    minutesPerSession: 10,
    weeklyMinutes: 30,
  }
  assert.deepEqual(policy.parseExerciseGoal(learn), learn)
  const maintain = {
    ...previous,
    purpose: 'maintain',
    targetWeightKg: 60,
    profile: { ...profile, weightKg: 60 },
  }
  assert.deepEqual(policy.parseExerciseGoal(maintain), maintain)
})

test('활동 종류가 없던 버전 3 학습·감량 목표도 저장 당시 수치로 읽는다', () => {
  const previous = {
    v: 1,
    calculationVersion: 3,
    purpose: 'learn',
    mode: 'simple',
    targetWeightKg: 79.8,
    daysPerWeek: 3,
    minutesPerSession: 10,
    weeklyMinutes: 30,
    context: contextFor(),
    profile,
    updatedAt: profile.updatedAt,
  }
  assert.deepEqual(policy.parseExerciseGoal(previous), previous)
  const loss = {
    ...previous,
    purpose: 'lose',
    targetWeightKg: 76,
    minutesPerSession: 20,
    weeklyMinutes: 60,
  }
  assert.deepEqual(policy.parseExerciseGoal(loss), loss)
  assert.equal(
    policy.initialGoalDraft(contextFor(), profile, previous).activityId,
    '',
  )
})

test('이전 49.9kg 목표는 조회로 바꾸지 않고 다시 저장할 때만 60.8kg 첫 목표를 적용한다', async () => {
  const f = fixture('fixed-bmi-goal')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, reportedProfile)
  f.data.set(
    local.GOAL_KEY_PREFIX + f.owner,
    JSON.stringify({ ownerId: f.owner, goal: fixedBmiGoal() }),
  )
  const before = f.data.get(local.GOAL_KEY_PREFIX + f.owner)
  assert.equal((await f.repository.getGoal(access)).targetWeightKg, 49.9)
  assert.equal((await f.repository.getSummary()).daysPerWeek, 3)
  assert.equal(f.data.get(local.GOAL_KEY_PREFIX + f.owner), before)
  const updated = await f.repository.saveGoal(
    access,
    draftFor('lose'),
    contextFor(),
    savedProfile,
  )
  assert.equal(updated.targetWeightKg, 60.8)
  assert.equal(updated.calculationVersion, 4)
  assert.deepEqual(await f.repository.getGoal(access), updated)
})

test('이전 계산으로 저장한 학습·감량·유지 목표를 읽되 새 계산으로 자동 변경하지 않는다', () => {
  for (const purpose of ['learn', 'lose', 'maintain']) {
    const previous = legacyGoal(purpose)
    assert.deepEqual(policy.parseExerciseGoal(previous), {
      ...previous,
      calculationVersion: 1,
    })
  }
  const previous = legacyGoal('maintain', contextFor('intermediate'))
  assert.equal(policy.parseExerciseGoal(previous).targetWeightKg, 80)
  assert.equal(
    policy.initialGoalDraft(contextFor(), profile, previous).purpose,
    '',
  )
  assert.equal(
    policy.parseExerciseGoal({ ...previous, calculationVersion: 2 }),
    null,
  )
  assert.equal(
    policy.parseExerciseGoal({ ...previous, calculationVersion: 5 }),
    null,
  )
  const current = policy.calculateExerciseGoal(
    draftFor('learn'),
    contextFor(),
    profile,
  ).goal
  assert.equal(
    policy.parseExerciseGoal({ ...current, targetWeightKg: 1 }),
    null,
  )
})

test('저장소도 숨긴 유지 목적을 거부하고 기존 목표를 그대로 보존한다', async () => {
  const f = fixture('hidden-maintain')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  await f.repository.saveGoal(
    access,
    draftFor('learn'),
    contextFor(),
    savedProfile,
  )
  const before = f.data.get(local.GOAL_KEY_PREFIX + f.owner)
  await assert.rejects(
    f.repository.saveGoal(
      access,
      draftFor('maintain'),
      contextFor(),
      savedProfile,
    ),
    code('validation'),
  )
  assert.equal(f.data.get(local.GOAL_KEY_PREFIX + f.owner), before)
})

test('이전 목표 조회·요약은 저장값을 바꾸지 않으며 명시적 저장 때만 새 계산을 적용한다', async () => {
  const f = fixture('legacy-goal')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  const previous = legacyGoal()
  f.data.set(
    local.GOAL_KEY_PREFIX + f.owner,
    JSON.stringify({ ownerId: f.owner, goal: previous }),
  )
  const before = f.data.get(local.GOAL_KEY_PREFIX + f.owner)
  assert.equal((await f.repository.getGoal(access)).targetWeightKg, 80)
  assert.equal((await f.repository.getSummary()).daysPerWeek, 2)
  assert.equal(f.data.get(local.GOAL_KEY_PREFIX + f.owner), before)
  const updated = await f.repository.saveGoal(
    access,
    draftFor('learn'),
    contextFor(),
    savedProfile,
  )
  assert.equal(updated.targetWeightKg, 80)
  assert.equal(updated.daysPerWeek, 3)
  assert.equal(updated.calculationVersion, 4)
})

test('PIN 등록 형식·확인·중복을 검증하고 원문 PIN을 저장하지 않는다', async () => {
  const f = fixture('pin-register')
  await assert.rejects(f.repository.registerPin('12', '12'), code('pinFormat'))
  await assert.rejects(
    f.repository.registerPin('123456', '654321'),
    code('pinMismatch'),
  )
  await f.repository.registerPin('123456', '123456')
  const stored = f.data.get(local.PIN_KEY_PREFIX + f.owner)
  assert.doesNotMatch(stored, /123456/)
  await assert.rejects(
    f.repository.registerPin('654321', '654321'),
    code('pinExists'),
  )
})
test('PIN 등록만으로는 열람하지 못하고 허위·타 계정 권한을 거부한다', async () => {
  const f = fixture('grant-owner')
  const access = await setup(f)
  await assert.rejects(
    f.repository.getProfile({ token: 'forged', expiresAt: Infinity }),
    code('expired'),
  )
  const other = local.createLocalExerciseGoalRepository('other-owner', {
    storage: f.storage,
    crypto: webcrypto,
  })
  await assert.rejects(other.getProfile(access), code('expired'))
  f.repository.lock(access)
  await assert.rejects(f.repository.getProfile(access), code('expired'))
})
test('PIN 5회 실패 제한은 저장되어 새 저장소 인스턴스에서도 유지된다', async () => {
  const f = fixture('lockout')
  await f.repository.registerPin('123456', '123456')
  for (let i = 0; i < 4; i++)
    await assert.rejects(f.repository.unlock('000000'), code('pinWrong'))
  await assert.rejects(f.repository.unlock('000000'), code('locked'))
  await assert.rejects(f.repository.unlock('123456'), code('locked'))
  assert.ok((await f.repository.getPinStatus()).retryAt)
  const reloaded = local.createLocalExerciseGoalRepository(f.owner, {
    storage: f.storage,
    crypto: webcrypto,
    now: () => Date.parse('2026-11-12T00:00:00Z'),
  })
  await assert.rejects(reloaded.unlock('123456'), code('locked'))
  f.advance(local.PIN_LOCK_MS + 1)
  assert.ok((await f.repository.unlock('123456')).token)
})
test('보호 권한은 1분 뒤 만료되고 저장도 차단한다', async () => {
  const f = fixture('expires')
  const access = await setup(f)
  await f.repository.saveProfile(access, profile)
  f.advance(local.ACCESS_MS)
  await assert.rejects(f.repository.getProfile(access), code('expired'))
  await assert.rejects(
    f.repository.saveGoal(access, draftFor(), contextFor(), profile),
    code('expired'),
  )
})
test('기존 키·몸무게의 자동 채움도 PIN 권한 뒤에만 읽는다', async () => {
  const f = fixture('profile-prefill')
  f.data.set(
    'mealthroutine.dev.mock.body.' + f.owner,
    JSON.stringify({
      v: 1,
      heightCm: 175.5,
      weightKg: 75.2,
      updatedAt: profile.updatedAt,
    }),
  )
  await assert.rejects(
    f.repository.getProfilePrefill({ token: 'forged', expiresAt: Infinity }),
    code('expired'),
  )
  const access = await setup(f)
  assert.deepEqual(await f.repository.getProfilePrefill(access), {
    heightCm: 175.5,
    weightKg: 75.2,
  })
  assert.equal(await f.repository.getProfile(access), null)
})
test('신체 정보→목표 저장→다시 조회→대시보드 비민감 요약까지 연결된다', async () => {
  const f = fixture('complete-flow')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  const goal = await f.repository.saveGoal(
    access,
    draftFor('learn'),
    contextFor(),
    savedProfile,
  )
  assert.equal(goal.targetWeightKg, 80)
  assert.equal(
    JSON.parse(f.data.get('mealthroutine.dev.mock.body.' + f.owner)).heightCm,
    170,
  )
  const summary = await f.repository.getSummary()
  assert.equal(summary.daysPerWeek, 3)
  assert.equal('targetWeightKg' in summary, false)
  assert.equal('profile' in summary, false)
  assert.equal('context' in summary, false)
  const other = local.createLocalExerciseGoalRepository('unrelated-account', {
    storage: f.storage,
    crypto: webcrypto,
  })
  assert.equal(await other.getSummary(), null)
  f.repository.lock(access)
  const next = await f.repository.unlock('123456')
  assert.deepEqual(await f.repository.getGoal(next), goal)
})
test('저장 실패·입력 취소·조회는 기존 목표와 건강 목표를 변경하지 않는다', async () => {
  const f = fixture('atomic-save')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  await f.repository.saveGoal(
    access,
    draftFor('learn'),
    contextFor(),
    savedProfile,
  )
  const before = f.data.get(local.GOAL_KEY_PREFIX + f.owner)
  const stored = await f.repository.getGoal(access)
  stored.targetWeightKg = 1
  assert.equal(f.data.get(local.GOAL_KEY_PREFIX + f.owner), before)
  f.failWrites(true)
  await assert.rejects(
    f.repository.saveGoal(access, draftFor('lose'), contextFor(), savedProfile),
    code('save'),
  )
  assert.equal(f.data.get(local.GOAL_KEY_PREFIX + f.owner), before)
  assert.equal(f.data.has('mealthroutine.dev.mock.goal.' + f.owner), false)
})
test('편집 중 건강 목표·신체 정보 변경을 감지한다', async () => {
  const f = fixture('changed-context')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  f.setContext(contextFor('beginner', 'meal'))
  await assert.rejects(
    f.repository.saveGoal(
      access,
      draftFor('learn'),
      contextFor(),
      savedProfile,
    ),
    code('contextChanged'),
  )
  f.setContext(contextFor())
  await f.repository.saveProfile(access, { ...profile, weightKg: 81 })
  await assert.rejects(
    f.repository.saveGoal(
      access,
      draftFor('learn'),
      contextFor(),
      savedProfile,
    ),
    code('contextChanged'),
  )
})
test('손상된 PIN·목표는 없는 값으로 취급하거나 자동 덮어쓰지 않는다', async () => {
  const f = fixture('corrupt')
  f.data.set(local.PIN_KEY_PREFIX + f.owner, '{}')
  await assert.rejects(f.repository.getPinStatus(), code('corrupt'))
  await assert.rejects(
    f.repository.registerPin('123456', '123456'),
    code('corrupt'),
  )
  f.data.delete(local.PIN_KEY_PREFIX + f.owner)
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  f.data.set(local.GOAL_KEY_PREFIX + f.owner, '{bad-json')
  await assert.rejects(f.repository.getSummary(), code('corrupt'))
  await assert.rejects(
    f.repository.saveGoal(
      access,
      draftFor('learn'),
      contextFor(),
      savedProfile,
    ),
    code('corrupt'),
  )
})
test('저장 대기 중 권한을 취소하면 쓰기를 막는다', async () => {
  const f = fixture('cancel-pending')
  const access = await setup(f)
  const savedProfile = await f.repository.saveProfile(access, profile)
  const operation = f.repository.saveGoal(
    access,
    draftFor('learn'),
    contextFor(),
    savedProfile,
  )
  f.repository.lock(access)
  await assert.rejects(operation, code('expired'))
  assert.equal(f.data.has(local.GOAL_KEY_PREFIX + f.owner), false)
})
test('저장된 JSON null은 미등록으로 취급하지 않는다', async () => {
  const f = fixture('null-credential')
  f.data.set(local.PIN_KEY_PREFIX + f.owner, 'null')
  await assert.rejects(f.repository.getPinStatus(), code('corrupt'))
  await assert.rejects(
    f.repository.registerPin('123456', '123456'),
    code('corrupt'),
  )
  f.data.delete(local.PIN_KEY_PREFIX + f.owner)
  const access = await setup(f)
  f.data.set(local.GOAL_KEY_PREFIX + f.owner, 'null')
  await assert.rejects(f.repository.getGoal(access), code('corrupt'))
  f.data.set('mealthroutine.dev.mock.body.' + f.owner, 'null')
  await assert.rejects(f.repository.getProfilePrefill(access), code('corrupt'))
})
test('초급은 간편 선택만, 중급·고급은 체중·횟수·시간 입력을 렌더링한다', () => {
  const renderForm = (tier) =>
    renderToStaticMarkup(
      createElement(GoalForm, {
        context: contextFor(tier),
        profile,
        saved: null,
        save: async () => {},
        editProfile: () => {},
        cancel: () => {},
      }),
    )
  assert.doesNotMatch(renderForm('beginner'), /id="goal-targetWeightKg"/)
  assert.match(renderForm('beginner'), /운동 알아가기/)
  for (const tier of ['intermediate', 'advanced']) {
    const html = renderForm(tier)
    for (const field of ['targetWeightKg', 'daysPerWeek', 'minutesPerSession'])
      assert.match(html, new RegExp(`id="goal-${field}"`))
    assert.match(html, /벌크업/)
  }
  assert.match(renderForm(null), /이해도 미확인/)
})
test('실제 폼 렌더링에서 BMI별 유지 선택지와 학습·감량 참고 목표를 확인한다', () => {
  const render = (p, saved = null, tier = 'beginner') =>
    renderToStaticMarkup(
      createElement(GoalForm, {
        context: contextFor(tier),
        profile: p,
        saved,
        save: async () => {},
        editProfile: () => {},
        cancel: () => {},
      }),
    )
  for (const tier of ['beginner', 'intermediate', 'advanced']) {
    assert.match(
      render({ ...profile, weightKg: 60 }, null, tier),
      /value="maintain"/,
    )
    assert.doesNotMatch(render(profile, null, tier), /value="maintain"/)
    assert.doesNotMatch(
      render({ ...profile, weightKg: 50 }, null, tier),
      /value="maintain"/,
    )
  }
  const learning = policy.calculateExerciseGoal(
    draftFor('learn'),
    contextFor(),
    profile,
  ).goal
  const html = render(profile, learning)
  assert.match(html, /4주 활동량 참고값/)
  assert.match(html, /현재 BMI 27\.68/)
  assert.match(html, /주 3회 · 1회 10분/)
  assert.match(html, /실제 감량 예측이 아니에요/)
  const loss = policy.calculateExerciseGoal(
    draftFor('lose'),
    contextFor(),
    profile,
  ).goal
  assert.match(render(profile, loss), /76\.0/)
  assert.match(render(profile, loss), /BMI 19\.25/)
  assert.match(render(profile, loss), /최대 5%/)
  assert.match(render(profile, loss), /저장할 1차 감량 목표/)
  assert.doesNotMatch(render(profile, loss), /BMI 25 이상/)
  assert.doesNotMatch(render({ ...profile, weightKg: 50 }), /value="lose"/)
  const previousLoss = render(reportedProfile, fixedBmiGoal())
  assert.match(previousLoss, /이전 계산 기준으로 저장된 목표예요/)
  assert.match(previousLoss, /맨몸 운동 종류를 선택해 주세요/)
  const currentLoss = policy.calculateExerciseGoal(
    draftFor('lose'),
    contextFor(),
    reportedProfile,
  ).goal
  assert.match(render(reportedProfile, currentLoss), /60\.8/)
  assert.match(render(reportedProfile, currentLoss), /참고 감량 차이 3\.2/)
  const previous = render(profile, legacyGoal('maintain'))
  assert.match(previous, /현재 설정된 목표/)
  assert.doesNotMatch(previous, /type="radio"[^>]*checked/)
})

test('실제 학습 폼은 운동 종류 선택과 4주 환산값을 보여 주고 계산 감량을 체중에서 빼지 않는다', () => {
  const goal = policy.calculateExerciseGoal(
    draftFor('learn'),
    contextFor(),
    reportedProfile,
  ).goal
  const html = renderToStaticMarkup(
    createElement(GoalForm, {
      context: contextFor(),
      profile: reportedProfile,
      saved: goal,
      save: async () => {},
      editProfile: () => {},
      cancel: () => {},
    }),
  )
  for (const value of ['light-core', 'bodyweight-strength', 'light-circuit'])
    assert.match(html, new RegExp(`value="${value}"`))
  assert.match(html, /약 256 kcal/)
  assert.match(html, /약 0\.03 kg/)
  assert.match(html, /실제 감량은 0kg일 수도/)
  assert.match(html, /현재 64\.0 kg/)
  assert.doesNotMatch(html, /63\.8|BMI에서 최대 0\.1/)
})

test('잠긴 화면·비회원 화면에는 키·몸무게·목표 체중을 출력하지 않는다', () => {
  const pin = renderToStaticMarkup(
    createElement(PinForm, {
      configured: true,
      retryAt: null,
      register: async () => {},
      unlock: async () => {},
    }),
  )
  assert.match(pin, /type="password"/)
  assert.doesNotMatch(pin, /170|80 kg|targetWeightKg/)
  const guest = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext,
        {
          value: {
            user: null,
            status: 'unauthenticated',
            login: async () => ({}),
            logout: () => {},
          },
        },
        createElement(GoalPage),
      ),
    ),
  )
  assert.equal(guest, '')
})
test('목표·PIN·신체 정보 입력은 보조기기 참조가 유효하다', () => {
  for (const element of [
    createElement(GoalForm, {
      context: contextFor(),
      profile: reportedProfile,
      saved: policy.calculateExerciseGoal(
        draftFor('learn'),
        contextFor(),
        reportedProfile,
      ).goal,
      save: async () => {},
      editProfile: () => {},
      cancel: () => {},
    }),
    createElement(GoalForm, {
      context: contextFor('advanced'),
      profile,
      saved: null,
      save: async () => {},
      editProfile: () => {},
      cancel: () => {},
    }),
    createElement(PinForm, {
      configured: false,
      retryAt: null,
      register: async () => {},
      unlock: async () => {},
    }),
    createElement(ProfileForm, {
      profile: null,
      save: async () => {},
      cancel: () => {},
    }),
  ]) {
    const html = renderToStaticMarkup(element)
    const ids = new Set(
      [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
    )
    for (const [, references] of html.matchAll(
      /aria-(?:labelledby|describedby)="([^"]+)"/g,
    ))
      for (const id of references.split(' ')) assert.ok(ids.has(id), id)
    for (const [, id] of html.matchAll(/<label[^>]*for="([^"]+)"/g))
      assert.ok(ids.has(id), id)
  }
})
