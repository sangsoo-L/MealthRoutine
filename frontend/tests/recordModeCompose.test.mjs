import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 기록 방식 5종(S3): W02 허용 방식·목표 입력, W11 저장 전 재검증, 목록 스냅샷·파서, 복합 방식 목록의 운동 시작 차단.
// 화면(W14·W15)의 복합 방식 진행·결과는 이 단계의 범위가 아니다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Draft
let Model
let Storage
let Save
let Start
let ListView
let Card
let StartParts
let RM
let SeedCatalog
let ItemCard

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Draft = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  Model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  Storage = await server.ssrLoadModule('/src/exercise/workoutDraftStorage.ts')
  Save = await server.ssrLoadModule('/src/exercise/saveWorkoutList.ts')
  Start = await server.ssrLoadModule('/src/exercise/startWorkout.ts')
  ListView = await server.ssrLoadModule('/src/exercise/workoutListView.ts')
  RM = await server.ssrLoadModule('/src/exercise/recordMode.ts')
  SeedCatalog = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  ItemCard = (
    await server.ssrLoadModule(
      '/src/components/exercise/compose/ComposeItemCard.tsx',
    )
  ).default
  Card = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/TodayExerciseSection.tsx',
    )
  ).default
  StartParts = await server.ssrLoadModule(
    '/src/components/exercise/dashboard/WorkoutStartParts.tsx',
  )
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const plain = (value) => JSON.parse(JSON.stringify(value))
const T0 = new Date('2026-11-16T03:00:00.000Z')
const catalogOf = () => SeedCatalog.getSeedCatalog()
const exercise = (id) => catalogOf().getExerciseById(String(id))
const allowedMap = () =>
  Draft.buildAllowedRecordTypes(catalogOf().getAllExercises())
const knownIds = () =>
  new Set(
    catalogOf()
      .getAllExercises()
      .map((e) => e.id),
  )
const draftOf = (items) => ({
  v: 1,
  day: 'today',
  updatedAt: T0.toISOString(),
  items,
})
const draftItem = (id, recordType, sets, name = `운동 ${id}`) => ({
  itemId: `i${id}`,
  exerciseId: String(id),
  name,
  recordType,
  sets,
})
const actions = new Proxy({}, { get: () => noop })
const renderCard = (item, allowedTypes, issues = []) =>
  renderToStaticMarkup(
    createElement(
      'ol',
      null,
      createElement(ItemCard, {
        item,
        index: 0,
        total: 1,
        issues,
        allowedTypes,
        actions,
      }),
    ),
  )
const fieldId = (item, setIndex, field) =>
  `compose-${item.itemId}-${setIndex}-${field}`

// ─── W02: 운동별 허용 기록 방식 ────────────────────────────

test('W02 단일 방식(플랭크): 선택 컨트롤 없이 시간형으로 고정 표시하고 목표 시간만 입력한다', () => {
  const item = draftItem(22, 'time', [{ targetSeconds: 60 }], '플랭크')
  const html = renderCard(item, Draft.allowedRecordTypes(exercise(22)))
  assert.doesNotMatch(html, /<select/)
  assert.match(html, /data-record-type-fixed="true"/)
  assert.match(html, /시간형/)
  assert.match(html, /이 운동은 이 방식으로만 기록해요/)
  assert.match(html, new RegExp(`id="${fieldId(item, 0, 'targetSeconds')}"`))
  assert.doesNotMatch(html, new RegExp(fieldId(item, 0, 'reps')))
  assert.doesNotMatch(html, new RegExp(fieldId(item, 0, 'weightKg')))
})

test('W02 단일 방식(덤벨 바이셉스 컬): 중량+횟수형으로 고정, 횟수와 중량을 입력하고 목표 중량은 비워도 된다는 안내가 있다', () => {
  const item = draftItem(10, 'weight', [{ reps: 8 }], '덤벨 바이셉스 컬')
  const html = renderCard(item, Draft.allowedRecordTypes(exercise(10)))
  assert.doesNotMatch(html, /<select/)
  assert.match(html, /중량\+횟수형/)
  assert.match(html, new RegExp(fieldId(item, 0, 'reps')))
  assert.match(html, new RegExp(fieldId(item, 0, 'weightKg')))
  assert.doesNotMatch(html, new RegExp(fieldId(item, 0, 'targetSeconds')))
  assert.match(html, /목표 중량은 비워 둘 수 있어요/)
})

