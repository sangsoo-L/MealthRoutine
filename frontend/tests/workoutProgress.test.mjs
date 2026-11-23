import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// W14 진행 순수 로직 검증. 화면·저장소 없이 기존 모델 규칙(workoutModel)과 함께 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let P
let M
let goalPolicy

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  P = await server.ssrLoadModule('/src/exercise/workoutProgress.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  goalPolicy = await server.ssrLoadModule(
    '/src/exercise-goal/exerciseGoalPolicy.ts',
  )
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-13T03:00:00.000Z')
const at = (seconds) => new Date(T0.getTime() + seconds * 1000)

/** 횟수형 3세트, 중량형 2세트(두 번째는 목표 중량 없음), 시간형 2세트(60초). */
function makeList() {
  return {
    id: 'l1',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-13',
    catalogVersion: 'dev-mock-1',
    revision: 1,
    requestId: 'r1',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [
      {
        exerciseId: 'e1',
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }],
      },
      {
        exerciseId: 'e2',
        exerciseNameSnapshot: '덤벨 컬',
        recordType: 'weight',
        sets: [{ reps: 10, weightKg: 8 }, { reps: 12 }],
      },
      {
        exerciseId: 'e3',
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        sets: [{ targetSeconds: 60 }, { targetSeconds: 60 }],
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
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })
const withDone = (session, ...positions) => {
  const performed = session.performed.map((sets) =>
    sets.map((set) => ({ ...set })),
  )
  for (const [i, j] of positions) {
    const type = session.listSnapshot.items[i].recordType
    performed[i][j] =
      type === 'time'
        ? { completed: true }
        : { completed: true, actualReps: 10 }
  }
  return { ...session, performed }
}
const progressOf = (session) => ({
  cursor: session.cursor,
  performed: session.performed,
  timer: session.timer,
})

// ── 수준별 입력 방식 ────────────────────────────────────────────────
test('입력 방식: 초보·수준 미확인은 간단, 중급·고급은 상세이며 운동 목표 화면 규칙과 같다', () => {
  assert.equal(P.inputModeFor('beginner'), 'simple')
  assert.equal(P.inputModeFor(null), 'simple')
  assert.equal(P.inputModeFor(undefined), 'simple')
  assert.equal(P.inputModeFor('intermediate'), 'detailed')
  assert.equal(P.inputModeFor('advanced'), 'detailed')
  for (const level of ['beginner', 'intermediate', 'advanced', null]) {
    assert.equal(
      P.inputModeFor(level) === 'detailed',
      goalPolicy.exerciseGoalMode(level) === 'detailed',
    )
  }
})

// ── 입력 경계값 ─────────────────────────────────────────────────────
test('횟수 입력: 1~999 정수만 허용한다', () => {
  for (const ok of ['1', '999', ' 12 ', '007', 1, 999, 12]) {
    assert.equal(P.parseReps(ok).ok, true, String(ok))
  }
  assert.equal(P.parseReps('007').value, 7)
  const reason = (raw) => P.parseReps(raw).reason
  assert.equal(reason('0'), 'range')
  assert.equal(reason('1000'), 'range')
  assert.equal(reason(0), 'range')
  assert.equal(reason(1000), 'range')
  assert.equal(reason('99999999999999999999'), 'range')
  assert.equal(reason(''), 'empty')
  assert.equal(reason('   '), 'empty')
  assert.equal(reason(null), 'empty')
  assert.equal(reason(undefined), 'empty')
  for (const bad of [
    '-1',
    '1.5',
    '1e3',
    'abc',
    '१२',
    '+5',
    '1,000',
    12.5,
    NaN,
    Infinity,
  ]) {
    assert.equal(reason(bad), 'format', String(bad))
  }
})

test('중량 입력: 0~999kg, 소수점 첫째 자리까지, 비우면 미입력', () => {
  for (const [raw, value] of [
    ['0', 0],
    ['0.0', 0],
    ['12', 12],
    ['12.5', 12.5],
    ['999', 999],
    ['999.0', 999],
    [' 8 ', 8],
    [12.5, 12.5],
    [0, 0],
  ]) {
    const parsed = P.parseWeightKg(raw)
    assert.equal(parsed.ok, true, String(raw))
    assert.equal(parsed.value, value, String(raw))
  }
  for (const blank of ['', '  ', null, undefined]) {
    const parsed = P.parseWeightKg(blank)
    assert.deepEqual(parsed, { ok: true, value: undefined })
  }
  const reason = (raw) => P.parseWeightKg(raw).reason
  assert.equal(reason('999.1'), 'range')
  assert.equal(reason('1000'), 'range')
  assert.equal(reason(1000), 'range')
  assert.equal(reason(-1), 'range')
  assert.equal(reason('12.55'), 'decimals')
  assert.equal(reason('12.50'), 'decimals')
  assert.equal(reason(12.55), 'decimals')
  for (const bad of ['-1', '1,5', '.5', 'abc', '1e2', '12.', NaN, Infinity]) {
    assert.equal(reason(bad), 'format', String(bad))
  }
})

// ── 세트 완료: 횟수형·중량형 ────────────────────────────────────────
test('초보(간단) 입력: 입력 없이 완료하면 목표 횟수를 실제 값으로 저장하고 다음 세트로 간다', () => {
  const session = newSession()
  const result = P.completeSet(session, T0)
  assert.equal(result.ok, true)
  assert.equal(result.usedTargetValues, true)
  assert.deepEqual(result.input.performed[0][0], {
    completed: true,
    actualReps: 10,
  })
  assert.deepEqual(result.input.cursor, pos(0, 1))
  assert.deepEqual(result.next, pos(0, 1))
  assert.equal(result.allCompleted, false)
  assert.equal(result.input.expectedRevision, session.revision)
  assert.deepEqual(result.input.timer, { accumulatedMs: 0, runningSince: null })
  assert.equal(result.measuredMs, null)
})

