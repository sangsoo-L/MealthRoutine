import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// S7 P2-2: 초급 자동 운동 추천 엔진(전체 자동 추천 + 직접 선택 자동 설정). 실제 시드 카탈로그를 쓴다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Engine
let Rules
let Seed
let Taxonomy
let Entitlements
let catalog
let source
let eligible // 실제 카탈로그에서 자동 구성에 쓸 수 있는 운동(모든 도구)

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Engine = await server.ssrLoadModule('/src/exercise/recommend/engine.ts')
  Rules = await server.ssrLoadModule('/src/exercise/recommend/rules.ts')
  Seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  Taxonomy = await server.ssrLoadModule('/src/exercise/exerciseTaxonomy.ts')
  Entitlements = await server.ssrLoadModule('/src/auth/entitlements.ts')
  catalog = Seed.getSeedCatalog()
  source = Engine.createPlanSource(catalog)
  eligible = catalog.getAllExercises().filter(
    (e) =>
      Rules.classifyExercise(e, {
        tools: Taxonomy.TOOLS,
        evidence: source.evidence,
      }).eligible,
  )
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const base = (over = {}) => ({
  exerciseTier: 'beginner',
  purpose: 'learn',
  availableMinutes: 20,
  tools: ['맨몸'],
  mode: 'automatic',
  ...over,
})
const run = (over, src = source) => Engine.buildBeginnerPlan(base(over), src)
const planOf = (over, src) => {
  const r = run(over, src)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.plan
}
const selected = (ids, over = {}) =>
  planOf({ mode: 'selected', selectedExerciseIds: ids, ...over })
const bodyweightIds = () =>
  eligible
    .filter((e) => e.equipment.every((t) => t === '맨몸'))
    .map((e) => e.id)
    .sort((a, b) => Number(a) - Number(b))
const ruleOf = (item) =>
  Rules.classifyExercise(catalog.getExerciseById(item.exerciseId), {
    tools: Taxonomy.TOOLS,
    evidence: source.evidence,
  }).rule
const key = (plan) => plan.items.map((i) => i.exerciseId).join(',')

// ── 후보 ────────────────────────────────────────────────────
test('후보: 실제 카탈로그의 자동 구성 가능 운동은 28종(상체 9·하체 9·코어 6·전신 4), 맨몸만이면 20종', () => {
  assert.equal(eligible.length, 28)
  const count = (c) => eligible.filter((e) => e.category === c).length
  assert.deepEqual(
    [count('상체'), count('하체'), count('코어'), count('전신')],
    [9, 9, 6, 4],
  )
  assert.equal(bodyweightIds().length, 20)
  assert.ok(eligible.every((e) => e.difficulty === '초급'))
  assert.ok(
    eligible.every((e) => ['reps', 'time'].includes(e.recordModes.default)),
  )
})

// ── 권한 ────────────────────────────────────────────────────
test('권한: 초급만 실행하고 중급·고급·미확인·무효 값은 두 모드 모두 거부한다(아무 결과도 만들지 않는다)', () => {
  assert.equal(run({}).ok, true)
  assert.equal(run({ mode: 'selected', selectedExerciseIds: ['4'] }).ok, true)
  for (const [tier, code] of [
    ['intermediate', 'tierNotBeginner'],
    ['advanced', 'tierNotBeginner'],
    [null, 'tierUnknown'],
    [undefined, 'tierUnknown'],
    ['mid', 'tierInvalid'],
    [1, 'tierInvalid'],
  ]) {
    for (const over of [{}, { mode: 'selected', selectedExerciseIds: ['4'] }]) {
      const r = run({ exerciseTier: tier, ...over })
      assert.equal(r.ok, false, String(tier))
      assert.deepEqual(
        plain(r.failures),
        [{ code, field: 'tier' }],
        String(tier),
      )
      assert.equal('plan' in r, false)
    }
  }
})