test('W02 복수 방식(점핑 잭): 시간형·횟수형·시간+횟수형만 고를 수 있고 현재 방식에 맞는 입력란이 나온다', () => {
  const allowed = Draft.allowedRecordTypes(exercise(29))
  const options = (html) =>
    [...html.matchAll(/<option value="([a-z_]+)"[^>]*>([^<]*)<\/option>/g)].map(
      (m) => [m[1], m[2]],
    )
  const time = draftItem(29, 'time', [{ targetSeconds: 30 }], '점핑 잭')
  const html = renderCard(time, allowed)
  assert.match(html, /<select/)
  assert.doesNotMatch(html, /data-record-type-fixed/)
  assert.deepEqual(options(html), [
    ['time', '시간형'],
    ['reps', '횟수형'],
    ['time_reps', '시간+횟수형'],
  ])
  // 허용하지 않는 방식(중량형·중량+시간형)은 선택 목록에 없다.
  assert.doesNotMatch(html, /value="weight"|value="weight_time"/)
  assert.match(html, new RegExp(fieldId(time, 0, 'targetSeconds')))
  assert.doesNotMatch(html, new RegExp(fieldId(time, 0, 'reps')))
  // 방식에 따라 입력란이 바뀐다.
  const reps = { ...time, recordType: 'reps' }
  const repsHtml = renderCard(reps, allowed)
  assert.match(repsHtml, new RegExp(fieldId(reps, 0, 'reps')))
  assert.doesNotMatch(repsHtml, new RegExp(fieldId(reps, 0, 'targetSeconds')))
  const both = {
    ...time,
    recordType: 'time_reps',
    sets: [{ targetSeconds: 30, reps: 40 }],
  }
  const bothHtml = renderCard(both, allowed)
  assert.match(bothHtml, new RegExp(fieldId(both, 0, 'targetSeconds')))
  assert.match(bothHtml, new RegExp(fieldId(both, 0, 'reps')))
  assert.match(bothHtml, /목표 시간/)
  assert.match(bothHtml, /목표 횟수/)
  assert.doesNotMatch(bothHtml, new RegExp(fieldId(both, 0, 'weightKg')))
})

test('W02 복수 방식(덤벨 수트케이스 캐리): 중량+시간형 기본, 시간형 선택 가능, 시간과 (선택) 중량 입력', () => {
  const allowed = Draft.allowedRecordTypes(exercise(87))
  assert.deepEqual([...allowed], ['weight_time', 'time'])
  const item = draftItem(
    87,
    Draft.resolveStoredRecordType(exercise(87)),
    [{ targetSeconds: 60 }],
    '덤벨 수트케이스 캐리',
  )
  assert.equal(item.recordType, 'weight_time')
  const html = renderCard(item, allowed)
  assert.match(html, /<select/)
  assert.match(html, /<option value="weight_time"[^>]*>중량\+시간형<\/option>/)
  assert.match(html, /<option value="time"[^>]*>시간형<\/option>/)
  assert.doesNotMatch(html, /value="reps"|value="weight"|value="time_reps"/)
  assert.match(html, new RegExp(fieldId(item, 0, 'targetSeconds')))
  assert.match(html, new RegExp(fieldId(item, 0, 'weightKg')))
  assert.doesNotMatch(html, new RegExp(fieldId(item, 0, 'reps')))
  assert.match(html, /목표 중량은 비워 둘 수 있어요/)
})

test('W02 기존 초안의 허용되지 않은 방식: 사용할 수 없음으로 표시하고 자동으로 바꾸지 않는다', () => {
  // 옛 초안이 플랭크를 횟수형으로 담고 있다. 카탈로그는 시간형만 허용한다.
  const item = draftItem(22, 'reps', [{ reps: 10 }], '플랭크')
  const allowed = Draft.allowedRecordTypes(exercise(22))
  const html = renderCard(item, allowed, [
    {
      itemId: item.itemId,
      field: 'recordType',
      message: Draft.ISSUE_MESSAGES.recordTypeNotAllowed,
    },
  ])
  assert.match(html, /<select/)
  assert.match(
    html,
    /<option value="reps" disabled[^>]*>횟수형 \(이 운동에서는 사용할 수\s*없어요\)<\/option>/,
  )
  assert.match(html, /<option value="time"[^>]*>시간형<\/option>/)
  assert.match(html, /이 운동에서는 사용할 수 없는 기록 방식이에요/)
  assert.match(
    html,
    /<select[^>]*value="reps"|selected=""[^>]*>횟수형|<option value="reps" disabled/,
  )
})

test('W02 메타데이터가 없는 운동(Mock·알 수 없는 운동)은 기존 3종 호환 정책을 쓴다', () => {
  const legacy = Draft.allowedRecordTypes({
    equipment: ['맨몸'],
    targetMuscles: ['복부'],
  })
  assert.deepEqual([...legacy].sort(), ['reps', 'time', 'weight'])
  assert.deepEqual([...Draft.LEGACY_ALLOWED_RECORD_TYPES].sort(), [
    'reps',
    'time',
    'weight',
  ])
  const item = draftItem('x', 'reps', [{ reps: 10 }], '옛 운동')
  const html = renderCard(item, legacy)
  assert.match(html, /<select/)
  const values = [...html.matchAll(/<option value="([a-z_]+)"/g)].map(
    (m) => m[1],
  )
  assert.deepEqual(values.sort(), ['reps', 'time', 'weight'])
})

test('W02 기본 방식 적용: 운동을 담으면 카탈로그 기본 방식(저장 코드)이 항목에 들어간다', () => {
  const picked = [29, 87, 22, 10, 5, 103].map(exercise)
  const draft = Draft.addExercisesToDraft(draftOf([]), picked, () =>
    T0.toISOString(),
  )
  assert.deepEqual(
    draft.items.map((i) => [i.exerciseId, i.recordType]),
    [
      ['29', 'time'],
      ['87', 'weight_time'],
      ['22', 'time'],
      ['10', 'weight'],
      ['5', 'reps'],
      ['103', 'reps'],
    ],
  )
})