test('초보 모드에서도 실제 횟수를 고쳐 완료할 수 있고 목표 값과 실제 값이 구분된다', () => {
  const session = newSession()
  const result = P.completeSet(session, T0, { entry: { reps: '12' } })
  assert.equal(result.ok, true)
  assert.equal(result.usedTargetValues, false)
  assert.equal(result.input.performed[0][0].actualReps, 12)
  // 목표는 스냅샷에 그대로 있다.
  assert.equal(session.listSnapshot.items[0].sets[0].reps, 10)
})

test('상세 입력: 잘못된 횟수는 완료를 막고 이유를 알린다', () => {
  const session = newSession()
  for (const [raw, detail] of [
    ['', 'empty'],
    [null, 'empty'],
    ['0', 'range'],
    ['1000', 'range'],
    ['1.5', 'format'],
    ['abc', 'format'],
  ]) {
    const result = P.completeSet(session, T0, { entry: { reps: raw } })
    assert.deepEqual(
      { ok: result.ok, reason: result.reason, detail: result.detail },
      { ok: false, reason: 'invalidReps', detail },
      String(raw),
    )
  }
})

test('완료는 세션을 바꾸지 않고 새 값을 돌려준다', () => {
  const session = newSession()
  const snapshot = JSON.stringify(session)
  P.completeSet(session, T0, { entry: { reps: '11' } })
  assert.equal(JSON.stringify(session), snapshot)
})

test('중량형: 중량 입력·목표 중량 기본값·비움(미입력)과 형식 오류', () => {
  const session = withDone(newSession(), [0, 0], [0, 1], [0, 2])
  const at1 = { ...session, cursor: pos(1, 0) }
  // 입력 없이: 목표 횟수와 목표 중량을 저장
  const auto = P.completeSet(at1, T0)
  assert.deepEqual(auto.input.performed[1][0], {
    completed: true,
    actualReps: 10,
    actualWeightKg: 8,
  })
  // 직접 입력
  const typed = P.completeSet(at1, T0, {
    entry: { reps: '9', weightKg: '10.5' },
  })
  assert.deepEqual(typed.input.performed[1][0], {
    completed: true,
    actualReps: 9,
    actualWeightKg: 10.5,
  })
  // A안: 중량을 비우면 완료하지 않는다(미입력 허용 없음)
  const blank = P.completeSet(at1, T0, { entry: { weightKg: '' } })
  assert.equal(blank.ok, false)
  assert.equal(blank.reason, 'invalidSet')
  assert.deepEqual(blank.issues, [
    { field: 'actualWeightKg', reason: 'missing' },
  ])
  // 목표 중량이 없는 세트는 입력 없이 완료할 수 없다(실제 중량을 직접 입력해야 한다)
  const noTargetAt = { ...at1, cursor: pos(1, 1) }
  const noTarget = P.completeSet(noTargetAt, T0)
  assert.equal(noTarget.ok, false)
  assert.equal(noTarget.reason, 'invalidSet')
  assert.deepEqual(noTarget.issues, [
    { field: 'actualWeightKg', reason: 'missing' },
  ])
  // 0kg는 직접 입력했을 때만 유효하다
  const zeroKg = P.completeSet(noTargetAt, T0, { entry: { weightKg: '0' } })
  assert.deepEqual(zeroKg.input.performed[1][1], {
    completed: true,
    actualReps: 12,
    actualWeightKg: 0,
  })
  const typedKg = P.completeSet(noTargetAt, T0, { entry: { weightKg: '20' } })
  assert.equal(typedKg.input.performed[1][1].actualWeightKg, 20)
  // 형식 오류
  const bad = P.completeSet(at1, T0, { entry: { weightKg: '12.55' } })
  assert.deepEqual(
    [bad.ok, bad.reason, bad.detail],
    [false, 'invalidWeight', 'decimals'],
  )
  assert.equal(
    P.completeSet(at1, T0, { entry: { weightKg: '1000' } }).detail,
    'range',
  )
})

test('횟수형에는 중량을 저장하지 않는다', () => {
  const result = P.completeSet(newSession(), T0, {
    entry: { reps: '10', weightKg: '50' },
  })
  assert.equal('actualWeightKg' in result.input.performed[0][0], false)
})

test('완료 입력은 항상 기존 모델의 진행 저장 검증을 통과한다', () => {
  const session = newSession()
  const results = [
    P.completeSet(session, T0),
    P.completeSet(session, T0, { entry: { reps: '999' } }),
    P.completeSet({ ...session, cursor: pos(1, 0) }, T0, {
      entry: { reps: '5', weightKg: '0' },
    }),
    P.completeSet(
      {
        ...session,
        cursor: pos(2, 0),
        timer: { accumulatedMs: 5000, runningSince: null },
      },
      T0,
    ),
  ]
  for (const r of results) {
    assert.equal(r.ok, true)
    assert.equal(M.validateProgressInput(r.input, session.listSnapshot), true)
  }
})