test('권한 분리: 엔진은 식단 이해도·AI 이용 권한·PIN 보호 목표·저장소를 쓰지 않고 AI 플랜 권한 정책은 그대로다', () => {
  for (const name of ['engine.ts', 'rules.ts', 'access.ts']) {
    const code = readFileSync(
      new URL(`../src/exercise/recommend/${name}`, import.meta.url),
      'utf8',
    )
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(
      code,
      /entitlements|getExercisePlanAccess|exercise-goal|\.meal\b|trial|체험/,
      name,
    )
    assert.doesNotMatch(
      code,
      /indexedDB|localStorage|sessionStorage|fetch\(|Math\.random|Date\.now|new Date/,
      name,
    )
  }
  // 기존 v5.0 AI 운동 플랜 이용 권한(유료/체험)은 변하지 않았다.
  assert.equal(Entitlements.getExercisePlanAccess('free'), 'trial')
  assert.equal(Entitlements.getExercisePlanAccess('exercise'), 'paid')
  assert.equal(Entitlements.getExercisePlanAccess('full'), 'paid')
  assert.equal(Entitlements.getExercisePlanAccess('meal'), 'unspecified')
})

test('입력·카탈로그 실패: 잘못된 입력은 검증 실패를 그대로, 카탈로그가 비면 catalogUnavailable, 후보가 없으면 noCandidates', () => {
  const failed = run({ purpose: 'bulk', availableMinutes: 3 })
  assert.equal(failed.ok, false)
  assert.deepEqual(failed.failures.map((f) => f.code).sort(), [
    'minutesInvalid',
    'purposeInvalid',
  ])
  assert.deepEqual(
    plain(run({}, { exercises: [], evidence: source.evidence }).failures),
    [{ code: 'catalogUnavailable' }],
  )
  // 중량 운동만 있는 카탈로그 → 자동 모드는 후보 없음
  const weightOnly = catalog
    .getAllExercises()
    .filter((e) => e.recordModes.default === 'weight_reps')
  assert.deepEqual(
    plain(
      run({}, { exercises: weightOnly, evidence: source.evidence }).failures,
    ),
    [{ code: 'noCandidates' }],
  )
})

// ── 전체 자동 추천 ──────────────────────────────────────────
test('자동 추천 10·20·30분: 시간대별 개수 상한 이하이고 상한 안에서 시간은 추정치다(30분에 13개가 아니라 최대 5개)', () => {
  const counts = {}
  for (const minutes of [10, 20, 30]) {
    const plan = planOf({ availableMinutes: minutes })
    counts[minutes] = plan.items.length
    assert.equal(plan.mode, 'automatic')
    assert.equal(plan.isEstimate, true)
    assert.equal(plan.limitSeconds, minutes * 60)
    assert.ok(plan.estimatedTotalSeconds <= plan.limitSeconds, `${minutes}분`)
    assert.equal(plan.confirmable, true)
    assert.deepEqual([...plan.blockers], [])
    assert.deepEqual([...plan.unsupported], [])
    assert.equal(plan.overtime, null)
    assert.ok(plan.items.every((i) => i.reason === 'purposeFit'))
  }
  assert.deepEqual(counts, { 10: 3, 20: 4, 30: 5 }) // 현재 시드 기준 회귀 고정
  // 5분: 한 개 이상 만들 수 있고 상한(시간·개수)을 넘지 않는다.
  const tiny = planOf({ availableMinutes: 5 })
  assert.ok(
    tiny.items.length >= 1 &&
      tiny.items.length <= 3 &&
      tiny.estimatedTotalSeconds <= 300,
  )
})

test('운동 개수 상한: 5·10·11·20·21·30·31·60·61·180분 경계에서 상한을 넘지 않고, 시간·후보가 충분하면 상한까지만 추천한다', () => {
  const table = [
    [5, 3],
    [10, 3],
    [11, 4],
    [20, 4],
    [21, 5],
    [30, 5],
    [31, 6],
    [60, 6],
    [61, 8],
    [180, 8],
  ]
  for (const [minutes, cap] of table) {
    assert.equal(Rules.maxAutoExercises(minutes), cap, `${minutes}분 상한`)
    for (const tools of [['맨몸'], ['맨몸', '밴드']]) {
      for (const purpose of Rules.PLAN_PURPOSES) {
        for (const rotation of [0, 1, 4]) {
          const plan = planOf({
            availableMinutes: minutes,
            tools,
            purpose,
            rotation,
          })
          assert.ok(
            plan.items.length <= cap,
            `${minutes}분 ${plan.items.length}개`,
          )
          assert.ok(plan.estimatedTotalSeconds <= minutes * 60)
          // 상한을 채우려고 세트를 늘리지 않는다
          assert.ok(
            plan.items.every((i) => i.sets.length === ruleOf(i).sets.default),
          )
          if (minutes >= 10)
            assert.equal(plan.items.length, cap, `${minutes}분`) // 후보·시간이 충분한 현재 시드
        }
      }
    }
  }
  // 5분은 시간 때문에 상한(3)보다 적게 추천한다(상한을 채우려고 시간을 넘기지 않는다)
  assert.equal(planOf({ availableMinutes: 5 }).items.length, 2)
  // 시간이 아무리 넉넉해도 8개를 넘지 않고, 후보를 모두 쓰지 않는다
  const big = planOf({ availableMinutes: 180, tools: ['맨몸', '밴드'] })
  assert.equal(big.items.length, 8)
  assert.ok(big.estimatedTotalSeconds < big.limitSeconds / 4)
  // 상한 표 자체
  assert.deepEqual(plain(Rules.AUTO_EXERCISE_CAPS), [
    { maxMinutes: 10, maxExercises: 3 },
    { maxMinutes: 20, maxExercises: 4 },
    { maxMinutes: 30, maxExercises: 5 },
    { maxMinutes: 60, maxExercises: 6 },
    { maxMinutes: 180, maxExercises: 8 },
  ])
  for (const bad of [4, 181, 10.5, Number.NaN, '20', null]) {
    assert.throws(() => Rules.maxAutoExercises(bad), RangeError, String(bad))
  }
  // 직접 선택에는 개수 상한이 없다: 5분에 맨몸 후보 20개를 모두 선택해도 운동은 그대로 유지된다.
  const all = bodyweightIds()
  assert.ok(all.length > 8)
  assert.equal(selected(all, { availableMinutes: 5 }).items.length, all.length)
  assert.equal(
    selected(all, { availableMinutes: 180 }).items.length,
    all.length,
  )
})

test('운동 순서: 시작 운동 → 주요 운동 → 마무리 운동(자동 추천), 시작·마무리는 상한 4 이상일 때 각각 하나까지', () => {
  const rank = { warmup: 0, main: 1, cooldown: 2 }
  for (const minutes of [11, 20, 30, 60, 180]) {
    for (const rotation of [0, 1, 2, 5]) {
      for (const purpose of Rules.PLAN_PURPOSES) {
        const plan = planOf({
          availableMinutes: minutes,
          rotation,
          purpose,
          tools: ['맨몸', '밴드'],
        })
        const roles = plan.items.map((i) => i.role)
        // 시작이 있으면 맨 앞, 마무리가 있으면 맨 뒤, 사이는 모두 주요
        assert.deepEqual(
          [...roles].sort((a, b) => rank[a] - rank[b]),
          roles,
          `${minutes}분 ${roles}`,
        )
        assert.equal(roles.filter((r) => r === 'warmup').length, 1)
        assert.equal(roles.filter((r) => r === 'cooldown').length, 1)
        assert.equal(roles[0], 'warmup')
        assert.equal(roles[roles.length - 1], 'cooldown')
        assert.ok(roles.filter((r) => r === 'main').length >= 2)
      }
    }
  }
  // 10분 이하(상한 3)는 주요 운동만 구성한다.
  for (const minutes of [5, 10]) {
    assert.ok(
      planOf({ availableMinutes: minutes }).items.every(
        (i) => i.role === 'main',
      ),
      `${minutes}분`,
    )
  }
  // 시작 운동은 제자리 걷기, 마무리는 맨몸 스트레칭(시간형)
  const plan = planOf({ availableMinutes: 20 })
  assert.equal(plan.items[0].exerciseId, '28')
  assert.equal(
    catalog.getExerciseById(plan.items[plan.items.length - 1].exerciseId)
      .targetMuscles[0],
    '스트레칭',
  )
  // 개수는 상한 안(시작·마무리 포함)이다
  assert.equal(plan.items.length, 4)
})

test('운동 역할: 카탈로그 메타데이터(부위 분류·규칙)와 설명 문구로만 판정하고 이름으로 추측하지 않으며 근거가 없으면 주요 운동이다', () => {
  const roleOf = (e) => {
    const c = Rules.classifyExercise(e, {
      tools: Taxonomy.TOOLS,
      evidence: source.evidence,
    })
    return c.eligible ? Rules.planRoleOf(e, c.rule) : null
  }
  const roles = eligible.map((e) => [e.id, roleOf(e)])
  assert.deepEqual(
    roles.filter(([, r]) => r === 'warmup').map(([id]) => id),
    ['28'],
  )
  assert.deepEqual(
    roles
      .filter(([, r]) => r === 'cooldown')
      .map(([id]) => id)
      .sort(),
    ['31', '98', '99'],
  )
  assert.equal(roles.filter(([, r]) => r === 'main').length, 24)
  // 이름만 바꾼 복제본은 역할이 바뀌지 않는다(이름으로 추측하지 않는다)
  const plank = catalog.getExerciseById('22')
  assert.equal(
    roleOf({ ...plank, name: '워밍업 스트레칭 마무리 플랭크' }),
    'main',
  )
  const walk = catalog.getExerciseById('28')
  assert.equal(roleOf({ ...walk, name: '메인 운동' }), 'warmup') // 이름이 달라도 메타데이터·설명이 같으면 같은 역할
  // 설명에 근거 문구가 없으면 같은 분류여도 주요 운동이다
  assert.equal(
    roleOf({ ...walk, summary: '제자리에서 걷는 운동입니다.' }),
    'main',
  )
  assert.equal(roleOf({ ...walk, summary: undefined }), 'main')
  // 스트레칭 분류가 아니면 이름이 스트레칭이어도 주요 운동이다
  assert.equal(roleOf({ ...plank, name: '플랭크 스트레칭' }), 'main')
  assert.deepEqual(
    plain(Object.fromEntries(Object.entries(Rules.PLAN_ROLE_LABEL))),
    { warmup: '시작 운동', main: '주요 운동', cooldown: '마무리 운동' },
  )
})

test('역할별 후보가 모자라도 정상 추천: 시작·마무리가 없으면 건너뛰고 주요 운동만으로 구성한다(실패하지 않는다)', () => {
  const only = (pred) => eligible.filter(pred)
  const isRole = (role) => (e) => {
    const c = Rules.classifyExercise(e, {
      tools: Taxonomy.TOOLS,
      evidence: source.evidence,
    })
    return Rules.planRoleOf(e, c.rule) === role
  }
  const mainsOnly = only(isRole('main'))
  const noWarm = only((e) => !isRole('warmup')(e))
  const noCool = only((e) => !isRole('cooldown')(e))
  const withSrc = (exercises) => ({ exercises, evidence: source.evidence })
  const a = planOf(
    { availableMinutes: 30, tools: ['맨몸', '밴드'] },
    withSrc(mainsOnly),
  )
  assert.ok(a.items.every((i) => i.role === 'main'))
  assert.equal(a.items.length, 5) // 상한 5까지 주요 운동으로 구성
  const b = planOf(
    { availableMinutes: 30, tools: ['맨몸', '밴드'] },
    withSrc(noWarm),
  )
  assert.deepEqual(
    [b.items[0].role, b.items[b.items.length - 1].role],
    ['main', 'cooldown'],
  )
  assert.equal(b.items.length, 5)
  const c = planOf(
    { availableMinutes: 30, tools: ['맨몸', '밴드'] },
    withSrc(noCool),
  )
  assert.deepEqual(
    [c.items[0].role, c.items[c.items.length - 1].role],
    ['warmup', 'main'],
  )
  assert.equal(c.items.length, 5)
  for (const plan of [a, b, c]) assert.equal(plan.confirmable, true)
})

test('직접 선택: 순서를 바꾸지 않는다 — 마무리 운동을 맨 앞에, 시작 운동을 중간에 둬도 선택 순서 그대로이고 역할은 정보일 뿐이다', () => {
  const ids = ['98', '4', '28', '22', '31']
  const plan = selected(ids, { availableMinutes: 30 })
  assert.deepEqual(
    plan.items.map((i) => i.exerciseId),
    ids,
  )
  assert.deepEqual(
    plan.items.map((i) => i.role),
    ['cooldown', 'main', 'warmup', 'main', 'cooldown'],
  )
  assert.equal(plan.confirmable, true)
  // 직접 선택에는 개수 상한이 없고(6개 이상 허용) 순서도 그대로
  const many = ['4', '16', '13', '22', '98', '28', '23', '25']
  assert.deepEqual(
    selected(many, { availableMinutes: 60 }).items.map((i) => i.exerciseId),
    many,
  )
})

test('자동 추천: 모든 항목은 쓸 수 있는 운동이고 규칙 범위 안의 수치만 쓴다(중량·복합·근거 없는 수치 없음)', () => {
  const eligibleIds = new Set(eligible.map((e) => e.id))
  for (const purpose of Rules.PLAN_PURPOSES) {
    for (const minutes of [10, 20, 30, 180]) {
      const plan = planOf({
        purpose,
        availableMinutes: minutes,
        tools: ['맨몸', '밴드'],
      })
      assert.equal(
        new Set(plan.items.map((i) => i.exerciseId)).size,
        plan.items.length,
      ) // 중복 없음
      for (const item of plan.items) {
        assert.ok(eligibleIds.has(item.exerciseId))
        const rule = ruleOf(item)
        const exercise = catalog.getExerciseById(item.exerciseId)
        assert.equal(item.recordType, rule.recordType)
        assert.ok(['reps', 'time'].includes(item.recordType))
        assert.ok(
          item.sets.length >= rule.sets.min &&
            item.sets.length <= rule.sets.max,
        )
        assert.ok(item.sets.length >= 1)
        assert.equal(item.restSeconds, rule.restSeconds.default)
        for (const set of item.sets) {
          if (item.recordType === 'reps') {
            // 횟수형에는 시간 목표를 주지 않는다.
            assert.deepEqual(Object.keys(set), ['reps'])
            assert.ok(
              set.reps >= rule.target.min && set.reps <= rule.target.max,
            )
          } else {
            assert.deepEqual(Object.keys(set), ['targetSeconds'])
            assert.ok(
              set.targetSeconds >= rule.target.min &&
                set.targetSeconds <= rule.target.max,
            )
          }
        }
        // 중량 목표·중량 운동 없음
        assert.ok(!('weightKg' in item.sets[0]))
        assert.notEqual(exercise.recordModes.default, 'weight_reps')
        assert.notEqual(exercise.recordModes.default, 'weight_time')
        assert.equal(item.name, exercise.name)
        assert.equal(item.category, exercise.category)
      }
    }
  }
})

test('자동 추천: 세트 수는 규칙 기본값 그대로이며 시간을 채우려고 늘리지 않는다', () => {
  for (const minutes of [5, 10, 20, 30, 180]) {
    const plan = planOf({ availableMinutes: minutes, tools: ['맨몸', '밴드'] })
    for (const item of plan.items) {
      assert.equal(
        item.sets.length,
        ruleOf(item).sets.default,
        `${minutes}분 ${item.name}`,
      )
    }
  }
})

test('자동 추천: 도구 — 맨몸만이면 맨몸 운동만, 밴드를 고르면 밴드 운동이 들어갈 수 있다', () => {
  for (const rotation of [0, 1, 2, 3, 4, 5]) {
    const bodyOnly = planOf({ availableMinutes: 60, tools: ['맨몸'], rotation })
    assert.ok(
      bodyOnly.items.every((i) =>
        catalog
          .getExerciseById(i.exerciseId)
          .equipment.every((t) => t === '맨몸'),
      ),
    )
  }
  const usesBand = [0, 1, 2, 3, 4, 5].some((rotation) =>
    planOf({
      availableMinutes: 60,
      tools: ['맨몸', '밴드'],
      rotation,
    }).items.some((i) =>
      catalog.getExerciseById(i.exerciseId).equipment.includes('밴드'),
    ),
  )
  assert.equal(usesBand, true)
  // 쓸 수 없는 도구(덤벨·폼롤러·마사지볼·풀업 바)를 골라도 결과가 달라지지 않는다(그 도구의 운동은 자동 구성 대상이 아니다)
  for (const minutes of [10, 30, 180]) {
    assert.deepEqual(
      plain(planOf({ availableMinutes: minutes, tools: ['맨몸', '밴드'] })),
      plain(
        planOf({
          availableMinutes: minutes,
          tools: ['맨몸', '밴드', '덤벨', '폼롤러', '마사지볼', '풀업 바'],
        }),
      ),
    )
  }
})

test('자동 추천: 후보가 모자라면 안내(limitedCandidates)하고 모자란 채로 구성한다(규칙을 완화하지 않는다)', () => {
  // 주요 운동 후보가 2개뿐인 카탈로그: 30분 상한(5개)을 채우지 못한다
  const few = eligible.filter((e) =>
    ['4', '16', '22', '28', '31'].includes(e.id),
  )
  const plan = planOf(
    { availableMinutes: 30 },
    { exercises: few, evidence: source.evidence },
  )
  assert.equal(plan.items.length, 5)
  const mains = plan.items.filter((i) => i.role === 'main')
  assert.equal(mains.length, 3)
  const tooFew = eligible.filter((e) => ['4', '28', '31'].includes(e.id))
  const limited = planOf(
    { availableMinutes: 30 },
    { exercises: tooFew, evidence: source.evidence },
  )
  assert.deepEqual(
    limited.items.map((i) => i.role),
    ['warmup', 'main', 'cooldown'],
  )
  assert.ok(limited.warnings.some((w) => w.code === 'limitedCandidates'))
  assert.equal(limited.confirmable, true)
  assert.ok(
    limited.items.every((i) => i.sets.length === ruleOf(i).sets.default),
  )
  // 후보가 충분하면 안내가 없다
  assert.ok(
    !planOf({ availableMinutes: 30 }).warnings.some(
      (w) => w.code === 'limitedCandidates',
    ),
  )
  assert.ok(
    !planOf({ availableMinutes: 180 }).warnings.some(
      (w) => w.code === 'limitedCandidates',
    ),
  )
})

test('목표별 구성: 주요 운동은 목표의 우선 분류 순서로 시작하고(UX 정책) 안전 규칙은 같다', () => {
  for (const purpose of Rules.PLAN_PURPOSES) {
    const firstMainCategory = Rules.PURPOSE_CATEGORY_PRIORITY[purpose].find(
      (c) => c !== '전신',
    )
    for (const minutes of [10, 20, 60]) {
      const plan = planOf({ purpose, availableMinutes: minutes })
      assert.equal(plan.purpose, purpose)
      const firstMain = plan.items.find((i) => i.role === 'main')
      assert.equal(
        firstMain.category,
        firstMainCategory,
        `${purpose} ${minutes}분`,
      )
    }
  }
  // 목표가 달라도 같은 후보 풀·같은 수치 규칙이다(결과가 달라져야 한다고 강제하지 않는다).
  for (const purpose of Rules.PLAN_PURPOSES) {
    const plan = planOf({ purpose, availableMinutes: 60 })
    assert.ok(plan.items.every((i) => i.sets.length === ruleOf(i).sets.default))
  }
  assert.notEqual(
    key(planOf({ purpose: 'learn' })),
    key(planOf({ purpose: 'maintain' })),
  )
})

test('자동 추천: 부위가 분산된다(후보가 충분하면 한 분류가 70% 이상이 되지 않는다)', () => {
  for (const purpose of Rules.PLAN_PURPOSES) {
    for (const minutes of [10, 20, 30]) {
      const plan = planOf({ purpose, availableMinutes: minutes })
      assert.ok(
        !plan.warnings.some((w) => w.code === 'bodyPartSkew'),
        `${purpose} ${minutes}`,
      )
      const cats = plan.items.map((i) => i.category)
      assert.ok(
        new Set(cats).size >= 3,
        `${purpose} ${minutes}: ${[...new Set(cats)]}`,
      )
    }
  }
})

// ── 시간 계산 ───────────────────────────────────────────────
test('예상 시간: 운동별 = 수행 + 세트 사이 휴식, 총 = 합 + (N−1)×전환 30초. 상한 이하', () => {
  for (const minutes of [10, 20, 30]) {
    const plan = planOf({ availableMinutes: minutes })
    for (const item of plan.items) {
      const rule = ruleOf(item)
      const perSet =
        item.recordType === 'reps'
          ? rule.target.default * 3
          : rule.target.default
      const expected =
        item.sets.length * perSet + (item.sets.length - 1) * item.restSeconds
      assert.equal(item.estimatedSeconds, expected, item.name)
      // 세트가 1개면 세트 사이 휴식이 없다
      if (item.sets.length === 1) assert.equal(item.estimatedSeconds, perSet)
    }
    const sum = plan.items.reduce((n, i) => n + i.estimatedSeconds, 0)
    assert.equal(plan.estimatedTotalSeconds, sum + (plan.items.length - 1) * 30)
    assert.ok(
      Number.isInteger(plan.estimatedTotalSeconds) &&
        plan.estimatedTotalSeconds > 0,
    )
  }
  // 운동 1개: 전환 시간 0 / N개: N−1회
  const one = selected(['4'])
  assert.equal(one.estimatedTotalSeconds, one.items[0].estimatedSeconds)
  const three = selected(['4', '22', '98'])
  assert.equal(
    three.estimatedTotalSeconds,
    three.items.reduce((n, i) => n + i.estimatedSeconds, 0) + 2 * 30,
  )
  // 걷기(1세트 60초)는 휴식 없이 60초
  const walk = selected(['28']).items[0]
  assert.deepEqual([walk.sets.length, walk.estimatedSeconds], [1, 60])
})

// ── 직접 선택 ───────────────────────────────────────────────
test('직접 선택 1·3·5개: 선택 순서와 개수를 그대로 두고 운동별 세트·목표를 자동 설정한다', () => {
  for (const ids of [['4'], ['22', '4', '98'], ['98', '16', '4', '22', '13']]) {
    const plan = selected(ids, { availableMinutes: 30 })
    assert.equal(plan.mode, 'selected')
    assert.deepEqual(
      plan.items.map((i) => i.exerciseId),
      ids,
    ) // 순서 유지
    assert.ok(plan.items.every((i) => i.reason === 'userSelected'))
    assert.deepEqual([...plan.unsupported], [])
    assert.equal(plan.confirmable, true)
    assert.ok(plan.items.every((i) => i.sets.length === ruleOf(i).sets.default)) // 시간이 넉넉하면 기본 세트
  }
  // 순서를 바꾸면 결과 순서도 바뀐다(엔진이 재정렬하지 않는다)
  assert.deepEqual(
    selected(['4', '22']).items.map((i) => i.exerciseId),
    ['4', '22'],
  )
  assert.deepEqual(
    selected(['22', '4']).items.map((i) => i.exerciseId),
    ['22', '4'],
  )
})

test('직접 선택: 중복·형식 오류는 거부하고 숫자 id·빈 선택·자동 모드의 선택 id도 거부한다', () => {
  for (const ids of [['4', '4'], [4], [''], 'x']) {
    const r = run({ mode: 'selected', selectedExerciseIds: ids })
    assert.equal(r.ok, false, JSON.stringify(ids))
    assert.deepEqual(plain(r.failures), [
      { code: 'selectionInvalid', field: 'selectedExerciseIds' },
    ])
  }
  assert.deepEqual(
    plain(run({ mode: 'selected', selectedExerciseIds: [] }).failures),
    [{ code: 'selectionRequired', field: 'selectedExerciseIds' }],
  )
  assert.equal(run({ mode: 'automatic', selectedExerciseIds: ['4'] }).ok, false)
})

test('직접 선택: 구성할 수 없는 운동(중량·초급 아님·근거 없음·도구 불일치·없는 id)은 사유와 함께 돌려주고 확정을 막는다', () => {
  const notBeginner = catalog
    .getAllExercises()
    .find(
      (e) =>
        e.difficulty !== '초급' &&
        ['reps', 'time'].includes(e.recordModes.default),
    )
  const plan = selected([
    '4',
    '87',
    notBeginner.id,
    '1',
    '75',
    '103',
    '999',
    '22',
  ])
  assert.equal(plan.confirmable, false)
  assert.ok(plan.blockers.includes('noBasisForSelection'))
  assert.deepEqual(
    plain(plan.unsupported.map((u) => [u.index, u.exerciseId, u.reason])),
    [
      [1, '87', 'weightExercise'],
      [2, notBeginner.id, 'notBeginnerDifficulty'],
      [3, '1', 'toolUnavailable'], // 밴드 로우: 밴드를 고르지 않았다
      [4, '75', 'noExerciseEvidence'],
      [5, '103', 'noRuleGroup'],
      [6, '999', 'notFound'],
    ],
  )
  assert.equal(plan.unsupported.find((u) => u.exerciseId === '999').name, null)
  assert.equal(
    plan.unsupported.find((u) => u.exerciseId === '87').name,
    '덤벨 수트케이스 캐리',
  )
  // 나머지 운동은 순서대로 계산해 보여 주지만 "확정 가능"으로 위장하지 않는다.
  assert.deepEqual(
    plan.items.map((i) => i.exerciseId),
    ['4', '22'],
  )
  // 선택한 운동은 하나도 사라지지 않는다(구성 가능 + 구성 불가 = 선택 전체)
  assert.equal(plan.items.length + plan.unsupported.length, 8)
  // 경고 코드
  const codes = plan.warnings.map((w) => `${w.code}#${w.exerciseId ?? ''}`)
  for (const expected of [
    'weightExercise#87',
    'toolMismatch#1',
    'noBasis#75',
    'noBasis#999',
  ]) {
    assert.ok(codes.includes(expected), expected)
  }
  // 모두 구성할 수 없으면 항목이 비고 확정 불가
  const none = selected(['87', '75'])
  assert.deepEqual([none.items.length, none.confirmable], [0, false])
  assert.deepEqual([...none.blockers], ['noBasisForSelection'])
})

test('직접 선택: 도구 불일치는 밴드를 고르면 해소된다(맨몸은 항상 가능)', () => {
  assert.equal(selected(['1']).confirmable, false)
  const withBand = selected(['1', '4'], { tools: ['밴드'] })
  assert.equal(withBand.confirmable, true)
  assert.deepEqual(
    withBand.items.map((i) => i.exerciseId),
    ['1', '4'],
  )
})

test('직접 선택 시간 초과: 먼저 세트를 줄이고, 최소 세트로도 넘으면 운동을 지우지 않고 초과 정보와 확정 불가를 돌려준다', () => {
  // 1) 5개를 10분에 — 기본 세트로는 넘지만 세트를 줄이면 들어간다
  const ids = ['4', '16', '13', '22', '98']
  const defaults = selected(ids, { availableMinutes: 30 }).estimatedTotalSeconds
  assert.ok(defaults > 600)
  const fit = selected(ids, { availableMinutes: 10 })
  assert.ok(fit.estimatedTotalSeconds <= 600)
  assert.equal(fit.confirmable, true)
  assert.equal(fit.overtime, null)
  assert.deepEqual(
    fit.items.map((i) => i.exerciseId),
    ids,
  ) // 운동 유지
  assert.ok(fit.items.some((i) => i.sets.length < ruleOf(i).sets.default)) // 세트가 줄었다
  assert.ok(
    fit.items.every(
      (i) => i.sets.length >= ruleOf(i).sets.min && i.sets.length >= 1,
    ),
  )
  // 세트를 줄이는 순서: 가장 많은 세트를 가진 운동 중 뒤쪽부터
  const last = fit.items[fit.items.length - 1]
  assert.equal(last.sets.length, 1)
  assert.equal(fit.items[0].sets.length, 2)

  // 2) 쓸 수 있는 맨몸 운동 20개를 5분에 — 최소 세트로도 초과
  const all = bodyweightIds()
  const over = selected(all, { availableMinutes: 5 })
  assert.equal(over.confirmable, false)
  assert.ok(over.blockers.includes('timeInfeasible'))
  assert.deepEqual(
    over.items.map((i) => i.exerciseId),
    all,
  ) // 한 개도 지우지 않는다
  assert.ok(over.items.every((i) => i.sets.length === ruleOf(i).sets.min))
  assert.ok(over.overtime !== null)
  assert.equal(over.overtime.limitSeconds, 300)
  assert.equal(over.overtime.minimumTotalSeconds, over.estimatedTotalSeconds)
  assert.equal(over.overtime.excessSeconds, over.estimatedTotalSeconds - 300)
  assert.equal(
    over.overtime.minutesNeeded,
    Math.ceil(over.estimatedTotalSeconds / 60),
  )
  // 앞에서부터 몇 개까지 들어가는지: 그 개수는 들어가고 한 개 더 넣으면 넘는다
  const k = over.overtime.fitsExerciseCount
  const total = (n) => Rules.estimateTotalSeconds(over.items.slice(0, n))
  assert.ok(total(k) <= 300 && total(k + 1) > 300 && k < all.length)
  assert.ok(over.warnings.some((w) => w.code === 'overTime'))
  // 안내한 시간(minutesNeeded)으로 바꾸면 확정 가능하다
  const retry = selected(all, { availableMinutes: over.overtime.minutesNeeded })
  assert.equal(retry.confirmable, true)
  assert.equal(retry.overtime, null)
})

test('직접 선택: 어떤 경우에도 선택한 운동을 임의로 제거·교체하지 않는다(무작위 조합 검사)', () => {
  const pool = catalog.getAllExercises().map((e) => e.id)
  let seed = 12345
  const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed)
  for (let n = 0; n < 60; n++) {
    const size = 1 + (next() % 8)
    const ids = [
      ...new Set(
        Array.from({ length: size }, () => pool[next() % pool.length]),
      ),
    ]
    const minutes = [5, 10, 20, 30][next() % 4]
    const plan = selected(ids, {
      availableMinutes: minutes,
      tools: next() % 2 ? ['맨몸'] : ['맨몸', '밴드'],
    })
    const back = [
      ...plan.items.map((i) => i.exerciseId),
      ...plan.unsupported.map((u) => u.exerciseId),
    ]
    assert.deepEqual([...back].sort(), [...ids].sort(), JSON.stringify(ids))
    // 구성 가능한 항목은 선택 순서의 부분 수열이다
    const order = plan.items.map((i) => ids.indexOf(i.exerciseId))
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
    )
    if (plan.unsupported.length > 0 || plan.overtime)
      assert.equal(plan.confirmable, false)
    if (plan.confirmable)
      assert.ok(plan.estimatedTotalSeconds <= plan.limitSeconds)
  }
})

