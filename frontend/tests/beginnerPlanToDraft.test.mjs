import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// S7 P2-3: 초급 추천 결과 → WorkoutDraft 변환, 기존 W11 검증·정규화·저장 절차(saveWorkoutList)와의 연동.
// 저장은 IndexedDB 대신 저장소 계약을 따르는 가짜 저장소로 확인한다(실제 IndexedDB는 브라우저 검증 스크립트로 별도 확인).
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Engine
let ToDraft
let Rules
let Seed
let DraftModel
let Save
let Model
let Repos
let ListView
let catalog
let source

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Engine = await server.ssrLoadModule('/src/exercise/recommend/engine.ts')
  ToDraft = await server.ssrLoadModule('/src/exercise/recommend/toDraft.ts')
  Rules = await server.ssrLoadModule('/src/exercise/recommend/rules.ts')
  Seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  DraftModel = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  Save = await server.ssrLoadModule('/src/exercise/saveWorkoutList.ts')
  Model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  Repos = await server.ssrLoadModule('/src/exercise/workoutRepositories.ts')
  ListView = await server.ssrLoadModule('/src/exercise/workoutListView.ts')
  catalog = Seed.getSeedCatalog()
  source = Engine.createPlanSource(catalog)
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const NOW_ISO = '2026-11-16T03:00:00.000Z'
const request = (over = {}) => ({
  exerciseTier: 'beginner',
  purpose: 'learn',
  availableMinutes: 20,
  tools: ['맨몸'],
  mode: 'automatic',
  ...over,
})
const planOf = (req) => {
  const r = Engine.buildBeginnerPlan(req, source)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.plan
}
const context = (req, over = {}) => {
  let n = 0
  return {
    exerciseTier: 'beginner',
    request: req,
    source,
    now: () => NOW_ISO,
    itemIdFactory: () => `item-${++n}`,
    ...over,
  }
}
const convert = (plan, req, over) =>
  ToDraft.planToDraft(plan, context(req, over))
const ok = (plan, req, over) => {
  const r = convert(plan, req, over)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r
}
const codes = (plan, req, over) => {
  const r = convert(plan, req, over)
  assert.equal(r.ok, false, '변환되면 안 된다')
  return r.failures.map((f) => f.code)
}
const clone = (value) => structuredClone(value)

// ── 정상 변환 ───────────────────────────────────────────────
test('자동 추천 변환: 순서·세트 수·목표값이 그대로이고 기존 Draft 계약의 필드만 담는다(휴식·이유·역할·경고·시간 없음)', () => {
  for (const minutes of [10, 20, 30, 60, 180]) {
    for (const purpose of Rules.PLAN_PURPOSES) {
      const req = request({
        availableMinutes: minutes,
        purpose,
        tools: ['맨몸', '밴드'],
        rotation: 2,
      })
      const plan = planOf(req)
      const { draft } = ok(plan, req)
      assert.deepEqual(Object.keys(draft).sort(), [
        'day',
        'items',
        'updatedAt',
        'v',
      ])
      assert.deepEqual(
        [draft.v, draft.day, draft.updatedAt],
        [1, 'today', NOW_ISO],
      )
      assert.equal(draft.items.length, plan.items.length)
      draft.items.forEach((item, i) => {
        const source = plan.items[i]
        assert.deepEqual(Object.keys(item).sort(), [
          'exerciseId',
          'itemId',
          'name',
          'recordType',
          'sets',
        ])
        assert.equal(typeof item.exerciseId, 'string')
        assert.equal(item.exerciseId, source.exerciseId) // 순서·id 유지
        assert.equal(item.name, source.name)
        assert.equal(item.recordType, source.recordType) // 저장 코드 그대로
        assert.equal(item.sets.length, source.sets.length)
        item.sets.forEach((set, j) => {
          // 기록 방식에 맞는 목표값 하나만, 목표 중량·다른 값 없음
          const key = item.recordType === 'reps' ? 'reps' : 'targetSeconds'
          assert.deepEqual(Object.keys(set), [key])
          assert.equal(set[key], source.sets[j][key])
        })
      })
      assert.equal(
        new Set(draft.items.map((i) => i.itemId)).size,
        draft.items.length,
      )
      const json = JSON.stringify(draft)
      assert.doesNotMatch(
        json,
        /restSeconds|reason|role|warning|estimated|rotation|weightKg|purpose/,
      )
    }
  }
})