test('이미 완료한 세트·종료된 세션·잘못된 위치는 거부한다', () => {
  const done = withDone(newSession(), [0, 0])
  assert.equal(
    P.completeSet(done, T0, { position: pos(0, 0) }).reason,
    'alreadyCompleted',
  )
  assert.equal(
    P.completeSet(newSession({ status: 'completed' }), T0).reason,
    'sessionEnded',
  )
  assert.equal(
    P.completeSet(newSession({ status: 'interrupted' }), T0).reason,
    'sessionEnded',
  )
  assert.equal(
    P.completeSet(newSession(), T0, { position: pos(9, 0) }).reason,
    'invalidPosition',
  )
  assert.equal(
    P.completeSet(newSession(), T0, { position: pos(0, 9) }).reason,
    'invalidPosition',
  )
})

// ── 다음 세트·다음 운동·전체 완료 ───────────────────────────────────
test('운동의 마지막 세트를 완료하면 다음 운동의 첫 미완료 세트로 자동 전환한다', () => {
  const session = withDone(newSession(), [0, 0], [0, 1])
  const result = P.completeSet({ ...session, cursor: pos(0, 2) }, T0)
  assert.deepEqual(result.next, pos(1, 0))
  assert.deepEqual(result.input.cursor, pos(1, 0))
})

test('건너뛴 세트가 있으면 마지막 세트를 완료한 뒤 앞쪽 미완료 세트로 돌아가고, 없으면 끝난다', () => {
  // 첫 운동의 둘째 세트만 건너뜀
  let session = withDone(newSession(), [0, 0], [0, 2], [1, 0], [1, 1], [2, 0])
  // 시간형 세트는 타이머로 측정한 값이 있어야 완료된다
  const measured = { accumulatedMs: 5000, runningSince: null }
  const last = P.completeSet(
    { ...session, cursor: pos(2, 1), timer: measured },
    T0,
  )
  assert.equal(last.allCompleted, false)
  assert.deepEqual(last.next, pos(0, 1))
  // wrap을 끄면 앞쪽을 찾지 않는다
  const noWrap = P.completeSet(
    { ...session, cursor: pos(2, 1), timer: measured },
    T0,
    { wrap: false },
  )
  assert.equal(noWrap.next, null)
  // 모두 완료되면 커서는 방금 완료한 세트에 남는다
  session = withDone(
    newSession(),
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [2, 0],
  )
  const end = P.completeSet(
    { ...session, cursor: pos(2, 1), timer: measured },
    T0,
  )
  assert.equal(end.allCompleted, true)
  assert.equal(end.next, null)
  assert.deepEqual(end.input.cursor, pos(2, 1))
  assert.equal(P.allSetsCompleted(end.input.performed), true)
})

test('다음 미완료 세트·처음 미완료 세트 탐색', () => {
  const session = withDone(newSession(), [0, 0], [0, 1])
  assert.deepEqual(
    P.findNextIncomplete(session.performed, pos(0, 1)),
    pos(0, 2),
  )
  assert.deepEqual(P.firstIncomplete(session.performed), pos(0, 2))
  // 마지막 위치에서 wrap
  assert.deepEqual(
    P.findNextIncomplete(session.performed, pos(2, 1)),
    pos(0, 2),
  )
  assert.equal(P.findNextIncomplete(session.performed, pos(2, 1), false), null)
  // 모두 완료
  const all = withDone(
    newSession(),
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [2, 0],
    [2, 1],
  )
  assert.equal(P.firstIncomplete(all.performed), null)
  assert.equal(P.findNextIncomplete(all.performed, pos(0, 0)), null)
  assert.equal(P.allSetsCompleted([]), false)
})

test('진행률: 완료 세트 수·전체 세트 수·비율, 운동별 진행', () => {
  const session = withDone(newSession(), [0, 0], [0, 1], [2, 0])
  assert.deepEqual(P.progressOf(session.performed), {
    completedSets: 3,
    totalSets: 7,
    ratio: 3 / 7,
    percent: 43,
  })
  assert.deepEqual(P.itemProgress(session.performed, 0), {
    completedSets: 2,
    totalSets: 3,
  })
  assert.deepEqual(P.itemProgress(session.performed, 2), {
    completedSets: 1,
    totalSets: 2,
  })
  assert.equal(P.itemProgress(session.performed, 9), null)
  assert.deepEqual(P.progressOf([]), {
    completedSets: 0,
    totalSets: 0,
    ratio: 0,
    percent: 0,
  })
  assert.equal(P.countTotalSets(session.performed), 7)
})

test('이전·다음 운동 위치: 처음 미완료 세트, 모두 마쳤으면 첫 세트, 끝에서는 없음', () => {
  const session = withDone(newSession(), [1, 0])
  assert.deepEqual(
    P.adjacentExercise(session.performed, pos(0, 0), 'next'),
    pos(1, 1),
  )
  assert.deepEqual(
    P.adjacentExercise(session.performed, pos(2, 0), 'previous'),
    pos(1, 1),
  )
  const finished = withDone(newSession(), [1, 0], [1, 1])
  assert.deepEqual(
    P.adjacentExercise(finished.performed, pos(0, 0), 'next'),
    pos(1, 0),
  )
  assert.equal(
    P.adjacentExercise(session.performed, pos(0, 0), 'previous'),
    null,
  )
  assert.equal(P.adjacentExercise(session.performed, pos(2, 0), 'next'), null)
})