test('W02 잘못된 방식 선택 거부: 허용 목록에 없는 방식과 알 수 없는 값은 초안을 바꾸지 않는다', () => {
  const draft = Draft.addExercisesToDraft(
    draftOf([]),
    [exercise(22), exercise(29)],
    () => T0.toISOString(),
  )
  const [plank, jumping] = draft.items
  const plankAllowed = Draft.allowedRecordTypes(exercise(22))
  const jumpingAllowed = Draft.allowedRecordTypes(exercise(29))
  const set = (d, id, type, allowed) =>
    Draft.setItemRecordType(d, id, type, () => T0.toISOString(), allowed)
  // 플랭크는 시간형만 허용
  assert.equal(set(draft, plank.itemId, 'reps', plankAllowed), draft)
  assert.equal(set(draft, plank.itemId, 'weight_time', plankAllowed), draft)
  // 알 수 없는 값
  assert.equal(set(draft, plank.itemId, 'distance', plankAllowed), draft)
  // 점핑 잭은 시간형·횟수형·시간+횟수형만 허용
  assert.equal(set(draft, jumping.itemId, 'weight', jumpingAllowed), draft)
  const changed = set(draft, jumping.itemId, 'time_reps', jumpingAllowed)
  assert.notEqual(changed, draft)
  assert.equal(changed.items[1].recordType, 'time_reps')
  // 허용 목록을 주지 않으면 기존처럼 5종 안에서 바꿀 수 있다(호환).
  assert.equal(
    set(draft, plank.itemId, 'reps', undefined).items[0].recordType,
    'reps',
  )
})

test('W02 방식 변경 시 입력값 보존, 저장할 때는 현재 방식의 값만 담는다', () => {
  let draft = draftOf([
    draftItem(
      29,
      'time_reps',
      [{ targetSeconds: 45, reps: 30, weightKg: 7 }],
      '점핑 잭',
    ),
  ])
  const allowed = Draft.allowedRecordTypes(exercise(29))
  const known = knownIds()
  const map = allowedMap()
  const toType = (type) => {
    draft = Draft.setItemRecordType(
      draft,
      'i29',
      type,
      () => T0.toISOString(),
      allowed,
    )
  }
  // 횟수형으로 바꿔도 시간·중량 입력은 초안에 남아 있다(숨겨질 뿐).
  toType('reps')
  assert.deepEqual(draft.items[0].sets[0], {
    targetSeconds: 45,
    reps: 30,
    weightKg: 7,
  })
  assert.deepEqual(plain(Draft.normalizeDraft(draft, known, map)[0].sets), [
    { reps: 30 },
  ])
  // 시간형: 시간만
  toType('time')
  assert.deepEqual(plain(Draft.normalizeDraft(draft, known, map)[0].sets), [
    { targetSeconds: 45 },
  ])
  // 다시 시간+횟수형: 두 값이 모두 되살아난다(중량은 이 방식의 구성값이 아니라 섞이지 않는다).
  toType('time_reps')
  assert.deepEqual(plain(Draft.normalizeDraft(draft, known, map)[0].sets), [
    { reps: 30, targetSeconds: 45 },
  ])
})

test('W02 초안 저장·복원: 복합 방식 초안이 sessionStorage 직렬화를 거쳐 그대로 돌아온다', () => {
  const draft = draftOf([
    draftItem(29, 'time_reps', [{ targetSeconds: 30, reps: 40 }], '점핑 잭'),
    draftItem(
      87,
      'weight_time',
      [{ targetSeconds: 60, weightKg: 5 }, { targetSeconds: 90 }],
      '덤벨 수트케이스 캐리',
    ),
    draftItem(10, 'weight', [{ reps: 8 }], '덤벨 바이셉스 컬'),
  ])
  const bag = new Map()
  const storage = {
    getItem: (key) => bag.get(key) ?? null,
    setItem: (key, value) => void bag.set(key, value),
    removeItem: (key) => void bag.delete(key),
  }
  assert.equal(Storage.saveWorkoutDraft('u1', draft, storage), true)
  const read = Storage.readWorkoutDraft('u1', storage)
  assert.equal(read.needsRemoval, false)
  assert.deepEqual(plain(read.draft), plain(draft))
  // 다른 계정은 읽지 못한다(소유자 격리).
  assert.equal(Storage.readWorkoutDraft('u2', storage).draft, null)
  // 알 수 없는 방식 값이 들어 있는 저장본은 손상으로 버려진다.
  const raw = JSON.parse(bag.get(Storage.WORKOUT_DRAFT_KEY))
  raw.draft.items[0].recordType = 'distance'
  const parsed = Storage.parseStoredDraft(JSON.stringify(raw), 'u1')
  assert.equal(parsed.ok, false)
})

// ─── W02·W11: 목표값 검증 ──────────────────────────────────

const validate = (items, withAllowed = true) =>
  Draft.validateDraft(
    draftOf(items),
    knownIds(),
    withAllowed ? allowedMap() : undefined,
  )
