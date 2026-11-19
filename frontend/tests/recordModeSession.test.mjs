import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// S4: W14 운동 진행의 5가지 기록 방식 완료(A안) 검증. 화면 없이 순수 로직과 렌더링만 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let P
let M
let Mode
let View
let Validation
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  P = await server.ssrLoadModule('/src/exercise/workoutProgress.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  Mode = await server.ssrLoadModule('/src/exercise/recordMode.ts')
  Validation = await server.ssrLoadModule(
    '/src/exercise/completedSetValidation.ts',
  )
  View = (
    await server.ssrLoadModule(
      '/src/components/exercise/session/SessionView.tsx',
    )
  ).default
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-16T03:00:00.000Z')
const at = (seconds) => new Date(T0.getTime() + seconds * 1000)
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })
const IDLE = { accumulatedMs: 0, runningSince: null }
const running = (sinceSeconds = 0) => ({
  accumulatedMs: 0,
  runningSince: at(sinceSeconds).toISOString(),
})
const paused = (ms) => ({ accumulatedMs: ms, runningSince: null })

/** 0 reps, 1 weight(목표 중량 있음/없음), 2 time, 3 time_reps, 4 weight_time(목표 중량 있음/없음). */
function makeList() {
  return {
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-16',
    catalogVersion: 'dev-mock-1',
    revision: 1,
    requestId: 'r1',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [
      {
        exerciseId: 'e0',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }, { reps: 8 }],
      },
      {
        exerciseId: 'e1',
        exerciseNameSnapshot: '덤벨 컬',
        recordType: 'weight',
        sets: [{ reps: 10, weightKg: 8 }, { reps: 12 }],
      },
      {
        exerciseId: 'e2',
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        sets: [{ targetSeconds: 60 }, { targetSeconds: 60 }],
      },
      {
        exerciseId: 'e3',
        exerciseNameSnapshot: '점핑 잭',
        recordType: 'time_reps',
        sets: [
          { reps: 30, targetSeconds: 60 },
          { reps: 30, targetSeconds: 60 },
        ],
      },
      {
        exerciseId: 'e4',
        exerciseNameSnapshot: '파머스 워크',
        recordType: 'weight_time',
        sets: [{ targetSeconds: 45, weightKg: 20 }, { targetSeconds: 45 }],
      },
    ],
  }
}
const newSession = (over = {}) => ({
  ...M.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list: makeList(),
    now: T0,
  }),
  ...over,
})
const at_ = (itemIndex, setIndex = 0, timer = IDLE, over = {}) =>
  newSession({ cursor: pos(itemIndex, setIndex), timer, ...over })
const issuesOf = (result) => result.issues.map((i) => `${i.field}:${i.reason}`)

// ── 기존 3가지: A안 ─────────────────────────────────────────
test('횟수형: 목표 횟수가 초기값이라 입력 없이 완료되고, 직접 입력·0회·잘못된 값은 구분한다', () => {
  const auto = P.completeSet(at_(0), T0)
  assert.equal(auto.ok, true)
  assert.deepEqual(auto.input.performed[0][0], {
    completed: true,
    actualReps: 10,
  })
  assert.equal(auto.usedTargetValues, true)
  const typed = P.completeSet(at_(0), T0, { entry: { reps: '12' } })
  assert.equal(typed.input.performed[0][0].actualReps, 12)
  assert.equal(typed.usedTargetValues, false)
  assert.equal(
    P.completeSet(at_(0), T0, { entry: { reps: '0' } }).reason,
    'invalidReps',
  )
  assert.equal(
    P.completeSet(at_(0), T0, { entry: { reps: '' } }).reason,
    'invalidReps',
  )
})

