import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// S7 P2-1: 초급 전용 맞춤 운동 구성의 권한·입력 검증·수치 규칙·운동별 판정. 추천 목록 생성(엔진)은 이 단계에 없다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Access
let Rules
let Evidence
let Flow
let Seed
let Taxonomy
let catalog
let evidence

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Access = await server.ssrLoadModule('/src/exercise/recommend/access.ts')
  Rules = await server.ssrLoadModule('/src/exercise/recommend/rules.ts')
  Flow = await server.ssrLoadModule('/src/exercise/recommend/planFlow.ts')
  Evidence = await server.ssrLoadModule(
    '/src/exercise/recommend/ruleEvidence.ts',
  )
  Seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  Taxonomy = await server.ssrLoadModule('/src/exercise/exerciseTaxonomy.ts')
  catalog = Seed.getSeedCatalog()
  evidence = Rules.collectBeginnerEvidence(catalog)
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const RECOMMEND_DIR = new URL('../src/exercise/recommend/', import.meta.url)
const sourceOf = (name) => readFileSync(new URL(name, RECOMMEND_DIR), 'utf8')

const request = (over = {}) => ({
  exerciseTier: 'beginner',
  purpose: 'learn',
  availableMinutes: 20,
  tools: ['맨몸'],
  mode: 'automatic',
  ...over,
})
const failuresOf = (over) => {
  const r = Rules.validatePlanInput(request(over))
  assert.equal(r.ok, false, JSON.stringify(over))
  return r.failures.map((f) => `${f.field}:${f.code}`)
}

// ── 권한 ────────────────────────────────────────────────────
test('권한: 운동 이해도 beginner만 허용하고 중급·고급·미확인·무효 값은 막는다', () => {
  assert.deepEqual(plain(Access.checkBeginnerPlanAccess('beginner')), {
    ok: true,
    tier: 'beginner',
  })
  for (const tier of ['intermediate', 'advanced']) {
    assert.deepEqual(plain(Access.checkBeginnerPlanAccess(tier)), {
      ok: false,
      reason: 'notBeginner',
    })
  }
  for (const tier of [null, undefined]) {
    assert.deepEqual(plain(Access.checkBeginnerPlanAccess(tier)), {
      ok: false,
      reason: 'unknown',
    })
  }
  for (const tier of [
    'BEGINNER',
    'expert',
    '',
    0,
    1,
    true,
    {},
    [],
    ['beginner'],
  ]) {
    assert.deepEqual(
      plain(Access.checkBeginnerPlanAccess(tier)),
      { ok: false, reason: 'invalid' },
      JSON.stringify(tier),
    )
  }
  assert.equal(Access.canUseBeginnerPlan('beginner'), true)
  assert.equal(Access.canUseBeginnerPlan('intermediate'), false)
})