// ── 편중 안내 ───────────────────────────────────────────────
test('편중 안내: 3개 이상이고 한 큰 분류가 70% 이상일 때만, 정보 제공용이며 확정을 막지 않는다', () => {
  const detect = Rules.detectBodyPartSkew
  assert.equal(detect([]), null)
  assert.equal(detect(['하체']), null)
  assert.equal(detect(['하체', '하체']), null) // 1~2개는 제외
  assert.deepEqual(plain(detect(['하체', '하체', '하체'])), {
    category: '하체',
    ratio: 1,
  })
  assert.equal(detect(['하체', '하체', '상체']), null) // 2/3 < 70%
  assert.equal(
    detect(Array(7).fill('코어').concat(['상체', '하체', '전신'])).category,
    '코어',
  ) // 정확히 70%
  assert.equal(
    detect(Array(6).fill('코어').concat(['상체', '하체', '전신', '전신'])),
    null,
  ) // 60%
  // 직접 선택: 하체 4개 → 경고 + 확정 가능
  const skewed = selected(['16', '73', '13', '19'], { availableMinutes: 30 })
  assert.deepEqual(
    plain(skewed.warnings.filter((w) => w.code === 'bodyPartSkew')),
    [{ code: 'bodyPartSkew', category: '하체' }],
  )
  assert.equal(skewed.confirmable, true)
  assert.deepEqual([...skewed.blockers], [])
  // 1~2개는 경고 없음
  assert.ok(
    !selected(['16', '73']).warnings.some((w) => w.code === 'bodyPartSkew'),
  )
  // 자동 추천에서 후보가 한쪽뿐이어서 편중되면 숨기지 않는다
  const lowerOnly = catalog
    .getAllExercises()
    .filter((e) => e.category === '하체')
  const auto = planOf(
    { availableMinutes: 30 },
    { exercises: lowerOnly, evidence: source.evidence },
  )
  assert.ok(
    auto.warnings.some(
      (w) => w.code === 'bodyPartSkew' && w.category === '하체',
    ),
  )
  assert.equal(auto.confirmable, true) // 편중만으로 실패 처리하지 않는다
})

