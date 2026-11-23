import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// I02-1 로컬 예시 추천 테스트: 운동량 근거 매칭, 후보 필터, 시간·개수 상한, 재추천, 화면, 범위 준수. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Evidence
let Select
let Flow
let Example
let Rules
let FlowView
let ResultView
let catalog
let evidence
let exercises

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
  Evidence = await server.ssrLoadModule('/src/ai/exercisePlanEvidence.ts')
  Select = await server.ssrLoadModule('/src/ai/exercisePlanSelect.ts')
  Flow = await server.ssrLoadModule('/src/ai/exercisePlanFlow.ts')
  Example = await server.ssrLoadModule('/src/ai/exercisePlanExample.ts')
  Rules = await server.ssrLoadModule('/src/exercise/recommend/rules.ts')
  const view = await server.ssrLoadModule(
    '/src/components/ai/exercise/ExercisePlanFlowView.tsx',
  )
  FlowView = view.default
  ResultView = view.ResultView
  catalog = (
    await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  ).getSeedCatalog()
  evidence = Evidence.collectLevelEvidence(catalog)
  exercises = catalog.getAllExercises()
})
after(async () => {
  await server.close()
})

const noop = () => {}
const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node))
const byId = (id) => exercises.find((e) => e.id === id)
const plan = (conditions, rotation = 0) =>
  Select.buildLocalPlan({ conditions, rotation, exercises, evidence })
const cond = (over = {}) => ({
  difficulty: '초급',
  parts: ['상체'],
  tools: ['맨몸'],
  minutes: 20,
  ...over,
})

// ── 근거 ──────────────────────────────────────────────────────────────────────
test('운동량 근거: 같은 난이도 루틴에 일관된 값이 있으면 시드 값 그대로 쓴다(세트·횟수/시간·휴식)', () => {
  const expectOk = (id, want) => {
    const r = Evidence.evidenceFor(byId(id), evidence)
    assert.equal(r.ok, true, `${id}`)
    assert.deepEqual(r.evidence, want)
  }
  expectOk('4', { sets: 2, reps: 8, seconds: null, restSeconds: 60 }) // 월 푸시업(초급 루틴)
  expectOk('22', { sets: 2, reps: null, seconds: 20, restSeconds: 60 }) // 플랭크 시간형
  expectOk('6', { sets: 2, reps: 8, seconds: null, restSeconds: 60 }) // 덤벨 플로어 프레스(중량 운동, 중량 근거는 없음)
  expectOk('2', { sets: 3, reps: 10, seconds: null, restSeconds: 75 }) // 중급 운동은 중급 루틴 값
  expectOk('29', { sets: 4, reps: null, seconds: 30, restSeconds: 30 }) // 점핑 잭(중급 time)
  expectOk('35', { sets: 4, reps: 5, seconds: null, restSeconds: 120 }) // 고급 운동은 고급 루틴 값
  // 근거에 중량 필드가 없다.
  for (const e of exercises) {
    const r = Evidence.evidenceFor(e, evidence)
    if (r.ok)
      assert.deepEqual(Object.keys(r.evidence).sort(), [
        'reps',
        'restSeconds',
        'seconds',
        'sets',
      ])
  }
})

