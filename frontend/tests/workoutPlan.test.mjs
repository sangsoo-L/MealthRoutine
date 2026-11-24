import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// FAST-04C: 내일 운동 계획(W02·W11·W10·W01의 day=tomorrow)의 모델·내일 초안 분리·저장 절차·화면 구조와 "계획은 운동 목록·기록과 섞이지 않는다" 원칙.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 IndexedDB(저장·계정 격리·날짜별 1개·자정 경계·v1~v4→v5 업그레이드)와 화면 이동은 Chrome 스크립트(workout-plan)가 검증한다.
let server
let W // workoutPlanModel.ts
let S // saveWorkoutPlan.ts
let ST // workoutDraftStorage.ts
let DM // workoutDraftModel.ts
let ERR // workoutRepositories.ts
let Section // TomorrowPlanSection.tsx
let Next // NextExerciseSection.tsx
let Parts // ReviewParts.tsx
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
// 주석을 뺀 코드만 본다(주석은 설명을 위해 다른 저장소 이름을 말할 수 있다).
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  W = await server.ssrLoadModule('/src/exercise/workoutPlanModel.ts')
  S = await server.ssrLoadModule('/src/exercise/saveWorkoutPlan.ts')
  ST = await server.ssrLoadModule('/src/exercise/workoutDraftStorage.ts')
  DM = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  ERR = await server.ssrLoadModule('/src/exercise/workoutRepositories.ts')
  Section = (
    await server.ssrLoadModule(
      '/src/components/exercise/my/TomorrowPlanSection.tsx',
    )
  ).default
  Next = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/NextExerciseSection.tsx',
    )
  ).default
  Parts = await server.ssrLoadModule(
    '/src/components/exercise/review/ReviewParts.tsx',
  )
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

const NOW = new Date(2026, 10, 18, 12) // 로컬 정오: 오늘 2026-11-18(수)
const TODAY = '2026-11-18'
const TOMORROW = '2026-11-19'
const KNOWN = new Set(['e1', 'e2', 'e3'])
const AT = '2026-11-18T03:00:00.000Z'

const item = (id, name, recordType, sets) => ({
  itemId: `it-${id}`,
  exerciseId: id,
  name,
  recordType,
  sets,
})
const draft = (day = 'tomorrow', over = {}) => ({
  v: 1,
  day,
  items: [
    item('e1', '푸시업', 'reps', [{ reps: 10 }, { reps: 12 }]),
    item('e2', '플랭크', 'time', [{ targetSeconds: 45 }]),
  ],
  updatedAt: AT,
  ...over,
})
const plan = (over = {}) =>
  W.buildWorkoutPlan({
    id: 'p1',
    ownerId: 'free',
    requestId: 'req-1',
    planDate: TOMORROW,
    draft: draft(),
    knownExerciseIds: KNOWN,
    catalogVersion: 'dev-v1',
    now: NOW,
    ...over,
  })

// ── 모델 ──
test('계획 만들기: planDate·운동 순서·기록 방식·세트별 목표·이름 스냅샷·revision 1을 저장한다', () => {
  const p = plan()
  assert.equal(p.planDate, TOMORROW)
  assert.equal(p.revision, 1)
  assert.equal(p.schemaVersion, W.WORKOUT_PLAN_SCHEMA_VERSION)
  assert.equal(p.catalogVersion, 'dev-v1')
  assert.deepEqual(
    p.items.map((i) => [i.exerciseId, i.exerciseNameSnapshot, i.recordType]),
    [
      ['e1', '푸시업', 'reps'],
      ['e2', '플랭크', 'time'],
    ],
  )
  assert.deepEqual(p.items[0].sets, [{ reps: 10 }, { reps: 12 }])
  assert.deepEqual(p.items[1].sets, [{ targetSeconds: 45 }])
  assert.equal(p.createdAt, p.updatedAt)
  // 운동 목록과 달리 날짜 필드는 planDate이고, 운동 목록·세션을 가리키는 필드가 없다.
  assert.ok(!('plannedDate' in p))
  assert.ok(!('listId' in p) && !('sessionId' in p))
})

test('계획 만들기: 오늘 초안·알 수 없는 운동·올바르지 않은 날짜·세트 목표는 null이다(오늘 초안으로는 계획을 만들 수 없다)', () => {
  assert.equal(plan({ draft: draft('today') }), null)
  assert.equal(plan({ knownExerciseIds: new Set(['e1']) }), null)
  assert.equal(plan({ planDate: '2026-02-31' }), null)
  assert.equal(
    plan({
      draft: draft('tomorrow', {
        items: [item('e1', '푸시업', 'reps', [{ reps: 0 }])],
      }),
    }),
    null,
  )
  assert.equal(plan({ draft: draft('tomorrow', { items: [] }) }), null)
})