test('커서 이동: 완료 상태는 그대로, 타이머는 초기화되고 버려지면 알린다', () => {
  const session = newSession({
    cursor: pos(2, 0),
    timer: { accumulatedMs: 5000, runningSince: null },
  })
  const moved = P.moveCursor(session, pos(0, 0))
  assert.equal(moved.ok, true)
  assert.equal(moved.discardsTimer, true)
  assert.deepEqual(moved.input.timer, { accumulatedMs: 0, runningSince: null })
  assert.deepEqual(moved.input.performed, session.performed)
  assert.equal(moved.input.expectedRevision, session.revision)
  // 같은 위치는 그대로
  const same = P.moveCursor(session, pos(2, 0))
  assert.equal(same.discardsTimer, false)
  assert.deepEqual(same.input.timer, session.timer)
  // 타이머가 대기면 버릴 것이 없다
  assert.equal(P.moveCursor(newSession(), pos(1, 0)).discardsTimer, false)
  assert.equal(P.moveCursor(newSession(), pos(9, 0)).reason, 'invalidPosition')
  assert.equal(
    P.moveCursor(newSession({ status: 'cancelled' }), pos(0, 0)).reason,
    'sessionEnded',
  )
})

// ── 되돌리기 ────────────────────────────────────────────────────────
test('방금 완료한 세트 되돌리기: 완료·값을 지우고 커서를 그 세트로 옮기며 revision을 그대로 쓴다', () => {
  const session = newSession({ revision: 7 })
  const done = P.completeSet(session, T0, { entry: { reps: '12' } })
  const afterSave = {
    ...session,
    revision: 8,
    cursor: done.input.cursor,
    performed: done.input.performed,
    timer: done.input.timer,
  }
  const undo = P.undoCompletedSet(afterSave, done.completed)
  assert.equal(undo.ok, true)
  assert.deepEqual(undo.input.performed[0][0], { completed: false })
  assert.deepEqual(undo.input.cursor, pos(0, 0))
  // 저장소 전체 상태를 기반으로 하며, 충돌을 피하려고 revision을 올려 쓰지 않는다.
  assert.equal(undo.input.expectedRevision, 8)
  assert.deepEqual(undo.input.performed.slice(1), afterSave.performed.slice(1))
  assert.equal(
    M.validateProgressInput(undo.input, afterSave.listSnapshot),
    true,
  )
  // 다시 완료하면 처음과 같은 형태가 된다
  const again = P.completeSet(
    {
      ...afterSave,
      ...{ cursor: undo.input.cursor, performed: undo.input.performed },
    },
    T0,
    { entry: { reps: '12' } },
  )
  assert.deepEqual(again.input.performed, done.input.performed)
})

test('되돌리기는 시간형의 측정 값도 지우고, 다음 세트 타이머가 쓰이는 중이면 거부한다', () => {
  let session = newSession({
    cursor: pos(2, 0),
    timer: { accumulatedMs: 3000, runningSince: null },
  })
  const done = P.completeSet(session, T0)
  assert.equal(done.measuredMs, 3000)
  const stored = {
    ...session,
    cursor: done.input.cursor,
    performed: done.input.performed,
    timer: done.input.timer,
  }
  const undo = P.undoCompletedSet(stored, pos(2, 0))
  assert.deepEqual(undo.input.performed[2][0], { completed: false })
  // 다음 세트의 타이머를 이미 시작한 뒤
  const running = {
    ...stored,
    timer: { accumulatedMs: 0, runningSince: T0.toISOString() },
  }
  assert.equal(P.undoCompletedSet(running, pos(2, 0)).reason, 'timerInUse')
  const paused = {
    ...stored,
    timer: { accumulatedMs: 1000, runningSince: null },
  }
  assert.equal(P.undoCompletedSet(paused, pos(2, 0)).reason, 'timerInUse')
})

test('되돌리기 거부: 완료하지 않은 세트·잘못된 위치·종료된 세션', () => {
  const session = withDone(newSession(), [0, 0])
  assert.equal(P.undoCompletedSet(session, pos(0, 1)).reason, 'notCompleted')
  assert.equal(P.undoCompletedSet(session, pos(5, 0)).reason, 'invalidPosition')
  assert.equal(
    P.undoCompletedSet({ ...session, status: 'completed' }, pos(0, 0)).reason,
    'sessionEnded',
  )
})

// ── 시간형 타이머 ───────────────────────────────────────────────────
const timeSession = (timer, over = {}) =>
  newSession({ cursor: pos(2, 0), timer, ...over })

test('타이머 시작·일시정지·재개는 진행 저장 입력으로 만들고 현재 세트가 시간형일 때만 시작한다', () => {
  const session = timeSession({ accumulatedMs: 0, runningSince: null })
  const started = P.buildTimerInput(session, 'start', at(0))
  assert.equal(started.ok, true)
  assert.deepEqual(started.input.timer, {
    accumulatedMs: 0,
    runningSince: at(0).toISOString(),
  })
  assert.equal(started.input.expectedRevision, session.revision)
  assert.deepEqual(started.input.performed, session.performed)
  // 10초 뒤 일시정지 → 누적
  const running = { ...session, timer: started.input.timer }
  const paused = P.buildTimerInput(running, 'pause', at(10))
  assert.deepEqual(paused.input.timer, {
    accumulatedMs: 10_000,
    runningSince: null,
  })
  // 재개 뒤 5초 더 → 일시정지 시간(5초)은 빠진다
  const resumed = P.buildTimerInput(
    { ...running, timer: paused.input.timer },
    'start',
    at(15),
  )
  assert.deepEqual(resumed.input.timer, {
    accumulatedMs: 10_000,
    runningSince: at(15).toISOString(),
  })
  const second = P.buildTimerInput(
    { ...running, timer: resumed.input.timer },
    'pause',
    at(20),
  )
  assert.deepEqual(second.input.timer, {
    accumulatedMs: 15_000,
    runningSince: null,
  })
  // 멱등
  const again = P.buildTimerInput(
    { ...running, timer: started.input.timer },
    'start',
    at(5),
  )
  assert.deepEqual(again.input.timer, started.input.timer)
  // 모델 검증 통과
  assert.equal(
    M.validateProgressInput(started.input, session.listSnapshot),
    true,
  )
})