// ── 결정성 ──────────────────────────────────────────────────
test('결정성: 같은 입력·같은 회전값은 같은 결과이고(깊은 비교) 입력·카탈로그를 바꾸지 않는다', () => {
  const request = base({
    availableMinutes: 20,
    tools: ['맨몸', '밴드'],
    rotation: 3,
  })
  const snapshot = JSON.stringify(source.exercises)
  const a = Engine.buildBeginnerPlan(request, source)
  const b = Engine.buildBeginnerPlan(request, source)
  assert.deepEqual(plain(a), plain(b))
  assert.equal(JSON.stringify(source.exercises), snapshot)
  // 새로 만든 카탈로그 소스로도 같다
  assert.deepEqual(
    plain(Engine.buildBeginnerPlan(request, Engine.createPlanSource(catalog))),
    plain(a),
  )
  // 직접 선택도 같다
  const sel = base({ mode: 'selected', selectedExerciseIds: ['4', '22', '98'] })
  assert.deepEqual(
    plain(Engine.buildBeginnerPlan(sel, source)),
    plain(Engine.buildBeginnerPlan(sel, source)),
  )
})

test('재추천: 회전값을 바꾸면 가능한 범위에서 다른 조합이 나오고, 개수 상한·순서 정책 때문에 모두 같아지지 않으며 후보가 모자라면 같은 결과를 허용한다', () => {
  for (const minutes of [10, 20, 30, 60]) {
    const keys = new Set()
    for (let r = 0; r < 6; r++) {
      keys.add(
        key(
          planOf({
            availableMinutes: minutes,
            tools: ['맨몸', '밴드'],
            rotation: r,
          }),
        ),
      )
    }
    assert.ok(keys.size >= 4, `${minutes}분: 서로 다른 조합 ${keys.size}개`)
  }
  // 맨몸만이어도 회전값으로 달라진다
  const bodyKeys = new Set()
  for (let r = 0; r < 6; r++)
    bodyKeys.add(key(planOf({ availableMinutes: 20, rotation: r })))
  assert.ok(bodyKeys.size >= 3)
  // 후보가 모자라면(주요 2개 · 시작 1개 · 마무리 1개) 같은 결과를 허용한다
  const few = eligible.filter((e) => ['4', '16', '28', '31'].includes(e.id))
  const same = new Set()
  for (let r = 0; r < 5; r++) {
    same.add(
      key(
        planOf(
          { availableMinutes: 30, rotation: r },
          { exercises: few, evidence: source.evidence },
        ),
      ),
    )
  }
  assert.ok(same.size <= 2) // 순서만 회전될 수 있고 운동 집합은 같다
  // 회전값이 커도 안전 규칙·개수 상한은 같다
  for (const r of [0, 1, 7, 100, 12345]) {
    const plan = planOf({ rotation: r, availableMinutes: 20 })
    assert.ok(plan.items.length <= 4)
    assert.ok(plan.estimatedTotalSeconds <= plan.limitSeconds)
    assert.ok(plan.items.every((i) => i.sets.length === ruleOf(i).sets.default))
  }
  // 직접 선택은 회전값과 무관하게 같은 결과(선택 순서 유지)
  const ids = ['4', '22', '98']
  assert.deepEqual(
    plain(selected(ids, { rotation: 0 })),
    plain(selected(ids, { rotation: 9 })),
  )
  // 잘못된 회전값은 거부
  for (const rotation of [-1, 1.5, '1', null])
    assert.equal(run({ rotation }).ok, false)
})

