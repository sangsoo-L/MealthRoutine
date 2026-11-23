import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// I02-1 2차(목록 등록) 테스트: 날짜 판단, 최신 데이터 조회·실패 보호, 추천 → 초안 변환, 등록 UI, 범위 준수. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Register
let ToDraft
let Select
let Evidence
let DraftModel
let Store
let ResultView
let exercises
let evidence

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
  Register = await server.ssrLoadModule('/src/ai/exercisePlanRegister.ts')
  ToDraft = await server.ssrLoadModule('/src/ai/exercisePlanToDraft.ts')
  Select = await server.ssrLoadModule('/src/ai/exercisePlanSelect.ts')
  Evidence = await server.ssrLoadModule('/src/ai/exercisePlanEvidence.ts')
  DraftModel = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  Store = await server.ssrLoadModule('/src/exercise/workoutRepositories.ts')
  const view = await server.ssrLoadModule(
    '/src/components/ai/exercise/ExercisePlanFlowView.tsx',
  )
  ResultView = view.ResultView
  const catalog = (
    await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  ).getSeedCatalog()
  evidence = Evidence.collectLevelEvidence(catalog)
  exercises = catalog.getAllExercises()
})
after(async () => {
  await server.close()
})

const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node))
const cond = (over = {}) => ({
  difficulty: '초급',
  parts: ['상체', '하체', '코어'],
  tools: ['맨몸'],
  minutes: 20,
  ...over,
})
const plan = (conditions, rotation = 0) =>
  Select.buildLocalPlan({ conditions, rotation, exercises, evidence })
const now = () => '2026-11-19T01:02:03.000Z'
const toDraft = (p, day = 'today') =>
  ToDraft.planToWorkoutDraft(p, { day, exercises, evidence, now })

// ── 날짜 판단 ─────────────────────────────────────────────────────────────────
const lookup = (over = {}) => ({
  today: '2026-11-19',
  tomorrow: '2026-11-20',
  todayListExists: false,
  todayPlanExists: false,
  tomorrowPlanExists: false,
  ...over,
})

test('날짜 판단: 오늘·내일 모두 없음 → 선택, 오늘만 있음 → 내일, 내일만 있음 → 오늘, 둘 다 있음 → 차단', () => {
  const d = (over) => Register.decideRegisterTarget(lookup(over)).kind
  assert.equal(d({}), 'choose')
  assert.equal(d({ todayListExists: true }), 'tomorrow')
  assert.equal(d({ tomorrowPlanExists: true }), 'today')
  assert.equal(
    d({ todayListExists: true, tomorrowPlanExists: true }),
    'blocked',
  )
})

test('날짜 판단: 계획 날짜가 오늘인 운동 계획도 오늘 목록과 같게 본다', () => {
  const d = (over) => Register.decideRegisterTarget(lookup(over)).kind
  assert.equal(d({ todayPlanExists: true }), 'tomorrow')
  assert.equal(
    d({ todayPlanExists: true, tomorrowPlanExists: true }),
    'blocked',
  )
  assert.equal(Register.todayOccupied(lookup({ todayPlanExists: true })), true)
  assert.equal(Register.todayOccupied(lookup()), false)
})

test('날짜 판단: 고른 날짜가 지금 판단으로 막혀 있으면 허용하지 않는다', () => {
  const allowed = Register.isTargetAllowed
  const choose = { kind: 'choose' }
  assert.equal(allowed(choose, 'today'), true)
  assert.equal(allowed(choose, 'tomorrow'), true)
  assert.equal(allowed({ kind: 'tomorrow' }, 'tomorrow'), true)
  assert.equal(allowed({ kind: 'tomorrow' }, 'today'), false)
  assert.equal(allowed({ kind: 'today' }, 'today'), true)
  assert.equal(allowed({ kind: 'today' }, 'tomorrow'), false)
  assert.equal(allowed({ kind: 'blocked' }, 'today'), false)
  assert.equal(allowed({ kind: 'blocked' }, 'tomorrow'), false)
})

// ── 최신 데이터 조회 ──────────────────────────────────────────────────────────
const found = (items = [], skippedCount = 0) =>
  Promise.resolve({ items, skippedCount })
