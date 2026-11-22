import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement, createRef } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// S8-UI-1A: W01-2 3단계 "사용할 수 있는 운동 도구가 있나요?"의 도구 선택지.
// 도구 목록은 운동 탐색(E01)과 같은 공통 정의(exerciseTaxonomy.TOOLS)이고, 추천 엔진이 쓸 수 있는 도구만 고를 수 있다.
// 엔진의 운동 선정 규칙·운동 데이터는 바꾸지 않았다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Steps
let Flow
let Rules
let Engine
let Seed
let Tax
let Storage
let Conditions
let source
let selectable

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Steps = await server.ssrLoadModule('/src/exercise/planConditionSteps.ts')
  Flow = await server.ssrLoadModule('/src/exercise/recommend/planFlow.ts')
  Rules = await server.ssrLoadModule('/src/exercise/recommend/rules.ts')
  Engine = await server.ssrLoadModule('/src/exercise/recommend/engine.ts')
  Seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  Tax = await server.ssrLoadModule('/src/exercise/exerciseTaxonomy.ts')
  Storage = await server.ssrLoadModule('/src/exercise/recommend/planStorage.ts')
  Conditions = await server.ssrLoadModule(
    '/src/components/exercise/plan/PlanConditions.tsx',
  )
  source = Engine.createPlanSource(Seed.getSeedCatalog())
  selectable = Rules.listEligibleTools(source.exercises, source.evidence)
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const src = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')
const request = (over = {}) => ({
  exerciseTier: 'beginner',
  purpose: 'learn',
  availableMinutes: 60,
  tools: ['맨몸'],
  mode: 'automatic',
  rotation: 0,
  ...over,
})
const planOf = (over) => {
  const result = Engine.buildBeginnerPlan(request(over), source)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.plan
}
const equipmentOf = (id) => Seed.getSeedCatalog().getExerciseById(id).equipment

// ─── 목록: E01과 같은 공통 정의 ────────────────────────────