test('타이머 시작 거부: 시간형이 아님·이미 완료한 세트·종료된 세션', () => {
  assert.equal(
    P.buildTimerInput(newSession(), 'start', T0).reason,
    'notTimeSet',
  )
  const done = withDone(
    timeSession({ accumulatedMs: 0, runningSince: null }),
    [2, 0],
  )
  assert.equal(P.buildTimerInput(done, 'start', T0).reason, 'setCompleted')
  assert.equal(
    P.buildTimerInput(
      timeSession(
        { accumulatedMs: 0, runningSince: null },
        { status: 'completed' },
      ),
      'start',
      T0,
    ).reason,
    'sessionEnded',
  )
})

test('타이머 화면 값: 상태·남은 시간·목표 도달·초과·원형 비율', () => {
  const idle = P.timerView({ accumulatedMs: 0, runningSince: null }, 60, at(0))
  assert.equal(idle.state, 'idle')
  assert.equal(idle.remainingMs, 60_000)
  assert.equal(idle.reachedTarget, false)
  assert.equal(idle.fraction, 0)
  const running = P.timerView(
    { accumulatedMs: 0, runningSince: at(0).toISOString() },
    60,
    at(45),
  )
  assert.equal(running.state, 'running')
  assert.equal(running.elapsedMs, 45_000)
  assert.equal(running.remainingMs, 15_000)
  assert.equal(running.fraction, 0.75)
  const paused = P.timerView(
    { accumulatedMs: 20_000, runningSince: null },
    60,
    at(999),
  )
  assert.equal(paused.state, 'paused')
  assert.equal(paused.elapsedMs, 20_000)
  const reached = P.timerView(
    { accumulatedMs: 0, runningSince: at(0).toISOString() },
    60,
    at(60),
  )
  assert.equal(reached.reachedTarget, true)
  assert.equal(reached.overrunMs, 0)
  const over = P.timerView(
    { accumulatedMs: 0, runningSince: at(0).toISOString() },
    60,
    at(72),
  )
  assert.equal(over.reachedTarget, true)
  assert.equal(over.overrunMs, 12_000)
  assert.equal(over.fraction, 1)
  assert.equal(over.needsOverrunConfirmation, false)
})

test('타이머 표시 문구: 남은 시간은 올림, 목표 도달 0:00, 초과는 +m:ss', () => {
  const label = (elapsedSec) =>
    P.timerLabel(
      P.timerView(
        { accumulatedMs: elapsedSec * 1000, runningSince: null },
        60,
        at(0),
      ),
    )
  assert.deepEqual(label(0), { text: '1:00', overrun: false })
  assert.deepEqual(
    P.timerLabel(
      P.timerView({ accumulatedMs: 59_500, runningSince: null }, 60, at(0)),
    ),
    { text: '0:01', overrun: false },
  )
  assert.deepEqual(label(60), { text: '0:00', overrun: false })
  assert.deepEqual(label(72), { text: '+0:12', overrun: true })
  assert.deepEqual(label(135), { text: '+1:15', overrun: true })
})

test('목표 도달해도 자동 완료하지 않고 실제 경과 시간이 한 번 확정된다', () => {
  const session = timeSession({
    accumulatedMs: 0,
    runningSince: at(0).toISOString(),
  })
  const result = P.completeSet(session, at(75))
  assert.equal(result.ok, true)
  assert.equal(result.measuredMs, 75_000)
  assert.deepEqual(result.input.performed[2][0], {
    completed: true,
    measuredMs: 75_000,
  })
  assert.deepEqual(result.input.timer, { accumulatedMs: 0, runningSince: null })
  assert.deepEqual(result.next, pos(2, 1))
  // 같은 입력을 다시 보내도 값이 변하지 않는다(재시도에서 다시 계산하지 않는다)
  assert.equal(result.input.performed[2][0].measuredMs, 75_000)
})

test('A안: 타이머를 쓰지 않은 시간형 세트는 완료하지 않는다(목표 시간만으로 완료 불가, 세션은 그대로)', () => {
  const session = timeSession({ accumulatedMs: 0, runningSince: null })
  const before = JSON.stringify(session)
  const result = P.completeSet(session, at(30))
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'invalidSet')
  assert.deepEqual(result.issues, [{ field: 'measuredMs', reason: 'missing' }])
  assert.equal(JSON.stringify(session), before)
})

test('측정 시간이 목표의 5배를 넘으면 확인이 필요하고 정확히 5배는 넘지 않은 것이다', () => {
  assert.equal(P.isOverrunBeyondConfirm(60, 300_000), false)
  assert.equal(P.isOverrunBeyondConfirm(60, 300_001), true)
  const session = timeSession({
    accumulatedMs: 0,
    runningSince: at(0).toISOString(),
  })
  assert.equal(P.completeSet(session, at(300)).ok, true)
  const need = P.completeSet(session, at(301))
  assert.equal(need.ok, false)
  assert.equal(need.reason, 'needsOverrunConfirmation')
  assert.equal(need.measuredMs, 301_000)
  assert.equal(need.targetSeconds, 60)
  assert.equal(
    P.timerView(session.timer, 60, at(301)).needsOverrunConfirmation,
    true,
  )
  // 확인하면 완료한다
  const confirmed = P.completeSet(session, at(301), { confirmOverrun: true })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.measuredMs, 301_000)
})