test('계획 교체: 운동 구성·revision·updatedAt만 바뀌고 id·소유자·계획 날짜·요청 id·createdAt은 그대로다', () => {
  const p = plan()
  const later = new Date(2026, 10, 18, 15)
  const next = W.buildWorkoutPlanReplace(p, {
    draft: draft('tomorrow', {
      items: [item('e3', '스쿼트', 'reps', [{ reps: 15 }])],
    }),
    knownExerciseIds: KNOWN,
    catalogVersion: 'dev-v2',
    now: later,
  })
  assert.equal(next.revision, 2)
  assert.equal(next.updatedAt, later.toISOString())
  assert.equal(next.createdAt, p.createdAt)
  assert.equal(next.id, p.id)
  assert.equal(next.planDate, p.planDate)
  assert.equal(next.requestId, p.requestId)
  assert.equal(next.catalogVersion, 'dev-v2')
  assert.deepEqual(
    next.items.map((i) => i.exerciseId),
    ['e3'],
  )
  assert.equal(
    W.buildWorkoutPlanReplace(p, {
      draft: draft('today'),
      knownExerciseIds: KNOWN,
      catalogVersion: 'x',
      now: later,
    }),
    null,
  )
})

test('저장소에서 읽은 값 검증: 손상 행은 null이고 운동 목록(plannedDate) 모양은 계획으로 읽히지 않는다', () => {
  const p = plan()
  assert.deepEqual(W.parseWorkoutPlan(JSON.parse(JSON.stringify(p))), p)
  const bad = (patch) => W.parseWorkoutPlan({ ...p, ...patch })
  assert.equal(bad({ schemaVersion: 9 }), null)
  assert.equal(bad({ planDate: '2026-02-31' }), null)
  assert.equal(bad({ items: [] }), null)
  assert.equal(bad({ items: [{ exerciseId: 'e1' }] }), null)
  assert.equal(bad({ revision: 0 }), null)
  assert.equal(bad({ requestId: '공백 있음' }), null)
  assert.equal(bad({ createdAt: 'yesterday' }), null)
  assert.equal(W.parseWorkoutPlan(null), null)
  assert.equal(W.parseWorkoutPlan([]), null)
  const asList = { ...p, plannedDate: p.planDate }
  delete asList.planDate
  assert.equal(W.parseWorkoutPlan(asList), null)
})

test('계획 날짜: 내일 이후만 열려 있고(오늘·지난 날짜는 닫힘) 날짜 더하기는 월·연 경계를 넘어도 올바르다', () => {
  assert.equal(W.isWorkoutPlanDateOpen('2026-11-19', TODAY), true)
  assert.equal(W.isWorkoutPlanDateOpen(TODAY, TODAY), false)
  assert.equal(W.isWorkoutPlanDateOpen('2026-11-17', TODAY), false)
  assert.equal(W.tomorrowOf(TODAY), TOMORROW)
  assert.equal(W.tomorrowOf('2026-12-31'), '2027-01-01')
  assert.equal(W.tomorrowOf('2028-02-28'), '2028-02-29')
  assert.equal(W.tomorrowOf('2027-02-28'), '2027-03-01')
})

test('계획 → 내일 초안(W10 수정): 운동 순서·기록 방식·세트 목표가 그대로이고 고치는 계획의 id·revision이 남는다', () => {
  const p = plan()
  const d = W.planToDraft(p, () => AT)
  assert.equal(d.day, 'tomorrow')
  assert.equal(d.editingPlanId, 'p1')
  assert.equal(d.editingPlanRevision, 1)
  assert.deepEqual(
    d.items.map((i) => [i.exerciseId, i.name, i.recordType, i.sets]),
    p.items.map((i) => [
      i.exerciseId,
      i.exerciseNameSnapshot,
      i.recordType,
      i.sets,
    ]),
  )
  assert.equal(new Set(d.items.map((i) => i.itemId)).size, 2)
  assert.equal(DM.validateDraft(d, KNOWN).ok, true)
  // 다시 계획으로 만들면 같은 구성이다(저장 절차의 "같은 구성" 판정).
  const items = W.planItemsFromDraft({ draft: d, knownExerciseIds: KNOWN })
  assert.deepEqual(items, p.items)
  // 사본이다: 초안을 고쳐도 계획의 세트가 바뀌지 않는다.
  d.items[0].sets[0].reps = 99
  assert.equal(p.items[0].sets[0].reps, 10)
})