test('직접 선택 변환: 선택한 순서와 운동을 그대로 옮긴다(마무리 운동을 맨 앞에 둬도 순서 유지)', () => {
  const ids = ['98', '4', '28', '22', '31']
  const req = request({
    mode: 'selected',
    selectedExerciseIds: ids,
    availableMinutes: 30,
  })
  const plan = planOf(req)
  const { draft } = ok(plan, req)
  assert.deepEqual(
    draft.items.map((i) => i.exerciseId),
    ids,
  )
  assert.deepEqual(
    draft.items.map((i) => i.recordType),
    ['time', 'reps', 'time', 'time', 'time'],
  )
  // 시간이 모자라 세트가 줄어든 결과도 그대로 옮긴다(줄어든 세트 수 유지)
  const tight = request({
    mode: 'selected',
    selectedExerciseIds: ['4', '16', '13', '22', '98'],
    availableMinutes: 10,
  })
  const tightPlan = planOf(tight)
  const converted = ok(tightPlan, tight).draft
  assert.deepEqual(
    converted.items.map((i) => i.sets.length),
    tightPlan.items.map((i) => i.sets.length),
  )
  assert.ok(converted.items.some((i) => i.sets.length === 1))
})

test('변환된 초안은 기존 validateDraft·normalizeDraft를 통과하고 정규화 값이 추천 값과 같다', () => {
  const req = request({ availableMinutes: 30, tools: ['맨몸', '밴드'] })
  const plan = planOf(req)
  const { draft, knownExerciseIds, allowedRecordTypes } = ok(plan, req)
  assert.deepEqual(
    plain(
      DraftModel.validateDraft(draft, knownExerciseIds, allowedRecordTypes),
    ),
    { ok: true },
  )
  const normalized = DraftModel.normalizeDraft(
    draft,
    knownExerciseIds,
    allowedRecordTypes,
  )
  assert.notEqual(normalized, null)
  normalized.forEach((item, i) => {
    assert.equal(item.exerciseId, plan.items[i].exerciseId)
    assert.deepEqual(plain(item.sets), plain(plan.items[i].sets))
  })
  // saveWorkoutList에 넘길 값: 카탈로그의 모든 운동 id, 운동별 허용 기록 방식
  assert.equal(knownExerciseIds.size, 105)
  assert.ok(
    draft.items.every((i) =>
      allowedRecordTypes.get(i.exerciseId).includes(i.recordType),
    ),
  )
})

// ── 권한 ────────────────────────────────────────────────────
test('권한 재검증: 현재 사용자의 운동 이해도가 초급일 때만 변환하고 중급·고급·미확인·무효 값은 차단한다', () => {
  const req = request()
  const plan = planOf(req)
  assert.equal(convert(plan, req).ok, true)
  for (const [tier, code] of [
    ['intermediate', 'tierNotBeginner'],
    ['advanced', 'tierNotBeginner'],
    [null, 'tierUnknown'],
    [undefined, 'tierUnknown'],
    ['expert', 'tierInvalid'],
    [3, 'tierInvalid'],
  ]) {
    // 추천 결과와 요청이 모두 정상이어도(추천 때 초급이었어도) 현재 권한이 없으면 변환하지 않는다
    assert.deepEqual(
      codes(plan, req, { exerciseTier: tier }),
      [code],
      String(tier),
    )
  }
  // 요청의 이해도 값이 초급이 아니면 요청 검증에서 막는다
  const forged = { ...req, exerciseTier: 'advanced' }
  assert.deepEqual(codes(plan, forged), ['requestInvalid'])
  assert.deepEqual(
    convert(plan, forged).failures[0].planFailures.map((f) => f.code),
    ['tierNotBeginner'],
  )
})