function deps({ lists, today, tomorrow, clock, planDates } = {}) {
  const calls = { lists: [], plans: [] }
  let tick = 0
  return {
    calls,
    deps: {
      listRepository: {
        listByDate: (date) => {
          calls.lists.push(date)
          return lists ? lists(date) : found()
        },
      },
      planRepository: {
        listByDate: (date) => {
          calls.plans.push(date)
          if (planDates) return planDates(date)
          if (date === '2026-11-19' && today) return today()
          if (date === '2026-11-20' && tomorrow) return tomorrow()
          return found()
        },
      },
      now: clock ?? (() => new Date(2026, 10, 19, 10, 0, 0, tick++)),
    },
  }
}

test('조회: 오늘 목록·오늘 날짜 계획·내일 계획을 매번 저장소에서 새로 읽고 결과를 합친다', async () => {
  const w = deps({
    lists: () => found([{ id: 'l1', plannedDate: '2026-11-19' }]),
    tomorrow: () => found([{ id: 'p1' }]),
  })
  const result = await Register.lookupRegisterState(w.deps)
  assert.equal(result.ok, true)
  assert.deepEqual(result.lookup, {
    today: '2026-11-19',
    tomorrow: '2026-11-20',
    todayListExists: true,
    todayPlanExists: false,
    tomorrowPlanExists: true,
  })
  assert.deepEqual(w.calls.lists, ['2026-11-19'])
  assert.deepEqual(w.calls.plans.sort(), ['2026-11-19', '2026-11-20'])
  // 두 번 부르면 저장소를 두 번 읽는다(캐시 없음).
  await Register.lookupRegisterState(w.deps)
  assert.equal(w.calls.lists.length, 2)
})

test('조회: 월·연 경계에서도 내일 날짜를 정확히 조회한다', async () => {
  for (const [y, m, d, next] of [
    [2026, 10, 30, '2026-12-01'],
    [2026, 11, 31, '2027-01-01'],
    [2028, 1, 28, '2028-02-29'],
  ]) {
    const w = deps({ clock: () => new Date(y, m, d, 12) })
    const result = await Register.lookupRegisterState(w.deps)
    assert.equal(result.ok, true)
    assert.equal(result.lookup.tomorrow, next)
    assert.ok(w.calls.plans.includes(next))
  }
})

test('조회 실패는 비어 있다고 가정하지 않고 실패로 돌려준다(오류·읽을 수 없는 행·저장소 없음)', async () => {
  // 오류
  const err = deps({ lists: () => Promise.reject(new Error('boom')) })
  assert.deepEqual(await Register.lookupRegisterState(err.deps), {
    ok: false,
    reason: 'unreadable',
  })
  // 계획 조회 오류
  const planErr = deps({ tomorrow: () => Promise.reject(new Error('boom')) })
  assert.equal(
    (await Register.lookupRegisterState(planErr.deps)).reason,
    'unreadable',
  )
  // IndexedDB 사용 불가
  const unavailable = deps({
    lists: () => Promise.reject(new Store.WorkoutStoreError('unavailable')),
  })
  assert.equal(
    (await Register.lookupRegisterState(unavailable.deps)).reason,
    'unavailable',
  )
  // 읽을 수 없는 행만 있고 읽은 항목이 없으면 "없다"고 단정할 수 없다.
  const skipped = deps({ lists: () => found([], 2) })
  assert.equal(
    (await Register.lookupRegisterState(skipped.deps)).reason,
    'unreadable',
  )
  const skippedPlan = deps({ tomorrow: () => found([], 1) })
  assert.equal(
    (await Register.lookupRegisterState(skippedPlan.deps)).reason,
    'unreadable',
  )
  // 읽은 항목이 있으면(있다는 사실은 확실) 읽을 수 없는 행이 더 있어도 있는 것으로 본다.
  const mixed = deps({ lists: () => found([{ id: 'l1' }], 1) })
  const mixedResult = await Register.lookupRegisterState(mixed.deps)
  assert.equal(mixedResult.ok, true)
  assert.equal(mixedResult.lookup.todayListExists, true)
  // 저장소 없음(운영 빌드 등)
  const none = await Register.lookupRegisterState({
    listRepository: null,
    planRepository: null,
    now: () => new Date(),
  })
  assert.deepEqual(none, { ok: false, reason: 'unavailable' })
})