// ── 내일 초안 분리(임시 저장) ──
function fakeStorage() {
  const map = new Map()
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  }
}

test('내일 초안은 오늘 초안과 다른 임시 저장 키를 쓰고 오늘 키는 기존 그대로다', () => {
  assert.equal(ST.workoutDraftKey('today'), ST.WORKOUT_DRAFT_KEY)
  assert.equal(ST.workoutDraftKey(), ST.WORKOUT_DRAFT_KEY)
  assert.notEqual(ST.workoutDraftKey('tomorrow'), ST.WORKOUT_DRAFT_KEY)
  assert.ok(ST.workoutDraftKey('tomorrow').startsWith(ST.WORKOUT_DRAFT_KEY))
})

test('오늘·내일 초안은 서로 덮어쓰지 않고 따로 복구·삭제된다(계정 정리 접두어 유지)', () => {
  const storage = fakeStorage()
  const today = draft('today', {
    items: [item('e3', '스쿼트', 'reps', [{ reps: 15 }])],
  })
  const tomorrow = draft('tomorrow')
  assert.equal(ST.saveWorkoutDraft('u1', today, storage), true)
  assert.equal(ST.saveWorkoutDraft('u1', tomorrow, storage), true)
  assert.equal(storage.map.size, 2)
  for (const key of storage.map.keys()) {
    assert.ok(key.startsWith('mealthroutine.'), key)
  }
  const readToday = ST.readWorkoutDraft('u1', storage, 'today')
  const readTomorrow = ST.readWorkoutDraft('u1', storage, 'tomorrow')
  assert.deepEqual(
    readToday.draft.items.map((i) => i.exerciseId),
    ['e3'],
  )
  assert.equal(readToday.draft.day, 'today')
  assert.deepEqual(
    readTomorrow.draft.items.map((i) => i.exerciseId),
    ['e1', 'e2'],
  )
  assert.equal(readTomorrow.draft.day, 'tomorrow')
  // 내일 초안을 비워도(빈 초안 저장) 오늘 초안은 남는다.
  ST.saveWorkoutDraft('u1', { ...tomorrow, items: [] }, storage)
  assert.equal(ST.readWorkoutDraft('u1', storage, 'tomorrow').draft, null)
  assert.equal(
    ST.readWorkoutDraft('u1', storage, 'today').draft.items.length,
    1,
  )
  ST.clearWorkoutDraft(storage, 'today')
  assert.equal(ST.readWorkoutDraft('u1', storage, 'today').draft, null)
})

test('내일 초안 읽기 검증: 날짜 구분이 다르면 손상, 고치는 계획의 id·revision은 함께 있어야 하고 내일 초안에만 있다', () => {
  const storage = fakeStorage()
  ST.saveWorkoutDraft('u1', draft('tomorrow'), storage)
  // 오늘 키에 내일 초안을 옮기거나 그 반대로 읽으면 손상이다.
  const raw = storage.map.get(ST.workoutDraftKey('tomorrow'))
  assert.equal(ST.parseStoredDraft(raw, 'u1', 'today').ok, false)
  assert.equal(ST.parseStoredDraft(raw, 'u1', 'tomorrow').ok, true)
  // 다른 계정의 지문이면 쓰지 않는다.
  assert.deepEqual(ST.parseStoredDraft(raw, 'u2', 'tomorrow'), {
    ok: false,
    reason: 'owner',
  })
  const edit = draft('tomorrow', {
    editingPlanId: 'p1',
    editingPlanRevision: 3,
  })
  ST.saveWorkoutDraft('u1', edit, storage)
  const back = ST.readWorkoutDraft('u1', storage, 'tomorrow').draft
  assert.equal(back.editingPlanId, 'p1')
  assert.equal(back.editingPlanRevision, 3)
  const tamper = (patch) =>
    ST.parseStoredDraft(
      JSON.stringify({
        wv: 1,
        owner: ST.ownerFingerprint('u1'),
        draft: { ...edit, ...patch },
      }),
      'u1',
      'tomorrow',
    ).ok
  assert.equal(tamper({}), true)
  assert.equal(tamper({ editingPlanRevision: undefined }), false)
  assert.equal(tamper({ editingPlanId: undefined }), false)
  assert.equal(tamper({ editingPlanRevision: 0 }), false)
  assert.equal(tamper({ editingPlanRevision: 1.5 }), false)
  assert.equal(tamper({ editingPlanId: '' }), false)
  // 오늘 초안에는 고치는 계획 정보가 있을 수 없다.
  const asToday = JSON.stringify({
    wv: 1,
    owner: ST.ownerFingerprint('u1'),
    draft: { ...edit, day: 'today' },
  })
  assert.equal(ST.parseStoredDraft(asToday, 'u1', 'today').ok, false)
})