test('중량형(weight_reps): 목표 중량이 있으면 초기값으로 완료, 없으면 실제 중량을 직접 입력해야 하고 0kg은 입력했을 때만 유효하다', () => {
  assert.deepEqual(P.completeSet(at_(1, 0), T0).input.performed[1][0], {
    completed: true,
    actualReps: 10,
    actualWeightKg: 8,
  })
  // 목표 중량 없음 + 입력 없음 → 완료 불가
  const none = P.completeSet(at_(1, 1), T0)
  assert.equal(none.ok, false)
  assert.equal(none.reason, 'invalidSet')
  assert.deepEqual(issuesOf(none), ['actualWeightKg:missing'])
  // 빈 문자열도 입력 없음
  assert.equal(
    P.completeSet(at_(1, 1), T0, { entry: { weightKg: '' } }).reason,
    'invalidSet',
  )
  // 0kg 직접 입력은 유효, 소수 첫째 자리까지
  const zero = P.completeSet(at_(1, 1), T0, { entry: { weightKg: '0' } })
  assert.equal(zero.input.performed[1][1].actualWeightKg, 0)
  assert.equal(
    P.completeSet(at_(1, 1), T0, { entry: { weightKg: '12.5' } }).ok,
    true,
  )
  assert.equal(
    P.completeSet(at_(1, 1), T0, { entry: { weightKg: '12.55' } }).reason,
    'invalidWeight',
  )
})

test('시간형: 타이머 측정값이 있어야 완료되고 목표 시간만으로는 완료되지 않는다', () => {
  const idle = P.completeSet(at_(2, 0), at(500))
  assert.equal(idle.ok, false)
  assert.equal(idle.reason, 'invalidSet')
  assert.deepEqual(issuesOf(idle), ['measuredMs:missing'])
  const measured = P.completeSet(at_(2, 0, running(0)), at(75))
  assert.equal(measured.ok, true)
  assert.deepEqual(measured.input.performed[2][0], {
    completed: true,
    measuredMs: 75_000,
  })
  assert.equal(measured.measuredMs, 75_000)
  assert.deepEqual(measured.input.timer, IDLE)
})

// ── 복합 방식 ───────────────────────────────────────────────
test('time_reps: 측정 시간과 실제 횟수가 모두 있어야 완료되고 목표 횟수는 초기값이다', () => {
  const done = P.completeSet(at_(3, 0, running(0)), at(42))
  assert.equal(done.ok, true)
  assert.deepEqual(done.input.performed[3][0], {
    completed: true,
    actualReps: 30,
    measuredMs: 42_000,
  })
  // 직접 입력한 횟수
  const typed = P.completeSet(at_(3, 0, running(0)), at(42), {
    entry: { reps: '28' },
  })
  assert.equal(typed.input.performed[3][0].actualReps, 28)
  // 시간 미측정 → 실패(횟수는 있어도)
  const noTime = P.completeSet(at_(3, 0), at(42))
  assert.equal(noTime.ok, false)
  assert.deepEqual(issuesOf(noTime), ['measuredMs:missing'])
  // 횟수 비움 → 실패(시간이 있어도)
  const noReps = P.completeSet(at_(3, 0, running(0)), at(42), {
    entry: { reps: '' },
  })
  assert.equal(noReps.reason, 'invalidReps')
  // 0회·0ms는 실패
  assert.equal(
    P.completeSet(at_(3, 0, running(0)), at(42), { entry: { reps: '0' } })
      .reason,
    'invalidReps',
  )
  const zeroMs = P.completeSet(at_(3, 0, running(0)), at(0))
  assert.deepEqual(issuesOf(zeroMs), ['measuredMs:zero'])
})

test('weight_time: 실제 중량과 측정 시간이 모두 있어야 완료되고 횟수는 저장하지 않는다', () => {
  // 목표 중량이 있으면 초기값
  const done = P.completeSet(at_(4, 0, running(0)), at(50))
  assert.equal(done.ok, true)
  assert.deepEqual(done.input.performed[4][0], {
    completed: true,
    actualWeightKg: 20,
    measuredMs: 50_000,
  })
  assert.equal('actualReps' in done.input.performed[4][0], false)
  // 목표 중량이 없고 입력이 없으면 실패, 시간만 있어도 실패
  const noWeight = P.completeSet(at_(4, 1, running(0)), at(50))
  assert.equal(noWeight.ok, false)
  assert.deepEqual(issuesOf(noWeight), ['actualWeightKg:missing'])
  // 0kg 직접 입력은 유효
  const zeroKg = P.completeSet(at_(4, 1, running(0)), at(50), {
    entry: { weightKg: '0' },
  })
  assert.equal(zeroKg.input.performed[4][1].actualWeightKg, 0)
  // 중량이 있어도 시간 미측정이면 실패
  const noTime = P.completeSet(at_(4, 0), at(50))
  assert.deepEqual(issuesOf(noTime), ['measuredMs:missing'])
  // 둘 다 없으면 두 항목이 함께 보고된다
  const both = P.completeSet(at_(4, 1), at(50))
  assert.deepEqual(issuesOf(both).sort(), [
    'actualWeightKg:missing',
    'measuredMs:missing',
  ])
})