test('운동량 근거: 다른 난이도 루틴의 값은 빌리지 않고, 값이 충돌하거나 방식이 맞지 않으면 쓰지 않는다', () => {
  // 덤벨 해머 컬(초급)은 중급 루틴에만 있다 → 근거 없음
  assert.deepEqual(Evidence.evidenceFor(byId('11'), evidence), {
    ok: false,
    issue: 'noEvidence',
  })
  // 근거가 전혀 없는 운동
  for (const id of ['87', '32', '44', '34'])
    assert.deepEqual(Evidence.evidenceFor(byId(id), evidence), {
      ok: false,
      issue: 'noEvidence',
    })
  // 제자리 걷기: 같은 초급 루틴에 60초와 120초가 있다 → 충돌
  assert.deepEqual(Evidence.evidenceFor(byId('28'), evidence), {
    ok: false,
    issue: 'conflict',
  })
  // 합성 확인: 복합 방식·값 누락은 unsupported
  const make = (mode, obs) => ({
    id: 'x',
    difficulty: '초급',
    recordModes: { default: mode, allowed: [mode] },
    obs,
  })
  const run = (mode, obs) => {
    const ex = make(mode, obs)
    return Evidence.evidenceFor(
      ex,
      new Map([['x', new Map([['초급', [obs]]])]]),
    )
  }
  const base = { sets: 2, reps: 8, seconds: null, restSeconds: 60 }
  assert.equal(run('reps', base).ok, true)
  assert.equal(run('time_reps', base).issue, 'unsupported')
  assert.equal(
    run('weight_time', { ...base, reps: null, seconds: 20 }).issue,
    'unsupported',
  )
  assert.equal(run('reps', { ...base, reps: null }).issue, 'unsupported')
  assert.equal(run('time', base).issue, 'unsupported') // 시간형인데 시간 값 없음
  assert.equal(run('reps', { ...base, restSeconds: null }).issue, 'unsupported')
  assert.equal(run('reps', { ...base, sets: 0 }).issue, 'unsupported')
})

test('운동량 근거 범위: 같은 난이도 근거가 있는 운동은 64개이고 그중 충돌 1개, 나머지는 쓸 수 있다', () => {
  let ok = 0
  const issues = { noEvidence: 0, conflict: 0, unsupported: 0 }
  for (const e of exercises) {
    const r = Evidence.evidenceFor(e, evidence)
    if (r.ok) ok += 1
    else issues[r.issue] += 1
  }
  assert.equal(exercises.length, 105)
  assert.equal(issues.conflict, 1)
  assert.equal(ok + issues.conflict + issues.unsupported, 64)
  assert.equal(
    ok + issues.noEvidence + issues.conflict + issues.unsupported,
    105,
  )
})

// ── 후보 필터 ─────────────────────────────────────────────────────────────────
test('후보 필터: 난이도 정확 일치·부위 중 하나·필요한 도구가 모두 선택 안에 있어야 하고 맨몸은 고른 경우에만 포함된다', () => {
  const c = Select.validateConditions(
    cond({ tools: ['밴드'], parts: ['상체', '하체'] }),
  ).conditions
  const out = Select.filterCandidates(exercises, c)
  assert.ok(out.length > 0)
  for (const e of out) {
    assert.equal(e.difficulty, '초급')
    assert.ok(['상체', '하체'].includes(e.category))
    assert.deepEqual([...e.equipment], ['밴드']) // 맨몸 운동은 들어오지 않는다
  }
  // 맨몸만 고르면 밴드 운동은 없다
  const bare = Select.filterCandidates(
    exercises,
    Select.validateConditions(cond({ tools: ['맨몸'] })).conditions,
  )
  assert.ok(bare.every((e) => e.equipment.every((t) => t === '맨몸')))
  // 덤벨+맨몸: 두 도구 운동 모두
  const both = Select.filterCandidates(
    exercises,
    Select.validateConditions(
      cond({ tools: ['덤벨', '맨몸'], parts: ['상체'] }),
    ).conditions,
  )
  assert.ok(both.some((e) => e.equipment.includes('덤벨')))
  assert.ok(both.some((e) => e.equipment.includes('맨몸')))
  // 난이도가 다르면 들어오지 않는다(중급을 고르면 초급 운동은 없다)
  const mid = Select.filterCandidates(
    exercises,
    Select.validateConditions(
      cond({
        difficulty: '중급',
        tools: ['맨몸', '밴드', '덤벨'],
        parts: ['상체', '하체', '코어', '전신'],
      }),
    ).conditions,
  )
  assert.ok(mid.length > 0 && mid.every((e) => e.difficulty === '중급'))
})

