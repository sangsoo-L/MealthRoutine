import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// S7 P2-4: 초급 추천 화면의 순수 로직(입력 상태·요청·문구), 계정별 임시 저장, 화면 컴포넌트 정적 렌더링, 연결(라우트·권한·W12 보호).
// 브라우저 동작은 별도 Chrome + IndexedDB 검증 스크립트로 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Flow
let Storage
let Engine
let Rules
let Seed
let Result
let Conditions
let Taxonomy
let catalog
let source

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Flow = await server.ssrLoadModule('/src/exercise/recommend/planFlow.ts')
  Storage = await server.ssrLoadModule('/src/exercise/recommend/planStorage.ts')
  Engine = await server.ssrLoadModule('/src/exercise/recommend/engine.ts')
  Rules = await server.ssrLoadModule('/src/exercise/recommend/rules.ts')
  Seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  Taxonomy = await server.ssrLoadModule('/src/exercise/exerciseTaxonomy.ts')
  Result = (
    await server.ssrLoadModule(
      '/src/components/exercise/plan/PlanResultView.tsx',
    )
  ).default
  const cond = await server.ssrLoadModule(
    '/src/components/exercise/plan/PlanConditions.tsx',
  )
  Conditions = cond
  catalog = Seed.getSeedCatalog()
  source = Engine.createPlanSource(catalog)
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const noop = () => {}
const requestOf = (over = {}) => ({
  exerciseTier: 'beginner',
  purpose: 'learn',
  availableMinutes: 20,
  tools: ['맨몸'],
  mode: 'automatic',
  ...over,
})
const planOf = (over) => {
  const r = Engine.buildBeginnerPlan(requestOf(over), source)
  assert.equal(r.ok, true)
  return r.plan
}

// ── 순수 로직 ───────────────────────────────────────────────
test('요청 만들기: 현재 확인한 이해도를 그대로 넘기고, 직접 선택일 때만 운동 id를 담는다(고르지 않은 값은 null)', () => {
  const inputs = {
    ...Flow.initialInputs('automatic'),
    purpose: 'lose',
    minutes: 20,
    rotation: 2,
  }
  assert.deepEqual(plain(Flow.toRequest(inputs, 'beginner')), {
    exerciseTier: 'beginner',
    purpose: 'lose',
    availableMinutes: 20,
    tools: ['맨몸'],
    mode: 'automatic',
    rotation: 2,
  })
  const selected = {
    ...Flow.initialInputs('selected'),
    purpose: 'learn',
    minutes: 10,
    selectedIds: ['4', '22'],
  }
  assert.deepEqual(
    plain(Flow.toRequest(selected, 'beginner').selectedExerciseIds),
    ['4', '22'],
  )
  // 아직 고르지 않은 값은 임의로 채우지 않는다 → 엔진이 거부한다
  const empty = Flow.toRequest(Flow.initialInputs('automatic'), 'beginner')
  assert.equal(empty.purpose, null)
  assert.equal(empty.availableMinutes, null)
  assert.equal(Engine.buildBeginnerPlan(empty, source).ok, false)
  // 화면이 이해도를 임의로 적지 않는다: 호출자가 준 값(예: 중급)이 그대로 엔진에 간다
  assert.equal(
    Flow.toRequest(inputs, 'intermediate').exerciseTier,
    'intermediate',
  )
  assert.equal(
    Engine.buildBeginnerPlan(Flow.toRequest(inputs, 'intermediate'), source).ok,
    false,
  )
})

test('추천 가능 입력: 목표·시간(5~180)·직접 선택은 운동 1개 이상', () => {
  const base = Flow.initialInputs('automatic')
  assert.equal(Flow.isReadyForPlan(base), false)
  assert.equal(Flow.isReadyForPlan({ ...base, purpose: 'learn' }), false)
  assert.equal(
    Flow.isReadyForPlan({ ...base, purpose: 'learn', minutes: 4 }),
    false,
  )
  assert.equal(
    Flow.isReadyForPlan({ ...base, purpose: 'learn', minutes: 181 }),
    false,
  )
  assert.equal(
    Flow.isReadyForPlan({ ...base, purpose: 'learn', minutes: 5 }),
    true,
  )
  const sel = Flow.initialInputs('selected')
  assert.equal(
    Flow.isReadyForPlan({ ...sel, purpose: 'lose', minutes: 20 }),
    false,
  )
  assert.equal(
    Flow.isReadyForPlan({
      ...sel,
      purpose: 'lose',
      minutes: 20,
      selectedIds: ['4'],
    }),
    true,
  )
})