test('초안 만들기: 날짜 구분을 줄 수 있고 기본은 오늘이다', () => {
  assert.equal(DM.createEmptyDraft().day, 'today')
  assert.equal(DM.createEmptyDraft(undefined, 'tomorrow').day, 'tomorrow')
  assert.equal(DM.createEmptyDraft(() => AT, 'tomorrow').updatedAt, AT)
})

// ── 저장 절차 ──
function repoFake(over = {}) {
  const calls = []
  return {
    calls,
    async listByDate(date) {
      calls.push(['list', date])
      if (over.listError) throw over.listError
      return { items: over.items ?? [], skippedCount: 0 }
    },
    async create(input) {
      calls.push(['create', input])
      if (over.createError) throw over.createError
      return { plan: plan({ requestId: input.requestId }), created: true }
    },
    async replace(id, input) {
      calls.push(['replace', id, input])
      if (over.replaceError) throw over.replaceError
      return { ...plan(), id, revision: input.expectedRevision + 1 }
    },
  }
}
const run = (repo, over = {}) =>
  S.saveWorkoutPlan(
    { planRepository: repo, now: () => NOW },
    {
      draft: draft(),
      knownExerciseIds: KNOWN,
      planDate: TOMORROW,
      confirmedReplacePlanId: null,
      ...over,
    },
  )
const storeError = (reason, code) => new ERR.WorkoutStoreError(reason, { code })

test('저장 절차: 계획이 없으면 w11p- 요청 ID로 새로 만든다(같은 날짜·초안 버전은 같은 ID)', async () => {
  const repo = repoFake()
  const out = await run(repo)
  assert.equal(out.kind, 'saved')
  assert.equal(out.replaced, false)
  assert.deepEqual(
    repo.calls.map((c) => c[0]),
    ['list', 'create'],
  )
  const id = repo.calls[1][1].requestId
  assert.match(id, /^w11p-20261119-[0-9A-Za-z]+$/)
  assert.equal(S.makePlanRequestId(TOMORROW, AT), id)
  assert.notEqual(S.makePlanRequestId(TOMORROW, '2026-11-18T04:00:00.000Z'), id)
  assert.notEqual(S.makePlanRequestId('2026-11-20', AT), id)
  assert.equal(S.makePlanRequestId(TOMORROW, '---'), null)
})

test('저장 절차: 초안이 올바르지 않거나 오늘 초안이면 저장소를 부르지 않는다', async () => {
  const repo = repoFake()
  const empty = await run(repo, { draft: draft('tomorrow', { items: [] }) })
  assert.equal(empty.kind, 'invalid')
  const asToday = await run(repo, { draft: draft('today') })
  assert.equal(asToday.kind, 'invalid')
  const unknown = await run(repo, { knownExerciseIds: new Set(['e1']) })
  assert.equal(unknown.kind, 'invalid')
  assert.equal(repo.calls.length, 0)
})

test('날짜 경계: 계획 날짜가 오늘이 되었으면 저장하지 않고 새 날짜(내일) 확인을 요청한다', async () => {
  const repo = repoFake()
  const out = await run(repo, { planDate: TODAY })
  assert.deepEqual(out, { kind: 'dateChanged', from: TODAY, to: TOMORROW })
  const past = await run(repo, { planDate: '2026-11-17' })
  assert.equal(past.kind, 'dateChanged')
  assert.equal(repo.calls.length, 0)
  // 확인한 새 날짜로는 저장된다.
  const confirmed = await run(repoFake(), { planDate: out.to })
  assert.equal(confirmed.kind, 'saved')
})

test('날짜 경계: 조회와 저장 사이에 자정이 지나면 저장하지 않는다', async () => {
  let n = 0
  const clock = () => (n++ < 1 ? NOW : new Date(2026, 10, 19, 0, 0, 5))
  const repo = repoFake()
  const out = await S.saveWorkoutPlan(
    { planRepository: repo, now: clock },
    {
      draft: draft(),
      knownExerciseIds: KNOWN,
      planDate: TOMORROW,
      confirmedReplacePlanId: null,
    },
  )
  assert.equal(out.kind, 'dateChanged')
  assert.deepEqual(
    repo.calls.map((c) => c[0]),
    ['list'],
  )
})