test('권한: 식단 이해도와 독립 — 운동 이해도만 본다(식단 초급·운동 중급은 차단, 식단 고급·운동 초급은 허용)', () => {
  const req = request()
  const plan = planOf(req)
  const levels = (exercise, meal) => ({
    exercise: { tier: exercise },
    meal: { tier: meal },
  })
  const tierOf = (l) => l.exercise?.tier
  assert.equal(
    convert(plan, req, {
      exerciseTier: tierOf(levels('intermediate', 'beginner')),
    }).ok,
    false,
  )
  assert.equal(
    convert(plan, req, { exerciseTier: tierOf(levels('beginner', 'advanced')) })
      .ok,
    true,
  )
  assert.equal(
    convert(plan, req, {
      exerciseTier: tierOf({ exercise: null, meal: { tier: 'beginner' } }),
    }).ok,
    false,
  )
  // 변환 모듈은 식단 이해도·AI 이용 권한·PIN 보호 목표를 참조하지 않는다.
  const code = readFileSync(
    new URL('../src/exercise/recommend/toDraft.ts', import.meta.url),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(
    code,
    /\.meal\b|entitlements|getExercisePlanAccess|exercise-goal|getGoal|unlock\(/,
  )
})

// ── 확정 가능 상태 ──────────────────────────────────────────
test('확정 불가 결과는 변환하지 않는다: confirmable=false·blockers·unsupported·overtime·빈 목록', () => {
  const req = request()
  const plan = planOf(req)
  const tamper = (mutate) => {
    const copy = clone(plan)
    mutate(copy)
    return copy
  }
  assert.deepEqual(
    codes(
      tamper((p) => (p.confirmable = false)),
      req,
    ),
    ['planNotConfirmable'],
  )
  assert.deepEqual(
    codes(
      tamper((p) => (p.blockers = ['timeInfeasible'])),
      req,
    ),
    ['planNotConfirmable'],
  )
  assert.deepEqual(
    codes(
      tamper(
        (p) =>
          (p.unsupported = [
            { exerciseId: '87', index: 0, name: 'x', reason: 'weightExercise' },
          ]),
      ),
      req,
    ),
    ['planNotConfirmable'],
  )
  assert.deepEqual(
    codes(
      tamper(
        (p) =>
          (p.overtime = {
            limitSeconds: 1,
            minimumTotalSeconds: 2,
            excessSeconds: 1,
            fitsExerciseCount: 0,
            minutesNeeded: 1,
          }),
      ),
      req,
    ),
    ['planNotConfirmable'],
  )
  assert.deepEqual(
    codes(
      tamper((p) => (p.items = [])),
      req,
    ),
    ['planNotConfirmable'],
  )
  // 모양이 올바르지 않으면 거부
  for (const bad of [
    null,
    undefined,
    'plan',
    3,
    [],
    {},
    { items: 'x' },
    { ...plan, blockers: null },
    { ...plan, items: [null] },
  ]) {
    assert.equal(convert(bad, req).ok, false, JSON.stringify(bad))
  }
})

test('엔진이 확정 불가로 돌려준 결과(직접 선택의 추천 불가 운동·시간 초과)는 변환되지 않고 부분 변환도 없다', () => {
  // 추천 불가 운동 포함: 나머지 운동만 변환하지 않는다.
  const mixed = request({
    mode: 'selected',
    selectedExerciseIds: ['4', '87', '75', '999', '22'],
  })
  const mixedPlan = planOf(mixed)
  assert.equal(mixedPlan.confirmable, false)
  assert.deepEqual(codes(mixedPlan, mixed), ['planNotConfirmable'])
  // 시간 초과: 맨몸 후보 20개를 5분에
  const ids = [...catalog.getAllExercises()]
    .filter(
      (e) =>
        Rules.classifyExercise(e, {
          tools: ['맨몸'],
          evidence: source.evidence,
        }).eligible,
    )
    .map((e) => e.id)
  const overReq = request({
    mode: 'selected',
    selectedExerciseIds: ids,
    availableMinutes: 5,
  })
  const overPlan = planOf(overReq)
  assert.ok(overPlan.overtime)
  assert.deepEqual(codes(overPlan, overReq), ['planNotConfirmable'])
  // 확정 불가를 확정 가능으로 위장해도(confirmable·blockers·overtime 변조) 시간 상한·재계산에서 막힌다
  const disguised = clone(overPlan)
  disguised.confirmable = true
  disguised.blockers = []
  disguised.overtime = null
  assert.equal(convert(disguised, overReq).ok, false)
  assert.ok(
    ['overLimit', 'planMismatch'].includes(codes(disguised, overReq)[0]),
  )
  const disguisedMixed = clone(mixedPlan)
  disguisedMixed.confirmable = true
  disguisedMixed.blockers = []
  disguisedMixed.unsupported = []
  assert.equal(convert(disguisedMixed, mixed).ok, false)
})

// ── 무결성 ──────────────────────────────────────────────────
test('무결성: 중복·없는 운동·빈 id·공백 id는 거부한다(id는 문자열 그대로)', () => {
  const req = request({ availableMinutes: 60 })
  const plan = planOf(req)
  const withItem = (index, patch) => {
    const copy = clone(plan)
    copy.items[index] = { ...copy.items[index], ...patch }
    return copy
  }
  const dup = clone(plan)
  dup.items[1] = { ...dup.items[0] }
  assert.ok(codes(dup, req).includes('exerciseDuplicate'))
  assert.deepEqual(codes(withItem(0, { exerciseId: '999' }), req), [
    'exerciseUnknown',
  ])
  assert.deepEqual(codes(withItem(0, { exerciseId: '' }), req), [
    'exerciseUnknown',
  ])
  assert.deepEqual(codes(withItem(0, { exerciseId: ' 4' }), req), [
    'exerciseUnknown',
  ])
  assert.deepEqual(codes(withItem(0, { exerciseId: 'abc' }), req), [
    'exerciseUnknown',
  ])
  // 숫자 id는 형식 오류(id는 문자열이다)
  assert.deepEqual(codes(withItem(0, { exerciseId: 4 }), req), [
    'planMalformed',
  ])
  const numeric = clone(plan)
  numeric.items[0].exerciseId = 4
  assert.equal(convert(numeric, req).ok, false)
})

test('무결성: 중량 운동·초급 아님·근거 없음·도구 불일치·복합 기록 방식은 거부한다', () => {
  const req = request({ availableMinutes: 60 })
  const plan = planOf(req)
  const swap = (patch) => {
    const copy = clone(plan)
    copy.items[1] = { ...copy.items[1], ...patch }
    return copy
  }
  const fail = (patch) => convert(swap(patch), req).failures[0]
  // 중량 운동(87: 덤벨 수트케이스 캐리, 기본 방식 weight_time) — 시간형으로 적어도 거부
  assert.deepEqual(plain(fail({ exerciseId: '87', recordType: 'time' })), {
    code: 'exerciseNotEligible',
    exerciseId: '87',
    detail: 'weightExercise',
  })
  assert.equal(
    fail({ exerciseId: '87', recordType: 'weight_time' }).detail,
    'weightExercise',
  )
  assert.equal(
    fail({ exerciseId: '10', recordType: 'weight' }).detail,
    'weightExercise',
  ) // 덤벨 바이셉스 컬(중량+횟수형)
  // 초급이 아닌 운동(예: 점핑 잭 29는 중급)
  assert.equal(
    fail({ exerciseId: '29', recordType: 'time' }).detail,
    'notBeginnerDifficulty',
  )
  // 초급이지만 운동 자신의 근거가 없는 운동(밴드 스쿼트 75)·도구 불일치(밴드 로우 1, 맨몸만 선택)
  assert.equal(
    fail({ exerciseId: '75', recordType: 'reps' }).detail,
    'noExerciseEvidence',
  )
  assert.equal(
    fail({ exerciseId: '1', recordType: 'reps' }).detail,
    'toolUnavailable',
  )
  assert.equal(
    fail({ exerciseId: '105', recordType: 'time' }).detail,
    'noRuleGroup',
  )
  // 복합·중량 기록 방식을 쓸 수 있는 운동에 적어도 거부
  assert.deepEqual(
    codes(swap({ exerciseId: '4', recordType: 'time_reps' }), req).slice(0, 1),
    ['recordTypeMismatch'],
  )
  assert.deepEqual(
    codes(swap({ exerciseId: '4', recordType: 'weight' }), req).slice(0, 1),
    ['recordTypeMismatch'],
  )
  assert.deepEqual(
    codes(swap({ exerciseId: '4', recordType: 'time' }), req).slice(0, 1),
    ['recordTypeMismatch'],
  )
  assert.deepEqual(
    codes(swap({ exerciseId: '22', recordType: 'reps' }), req).slice(0, 1),
    ['recordTypeMismatch'],
  )
})

test('무결성: 목표 횟수·목표 시간·세트 수는 추천 규칙 범위 밖이면 거부한다', () => {
  const req = request({ availableMinutes: 60 })
  const plan = planOf(req)
  const repsIndex = plan.items.findIndex((i) => i.recordType === 'reps')
  const timeIndex = plan.items.findIndex(
    (i) => i.recordType === 'time' && i.sets.length === 2,
  ) // 2세트 규칙의 시간형(걷기는 1세트)
  const edit = (index, sets) => {
    const copy = clone(plan)
    copy.items[index].sets = sets
    return copy
  }
  // 목표 횟수
  for (const reps of [9, 7, 0, -8, 1.5, '8', Number.NaN, null]) {
    assert.deepEqual(
      codes(edit(repsIndex, [{ reps }, { reps: 8 }]), req),
      ['targetOutOfRule'],
      String(reps),
    )
  }
  // 목표 시간
  for (const targetSeconds of [21, 19, 0, 3601, -20, 20.5, '20', Number.NaN]) {
    assert.deepEqual(
      codes(edit(timeIndex, [{ targetSeconds }, { targetSeconds: 20 }]), req),
      ['targetOutOfRule'],
      String(targetSeconds),
    )
  }
  // 목표 중량·다른 방식의 값이 섞인 세트
  assert.deepEqual(
    codes(edit(repsIndex, [{ reps: 8, weightKg: 5 }, { reps: 8 }]), req),
    ['targetOutOfRule'],
  )
  assert.deepEqual(
    codes(edit(repsIndex, [{ reps: 8, targetSeconds: 20 }, { reps: 8 }]), req),
    ['targetOutOfRule'],
  )
  assert.deepEqual(
    codes(
      edit(timeIndex, [{ targetSeconds: 20, reps: 8 }, { targetSeconds: 20 }]),
      req,
    ),
    ['targetOutOfRule'],
  )
  assert.deepEqual(codes(edit(repsIndex, [{}, { reps: 8 }]), req), [
    'targetOutOfRule',
  ])
  // 세트 수(규칙 1~2세트): 0개·3개 이상
  assert.deepEqual(
    codes(edit(repsIndex, []), req),
    ['setsOutOfRule', 'targetOutOfRule'].slice(0, 1),
  )
  assert.deepEqual(
    codes(edit(repsIndex, [{ reps: 8 }, { reps: 8 }, { reps: 8 }]), req),
    ['setsOutOfRule'],
  )
  assert.deepEqual(
    codes(edit(timeIndex, Array(5).fill({ targetSeconds: 20 })), req),
    ['setsOutOfRule'],
  )
})

test('무결성: 시간 상한·개수 상한을 넘기면 거부한다', () => {
  // 시간 상한: 10분 결과를 5분 요청의 결과로 바꿔치기
  const big = planOf(request({ availableMinutes: 10 }))
  const smallReq = request({ availableMinutes: 5 })
  assert.deepEqual(codes(big, smallReq), ['overLimit'])
  // 개수 상한: 20분(상한 4)의 결과에 운동을 하나 더한 변조
  const req = request({ availableMinutes: 20 })
  const plan = planOf(req)
  const extra = clone(plan)
  extra.items.push({
    ...clone(plan.items[1]),
    exerciseId: '16',
    name: '맨몸 스쿼트',
  })
  assert.deepEqual(codes(extra, req), ['overCap'])
  // 60분(상한 6)에 7개
  const req60 = request({ availableMinutes: 60 })
  const plan60 = planOf(req60)
  const seven = clone(plan60)
  seven.items.push({
    ...clone(plan60.items[1]),
    exerciseId: '23',
    name: '데드 버그',
  })
  assert.ok(
    codes(seven, req60).includes('overCap') ||
      codes(seven, req60).includes('exerciseDuplicate'),
  )
})

test('직접 선택 보존: 선택 운동의 누락·추가·순서 변경은 거부한다', () => {
  const ids = ['4', '22', '98']
  const req = request({
    mode: 'selected',
    selectedExerciseIds: ids,
    availableMinutes: 30,
  })
  const plan = planOf(req)
  assert.equal(convert(plan, req).ok, true)
  const missing = clone(plan)
  missing.items.splice(1, 1)
  assert.deepEqual(codes(missing, req), ['selectionNotPreserved'])
  const extra = clone(plan)
  extra.items.push({
    ...clone(plan.items[0]),
    exerciseId: '16',
    name: '맨몸 스쿼트',
  })
  assert.deepEqual(codes(extra, req), ['selectionNotPreserved'])
  const reordered = clone(plan)
  reordered.items.reverse()
  assert.deepEqual(codes(reordered, req), ['selectionNotPreserved'])
  // 선택 요청 자체에 중복이 있으면 요청 검증에서 막힌다
  const dupReq = request({ mode: 'selected', selectedExerciseIds: ['4', '4'] })
  assert.deepEqual(codes(plan, dupReq), ['requestInvalid'])
})

test('변조 차단: 세트 수 줄이기·값 바꾸기·순서 바꾸기·다른 회전값의 결과·부가 필드 변경은 재계산 대조에서 거부한다', () => {
  const req = request({
    availableMinutes: 60,
    tools: ['맨몸', '밴드'],
    rotation: 1,
  })
  const plan = planOf(req)
  const mutate = (fn) => {
    const copy = clone(plan)
    fn(copy)
    return copy
  }
  // 규칙 범위 안(1세트)이라 항목 검사는 통과하지만 엔진 결과와 다르다
  const repsIndex = plan.items.findIndex((i) => i.recordType === 'reps')
  assert.deepEqual(
    codes(
      mutate((p) => p.items[repsIndex].sets.pop()),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.items[repsIndex].name = '다른 이름')),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.items[repsIndex].estimatedSeconds += 1)),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.items[repsIndex].restSeconds = 30)),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.items[repsIndex].role = 'cooldown')),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.estimatedTotalSeconds -= 10)),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate(
        (p) => (p.warnings = [{ code: 'bodyPartSkew', category: '상체' }]),
      ),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.purpose = 'lose')),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.mode = 'selected')),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.availableMinutes = 30)),
      req,
    ),
    ['planMismatch'],
  )
  assert.deepEqual(
    codes(
      mutate((p) => (p.extra = 1)),
      req,
    ),
    ['planMismatch'],
  )
  // 순서 바꾸기(시작 운동을 뒤로)
  assert.deepEqual(
    codes(
      mutate((p) => p.items.push(p.items.shift())),
      req,
    ),
    ['planMismatch'],
  )
  // 다른 회전값의 정상 결과를 이 요청의 결과로 내밀기
  const other = planOf(
    request({ availableMinutes: 60, tools: ['맨몸', '밴드'], rotation: 2 }),
  )
  assert.deepEqual(codes(other, req), ['planMismatch'])
  // 같은 결과는 키 순서가 달라도 통과한다
  const reorderedKeys = Object.fromEntries(
    Object.entries(clone(plan)).reverse(),
  )
  assert.equal(convert(reorderedKeys, req).ok, true)
  // 원본 결과·요청은 변환으로 바뀌지 않는다
  const before = JSON.stringify([plan, req])
  convert(plan, req)
  assert.equal(JSON.stringify([plan, req]), before)
})

