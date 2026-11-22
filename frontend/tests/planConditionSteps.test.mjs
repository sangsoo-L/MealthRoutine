import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// S8-UI-1: 초급 운동 추천(W01-2) 조건 설정 단계 화면의 순수 로직(단계 이동·유효성·문구·복원)과, 추천 엔진 입력이 단계 화면 도입 전과 같은지,
// 엔진·저장소 보호(소스 확인). 브라우저 동작은 별도 Chrome 검증 스크립트로 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Steps
let Flow
let Rules
let Engine
let Seed
let Storage
let source

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
  Storage = await server.ssrLoadModule('/src/exercise/recommend/planStorage.ts')
  source = Engine.createPlanSource(Seed.getSeedCatalog())
})
after(async () => {
  await server?.close()
})

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const plain = (value) => JSON.parse(JSON.stringify(value))
const inputsOf = (mode, over = {}) => ({ ...Flow.initialInputs(mode), ...over })

test('단계 수: 전체 자동 추천은 3단계, 직접 선택은 운동 고르기가 더해져 4단계', () => {
  assert.equal(Steps.totalSteps('automatic'), 3)
  assert.equal(Steps.totalSteps('selected'), 4)
  assert.equal(Steps.clampStep(4, 'automatic'), 3)
  assert.equal(Steps.clampStep(4, 'selected'), 4)
  assert.equal(Steps.clampStep(2, 'automatic'), 2)
})

test('단계 이동: 목표 → 시간 → 도구(→ 운동 고르기) 순서이고 끝에서는 null, 처음에서 이전은 null', () => {
  assert.equal(Steps.nextStep(1, 'automatic'), 2)
  assert.equal(Steps.nextStep(2, 'automatic'), 3)
  assert.equal(Steps.nextStep(3, 'automatic'), null)
  assert.equal(Steps.nextStep(3, 'selected'), 4)
  assert.equal(Steps.nextStep(4, 'selected'), null)
  assert.equal(Steps.prevStep(4), 3)
  assert.equal(Steps.prevStep(2), 1)
  assert.equal(Steps.prevStep(1), null)
})

test('진행 문구: "1/3단계"와 "3단계 중 1단계", 직접 선택은 N/4', () => {
  assert.equal(Steps.progressLabel(1, 'automatic'), '1/3단계')
  assert.equal(Steps.progressLabel(2, 'automatic'), '2/3단계')
  assert.equal(Steps.progressLabel(3, 'automatic'), '3/3단계')
  assert.equal(Steps.progressSpeech(1, 'automatic'), '3단계 중 1단계')
  assert.equal(Steps.progressLabel(4, 'selected'), '4/4단계')
  assert.equal(Steps.progressSpeech(2, 'selected'), '4단계 중 2단계')
})

test('버튼 문구: 자동 추천은 다음·다음·운동 추천받기, 직접 선택은 다음·다음·다음·세트와 목표 자동으로 정하기', () => {
  assert.deepEqual(
    [1, 2, 3].map((s) => Steps.ctaLabel(s, 'automatic')),
    ['다음', '다음', '운동 추천받기'],
  )
  assert.deepEqual(
    [1, 2, 3, 4].map((s) => Steps.ctaLabel(s, 'selected')),
    ['다음', '다음', '다음', '세트와 목표 자동으로 정하기'],
  )
})

test('질문·보조 문구: 요구한 문장 그대로', () => {
  assert.deepEqual(Steps.STEP_TEXT[1], {
    title: '어떤 목표로 운동하고 싶으세요?',
    hint: '목표에 맞춰 운동을 추천해 드릴게요.',
  })
  assert.deepEqual(Steps.STEP_TEXT[2], {
    title: '오늘은 얼마나 운동할 수 있나요?',
    hint: '부담 없이 운동할 수 있는 시간을 선택해 주세요.',
  })
  assert.deepEqual(Steps.STEP_TEXT[3], {
    title: '사용할 수 있는 운동 도구가 있나요?',
    hint: '가지고 있는 도구를 선택하면 가능한 운동을 찾아드려요.',
  })
})