test('저장 절차: 같은 구성은 저장하지 않고, 다른 구성은 교체 확인을 거치며, 확인한 계획 id가 다르면 다시 묻는다', async () => {
  const existing = plan({
    draft: draft('tomorrow', {
      items: [item('e3', '스쿼트', 'reps', [{ reps: 15 }])],
    }),
  })
  const same = await run(repoFake({ items: [plan()] }))
  assert.equal(same.kind, 'alreadySaved')
  const ask = repoFake({ items: [existing] })
  const confirm = await run(ask)
  assert.equal(confirm.kind, 'replaceConfirm')
  assert.equal(confirm.existing.id, 'p1')
  assert.deepEqual(
    ask.calls.map((c) => c[0]),
    ['list'],
  )
  const wrong = await run(repoFake({ items: [existing] }), {
    confirmedReplacePlanId: 'other',
  })
  assert.equal(wrong.kind, 'replaceConfirm')
  const ok = repoFake({ items: [existing] })
  const replaced = await run(ok, { confirmedReplacePlanId: 'p1' })
  assert.equal(replaced.kind, 'saved')
  assert.equal(replaced.replaced, true)
  const call = ok.calls.find((c) => c[0] === 'replace')
  assert.equal(call[1], 'p1')
  assert.equal(call[2].expectedRevision, existing.revision)
})

test('계획 수정 저장: 고치는 중인 초안은 확인 없이 초안이 읽은 revision으로 교체하고, 어긋나면 revisionMismatch다', async () => {
  const existing = { ...plan(), revision: 4 }
  const editing = draft('tomorrow', {
    items: [item('e3', '스쿼트', 'reps', [{ reps: 15 }])],
    editingPlanId: 'p1',
    editingPlanRevision: 3,
  })
  const repo = repoFake({
    items: [existing],
    replaceError: storeError('conflict', 'revisionMismatch'),
  })
  const out = await run(repo, { draft: editing })
  assert.deepEqual(out, {
    kind: 'failed',
    stage: 'save',
    reason: 'revisionMismatch',
  })
  assert.equal(
    repo.calls.find((c) => c[0] === 'replace')[2].expectedRevision,
    3,
  )
  const good = repoFake({ items: [{ ...existing, revision: 3 }] })
  const saved = await run(good, { draft: editing })
  assert.equal(saved.kind, 'saved')
  assert.equal(saved.replaced, true)
  // 다른 계획을 고치던 초안은 "고치는 중"이 아니라 교체 확인을 거친다.
  const other = await run(repoFake({ items: [existing] }), {
    draft: { ...editing, editingPlanId: 'gone' },
  })
  assert.equal(other.kind, 'replaceConfirm')
})

test('저장소 오류 분류: 날짜·충돌·동시 저장·용량·차단을 구분하고 오류 내용은 담지 않는다', async () => {
  const cls = S.classifyPlanSaveFailure
  assert.equal(
    cls(storeError('validation', 'invalidPlanDate')),
    'planDatePassed',
  )
  assert.equal(cls(storeError('validation', 'invalidDraft')), 'invalidDraft')
  assert.equal(
    cls(storeError('conflict', 'requestConflict')),
    'requestConflict',
  )
  assert.equal(
    cls(storeError('conflict', 'revisionMismatch')),
    'revisionMismatch',
  )
  assert.equal(cls(storeError('conflict', 'planExists')), 'planExists')
  assert.equal(cls(storeError('conflict', 'uniqueConstraint')), 'planExists')
  assert.equal(cls(storeError('notFound')), 'revisionMismatch')
  assert.equal(cls(new ERR.WorkoutStoreError('quota')), 'quota')
  assert.equal(cls(new ERR.WorkoutStoreError('unavailable')), 'unavailable')
  assert.equal(cls(new ERR.WorkoutStoreError('blocked')), 'blocked')
  assert.equal(cls(new Error('x')), 'error')
  // 다른 탭이 같은 날짜에 먼저 저장했다: 저장 실패(planExists)로 알리고 초안은 그대로다.
  const out = await run(
    repoFake({ createError: storeError('conflict', 'planExists') }),
  )
  assert.deepEqual(out, { kind: 'failed', stage: 'save', reason: 'planExists' })
  const read = await run(
    repoFake({ listError: new ERR.WorkoutStoreError('error') }),
  )
  assert.deepEqual(read, { kind: 'failed', stage: 'read', reason: 'error' })
})