test('시간 상한(24시간)과 시계 역행: 과다 기록·음수 시간이 생기지 않는다', () => {
  // 하루 이상 지난 측정 중 타이머는 24시간으로 제한된다
  const long = timeSession({
    accumulatedMs: 0,
    runningSince: at(0).toISOString(),
  })
  const capped = P.completeSet(long, at(3 * 24 * 3600), {
    confirmOverrun: true,
  })
  assert.equal(capped.ok, true)
  assert.equal(capped.measuredMs, M.MAX_MEASURED_MS)
  assert.equal(M.validateProgressInput(capped.input, long.listSnapshot), true)
  // 기준 시각이 측정 시작보다 이르면(시계 역행) 누적만 인정하고 음수가 되지 않는다
  const back = timeSession({
    accumulatedMs: 4000,
    runningSince: at(100).toISOString(),
  })
  const view = P.timerView(back.timer, 60, at(10))
  assert.equal(view.elapsedMs, 4000)
  assert.equal(P.completeSet(back, at(10)).measuredMs, 4000)
  const backFromZero = timeSession({
    accumulatedMs: 0,
    runningSince: at(100).toISOString(),
  })
  // 0ms는 "측정했지만 0"이라 미측정과 구분되지만 A안에서는 완료할 수 없다
  const zero = P.completeSet(backFromZero, at(10))
  assert.equal(zero.ok, false)
  assert.equal(zero.reason, 'invalidSet')
  assert.deepEqual(zero.issues, [{ field: 'measuredMs', reason: 'zero' }])
})

test('현재 세트가 아닌 시간형 세트를 완료할 때는 타이머를 쓰지 않는다(그 세트에는 측정값이 없어 완료되지 않는다)', () => {
  const session = timeSession({ accumulatedMs: 9000, runningSince: null })
  const other = P.completeSet(session, T0, { position: pos(2, 1) })
  assert.equal(other.ok, false)
  assert.equal(other.reason, 'invalidSet')
  assert.deepEqual(other.issues, [{ field: 'measuredMs', reason: 'missing' }])
})

// ── 타이머 복원 ─────────────────────────────────────────────────────
test('복원: 측정 중이던 타이머는 마지막 저장 시각까지만 더하고 정지 상태가 된다', () => {
  const stored = {
    timer: { accumulatedMs: 2000, runningSince: at(0).toISOString() },
    lastSavedAt: at(10).toISOString(),
  }
  const restored = P.restoreSessionTimer(stored)
  assert.deepEqual(restored, { accumulatedMs: 12_000, runningSince: null })
  // 복원된 타이머는 시간이 지나도 늘지 않는다(저장 뒤의 꺼져 있던 시간은 더하지 않음)
  assert.equal(P.timerView(restored, 60, at(9999)).elapsedMs, 12_000)
  assert.equal(P.timerView(restored, 60, at(9999)).state, 'paused')
  // 복원하지 않고 그대로 쓰면 과다 기록이 된다(복원이 필요한 이유)
  assert.equal(P.timerView(stored.timer, 60, at(9999)).elapsedMs > 12_000, true)
})

test('복원: 일시정지·대기 타이머는 그대로, 시작 직후 저장은 0을 더한다', () => {
  assert.deepEqual(
    P.restoreSessionTimer({
      timer: { accumulatedMs: 5000, runningSince: null },
      lastSavedAt: at(1).toISOString(),
    }),
    { accumulatedMs: 5000, runningSince: null },
  )
  assert.deepEqual(
    P.restoreSessionTimer({
      timer: { accumulatedMs: 0, runningSince: null },
      lastSavedAt: at(1).toISOString(),
    }),
    { accumulatedMs: 0, runningSince: null },
  )
  assert.deepEqual(
    P.restoreSessionTimer({
      timer: { accumulatedMs: 0, runningSince: at(5).toISOString() },
      lastSavedAt: at(5).toISOString(),
    }),
    { accumulatedMs: 0, runningSince: null },
  )
})

test('복원: 저장 시각이 측정 시작보다 이르거나 올바르지 않으면 측정 중 시간을 더하지 않고, 24시간으로 제한된다', () => {
  assert.deepEqual(
    P.restoreSessionTimer({
      timer: { accumulatedMs: 3000, runningSince: at(100).toISOString() },
      lastSavedAt: at(10).toISOString(),
    }),
    { accumulatedMs: 3000, runningSince: null },
  )
  assert.deepEqual(
    P.restoreSessionTimer({
      timer: { accumulatedMs: 3000, runningSince: at(0).toISOString() },
      lastSavedAt: '깨진 값',
    }),
    { accumulatedMs: 3000, runningSince: null },
  )
  const capped = P.restoreSessionTimer({
    timer: { accumulatedMs: 0, runningSince: at(0).toISOString() },
    lastSavedAt: at(5 * 24 * 3600).toISOString(),
  })
  assert.equal(capped.accumulatedMs, M.MAX_MEASURED_MS)
  assert.equal(capped.runningSince, null)
})

