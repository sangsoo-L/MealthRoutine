import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// S6: 기록 방식 5종 회귀·안정화(계약 일관성, 경계값, 과거 세션 안내, 입력 안내 문구). 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let RM
let Input
let P
let WR
let V
let M
let View
let Validation

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  RM = await server.ssrLoadModule('/src/exercise/recordMode.ts')
  Input = await server.ssrLoadModule('/src/exercise/setInput.ts')
  P = await server.ssrLoadModule('/src/exercise/workoutProgress.ts')
  WR = await server.ssrLoadModule('/src/exercise/workoutResult.ts')
  V = await server.ssrLoadModule('/src/exercise/workoutResultView.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  Validation = await server.ssrLoadModule(
    '/src/exercise/completedSetValidation.ts',
  )
  View = (
    await server.ssrLoadModule('/src/components/exercise/result/ResultView.tsx')
  ).default
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-16T03:00:00.000Z')
const plain = (value) => JSON.parse(JSON.stringify(value))

// ── 계약 ────────────────────────────────────────────────────
test('계약: 카탈로그 weight_reps → 저장 weight, 필수 실제값 표와 구성값 표가 일치한다', () => {
  assert.equal(RM.toStoredRecordType('weight_reps'), 'weight')
  for (const type of ['time', 'reps', 'time_reps', 'weight_time']) {
    assert.equal(RM.toStoredRecordType(type), type)
  }
  const field = {
    time: 'measuredMs',
    reps: 'actualReps',
    weight: 'actualWeightKg',
  }
  for (const type of Object.keys(RM.RECORD_COMPONENTS)) {
    const fromParts = Object.entries(RM.RECORD_COMPONENTS[type])
      .filter(([, on]) => on)
      .map(([part]) => field[part])
      .sort()
    assert.deepEqual(
      [...RM.REQUIRED_ACTUAL_FIELDS[type]].sort(),
      fromParts,
      type,
    )
  }
  // 문서의 필수값 표
  assert.deepEqual(plain(RM.REQUIRED_ACTUAL_FIELDS), {
    time: ['measuredMs'],
    reps: ['actualReps'],
    weight: ['actualWeightKg', 'actualReps'],
    time_reps: ['measuredMs', 'actualReps'],
    weight_time: ['actualWeightKg', 'measuredMs'],
  })
})

test('신규 완료 A안 경계값: 횟수 1·999 허용/0·1000 거부, 중량 0·999 허용/-0.1·999.1·1000·소수 둘째 거부, 시간 1ms·24시간 허용/0·24시간+1ms·소수 거부', () => {
  const ok = (type, set) =>
    Validation.validateNewCompletedSet(type, { completed: true, ...set }).ok
  assert.equal(ok('reps', { actualReps: 1 }), true)
  assert.equal(ok('reps', { actualReps: 999 }), true)
  assert.equal(ok('reps', { actualReps: 0 }), false)
  assert.equal(ok('reps', { actualReps: 1000 }), false)
  assert.equal(ok('reps', { actualReps: 1.5 }), false)
  assert.equal(ok('reps', { actualReps: Number.NaN }), false)
  assert.equal(ok('weight', { actualReps: 5, actualWeightKg: 0 }), true)
  assert.equal(ok('weight', { actualReps: 5, actualWeightKg: 999 }), true)
  assert.equal(ok('weight', { actualReps: 5, actualWeightKg: -0.1 }), false)
  assert.equal(ok('weight', { actualReps: 5, actualWeightKg: 999.1 }), false)
  assert.equal(ok('weight', { actualReps: 5, actualWeightKg: 1000 }), false)
  assert.equal(ok('weight', { actualReps: 5, actualWeightKg: 1.25 }), false)
  assert.equal(
    ok('weight', { actualReps: 5, actualWeightKg: Number.POSITIVE_INFINITY }),
    false,
  )
  assert.equal(ok('time', { measuredMs: 1 }), true)
  assert.equal(ok('time', { measuredMs: M.MAX_MEASURED_MS }), true)
  assert.equal(ok('time', { measuredMs: 0 }), false)
  assert.equal(ok('time', { measuredMs: M.MAX_MEASURED_MS + 1 }), false)
  assert.equal(ok('time', { measuredMs: 1.5 }), false)
  assert.equal(ok('time', { measuredMs: -1 }), false)
  // 방식에 없는 값은 저장되지 않는다
  assert.equal(ok('reps', { actualReps: 5, actualWeightKg: 5 }), false)
  assert.equal(
    ok('time_reps', { actualReps: 5, measuredMs: 5, actualWeightKg: 5 }),
    false,
  )
  assert.equal(
    ok('weight_time', { actualWeightKg: 5, measuredMs: 5, actualReps: 5 }),
    false,
  )
})