test('유효성(목표): 엔진이 지원하는 목표만 다음으로 갈 수 있고 비어 있으면 못 간다', () => {
  assert.equal(Steps.stepIsValid(1, inputsOf('automatic')), false)
  assert.equal(
    Steps.invalidMessage(1, inputsOf('automatic')),
    '운동 목표를 골라 주세요.',
  )
  for (const purpose of Rules.PLAN_PURPOSES) {
    assert.equal(Steps.stepIsValid(1, inputsOf('automatic', { purpose })), true)
    assert.equal(
      Steps.invalidMessage(1, inputsOf('automatic', { purpose })),
      null,
    )
  }
  // 화면의 목표 선택지는 모두 엔진이 지원하는 목표다(기존 문구·값 유지)
  assert.deepEqual(
    [...Flow.PURPOSE_CHOICE_VALUES].sort(),
    [...Rules.PLAN_PURPOSES].sort(),
  )
})

test('유효성(시간): 5~180 정수만 통과하고 빠른 선택(10·20·30)은 범위를 제한하지 않는다', () => {
  const ok = (minutes) =>
    Steps.stepIsValid(2, inputsOf('automatic', { purpose: 'learn', minutes }))
  for (const minutes of [5, 10, 20, 30, 45, 99, 180])
    assert.equal(ok(minutes), true, String(minutes))
  for (const minutes of [null, 0, 4, 181, 999, 12.5, -10, NaN, '20'])
    assert.equal(ok(minutes), false, String(minutes))
  assert.equal(
    Steps.invalidMessage(
      2,
      inputsOf('automatic', { purpose: 'learn', minutes: null }),
    ),
    '운동 가능 시간을 골라 주세요.',
  )
  // 빠른 선택 값은 모두 유효 범위 안이며, 빠른 선택이 아닌 값도 같은 규칙으로 통과한다
  for (const minutes of Rules.PLAN_MINUTES_PRESETS)
    assert.equal(Rules.isValidPlanMinutes(minutes), true)
  assert.ok(Rules.PLAN_MINUTES_PRESETS.length < 176)
})

test('유효성(도구): 하나도 고르지 않아도(맨몸만) 진행된다. 선택하지 않은 도구는 요청에 들어가지 않는다', () => {
  const base = inputsOf('automatic', { purpose: 'learn', minutes: 20 })
  assert.equal(Steps.stepIsValid(3, base), true)
  assert.equal(Steps.invalidMessage(3, base), null)
  assert.deepEqual([...Flow.toRequest(base, 'beginner').tools], ['맨몸'])
  const withBand = {
    ...base,
    tools: Flow.toggleTool(base.tools, '밴드'),
  }
  assert.deepEqual([...Flow.toRequest(withBand, 'beginner').tools].sort(), [
    '맨몸',
    '밴드',
  ])
  // 맨몸은 끌 수 없다
  assert.deepEqual([...Flow.toggleTool(base.tools, '맨몸')], ['맨몸'])
})

test('유효성(운동 고르기, 직접 선택): 운동을 하나 이상 골라야 한다', () => {
  const base = inputsOf('selected', { purpose: 'learn', minutes: 20 })
  assert.equal(Steps.stepIsValid(4, base), false)
  assert.equal(Steps.invalidMessage(4, base), '운동을 하나 이상 골라 주세요.')
  assert.equal(Steps.stepIsValid(4, { ...base, selectedIds: ['4'] }), true)
})

test('값 유지: 앞뒤로 이동해도 고른 값은 그대로이고 마지막 단계의 준비 여부는 기존 규칙(isReadyForPlan)과 같다', () => {
  let inputs = inputsOf('automatic', { purpose: 'maintain', minutes: 25 })
  const before = plain(inputs)
  // 이동 로직은 입력을 받아 단계 번호만 돌려준다(입력을 바꾸지 않는다)
  let step = 1
  for (const move of ['next', 'next', 'back', 'back', 'next']) {
    step =
      move === 'next'
        ? (Steps.nextStep(step, inputs.mode) ?? step)
        : (Steps.prevStep(step) ?? step)
  }
  assert.equal(step, 2)
  assert.deepEqual(plain(inputs), before)
  // 모든 단계가 통과하면 기존의 "추천을 만들 수 있는가"와 같은 결과다
  const everyStep = (i) =>
    Array.from({ length: Steps.totalSteps(i.mode) }, (_, n) => n + 1).every(
      (s) => Steps.stepIsValid(s, i),
    )
  for (const candidate of [
    inputsOf('automatic'),
    inputsOf('automatic', { purpose: 'learn' }),
    inputsOf('automatic', { purpose: 'learn', minutes: 20 }),
    inputsOf('selected', { purpose: 'learn', minutes: 20 }),
    inputsOf('selected', { purpose: 'learn', minutes: 20, selectedIds: ['4'] }),
    inputsOf('selected', { purpose: 'lose', minutes: 181, selectedIds: ['4'] }),
  ])
    assert.equal(everyStep(candidate), Flow.isReadyForPlan(candidate))
  inputs = null
})

