import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// S8-3: E02 "오늘 기록에 추가" → W02 초안 연결의 순수 판단(addToTodayDraft)과 W02·W13과의 규칙 일치.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다(`node --test "tests/*.test.mjs"`).
let server
let Plan
let Model
let Storage
let Seed

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Plan = await server.ssrLoadModule('/src/exercise/addToTodayDraft.ts')
  Model = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  Storage = await server.ssrLoadModule('/src/exercise/workoutDraftStorage.ts')
  Seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const T0 = () => '2026-11-17T01:00:00.000Z'
const catalog = () => Seed.getSeedCatalog()
const exerciseById = (id) => catalog().getExerciseById(String(id))
const emptyDraft = () => Model.createEmptyDraft(T0)

/** 깊이 얼려 순수 함수가 입력을 바꾸면 예외가 나게 한다. */
function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze(value[key])
  }
  return value
}

const draftWith = (...ids) =>
  Model.addExercisesToDraft(
    emptyDraft(),
    ids.map(exerciseById),
    T0,
    (() => {
      let n = 0
      return () => `item-${(n += 1)}`
    })(),
  )

const plan = (draft, exercise, memberReady = true) =>
  Plan.planAddToToday({ memberReady, draft, exercise })

// ─── 정상 추가 ────────────────────────────────────────────

test('초안이 없으면 이 운동만 담은 새 초안으로 시작한다(W02·W13과 같은 항목 규칙)', () => {
  const exercise = exerciseById(1)
  const result = plan(emptyDraft(), exercise)
  assert.equal(result.kind, 'start')
  assert.equal(result.draft.items.length, 1)
  const [item] = result.draft.items
  const reference = Model.createDraftItem(exercise, () => item.itemId)
  // 운동명·기록 방식·기본 목표(세트)는 기존 W02 규칙 그대로다. 새 기본값이 없다.
  assert.deepEqual(plain(item), plain(reference))
  assert.equal(item.exerciseId, exercise.id)
  assert.equal(item.name, exercise.name)
  assert.equal(item.recordType, Model.resolveStoredRecordType(exercise))
  assert.deepEqual(plain(item.sets), [
    { reps: Model.DEFAULT_REPS, targetSeconds: Model.DEFAULT_TARGET_SECONDS },
  ])
  assert.equal(Model.validateDraft(result.draft).ok, true)
})

test('시드의 모든 운동은 담을 수 있고 기본 기록 방식이 허용 방식 안에 있다', () => {
  const all = catalog().getAllExercises()
  assert.ok(all.length > 0)
  for (const exercise of all) {
    assert.equal(Plan.isAddableExercise(exercise), true, exercise.id)
    const result = plan(emptyDraft(), exercise)
    assert.equal(result.kind, 'start', exercise.id)
    const allowed = Model.buildAllowedRecordTypes(all)
    assert.equal(
      Model.validateDraft(result.draft, new Set(all.map((e) => e.id)), allowed)
        .ok,
      true,
      exercise.id,
    )
  }
})

// ─── 잘못된 운동 ID·운동 데이터 누락 ───────────────────────

test('운동 데이터가 없거나 id·이름이 비어 있으면 거절한다', () => {
  const base = exerciseById(1)
  const invalids = [
    undefined,
    null,
    'squat',
    42,
    [],
    {},
    { ...base, id: '' },
    { ...base, id: '   ' },
    { ...base, id: 7 },
    { ...base, id: undefined },
    { ...base, name: '' },
    { ...base, name: '  ' },
    { ...base, name: undefined },
    { ...base, targetMuscles: undefined },
    { ...base, equipment: 'dumbbell' },
  ]
  for (const bad of invalids) {
    const result = plan(emptyDraft(), bad)
    assert.deepEqual(plain(result), {
      kind: 'rejected',
      reason: 'invalidExercise',
    })
  }
})

test('기록 방식 메타데이터가 올바르지 않은 운동은 거절하고, 메타데이터가 없는 운동은 기존 추론으로 담는다', () => {
  const base = exerciseById(1)
  const brokenModes = [
    null,
    'reps',
    { default: 'distance', allowed: ['reps'] },
    { default: 'reps', allowed: [] },
    { default: 'reps', allowed: ['time'] },
    { default: 'reps', allowed: 'reps' },
    { default: 'reps', allowed: ['reps', 'reps'] },
  ]
  for (const recordModes of brokenModes) {
    assert.equal(
      plan(emptyDraft(), { ...base, recordModes }).reason,
      'invalidExercise',
    )
  }
  const legacy = { ...base }
  delete legacy.recordModes
  const result = plan(emptyDraft(), legacy)
  assert.equal(result.kind, 'start')
  assert.equal(
    result.draft.items[0].recordType,
    Model.resolveStoredRecordType(legacy),
  )
})