test('방식에 없는 값은 저장하지 않는다: 횟수형에 중량, time_reps에 중량, weight_time에 횟수를 넘겨도 무시된다', () => {
  const reps = P.completeSet(at_(0), T0, {
    entry: { reps: '5', weightKg: '50' },
  })
  assert.equal('actualWeightKg' in reps.input.performed[0][0], false)
  const timeReps = P.completeSet(at_(3, 0, running(0)), at(30), {
    entry: { reps: '5', weightKg: '50' },
  })
  assert.equal('actualWeightKg' in timeReps.input.performed[3][0], false)
  const weightTime = P.completeSet(at_(4, 0, running(0)), at(30), {
    entry: { reps: '5', weightKg: '10' },
  })
  assert.equal('actualReps' in weightTime.input.performed[4][0], false)
  assert.equal(weightTime.input.performed[4][0].actualWeightKg, 10)
})

test('모든 방식의 성공 결과는 기존 진행 저장 검증을 통과하고 신규 완료 검증과 같은 판정이다', () => {
  const cases = [
    [at_(0), undefined],
    [at_(1, 0), undefined],
    [at_(2, 0, running(0)), undefined],
    [at_(3, 0, running(0)), undefined],
    [at_(4, 0, running(0)), undefined],
  ]
  for (const [session] of cases) {
    const r = P.completeSet(session, at(20))
    assert.equal(r.ok, true)
    assert.equal(M.validateProgressInput(r.input, session.listSnapshot), true)
    const item = session.listSnapshot.items[session.cursor.itemIndex]
    const set =
      r.input.performed[session.cursor.itemIndex][session.cursor.setIndex]
    assert.equal(
      Validation.validateNewCompletedSet(item.recordType, set).ok,
      true,
    )
  }
})

// ── 실패 시 상태 보존 ────────────────────────────────────────
test('완료가 막히면 세션·타이머·입력은 바뀌지 않고 기록도 만들어지지 않는다', () => {
  const session = at_(4, 1, paused(0))
  const before = JSON.stringify(session)
  const result = P.completeSet(session, at(10))
  assert.equal(result.ok, false)
  assert.equal(JSON.stringify(session), before)
  assert.equal('input' in result, false)
  // 같은 세션으로 다시 시도하면 입력을 보완해 완료할 수 있다
  const retry = P.completeSet(at_(4, 1, running(0)), at(10), {
    entry: { weightKg: '15' },
  })
  assert.equal(retry.ok, true)
})

// ── 타이머 엔진 ──────────────────────────────────────────────
test('타이머 시작·일시정지는 시간 구성값이 있는 방식(time·time_reps·weight_time)만 허용한다', () => {
  for (const [itemIndex, ok] of [
    [0, false],
    [1, false],
    [2, true],
    [3, true],
    [4, true],
  ]) {
    const start = P.buildTimerInput(at_(itemIndex), 'start', T0)
    assert.equal(start.ok, ok, `item ${itemIndex}`)
    if (!ok) assert.equal(start.reason, 'notTimeSet')
  }
  const started = P.buildTimerInput(at_(3), 'start', at(5))
  assert.deepEqual(started.input.timer, running(5))
  const pausedInput = P.buildTimerInput(at_(3, 0, running(5)), 'pause', at(25))
  assert.equal(pausedInput.ok, true)
  assert.deepEqual(pausedInput.input.timer, paused(20_000))
})