test('복원 단계(새로고침): 값에서 이어 간다 — 목표 없음 1, 시간 없음 2, 직접 선택에 고른 운동이 있으면 4, 그 밖은 3', () => {
  assert.equal(Steps.restoredStep(inputsOf('automatic')), 1)
  assert.equal(
    Steps.restoredStep(inputsOf('automatic', { purpose: 'learn' })),
    2,
  )
  assert.equal(
    Steps.restoredStep(
      inputsOf('automatic', { purpose: 'learn', minutes: 20 }),
    ),
    3,
  )
  assert.equal(
    Steps.restoredStep(inputsOf('selected', { purpose: 'learn', minutes: 20 })),
    3,
  )
  assert.equal(
    Steps.restoredStep(
      inputsOf('selected', {
        purpose: 'learn',
        minutes: 20,
        selectedIds: ['4', '22'],
      }),
    ),
    4,
  )
})

test('복원 단계(운동 고르는 중 새로고침): 직접 선택에서 pick 화면이면 고른 운동이 없어도 돌아올 곳은 4단계다', () => {
  const base = inputsOf('selected', { purpose: 'learn', minutes: 20 })
  assert.equal(Steps.restoredStep(base, 'pick'), 4)
  assert.equal(Steps.restoredStep({ ...base, selectedIds: ['4'] }, 'pick'), 4)
  assert.equal(Steps.restoredStep(base, 'conditions'), 3)
  // 목표·시간이 비어 있으면 pick이어도 비어 있는 단계가 먼저다(입력을 건너뛰지 않는다)
  assert.equal(
    Steps.restoredStep(inputsOf('selected', { purpose: 'learn' }), 'pick'),
    2,
  )
  assert.equal(Steps.restoredStep(inputsOf('selected'), 'pick'), 1)
  // 자동 추천에는 4단계가 없다
  assert.equal(
    Steps.restoredStep(
      inputsOf('automatic', { purpose: 'learn', minutes: 20 }),
      'pick',
    ),
    3,
  )
})

test('엔진 전달값 동일성: 단계 화면으로 고른 값은 이전 한 화면 입력과 같은 요청·같은 추천 결과를 만든다', () => {
  for (const mode of ['automatic', 'selected']) {
    const inputs = inputsOf(mode, {
      purpose: 'lose',
      minutes: 37,
      tools: ['맨몸', '밴드'],
      selectedIds: mode === 'selected' ? ['4', '22', '16'] : [],
      rotation: 2,
    })
    const request = Flow.toRequest(inputs, 'beginner')
    const legacy = {
      exerciseTier: 'beginner',
      purpose: 'lose',
      availableMinutes: 37,
      tools: ['맨몸', '밴드'],
      mode,
      ...(mode === 'selected'
        ? { selectedExerciseIds: ['4', '22', '16'] }
        : {}),
      rotation: 2,
    }
    assert.deepEqual(plain(request), plain(legacy), mode)
    assert.deepEqual(
      plain(Engine.buildBeginnerPlan(request, source)),
      plain(Engine.buildBeginnerPlan(legacy, source)),
      mode,
    )
  }
})

test('두 모드 입력값 보존: 직접 선택의 운동 id 순서는 단계 이동·저장·복원 후에도 그대로다', () => {
  const inputs = inputsOf('selected', {
    purpose: 'learn',
    minutes: 20,
    selectedIds: ['22', '4', '16'],
  })
  const map = new Map()
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
  const session = {
    step: 'conditions',
    inputs,
    replacingId: null,
    resultIds: null,
  }
  assert.equal(Storage.savePlanSession('userA', session, storage), true)
  const restored = Storage.readPlanSession('userA', storage)
  assert.deepEqual([...restored.inputs.selectedIds], ['22', '4', '16'])
  assert.equal(Steps.restoredStep(restored.inputs), 4)
  assert.equal(Flow.toRequest(restored.inputs, 'beginner').mode, 'selected')
})