test('입력 변경: 도구(맨몸은 끌 수 없다)·운동 추가(중복 건너뜀)·빼기·교체(같은 자리, 중복이면 거부)·회전값', () => {
  assert.deepEqual([...Flow.toggleTool(['맨몸'], '밴드')], ['맨몸', '밴드'])
  assert.deepEqual([...Flow.toggleTool(['맨몸', '밴드'], '밴드')], ['맨몸'])
  assert.deepEqual(
    [...Flow.toggleTool(['맨몸', '밴드'], '맨몸')],
    ['맨몸', '밴드'],
  )
  const added = Flow.appendSelected(['4', '22'], ['22', '16', '4', '13'])
  assert.deepEqual(
    [[...added.ids], added.skipped],
    [['4', '22', '16', '13'], 2],
  )
  assert.deepEqual(
    [...Flow.removeSelected(['4', '22', '16'], '22')],
    ['4', '16'],
  )
  assert.deepEqual(
    [...Flow.replaceSelected(['4', '22', '16'], '22', '98')],
    ['4', '98', '16'],
  )
  assert.equal(Flow.replaceSelected(['4', '22', '16'], '22', '16'), null) // 이미 있는 운동
  assert.equal(Flow.replaceSelected(['4', '22'], '99', '98'), null) // 바꿀 운동이 없다
  assert.deepEqual(
    [...Flow.replaceSelected(['4', '22'], '22', '22')],
    ['4', '22'],
  )
  assert.equal(Flow.nextRotation(0), 1)
})

test('사용자 문구: 약 N분(올림, 최소 1분)·요약 한 줄·세트 줄·휴식 줄(1세트는 없음)·안전 안내', () => {
  assert.equal(Flow.approxMinutesLabel(1), '약 1분')
  assert.equal(Flow.approxMinutesLabel(60), '약 1분')
  assert.equal(Flow.approxMinutesLabel(61), '약 2분')
  assert.equal(Flow.approxMinutesLabel(596), '약 10분')
  assert.equal(
    Flow.summaryLine({ availableMinutes: 30, estimatedTotalSeconds: 596 }),
    '최대 30분 가능 · 추천 운동 약 10분',
  )
  const reps = {
    recordType: 'reps',
    sets: [{ reps: 8 }, { reps: 8 }],
    restSeconds: 60,
  }
  const time = {
    recordType: 'time',
    sets: [{ targetSeconds: 60 }],
    restSeconds: 30,
  }
  assert.equal(Flow.setsLine(reps), '2세트 · 한 세트에 8번')
  assert.equal(Flow.setsLine(time), '1세트 · 한 세트에 60초')
  assert.equal(Flow.restLine(reps), '세트 사이 약 60초 쉬어요')
  assert.equal(Flow.restLine(time), null)
  assert.match(Flow.PLAN_TEXT.safety, /전문 운동 처방은 아니에요/)
  assert.match(Flow.PLAN_TEXT.safety, /통증이나 어지러움/)
  assert.match(Flow.PLAN_TEXT.restNote, /자동으로 재 주지는 않아요/) // 휴식이 진행 화면에 적용된다고 안내하지 않는다
  assert.match(Flow.PLAN_TEXT.timeNote, /꼭 채우지 않아도/)
})

test('목표 선택지는 엔진이 지원하는 목표와 같고 내부 코드명을 보이지 않는다', () => {
  assert.deepEqual(
    [...Flow.PURPOSE_CHOICE_VALUES].sort(),
    [...Rules.PLAN_PURPOSES].sort(),
  )
  assert.deepEqual(
    Flow.PURPOSE_CHOICES.map((c) => c.label),
    ['운동 습관 만들기', '현재 운동 습관 유지', '체중 관리'],
  )
  for (const choice of Flow.PURPOSE_CHOICES) {
    assert.doesNotMatch(
      `${choice.label}${choice.hint}`,
      /learn|maintain|lose|reps/,
    )
  }
})

// ── 임시 저장 ───────────────────────────────────────────────
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
}
const goodSession = () => ({
  step: 'result',
  inputs: {
    mode: 'selected',
    purpose: 'learn',
    minutes: 20,
    tools: ['맨몸', '밴드'],
    selectedIds: ['4', '22'],
    rotation: 3,
  },
  replacingId: null,
  resultIds: ['4', '22'],
})

test('임시 저장: 저장·복원이 같고 계정 정리 접두어 키를 쓰며 결과 본문은 저장하지 않는다', () => {
  const storage = memoryStorage()
  assert.equal(Storage.savePlanSession('userA', goodSession(), storage), true)
  assert.ok(Storage.PLAN_STATE_KEY.startsWith('mealthroutine.account.'))
  assert.deepEqual(
    plain(Storage.readPlanSession('userA', storage)),
    goodSession(),
  )
  const raw = storage.getItem(Storage.PLAN_STATE_KEY)
  assert.doesNotMatch(
    raw,
    /restSeconds|estimatedSeconds|"reason"|"warnings"|"items"/,
  )
  assert.doesNotMatch(raw, /userA/) // 사용자 id를 키·값에 그대로 넣지 않는다
})