const issueFields = (result) =>
  result.ok ? [] : result.issues.map((i) => i.field)

test('목표값: 시간형은 시간, 횟수형은 횟수, 중량+횟수형은 횟수(중량 선택), 시간+횟수형은 시간과 횟수, 중량+시간형은 시간(중량 선택)이 필요하다', () => {
  assert.equal(
    validate([draftItem(22, 'time', [{ targetSeconds: 60 }])]).ok,
    true,
  )
  assert.deepEqual(
    issueFields(validate([draftItem(22, 'time', [{ reps: 10 }])])),
    ['targetSeconds'],
  )
  assert.equal(validate([draftItem(5, 'reps', [{ reps: 10 }])]).ok, true)
  assert.deepEqual(
    issueFields(validate([draftItem(5, 'reps', [{ targetSeconds: 60 }])])),
    ['reps'],
  )
  // 중량+횟수형: 목표 중량 선택(없어도 됨, 0kg 허용)
  assert.equal(validate([draftItem(10, 'weight', [{ reps: 8 }])]).ok, true)
  assert.equal(
    validate([draftItem(10, 'weight', [{ reps: 8, weightKg: 0 }])]).ok,
    true,
  )
  assert.equal(
    validate([draftItem(10, 'weight', [{ reps: 8, weightKg: 12.5 }])]).ok,
    true,
  )
  assert.deepEqual(
    issueFields(validate([draftItem(10, 'weight', [{ weightKg: 5 }])])),
    ['reps'],
  )
  // 시간+횟수형: 둘 다 필수
  assert.equal(
    validate([draftItem(29, 'time_reps', [{ targetSeconds: 30, reps: 40 }])])
      .ok,
    true,
  )
  assert.deepEqual(
    issueFields(validate([draftItem(29, 'time_reps', [{ reps: 40 }])])),
    ['targetSeconds'],
  )
  assert.deepEqual(
    issueFields(
      validate([draftItem(29, 'time_reps', [{ targetSeconds: 30 }])]),
    ),
    ['reps'],
  )
  assert.deepEqual(issueFields(validate([draftItem(29, 'time_reps', [{}])])), [
    'targetSeconds',
    'reps',
  ])
  // 중량+시간형: 시간 필수, 중량 선택
  assert.equal(
    validate([draftItem(87, 'weight_time', [{ targetSeconds: 60 }])]).ok,
    true,
  )
  assert.equal(
    validate([
      draftItem(87, 'weight_time', [{ targetSeconds: 60, weightKg: 0 }]),
    ]).ok,
    true,
  )
  assert.deepEqual(
    issueFields(validate([draftItem(87, 'weight_time', [{ weightKg: 5 }])])),
    ['targetSeconds'],
  )
})

test('목표값: 잘못된 숫자(0·음수·소수·범위 밖·NaN·Infinity)는 해당 입력의 오류가 된다', () => {
  const field = (type, id, set) =>
    issueFields(validate([draftItem(id, type, [set])]))
  assert.deepEqual(field('time_reps', 29, { targetSeconds: 0, reps: 10 }), [
    'targetSeconds',
  ])
  assert.deepEqual(field('time_reps', 29, { targetSeconds: 3601, reps: 10 }), [
    'targetSeconds',
  ])
  assert.deepEqual(field('time_reps', 29, { targetSeconds: 30.5, reps: 10 }), [
    'targetSeconds',
  ])
  assert.deepEqual(
    field('time_reps', 29, { targetSeconds: Number.NaN, reps: 10 }),
    ['targetSeconds'],
  )
  assert.deepEqual(
    field('time_reps', 29, { targetSeconds: Infinity, reps: 10 }),
    ['targetSeconds'],
  )
  assert.deepEqual(field('time_reps', 29, { targetSeconds: 30, reps: 0 }), [
    'reps',
  ])
  assert.deepEqual(field('time_reps', 29, { targetSeconds: 30, reps: 2.5 }), [
    'reps',
  ])
  assert.deepEqual(field('time_reps', 29, { targetSeconds: 30, reps: -1 }), [
    'reps',
  ])
  assert.deepEqual(
    field('weight_time', 87, { targetSeconds: 60, weightKg: -1 }),
    ['weightKg'],
  )
  assert.deepEqual(
    field('weight_time', 87, { targetSeconds: 60, weightKg: Number.NaN }),
    ['weightKg'],
  )
  assert.deepEqual(
    field('weight_time', 87, { targetSeconds: 60, weightKg: Infinity }),
    ['weightKg'],
  )
  assert.deepEqual(field('weight', 10, { reps: 8, weightKg: -0.5 }), [
    'weightKg',
  ])
})

// ─── W11: 저장 전 허용 방식 재검증 ─────────────────────────