// ── 안내 문구·계약 ──────────────────────────────────────────
test('안내 문구: 경고·추천 불가 사유·추천 이유에 한국어 문구가 있고 내부 코드명을 노출하지 않는다', () => {
  const warningCodes = [
    'overTime',
    'bodyPartSkew',
    'toolMismatch',
    'noBasis',
    'weightExercise',
    'limitedCandidates',
  ]
  const messages = [
    ...warningCodes.map(Rules.describePlanWarning),
    ...[
      'notFound',
      'weightExercise',
      'notBeginnerDifficulty',
      'noRuleGroup',
      'noExerciseEvidence',
      'toolUnavailable',
    ].map(Rules.describeUnsupportedReason),
    Rules.describeItemReason('purposeFit'),
    Rules.describeItemReason('userSelected'),
  ]
  for (const m of messages) {
    assert.match(m, /[가-힣]/)
    assert.doesNotMatch(
      m,
      /weight_reps|weight_time|time_reps|\breps\b|recordType|tier/,
    )
  }
  // 같은 뜻의 문구는 경고와 추천 불가 사유가 같을 수 있으므로, 같은 목록 안에서만 겹치지 않는지 본다.
  const unique = (list) => new Set(list).size === list.length
  assert.ok(unique(warningCodes.map(Rules.describePlanWarning)))
  assert.ok(
    unique(
      [
        'notFound',
        'weightExercise',
        'notBeginnerDifficulty',
        'noRuleGroup',
        'noExerciseEvidence',
        'toolUnavailable',
      ].map(Rules.describeUnsupportedReason),
    ),
  )
})