test('일시정지·재개 후에도 경과 시간이 누적되어 한 번 확정된다(time_reps·weight_time)', () => {
  for (const itemIndex of [3, 4]) {
    // 20초 측정 → 일시정지 → 재개 → 10초 더
    const resumed = {
      accumulatedMs: 20_000,
      runningSince: at(100).toISOString(),
    }
    const result = P.completeSet(at_(itemIndex, 0, resumed), at(110))
    assert.equal(result.measuredMs, 30_000, `item ${itemIndex}`)
    assert.equal(result.input.performed[itemIndex][0].measuredMs, 30_000)
    // 완료 뒤 타이머는 초기화되어 다음 세트로 이어지지 않는다
    assert.deepEqual(result.input.timer, IDLE)
  }
})

test('목표 시간 도달만으로 완료되지 않고, 5배 초과 확인과 24시간 상한은 복합 방식에도 적용된다', () => {
  const session = at_(3, 0, running(0))
  assert.equal(P.completeSet(session, at(300)).ok, true)
  const need = P.completeSet(session, at(301))
  assert.equal(need.reason, 'needsOverrunConfirmation')
  assert.equal(need.targetSeconds, 60)
  assert.equal(
    P.completeSet(session, at(301), { confirmOverrun: true }).ok,
    true,
  )
  const capped = P.completeSet(session, at(3 * 24 * 3600), {
    confirmOverrun: true,
  })
  assert.equal(capped.measuredMs, M.MAX_MEASURED_MS)
  assert.equal(
    M.validateProgressInput(capped.input, session.listSnapshot),
    true,
  )
})

test('복원: 측정 중이던 복합 방식 타이머는 저장 시각까지만 더한 정지 상태가 되어 시간이 부풀지 않는다', () => {
  const stored = {
    timer: { accumulatedMs: 2000, runningSince: at(0).toISOString() },
    lastSavedAt: at(10).toISOString(),
  }
  const restored = P.restoreSessionTimer(stored)
  assert.deepEqual(restored, paused(12_000))
  const restoredSession = at_(3, 0, restored)
  // 한참 뒤에 완료해도 저장 뒤의 꺼져 있던 시간은 더하지 않는다
  assert.equal(P.completeSet(restoredSession, at(99_999)).measuredMs, 12_000)
})

// ── 저장·복원·호환 ───────────────────────────────────────────
test('복합 세트의 완료 값은 기존 PerformedSet 필드만 쓰고 세션 저장 형식으로 왕복해도 같다', () => {
  let session = at_(3, 0, running(0))
  const r1 = P.completeSet(session, at(40), { entry: { reps: '27' } })
  session = {
    ...session,
    ...r1.input,
    revision: session.revision + 1,
  }
  session = { ...session, cursor: pos(4, 0), timer: running(100) }
  const r2 = P.completeSet(session, at(130), { entry: { weightKg: '22.5' } })
  const next = { ...session, ...r2.input }
  const parsed = M.parseWorkoutSession(JSON.parse(JSON.stringify(next)))
  assert.notEqual(parsed, null)
  assert.deepEqual(parsed.performed[3][0], {
    completed: true,
    actualReps: 27,
    measuredMs: 40_000,
  })
  assert.deepEqual(parsed.performed[4][0], {
    completed: true,
    actualWeightKg: 22.5,
    measuredMs: 30_000,
  })
  // 허용된 필드 외의 값이 없다
  for (const set of [parsed.performed[3][0], parsed.performed[4][0]]) {
    for (const key of Object.keys(set)) {
      assert.ok(
        ['completed', 'actualReps', 'actualWeightKg', 'measuredMs'].includes(
          key,
        ),
      )
    }
  }
})

test('옛 세션 호환: 중량·시간이 없는 완료 세트도 그대로 읽히고, 다른 세트를 완료해도 보존되며, 다시 검증하지 않는다', () => {
  const base = at_(1, 1)
  const performed = base.performed.map((sets) => sets.map((s) => ({ ...s })))
  performed[1][0] = { completed: true, actualReps: 10 } // 중량 없음(옛 기록)
  performed[2][0] = { completed: true } // 미측정(옛 기록)
  const legacy = { ...base, performed }
  assert.notEqual(
    M.parseWorkoutSession(JSON.parse(JSON.stringify(legacy))),
    null,
  )
  const r = P.completeSet(legacy, T0, { entry: { weightKg: '5' } })
  assert.equal(r.ok, true)
  assert.deepEqual(r.input.performed[1][0], { completed: true, actualReps: 10 })
  assert.deepEqual(r.input.performed[2][0], { completed: true })
  // 이미 완료한 옛 세트는 완료로 취급되어 다시 완료할 수 없다
  assert.equal(
    P.completeSet(legacy, T0, { position: pos(2, 0) }).reason,
    'alreadyCompleted',
  )
})