test('권한: 이해도 조회 결과는 운동 영역만 본다(식단 이해도와 독립)', () => {
  const levels = (exercise, meal) => ({
    exercise:
      exercise === null ? null : { tier: exercise, source: 'assessment' },
    meal: meal === null ? null : { tier: meal, source: 'assessment' },
  })
  const check = Access.checkBeginnerPlanAccessFromLevels
  // 식단 초급 + 운동 중급 → 거부
  assert.deepEqual(plain(check(levels('intermediate', 'beginner'))), {
    ok: false,
    reason: 'notBeginner',
  })
  // 식단 고급 + 운동 초급 → 허용
  assert.equal(check(levels('beginner', 'advanced')).ok, true)
  // 운동 미확인 + 식단 초급 → 거부(unknown)
  assert.deepEqual(plain(check(levels(null, 'beginner'))), {
    ok: false,
    reason: 'unknown',
  })
  // 조회 결과 없음
  assert.equal(check(null).ok, false)
  assert.equal(check(undefined).ok, false)
  assert.equal(check({}).ok, false)
  // 개발용 초기값(source: dev-initial)도 같은 값이면 같은 판정이다.
  assert.equal(
    check({ exercise: { tier: 'beginner', source: 'dev-initial' }, meal: null })
      .ok,
    true,
  )
  // 소스 확인: 식단 영역(meal)이나 AI 이용 권한을 읽지 않는다.
  const access = sourceOf('access.ts')
  assert.doesNotMatch(
    access.replace(/\/\*[\s\S]*?\*\//g, ''),
    /\.meal\b|entitlement/i,
  )
})

test('권한: 직접 호출 우회 방어 — assertBeginnerPlanAccess와 validatePlanInput이 같은 판정을 한다', () => {
  assert.equal(Access.assertBeginnerPlanAccess('beginner'), 'beginner')
  for (const [tier, reason] of [
    ['intermediate', 'notBeginner'],
    ['advanced', 'notBeginner'],
    [null, 'unknown'],
    ['x', 'invalid'],
  ]) {
    assert.throws(
      () => Access.assertBeginnerPlanAccess(tier),
      (error) =>
        error instanceof Access.BeginnerPlanAccessError &&
        error.reason === reason,
    )
  }
  assert.deepEqual(failuresOf({ exerciseTier: 'intermediate' }), [
    'tier:tierNotBeginner',
  ])
  assert.deepEqual(failuresOf({ exerciseTier: 'advanced' }), [
    'tier:tierNotBeginner',
  ])
  assert.deepEqual(failuresOf({ exerciseTier: null }), ['tier:tierUnknown'])
  assert.deepEqual(failuresOf({ exerciseTier: undefined }), [
    'tier:tierUnknown',
  ])
  assert.deepEqual(failuresOf({ exerciseTier: 'mid' }), ['tier:tierInvalid'])
  // 다른 입력이 모두 올바르고 권한만 없어도 통과하지 못한다
  assert.equal(
    Rules.validatePlanInput(request({ exerciseTier: 'advanced' })).ok,
    false,
  )
})

// ── 입력 검증 ───────────────────────────────────────────────
test('입력 검증: 올바른 요청은 검증된 입력으로 바뀌고 맨몸이 항상 포함된다', () => {
  const ok = Rules.validatePlanInput(
    request({ tools: ['밴드', '밴드'], rotation: 2 }),
  )
  assert.equal(ok.ok, true)
  assert.deepEqual(plain(ok.input), {
    tier: 'beginner',
    purpose: 'learn',
    availableMinutes: 20,
    tools: ['맨몸', '밴드'],
    mode: 'automatic',
    selectedExerciseIds: [],
    rotation: 2,
  })
  assert.deepEqual(
    plain(Rules.validatePlanInput(request({ tools: [] })).input.tools),
    ['맨몸'],
  )
  const selected = Rules.validatePlanInput(
    request({ mode: 'selected', selectedExerciseIds: ['4', '16'] }),
  )
  assert.deepEqual(plain(selected.input.selectedExerciseIds), ['4', '16'])
})

test('입력 검증: 목표·시간·도구·모드·선택·회전값의 잘못된 입력을 모두 거부한다', () => {
  for (const purpose of ['bulk', 'LOSE', '', null, undefined, 1]) {
    assert.deepEqual(
      failuresOf({ purpose }),
      ['purpose:purposeInvalid'],
      String(purpose),
    )
  }
  for (const availableMinutes of [
    4,
    181,
    0,
    -10,
    10.5,
    Number.NaN,
    Infinity,
    '20',
    null,
    undefined,
  ]) {
    assert.deepEqual(
      failuresOf({ availableMinutes }),
      ['availableMinutes:minutesInvalid'],
      String(availableMinutes),
    )
  }
  for (const minutes of [5, 10, 20, 30, 180]) {
    assert.equal(
      Rules.validatePlanInput(request({ availableMinutes: minutes })).ok,
      true,
    )
  }
  for (const tools of [
    undefined,
    null,
    '맨몸',
    ['덤벨벨'],
    ['맨몸', 3],
    [null],
  ]) {
    assert.deepEqual(
      failuresOf({ tools }),
      ['tools:toolsInvalid'],
      JSON.stringify(tools),
    )
  }
  for (const mode of ['auto', '', null, undefined]) {
    assert.deepEqual(
      failuresOf({ mode, selectedExerciseIds: undefined }),
      ['mode:modeInvalid'],
      String(mode),
    )
  }
  // 직접 선택: 필수·형식·중복·숫자 id 거부(id는 문자열)
  const sel = (ids) =>
    failuresOf({ mode: 'selected', selectedExerciseIds: ids })
  assert.deepEqual(sel(undefined), ['selectedExerciseIds:selectionRequired'])
  assert.deepEqual(sel([]), ['selectedExerciseIds:selectionRequired'])
  assert.deepEqual(sel(['4', '4']), ['selectedExerciseIds:selectionInvalid'])
  assert.deepEqual(sel([4, 16]), ['selectedExerciseIds:selectionInvalid'])
  assert.deepEqual(sel(['4', '']), ['selectedExerciseIds:selectionInvalid'])
  assert.deepEqual(sel('4'), ['selectedExerciseIds:selectionInvalid'])
  // 자동 모드는 선택 id를 받지 않는다
  assert.deepEqual(
    failuresOf({ mode: 'automatic', selectedExerciseIds: ['4'] }),
    ['selectedExerciseIds:selectionInvalid'],
  )
  // 회전값
  for (const rotation of [-1, 1.5, '1', null, Number.NaN]) {
    assert.deepEqual(
      failuresOf({ rotation }),
      ['rotation:rotationInvalid'],
      String(rotation),
    )
  }
  assert.equal(Rules.validatePlanInput(request({ rotation: 0 })).ok, true)
  // 여러 문제는 모두 모아 돌려준다
  assert.deepEqual(
    failuresOf({
      exerciseTier: 'advanced',
      purpose: 'x',
      availableMinutes: 1,
    }).sort(),
    [
      'availableMinutes:minutesInvalid',
      'purpose:purposeInvalid',
      'tier:tierNotBeginner',
    ].sort(),
  )
})

test('운동 가능 시간: 유효한 목표 요약 값만 초기값으로 쓰고 아니면 직접 선택(10·20·30분)이다', () => {
  assert.equal(Rules.initialAvailableMinutes(15), 15)
  assert.equal(Rules.initialAvailableMinutes(5), 5)
  assert.equal(Rules.initialAvailableMinutes(180), 180)
  for (const v of [null, undefined, 0, 4, 181, 12.5, Number.NaN]) {
    assert.equal(Rules.initialAvailableMinutes(v), null, String(v))
  }
  assert.deepEqual([...Rules.PLAN_MINUTES_PRESETS], [10, 20, 30])
  assert.ok(Rules.PLAN_MINUTES_PRESETS.every(Rules.isValidPlanMinutes))
})

// ── 수치 규칙 ───────────────────────────────────────────────
test('수치 규칙: 범위 정합성, 출처·제외·불확실성 명시, 지원 방식은 reps·time뿐이다', () => {
  assert.deepEqual(
    Rules.QUANTITY_RULES.map((r) => r.id),
    ['strength-reps', 'core-hold', 'stretch-hold', 'walk-cardio'],
  )
  for (const rule of Rules.QUANTITY_RULES) {
    assert.ok(['reps', 'time'].includes(rule.recordType), rule.id)
    for (const r of [rule.sets, rule.target, rule.restSeconds]) {
      assert.ok(
        Number.isInteger(r.min) &&
          Number.isInteger(r.default) &&
          Number.isInteger(r.max),
        rule.id,
      )
      assert.ok(r.min <= r.default && r.default <= r.max, rule.id)
    }
    assert.ok(rule.sets.min >= 1, rule.id)
    assert.ok(rule.target.min >= 1 && rule.target.max <= 3600, rule.id) // 목표 시간 1~3600초 계약
    assert.ok(rule.restSeconds.min >= 0, rule.id)
    // 개발자용 근거(출처·제외·불확실성)는 ruleEvidence.ts에 있고, 규칙 객체에는 수치만 있다.
    assert.deepEqual(
      Object.keys(rule).sort(),
      ['appliesTo', 'id', 'recordType', 'restSeconds', 'sets', 'target'],
      rule.id,
    )
    const evidence = Evidence.RULE_EVIDENCE[rule.id]
    assert.match(evidence.source, /가상 루틴/, rule.id)
    assert.match(evidence.source, /전문가 검수 자료가 아니다/, rule.id)
    assert.ok(
      evidence.exclusions.length > 0 && evidence.uncertainty.length > 0,
      rule.id,
    )
    // 적용 도구는 카탈로그 도구 이름이다
    assert.ok(
      rule.appliesTo.tools.every((t) => Taxonomy.TOOLS.includes(t)),
      rule.id,
    )
  }
  // 초기 검토값: 횟수형 2세트·8회, 시간형 1~2세트·20~60초(걷기 최대 120초는 시드 관찰값)
  const byId = Object.fromEntries(Rules.QUANTITY_RULES.map((r) => [r.id, r]))
  assert.deepEqual(
    [byId['strength-reps'].sets.default, byId['strength-reps'].target.default],
    [2, 8],
  )
  assert.deepEqual(
    [byId['core-hold'].sets.max, byId['core-hold'].target.default],
    [2, 20],
  )
  assert.equal(byId['walk-cardio'].sets.max, 1)
})

test('수치 규칙은 시드의 초급 루틴 관찰값으로 뒷받침된다: 기본값이 관찰되고 관찰값이 범위를 벗어나지 않는다', () => {
  const all = catalog.getAllExercises()
  const context = { tools: Taxonomy.TOOLS, evidence }
  for (const rule of Rules.QUANTITY_RULES) {
    const members = all.filter((e) => {
      const c = Rules.classifyExercise(e, context)
      return c.eligible && c.rule.id === rule.id
    })
    assert.ok(members.length > 0, `${rule.id}: 적용 운동 없음`)
    const observed = members.flatMap((e) => evidence.get(e.id) ?? [])
    const targetOf = (o) => (rule.recordType === 'reps' ? o.reps : o.seconds)
    assert.ok(observed.length > 0, `${rule.id}: 관찰값 없음`)
    for (const o of observed) {
      assert.ok(
        o.sets >= rule.sets.min && o.sets <= rule.sets.max,
        `${rule.id} sets ${o.sets}`,
      )
      assert.ok(
        targetOf(o) >= rule.target.min && targetOf(o) <= rule.target.max,
        `${rule.id} target ${targetOf(o)}`,
      )
      assert.ok(
        o.restSeconds >= rule.restSeconds.min &&
          o.restSeconds <= rule.restSeconds.max,
        `${rule.id} rest`,
      )
    }
    // 기본값이 관찰된 값이다
    assert.ok(
      observed.some((o) => o.sets === rule.sets.default),
      `${rule.id}: 기본 세트 미관찰`,
    )
    assert.ok(
      observed.some((o) => targetOf(o) === rule.target.default),
      `${rule.id}: 기본 목표 미관찰`,
    )
    assert.ok(
      observed.some((o) => o.restSeconds === rule.restSeconds.default),
      `${rule.id}: 기본 휴식 미관찰`,
    )
    // 범위의 양 끝: 목표·휴식은 관찰값 그대로이고, 세트 수는 위쪽(운동량을 늘리는 방향)을 관찰값 밖으로 넓히지 않는다.
    // 세트 수의 아래쪽(min)만 시간이 모자랄 때 줄이는 허용 범위로 관찰값보다 낮을 수 있다.
    const min = (pick) => Math.min(...observed.map(pick))
    const max = (pick) => Math.max(...observed.map(pick))
    assert.equal(
      max((o) => o.sets),
      rule.sets.max,
      `${rule.id} sets max`,
    )
    assert.ok(rule.sets.min <= min((o) => o.sets), `${rule.id} sets min`)
    assert.equal(min(targetOf), rule.target.min, `${rule.id} target min`)
    assert.equal(max(targetOf), rule.target.max, `${rule.id} target max`)
    assert.equal(
      min((o) => o.restSeconds),
      rule.restSeconds.min,
      `${rule.id} rest min`,
    )
    assert.equal(
      max((o) => o.restSeconds),
      rule.restSeconds.max,
      `${rule.id} rest max`,
    )
  }
})

// ── 운동별 판정(시드 전체) ─────────────────────────────────
function classifyAll(tools = Taxonomy.TOOLS) {
  return catalog.getAllExercises().map((e) => ({
    exercise: e,
    result: Rules.classifyExercise(e, { tools, evidence }),
  }))
}

test('운동 판정: 중량 운동은 모두 제외, 초급이 아닌 운동은 근거 없음으로 제외, 복합 방식으로 정해지지 않는다', () => {
  const rows = classifyAll()
  assert.equal(rows.length, 105)
  const reasons = (pred) =>
    new Set(rows.filter(pred).map((r) => r.result.reason ?? 'eligible'))
  // 기본 방식이 weight_reps·weight_time인 운동(24종)은 모두 weightExercise
  const weightRows = rows.filter((r) =>
    ['weight_reps', 'weight_time'].includes(r.exercise.recordModes.default),
  )
  assert.equal(weightRows.length, 24)
  assert.ok(
    weightRows.every(
      (r) => !r.result.eligible && r.result.reason === 'weightExercise',
    ),
  )
  // 덤벨 수트케이스 캐리(87): 허용 방식에 time이 있어도 중량 운동이라 제외
  const carry = rows.find((r) => r.exercise.id === '87')
  assert.deepEqual(plain(carry.result), {
    eligible: false,
    reason: 'weightExercise',
  })
  // 중량이 아닌 운동 중 초급이 아닌 것은 notBeginnerDifficulty
  assert.deepEqual(
    [
      ...reasons(
        (r) => !weightRows.includes(r) && r.exercise.difficulty !== '초급',
      ),
    ],
    ['notBeginnerDifficulty'],
  )
  // 자동 구성에서 쓸 수 있는 운동의 기록 방식은 reps·time뿐이고 중량 방식은 하나도 없다
  const eligible = rows.filter((r) => r.result.eligible)
  assert.ok(eligible.length > 0)
  assert.ok(
    eligible.every((r) => ['reps', 'time'].includes(r.result.recordType)),
  )
  assert.ok(
    eligible.every(
      (r) =>
        !['weight_reps', 'weight_time'].includes(
          r.exercise.recordModes.default,
        ),
    ),
  )
  assert.ok(eligible.every((r) => r.exercise.difficulty === '초급'))
})

test('운동 판정: 사용 가능 운동은 그 운동 자신의 초급 시드 근거가 있고 근거 없는 운동·이완 도구 운동은 제외된다', () => {
  const rows = classifyAll()
  const eligible = rows.filter((r) => r.result.eligible)
  for (const { exercise, result } of eligible) {
    const own = evidence.get(exercise.id) ?? []
    assert.ok(own.length > 0, `${exercise.name}: 근거 없음`)
    const field = result.recordType === 'reps' ? 'reps' : 'seconds'
    assert.ok(
      own.some((o) => o[field] !== null),
      exercise.name,
    )
  }
  const reason = (id) => {
    const r = rows.find((row) => row.exercise.id === id).result
    return r.eligible ? 'eligible' : r.reason
  }
  // 예: 밴드 스쿼트(75)는 초급 시드 항목이 없어 근거 없음, 폼롤러·마사지볼 이완 시간형은 규칙 묶음 없음
  assert.equal(reason('75'), 'noExerciseEvidence')
  assert.equal(reason('32'), 'noRuleGroup') // 폼롤러 등 상부 이완
  assert.equal(reason('105'), 'noRuleGroup') // 마사지볼 발바닥 이완
  assert.equal(reason('103'), 'noRuleGroup') // 스트레칭 부위의 횟수형
  // 근거가 있는 대표 운동
  assert.equal(reason('4'), 'eligible') // 월 푸시업
  assert.equal(reason('22'), 'eligible') // 플랭크
  assert.equal(reason('28'), 'eligible') // 제자리 걷기
  assert.equal(reason('98'), 'eligible') // 차일드 포즈
  // 점핑 잭·하이 니즈(허용 방식에 time_reps가 있는 운동)는 기본 방식(time)으로만 판정되고 복합 방식은 만들지 않는다
  for (const id of ['29', '30']) {
    const r = rows.find((row) => row.exercise.id === id).result
    if (r.eligible) assert.equal(r.recordType, 'time')
  }
})

test('운동 판정: 도구 — 맨몸은 항상 가능하고 밴드 운동은 밴드를 골랐을 때만 가능하다', () => {
  const only = (tools) =>
    classifyAll(tools)
      .filter((r) => r.result.eligible)
      .map((r) => r.exercise.id)
  const bodyweight = only(['맨몸'])
  const withBand = only(['맨몸', '밴드'])
  assert.ok(bodyweight.length > 0 && withBand.length > bodyweight.length)
  const equipOf = (id) => catalog.getExerciseById(id).equipment
  assert.ok(bodyweight.every((id) => equipOf(id).every((t) => t === '맨몸')))
  assert.ok(
    withBand.every((id) =>
      equipOf(id).every((t) => ['맨몸', '밴드'].includes(t)),
    ),
  )
  // 밴드만 있는 사용자의 맨몸 운동도 가능(맨몸은 도구가 필요 없다), 도구 목록에 맨몸이 없어도 같다
  assert.deepEqual(only([]).sort(), bodyweight.sort())
  // 밴드 운동을 밴드 없이 판정하면 toolUnavailable
  const band = catalog.getExerciseById('1') // 밴드 로우
  assert.deepEqual(
    plain(Rules.classifyExercise(band, { tools: ['맨몸'], evidence })),
    { eligible: false, reason: 'toolUnavailable' },
  )
  assert.equal(
    Rules.classifyExercise(band, { tools: ['맨몸', '밴드'], evidence })
      .eligible,
    true,
  )
})

test('도구 선택지: 자동 구성에 쓸 수 있는 운동이 있는 도구만, 맨몸이 먼저(덤벨·폼롤러·마사지볼·풀업 바는 현재 없음)', () => {
  const tools = Rules.listEligibleTools(catalog.getAllExercises(), evidence)
  assert.equal(tools[0], '맨몸')
  assert.ok(tools.includes('밴드'))
  assert.ok(tools.every((t) => Taxonomy.TOOLS.includes(t)))
  assert.ok(!tools.includes('덤벨')) // 초급 덤벨 운동은 모두 중량 운동
  assert.ok(!tools.includes('풀업 바'))
  assert.deepEqual([...Rules.PLAN_DEFAULT_TOOLS], ['맨몸'])
})

test('운동 판정: 방식 메타데이터가 없거나 지원하지 않는 방식이면 수치를 만들지 않는다', () => {
  const base = catalog.getExerciseById('4')
  const ctx = { tools: ['맨몸'], evidence }
  const without = { ...base, recordModes: undefined }
  assert.deepEqual(plain(Rules.classifyExercise(without, ctx)), {
    eligible: false,
    reason: 'noRecordModeMeta',
  })
  const composite = {
    ...base,
    recordModes: { default: 'time_reps', allowed: ['time_reps'] },
  }
  assert.deepEqual(plain(Rules.classifyExercise(composite, ctx)), {
    eligible: false,
    reason: 'unsupportedRecordMode',
  })
  const weighted = {
    ...base,
    recordModes: { default: 'weight_reps', allowed: ['weight_reps', 'reps'] },
  }
  assert.deepEqual(plain(Rules.classifyExercise(weighted, ctx)), {
    eligible: false,
    reason: 'weightExercise',
  })
  // 근거 맵이 비어 있으면 어떤 운동도 쓸 수 없다
  assert.deepEqual(
    plain(
      Rules.classifyExercise(base, { tools: ['맨몸'], evidence: new Map() }),
    ),
    { eligible: false, reason: 'noExerciseEvidence' },
  )
  // 근거가 규칙 범위를 벗어나면(예: 8회가 아닌 값) 규칙을 적용하지 않는다
  const outOfRange = new Map([
    ['4', [{ sets: 5, reps: 30, seconds: null, restSeconds: 10 }]],
  ])
  assert.deepEqual(
    plain(
      Rules.classifyExercise(base, { tools: ['맨몸'], evidence: outOfRange }),
    ),
    { eligible: false, reason: 'noExerciseEvidence' },
  )
})

test('근거 수집: 초급 루틴 항목만 모으고 시드를 바꾸지 않는다', () => {
  const routines = catalog.getAllRoutines()
  const before = JSON.stringify(
    routines.map((r) => catalog.getRoutineItems(r.id)),
  )
  const map = Rules.collectBeginnerEvidence(catalog)
  assert.equal(
    JSON.stringify(routines.map((r) => catalog.getRoutineItems(r.id))),
    before,
  )
  // 중급·고급 루틴에만 있는 운동은 근거가 없다(예: 밴드 햄스트링 스트레칭 100은 중급 루틴에만 있다)
  assert.equal(map.has('100'), false)
  // 초급 루틴 11개 × 3항목
  const total = [...map.values()].reduce((sum, list) => sum + list.length, 0)
  assert.equal(total, 33)
})

// ── 예상 시간 ───────────────────────────────────────────────
test('예상 시간: 수행 + 세트 사이 휴식 + 운동 전환(마지막 세트 뒤 휴식 없음), 추정 상수는 3초·30초', () => {
  assert.equal(Rules.ASSUMED_SECONDS_PER_REP, 3)
  assert.equal(Rules.ASSUMED_TRANSITION_SECONDS, 30)
  // 횟수형 2세트 × 8회 · 휴식 60초: 2×(8×3) + 1×60 = 108
  assert.equal(
    Rules.estimateItemSeconds({
      recordType: 'reps',
      sets: 2,
      target: 8,
      restSeconds: 60,
    }),
    108,
  )
  // 시간형 2세트 × 20초 · 휴식 60초: 2×20 + 60 = 100
  assert.equal(
    Rules.estimateItemSeconds({
      recordType: 'time',
      sets: 2,
      target: 20,
      restSeconds: 60,
    }),
    100,
  )
  // 1세트는 휴식이 없다
  assert.equal(
    Rules.estimateItemSeconds({
      recordType: 'time',
      sets: 1,
      target: 60,
      restSeconds: 30,
    }),
    60,
  )
  assert.equal(Rules.estimateTotalSeconds([]), 0)
  assert.equal(Rules.estimateTotalSeconds([{ estimatedSeconds: 108 }]), 108)
  // 운동 3개: 108 + 100 + 60 + 2×30 = 328
  assert.equal(
    Rules.estimateTotalSeconds([
      { estimatedSeconds: 108 },
      { estimatedSeconds: 100 },
      { estimatedSeconds: 60 },
    ]),
    328,
  )
  // 잘못된 입력은 시간을 만들지 않는다
  for (const bad of [
    { recordType: 'reps', sets: 0, target: 8, restSeconds: 60 },
    { recordType: 'reps', sets: 2, target: 0, restSeconds: 60 },
    { recordType: 'reps', sets: 2.5, target: 8, restSeconds: 60 },
    { recordType: 'time', sets: 2, target: 20, restSeconds: -1 },
    { recordType: 'time', sets: 2, target: Number.NaN, restSeconds: 60 },
  ]) {
    assert.throws(
      () => Rules.estimateItemSeconds(bad),
      RangeError,
      JSON.stringify(bad),
    )
  }
})

test('목표별 우선순위·편중 안내 기준: 모든 목표가 4개 큰 분류를 한 번씩 담고 목표마다 순서가 다르다', () => {
  const cats = ['상체', '하체', '코어', '전신']
  const orders = Rules.PLAN_PURPOSES.map(
    (p) => Rules.PURPOSE_CATEGORY_PRIORITY[p],
  )
  for (const order of orders)
    assert.deepEqual([...order].sort(), [...cats].sort())
  assert.equal(new Set(orders.map((o) => o.join())).size, 3)
  assert.ok(Rules.PLAN_PURPOSES.every((p) => Rules.PLAN_PURPOSE_LABEL[p]))
  assert.equal(Rules.SKEW_RATIO, 0.7)
  assert.equal(Rules.SKEW_MIN_ITEMS, 3)
})

// ── 사용자 안내·보호 ────────────────────────────────────────
test('안내 문구: 모든 실패·제외 코드에 한국어 문구가 있고 내부 기록 방식 코드명을 노출하지 않는다', () => {
  const codes = [
    'tierUnknown',
    'tierNotBeginner',
    'tierInvalid',
    'purposeInvalid',
    'minutesInvalid',
    'toolsInvalid',
    'modeInvalid',
    'selectionRequired',
    'selectionInvalid',
    'rotationInvalid',
    'catalogUnavailable',
    'noCandidates',
    'ruleMissing',
    'noBasisForSelection',
    'timeInfeasible',
  ]
  const reasons = [
    'noRecordModeMeta',
    'weightExercise',
    'unsupportedRecordMode',
    'notBeginnerDifficulty',
    'noRuleGroup',
    'noExerciseEvidence',
    'toolUnavailable',
  ]
  const messages = [
    ...codes.map(Rules.describePlanFailure),
    ...reasons.map(Rules.describeExclusion),
  ]
  for (const message of messages) {
    assert.match(message, /[가-힣]/)
    assert.doesNotMatch(
      message,
      /weight_reps|weight_time|time_reps|\breps\b|recordType|tier/,
    )
  }
  assert.equal(new Set(messages).size, messages.length) // 같은 문구 중복 없음
})

test('보호: 추천 모듈은 순수 로직이다 — 저장소·네트워크·AI 권한·PIN 보호 목표를 쓰지 않고 시드를 수정하지 않는다', () => {
  const files = readdirSync(RECOMMEND_DIR).filter((n) => n.endsWith('.ts'))
  assert.deepEqual(files.sort(), [
    'access.ts',
    'engine.ts',
    'planFlow.ts',
    'planSource.ts',
    'planStorage.ts',
    'ruleEvidence.ts',
    'rules.ts',
    'toDraft.ts',
    'types.ts',
  ]) // P2-2 engine, P2-3 toDraft, P2-4 planFlow·planStorage·planSource(화면 연결용), P3-2 ruleEvidence(개발자용 근거) 추가
  const strip = (name) =>
    sourceOf(name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
  // 순수 로직 모듈: 저장소·네트워크·AI 권한·PIN 보호 목표를 쓰지 않는다.
  for (const name of [
    'access.ts',
    'engine.ts',
    'planFlow.ts',
    'rules.ts',
    'toDraft.ts',
    'types.ts',
  ]) {
    const code = strip(name)
    assert.doesNotMatch(
      code,
      /indexedDB|localStorage|sessionStorage|fetch\(|XMLHttpRequest|WebSocket/,
      name,
    )
    assert.doesNotMatch(
      code,
      /entitlements|getExercisePlanAccess|exercise-goal|getGoal|unlock\(/,
      name,
    )
    assert.doesNotMatch(code, /from ['"][^'"]*\.json['"]|writeFile/, name)
  }
  // 임시 저장·시드 출처 모듈: 추천 화면의 sessionStorage 임시 저장과 개발용 시드 출처만 쓴다(IndexedDB·네트워크·AI 권한 없음).
  for (const name of ['planStorage.ts', 'planSource.ts']) {
    const code = strip(name)
    assert.doesNotMatch(
      code,
      /indexedDB|localStorage|fetch\(|XMLHttpRequest|WebSocket/,
      name,
    )
    assert.doesNotMatch(
      code,
      /entitlements|getExercisePlanAccess|exercise-goal|getGoal|unlock\(|writeFile/,
      name,
    )
  }
  // 105종·33개 루틴·99개 항목은 그대로
  assert.equal(catalog.getAllExercises().length, 105)
  assert.equal(catalog.getAllRoutines().length, 33)
  assert.equal(
    catalog
      .getAllRoutines()
      .reduce((n, r) => n + catalog.getRoutineItems(r.id).length, 0),
    99,
  )
})

test('P3-2: 개발자용 근거(ruleEvidence)는 앱 코드가 가져오지 않고, 운영용 규칙·안내 문구에는 내부 근거 문자열이 없다', () => {
  // 앱 코드(src/) 어디에서도 ruleEvidence를 import하지 않는다 → 운영 번들에서 제외된다.
  const SRC = new URL('../src/', import.meta.url)
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory()
        ? walk(new URL(`${entry.name}/`, dir))
        : [new URL(entry.name, dir)],
    )
  for (const file of walk(SRC)) {
    if (!/\.(ts|tsx)$/.test(file.pathname)) continue
    if (file.pathname.endsWith('/ruleEvidence.ts')) continue
    assert.doesNotMatch(
      readFileSync(file, 'utf8'),
      /(from|import)\s*\(?\s*['"][^'"]*ruleEvidence/,
      file.pathname,
    )
  }
  // 규칙 객체와 사용자 안내(PLAN_TEXT)에는 내부 파일명·"가상 루틴"이 없다.
  const strip = (name) =>
    sourceOf(name)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
  for (const name of ['rules.ts', 'types.ts', 'engine.ts', 'toDraft.ts']) {
    assert.doesNotMatch(
      strip(name),
      /exercise_routine_items|가상 루틴|exercises\.json/,
      name,
    )
  }
  assert.doesNotMatch(
    JSON.stringify(Rules.QUANTITY_RULES),
    /exercise_routine_items|가상 루틴|시드/,
  )
  // 사용자에게 필요한 안전·불확실성 안내는 그대로 있다.
  const text = JSON.stringify(Flow.PLAN_TEXT ?? {})
  assert.match(text, /대략적인 추정/)
  assert.match(text, /통증이나 어지러움/)
})