test('결과 계약: P2-3이 WorkoutDraft로 바꿀 수 있는 필드(문자열 id·저장 코드·세트 목표)를 갖고 휴식은 표시용으로만 담는다', () => {
  const plan = planOf({ availableMinutes: 20 })
  assert.deepEqual(
    Object.keys(plan).sort(),
    [
      'availableMinutes',
      'blockers',
      'confirmable',
      'estimatedTotalSeconds',
      'isEstimate',
      'items',
      'limitSeconds',
      'mode',
      'overtime',
      'purpose',
      'unsupported',
      'warnings',
    ].sort(),
  )
  for (const item of plan.items) {
    assert.equal(typeof item.exerciseId, 'string')
    assert.ok(['warmup', 'main', 'cooldown'].includes(item.role))
    assert.ok(['reps', 'time'].includes(item.recordType))
    assert.ok(
      Number.isInteger(item.restSeconds) &&
        Number.isInteger(item.estimatedSeconds),
    )
    assert.ok(item.sets.every((s) => Object.keys(s).length === 1))
  }
  // 자동 추천 항목은 기존 W11 검증 규칙(초안 검증)을 통과하는 모양이다(P2-3이 변환): 시간 1~3600초, 횟수 1 이상 정수
  for (const item of plan.items) {
    for (const s of item.sets) {
      if (item.recordType === 'time')
        assert.ok(s.targetSeconds >= 1 && s.targetSeconds <= 3600)
      else assert.ok(Number.isInteger(s.reps) && s.reps >= 1)
    }
  }
})