test('안내 문구: 모든 변환 실패 코드에 한국어 문구가 있고 내부 코드명을 노출하지 않는다', () => {
  const all = [
    'tierUnknown',
    'tierNotBeginner',
    'tierInvalid',
    'requestInvalid',
    'planMalformed',
    'planNotConfirmable',
    'exerciseDuplicate',
    'exerciseUnknown',
    'exerciseNotEligible',
    'recordTypeMismatch',
    'setsOutOfRule',
    'targetOutOfRule',
    'overLimit',
    'overCap',
    'selectionNotPreserved',
    'planMismatch',
    'draftInvalid',
  ]
  const messages = all.map(ToDraft.describePlanToDraftFailure)
  for (const m of messages) {
    assert.match(m, /[가-힣]/)
    assert.doesNotMatch(
      m,
      /weight_reps|weight_time|time_reps|\breps\b|recordType|tier/,
    )
  }
  assert.equal(new Set(messages).size, messages.length)
})

// ── 저장 통합(W11 절차 + 저장소 계약을 따르는 가짜 저장소) ──────
const at = (day, hour = 12) => new Date(2026, 10, day, hour, 0, 0)

/** 계정별로 분리된 가짜 저장소(실제 저장소와 같은 buildWorkoutList·sameListItems 규칙). */
function makeStores() {
  const stores = new Map() // ownerId -> list[]
  const state = { failSaveOnce: null, saveCalls: [] }
  let seq = 0
  const repoFor = (ownerId) => {
    if (!stores.has(ownerId)) stores.set(ownerId, [])
    const store = stores.get(ownerId)
    return {
      async listByDate(date) {
        return {
          items: store.filter((l) => l.plannedDate === date),
          skippedCount: 0,
        }
      },
      async saveFromDraft(input) {
        state.saveCalls.push({ ownerId, requestId: input.requestId })
        if (state.failSaveOnce) {
          const error = state.failSaveOnce
          state.failSaveOnce = null
          throw error
        }
        const candidate = Model.buildWorkoutList({
          id: `l${++seq}`,
          ownerId,
          requestId: input.requestId,
          draft: input.draft,
          knownExerciseIds: input.knownExerciseIds,
          allowedRecordTypes: input.allowedRecordTypes,
          catalogVersion: 'dev-mock-1',
          now: at(16),
        })
        if (!candidate)
          throw new Repos.WorkoutStoreError('validation', {
            code: 'invalidDraft',
          })
        const existing = store.find((l) => l.requestId === input.requestId)
        if (existing) {
          if (!Model.sameListItems(existing.items, candidate.items)) {
            throw new Repos.WorkoutStoreError('conflict', {
              code: 'requestConflict',
            })
          }
          return { list: existing, created: false }
        }
        store.push(candidate)
        return { list: candidate, created: true }
      },
    }
  }
  return { repoFor, stores, state }
}