test('조회 중 자정을 넘기면 낡은 날짜의 결과라 dateChanged로 중단한다', async () => {
  const dates = [
    new Date(2026, 10, 19, 23, 59, 59),
    new Date(2026, 10, 20, 0, 0, 1),
  ]
  let i = 0
  const w = deps({ clock: () => dates[Math.min(i++, dates.length - 1)] })
  assert.deepEqual(await Register.lookupRegisterState(w.deps), {
    ok: false,
    reason: 'dateChanged',
  })
})

// ── 추천 → 초안 변환 ──────────────────────────────────────────────────────────
test('변환: 운동 id·이름·기록 방식·세트별 목표값이 추천(시드 근거) 그대로이고 중량은 만들지 않는다', () => {
  for (const day of ['today', 'tomorrow']) {
    const p = plan(cond({ minutes: 30 }))
    assert.equal(p.status, 'ok')
    const r = toDraft(p, day)
    assert.equal(r.ok, true)
    const { draft } = r
    assert.equal(draft.v, 1)
    assert.equal(draft.day, day)
    assert.equal(draft.updatedAt, now())
    assert.equal(draft.items.length, p.items.length)
    draft.items.forEach((row, i) => {
      const item = p.items[i]
      assert.equal(row.exerciseId, item.exerciseId)
      assert.equal(row.name, item.name)
      assert.equal(row.recordType, item.recordType)
      assert.equal(row.sets.length, item.sets)
      for (const set of row.sets) {
        if (item.recordType === 'time') {
          assert.deepEqual(set, { targetSeconds: item.seconds })
        } else {
          assert.deepEqual(set, { reps: item.reps })
        }
        assert.equal('weightKg' in set, false)
      }
    })
    // 항목 id는 모두 다르고 운동 id도 겹치지 않는다.
    assert.equal(
      new Set(draft.items.map((x) => x.itemId)).size,
      draft.items.length,
    )
    assert.equal(
      new Set(draft.items.map((x) => x.exerciseId)).size,
      draft.items.length,
    )
    // 기존 검증·정규화를 통과한다.
    assert.equal(
      DraftModel.validateDraft(draft, r.knownExerciseIds, r.allowedRecordTypes)
        .ok,
      true,
    )
    assert.ok(
      DraftModel.normalizeDraft(
        draft,
        r.knownExerciseIds,
        r.allowedRecordTypes,
      ),
    )
  }
})

test('변환: 중량 운동은 중량+횟수형으로 담기고 목표 중량은 비어 있다', () => {
  const p = plan(cond({ parts: ['상체'], tools: ['덤벨'], minutes: 20 }))
  assert.equal(p.status, 'ok')
  const r = toDraft(p)
  assert.equal(r.ok, true)
  const weighted = r.draft.items.filter((x) => x.recordType === 'weight')
  assert.ok(weighted.length > 0)
  for (const row of weighted) {
    for (const set of row.sets) {
      assert.equal(typeof set.reps, 'number')
      assert.equal(set.weightKg, undefined)
    }
  }
  assert.doesNotMatch(JSON.stringify(r.draft), /weightKg/)
})

test('변환: 운동량 근거가 없는 후보(excluded)는 초안에 들어가지 않는다', () => {
  const p = plan(cond({ minutes: 30 }))
  assert.ok(p.excluded.length > 0, '이 조건에는 근거 없는 후보가 있어야 한다')
  const ids = new Set(toDraft(p).draft.items.map((x) => x.exerciseId))
  for (const ex of p.excluded) assert.equal(ids.has(ex.exerciseId), false)
  // 근거 없는 후보를 항목에 끼워 넣은 결과는 거부한다(다시 계산한 추천과 달라진다).
  const ex = p.excluded[0]
  const tampered = {
    ...p,
    items: [
      ...p.items,
      {
        ...p.items[0],
        exerciseId: ex.exerciseId,
        name: ex.name,
        sets: 3,
        reps: 10,
      },
    ],
  }
  const r = toDraft(tampered)
  assert.equal(r.ok, false)
})