test('복원한 세션: 복원 여부를 알리고 저장소 모델과 같은 결과를 낸다', () => {
  const running = newSession({
    cursor: pos(2, 0),
    timer: { accumulatedMs: 1000, runningSince: at(0).toISOString() },
    lastSavedAt: at(20).toISOString(),
  })
  const { session, timerRestored } = P.restoreSession(running)
  assert.equal(timerRestored, true)
  assert.deepEqual(
    session.timer,
    M.restoreTimer(running.timer, running.lastSavedAt),
  )
  assert.deepEqual(session.timer, { accumulatedMs: 21_000, runningSince: null })
  const idle = P.restoreSession(newSession())
  assert.equal(idle.timerRestored, false)
  // 입력 세션은 바뀌지 않는다
  assert.equal(running.timer.runningSince, at(0).toISOString())
})

// ── 응답 유실 vs 실제 충돌 ──────────────────────────────────────────
test('저장소가 저장한 형식 기준: 보낸 값과 저장된 값이 같으면 이미 반영된 저장이다', () => {
  const session = newSession({
    revision: 3,
    cursor: pos(2, 0),
    timer: { accumulatedMs: 0, runningSince: at(0).toISOString() },
  })
  const done = P.completeSet(session, at(20))
  // 저장소의 실제 저장 함수와 구조화 복제(IndexedDB)를 거친 값
  const stored = structuredClone(M.applyProgress(session, done.input, at(21)))
  assert.equal(stored.revision, 4)
  assert.equal(P.classifyRevisionMismatch(done.input, stored), 'alreadyApplied')
  // 저장소는 타이머를 정규화하지 않는다: 보낸 타이머와 저장된 타이머가 그대로 같다
  assert.deepEqual(stored.timer, done.input.timer)
  // revision·저장 시각이 달라도(그 사이 한 번 더 저장) 값이 같으면 같은 것이다
  assert.equal(
    P.classifyRevisionMismatch(done.input, {
      ...stored,
      revision: 99,
      lastSavedAt: at(9999).toISOString(),
    }),
    'alreadyApplied',
  )
})

test('저장된 값이 다르면 실제 충돌이다(cursor·performed·timer 각각)', () => {
  const session = newSession()
  const sent = P.completeSet(session, T0).input
  const stored = structuredClone(M.applyProgress(session, sent, T0))
  const differs = [
    { ...stored, cursor: pos(1, 0) },
    {
      ...stored,
      performed: stored.performed.map((sets, i) =>
        i === 0
          ? sets.map((s, j) => (j === 0 ? { ...s, actualReps: 11 } : s))
          : sets,
      ),
    },
    {
      ...stored,
      performed: stored.performed.map((sets, i) =>
        i === 0
          ? sets.map((s, j) =>
              j === 1 ? { completed: true, actualReps: 10 } : s,
            )
          : sets,
      ),
    },
    { ...stored, timer: { accumulatedMs: 1, runningSince: null } },
    {
      ...stored,
      timer: { accumulatedMs: 0, runningSince: at(1).toISOString() },
    },
  ]
  for (const other of differs) {
    assert.equal(P.classifyRevisionMismatch(sent, other), 'conflict')
  }
  // 다른 곳에서 세션이 끝났으면 충돌
  assert.equal(
    P.classifyRevisionMismatch(sent, { ...stored, status: 'completed' }),
    'conflict',
  )
  assert.equal(
    P.classifyRevisionMismatch(sent, { ...stored, status: 'cancelled' }),
    'conflict',
  )
})

test('값이 없는 필드와 undefined 필드는 같은 값으로 비교한다', () => {
  const session = newSession()
  const sent = P.completeSet(session, T0).input
  const stored = structuredClone(M.applyProgress(session, sent, T0))
  const withUndefined = {
    ...stored,
    performed: stored.performed.map((sets) =>
      sets.map((set) => ({
        ...set,
        actualWeightKg: undefined,
        measuredMs: undefined,
      })),
    ),
  }
  assert.equal(
    P.classifyRevisionMismatch(sent, withUndefined),
    'alreadyApplied',
  )
  assert.equal(P.sameProgress(progressOf(session), progressOf(session)), true)
})

test('내용이 같은 두 번의 저장 시도: 낡은 revision으로 다시 보내면 충돌 대신 이미 반영된 것으로 판별된다', () => {
  // 시나리오: revision 5에서 보낸 저장이 커밋(→6)됐는데 응답을 잃음 → 같은 입력을 revision 5로 재시도하면 저장소는 mismatch
  const session = newSession({ revision: 5 })
  const sent = P.completeSet(session, T0).input
  const committed = M.applyProgress(session, sent, at(1))
  assert.equal(committed.revision, 6)
  assert.equal(sent.expectedRevision, 5)
  assert.equal(P.classifyRevisionMismatch(sent, committed), 'alreadyApplied')
  // 같은 revision 6에서 다른 곳이 이어서 한 세트 더 저장했다면 실제 충돌
  const next = P.completeSet(committed, at(2)).input
  const advanced = M.applyProgress(committed, next, at(3))
  assert.equal(P.classifyRevisionMismatch(sent, advanced), 'conflict')
})

test('변경 여부(dirty): 저장된 값과 다를 때만 미저장 변경이다', () => {
  const session = newSession()
  const done = P.completeSet(session, T0).input
  assert.equal(P.isDirty(progressOf(session), progressOf(session)), false)
  assert.equal(P.isDirty(done, progressOf(session)), true)
  assert.equal(P.isDirty(done, done), false)
})

// ── 이탈·그만두기·W15 이동 ──────────────────────────────────────────
const flags = (over = {}) => ({
  dirty: false,
  saving: false,
  failed: false,
  ...over,
})