const saveParams = (converted, extra = {}) => ({
  draft: converted.draft,
  knownExerciseIds: converted.knownExerciseIds,
  allowedRecordTypes: converted.allowedRecordTypes,
  acknowledgedDate: '2026-11-16',
  confirmedReplaceListId: null,
  ...extra,
})
const itemsOf = (plan) =>
  plan.items.map((item) => ({
    exerciseId: item.exerciseId,
    recordType: item.recordType,
    sets: item.sets.map((s) =>
      item.recordType === 'reps'
        ? { reps: s.reps }
        : { targetSeconds: s.targetSeconds },
    ),
  }))

test('저장 통합: 변환한 초안이 기존 W11 절차(saveWorkoutList)로 저장되고 재조회 값이 추천과 같다', async () => {
  const { repoFor } = makeStores()
  const req = request({ availableMinutes: 30, tools: ['맨몸', '밴드'] })
  const plan = planOf(req)
  const converted = ok(plan, req)
  const repo = repoFor('userA')
  const outcome = await Save.saveWorkoutList(
    { listRepository: repo, now: () => at(16) },
    saveParams(converted),
  )
  assert.equal(outcome.kind, 'saved')
  assert.equal(outcome.created, true)
  // 재조회
  const reread = (await repo.listByDate('2026-11-16')).items
  assert.equal(reread.length, 1)
  const list = reread[0]
  assert.deepEqual(
    plain(
      list.items.map((i) => ({
        exerciseId: i.exerciseId,
        recordType: i.recordType,
        sets: i.sets,
      })),
    ),
    plain(itemsOf(plan)),
  )
  assert.deepEqual(
    list.items.map((i) => i.exerciseId),
    plan.items.map((i) => i.exerciseId),
  ) // 순서
  assert.deepEqual(
    list.items.map((i) => i.sets.length),
    plan.items.map((i) => i.sets.length),
  ) // 세트 수
  assert.ok(list.items.every((i) => typeof i.exerciseId === 'string'))
  assert.doesNotMatch(JSON.stringify(list), /restSeconds|weightKg|reason|role/)
  // 저장된 목록은 기존 읽기 모델도 통과한다
  assert.notEqual(Model.parseWorkoutList(plain(list)), null)
  // 같은 초안을 다시 저장하면 새 목록을 만들지 않는다(기존 정책: alreadySaved)
  const again = await Save.saveWorkoutList(
    { listRepository: repo, now: () => at(16) },
    saveParams(converted),
  )
  assert.equal(again.kind, 'alreadySaved')
})