test('임시 저장: 다른 계정의 값·손상된 값·범위 밖 값·알 수 없는 도구·형식 오류는 전체를 버리고 지운다', () => {
  const save = (session, user = 'userA') => {
    const storage = memoryStorage()
    Storage.savePlanSession(user, session, storage)
    return storage
  }
  // 다른 계정
  const other = save(goodSession(), 'userA')
  assert.equal(Storage.readPlanSession('userB', other), null)
  assert.equal(other.getItem(Storage.PLAN_STATE_KEY), null) // 지웠다
  // 손상
  const broken = memoryStorage({ [Storage.PLAN_STATE_KEY]: '{not json' })
  assert.equal(Storage.readPlanSession('userA', broken), null)
  assert.equal(broken.getItem(Storage.PLAN_STATE_KEY), null)
  // 값 변조
  const mutate = (fn) => {
    const s = goodSession()
    fn(s)
    return s
  }
  const bad = [
    mutate((s) => (s.inputs.minutes = 999)),
    mutate((s) => (s.inputs.minutes = 4)),
    mutate((s) => (s.inputs.minutes = 12.5)),
    mutate((s) => (s.inputs.purpose = 'bulk')),
    mutate((s) => (s.inputs.mode = 'auto')),
    mutate((s) => (s.inputs.tools = ['덤벨벨'])),
    mutate((s) => (s.inputs.tools = '맨몸')),
    mutate((s) => (s.inputs.selectedIds = [4])),
    mutate((s) => (s.inputs.selectedIds = [''])),
    mutate((s) => (s.inputs.rotation = -1)),
    mutate((s) => (s.inputs.rotation = 1.5)),
    mutate((s) => (s.step = 'done')),
    mutate((s) => (s.replacingId = 4)),
    mutate((s) => (s.resultIds = [1])),
    mutate((s) => delete s.inputs),
  ]
  for (const session of bad) {
    const storage = save(session)
    assert.equal(
      Storage.readPlanSession('userA', storage),
      null,
      JSON.stringify(session),
    )
    assert.equal(storage.getItem(Storage.PLAN_STATE_KEY), null)
  }
  // 맨몸은 항상 포함되어 복원된다(도구 목록에서 빠져 있어도)
  const noBody = mutate((s) => (s.inputs.tools = ['밴드']))
  assert.deepEqual(
    [...Storage.readPlanSession('userA', save(noBody)).inputs.tools].sort(),
    ['맨몸', '밴드'],
  )
  // 저장소를 쓸 수 없으면 false/null이고 화면은 계속 동작한다
  assert.equal(Storage.savePlanSession('userA', goodSession(), null), false)
  assert.equal(Storage.readPlanSession('userA', null), null)
  const failing = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota')
    },
    removeItem: () => {},
  }
  assert.equal(Storage.savePlanSession('userA', goodSession(), failing), false)
  // 지우기
  const store = save(goodSession())
  Storage.clearPlanSession(store)
  assert.equal(store.getItem(Storage.PLAN_STATE_KEY), null)
})

// ── 화면 컴포넌트(정적 렌더) ───────────────────────────────
const resultProps = (plan, over = {}) => ({
  plan,
  headingRef: createRef(),
  confirming: false,
  error: null,
  notice: null,
  onConfirm: noop,
  onRetry: plan.mode === 'automatic' ? noop : null,
  onEditConditions: noop,
  onReplace: noop,
  onRemove: plan.mode === 'selected' ? noop : null,
  ...over,
})
const render = (plan, over) =>
  renderToStaticMarkup(createElement(Result, resultProps(plan, over)))

test('결과 화면(자동): 요약·역할 순서·세트·목표·휴식·이유·안전 안내를 보이고 내부 코드명은 없다', () => {
  const plan = planOf({ availableMinutes: 30 })
  const html = render(plan)
  assert.match(html, /오늘의 운동이 준비됐어요/)
  assert.match(html, /최대 30분 가능 · 추천 운동 약 \d+분/)
  assert.match(html, /시작 운동/)
  assert.match(html, /주요 운동/)
  assert.match(html, /마무리 운동/)
  assert.ok(html.indexOf('시작 운동') < html.indexOf('주요 운동'))
  assert.ok(html.lastIndexOf('주요 운동') < html.indexOf('마무리 운동'))
  assert.match(html, /1세트 · 한 세트에 60초/)
  assert.match(html, /2세트 · 한 세트에 8번/)
  assert.match(html, /세트 사이 약 60초 쉬어요/)
  assert.match(html, /오늘의 운동 목표와 가능 시간에 맞춰 골랐어요/)
  assert.match(html, /전문 운동 처방은 아니에요/)
  assert.match(html, /자동으로 재 주지는 않아요/)
  assert.match(html, /다시 추천받기/)
  assert.match(html, /조건 바꾸기/)
  assert.doesNotMatch(
    html,
    /reps|time_reps|weight_time|recordType|beginner|purposeFit|rotation/,
  )
  // 확정 버튼은 활성(aria-disabled=false)
  assert.match(html, /aria-disabled="false"[^>]*>이 운동으로 목록 확인하기/)
  // 항목마다 교체 버튼이 있다
  assert.equal(
    (html.match(/다른 운동으로 바꾸기<\/span><span class="sr-only">/g) ?? [])
      .length,
    plan.items.length,
  )
})