// ── 타이머 경계 ─────────────────────────────────────────────
function timerSession(type, timer) {
  const item = {
    time: {
      exerciseId: 'a',
      exerciseNameSnapshot: 'A',
      recordType: 'time',
      sets: [{ targetSeconds: 60 }],
    },
    time_reps: {
      exerciseId: 'a',
      exerciseNameSnapshot: 'A',
      recordType: 'time_reps',
      sets: [{ reps: 5, targetSeconds: 60 }],
    },
    weight_time: {
      exerciseId: 'a',
      exerciseNameSnapshot: 'A',
      recordType: 'weight_time',
      sets: [{ targetSeconds: 60, weightKg: 5 }],
    },
  }[type]
  const list = {
    id: 'l',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-16',
    catalogVersion: 'x',
    revision: 1,
    requestId: 'r',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [item],
  }
  return {
    ...M.createWorkoutSession({ id: 's', ownerId: 'u', list, now: T0 }),
    timer,
  }
}

test('타이머 경계: 시간 구성값이 있는 3종 모두 0ms 거부·1ms 허용·정확히 24시간 허용(확인 필요)·측정 전 거부', () => {
  for (const type of ['time', 'time_reps', 'weight_time']) {
    const running = { accumulatedMs: 0, runningSince: T0.toISOString() }
    // 0ms: 시작하자마자 완료
    const zero = P.completeSet(timerSession(type, running), T0)
    assert.equal(zero.ok, false, type)
    assert.deepEqual(
      plain(zero.issues),
      [{ field: 'measuredMs', reason: 'zero' }],
      type,
    )
    // 1ms
    const one = P.completeSet(
      timerSession(type, running),
      new Date(T0.getTime() + 1),
    )
    assert.equal(one.ok, true, type)
    assert.equal(one.measuredMs, 1, type)
    // 24시간: 목표의 5배를 넘으므로 확인 뒤 정확히 24시간으로 저장
    const day = { accumulatedMs: M.MAX_MEASURED_MS, runningSince: null }
    assert.equal(
      P.completeSet(timerSession(type, day), T0).reason,
      'needsOverrunConfirmation',
      type,
    )
    const confirmed = P.completeSet(timerSession(type, day), T0, {
      confirmOverrun: true,
    })
    assert.equal(confirmed.ok, true, type)
    assert.equal(confirmed.measuredMs, M.MAX_MEASURED_MS, type)
    // 측정 전(대기)
    const idle = P.completeSet(
      timerSession(type, { accumulatedMs: 0, runningSince: null }),
      T0,
    )
    assert.deepEqual(
      plain(idle.issues),
      [{ field: 'measuredMs', reason: 'missing' }],
      type,
    )
  }
})

test('타이머 복원: 복합 방식 타이머도 정지 상태로 복원되고 목표 시간이 실제 시간으로 대체되지 않는다', () => {
  const stored = {
    timer: { accumulatedMs: 3000, runningSince: T0.toISOString() },
    lastSavedAt: new Date(T0.getTime() + 2000).toISOString(),
  }
  const restored = P.restoreSessionTimer(stored)
  assert.deepEqual(plain(restored), { accumulatedMs: 5000, runningSince: null })
  const done = P.completeSet(
    timerSession('time_reps', restored),
    new Date(T0.getTime() + 999_999),
  )
  assert.equal(done.measuredMs, 5000) // 목표(60초)가 아니다
})