test('되돌린 뒤 다시 완료하면 A안이 적용된다(되돌리기 자체는 기록 값을 비운다)', () => {
  const first = P.completeSet(at_(4, 0, running(0)), at(50))
  const completed = { ...at_(4, 0), performed: first.input.performed }
  const undone = P.undoCompletedSet(completed, pos(4, 0))
  assert.equal(undone.ok, true)
  assert.deepEqual(undone.input.performed[4][0], { completed: false })
  const again = P.completeSet(
    { ...completed, performed: undone.input.performed, cursor: pos(4, 0) },
    at(60),
  )
  assert.equal(again.ok, false)
  assert.deepEqual(issuesOf(again), ['measuredMs:missing'])
})

// ── 안전장치(S3 유지) ───────────────────────────────────────
test('S5: 5종 모두 시작할 수 있고, 허용 목록 밖의 방식을 막는 안전장치(코드)는 남아 있다', async () => {
  assert.deepEqual([...Mode.RUNNABLE_RECORD_TYPES].sort(), [
    'reps',
    'time',
    'time_reps',
    'weight',
    'weight_time',
  ])
  assert.deepEqual(Mode.findUnrunnableItems(makeList().items), [])
  assert.equal(Mode.isRunnableRecordType('future_mode'), false)
  // 저장소 시작 경로의 보호 코드와 W01 차단 경로가 남아 있다
  const repo = readFileSync(
    new URL(
      '../src/exercise/local/indexedDbWorkoutRepositories.ts',
      import.meta.url,
    ),
    'utf8',
  )
  assert.match(repo, /findUnrunnableItems/)
  assert.match(repo, /unsupportedRecordType/)
  const view = readFileSync(
    new URL('../src/exercise/workoutListView.ts', import.meta.url),
    'utf8',
  )
  assert.match(view, /findUnrunnableItems/)
})

// ── 화면 렌더링 ─────────────────────────────────────────────
const snap = (s, over = {}) => ({
  load: { status: 'ready' },
  sessionId: s.id,
  session: s,
  revision: s.revision,
  save: {
    saving: false,
    dirty: false,
    failed: false,
    reason: null,
    fatal: false,
  },
  restorePending: false,
  timerBlocked: false,
  timerRunning: s.timer.runningSince !== null,
  pausedByHide: false,
  conflict: null,
  needsLeavePreparation: false,
  warnBeforeUnload: false,
  leave: { action: 'allow' },
  result: null,
  ...over,
})
const actions = new Proxy({}, { get: () => noop })
const render = (snapshot, props = {}) =>
  renderToStaticMarkup(
    createElement(View, {
      snapshot,
      mode: 'simple',
      levelFailed: false,
      now: T0,
      lastCompleted: null,
      panel: null,
      message: null,
      actions,
      ...props,
    }),
  )

test('화면 time_reps: 타이머와 실제 횟수 입력·세트 완료가 함께 보이고 방식 이름이 표시된다', () => {
  const html = render(snap(at_(3, 0)), { mode: 'detailed' })
  assert.match(html, /시간\+횟수형/)
  assert.match(html, /role="timer"/)
  assert.match(html, /목표 1분/)
  assert.match(html, /목표 30회/)
  assert.match(html, /실제 횟수/)
  assert.doesNotMatch(html, /실제 중량/)
  assert.match(html, /세트 완료/)
  assert.match(html, /타이머로 시간을 측정해야 세트를 완료할 수 있어요/)
  // 간단 모드: 목표 횟수가 초기값이라 입력칸은 접혀 있다
  const simple = render(snap(at_(3, 0)), { mode: 'simple' })
  assert.match(simple, /<summary[^>]*>실제 횟수 고치기/)
  assert.match(simple, /목표 횟수가 기록으로 저장돼요/)
})