// ── 화면 ──
const ready = (plans, skippedCount = 0) => ({
  status: 'ready',
  plans,
  skippedCount,
})
const sectionProps = (state, over = {}) => ({
  state,
  today: TODAY,
  notice: null,
  editConfirmPlanId: null,
  deleteTargetId: null,
  deleting: false,
  deleteError: null,
  onRetry: noop,
  onEdit: noop,
  onConfirmEdit: noop,
  onCancelEdit: noop,
  onAskDelete: noop,
  onConfirmDelete: noop,
  onCancelDelete: noop,
  ...over,
})

test('W10 내일 계획: 운동 순서·기록 방식·세트 목표를 보이고 수정·삭제 버튼이 있다(준비 중 문구 없음)', () => {
  const out = html(createElement(Section, sectionProps(ready([plan()]))))
  assert.match(out, /<h2[^>]*>내일 계획<\/h2>/)
  assert.match(out, /운동 2개 · 총 3세트/)
  assert.equal((out.match(/data-plan-item/g) ?? []).length, 2)
  assert.ok(out.indexOf('푸시업') < out.indexOf('플랭크'))
  assert.match(out, /횟수형/)
  assert.match(out, /시간형/)
  assert.match(out, /계획 수정/)
  assert.match(out, /계획 삭제/)
  assert.match(out, /오늘의 운동과 완료 기록에는\s*반영되지 않아요/)
  assert.doesNotMatch(out, /준비 중/)
  assert.doesNotMatch(out, /아직 내일 계획이 없어요/)
})

test('W10 내일 계획: 계획이 없으면 빈 상태와 W02(day=tomorrow) 링크, 오류·불러오는 중·준비 중은 각각 안내한다', () => {
  const empty = html(createElement(Section, sectionProps(ready([]))))
  assert.match(empty, /아직 내일 계획이 없어요/)
  assert.match(empty, /내일 운동 계획 만들기/)
  assert.ok(hrefs(empty).includes('/records/exercise/compose?day=tomorrow'))
  assert.match(
    html(createElement(Section, sectionProps({ status: 'loading' }))),
    /불러오는 중/,
  )
  const off = html(
    createElement(Section, sectionProps({ status: 'unavailable' })),
  )
  assert.match(off, /준비 중이에요/)
  assert.ok(!hrefs(off).includes('/records/exercise/compose?day=tomorrow'))
  const err = html(createElement(Section, sectionProps({ status: 'error' })))
  assert.match(err, /role="alert"/)
  assert.match(err, /다시 시도/)
  assert.match(
    html(createElement(Section, sectionProps(ready([plan()], 2)))),
    /읽을 수 없는 계획 2개를 제외했어요/,
  )
})

test('W10 내일 계획: 계획 날짜가 오늘이 된 계획은 조회·삭제만 가능하고 자동으로 시작되지 않는다고 알린다', () => {
  const arrived = plan({ planDate: TODAY })
  const out = html(createElement(Section, sectionProps(ready([arrived]))))
  assert.match(out, /예정일이 된 계획/)
  assert.match(out, /자동으로 오늘의 운동이 되거나\s*시작되지 않아요/)
  assert.match(out, /계획 삭제/)
  assert.doesNotMatch(out, /계획 수정/)
  assert.doesNotMatch(out, /운동 시작|바로 시작/)
  // 내일 계획이 없으니 새 계획 만들기도 함께 보인다.
  assert.match(out, /내일 운동 계획 만들기/)
})

test('W10 내일 계획: 삭제와 수정 시작은 확인 패널을 거친다', () => {
  const p = plan()
  const del = html(
    createElement(
      Section,
      sectionProps(ready([p]), { deleteTargetId: p.id, deleteError: '실패' }),
    ),
  )
  assert.match(del, /aria-label="내일 운동 계획 삭제 확인"/)
  assert.match(del, /되돌릴 수 없어요/)
  assert.match(del, /삭제하기/)
  assert.match(del, /실패/)
  assert.doesNotMatch(del, /계획 수정/)
  const edit = html(
    createElement(
      Section,
      sectionProps(ready([p]), { editConfirmPlanId: p.id }),
    ),
  )
  assert.match(edit, /aria-label="내일 계획 수정 확인"/)
  assert.match(edit, /구성 중이던 내일 운동이 있어요/)
})