test('변환: 등록할 수 없는 추천·바뀐 추천·알 수 없는 운동·중복·잘못된 값·잘못된 날짜는 초안을 만들지 않는다', () => {
  const fail = (p, day = 'today') => {
    const r = toDraft(p, day)
    assert.equal(r.ok, false)
    return r.failure.code
  }
  const good = plan(cond())
  // 등록 불가 상태
  const none = plan(
    cond({ difficulty: '고급', parts: ['전신'], tools: ['덤벨'] }),
  )
  assert.notEqual(none.status, 'ok')
  assert.equal(fail(none), 'notRegistrable')
  assert.equal(fail({ ...good, items: [] }), 'notRegistrable')
  assert.equal(fail({ ...good, status: 'noPlannable' }), 'notRegistrable')
  // 날짜
  assert.equal(fail(good, 'yesterday'), 'invalidDay')
  // 알 수 없는 운동 id
  const unknown = {
    ...good,
    items: [{ ...good.items[0], exerciseId: 'nope' }, ...good.items.slice(1)],
  }
  assert.equal(fail(unknown), 'exerciseUnknown')
  // 중복
  const dup = { ...good, items: [good.items[0], good.items[0]] }
  assert.equal(fail(dup), 'exerciseDuplicate')
  // 값이 올바르지 않음(세트 0, 횟수 소수)
  const sets0 = {
    ...good,
    items: [{ ...good.items[0], sets: 0 }, ...good.items.slice(1)],
  }
  assert.equal(fail(sets0), 'valueInvalid')
  const timeItem = good.items.find((x) => x.recordType === 'time')
  const reps = good.items.find((x) => x.recordType !== 'time')
  assert.ok(timeItem && reps)
  const frac = {
    ...good,
    items: good.items.map((x) => (x === reps ? { ...x, reps: 8.5 } : x)),
  }
  assert.equal(fail(frac), 'valueInvalid')
  // 값이 바뀜(근거와 다른 횟수) → 다시 계산한 추천과 달라진다.
  const changed = {
    ...good,
    items: good.items.map((x) => (x === reps ? { ...x, reps: x.reps + 5 } : x)),
  }
  assert.equal(fail(changed), 'planMismatch')
  // 기록 방식이 허용 목록에 없음
  const wrongType = {
    ...good,
    items: good.items.map((x) =>
      x === timeItem ? { ...x, recordType: 'weight' } : x,
    ),
  }
  assert.equal(fail(wrongType), 'recordTypeMismatch')
})

test('변환: 같은 추천을 오늘·내일로 변환해도 초안의 운동·세트는 같고 day만 다르다', () => {
  const p = plan(cond({ minutes: 30 }))
  const strip = (d) => d.items.map((x) => ({ ...x, itemId: undefined }))
  const a = toDraft(p, 'today').draft
  const b = toDraft(p, 'tomorrow').draft
  assert.deepEqual(strip(a), strip(b))
  assert.equal(a.day, 'today')
  assert.equal(b.day, 'tomorrow')
})

test('변환: rotation을 바꾼 재추천 결과도 변환할 수 있다', () => {
  const p0 = plan(cond({ minutes: 30 }))
  const next = Select.nextRotation(
    { conditions: cond({ minutes: 30 }), exercises, evidence },
    p0,
  )
  if (next === null) return
  const p1 = plan(cond({ minutes: 30 }), next)
  assert.equal(toDraft(p1).ok, true)
})

test('변환 실패 문구: 모든 실패 코드에 사용자 안내 문구가 있다', () => {
  for (const code of [
    'notRegistrable',
    'invalidDay',
    'exerciseDuplicate',
    'exerciseUnknown',
    'recordTypeMismatch',
    'valueInvalid',
    'planMismatch',
    'draftInvalid',
  ]) {
    assert.match(ToDraft.describePlanDraftFailure(code), /[가-힣]/)
  }
})

// ── 등록 UI ───────────────────────────────────────────────────────────────────
const controller = (phase, over = {}) => ({
  phase,
  message: null,
  available: true,
  start: () => {},
  choose: () => {},
  confirmReplace: () => {},
  cancel: () => {},
  ...over,
})
const view = (register, p = plan(cond())) =>
  render(
    createElement(ResultView, {
      plan: p,
      notice: null,
      onReroll: () => {},
      onEdit: () => {},
      register,
    }),
  )