test('도구 목록: 운동 탐색(E01) 필터와 같은 공통 정의(TOOLS)이며 순서·이름이 같다', () => {
  // E01의 도구 필터는 TOOLS를 그대로 선택지로 쓴다(FilterOptions·exerciseSearch). W01-2도 같은 정의에서 만든다.
  assert.match(
    src('components/exercise/FilterOptions.tsx'),
    /filterKey === 'difficulty' \? DIFFICULTIES : TOOLS/,
  )
  assert.match(src('pages/exerciseSearch.ts'), /tool: TOOLS/)
  const choices = Steps.describeToolChoices(selectable)
  assert.deepEqual(
    choices.map((c) => c.tool),
    [...Tax.TOOLS],
  )
  assert.deepEqual(
    choices.map((c) => c.tool),
    ['덤벨', '맨몸', '밴드', '폼롤러', '마사지볼', '풀업 바'],
  )
  // 도구 이름을 따로 하드코딩하지 않는다: 단계 로직과 화면 소스에 도구 이름 목록이 없다
  for (const file of [
    'exercise/planConditionSteps.ts',
    'components/exercise/plan/PlanConditions.tsx',
  ]) {
    const text = src(file).replace(/\/\*[\s\S]*?\*\//g, '')
    assert.doesNotMatch(text, /'폼롤러'|'마사지볼'|'풀업 바'|'덤벨'/, file)
  }
})

test('도구 ID와 표시 이름: 같은 문자열 하나로 대응하고 중복이 없다', () => {
  const tools = Steps.describeToolChoices(selectable).map((c) => c.tool)
  assert.equal(new Set(tools).size, tools.length)
  for (const tool of tools) {
    assert.equal(Rules.isPlanTool(tool), true, tool) // 엔진이 받는 도구 이름
  }
  // 카탈로그의 운동 도구도 모두 이 목록 안에 있다(목록에 없는 도구가 운동에 쓰이지 않는다)
  const used = new Set(
    Seed.getSeedCatalog()
      .getAllExercises()
      .flatMap((e) => e.equipment),
  )
  for (const tool of used) assert.ok(tools.includes(tool), tool)
  // 같은 이름이 두 장의 카드로 나오지 않는다
  assert.equal(
    new Set(
      Steps.describeToolChoices(['밴드', '밴드', '덤벨']).map((c) => c.tool),
    ).size,
    tools.length,
  )
})

// ─── 상태: 엔진이 실제로 쓸 수 있는 도구만 고를 수 있다 ──────

test('선택지 상태: 맨몸은 항상, 엔진이 쓸 수 있는 도구만 선택 가능, 나머지는 선택 불가', () => {
  const states = Object.fromEntries(
    Steps.describeToolChoices(selectable).map((c) => [c.tool, c.state]),
  )
  assert.deepEqual(states, {
    덤벨: 'unavailable',
    맨몸: 'always',
    밴드: 'selectable',
    폼롤러: 'unavailable',
    마사지볼: 'unavailable',
    '풀업 바': 'unavailable',
  })
  // 맨몸은 엔진 목록에 없어도 항상 있다
  assert.equal(
    Steps.describeToolChoices([]).find((c) => c.tool === '맨몸').state,
    'always',
  )
})

test('엔진 호환성: 선택 불가 도구에는 자동 구성에 쓸 수 있는 운동이 없고, 선택 가능 도구에는 있다', () => {
  const all = Seed.getSeedCatalog().getAllExercises()
  for (const { tool, state } of Steps.describeToolChoices(selectable)) {
    const usable = source.exercises.filter(
      (e) =>
        e.equipment.includes(tool) &&
        Rules.classifyExercise(e, {
          tools: Tax.TOOLS,
          evidence: source.evidence,
        }).eligible,
    )
    if (state === 'unavailable') {
      assert.equal(
        usable.length,
        0,
        `${tool}: 추천 가능한 운동이 있는데 선택 불가다`,
      )
      // 사유는 엔진 규칙이다(중량 운동·초급 아님·해당 규칙 묶음 없음). 운동은 실제로 존재한다
      assert.ok(
        all.some((e) => e.equipment.includes(tool)),
        tool,
      )
    } else {
      assert.ok(
        usable.length > 0,
        `${tool}: 추천 가능한 운동이 없는데 선택 가능이다`,
      )
    }
  }
})

// ─── 선택·해제·맨몸 ────────────────────────────────────────

test('다중 선택·해제: 고를 수 있는 도구는 여러 개 켜고 끌 수 있고 중복되지 않는다', () => {
  let tools = Flow.initialInputs('automatic').tools
  assert.deepEqual(plain(tools), ['맨몸'])
  tools = Steps.toggleSelectableTool(tools, '밴드', selectable)
  assert.deepEqual(plain(tools), ['맨몸', '밴드'])
  // 선택 가능 도구가 둘 이상일 때도 순서대로 쌓이고 중복이 없다(엔진 목록을 늘려 본 가정 목록)
  const wider = [...selectable, '폼롤러']
  tools = Steps.toggleSelectableTool(tools, '폼롤러', wider)
  assert.deepEqual(plain(tools), ['맨몸', '밴드', '폼롤러'])
  assert.equal(new Set(tools).size, tools.length)
  tools = Steps.toggleSelectableTool(tools, '밴드', wider)
  assert.deepEqual(plain(tools), ['맨몸', '폼롤러'])
  tools = Steps.toggleSelectableTool(tools, '폼롤러', wider)
  assert.deepEqual(plain(tools), ['맨몸'])
})

test('맨몸: 기본으로 포함되고 끌 수 없으며, 다른 도구를 고르려고 맨몸을 풀 필요가 없다', () => {
  assert.deepEqual(plain(Flow.initialInputs('automatic').tools), ['맨몸'])
  assert.deepEqual(plain(Flow.initialInputs('selected').tools), ['맨몸'])
  const tools = ['맨몸']
  assert.equal(Steps.toggleSelectableTool(tools, '맨몸', selectable), tools)
  assert.deepEqual(
    plain(Steps.toggleSelectableTool(tools, '밴드', selectable)),
    ['맨몸', '밴드'],
  )
  // 도구를 하나도 고르지 않아도 맨몸 운동이 추천된다
  const none = planOf({ tools: [] })
  assert.ok(none.items.length > 0)
  assert.ok(
    none.items.every((i) =>
      equipmentOf(i.exerciseId).every((t) => t === '맨몸'),
    ),
  )
  assert.deepEqual(plain(none), plain(planOf({ tools: ['맨몸'] })))
})

test('선택 불가 도구: 고르려 해도 받지 않고 같은 배열을 돌려준다', () => {
  const tools = ['맨몸']
  for (const tool of ['덤벨', '폼롤러', '마사지볼', '풀업 바']) {
    assert.equal(
      Steps.toggleSelectableTool(tools, tool, selectable),
      tools,
      tool,
    )
  }
  // 목록에 없는 이름도 받지 않는다
  assert.equal(Steps.toggleSelectableTool(tools, '케틀벨', selectable), tools)
  assert.equal(Steps.toggleSelectableTool(tools, '', selectable), tools)
})

// ─── 선택값 → 추천 요청 → 결과 ─────────────────────────────

test('추천 요청 변환: 고른 도구가 요청에 그대로 들어가고 맨몸은 엔진이 항상 포함한다', () => {
  const inputs = {
    ...Flow.initialInputs('automatic'),
    purpose: 'learn',
    minutes: 30,
    tools: ['맨몸', '밴드'],
  }
  const req = Flow.toRequest(inputs, 'beginner')
  assert.deepEqual(plain(req.tools), ['맨몸', '밴드'])
  assert.notEqual(req.tools, inputs.tools) // 복사본
  const validation = Rules.validatePlanInput(
    Flow.toRequest({ ...inputs, tools: ['밴드'] }, 'beginner'),
  )
  assert.equal(validation.ok, true)
  assert.deepEqual(plain(validation.input.tools), ['맨몸', '밴드'])
})

test('추천 결과: 밴드를 고르면 밴드 운동이 들어가고, 맨몸만이면 밴드 운동이 없다', () => {
  const rotations = [0, 1, 2, 3, 4, 5]
  const bodyOnly = rotations.flatMap(
    (rotation) => planOf({ tools: ['맨몸'], rotation }).items,
  )
  assert.ok(bodyOnly.every((i) => !equipmentOf(i.exerciseId).includes('밴드')))
  const withBand = rotations.flatMap(
    (rotation) => planOf({ tools: ['맨몸', '밴드'], rotation }).items,
  )
  assert.ok(withBand.some((i) => equipmentOf(i.exerciseId).includes('밴드')))
})

test('지원되지 않는 도구를 요청에 담아도 결과가 달라지지 않는다(엔진 규칙 그대로, 조용한 치환 없음)', () => {
  const baseline = plain(planOf({ tools: ['맨몸', '밴드'] }))
  for (const tool of ['덤벨', '폼롤러', '마사지볼', '풀업 바']) {
    // 엔진은 그 도구를 요청에 보존한 채(다른 도구로 바꾸지 않는다) 해당 도구 운동을 자동 구성 대상으로 보지 않는다
    const result = Engine.buildBeginnerPlan(
      request({ tools: ['맨몸', '밴드', tool] }),
      source,
    )
    assert.equal(result.ok, true)
    assert.deepEqual(plain(result.plan), baseline, tool)
  }
  // 이름이 잘못된 도구는 거절한다(조용히 무시하지 않는다)
  const bad = Engine.buildBeginnerPlan(
    request({ tools: ['맨몸', '케틀벨'] }),
    source,
  )
  assert.equal(bad.ok, false)
  assert.equal(bad.failures[0].code, 'toolsInvalid')
})

test('직접 선택: 밴드 운동은 밴드를 골라야 자동 구성되고, 고르지 않으면 확정이 막히고 이유(toolUnavailable)가 나온다', () => {
  const band = Seed.getSeedCatalog().getExerciseById('1') // 밴드 로우
  assert.ok(band.equipment.includes('밴드'))
  const without = planOf({
    mode: 'selected',
    selectedExerciseIds: ['1'],
    tools: ['맨몸'],
  })
  assert.equal(without.confirmable, false)
  assert.deepEqual(
    plain(without.unsupported.map((u) => [u.exerciseId, u.reason])),
    [['1', 'toolUnavailable']],
  )
  assert.ok(without.warnings.some((w) => w.code === 'toolMismatch'))
  assert.equal(without.items.length, 0) // 운동은 지워지지 않고 구성 불가로 남는다
  const withBand = planOf({
    mode: 'selected',
    selectedExerciseIds: ['1'],
    tools: ['맨몸', '밴드'],
  })
  assert.equal(withBand.confirmable, true)
  assert.deepEqual(
    withBand.items.map((i) => i.exerciseId),
    ['1'],
  )
})

test('선택값 복원: 저장한 도구가 그대로 돌아오고, 맨몸이 항상 포함되며, 잘못된 값은 폐기한다', () => {
  const bag = new Map()
  const storage = {
    getItem: (k) => bag.get(k) ?? null,
    setItem: (k, v) => void bag.set(k, v),
    removeItem: (k) => void bag.delete(k),
  }
  const session = {
    ...Storage.INITIAL_SESSION,
    step: 'conditions',
    inputs: {
      ...Flow.initialInputs('automatic'),
      purpose: 'learn',
      minutes: 20,
      tools: ['맨몸', '밴드'],
    },
  }
  assert.equal(Storage.savePlanSession('u1', session, storage), true)
  assert.deepEqual(plain(Storage.readPlanSession('u1', storage).inputs.tools), [
    '맨몸',
    '밴드',
  ])
  // 다른 계정은 읽지 못한다
  assert.equal(Storage.readPlanSession('u2', storage), null)
  // validTools: 맨몸을 항상 더하고 중복을 합치며 모르는 이름은 폐기한다
  assert.deepEqual(plain(Flow.validTools(['밴드', '밴드'])), ['맨몸', '밴드'])
  assert.deepEqual(plain(Flow.validTools([])), ['맨몸'])
  assert.equal(Flow.validTools(['케틀벨']), null)
  assert.equal(Flow.validTools('밴드'), null)
})

// ─── 화면(서버 렌더링) ─────────────────────────────────────

const condProps = (over = {}) => ({
  step: 3,
  direction: 'next',
  headingRef: createRef(),
  inputs: {
    ...Flow.initialInputs('automatic'),
    purpose: 'learn',
    minutes: 20,
  },
  toolChoices: selectable,
  minutesFromGoal: null,
  selectedRows: [],
  backLabel: '이전 단계로 돌아가기',
  onBack() {},
  onPurpose() {},
  onMinutes() {},
  onToggleTool() {},
  onPick() {},
  onRemoveSelected() {},
  onNext() {},
  ...over,
})
const render = (over) =>
  renderToStaticMarkup(createElement(Conditions.default, condProps(over)))
const cards = (html) =>
  [...html.matchAll(/<label\b[^>]*>([\s\S]*?)<\/label>/g)].map((m) => m[0])

test('도구 카드: E01 순서의 6장, 체크박스는 눈에 보이지 않고(sr-only) 카드 전체가 선택 영역이다', () => {
  const html = render()
  const list = cards(html)
  assert.equal(list.length, 6)
  const names = list.map((card) =>
    ['덤벨', '맨몸', '밴드', '폼롤러', '마사지볼', '풀업 바'].find((n) =>
      card.includes(`>${n}`),
    ),
  )
  assert.deepEqual(names, [
    '덤벨',
    '맨몸',
    '밴드',
    '폼롤러',
    '마사지볼',
    '풀업 바',
  ])
  for (const card of list) {
    // 체크박스(의미)는 남기되 시각적으로 숨긴다: 눈에 보이는 크기·accent 스타일이 없다
    assert.match(card, /<input(?=[^>]*type="checkbox")(?=[^>]*class="sr-only")/)
    assert.doesNotMatch(card, /size-5|accent-exercise/)
    // 터치 영역 64px(min-h-16 ≥ 44px)와 전체 카드가 label이다
    assert.match(card, /^<label[^>]*min-h-16/)
  }
  // 도구 목록은 의미 있는 묶음이고 단계 제목(h1)이 이름이다
  assert.match(html, /role="group"[^>]*aria-labelledby="/)
})

test('도구 카드 상태 표시: 선택 전·후가 테두리·배경·도구명 색·✓로 구분되고 색만으로 구분하지 않는다', () => {
  const none = cards(render())
  const band = (list) => list.find((c) => c.includes('>밴드'))
  assert.match(band(none), /border-line bg-surface/)
  assert.doesNotMatch(band(none), /✓/)
  assert.doesNotMatch(band(none), /checked=""/)
  const picked = cards(
    render({
      inputs: {
        ...Flow.initialInputs('automatic'),
        purpose: 'learn',
        minutes: 20,
        tools: ['맨몸', '밴드'],
      },
    }),
  )
  assert.match(band(picked), /border-exercise bg-exercise-soft/)
  assert.match(band(picked), /text-exercise/)
  assert.match(band(picked), /checked=""/) // 보조기기가 읽는 선택 상태
  assert.match(band(picked), /✓/)
  // ✓는 장식이다(상태는 체크박스가 전한다)
  assert.match(band(picked), /aria-hidden="true"[^>]*>✓/)
})

test('도구 카드: 맨몸은 선택·비활성("항상 가능"), 선택 불가 도구는 비활성이고 이유 문구가 설명으로 연결된다', () => {
  const list = cards(render())
  const find = (n) => list.find((c) => c.includes(`>${n}`))
  const bodyweight = find('맨몸')
  assert.match(bodyweight, /checked=""/)
  assert.match(bodyweight, /disabled=""/)
  assert.match(bodyweight, /항상 가능/)
  assert.match(bodyweight, /border-exercise/) // 맨몸은 항상 선택된 모양
  for (const n of ['덤벨', '폼롤러', '마사지볼', '풀업 바']) {
    const card = find(n)
    assert.match(card, /disabled=""/, n)
    assert.doesNotMatch(card, /checked=""/, n)
    assert.match(card, /cursor-not-allowed/, n)
    assert.ok(card.includes(Steps.TOOL_UNAVAILABLE_TEXT), n)
    const described = card.match(/aria-describedby="([^"]+)"/)?.[1]
    assert.ok(
      described && card.includes(`id="${described}"`),
      `${n}: 설명 연결`,
    )
  }
  // 밴드는 선택할 수 있다
  const band = find('밴드')
  assert.doesNotMatch(band, /disabled=""/)
  assert.doesNotMatch(band, /aria-describedby/)
  assert.doesNotMatch(band, /cursor-not-allowed/)
})

test('도구 카드: 엔진이 쓸 수 있는 도구가 늘면 그 카드가 선택 가능해진다(화면이 목록을 따라간다)', () => {
  const html = render({ toolChoices: [...selectable, '폼롤러'] })
  const list = cards(html)
  const roller = list.find((c) => c.includes('>폼롤러'))
  assert.doesNotMatch(roller, /disabled=""/)
  assert.ok(!roller.includes(Steps.TOOL_UNAVAILABLE_TEXT))
  assert.equal(
    (html.match(/초급 자동 추천에 쓸 수 있는 운동이 아직 없어요/g) ?? [])
      .length,
    3,
  )
})

test('변경 범위: 목표 단계의 라디오 카드와 다른 화면의 선택 UI는 그대로다', () => {
  const purpose = renderToStaticMarkup(
    createElement(Conditions.default, condProps({ step: 1 })),
  )
  assert.equal((purpose.match(/type="radio"/g) ?? []).length, 3)
  assert.match(purpose, /size-5[^"]*accent-exercise/) // 목표 라디오는 기존 표시를 유지
  // 도구 카드 스타일은 이 컴포넌트 안의 전용 상수이고 공통 스타일 파일(composeStyles)은 바뀌지 않았다
  assert.doesNotMatch(
    src('components/exercise/compose/composeStyles.ts'),
    /toolCard|sr-only/,
  )
})

// ─── S8-3C: 접근성 ID·이름·설명 ────────────────────────────

test('접근성 ID: 도구명이 아니라 useId와 순번으로 만들고 공백·한글·특수문자가 없는 유효한 ID다', () => {
  // aria-labelledby·aria-describedby는 공백으로 구분된 ID 목록이라, ID에 공백이 있으면 참조가 끊긴다(풀업 바 결함의 원인).
  for (const base of [':r1:', '«r2»', '_r_5_', 'a b', '한글 id!', '']) {
    const seen = new Set()
    for (let index = 0; index < 6; index += 1) {
      const ids = Steps.toolControlIds(base, index)
      for (const id of [ids.name, ids.note]) {
        assert.match(
          id,
          /^[A-Za-z0-9_-]+$/,
          `${JSON.stringify(base)} #${index}: ${id}`,
        )
        assert.equal(seen.has(id), false, `중복 ID: ${id}`)
        seen.add(id)
      }
    }
  }
  // 서로 다른 컴포넌트 인스턴스(useId가 다름)는 같은 순번이어도 ID가 다르다
  assert.notEqual(
    Steps.toolControlIds('_r_5_', 2).note,
    Steps.toolControlIds('_r_6_', 2).note,
  )
  // 이 함수는 도구 이름을 받지 않고, 화면도 ID를 도구명으로 만들지 않는다
  assert.equal(Steps.toolControlIds.length, 2)
  assert.doesNotMatch(
    src('components/exercise/plan/PlanConditions.tsx'),
    /\$\{baseId\}-\$\{tool\}|id=\{`[^`]*\$\{tool\}/,
  )
})

/** 서버 렌더링 결과에서 id에 해당하는 요소(span)의 글자(안쪽 태그 제거). 없으면 null. */
function textOfId(html, id) {
  const start = html.indexOf(`id="${id}"`)
  if (start < 0) return null
  const open = html.indexOf('>', start)
  const close = html.indexOf('</span>', open)
  return html
    .slice(open + 1, close)
    .replace(/<[^>]*>/g, '')
    .trim()
}

test('접근성 이름·설명: 이름은 도구명만, 설명은 상태 문구만 가리키고 참조가 모두 실제 요소를 가리킨다(중복 낭독 없음)', () => {
  const html = render()
  const list = cards(html)
  assert.equal(list.length, 6)
  const allIds = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(allIds).size, allIds.length, '문서 안 ID 중복')
  const expected = {
    덤벨: Steps.TOOL_UNAVAILABLE_TEXT,
    맨몸: '(항상 가능)',
    밴드: null,
    폼롤러: Steps.TOOL_UNAVAILABLE_TEXT,
    마사지볼: Steps.TOOL_UNAVAILABLE_TEXT,
    '풀업 바': Steps.TOOL_UNAVAILABLE_TEXT,
  }
  for (const card of list) {
    const labelledby = card.match(/aria-labelledby="([^"]+)"/)?.[1]
    assert.ok(labelledby, '이름 참조가 있다')
    assert.doesNotMatch(labelledby, /\s/, '이름 참조 ID에 공백 없음')
    const name = textOfId(html, labelledby)
    assert.ok(
      name && name in expected,
      `이름 요소가 존재하고 도구명이다: ${name}`,
    )
    // 이름에는 이유·상태 문구가 들어가지 않는다(설명과 중복 낭독 방지)
    assert.equal(name.includes(Steps.TOOL_UNAVAILABLE_TEXT), false, name)
    assert.equal(name.includes('항상 가능'), false, name)
    const describedby = card.match(/aria-describedby="([^"]+)"/)?.[1] ?? null
    if (expected[name] === null) {
      assert.equal(describedby, null, `${name}: 설명 없음`)
    } else {
      assert.ok(describedby, `${name}: 설명 참조가 있다`)
      assert.doesNotMatch(
        describedby,
        /\s/,
        `${name}: 설명 참조 ID에 공백 없음`,
      )
      assert.equal(
        textOfId(html, describedby),
        expected[name],
        `${name}: 설명 글자`,
      )
    }
  }
})

test('접근성: 선택 불가 이유는 화면에도 그대로 보인다(문구 유지)', () => {
  const html = render()
  assert.equal(
    (html.match(/초급 자동 추천에 쓸 수 있는 운동이 아직 없어요/g) ?? [])
      .length,
    4,
  )
  assert.match(html, /\(항상 가능\)/)
})