test('결과 화면(직접 선택): 순서만 있고 역할 배지는 없으며 추천 불가 운동·사유·교체/빼기 버튼, 확정 비활성과 이유', () => {
  const plan = planOf({
    mode: 'selected',
    selectedExerciseIds: ['4', '87', '22', '999'],
    availableMinutes: 20,
  })
  const html = render(plan)
  assert.match(html, /확인이 필요해요/)
  assert.match(html, /직접 고른 운동이에요\. 순서는 고른 그대로예요/)
  assert.doesNotMatch(html, /시작 운동|마무리 운동|주요 운동/)
  assert.match(html, /자동으로 정할 수 없는 운동이 있어요/)
  assert.match(html, /덤벨 수트케이스 캐리/)
  assert.match(html, /중량이 필요한 운동이라 자동으로 구성하지 않아요/)
  assert.match(html, /알 수 없는 운동/)
  assert.match(html, /마음대로 지우거나 바꾸지 않았어요/)
  assert.match(html, /aria-disabled="true"[^>]*>이 운동으로 목록 확인하기/)
  assert.match(
    html,
    /자동으로 정할 수 없는 운동을 바꾸거나 빼면 확정할 수 있어요/,
  )
  assert.match(html, /덤벨 수트케이스 캐리 목록에서 빼기/)
  assert.match(html, /덤벨 수트케이스 캐리 다른 운동으로 바꾸기/)
  assert.doesNotMatch(html, /다시 추천받기/) // 직접 선택에는 다시 추천이 없다
  // 부분 변환 없이 남은 운동은 순서대로 계산돼 보인다
  assert.ok(html.indexOf('월 푸시업') < html.indexOf('플랭크'))
})

test('결과 화면: 시간 초과(최소 세트로도 넘음)는 필요한 시간·들어가는 개수를 안내하고 확정이 비활성이다', () => {
  const ids = catalog
    .getAllExercises()
    .filter(
      (e) =>
        Rules.classifyExercise(e, {
          tools: ['맨몸'],
          evidence: source.evidence,
        }).eligible,
    )
    .map((e) => e.id)
  const plan = planOf({
    mode: 'selected',
    selectedExerciseIds: ids,
    availableMinutes: 5,
  })
  assert.ok(plan.overtime)
  const html = render(plan)
  assert.match(html, /가장 적은 세트로 해도 약 \d+분이 필요해요/)
  assert.match(html, /시간을 \d+분 이상으로 바꾸거나 운동을 줄여 주세요/)
  assert.match(html, /앞의 \d+개는 지금 시간에 들어가요/)
  assert.match(html, /시간을 늘리거나 운동을 줄이면 확정할 수 있어요/)
  assert.match(html, /aria-disabled="true"[^>]*>이 운동으로 목록 확인하기/)
  assert.equal(plan.items.length, ids.length) // 운동을 지우지 않았다
})

test('결과 화면: 편중 안내·확정 중 상태·오류·안내 문구를 보이고, 확정 중에는 버튼이 비활성이다', () => {
  const skew = planOf({
    mode: 'selected',
    selectedExerciseIds: ['16', '73', '13', '19'],
    availableMinutes: 30,
  })
  assert.match(
    render(skew),
    /하체 운동이 많아요\. 다른 부위 운동을 섞어도 좋아요\. \(안내용이에요\)/,
  )
  const plan = planOf({ availableMinutes: 20 })
  const busy = render(plan, { confirming: true })
  assert.match(busy, /aria-disabled="true"[^>]*>확인하는 중…/)
  assert.match(
    render(plan, {
      error: '추천 결과가 바뀐 것 같아요. 다시 추천받아 주세요.',
    }),
    /role="alert"[^>]*>추천 결과가 바뀐 것 같아요/,
  )
  assert.match(
    render(plan, { notice: '운동을 바꿨어요.' }),
    /role="status"[^>]*>운동을 바꿨어요\./,
  )
})

// S8-UI-1: 조건 설정은 한 화면에 질문 하나씩 보여 주는 단계 화면이다(이전에는 한 화면에 목표·시간·도구를 모두 보였다).
const condProps = (over = {}) => ({
  step: 1,
  direction: 'next',
  headingRef: createRef(),
  inputs: Flow.initialInputs('automatic'),
  toolChoices: Rules.listEligibleTools(source.exercises, source.evidence),
  minutesFromGoal: null,
  selectedRows: [],
  backLabel: '이전 단계로 돌아가기',
  onBack: noop,
  onPurpose: noop,
  onMinutes: noop,
  onToggleTool: noop,
  onPick: noop,
  onRemoveSelected: noop,
  onNext: noop,
  ...over,
})
const renderCond = (over) =>
  renderToStaticMarkup(createElement(Conditions.default, condProps(over)))