test('등록 UI: 등록 가능하면 "목록 등록"이 활성이고 휴식 미저장·중량 비어 있음을 안내한다', () => {
  const html = view(controller({ kind: 'idle' }))
  assert.match(html, /data-plan-register="idle"/)
  assert.doesNotMatch(html, /aria-disabled="true"[^>]*>목록 등록/)
  assert.match(html, /data-plan-register-button=""[^>]*>목록 등록/)
  assert.match(
    html,
    /세트 사이 휴식 시간은 운동 목록에 저장되지 않으니 참고만 해 주세요/,
  )
  assert.match(html, /중량은 비어 있어요/)
  assert.doesNotMatch(html, /다음 업데이트/)
})

test('등록 UI: 등록할 운동이 없거나 기능을 쓸 수 없으면 비활성이고 이유를 알린다', () => {
  const none = plan(
    cond({ difficulty: '고급', parts: ['전신'], tools: ['덤벨'] }),
  )
  const empty = view(controller({ kind: 'idle' }), none)
  assert.match(empty, /aria-disabled="true"[^>]*>목록 등록/)
  assert.match(empty, /등록할 수 없어요/)
  const off = view(controller({ kind: 'idle' }, { available: false }))
  assert.match(off, /aria-disabled="true"[^>]*>목록 등록/)
  assert.match(off, /이 환경에서는 운동 목록 등록을 쓸 수 없어요/)
})

test('등록 UI: 날짜 선택은 둘 다 비면 두 선택지, 한쪽만 비면 이유와 한 선택지를 보이고 목록 등록 버튼은 잠긴다', () => {
  const both = view(
    controller({
      kind: 'choose',
      options: ['today', 'tomorrow'],
      today: '2026-11-19',
      tomorrow: '2026-11-20',
      note: null,
    }),
  )
  assert.match(both, /data-plan-register-choose/)
  assert.match(both, /어느 날의 운동 목록으로 등록할까요\?/)
  assert.match(
    both,
    /data-register-day="today"[^>]*>오늘 운동 목록으로 등록 · 11월 19일/,
  )
  assert.match(
    both,
    /data-register-day="tomorrow"[^>]*>내일 운동 계획으로 등록 · 11월 20일/,
  )
  assert.match(both, /aria-disabled="true"[^>]*>목록 등록/)
  const only = view(
    controller({
      kind: 'choose',
      options: ['tomorrow'],
      today: '2026-11-19',
      tomorrow: '2026-11-20',
      note: Register.REGISTER_TEXT.todayOnlyNote,
    }),
  )
  assert.match(only, /오늘은 이미 운동 목록이 있어 내일 목록으로 등록해요/)
  assert.doesNotMatch(only, /data-register-day="today"/)
  assert.match(only, /data-register-day="tomorrow"/)
})

test('등록 UI: 구성 중이던 초안 교체 확인(저장 목록과 구분)·차단 안내·진행·오류 안내', () => {
  const confirm = view(controller({ kind: 'confirm', target: 'tomorrow' }))
  assert.match(confirm, /role="alertdialog"/)
  assert.match(confirm, /구성 중이던 내일 운동 계획이 있어요/)
  assert.match(confirm, /아직 저장하지 않고 편집 중인/)
  assert.match(confirm, /이미 저장해 둔 목록과 운동\s*기록은 그대로예요/)
  assert.match(
    confirm,
    /data-register-replace=""[^>]*>추천 운동으로 바꾸고 등록/,
  )
  assert.match(confirm, />취소</)
  const todayConfirm = view(controller({ kind: 'confirm', target: 'today' }))
  assert.match(todayConfirm, /구성 중이던 오늘 운동 목록이 있어요/)
  const blocked = view(controller({ kind: 'blocked' }))
  assert.match(blocked, /오늘과 내일 모두 운동 목록이 있어요/)
  assert.match(blocked, /이미 저장된 목록은 바꾸지 않아요/)
  assert.match(blocked, /href="\/records\/exercise"/)
  assert.match(
    view(controller({ kind: 'checking' })),
    /저장된 운동 목록을 확인하는 중이에요/,
  )
  assert.match(
    view(controller({ kind: 'moving' })),
    /운동 목록 편집 화면으로 이동하는 중이에요/,
  )
  const error = view(
    controller(
      { kind: 'idle' },
      { message: { tone: 'error', text: Register.REGISTER_TEXT.changed } },
    ),
  )
  assert.match(error, /role="alert"[^>]*>그사이 저장된 목록이 바뀌었어요/)
})