test('화면 weight_time: 타이머와 실제 중량 입력이 보이고 횟수 입력은 없다. 목표 중량이 없으면 입력칸이 펼쳐져 있다', () => {
  const withTarget = render(snap(at_(4, 0)), { mode: 'detailed' })
  assert.match(withTarget, /중량\+시간형/)
  assert.match(withTarget, /role="timer"/)
  assert.match(withTarget, /실제 중량\(kg\)/)
  assert.match(withTarget, /value="20"/)
  assert.doesNotMatch(withTarget, /실제 횟수/)
  // 간단 모드 + 목표 중량 없음: 직접 입력해야 하므로 접히지 않는다
  const noTarget = render(snap(at_(4, 1)), { mode: 'simple' })
  assert.doesNotMatch(noTarget, /<summary/)
  assert.match(noTarget, /id="[^"]*-weight"[^>]*value=""/)
  // 간단 모드 + 목표 중량 있음: 목표가 초기값
  const simple = render(snap(at_(4, 0)), { mode: 'simple' })
  assert.match(simple, /<summary[^>]*>실제 값 고치기/)
  assert.match(simple, /목표 중량이 기록으로 저장돼요/)
})

test('화면 중량형: 간단 모드에서 목표 중량이 없으면 입력칸이 처음부터 펼쳐지고 빈 값이다(자동 0kg 없음)', () => {
  const html = render(snap(at_(1, 1)), { mode: 'simple' })
  assert.doesNotMatch(html, /<summary/)
  assert.match(html, /id="[^"]*-weight"[^>]*value=""/)
  assert.doesNotMatch(html, /value="0"/)
})

test('화면: 완료가 막힌 이유(completeError)가 알림으로 보인다', () => {
  const html = render(snap(at_(3, 0)), {
    completeError: '수행 시간을 측정해 주세요.',
  })
  assert.match(html, /role="alert"[^>]*>수행 시간을 측정해 주세요\./)
  const timeOnly = render(snap(at_(2, 0)), {
    completeError: '수행 시간을 측정해 주세요.',
  })
  assert.match(timeOnly, /role="alert"[^>]*>수행 시간을 측정해 주세요\./)
})

test('화면: 완료한 복합 세트는 읽기 전용으로 구성값 전체를 보여 주고, 옛 기록의 빠진 값은 미입력·미측정으로 알린다', () => {
  const s = at_(3, 0)
  const performed = s.performed.map((sets) => sets.map((x) => ({ ...x })))
  performed[3][0] = { completed: true, actualReps: 27, measuredMs: 40_000 }
  performed[4][0] = { completed: true }
  const timeReps = render(snap({ ...s, performed }))
  assert.match(timeReps, /1세트를 완료했어요/)
  assert.match(timeReps, /실제 27회 · 측정 0:40/)
  assert.doesNotMatch(timeReps, /role="timer"/)
  const legacy = render(snap({ ...s, performed, cursor: pos(4, 0) }))
  assert.match(legacy, /중량 미입력 · 측정 시간 없이 완료했어요\(미측정\)/)
  const weightTime = {
    ...s,
    cursor: pos(4, 0),
    performed: performed.map((sets, i) =>
      i === 4
        ? [{ completed: true, actualWeightKg: 0, measuredMs: 30_000 }, sets[1]]
        : sets,
    ),
  }
  assert.match(render(snap(weightTime)), /0kg · 측정 0:30/)
})

test('안내 문구: 신규 완료 검증의 문제를 사용자가 이해할 수 있는 글자로 바꾼다', () => {
  const text = Validation.describeCompletedSetIssues([
    { field: 'measuredMs', reason: 'missing' },
    { field: 'actualWeightKg', reason: 'missing' },
  ])
  assert.match(text, /수행 시간을 측정/)
  assert.match(text, /실제 중량을 입력/)
  assert.match(text, /0kg도 입력할 수 있어요/)
  assert.match(
    Validation.describeCompletedSetIssues([
      { field: 'measuredMs', reason: 'zero' },
    ]),
    /0초/,
  )
  // 같은 문구는 한 번만
  const once = Validation.describeCompletedSetIssues([
    { field: 'actualReps', reason: 'missing' },
    { field: 'actualReps', reason: 'missing' },
  ])
  assert.equal(once.match(/실제 횟수를 입력해 주세요/g).length, 1)
})