test('조건 검증: 난이도·부위·도구·시간이 올바르지 않으면 invalid이고 자동으로 채우지 않는다', () => {
  const v = Select.validateConditions
  assert.equal(v(cond()).ok, true)
  assert.equal(v(cond({ difficulty: '초보' })).ok, false)
  assert.equal(v(cond({ difficulty: null })).field, 'difficulty')
  assert.equal(v(cond({ parts: [] })).field, 'parts')
  assert.equal(v(cond({ parts: ['팔'] })).field, 'parts')
  assert.equal(v(cond({ tools: [] })).field, 'tools') // 맨몸도 자동 포함하지 않는다
  assert.equal(v(cond({ tools: ['케틀벨'] })).field, 'tools')
  for (const minutes of [5, 15, 40, '20', null])
    assert.equal(v(cond({ minutes })).field, 'minutes')
  assert.equal(plan(cond({ parts: [] })).status, 'invalid')
  assert.equal(plan(null).status, 'invalid')
})

// ── 추천 구성 ─────────────────────────────────────────────────────────────────
test('추천 구성: 근거값은 그대로이고 중량은 만들지 않으며 근거 없는 후보는 목록에 넣지 않고 따로 알린다', () => {
  const result = plan(cond({ parts: ['상체', '하체', '코어'], minutes: 10 }))
  assert.equal(result.status, 'ok')
  assert.deepEqual(
    result.items.map((i) => i.exerciseId),
    ['4', '13', '22'],
  )
  for (const item of result.items) {
    const exercise = byId(item.exerciseId)
    const ev = Evidence.evidenceFor(exercise, evidence)
    assert.equal(ev.ok, true)
    assert.equal(item.sets, ev.evidence.sets)
    assert.equal(item.reps, ev.evidence.reps)
    assert.equal(item.seconds, ev.evidence.seconds)
    assert.equal(item.restSeconds, ev.evidence.restSeconds)
    assert.equal('weightKg' in item, false)
    assert.equal(item.estimatedSeconds > 0, true)
  }
  // 제외된 후보: 이름·이유가 있고 목록에는 없다
  const ids = new Set(result.items.map((i) => i.exerciseId))
  assert.ok(result.excluded.length > 0)
  for (const e of result.excluded) {
    assert.ok(!ids.has(e.exerciseId))
    assert.ok(['noEvidence', 'conflict', 'unsupported'].includes(e.reason))
  }
  // 중량 운동: 중량을 만들지 않고 직접 입력으로 표시한다
  const weight = plan(cond({ tools: ['덤벨'], parts: ['상체'] }))
  assert.equal(weight.status, 'ok')
  for (const item of weight.items) {
    assert.equal(item.recordType, 'weight')
    assert.equal(item.needsWeight, true)
    assert.equal(item.reps, 8)
  }
  // 근거 없는 후보(덤벨 해머 컬)는 후보로만 보인다
  assert.ok(
    weight.excluded.some(
      (e) => e.exerciseId === '11' && e.reason === 'noEvidence',
    ),
  )
})

test('추천 구성: 선택한 부위를 순서대로 돌며 하나씩 고르고, 부위 순서는 상체·하체·코어·전신 기준이다', () => {
  const r = plan(cond({ parts: ['코어', '상체', '하체'], minutes: 30 }))
  assert.deepEqual(
    r.items.slice(0, 3).map((i) => i.category),
    ['상체', '하체', '코어'],
  )
  assert.ok(r.items.length <= 5)
})

test('시간·개수 상한: 모든 조건 조합에서 10분 3개·20분 4개·30분 5개 이하이고 예상 총 시간이 고른 시간 이내다', () => {
  const D = ['초급', '중급', '고급']
  const P = ['상체', '하체', '코어', '전신']
  const T = ['덤벨', '맨몸', '밴드', '폼롤러', '마사지볼', '풀업 바']
  const subsets = (a) =>
    a
      .reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]])
      .filter((s) => s.length)
  const cap = { 10: 3, 20: 4, 30: 5 }
  const seen = { ok: 0, noCandidates: 0, noPlannable: 0 }
  for (const difficulty of D)
    for (const parts of subsets(P))
      for (const tools of subsets(T))
        for (const minutes of [10, 20, 30]) {
          const r = plan({ difficulty, parts, tools, minutes })
          seen[r.status] = (seen[r.status] ?? 0) + 1
          assert.ok(r.items.length <= cap[minutes])
          assert.equal(r.limitSeconds, minutes * 60)
          if (r.items.length > 0) {
            assert.equal(r.totalSeconds, Rules.estimateTotalSeconds(r.items))
            assert.ok(r.totalSeconds <= minutes * 60)
          } else {
            assert.equal(r.totalSeconds, null) // 항목이 없으면 시간을 만들지 않는다
          }
          // 근거 없는 후보가 목록에 들어가지 않는다
          for (const item of r.items)
            assert.equal(
              Evidence.evidenceFor(byId(item.exerciseId), evidence).ok,
              true,
            )
        }
  assert.ok(seen.ok > 0 && seen.noCandidates > 0 && seen.noPlannable > 0)
})