test('W11 재검증: 허용하지 않는 기록 방식은 저장하지 않고 문제 운동을 알린다(다른 운동 데이터는 그대로)', () => {
  const draft = draftOf([
    draftItem(22, 'reps', [{ reps: 10 }], '플랭크'), // 허용: 시간형만
    draftItem(5, 'reps', [{ reps: 10 }], '푸시업'),
    draftItem(29, 'weight', [{ reps: 5 }], '점핑 잭'), // 허용: 시간·횟수·시간+횟수
  ])
  const result = Draft.validateDraft(draft, knownIds(), allowedMap())
  assert.equal(result.ok, false)
  assert.deepEqual(
    result.issues.map((i) => [i.itemId, i.field]),
    [
      ['i22', 'recordType'],
      ['i29', 'recordType'],
    ],
  )
  assert.ok(
    result.issues.every((i) => i.message.includes('사용할 수 없는 기록 방식')),
  )
  assert.equal(Draft.normalizeDraft(draft, knownIds(), allowedMap()), null)
  // 초안은 바뀌지 않는다.
  assert.equal(draft.items[1].sets[0].reps, 10)
  // 허용 정보를 주지 않으면(운동 정보를 읽지 못한 경우) 방식은 판단하지 않는다.
  assert.equal(Draft.validateDraft(draft, knownIds()).ok, true)
})

test('W11 저장 절차: 허용되지 않은 방식은 저장소를 부르지 않고, 올바른 복합 방식 목록은 허용 표와 함께 저장한다', async () => {
  const calls = []
  const repository = {
    listByDate: async () => ({ items: [], skippedCount: 0 }),
    saveFromDraft: async (input) => {
      calls.push(input)
      const list = Model.buildWorkoutList({
        id: 'l1',
        ownerId: 'u',
        requestId: input.requestId,
        draft: input.draft,
        knownExerciseIds: input.knownExerciseIds,
        allowedRecordTypes: input.allowedRecordTypes,
        catalogVersion: 'seed',
        now: new Date(2026, 10, 16, 12),
      })
      return { list, created: true }
    },
  }
  const deps = {
    listRepository: repository,
    now: () => new Date(2026, 10, 16, 12),
  }
  const base = {
    knownExerciseIds: knownIds(),
    allowedRecordTypes: allowedMap(),
    acknowledgedDate: '2026-11-16',
    confirmedReplaceListId: null,
  }
  // 허용되지 않은 방식 → invalid, 저장소 호출 없음
  const bad = await Save.saveWorkoutList(deps, {
    ...base,
    draft: draftOf([draftItem(22, 'reps', [{ reps: 10 }])]),
  })
  assert.equal(bad.kind, 'invalid')
  assert.equal(bad.issues[0].field, 'recordType')
  assert.equal(calls.length, 0)
  // 올바른 복합 방식 목록 → 저장
  const good = draftOf([
    draftItem(29, 'time_reps', [{ targetSeconds: 30, reps: 40 }], '점핑 잭'),
    draftItem(
      87,
      'weight_time',
      [{ targetSeconds: 60, weightKg: 5 }, { targetSeconds: 60 }],
      '덤벨 수트케이스 캐리',
    ),
  ])
  const saved = await Save.saveWorkoutList(deps, { ...base, draft: good })
  assert.equal(saved.kind, 'saved')
  assert.equal(calls.length, 1)
  assert.ok(calls[0].allowedRecordTypes instanceof Map)
  assert.deepEqual(plain(saved.list.items.map((i) => [i.recordType, i.sets])), [
    ['time_reps', [{ reps: 40, targetSeconds: 30 }]],
    [
      'weight_time',
      [{ targetSeconds: 60, weightKg: 5 }, { targetSeconds: 60 }],
    ],
  ])
})

test('W11 저장소 수준 방어: buildWorkoutList도 허용 표가 주어지면 허용하지 않는 방식 목록을 만들지 않는다', () => {
  const params = (items, allowed) => ({
    id: 'l1',
    ownerId: 'u',
    requestId: 'r1',
    draft: draftOf(items),
    knownExerciseIds: knownIds(),
    allowedRecordTypes: allowed,
    catalogVersion: 'seed',
    now: T0,
  })
  const bad = [draftItem(22, 'weight', [{ reps: 5 }])]
  assert.equal(Model.buildWorkoutList(params(bad, allowedMap())), null)
  // 허용 표가 없으면 기존 동작(호환): 저장 가능
  assert.notEqual(Model.buildWorkoutList(params(bad, undefined)), null)
})

// ─── 스냅샷·파서 ───────────────────────────────────────────