test('저장 통합: 직접 선택도 저장·재조회에서 순서·세트·목표가 유지된다', async () => {
  const { repoFor } = makeStores()
  const req = request({
    mode: 'selected',
    selectedExerciseIds: ['98', '4', '22', '16'],
    availableMinutes: 20,
  })
  const plan = planOf(req)
  const converted = ok(plan, req)
  const repo = repoFor('userA')
  const outcome = await Save.saveWorkoutList(
    { listRepository: repo, now: () => at(16) },
    saveParams(converted),
  )
  assert.equal(outcome.kind, 'saved')
  const list = (await repo.listByDate('2026-11-16')).items[0]
  assert.deepEqual(
    list.items.map((i) => i.exerciseId),
    ['98', '4', '22', '16'],
  )
  assert.deepEqual(
    plain(
      list.items.map((i) => ({
        exerciseId: i.exerciseId,
        recordType: i.recordType,
        sets: i.sets,
      })),
    ),
    plain(itemsOf(plan)),
  )
})

test('저장 통합: 계정별 격리 — 사용자 A의 목록은 B에게 보이지 않고 서로 덮어쓰지 않는다', async () => {
  const { repoFor, stores } = makeStores()
  const reqA = request({ availableMinutes: 20 })
  const reqB = request({
    availableMinutes: 30,
    purpose: 'lose',
    tools: ['맨몸', '밴드'],
  })
  const a = ok(planOf(reqA), reqA)
  const b = ok(planOf(reqB), reqB)
  const A = repoFor('userA')
  const B = repoFor('userB')
  assert.equal(
    (
      await Save.saveWorkoutList(
        { listRepository: A, now: () => at(16) },
        saveParams(a),
      )
    ).kind,
    'saved',
  )
  assert.deepEqual((await B.listByDate('2026-11-16')).items, []) // B에게 보이지 않는다
  assert.equal(
    (
      await Save.saveWorkoutList(
        { listRepository: B, now: () => at(16) },
        saveParams(b),
      )
    ).kind,
    'saved',
  )
  const listA = (await A.listByDate('2026-11-16')).items
  const listB = (await B.listByDate('2026-11-16')).items
  assert.equal(listA.length, 1)
  assert.equal(listB.length, 1)
  assert.notEqual(listA[0].id, listB[0].id)
  assert.ok(
    listA.every((l) => l.ownerId === 'userA') &&
      listB.every((l) => l.ownerId === 'userB'),
  )
  assert.notDeepEqual(
    listA[0].items.map((i) => i.exerciseId),
    listB[0].items.map((i) => i.exerciseId),
  )
  assert.deepEqual(
    [stores.get('userA').length, stores.get('userB').length],
    [1, 1],
  )
})