// ── 회귀 ────────────────────────────────────────────────────
test('회귀: 엔진은 시드를 바꾸지 않는다 — 105종·33개 루틴·99항목·기록 방식 분포·5종 기록 방식 유지', () => {
  const exercises = catalog.getAllExercises()
  const before = JSON.stringify(exercises)
  planOf({ availableMinutes: 30, tools: ['맨몸', '밴드'] })
  selected(['4', '22'])
  assert.equal(JSON.stringify(catalog.getAllExercises()), before)
  assert.equal(exercises.length, 105)
  assert.equal(catalog.getAllRoutines().length, 33)
  assert.equal(
    catalog
      .getAllRoutines()
      .reduce((n, r) => n + catalog.getRoutineItems(r.id).length, 0),
    99,
  )
  const count = (mode) =>
    exercises.filter((e) => e.recordModes.default === mode).length
  assert.deepEqual(
    ['reps', 'time', 'weight_reps', 'weight_time', 'time_reps'].map(count),
    [58, 23, 23, 1, 0],
  )
  const files = readFileSync(
    new URL('../src/exercise/recordMode.ts', import.meta.url),
    'utf8',
  )
  assert.match(
    files,
    /RUNNABLE_RECORD_TYPES[^=]*=\s*\[\s*'time',\s*'reps',\s*'weight',\s*'time_reps',\s*'weight_time',?\s*\]/,
  )
})