test('스냅샷: time_reps·weight_time 목표값이 저장·복원되고 다른 방식의 입력값은 섞이지 않는다', () => {
  const draft = draftOf([
    draftItem(
      29,
      'time_reps',
      [{ targetSeconds: 30, reps: 40, weightKg: 9 }],
      '점핑 잭',
    ),
    draftItem(
      87,
      'weight_time',
      [
        { targetSeconds: 60, reps: 12, weightKg: 5 },
        { targetSeconds: 45, reps: 3 },
      ],
      '덤벨 수트케이스 캐리',
    ),
    draftItem(
      22,
      'time',
      [{ targetSeconds: 60, reps: 10, weightKg: 4 }],
      '플랭크',
    ),
    draftItem(
      5,
      'reps',
      [{ targetSeconds: 60, reps: 10, weightKg: 4 }],
      '푸시업',
    ),
    draftItem(
      10,
      'weight',
      [{ targetSeconds: 60, reps: 8, weightKg: 4 }],
      '덤벨 바이셉스 컬',
    ),
  ])
  const list = Model.buildWorkoutList({
    id: 'l1',
    ownerId: 'u',
    requestId: 'r1',
    draft,
    knownExerciseIds: knownIds(),
    allowedRecordTypes: allowedMap(),
    catalogVersion: 'seed',
    now: T0,
  })
  assert.deepEqual(plain(list.items.map((i) => [i.recordType, i.sets])), [
    ['time_reps', [{ reps: 40, targetSeconds: 30 }]],
    [
      'weight_time',
      [{ targetSeconds: 60, weightKg: 5 }, { targetSeconds: 45 }],
    ],
    ['time', [{ targetSeconds: 60 }]],
    ['reps', [{ reps: 10 }]],
    ['weight', [{ reps: 8, weightKg: 4 }]],
  ])
  // 저장 → 직렬화 → 읽기로 그대로 돌아온다.
  const restored = Model.parseWorkoutList(plain(list))
  assert.notEqual(restored, null)
  assert.deepEqual(plain(restored.items), plain(list.items))
  assert.equal(Model.sameListItems(restored.items, list.items), true)
  // 세션 스냅샷도 같은 목표 구조를 읽는다(세션 생성 차단은 저장소 수준에서 한다).
  const session = Model.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list,
    now: T0,
  })
  assert.notEqual(Model.parseWorkoutSession(plain(session)), null)
})

test('파서: 방식의 구성값과 맞지 않는 목표·수행값 필드는 손상이고 기존 3종 데이터는 그대로 유효하다', () => {
  const list = (item) => ({
    id: 'l',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-16',
    catalogVersion: 'seed',
    revision: 1,
    requestId: 'r',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [{ exerciseId: '1', exerciseNameSnapshot: '운동', ...item }],
  })
  const ok = (item) => Model.parseWorkoutList(plain(list(item))) !== null
  // 기존 3종(저장 규칙 그대로)
  assert.equal(ok({ recordType: 'reps', sets: [{ reps: 10 }] }), true)
  assert.equal(
    ok({
      recordType: 'weight',
      sets: [{ reps: 10 }, { reps: 10, weightKg: 0 }],
    }),
    true,
  )
  assert.equal(ok({ recordType: 'time', sets: [{ targetSeconds: 60 }] }), true)
  assert.equal(
    ok({ recordType: 'reps', sets: [{ reps: 10, weightKg: 5 }] }),
    false,
  )
  assert.equal(
    ok({ recordType: 'time', sets: [{ targetSeconds: 60, reps: 10 }] }),
    false,
  )
  // 복합 방식
  assert.equal(
    ok({ recordType: 'time_reps', sets: [{ reps: 40, targetSeconds: 30 }] }),
    true,
  )
  assert.equal(ok({ recordType: 'time_reps', sets: [{ reps: 40 }] }), false)
  assert.equal(
    ok({ recordType: 'time_reps', sets: [{ targetSeconds: 30 }] }),
    false,
  )
  assert.equal(
    ok({
      recordType: 'time_reps',
      sets: [{ reps: 40, targetSeconds: 30, weightKg: 3 }],
    }),
    false,
  )
  assert.equal(
    ok({ recordType: 'weight_time', sets: [{ targetSeconds: 60 }] }),
    true,
  )
  assert.equal(
    ok({
      recordType: 'weight_time',
      sets: [{ targetSeconds: 60, weightKg: 0 }],
    }),
    true,
  )
  assert.equal(
    ok({
      recordType: 'weight_time',
      sets: [{ targetSeconds: 60, weightKg: -1 }],
    }),
    false,
  )
  assert.equal(
    ok({ recordType: 'weight_time', sets: [{ weightKg: 5 }] }),
    false,
  )
  assert.equal(
    ok({ recordType: 'weight_time', sets: [{ targetSeconds: 60, reps: 10 }] }),
    false,
  )
  assert.equal(
    ok({ recordType: 'weight_time', sets: [{ targetSeconds: 0 }] }),
    false,
  )
  assert.equal(ok({ recordType: 'distance', sets: [{ reps: 1 }] }), false)
})