const nextProps = (plan, slot = { status: 'unavailable' }) => ({
  slot,
  onRetry: noop,
  ...(plan ? { plan } : {}),
})

test('W01 다음 운동 준비하기: 계획이 없으면 계획 만들기, 있으면 요약과 계획 보기(W10)이고 오늘 기록과 별개임을 알린다', () => {
  const none = html(
    createElement(
      Next,
      nextProps({ state: ready([]), today: TODAY, onRetry: noop }),
    ),
  )
  assert.match(none, /내일 운동 계획/)
  assert.match(none, /계획 만들기/)
  assert.match(none, /오늘 운동 기록과 별개로 저장돼요/)
  assert.ok(hrefs(none).includes('/records/exercise/compose?day=tomorrow'))
  assert.doesNotMatch(none, /내일 운동 계획<\/h3>[\s\S]{0,400}준비 중/)
  const has = html(
    createElement(
      Next,
      nextProps({ state: ready([plan()]), today: TODAY, onRetry: noop }),
    ),
  )
  assert.match(has, /운동 2개 · 총 3세트 \(오늘 운동 기록과 별개\)/)
  assert.match(has, /계획 보기/)
  assert.ok(hrefs(has).includes('/records/exercise/my'))
  assert.ok(!hrefs(has).includes('/records/exercise/compose?day=tomorrow'))
  // 주간 리포트는 그대로 준비 중이다.
  assert.match(has, /주간 리포트[\s\S]*?준비 중/)
})

test('W01 다음 운동 준비하기: 예정일이 된 계획 안내, 불러오는 중·오류, 계획 저장소가 없으면 기존 준비 중 항목 그대로다', () => {
  const arrived = html(
    createElement(
      Next,
      nextProps({
        state: ready([plan({ planDate: TODAY })]),
        today: TODAY,
        onRetry: noop,
      }),
    ),
  )
  assert.match(arrived, /예정일이 된 계획이 있어요\. 자동으로 시작되지 않아요/)
  assert.match(
    html(
      createElement(
        Next,
        nextProps({
          state: { status: 'loading' },
          today: TODAY,
          onRetry: noop,
        }),
      ),
    ),
    /불러오는 중이에요/,
  )
  const err = html(
    createElement(
      Next,
      nextProps({ state: { status: 'error' }, today: TODAY, onRetry: noop }),
    ),
  )
  assert.match(err, /내일 계획을 불러오지 못했어요/)
  assert.match(err, /다시 시도/)
  for (const off of [
    nextProps(undefined),
    nextProps({
      state: { status: 'unavailable' },
      today: TODAY,
      onRetry: noop,
    }),
  ]) {
    const out = html(createElement(Next, off))
    assert.match(out, /내일 운동 계획[\s\S]*?준비 중/)
    assert.ok(!hrefs(out).includes('/records/exercise/compose?day=tomorrow'))
  }
})

test('W11 요약: 내일 계획은 "내일 · 날짜"로 표시하고 오늘 목록의 "오늘" 표시는 그대로다', () => {
  const summary = {
    exerciseCount: 2,
    setCount: 3,
    recordTypes: ['time', 'reps'],
  }
  const tomorrow = html(
    createElement(Parts.ReviewSummary, {
      summary,
      date: TOMORROW,
      dayLabel: '내일',
    }),
  )
  assert.match(tomorrow, /내일 · 11월 19일/)
  assert.doesNotMatch(tomorrow, /오늘 ·/)
  const today = html(
    createElement(Parts.ReviewSummary, { summary, date: TODAY }),
  )
  assert.match(today, /오늘 · 11월 18일/)
})