test('저장 통합: 기존 목록은 덮어쓰지 않는다 — 다른 구성은 교체 확인을 거쳐야 하고 확인해도 이전 목록은 남는다', async () => {
  const { repoFor, stores } = makeStores()
  const first = request({ availableMinutes: 20 })
  const second = request({ availableMinutes: 20, rotation: 1 })
  const a = ok(planOf(first), first)
  const b = ok(planOf(second), second, {
    now: () => '2026-11-16T03:05:00.000Z',
  }) // 새 변환마다 초안 updatedAt(= 저장 요청 id)이 달라진다
  const repo = repoFor('userA')
  const deps = { listRepository: repo, now: () => at(16) }
  const saved = await Save.saveWorkoutList(deps, saveParams(a))
  assert.equal(saved.kind, 'saved')
  // 다른 구성: 확인 없이는 저장하지 않는다
  const ask = await Save.saveWorkoutList(deps, saveParams(b))
  assert.equal(ask.kind, 'replaceConfirm')
  assert.equal(ask.existing.id, saved.list.id)
  assert.equal(stores.get('userA').length, 1)
  // 확인하면 새 목록을 추가한다(이전 목록은 지우지 않는다)
  const replaced = await Save.saveWorkoutList(
    deps,
    saveParams(b, { confirmedReplaceListId: saved.list.id }),
  )
  assert.equal(replaced.kind, 'saved')
  assert.equal(stores.get('userA').length, 2)
  assert.ok(stores.get('userA').some((l) => l.id === saved.list.id))
})