const visibleText = (html) => html.replace(/<[^>]*>/g, ' ')

test('조건 1단계(목표): 질문이 h1이고 목표 3개(라디오)만 보이며 다음은 비활성이고 이유가 보인다', () => {
  const html = renderCond()
  assert.match(html, /<h1[^>]*>어떤 목표로 운동하고 싶으세요\?<\/h1>/)
  assert.match(html, /목표에 맞춰 운동을 추천해 드릴게요\./)
  for (const label of ['운동 습관 만들기', '현재 운동 습관 유지', '체중 관리'])
    assert.match(html, new RegExp(label))
  assert.equal((html.match(/type="radio"/g) ?? []).length, 3)
  assert.match(html, /role="radiogroup"[^>]*aria-labelledby=/)
  // 다른 단계의 질문은 같은 화면에 없다
  assert.doesNotMatch(html, /얼마나 운동할 수 있나요|운동 도구가 있나요/)
  assert.doesNotMatch(html, /type="checkbox"|aria-pressed/)
  assert.match(html, /aria-disabled="true"[^>]*>다음</)
  assert.match(html, /role="status"[^>]*>운동 목표를 골라 주세요\./)
  assert.doesNotMatch(visibleText(html), /learn|maintain|lose|reps/) // 내부 코드는 보이지 않는다
})

test('조건 단계 공통: 이전 버튼·"1/3단계" 글자·진행률 막대(보조기기용 값과 문구)', () => {
  const html = renderCond()
  assert.match(html, /aria-label="이전 단계로 돌아가기"/)
  assert.match(html, />1\/3단계</)
  assert.match(
    html,
    /role="progressbar"[^>]*aria-valuemin="1"[^>]*aria-valuemax="3"[^>]*aria-valuenow="1"[^>]*aria-valuetext="3단계 중 1단계"/,
  )
  for (const step of [2, 3]) {
    const text = renderCond({ step })
    assert.match(text, new RegExp(`>${step}/3단계<`))
    assert.match(text, new RegExp(`aria-valuenow="${step}"`))
  }
  // 직접 선택은 운동 고르기가 더해져 4단계다
  const selected = renderCond({
    step: 2,
    inputs: Flow.initialInputs('selected'),
  })
  assert.match(selected, />2\/4단계</)
  assert.match(selected, /aria-valuemax="4"[^>]*aria-valuenow="2"/)
})

test('조건 2단계(시간): 10·20·30분 빠른 선택과 5~180분 직접 입력, 선택 상태는 aria-pressed와 ✓로 보인다', () => {
  const html = renderCond({ step: 2 })
  assert.match(html, /<h1[^>]*>오늘은 얼마나 운동할 수 있나요\?<\/h1>/)
  assert.match(html, /부담 없이 운동할 수 있는 시간을 선택해 주세요\./)
  for (const m of [10, 20, 30])
    assert.match(html, new RegExp(`aria-pressed="false"[^>]*>${m}분`))
  assert.match(html, /직접 입력\(분, 5~180분\)/)
  assert.match(html, /꼭 채우지 않아도 괜찮아요/)
  assert.doesNotMatch(html, /어떤 목표로 운동|운동 도구가 있나요/)
  assert.match(html, /aria-disabled="true"[^>]*>다음</)
  assert.match(html, /role="status"[^>]*>운동 가능 시간을 골라 주세요\./)
  // 빠른 선택에 없는 값(예: 45분, 180분)도 직접 입력으로 고를 수 있어 값이 유지된다
  const typed = renderCond({
    step: 2,
    inputs: {
      ...Flow.initialInputs('automatic'),
      purpose: 'learn',
      minutes: 45,
    },
  })
  assert.match(typed, /value="45"/)
  assert.match(typed, /aria-disabled="false"[^>]*>다음</)
  // 빠른 선택에 있는 값은 선택 표시(aria-pressed·✓)가 보인다
  const preset = renderCond({
    step: 2,
    inputs: {
      ...Flow.initialInputs('automatic'),
      purpose: 'lose',
      minutes: 20,
    },
  })
  assert.match(preset, /aria-pressed="true"[^>]*>(<span[^>]*>✓<\/span>)?20분/)
})

test('조건 2단계: 운동 목표 요약에서 가져온 시간은 출처를 안내한다', () => {
  const inputs = {
    ...Flow.initialInputs('automatic'),
    purpose: 'lose',
    minutes: 30,
  }
  const html = renderCond({ step: 2, inputs, minutesFromGoal: 30 })
  assert.match(
    html,
    /운동 목표에서 가져온 시간이에요\. 오늘만 바꿀 수 있고 목표는 바뀌지 않아요/,
  )
  assert.match(html, /aria-pressed="true"[^>]*>(<span[^>]*>✓<\/span>)?30분/)
  assert.match(html, /aria-disabled="false"[^>]*>다음</)
})