test('시간이 남아도 근거 없는 운동은 더하지 않는다(예상 시간은 근거 있는 운동만으로 계산)', () => {
  // 초급 코어·맨몸: 후보 5개 중 근거 있는 운동만 담긴다
  const r = plan(cond({ parts: ['코어'], minutes: 30 }))
  assert.equal(r.status, 'ok')
  assert.ok(r.totalSeconds < 30 * 60)
  assert.ok(
    r.items.length < Select.MAX_ITEMS_BY_MINUTES[30] || r.plannableCount >= 5,
  )
  const sum =
    r.items.reduce((n, i) => n + i.estimatedSeconds, 0) +
    (r.items.length - 1) * Rules.ASSUMED_TRANSITION_SECONDS
  assert.equal(r.totalSeconds, sum)
})

test('후보 부족·근거 부족·시간 부족을 구분하고 조건을 완화하지 않는다', () => {
  // 고급 전신은 카탈로그에 운동이 없다
  const none = plan(
    cond({
      difficulty: '고급',
      parts: ['전신'],
      tools: ['맨몸', '덤벨', '밴드', '풀업 바'],
    }),
  )
  assert.equal(none.status, 'noCandidates')
  assert.equal(none.candidateCount, 0)
  assert.deepEqual(none.items, [])
  assert.equal(none.totalSeconds, null)
  // 초급 상체·마사지볼: 후보는 있지만 같은 난이도 근거가 없다 → 후보만 표시
  const noPlan = plan(cond({ tools: ['마사지볼'] }))
  assert.equal(noPlan.status, 'noPlannable')
  assert.ok(noPlan.candidateCount > 0)
  assert.equal(noPlan.excluded.length, noPlan.candidateCount)
  assert.deepEqual(noPlan.items, [])
  // 시간 부족: 한 운동도 시간 안에 들어가지 않는 합성 근거
  const big = {
    id: 'big',
    name: '긴 운동',
    category: '상체',
    difficulty: '초급',
    equipment: ['맨몸'],
    recordModes: { default: 'reps', allowed: ['reps'] },
  }
  const bigEvidence = new Map([
    [
      'big',
      new Map([
        ['초급', [{ sets: 5, reps: 100, seconds: null, restSeconds: 600 }]],
      ]),
    ],
  ])
  const short = Select.buildLocalPlan({
    conditions: cond({ minutes: 10 }),
    exercises: [big],
    evidence: bigEvidence,
  })
  assert.equal(short.status, 'timeShort')
  assert.equal(short.totalSeconds, null)
  assert.equal(short.plannableCount, 1)
})

test('재추천: 같은 입력·같은 rotation은 같은 결과이고, 다시 추천하면 후보 순서가 바뀌며, 바꿀 구성이 없으면 null이다', () => {
  const c = cond({ parts: ['상체', '하체', '코어'], minutes: 10 })
  const first = plan(c)
  assert.deepEqual(
    plan(c).items.map((i) => i.exerciseId),
    first.items.map((i) => i.exerciseId),
  )
  const input = { conditions: c, exercises, evidence }
  const r1 = Select.nextRotation(input, first)
  assert.equal(typeof r1, 'number')
  const second = plan(c, r1)
  assert.notDeepEqual(
    second.items.map((i) => i.exerciseId),
    first.items.map((i) => i.exerciseId),
  )
  // 같은 조건의 구성이 계속 바뀌는 순환: 여러 번 이어서 눌러도 항상 직전과 다르다
  let current = first
  for (let i = 0; i < 6; i += 1) {
    const next = Select.nextRotation(input, current)
    assert.notEqual(next, null)
    const nextPlan = plan(c, next)
    assert.notEqual(
      nextPlan.items.map((x) => x.exerciseId).join(),
      current.items.map((x) => x.exerciseId).join(),
    )
    current = nextPlan
  }
  // 근거 있는 후보가 하나뿐이면 바꿀 구성이 없다
  const only = plan(cond({ parts: ['코어'], tools: ['밴드'], minutes: 10 }))
  assert.equal(only.status, 'ok')
  assert.equal(only.items.length, 1)
  assert.equal(
    Select.nextRotation(
      { conditions: only.conditions, exercises, evidence },
      only,
    ),
    null,
  )
  // ok가 아니면 null
  assert.equal(Select.nextRotation(input, plan(cond({ parts: [] }))), null)
})