test('조건 수정 후 재추천: 같은 입력으로 다시 계산한 결과는 같고, 값을 바꾸면 요청에 그대로 반영된다', () => {
  const inputs = inputsOf('automatic', {
    purpose: 'learn',
    minutes: 20,
  })
  const first = Engine.buildBeginnerPlan(
    Flow.toRequest(inputs, 'beginner'),
    source,
  )
  const again = Engine.buildBeginnerPlan(
    Flow.toRequest(inputs, 'beginner'),
    source,
  )
  assert.deepEqual(plain(first), plain(again))
  const edited = { ...inputs, minutes: 40, purpose: 'maintain' }
  const request = Flow.toRequest(edited, 'beginner')
  assert.equal(request.availableMinutes, 40)
  assert.equal(request.purpose, 'maintain')
  assert.equal(plain(Engine.buildBeginnerPlan(request, source)).ok, true)
})

test('계정 격리: 다른 계정의 임시 저장 값은 복원되지 않아 1단계부터 시작한다', () => {
  const map = new Map()
  const storage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  }
  const session = {
    step: 'conditions',
    inputs: inputsOf('automatic', { purpose: 'learn', minutes: 30 }),
    replacingId: null,
    resultIds: null,
  }
  Storage.savePlanSession('userA', session, storage)
  assert.equal(Storage.readPlanSession('userB', storage), null)
  // 복원 값이 없으면 처음 입력 상태에서 시작하므로 1단계다
  assert.equal(Steps.restoredStep(Flow.initialInputs('automatic')), 1)
  const page = read('../src/pages/ExercisePlanPage.tsx')
  assert.match(page, /<PlanGate key=\{user\.id\} userId=\{user\.id\}/) // 계정이 바뀌면 화면 상태가 모두 새로 시작한다
})

test('보호: 단계 모듈과 화면은 추천 엔진·규칙을 바꾸지 않고, 요청은 기존 toRequest로만 만든다', () => {
  const steps = read('../src/exercise/planConditionSteps.ts')
  assert.doesNotMatch(steps, /engine\.ts|buildBeginnerPlan|planToDraft/)
  assert.doesNotMatch(
    steps,
    /from 'react'|sessionStorage|localStorage|indexedDB/i,
  )
  const component = read('../src/components/exercise/plan/PlanConditions.tsx')
  assert.doesNotMatch(component, /engine\.ts|buildBeginnerPlan|toRequest/)
  const page = read('../src/pages/ExercisePlanPage.tsx')
  // 추천 결과·확정은 기존 방식 그대로 입력에서 요청을 만든다
  assert.equal(
    (page.match(/buildBeginnerPlan\(toRequest\(/g) ?? []).length >= 2,
    true,
  )
  assert.match(page, /const request = toRequest\(inputs, tier\)/)
  assert.match(page, /planToDraft\(built\.plan/)
  // 새 영구 저장소를 만들지 않는다
  assert.doesNotMatch(page, /indexedDB|localStorage/)
  assert.doesNotMatch(component, /indexedDB|localStorage|sessionStorage/)
  // 라우트: 화면이 뒤로가기를 직접 그린다(bodyBack). 다른 라우트 속성은 그대로다
  const router = read('../src/app/router.tsx')
  const block = router.slice(router.indexOf("path: 'records/exercise/plan'"))
  const handle = block.slice(0, block.indexOf('} satisfies RouteHandle'))
  assert.match(handle, /screenId: 'W01-2'/)
  assert.match(handle, /bodyBack: true/)
  assert.match(handle, /focus: true/)
  assert.match(handle, /ownH1: true/)
})

test('접근성·전환 구조: 단계 제목으로 포커스, 진행률 progressbar, 기존 전환 토큰과 reduced-motion, 고정 버튼 영역', () => {
  const component = read('../src/components/exercise/plan/PlanConditions.tsx')
  assert.match(component, /role="progressbar"/)
  assert.match(component, /aria-valuetext=/)
  assert.match(component, /tabIndex=\{-1\}/)
  assert.match(component, /animate-survey-back/)
  assert.match(component, /animate-survey-next/)
  assert.match(component, /motion-reduce:animate-none/)
  assert.match(component, /motion-reduce:transition-none/)
  assert.match(component, /sticky bottom-0/)
  assert.match(component, /min-h-11/)
  assert.match(component, /min-h-16/)
  const page = read('../src/pages/ExercisePlanPage.tsx')
  assert.match(page, /\}, \[session\.step, condStep\]\)/) // 단계가 바뀌면 제목으로 포커스
  // 새 임의 글자 크기·새 전역 CSS를 만들지 않는다
  assert.doesNotMatch(component, /text-\[\d+px\]|text-(sm|lg|xl|base)\b/)
})