// ── 시간 입력 표(요구 예시) ────────────────────────────────
test('W15 시간 입력 예시표: 30·1:30·0:45·60 허용, 1:60·-5·abc·빈 값·0 거부', () => {
  const table = [
    ['30', 30_000],
    ['1:30', 90_000],
    ['0:45', 45_000],
    ['60', 60_000],
    ['1:60', null, 'format'],
    ['-5', null, 'format'],
    ['abc', null, 'format'],
    ['', null, 'empty'],
    ['0', null, 'range'],
    ['1.5', 1500],
    ['0.001', 1],
    ['86400', 86_400_000],
    ['86400.001', null, 'range'],
  ]
  for (const [raw, ms, reason] of table) {
    const r = Input.parseDurationInput(raw)
    if (ms === null) assert.deepEqual([r.ok, r.reason], [false, reason], raw)
    else assert.deepEqual([r.ok, r.value], [true, ms], raw)
  }
})

test('W15 시간 입력 안내: 모든 시간 오류 문구에 올바른 입력 예시가 있고 입력 실패 시 어떤 값도 확정되지 않는다', () => {
  for (const raw of ['', '0', 'abc', '1:60', '-5', '86401']) {
    const r = V.validateSetFields('time', {
      reps: '',
      weightKg: '',
      measuredMs: raw,
    })
    assert.equal(r.ok, false, raw)
    assert.match(r.errors.measuredMs, /예: ?55/, raw)
  }
})

// ── 과거 진행 중 세션 안내 ─────────────────────────────────
function legacySession() {
  const list = {
    id: 'l',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-16',
    catalogVersion: 'x',
    revision: 1,
    requestId: 'r',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [
      {
        exerciseId: 'a',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }],
      },
      {
        exerciseId: 'b',
        exerciseNameSnapshot: '덤벨 컬',
        recordType: 'weight',
        sets: [{ reps: 10, weightKg: 8 }, { reps: 10 }],
      },
      {
        exerciseId: 'c',
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        sets: [{ targetSeconds: 60 }],
      },
      {
        exerciseId: 'd',
        exerciseNameSnapshot: '점핑 잭',
        recordType: 'time_reps',
        sets: [{ reps: 20, targetSeconds: 30 }],
      },
      {
        exerciseId: 'e',
        exerciseNameSnapshot: '캐리',
        recordType: 'weight_time',
        sets: [{ targetSeconds: 20 }],
      },
    ],
  }
  const s0 = M.createWorkoutSession({ id: 's', ownerId: 'u', list, now: T0 })
  return {
    ...s0,
    performed: [
      [{ completed: true, actualReps: 10 }],
      [
        { completed: true, actualReps: 10, actualWeightKg: 8 },
        { completed: true, actualReps: 10 },
      ], // 2세트 중량 없음
      [{ completed: true }], // 미측정
      [{ completed: true, actualReps: 20 }], // 시간 없음
      [{ completed: true, measuredMs: 5000 }], // 중량 없음
    ],
  }
}

test('과거 세션: 값이 빠진 완료 세트의 운동 이름·세트 번호·누락 값을 모아 알린다(정상 세트는 제외)', () => {
  const s = legacySession()
  assert.deepEqual(
    plain(WR.listIncompleteRecordedSets(s.listSnapshot, s.performed)),
    [
      {
        itemIndex: 1,
        setIndex: 1,
        name: '덤벨 컬',
        setNumber: 2,
        fields: ['실제 중량'],
      },
      {
        itemIndex: 2,
        setIndex: 0,
        name: '플랭크',
        setNumber: 1,
        fields: ['측정 시간'],
      },
      {
        itemIndex: 3,
        setIndex: 0,
        name: '점핑 잭',
        setNumber: 1,
        fields: ['측정 시간'],
      },
      {
        itemIndex: 4,
        setIndex: 0,
        name: '캐리',
        setNumber: 1,
        fields: ['실제 중량'],
      },
    ],
  )
  // 미완료 세트·정상 세트는 비어 있다
  assert.deepEqual(WR.missingFieldsOf('weight', { completed: false }), [])
  assert.deepEqual(
    WR.missingFieldsOf('weight', {
      completed: true,
      actualReps: 5,
      actualWeightKg: 0,
    }),
    [],
  )
  assert.deepEqual(WR.missingFieldsOf('weight_time', { completed: true }), [
    '실제 중량',
    '측정 시간',
  ])
})