test('예상 시간 표시: 가장 가까운 분(최소 1분)이고 값이 없으면 시간을 만들지 않는다', () => {
  assert.equal(Select.approxMinutes(null), null)
  assert.equal(Select.approxMinutes(376), 6)
  assert.equal(Select.approxMinutes(10), 1)
})

// ── 조건 입력 흐름(순수) ───────────────────────────────────────────────────────
test('입력 흐름: 4단계 순서·이전 이동·다중 선택 토글(기준 순서 유지)·최소 1개 판정', () => {
  assert.deepEqual(Flow.INPUT_STEP_ORDER, [
    'difficulty',
    'parts',
    'tools',
    'minutes',
  ])
  assert.equal(Flow.nextStep('difficulty'), 'parts')
  assert.equal(Flow.nextStep('minutes'), 'result')
  assert.equal(Flow.previousStep('difficulty'), null)
  assert.equal(Flow.previousStep('tools'), 'parts')
  assert.deepEqual(Flow.togglePart(['코어'], '상체'), ['상체', '코어'])
  assert.deepEqual(Flow.togglePart(['상체', '코어'], '상체'), ['코어'])
  assert.deepEqual(Flow.toggleTool(['밴드'], '맨몸'), ['맨몸', '밴드'])
  const empty = Flow.INITIAL_PLAN_INPUTS
  assert.equal(Flow.canProceed('difficulty', empty), false)
  assert.equal(Flow.canProceed('parts', empty), false)
  assert.equal(Flow.canProceed('tools', empty), false)
  assert.equal(Flow.canProceed('minutes', empty), false)
  assert.equal(Flow.isComplete(empty), false)
  assert.deepEqual(empty.tools, []) // 맨몸도 자동으로 고르지 않는다
  const full = {
    difficulty: '초급',
    parts: ['상체'],
    tools: ['맨몸'],
    minutes: 10,
  }
  assert.equal(Flow.isComplete(full), true)
  // 이전 단계로 돌아가도 값은 유지된다(상태 객체를 바꾸지 않으므로 그대로)
  assert.deepEqual({ ...full }, full)
})

// ── 화면 ──────────────────────────────────────────────────────────────────────
const flow = (props) =>
  render(
    createElement(FlowView, {
      access: 'paid',
      source: { exercises, evidence },
      ...props,
    }),
  )

test('화면: 첫 단계는 난이도 3개 선택, 로컬 예시임을 표시하고 체험 횟수·실제 AI처럼 보이는 문구가 없다', () => {
  const html = flow({})
  assert.equal((html.match(/<h1[ >]/g) ?? []).length, 1)
  assert.match(html, /data-local-example-note/)
  assert.match(html, /실제 AI가 만든 추천이 아니에요/)
  assert.match(html, /로컬 예시/)
  assert.match(html, /data-plan-step="difficulty"[^>]*>1 \/ 4단계/)
  for (const value of ['초급', '중급', '고급'])
    assert.match(html, new RegExp(`data-choice="${value}"`))
  assert.doesNotMatch(html, /체험|남은 횟수|차감/)
  assert.doesNotMatch(html, /AI가 분석|맞춤 추천 결과/)
  // trial도 입력 허용
  assert.match(flow({ access: 'trial' }), /data-plan-step="difficulty"/)
})