test('등록 UI: 화면 문구에 화면 코드(W02·W11)·가짜 AI 표현·kg 값이 없다', () => {
  for (const phase of [
    { kind: 'idle' },
    { kind: 'confirm', target: 'today' },
    { kind: 'blocked' },
  ]) {
    const html = view(controller(phase))
    assert.doesNotMatch(html, /W02|W11/)
    assert.doesNotMatch(html, /\d+\s*kg/i)
    assert.doesNotMatch(html, /AI가 분석|체험 횟수|남은 횟수|차감/)
  }
})

// ── 연결·범위 ─────────────────────────────────────────────────────────────────
test('연결: 등록 후 W02(오늘 /records/exercise/compose, 내일 ?day=tomorrow)로 이동하고 이 화면 경로를 이전으로 넘긴다', () => {
  const hook = read('../src/ai/useExercisePlanRegister.ts')
  assert.match(hook, /PATH_COMPOSE = '\/records\/exercise\/compose'/)
  assert.match(hook, /\?day=tomorrow/)
  assert.match(hook, /state: \{ from: PATH_PLAN \}/)
  assert.match(hook, /PATH_PLAN = '\/ai\/exercise\/plan'/)
  // 오늘은 오늘 초안, 내일은 내일 초안(기존 Provider)을 쓴다.
  assert.match(hook, /WorkoutDraftContext/)
  assert.match(hook, /TomorrowWorkoutDraftContext/)
  assert.match(
    hook,
    /requested === 'tomorrow'\s*\?\s*live\.current\.tomorrowDraft\s*:\s*live\.current\.todayDraft/,
  )
})

test('연결: 초안 교체 전에 구성 중인 초안(hasContent)을 확인하고, 확인 시점·교체 직전에 다시 조회·날짜 확인을 한다', () => {
  const hook = code('../src/ai/useExercisePlanRegister.ts')
  const lookup = hook.indexOf('lookupRegisterState({')
  const hasContent = hook.indexOf('drafts.hasContent && !confirmed')
  const dateCheck = hook.indexOf('toLocalDate(new Date()) !== lookup.today')
  const replace = hook.indexOf('drafts.replaceDraft(converted.draft)')
  assert.ok(lookup > 0 && lookup < hasContent)
  assert.ok(hasContent < dateCheck && dateCheck < replace)
  // 확인 버튼은 confirmed=true로 run을 다시 돌려 저장소를 다시 읽는다(낡은 판단으로 교체하지 않는다).
  assert.match(hook, /void run\(phase\.target, true\)/)
  // 고른 날짜가 막혔으면 등록하지 않는다.
  assert.match(hook, /!isTargetAllowed\(decision, requested\)/)
})

test('범위 준수: 등록 모듈은 목록·계획·세션·기록을 저장·수정·삭제하지 않고 저장소 직접 접근·네트워크가 없다', () => {
  for (const file of [
    '../src/ai/exercisePlanRegister.ts',
    '../src/ai/exercisePlanToDraft.ts',
    '../src/ai/useExercisePlanRegister.ts',
    '../src/components/ai/exercise/PlanRegisterPanel.tsx',
  ]) {
    assert.doesNotMatch(
      code(file),
      /indexedDB|localStorage|sessionStorage|fetch\(|\/api\/|saveWorkoutList|saveWorkoutPlan|saveFromDraft|\.create\(|\.replace\(|\.delete\(|startSession|completeSession|buildBeginnerPlan|recommend\/toDraft|trial|entitlement|payment|membership/i,
      file,
    )
  }
  // 조회만 한다(listByDate).
  assert.match(code('../src/ai/exercisePlanRegister.ts'), /listByDate/)
  // 초안 변환은 기존 검증·정규화를 쓴다.
  const conv = code('../src/ai/exercisePlanToDraft.ts')
  assert.match(conv, /validateDraft\(/)
  assert.match(conv, /normalizeDraft\(/)
  assert.doesNotMatch(conv, /weightKg\s*[:=]/)
  // DB 버전은 그대로다.
  assert.match(
    read('../src/exercise/local/exerciseDb.ts'),
    /EXERCISE_DB_VERSION = 6/,
  )
})