test('과거 세션: 읽기·복원은 계속 되고(검증 없음) 저장만 막힌다. 값을 입력하거나 완료를 해제하면 저장된다', () => {
  const s = legacySession()
  assert.notEqual(M.parseWorkoutSession(JSON.parse(JSON.stringify(s))), null)
  const draft = WR.createResultDraft(s).draft
  const blocked = WR.prepareResultSave(s, draft, T0)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.issues.length, 4)
  assert.ok(
    blocked.issues.every(
      (i) => i.reason === 'invalidValue' && i.itemIndex !== undefined,
    ),
  )
  let fixed = draft
  const apply = (e) => {
    const r = WR.applyResultEdit(s.listSnapshot, fixed, e)
    assert.equal(r.ok, true, JSON.stringify(r))
    fixed = r.draft
  }
  apply({ kind: 'weightKg', position: { itemIndex: 1, setIndex: 1 }, value: 6 })
  apply({
    kind: 'measuredMs',
    position: { itemIndex: 2, setIndex: 0 },
    value: 45,
  })
  apply({ kind: 'uncomplete', position: { itemIndex: 3, setIndex: 0 } })
  apply({
    kind: 'values',
    position: { itemIndex: 4, setIndex: 0 },
    weightKg: 0,
    measuredMs: '1:05',
  })
  const ok = WR.prepareResultSave(s, fixed, T0)
  assert.equal(ok.ok, true, JSON.stringify(ok))
  assert.deepEqual(plain(ok.input.performed[4][0]), {
    completed: true,
    actualWeightKg: 0,
    measuredMs: 65_000,
  })
  assert.deepEqual(plain(ok.input.performed[3][0]), { completed: false })
})

function render(snapshot) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(View, {
        snapshot,
        editor: null,
        panel: null,
        failureDismissed: false,
        actions: new Proxy({}, { get: () => () => {} }),
      }),
    ),
  )
}
function readySnapshot(s, over = {}) {
  const draft = WR.createResultDraft(s).draft
  const summary = WR.summarizeResult(s.listSnapshot, draft.performed)
  return {
    load: { status: 'ready' },
    sessionId: s.id,
    session: s,
    draft,
    summary,
    screenType: summary.screenType,
    hasChanges: false,
    editLocked: false,
    phase: 'idle',
    stage: null,
    progressSaved: false,
    retryable: false,
    failure: null,
    message: null,
    issues: [],
    conflict: null,
    block: null,
    record: null,
    alreadyCompleted: false,
    saved: false,
    canSubmit: true,
    ...over,
  }
}