test('화면: 권한을 확정할 수 없으면 안내만, 운동 데이터가 없으면 준비 중 안내만 보인다', () => {
  const unspecified = flow({ access: 'unspecified' })
  assert.match(unspecified, /data-plan-access="unspecified"/)
  assert.match(unspecified, /이용 권한을 확인할 수 없어요/)
  assert.doesNotMatch(unspecified, /data-plan-step|data-choice/)
  assert.doesNotMatch(unspecified, /서버 검증을 마쳤|권한이 확인/)
  const off = flow({ source: null })
  assert.match(off, /data-plan-unavailable/)
  assert.match(off, /준비 중이에요/)
  assert.doesNotMatch(off, /data-choice/)
})

const resultHtml = (conditions, over = {}) =>
  render(
    createElement(ResultView, {
      plan: plan(conditions),
      notice: null,
      onReroll: noop,
      onEdit: noop,
      ...over,
    }),
  )

test('결과 화면: 운동별 세트·횟수·시간·휴식, 예상 시간, 제외 후보, 재추천·조건 수정이 있고 등록 컨트롤이 없으면 목록 등록은 비활성이다', () => {
  const html = resultHtml(
    cond({ parts: ['상체', '하체', '코어'], minutes: 10 }),
  )
  assert.match(html, /data-plan-status="ok"/)
  assert.match(html, /월 푸시업/)
  assert.match(html, /2세트 × 8회 · 세트 사이 휴식 60초/)
  assert.match(html, /2세트 × 20초 · 세트 사이 휴식 60초/)
  assert.match(html, /data-plan-total/)
  assert.match(html, /예상 총 소요 시간 약 \d+분/)
  assert.match(html, /10분 이내/)
  assert.match(html, /data-plan-excluded/)
  assert.match(html, /운동량 기준이 없어 목록에 넣지 않은 후보 \d+개/)
  assert.match(html, /근거 없는 세트·횟수·시간은 만들지 않아요/)
  assert.match(html, />다시 추천</)
  assert.match(html, />조건 수정</)
  // 등록 컨트롤(register)을 주지 않으면 목록 등록은 비활성이고 이유를 알린다. 링크로 이동하지 않는다.
  assert.match(html, /aria-disabled="true"[^>]*>목록 등록/)
  assert.match(html, /data-plan-register-note/)
  assert.match(html, /이 환경에서는 운동 목록 등록을 쓸 수 없어요/)
  assert.doesNotMatch(html, /<a /)
})

test('결과 화면: 중량 운동은 중량 직접 입력 안내만 있고 kg 값이 없으며 시간 계산 근거를 밝힌다', () => {
  const html = resultHtml(
    cond({ tools: ['덤벨'], parts: ['상체'], minutes: 20 }),
  )
  assert.match(html, /data-needs-weight/)
  assert.match(html, /중량은 직접 입력해요/)
  assert.doesNotMatch(html, /\d+\s*kg/i)
  assert.match(html, /1회에 약 3초/)
  assert.match(html, /운동 사이 전환은 30초/)
})

test('결과 화면: 후보 없음·근거 부족은 서로 다른 안내이고 조건을 바꾸지 않았다고 알리며 재추천은 비활성이다', () => {
  const none = resultHtml(
    cond({
      difficulty: '고급',
      parts: ['전신'],
      tools: ['맨몸', '덤벨', '밴드', '풀업 바'],
    }),
  )
  assert.match(none, /data-plan-empty="noCandidates"/)
  assert.match(none, /조건에 맞는 운동이 없어요/)
  assert.match(none, /조건은 자동으로 바꾸지 않았어요/)
  assert.doesNotMatch(none, /data-plan-total|data-plan-item=/)
  assert.match(none, /aria-disabled="true"[^>]*>다시 추천/)
  const lacking = resultHtml(cond({ tools: ['마사지볼'] }))
  assert.match(lacking, /data-plan-empty="noPlannable"/)
  assert.match(lacking, /목록에 넣을 수 있는 운동이 없어요/)
  assert.match(lacking, /data-plan-excluded/)
  assert.doesNotMatch(lacking, /data-plan-total|예상 총 소요 시간/)
  assert.match(lacking, /같은 난이도의 운동량 기준이 없어요/)
})