test('과거 방식 소급 변경 방지: 허용 목록은 저장된 목록을 읽는 경로에 적용되지 않고 과거 값이 그대로 유지된다', () => {
  // 옛 목록이 플랭크(허용: 시간형만)를 횟수형으로 저장했다.
  const old = {
    id: 'l-old',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-13',
    catalogVersion: 'seed',
    revision: 1,
    requestId: 'r',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [
      {
        exerciseId: '22',
        exerciseNameSnapshot: '플랭크',
        recordType: 'reps',
        sets: [{ reps: 10 }],
      },
    ],
  }
  const parsed = Model.parseWorkoutList(plain(old))
  assert.notEqual(parsed, null)
  assert.equal(parsed.items[0].recordType, 'reps')
  assert.deepEqual(plain(parsed.items[0].sets), [{ reps: 10 }])
  // 읽기·세션 생성은 허용 표를 쓰지 않는다: 소스에서 확인(검증은 초안·저장 경로의 validateDraft·buildWorkoutList에만 있다).
  const model = readFileSync(
    new URL('../src/exercise/workoutModel.ts', import.meta.url),
    'utf8',
  )
  const parseBody = model.slice(
    model.indexOf('export function parseWorkoutList'),
    model.indexOf('function validSnapshot'),
  )
  assert.doesNotMatch(parseBody, /allowed/i)
  const session = Model.createWorkoutSession({
    id: 's-old',
    ownerId: 'u',
    list: old,
    now: T0,
  })
  assert.equal(session.listSnapshot.items[0].recordType, 'reps')
  // 같은 초안을 그대로 다시 저장하려 하면 W11 재검증이 막고, 사용자가 방식을 직접 고쳐야 한다(자동 변환·삭제 없음).
  const redraft = draftOf([draftItem(22, 'reps', [{ reps: 10 }], '플랭크')])
  assert.equal(Draft.validateDraft(redraft, knownIds(), allowedMap()).ok, false)
  assert.equal(redraft.items[0].recordType, 'reps')
})

// ─── 실행 차단 ─────────────────────────────────────────────

const TODAY = '2026-11-16'
const todayList = (over = {}) => ({ id: 'l1', plannedDate: TODAY, ...over })
const activeSummary = (over = {}) => ({
  id: 's1',
  listId: 'x',
  revision: 2,
  startedDate: TODAY,
  startedToday: true,
  plannedDate: TODAY,
  completedSets: 1,
  totalSets: 3,
  ...over,
})
const decide = (list, active = null, done = []) =>
  Start.decideStart({ today: TODAY, list, active, doneListIds: new Set(done) })

test('시작 판단: 복합 방식 목록은 시작하지 않고(unsupported), 단일 방식 목록은 기존대로 시작·이어하기·충돌 판단을 한다', () => {
  assert.deepEqual(decide(todayList({ startBlocked: true })), {
    kind: 'unsupported',
  })
  // 다른 진행 중 세션이 있어도 충돌 패널이 아니라 시작 불가다(그만두고 새로 시작도 막는다).
  assert.deepEqual(decide(todayList({ startBlocked: true }), activeSummary()), {
    kind: 'unsupported',
  })
  // 기존 동작 유지
  assert.equal(decide(todayList()).kind, 'start')
  assert.equal(decide(todayList({ startBlocked: false })).kind, 'start')
  assert.equal(
    decide(todayList(), activeSummary({ listId: 'l1' })).kind,
    'resume',
  )
  assert.equal(decide(todayList(), activeSummary()).kind, 'conflict')
  assert.equal(decide(todayList(), null, ['l1']).kind, 'done')
  assert.equal(
    decide(todayList({ plannedDate: '2026-11-15', startBlocked: true })).kind,
    'notToday',
  )
})

test('오늘의 운동 표시 값: S5부터 복합 방식 목록도 시작을 막지 않는다(startBlocked 없음)', () => {
  const mk = (items) => ({
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: TODAY,
    catalogVersion: 'seed',
    revision: 1,
    requestId: 'r',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items,
  })
  const composite = ListView.todayViewFromList(
    mk([
      {
        exerciseId: '5',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }],
      },
      {
        exerciseId: '29',
        exerciseNameSnapshot: '점핑 잭',
        recordType: 'time_reps',
        sets: [{ reps: 40, targetSeconds: 30 }],
      },
    ]),
  )
  assert.equal('startBlocked' in composite, false)
  assert.deepEqual(plain(composite.items[1]), {
    name: '점핑 잭',
    detail: '30초 · 40회 × 1세트',
    trailing: '시간+횟수형',
  })
  const simple = ListView.todayViewFromList(
    mk([
      {
        exerciseId: '5',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }],
      },
      {
        exerciseId: '10',
        exerciseNameSnapshot: '덤벨 컬',
        recordType: 'weight',
        sets: [{ reps: 8 }],
      },
      {
        exerciseId: '22',
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        sets: [{ targetSeconds: 60 }],
      },
    ]),
  )
  assert.equal('startBlocked' in simple, false)
})

const controls = (over = {}) => ({
  status: 'ready',
  active: null,
  decision: { kind: 'start', listId: 'l1' },
  busy: false,
  error: null,
  panel: null,
  reload: noop,
  start: noop,
  resume: noop,
  openAbandon: noop,
  chooseAbandonAndStart: noop,
  confirmAbandon: noop,
  closePanel: noop,
  ...over,
})
const renderToday = (start, data) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Card, {
        slot: { status: 'ready', data },
        draftCount: 0,
        onRetry: noop,
        start,
      }),
    ),
  )
const todayView = (over = {}) => ({
  phase: 'planned',
  listName: '오늘 할 운동 목록',
  exerciseCount: 1,
  setCount: 1,
  items: [
    { name: '점핑 잭', detail: '30초 · 40회 × 1세트', trailing: '시간+횟수형' },
  ],
  listId: 'l1',
  plannedDate: TODAY,
  ...over,
})