test('W15 화면: 값이 빠진 세트가 있으면 안내 배너(운동 이름·세트 번호·누락 값)와 세트별 표시가 보이고 정상 세션에는 없다', () => {
  const html = render(readySnapshot(legacySession()))
  assert.match(
    html,
    /이전에 완료한 세트 중 실제 운동 기록이 빠진 항목이 있어요\. 해당 세트의 기록을 입력하거나 완료 상태를 해제한 후 저장해 주세요\./,
  )
  assert.match(html, /덤벨 컬 2세트: 실제 중량/)
  assert.match(html, /플랭크 1세트: 측정 시간/)
  assert.match(html, /점핑 잭 1세트: 측정 시간/)
  assert.match(html, /캐리 1세트: 실제 중량/)
  assert.equal((html.match(/실제 기록이 빠졌어요 \(/g) ?? []).length, 4)
  // 색상에만 의존하지 않는다(문구와 기호가 함께 있다)
  assert.match(html, /aria-hidden="true">⚠ <\/span>실제 기록이 빠졌어요/)
  // 정상 세션
  const normal = legacySession()
  normal.performed = [
    [{ completed: true, actualReps: 10 }],
    [
      { completed: true, actualReps: 10, actualWeightKg: 8 },
      { completed: true, actualReps: 10, actualWeightKg: 0 },
    ],
    [{ completed: true, measuredMs: 61_000 }],
    [{ completed: true, actualReps: 20, measuredMs: 31_000 }],
    [{ completed: true, actualWeightKg: 5, measuredMs: 21_000 }],
  ]
  const ok = render(readySnapshot(normal))
  assert.doesNotMatch(ok, /실제 운동 기록이 빠진 항목/)
  assert.doesNotMatch(ok, /실제 기록이 빠졌어요/)
})

test('W15 화면: 저장 시도로 막히면 같은 안내와 세트별 이유를 한 번 보여 준다(배너 중복 없음)', () => {
  const s = legacySession()
  const draft = WR.createResultDraft(s).draft
  const check = WR.prepareResultSave(s, draft, T0)
  const html = render(readySnapshot(s, { issues: check.issues }))
  assert.equal(
    (
      html.match(
        /이전에 완료한 세트 중 실제 운동 기록이 빠진 항목이 있어요/g,
      ) ?? []
    ).length,
    1,
  )
  assert.match(
    html,
    /덤벨 컬 2세트: 실제 중량을 입력해 주세요\. 0kg도 입력할 수 있어요\./,
  )
  assert.match(html, /플랭크 1세트: 측정 시간을 입력해 주세요\./)
})

test('과거 기록 읽기 화면은 안내 배너·경고를 만들지 않는다(조회만으로 새 필수값을 요구하지 않는다)', () => {
  const s = legacySession()
  const record = M.parseWorkoutRecord(
    JSON.parse(
      JSON.stringify(M.buildWorkoutRecord({ id: 'r', session: s, now: T0 })),
    ),
  )
  assert.notEqual(record, null)
  const cards = V.cardsFromRecord(record)
  assert.ok(
    cards.every((card) => card.sets.every((set) => set.missing.length === 0)),
  )
  const html = render({
    load: { status: 'completed' },
    sessionId: 's',
    session: null,
    draft: null,
    summary: null,
    screenType: null,
    hasChanges: false,
    editLocked: false,
    phase: 'idle',
    stage: null,
    progressSaved: false,
    retryable: false,
    failure: null,
    message: null,
    issues: [],
    conflict: null,
    block: null,
    record,
    alreadyCompleted: true,
    saved: false,
    canSubmit: false,
  })
  assert.doesNotMatch(html, /실제 기록이 빠졌어요|실제 운동 기록이 빠진 항목/)
  assert.match(html, /중량 미입력/)
  assert.match(html, /측정 기록 없음/)
})

// ── 접근성(마크업) ─────────────────────────────────────────
test('W15 편집 폼 마크업: 모든 입력에 label·단위 안내, 오류는 aria-invalid·aria-describedby·role=alert로 연결된다', () => {
  const s = legacySession()
  const html = render({
    ...readySnapshot(s),
  })
  assert.ok(html.length > 0)
  const source = readFileSync(
    new URL(
      '../src/components/exercise/result/ResultParts.tsx',
      import.meta.url,
    ),
    'utf8',
  )
  for (const id of ['result-reps-', 'result-weight-', 'result-measured-']) {
    assert.match(source, new RegExp(`htmlFor=\\{\`${id}\\$\\{key\\}\``))
    assert.match(source, new RegExp(`id=\\{\`${id}error-\\$\\{key\\}\``))
  }
  assert.match(source, /aria-invalid=\{measuredError \? true : undefined\}/)
  // 오류가 생기면 첫 오류 입력으로 포커스를 옮긴다
  assert.match(source, /document\.getElementById\(target\)\?\.focus\(\)/)
})

test('패널(W01·W14·W15): 닫힐 때 포커스가 문서 처음으로 빠지지 않도록 열기 전 버튼으로 되돌리는 코드가 있다', () => {
  for (const file of [
    '../src/components/exercise/session/SessionParts.tsx',
    '../src/components/exercise/result/ResultParts.tsx',
    '../src/components/exercise/dashboard/WorkoutStartParts.tsx',
  ]) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    assert.match(
      source,
      /triggerRef\.current \?\?= document\.activeElement/,
      file,
    )
    assert.match(source, /trigger\.focus\(\)/, file)
  }
})