test('저장 통합: 저장 실패 시 데이터가 보존되고 같은 요청으로 재시도하면 한 번만 저장된다', async () => {
  const { repoFor, stores, state } = makeStores()
  const req = request({ availableMinutes: 20 })
  const converted = ok(planOf(req), req)
  const repo = repoFor('userA')
  const deps = { listRepository: repo, now: () => at(16) }
  state.failSaveOnce = new Repos.WorkoutStoreError('quota')
  const failed = await Save.saveWorkoutList(deps, saveParams(converted))
  assert.deepEqual(
    [failed.kind, failed.stage, failed.reason],
    ['failed', 'save', 'quota'],
  )
  assert.equal(stores.get('userA').length, 0) // 아무것도 저장되지 않았다
  // 초안(변환 결과)은 그대로라 같은 값으로 재시도할 수 있다
  const retried = await Save.saveWorkoutList(deps, saveParams(converted))
  assert.equal(retried.kind, 'saved')
  assert.equal(stores.get('userA').length, 1)
  // 요청 id는 시도마다 같다(초안 updatedAt 기반) — 재전송 시 새 목록을 만들지 않는다
  const ids = state.saveCalls.map((c) => c.requestId)
  assert.equal(new Set(ids).size, 1)
  const direct = await repo.saveFromDraft({
    requestId: ids[0],
    draft: converted.draft,
    knownExerciseIds: converted.knownExerciseIds,
    allowedRecordTypes: converted.allowedRecordTypes,
  })
  assert.equal(direct.created, false)
  assert.equal(stores.get('userA').length, 1)
})

test('저장 통합: 변조된 초안은 저장 절차(기존 검증)에서도 거부된다 — 변환 함수 밖에서 만든 초안도 W11 검증을 피하지 못한다', async () => {
  const { repoFor, stores } = makeStores()
  const req = request({ availableMinutes: 20 })
  const converted = ok(planOf(req), req)
  const bad = clone(converted.draft)
  bad.items[0].sets = [{ targetSeconds: 0 }] // 방식에 맞지 않는 목표값
  const outcome = await Save.saveWorkoutList(
    { listRepository: repoFor('userA'), now: () => at(16) },
    saveParams({ ...converted, draft: bad }),
  )
  assert.equal(outcome.kind, 'invalid')
  assert.equal((stores.get('userA') ?? []).length, 0)
  // 허용되지 않는 기록 방식
  const wrongType = clone(converted.draft)
  wrongType.items[0].recordType = 'weight'
  const out2 = await Save.saveWorkoutList(
    { listRepository: repoFor('userA'), now: () => at(16) },
    saveParams({ ...converted, draft: wrongType }),
  )
  assert.equal(out2.kind, 'invalid')
})

// ── 보호 ────────────────────────────────────────────────────
test('보호: 변환 모듈은 별도 저장 경로를 만들지 않는다 — 저장소·IndexedDB·네트워크를 쓰지 않고 시드·스키마를 바꾸지 않는다', () => {
  const code = readFileSync(
    new URL('../src/exercise/recommend/toDraft.ts', import.meta.url),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(
    code,
    /saveFromDraft|WorkoutListRepository|indexedDB|localStorage|sessionStorage|fetch\(/,
  )
  assert.doesNotMatch(code, /Math\.random|Date\.now|new Date/)
  // 기존 시드·스키마·기록 방식은 그대로
  assert.equal(catalog.getAllExercises().length, 105)
  assert.equal(catalog.getAllRoutines().length, 33)
  assert.equal(
    catalog
      .getAllRoutines()
      .reduce((n, r) => n + catalog.getRoutineItems(r.id).length, 0),
    99,
  )
  assert.equal(
    readFileSync(
      new URL('../src/exercise/workoutTypes.ts', import.meta.url),
      'utf8',
    ).includes('export const WORKOUT_SCHEMA_VERSION = 1'),
    true,
  )
  assert.equal(
    ListView.makeSaveRequestId('2026-11-16', NOW_ISO),
    'w11-20261116-20261116T030000000Z',
  )
})