test('이탈 판단: 저장할 것이 없으면 이동, 저장 중이면 대기, 미저장이면 저장 후 이동, 저장 실패면 이동을 막는다', () => {
  const leave = (save, local = 3, saved = 3) =>
    P.assessLeave({
      save,
      localCompletedSets: local,
      savedCompletedSets: saved,
    })
  assert.deepEqual(leave(flags()), { action: 'allow' })
  assert.deepEqual(leave(flags({ saving: true })), { action: 'waitForSave' })
  assert.deepEqual(leave(flags({ saving: true, dirty: true, failed: true })), {
    action: 'waitForSave',
  })
  assert.deepEqual(leave(flags({ dirty: true })), { action: 'saveThenLeave' })
  assert.deepEqual(leave(flags({ dirty: true, failed: true }), 5, 3), {
    action: 'confirmLoss',
    unsavedCompletedSets: 2,
  })
  assert.deepEqual(leave(flags({ dirty: true, failed: true }), 3, 3), {
    action: 'confirmLoss',
    unsavedCompletedSets: 0,
  })
  assert.deepEqual(leave(flags({ dirty: true, failed: true }), 1, 4), {
    action: 'confirmLoss',
    unsavedCompletedSets: 0,
  })
  // 실패 표시가 남아도 변경이 없으면(되돌려 저장된 값과 같음) 막지 않는다
  assert.deepEqual(leave(flags({ failed: true })), { action: 'allow' })
})

test('탭 닫기 경고는 저장되지 않은 변경이 있거나 저장 중일 때만이다', () => {
  assert.equal(P.shouldWarnBeforeUnload(flags()), false)
  assert.equal(P.shouldWarnBeforeUnload(flags({ dirty: true })), true)
  assert.equal(P.shouldWarnBeforeUnload(flags({ saving: true })), true)
  assert.equal(
    P.shouldWarnBeforeUnload(flags({ dirty: true, failed: true })),
    true,
  )
  assert.equal(P.shouldWarnBeforeUnload(flags({ failed: true })), false)
})

test('그만두기 안내: 완료 세트가 있으면 기록 손실과 여기까지 종료 권장', () => {
  const none = P.describeAbandon(newSession().performed)
  assert.deepEqual(none, {
    completedSets: 0,
    totalSets: 7,
    losesRecord: false,
    resultingStatus: 'cancelled',
    recommendFinish: false,
  })
  const some = P.describeAbandon(
    withDone(newSession(), [0, 0], [1, 0]).performed,
  )
  assert.deepEqual(some, {
    completedSets: 2,
    totalSets: 7,
    losesRecord: true,
    resultingStatus: 'interrupted',
    recommendFinish: true,
  })
  // 저장소가 정하는 종료 상태와 같다
  assert.equal(
    some.resultingStatus,
    M.abandonStatus({ performed: withDone(newSession(), [0, 0]).performed }),
  )
})

test('W15 이동: 완료 세트가 0개면 불가', () => {
  const r = P.canProceedToResult({
    status: 'in_progress',
    performed: newSession().performed,
    timer: newSession().timer,
    save: flags(),
  })
  assert.deepEqual(r, { ok: false, reason: 'noCompletedSets' })
  // 저장 상태가 정상이어도 0개면 불가, 다른 사유보다 먼저 판정
  assert.equal(
    P.canProceedToResult({
      status: 'in_progress',
      performed: newSession().performed,
      timer: newSession().timer,
      save: flags({ dirty: true }),
    }).reason,
    'noCompletedSets',
  )
})

test('W15 이동: 저장 중·저장 실패·미저장이면 불가, 모두 저장되면 가능', () => {
  const s = withDone(newSession(), [0, 0], [0, 1])
  const go = (save, status = 'in_progress', timer = s.timer) =>
    P.canProceedToResult({ status, performed: s.performed, timer, save })
  assert.deepEqual(go(flags({ saving: true })), { ok: false, reason: 'saving' })
  assert.deepEqual(go(flags({ failed: true, dirty: true })), {
    ok: false,
    reason: 'saveFailed',
  })
  assert.deepEqual(go(flags({ dirty: true })), { ok: false, reason: 'unsaved' })
  assert.deepEqual(go(flags(), 'completed'), {
    ok: false,
    reason: 'sessionEnded',
  })
  assert.deepEqual(go(flags(), 'interrupted'), {
    ok: false,
    reason: 'sessionEnded',
  })
  assert.deepEqual(go(flags()), {
    ok: true,
    completedSets: 2,
    incompleteSets: 5,
    allCompleted: false,
    discardsTimer: false,
  })
})

test('W15 이동 가능 시 미완료 세트 수·전체 완료·타이머 버림을 알린다', () => {
  const all = withDone(
    newSession(),
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 1],
    [2, 0],
    [2, 1],
  )
  const done = P.canProceedToResult({
    status: 'in_progress',
    performed: all.performed,
    timer: all.timer,
    save: flags(),
  })
  assert.deepEqual(done, {
    ok: true,
    completedSets: 7,
    incompleteSets: 0,
    allCompleted: true,
    discardsTimer: false,
  })
  const measuring = P.canProceedToResult({
    status: 'in_progress',
    performed: withDone(newSession(), [0, 0]).performed,
    timer: { accumulatedMs: 0, runningSince: at(0).toISOString() },
    save: flags(),
  })
  assert.equal(measuring.ok, true)
  assert.equal(measuring.discardsTimer, true)
  assert.equal(measuring.incompleteSets, 6)
})