test('조건 3단계(도구): 맨몸은 고정, 선택은 추천에 쓸 수 있는 도구뿐이며 고르지 않아도 진행되고 마지막 버튼은 "운동 추천받기"다(S8-UI-1A: 목록은 E01과 같고 쓸 수 없는 도구는 보이되 고를 수 없다)', () => {
  const html = renderCond({
    step: 3,
    inputs: {
      ...Flow.initialInputs('automatic'),
      purpose: 'learn',
      minutes: 20,
    },
  })
  assert.match(html, /<h1[^>]*>사용할 수 있는 운동 도구가 있나요\?<\/h1>/)
  assert.match(html, /가지고 있는 도구를 선택하면 가능한 운동을 찾아드려요\./)
  assert.match(
    html,
    /<input(?=[^>]*type="checkbox")(?=[^>]*checked="")(?=[^>]*disabled="")/,
  ) // 맨몸: 항상 켜짐
  assert.match(html, /밴드/)
  // S8-UI-1A: 도구 목록은 운동 탐색(E01)과 같은 6종이다. 이전에는 추천할 수 없는 도구(덤벨·폼롤러·마사지볼·풀업 바)를 숨겼지만, 지금은 보이되 고를 수 없고
  // 이유를 글자로 보여 준다(선택은 되는데 추천에는 반영되지 않는 상태를 만들지 않는다). 상세는 planToolChoices.test.mjs.
  for (const name of ['덤벨', '폼롤러', '마사지볼', '풀업 바'])
    assert.match(html, new RegExp(name))
  assert.equal(
    (html.match(/초급 자동 추천에 쓸 수 있는 운동이 아직 없어요/g) ?? [])
      .length,
    4,
  )
  assert.match(html, /aria-disabled="false"[^>]*>운동 추천받기</) // 도구는 필수가 아니다
  assert.doesNotMatch(html, /role="status"/)
  assert.doesNotMatch(html, />다음</)
  // 고른 도구는 체크 상태로 보인다
  const band = renderCond({
    step: 3,
    inputs: {
      ...Flow.initialInputs('automatic'),
      purpose: 'learn',
      minutes: 20,
      tools: ['맨몸', '밴드'],
    },
  })
  assert.equal((band.match(/checked=""/g) ?? []).length, 2)
})

test('조건 단계(직접 선택): 3단계는 "다음", 4단계에 고른 운동의 이름·부위·난이도·도구·자동 구성 가능 여부와 빼기/더 고르기', () => {
  const inputs = {
    ...Flow.initialInputs('selected'),
    purpose: 'learn',
    minutes: 20,
    selectedIds: ['4', '87'],
  }
  assert.match(
    renderCond({ step: 3, inputs }),
    /aria-disabled="false"[^>]*>다음</,
  )
  const rows = [
    {
      id: '4',
      name: '월 푸시업',
      meta: '가슴 · 초급 · 맨몸',
      status: '자동으로 구성할 수 있어요',
      usable: true,
    },
    {
      id: '87',
      name: '덤벨 수트케이스 캐리',
      meta: '전신 · 중급 · 덤벨',
      status:
        '중량이 필요한 운동이라 자동으로 구성하지 않아요. 다른 운동으로 바꿔 보세요.',
      usable: false,
    },
  ]
  const html = renderCond({ step: 4, inputs, selectedRows: rows })
  assert.match(html, /<h1[^>]*>어떤 운동으로 구성할까요\?<\/h1>/)
  assert.match(html, /월 푸시업/)
  assert.match(html, /가슴 · 초급 · 맨몸/)
  assert.match(html, /✓ 자동으로 구성할 수 있어요/)
  assert.match(html, /⚠ 중량이 필요한 운동이라/)
  assert.match(html, /월 푸시업 목록에서 빼기/)
  assert.match(html, /운동 더 고르기/)
  assert.match(html, />세트와 목표 자동으로 정하기</)
  assert.match(html, />4\/4단계</)
  // 선택이 없으면 안내와 "운동 고르기"가 있고 마지막 버튼은 비활성이다
  const empty = renderCond({
    step: 4,
    inputs: {
      ...Flow.initialInputs('selected'),
      purpose: 'learn',
      minutes: 20,
    },
  })
  assert.match(empty, /아직 고른 운동이 없어요/)
  assert.match(empty, />운동 고르기</)
  assert.match(empty, /aria-disabled="true"[^>]*>세트와 목표 자동으로 정하기</)
  assert.match(empty, /role="status"[^>]*>운동을 하나 이상 골라 주세요\./)
})

test('구성 방법 선택 화면: 두 선택지의 문구(내부 코드 없음)', () => {
  const html = renderToStaticMarkup(
    createElement(Conditions.PlanModeChoice, { onChoose: noop }),
  )
  assert.match(html, /오늘의 운동 추천받기/)
  assert.match(html, /운동 목표와 시간을 선택하면 오늘 할 운동을 추천해 드려요/)
  assert.match(html, /직접 운동 선택하기/)
  assert.match(
    html,
    /하고 싶은 운동을 고르면 세트와 목표 횟수를 자동으로 설정해 드려요/,
  )
})