test('W01 시작 차단 화면: 복합 방식 목록은 시작 버튼이 비활성이고 안내 문구가 나오며, 단일 방식 목록은 정상 시작 버튼이다', () => {
  const blocked = renderToday(
    controls({ decision: { kind: 'unsupported' } }),
    todayView({ startBlocked: true }),
  )
  assert.match(
    blocked,
    /aria-disabled="true"[^>]*aria-describedby="start-unsupported-note"[^>]*>\s*이 목록으로 바로 운동 시작/,
  )
  assert.match(
    blocked,
    /이 운동 목록에는 아직 진행 기능이 준비되지 않은 기록 방식이 포함되어 있어요/,
  )
  assert.match(
    blocked,
    /해당 방식의 운동 진행 기능이 적용된 후 시작할 수 있어요/,
  )
  assert.doesNotMatch(blocked, /시작하는 중/)
  const simple = renderToday(
    controls(),
    todayView({
      items: [{ name: '푸시업', detail: '10회 × 1세트', trailing: '횟수형' }],
    }),
  )
  assert.match(simple, /aria-disabled="false"[^>]*>이 목록으로 바로 운동 시작/)
  assert.doesNotMatch(simple, /진행 기능이 준비되지 않은/)
})

test('세션 생성 경로 방어: startOrResume이 목록을 읽은 직후 복합 방식을 거절하고 오류 코드를 정의한다', () => {
  const repoSource = readFileSync(
    new URL(
      '../src/exercise/local/indexedDbWorkoutRepositories.ts',
      import.meta.url,
    ),
    'utf8',
  )
  const start = repoSource.indexOf('async startOrResume')
  const guard = repoSource.indexOf('findUnrunnableItems(list.items)', start)
  const create = repoSource.indexOf('createWorkoutSession(', start)
  assert.ok(start > 0 && guard > start, '시작 경로에 차단이 있다')
  assert.ok(guard < create, '세션 생성보다 먼저 차단한다')
  const active = repoSource.indexOf('activeSessions(tx)', start)
  assert.ok(guard < active, '진행 중 세션 확인(이어하기)보다 먼저 차단한다')
  assert.match(repoSource.slice(guard, guard + 200), /unsupportedRecordType/)
  const contract = readFileSync(
    new URL('../src/exercise/workoutRepositories.ts', import.meta.url),
    'utf8',
  )
  assert.match(contract, /'unsupportedRecordType'/)
})

test('차단 대상 판별: 5종은 모두 시작할 수 있고, 허용 목록 밖의 방식만 막는다', () => {
  for (const type of ['time', 'reps', 'weight', 'time_reps', 'weight_time']) {
    assert.deepEqual(RM.findUnrunnableItems([{ recordType: type }]), [], type)
  }
  assert.equal(
    RM.findUnrunnableItems([{ recordType: 'future_mode' }]).length,
    1,
  )
})

// ─── 목록 표시 ─────────────────────────────────────────────

test('W11 표시: 복합 방식의 세트 요약·슬라이드가 시간과 횟수/중량을 함께 보인다', () => {
  assert.equal(
    ListView.describeSets('time_reps', [
      { reps: 40, targetSeconds: 30 },
      { reps: 40, targetSeconds: 30 },
    ]),
    '30초 · 40회 × 2세트',
  )
  assert.equal(
    ListView.describeSets('time_reps', [
      { reps: 30, targetSeconds: 30 },
      { reps: 40, targetSeconds: 60 },
    ]),
    '2세트 · 30초~1분 · 30~40회',
  )
  assert.equal(
    ListView.describeSets('weight_time', [{ targetSeconds: 60, weightKg: 5 }]),
    '1분 · 5 kg × 1세트',
  )
  assert.equal(
    ListView.describeSets('weight_time', [{ targetSeconds: 60 }]),
    '1분 × 1세트',
  )
  const [slide] = ListView.buildSetSlides('time_reps', [
    { reps: 40, targetSeconds: 90 },
  ])
  assert.deepEqual(
    [slide.main, slide.unit, slide.extra],
    ['1:30', '분:초', '40회'],
  )
  assert.match(slide.spoken, /목표 시간 1분 30초, 목표 40회/)
  const [w1] = ListView.buildSetSlides('weight_time', [{ targetSeconds: 60 }])
  assert.equal(w1.extra, '중량 미입력')
  assert.deepEqual(
    plain(
      ListView.summarizeItems([
        { recordType: 'weight_time', sets: [1] },
        { recordType: 'time', sets: [1] },
        { recordType: 'time_reps', sets: [1] },
      ]).recordTypes,
    ),
    ['time', 'time_reps', 'weight_time'],
  )
})

test('기존 3종 표시는 그대로다(요약 문구 회귀)', () => {
  assert.equal(
    ListView.describeSets('time', [{ targetSeconds: 60 }]),
    '1분 × 1세트',
  )
  assert.equal(
    ListView.describeSets('reps', [{ reps: 10 }, { reps: 10 }]),
    '10회 × 2세트',
  )
  assert.equal(
    ListView.describeSets('weight', [{ reps: 10, weightKg: 8 }]),
    '10회 · 8 kg × 1세트',
  )
})