test('회원이 아니면 초안에 아무것도 담지 않고 거절한다', () => {
  assert.deepEqual(plain(plan(emptyDraft(), exerciseById(1), false)), {
    kind: 'rejected',
    reason: 'notMember',
  })
})

// ─── 기존 초안 처리 ───────────────────────────────────────

test('구성 중인 초안이 있으면 바로 바꾸지 않고 선택하게 한다(입력 초안은 변하지 않는다)', () => {
  const existing = deepFreeze(draftWith(2, 3))
  const before = plain(existing)
  const result = plan(existing, exerciseById(1))
  assert.equal(result.kind, 'choose')
  assert.equal(result.itemCount, 2)
  // 새 구성 초안은 이 운동 하나뿐이고, 기존 초안과 객체가 다르다.
  assert.equal(result.fresh.items.length, 1)
  assert.equal(result.fresh.items[0].exerciseId, exerciseById(1).id)
  assert.notEqual(result.fresh, existing)
  assert.deepEqual(plain(existing), before)
})

test('기존 초안에 추가하면 기존 항목·순서·값은 그대로이고 끝에 새 항목이 붙는다', () => {
  const existing = draftWith(2, 3)
  // 사용자가 편집한 값도 보존되어야 한다.
  const edited = Model.updateSetInItem(
    existing,
    existing.items[0].itemId,
    0,
    { reps: 15 },
    T0,
  )
  const appended = Model.addExercisesToDraft(edited, [exerciseById(1)], T0)
  assert.equal(appended.items.length, 3)
  assert.deepEqual(
    appended.items.slice(0, 2).map((i) => plain(i)),
    edited.items.map((i) => plain(i)),
  )
  assert.equal(appended.items[2].exerciseId, exerciseById(1).id)
  assert.equal(appended.items[0].sets[0].reps, 15)
  assert.equal(Model.validateDraft(appended).ok, true)
})

test('새 구성으로 시작하면 기존 초안이 사라지고 이 운동 하나만 남는다', () => {
  const existing = draftWith(2, 3)
  const result = plan(existing, exerciseById(1))
  assert.equal(result.kind, 'choose')
  assert.deepEqual(
    result.fresh.items.map((item) => item.exerciseId),
    [exerciseById(1).id],
  )
  // replaceDraft가 받는 조건(올바른 초안)을 통과한다.
  assert.equal(Model.validateDraft(result.fresh).ok, true)
  assert.equal(result.fresh.day, 'today')
})

test('취소(아무것도 적용하지 않음)하면 초안은 판단 전후로 같다', () => {
  const existing = deepFreeze(draftWith(2, 3, 4))
  const snapshot = JSON.stringify(existing)
  plan(existing, exerciseById(1))
  plan(existing, exerciseById(2))
  plan(existing, undefined)
  assert.equal(JSON.stringify(existing), snapshot)
})

// ─── 중복·상한 ────────────────────────────────────────────

test('이미 초안에 있는 운동은 W02·W13과 같이 건너뛴다(중복 추가 없음)', () => {
  const existing = deepFreeze(draftWith(1, 2))
  const result = plan(existing, exerciseById(1))
  assert.equal(result.kind, 'blocked')
  assert.equal(result.reason, 'duplicate')
  assert.equal(result.itemCount, 2)
  // 같은 입력에서 addExercisesToDraft도 아무것도 추가하지 않는다(같은 초안 객체를 돌려준다).
  assert.equal(Model.addExercisesToDraft(existing, [exerciseById(1)]), existing)
})

test('항목이 저장 상한(100개)에 이르면 추가하지 않는다', () => {
  assert.equal(Model.MAX_SAVED_ITEMS, 100)
  const items = Array.from({ length: Model.MAX_SAVED_ITEMS }, (_, index) => ({
    itemId: `x${index}`,
    exerciseId: `custom-${index}`,
    name: `운동 ${index}`,
    recordType: 'reps',
    sets: [{ reps: 10, targetSeconds: 60 }],
  }))
  const full = deepFreeze({ v: 1, day: 'today', updatedAt: T0(), items })
  const result = plan(full, exerciseById(1))
  assert.equal(result.kind, 'blocked')
  assert.equal(result.reason, 'full')
  // 이미 있는 운동이면서 가득 찼다면 이유는 중복이다.
  const withDup = deepFreeze({
    ...full,
    items: [{ ...items[0], exerciseId: exerciseById(1).id }, ...items.slice(1)],
  })
  assert.equal(plan(withDup, exerciseById(1)).reason, 'duplicate')
})

// ─── 계정 격리 ────────────────────────────────────────────