// ── 연결·보호(소스 확인) ────────────────────────────────────
test('연결: 추천 라우트는 AuthGate 안에 있고 화면 ID·URL은 임시이며 기존 라우트는 그대로다', () => {
  const router = read('../src/app/router.tsx')
  assert.match(router, /path: 'records\/exercise\/plan'/)
  assert.match(router, /screenId: 'W01-2'/)
  assert.ok(
    router.indexOf('<AuthGate />') <
      router.indexOf("path: 'records/exercise/plan'"),
  )
  assert.match(router, /createBrowserRouter/)
  assert.doesNotMatch(router, /HashRouter/)
  for (const path of [
    'records/exercise',
    'records/exercise/goal',
    'records/exercise/select',
    'records/exercise/new',
    'records/exercise/compose',
    'records/exercise/review',
    'records/exercise/session',
    'records/exercise/result',
  ]) {
    assert.match(
      router,
      new RegExp(`path: '${path.replaceAll('/', '\\/')}'`),
      path,
    )
  }
})

test('권한: 화면 진입·W01 진입·확정이 각각 운동 이해도를 확인하고 확정은 현재 이해도를 다시 조회한다', () => {
  const page = read('../src/pages/ExercisePlanPage.tsx')
  assert.match(page, /useExerciseLevel\(userId\)/)
  assert.match(page, /level\.status === 'loading'/)
  assert.match(page, /checkBeginnerPlanAccess\(level\.level\)/)
  // 확정: 이해도 재조회 → 권한 확인 → 새 요청으로 추천 → planToDraft → replaceDraft → W11
  const confirm = page.slice(
    page.indexOf('async function confirm()'),
    page.indexOf('function applyPending()'),
  )
  assert.ok(
    confirm.indexOf('loadExerciseLevel(userId)') <
      confirm.indexOf('checkBeginnerPlanAccess(tier)'),
  )
  assert.ok(
    confirm.indexOf('checkBeginnerPlanAccess(tier)') <
      confirm.indexOf('buildBeginnerPlan(request, source)'),
  )
  assert.ok(
    confirm.indexOf('buildBeginnerPlan(request, source)') <
      confirm.indexOf('planToDraft('),
  )
  assert.ok(confirm.indexOf('planToDraft(') < confirm.indexOf('replaceDraft('))
  assert.ok(
    confirm.indexOf('replaceDraft(') < confirm.indexOf('navigate(PATH_REVIEW'),
  )
  assert.match(confirm, /if \(busy\.current\) return/) // 연속 확정 방지
  assert.match(confirm, /new Date\(\)\.toISOString\(\)/) // 변환마다 새 updatedAt
  const entry = read(
    '../src/components/exercise/dashboard/BeginnerPlanEntry.tsx',
  )
  assert.match(entry, /canUseBeginnerPlan\(level\.level\)/)
  assert.match(entry, /level\.status !== 'ready'/)
  // 식단 이해도·AI 이용 권한·PIN 보호 목표를 읽지 않는다
  for (const code of [page, entry].map((t) =>
    t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''),
  )) {
    assert.doesNotMatch(
      code,
      /\.meal\b|entitlements|getExercisePlanAccess|getGoal\(|unlock\(|useExerciseGoal\(/,
    )
  }
})

test('보호: W12는 W01-2 추천 모듈을 참조하지 않고(AI 카드는 I02-1 로컬 예시로 연결), 초안 Provider·W11 변경은 최소 범위다', () => {
  const w12 = read('../src/pages/ExerciseMethodPage.tsx')
  assert.match(w12, /AI 추천으로 시작하기/)
  assert.match(w12, /로컬 예시/)
  assert.doesNotMatch(w12, /recommend|PATH_PLAN|W01-2/)
  // replaceDraft: 기존 validateDraft를 통과한 초안만 받는다
  const provider = read('../src/exercise/WorkoutDraftProvider.tsx')
  const fn = provider.slice(
    provider.indexOf('const replaceDraft'),
    provider.indexOf('const clearSaved') >
      provider.indexOf('const replaceDraft')
      ? provider.indexOf('const clearSaved')
      : undefined,
  )
  assert.match(provider, /validateDraft\(draft\)\.ok/)
  assert.match(fn, /userId === null/)
  // W11: "구성 수정"만 추천에서 온 경우 추천 화면으로(저장 절차는 그대로)
  const review = read('../src/pages/ExerciseReviewPage.tsx')
  assert.match(review, /=== PATH_PLAN/)
  assert.match(review, /useWorkoutListSave\(/)
  assert.doesNotMatch(review, /recommend\/(engine|toDraft|rules)/)
  // 별도 저장 경로가 없다: 추천 화면·진입은 저장소를 직접 호출하지 않는다
  for (const file of [
    '../src/pages/ExercisePlanPage.tsx',
    '../src/components/exercise/dashboard/BeginnerPlanEntry.tsx',
    '../src/components/exercise/plan/PlanResultView.tsx',
    '../src/components/exercise/plan/PlanConditions.tsx',
  ]) {
    assert.doesNotMatch(
      read(file),
      /saveFromDraft|createWorkoutListRepository|indexedDB/,
      file,
    )
  }
  // 시드·스키마 불변
  assert.equal(catalog.getAllExercises().length, 105)
  assert.equal(catalog.getAllRoutines().length, 33)
  assert.ok(Taxonomy.TOOLS.includes('맨몸'))
})

test('P2-5: 운동 선택 문구는 초급 추천 화면에서만 바꾸고 W13 기본 문구와 공통 컴포넌트 API는 그대로다', () => {
  const picker = read('../src/components/exercise/picker/ExercisePicker.tsx')
  const footer = read('../src/components/exercise/picker/SelectedFooter.tsx')
  const plan = read('../src/pages/ExercisePlanPage.tsx')
  const w13 = read('../src/pages/ExercisePickerPage.tsx')
  // 기본 문구는 그대로(copy가 없으면 W13 문구)
  assert.match(picker, /copy\?\.title \?\? '운동 검색·등록'/)
  assert.match(picker, /운동을 여러 개 선택한 뒤 목록에 추가해 주세요\./)
  assert.match(footer, /`선택한 \$\{count\}개 운동 등록`/)
  // copy는 선택 속성이고 기존 필수 속성(backTo, onComplete)은 바뀌지 않았다
  assert.match(picker, /copy\?: PickerCopy/)
  assert.match(picker, /backTo: string \| null/)
  assert.match(
    picker,
    /onComplete: \(\s*ids: readonly string\[\],\s*catalog: ExerciseCatalogState,?\s*\) => PickerCompleteResult/,
  )
  // W13 화면은 copy를 넘기지 않는다. 추천 화면만 넘긴다.
  assert.doesNotMatch(w13, /copy=/)
  assert.match(plan, /copy=\{PICKER_COPY\}/)
  assert.match(plan, /title: '운동 찾아보기'/)
  assert.match(plan, /선택한 \$\{count\}개 운동으로 설정하기/)
  // 추천 화면 문구에는 "등록"이 없다(목록 등록이 아니라 추천 설정 맥락)
  const copyBlock = plan.slice(
    plan.indexOf('const PICKER_COPY'),
    plan.indexOf('const PICKER_COPY') + 400,
  )
  assert.doesNotMatch(copyBlock, /등록/)
})

test('P3-2: 확정은 요청 번호·마운트·계정·화면 상태로 낡은 요청을 무효로 만든다(브라우저 동작은 p32-verify로 확인)', () => {
  const plan = read('../src/pages/ExercisePlanPage.tsx')
  // 화면을 떠나면(언마운트·계정 변경으로 다시 만들어짐) 요청 번호를 올려 진행 중인 확정을 무효로 한다.
  assert.match(
    plan,
    /mounted\.current = false\s*\n\s*confirmSeq\.current \+= 1/,
  )
  // 요청이 시작될 때 번호를 받고, 끝났을 때 번호·마운트·계정·입력 상태를 모두 비교한다.
  assert.match(plan, /const token = \(confirmSeq\.current \+= 1\)/)
  assert.match(plan, /token === confirmSeq\.current/)
  assert.match(plan, /live\.current\.userId === userId/)
  assert.match(plan, /live\.current\.session === startSession/)
  // 비동기 이해도 조회 직후와 초안을 건드리기 직전에 다시 확인한다.
  const confirmBody = plan.slice(plan.indexOf('async function confirm()'))
  const awaitAt = confirmBody.indexOf('await loadExerciseLevel(userId)')
  const firstCheck = confirmBody.indexOf('if (!isCurrent()) return')
  const secondCheck = confirmBody.indexOf(
    'if (!isCurrent()) return',
    firstCheck + 10,
  )
  const replaceAt = confirmBody.indexOf('replaceDraft(converted.draft)')
  assert.ok(awaitAt > 0 && firstCheck > awaitAt, '조회 직후 확인')
  assert.ok(
    secondCheck > firstCheck && secondCheck < replaceAt,
    '교체 직전 확인',
  )
  // 초안 함수는 요청 시작 때의 값이 아니라 그 시점의 최신 값을 쓴다.
  assert.match(
    confirmBody,
    /const \{ hasContent, replaceDraft \} = live\.current/,
  )
  // 중복 실행 방지(busy)는 그대로이고, 낡은 확인 상자는 화면 상태가 바뀌면 사라진다.
  assert.match(plan, /if \(busy\.current\) return/)
  assert.match(plan, /pending && pending\.base === session/)
})