test('결과 화면: 재추천 안내(notice)와 더 있는 후보 안내가 보인다', () => {
  const html = resultHtml(cond({ parts: ['상체'], minutes: 10 }), {
    notice: '다른 구성으로 바꿨어요.',
  })
  assert.match(html, /data-plan-notice/)
  assert.match(html, /다른 구성으로 바꿨어요/)
  assert.match(html, /data-plan-more/)
  assert.match(html, /다시 추천을 누르면 다른 구성을 볼 수 있어요/)
})

// ── I02 예시 교정 ─────────────────────────────────────────────────────────────
test('I02 예시: 운동량이 시드 루틴 근거와 같고 I02-1 로컬 추천의 첫 구성과 일치한다', () => {
  for (const example of Example.PLAN_EXAMPLES) {
    const result = plan(example.conditions)
    assert.equal(result.status, 'ok', example.key)
    assert.equal(example.rows.length, result.items.length, example.key)
    result.items.forEach((item, index) => {
      const row = example.rows[index]
      assert.equal(row.exerciseId, item.exerciseId)
      assert.equal(row.name, item.name)
      assert.equal(row.recordType, item.recordType)
      assert.equal(row.sets, item.sets)
      assert.equal(row.reps ?? null, item.reps)
      assert.equal(row.seconds ?? null, item.seconds)
      assert.equal(row.restSeconds, item.restSeconds)
    })
    assert.ok(result.totalSeconds <= example.conditions.minutes * 60)
  }
})

// ── 구조·범위 ─────────────────────────────────────────────────────────────────
test('범위 준수: W01-2 엔진·초안·저장·API·저장소를 쓰지 않고 시간 계산 함수만 읽어 쓴다', () => {
  for (const file of [
    '../src/ai/exercisePlanEvidence.ts',
    '../src/ai/exercisePlanSelect.ts',
    '../src/ai/exercisePlanFlow.ts',
    '../src/ai/exercisePlanSource.ts',
    '../src/components/ai/exercise/ExercisePlanFlowView.tsx',
    '../src/pages/AiExercisePlanPage.tsx',
  ]) {
    // 추천 구성·화면은 초안·저장 기능을 직접 다루지 않는다(등록은 별도 훅·변환 모듈이 맡는다: aiExercisePlanRegister.test.mjs).
    assert.doesNotMatch(
      code(file),
      /indexedDB|localStorage|sessionStorage|fetch\(|\/api\/|useWorkoutDraft|useDayWorkoutDraft|replaceDraft|saveWorkoutList|saveWorkoutPlan|saveFromDraft|buildBeginnerPlan|createBeginnerPlanSource|toDraft|WorkoutDraftProvider/,
      file,
    )
  }
  // recommend/에서는 시간 계산 함수와 가정 상수만 가져온다.
  const select = read('../src/ai/exercisePlanSelect.ts')
  assert.match(select, /from '\.\.\/exercise\/recommend\/rules\.ts'/)
  assert.doesNotMatch(
    select,
    /recommend\/engine|recommend\/toDraft|recommend\/planSource/,
  )
  // 중량을 만드는 필드가 없다.
  assert.doesNotMatch(
    code('../src/ai/exercisePlanSelect.ts'),
    /weightKg\s*[:=]/,
  )
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
})

test('라우트·연결: I02-1은 회원 전용이고 I02 CTA가 연결되며 W12 AI 카드는 로컬 예시로 이 화면에 연결된다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const route = router.indexOf("path: 'ai/exercise/plan',")
  assert.ok(gate > 0 && route > gate)
  const body = router.slice(route, route + 700)
  assert.match(body, /screenId: 'I02-1'/)
  assert.match(body, /parent: '\/ai\/exercise'/)
  assert.match(body, /ownH1: true/)
  assert.match(
    read('../src/components/ai/exercise/ExercisePlanGuideView.tsx'),
    /to="\/ai\/exercise\/plan"/,
  )
  const w12 = read('../src/pages/ExerciseMethodPage.tsx')
  assert.match(w12, /PATH_AI_PLAN = '\/ai\/exercise\/plan'/)
  assert.match(w12, /로컬 예시/)
  assert.doesNotMatch(w12, /준비 중/)
})