test('계정이 바뀌면 이전 계정의 초안을 읽지 않고 새 계정은 자기 초안 기준으로 판단한다', () => {
  const bag = new Map()
  const storage = {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => void bag.set(key, value),
    removeItem: (key) => void bag.delete(key),
  }
  // 계정 A가 E02에서 담은 초안을 저장한다.
  const started = plan(emptyDraft(), exerciseById(1))
  assert.equal(Storage.saveWorkoutDraft('user-a', started.draft, storage), true)
  assert.equal(
    Storage.readWorkoutDraft('user-a', storage).draft.items[0].exerciseId,
    exerciseById(1).id,
  )
  // 계정 B는 A의 초안을 읽을 수 없고(소유자 지문 불일치), 그래서 빈 초안으로 시작한다.
  const readB = Storage.readWorkoutDraft('user-b', storage)
  assert.equal(readB.draft, null)
  const resultB = plan(readB.draft ?? emptyDraft(), exerciseById(2))
  assert.equal(resultB.kind, 'start')
  assert.deepEqual(
    resultB.draft.items.map((item) => item.exerciseId),
    [exerciseById(2).id],
  )
})

// ─── 연결(소스 검사). 실제 동작은 Chrome 검증이 맡는다 ─────────

const source = (path) =>
  readFileSync(new URL(`../src/${path}`, import.meta.url), 'utf8')

test('E02 액션은 회원에게만 그려지고, W02 초안 규칙(planAddToToday·replaceDraft·addExercises)과 W02 경로를 쓴다', () => {
  const view = source('components/exercise/ExerciseDetailView.tsx')
  assert.match(
    view,
    /isMember \? <ExerciseRoutineActions exercise=\{exercise\} \/> : null/,
  )
  const actions = source('components/exercise/ExerciseRoutineActions.tsx')
  assert.match(actions, /planAddToToday/)
  assert.match(actions, /replaceDraft/)
  assert.match(actions, /addExercises/)
  assert.match(actions, /'\/records\/exercise\/compose'/)
  // 운동 목록 저장·API·IndexedDB는 이 화면이 하지 않는다.
  assert.doesNotMatch(
    actions,
    /saveWorkoutList|indexedDB|fetch\(|startOrResume/,
  )
  // 내일 계획은 예정일 기능이 없어 저장하지 않는다.
  assert.match(actions, /내일 계획은 아직 준비 중이에요/)
})

// ─── 화면 렌더링(회원 전용·초기 상태) ───────────────────────

const wrap = (Auth, Draft, authValue, draftValue, child) =>
  createElement(
    MemoryRouter,
    null,
    createElement(
      Auth.AuthContext,
      { value: authValue },
      createElement(Draft.WorkoutDraftContext, { value: draftValue }, child),
    ),
  )

test('비회원 E02에는 오늘 기록·내일 계획 버튼이 없다', async () => {
  const Detail = (
    await server.ssrLoadModule(
      '/src/components/exercise/ExerciseDetailView.tsx',
    )
  ).default
  const Auth = await server.ssrLoadModule('/src/auth/authContext.ts')
  const Draft = await server.ssrLoadModule(
    '/src/exercise/workoutDraftContext.ts',
  )
  const html = renderToStaticMarkup(
    wrap(
      Auth,
      Draft,
      { status: 'unauthenticated', user: null },
      { status: 'guest', draft: emptyDraft(), hasContent: false },
      createElement(Detail, { exercise: exerciseById(1) }),
    ),
  )
  assert.doesNotMatch(html, /오늘 기록/)
  assert.doesNotMatch(html, /내일 계획/)
})

test('회원 E02 액션은 두 버튼만 그리고, 확인 패널과 안내는 누르기 전에는 없다', async () => {
  const Actions = (
    await server.ssrLoadModule(
      '/src/components/exercise/ExerciseRoutineActions.tsx',
    )
  ).default
  const Auth = await server.ssrLoadModule('/src/auth/authContext.ts')
  const Draft = await server.ssrLoadModule(
    '/src/exercise/workoutDraftContext.ts',
  )
  const exercise = exerciseById(1)
  const member = {
    status: 'authenticated',
    user: { id: 'user-a', email: 'a@example.com', name: '가' },
  }
  for (const draft of [emptyDraft(), draftWith(2, 3)]) {
    const html = renderToStaticMarkup(
      wrap(
        Auth,
        Draft,
        member,
        {
          status: 'ready',
          draft,
          hasContent: draft.items.length > 0,
          replaceDraft: () => true,
          addExercises: () => {},
        },
        createElement(Actions, { exercise }),
      ),
    )
    assert.match(html, new RegExp(`오늘 기록에 추가: ${exercise.name}`))
    assert.match(html, new RegExp(`내일 계획에 추가: ${exercise.name}`))
    assert.doesNotMatch(html, /구성 중이던 운동 목록이 있어요/)
    assert.doesNotMatch(html, /저장되지 않았어요/)
  }
})