// ── 분리 원칙(소스 수준) ──
test('분리: 계획 저장소는 운동 목록·세션·기록·루틴·식단 저장소를 참조하지 않고, 그쪽 저장소·집계는 계획을 참조하지 않는다', () => {
  const planRepo = code(
    '../src/exercise/local/indexedDbWorkoutPlanRepository.ts',
  )
  assert.match(planRepo, /STORE_WORKOUT_PLANS/)
  assert.doesNotMatch(
    planRepo,
    /STORE_LISTS|STORE_SESSIONS|STORE_RECORDS|STORE_ROUTINES|STORE_MEALS|STORE_MEAL_PLANS|workoutLists|workoutSessions|workoutRecords|workoutRoutines|mealRecords|mealPlans/,
  )
  const listRepo = code('../src/exercise/local/indexedDbWorkoutRepositories.ts')
  assert.doesNotMatch(listRepo, /STORE_WORKOUT_PLANS|workoutPlans|WorkoutPlan/)
  for (const file of [
    '../src/exercise/useTodayWorkoutList.ts',
    '../src/exercise/useCompletedRecords.ts',
    '../src/exercise/usePreviousLists.ts',
    '../src/exercise/useDashboardRecords.ts',
    '../src/exercise/useRecordsInRange.ts',
    '../src/exercise/exerciseStats.ts',
    '../src/exercise/dashboardRecords.ts',
    '../src/exercise/previousLists.ts',
    '../src/exercise/myExercise.ts',
    '../src/exercise/useWorkoutStart.ts',
    '../src/exercise/startWorkout.ts',
    '../src/exercise/useWorkoutSession.ts',
    '../src/exercise/workoutSessionController.ts',
    '../src/exercise/useRoutines.ts',
    '../src/exercise/workoutRoutineModel.ts',
    '../src/exercise/saveWorkoutList.ts',
    '../src/exercise/useWorkoutListSave.ts',
    '../src/exercise/workoutListView.ts',
    '../src/food/local/indexedDbMealRepository.ts',
    '../src/food/local/indexedDbMealPlanRepository.ts',
  ]) {
    assert.doesNotMatch(
      code(file),
      /workoutPlan|WorkoutPlan|useWorkoutPlans|STORE_WORKOUT_PLANS/,
      file,
    )
  }
  // 오늘 목록 모델은 내일 초안으로 목록을 만들지 않는다(day가 today가 아니면 null).
  assert.match(
    code('../src/exercise/workoutModel.ts'),
    /draft\.day !== 'today'/,
  )
  // 계획 모델은 자동 시작·완료·통계를 만드는 모듈을 참조하지 않는다.
  assert.doesNotMatch(
    code('../src/exercise/workoutPlanModel.ts'),
    /createWorkoutSession|startOrResume|WorkoutRecord|exerciseStats/,
  )
  assert.doesNotMatch(
    code('../src/exercise/saveWorkoutPlan.ts'),
    /startOrResume|createWorkoutSession|WorkoutRecord/,
  )
})

test('계획 소스는 운영 빌드에서도 로컬 저장소를 쓰고, DB v5 단계(현재 DB는 v6) 업그레이드는 저장소만 추가하며 날짜별 1개는 유일 인덱스가 보장한다', () => {
  assert.doesNotMatch(
    code('../src/exercise/workoutPlanSource.ts'),
    /import\.meta\.env\.DEV/,
  )
  const db = read('../src/exercise/local/exerciseDb.ts')
  assert.match(db, /EXERCISE_DB_VERSION = 6/)
  const v5 = db.slice(
    db.indexOf('if (oldVersion < 5)'),
    db.indexOf('if (oldVersion < 6)'),
  )
  assert.match(v5, /createObjectStore\(STORE_WORKOUT_PLANS/)
  assert.match(v5, /\['ownerId', 'planDate'\],\s*\{ unique: true \}/)
  assert.match(v5, /\['ownerId', 'requestId'\],\s*\{ unique: true \}/)
  assert.doesNotMatch(v5, /deleteObjectStore|deleteIndex|clear\(/)
  const repo = read('../src/exercise/local/indexedDbWorkoutPlanRepository.ts')
  assert.match(repo, /isWorkoutPlanDateOpen/)
  assert.match(repo, /invalidPlanDate/)
  assert.match(repo, /planExists/)
})

test('앱: 오늘·내일 초안을 서로 다른 두 Provider가 맡고 W02·W13·W11은 day 파라미터로 고른다', () => {
  const app = read('../src/App.tsx')
  assert.match(app, /<WorkoutDraftProvider>/)
  assert.match(app, /<WorkoutDraftProvider day="tomorrow">/)
  for (const file of [
    '../src/pages/ExerciseComposePage.tsx',
    '../src/pages/ExercisePickerPage.tsx',
  ]) {
    assert.match(read(file), /useDayWorkoutDraft\(day\)/, file)
    assert.match(read(file), /day=tomorrow/, file)
  }
  assert.match(
    read('../src/components/exercise/review/PlanReviewBody.tsx'),
    /useDayWorkoutDraft\('tomorrow'\)/,
  )
  assert.match(
    read('../src/pages/ExerciseReviewPage.tsx'),
    /params\.get\('day'\) === 'tomorrow'/,
  )
})
