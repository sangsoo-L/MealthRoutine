import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// W15 결과 집계·편집·저장 전 검증 순수 로직 검증. 화면·저장소 없이 기존 모델 규칙(workoutModel·workoutProgress)과 함께 확인한다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let R
let M
let P

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  R = await server.ssrLoadModule('/src/exercise/workoutResult.ts')
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  P = await server.ssrLoadModule('/src/exercise/workoutProgress.ts')
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-13T03:00:00.000Z')
const NOW = new Date('2026-11-13T04:00:00.000Z')
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })

/** 횟수형 3세트(e1), 중량형 2세트(e2, 두 번째는 목표 중량 없음), 시간형 2세트(e3, 60초). 슬러그 ID. */
function makeList(ids = ['e1', 'e2', 'e3']) {
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
        exerciseId: ids[0],
        exerciseNameSnapshot: '푸시업',
        recordType: 'reps',
        sets: [{ reps: 10 }, { reps: 10 }, { reps: 8 }],
      },
      {
        exerciseId: ids[1],
        exerciseNameSnapshot: '덤벨 컬',
        recordType: 'weight',
        sets: [{ reps: 10, weightKg: 8 }, { reps: 12 }],
      },
      {
        exerciseId: ids[2],
        exerciseNameSnapshot: '플랭크',
        recordType: 'time',
        sets: [{ targetSeconds: 60 }, { targetSeconds: 60 }],
      },
    ],
  }
}
const sessionOf = (list, over = {}) => ({
  ...M.createWorkoutSession({ id: 's1', ownerId: 'u', list, now: T0 }),
  ...over,
})
const newSession = (over = {}) => sessionOf(makeList(), over)

/** 지정한 세트를 목표 값으로 완료한 세션. 시간형은 measured에 따라 측정 시간을 넣는다. */
function withDone(session, positions, measuredMs) {
  const performed = session.performed.map((sets) =>
    sets.map((set) => ({ ...set })),
  )
  for (const [i, j] of positions) {
    const item = session.listSnapshot.items[i]
    const target = item.sets[j]
    performed[i][j] =
      item.recordType === 'time'
        ? measuredMs === undefined
          ? { completed: true }
          : { completed: true, measuredMs }
        : item.recordType === 'weight'
          ? target.weightKg === undefined
            ? { completed: true, actualReps: target.reps, actualWeightKg: 10 } // A안: 목표 중량이 없어도 실제 중량이 있다
            : {
                completed: true,
                actualReps: target.reps,
                actualWeightKg: target.weightKg,
              }
          : { completed: true, actualReps: target.reps }
  }
  return { ...session, performed }
}
const ALL = [
  [0, 0],
  [0, 1],
  [0, 2],
  [1, 0],
  [1, 1],
  [2, 0],
  [2, 1],
]
const draftOf = (session) => {
  const created = R.createResultDraft(session)
  assert.equal(created.ok, true)
  return created.draft
}
const edit = (session, draft, e) =>
  R.applyResultEdit(session.listSnapshot, draft, e)
const mustEdit = (session, draft, e) => {
  const result = edit(session, draft, e)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.draft
}
const plain = (value) => JSON.parse(JSON.stringify(value))

// ─── 집계 ──────────────────────────────────────────────────

test('1~4. 운동·세트 개수와 완료·미완료 세트 수', () => {
  const session = withDone(newSession(), [
    [0, 0],
    [0, 1],
    [1, 0],
  ])
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  assert.equal(s.exerciseCount, 3)
  assert.equal(s.plannedSetCount, 7)
  assert.equal(s.completedSetCount, 3)
  assert.equal(s.incompleteSetCount, 4)
})

test('5. 운동별 완료 세트 수·미완료 세트 수·목표·실제값', () => {
  const session = withDone(newSession(), [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ])
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  const [pushup, curl, plank] = s.exercises
  assert.equal(pushup.name, '푸시업')
  assert.equal(pushup.recordType, 'reps')
  assert.equal(pushup.plannedSetCount, 3)
  assert.equal(pushup.completedSetCount, 2)
  assert.equal(pushup.incompleteSetCount, 1)
  assert.equal(pushup.completedAll, false)
  assert.equal(pushup.target.totalReps, 28)
  assert.equal(pushup.actual.totalReps, 20)
  // 중량형: 목표 중량은 한 세트에만 있다. 목표와 실제를 구분해서 돌려준다.
  assert.equal(curl.completedAll, true)
  assert.equal(curl.target.totalReps, 22)
  assert.equal(curl.target.maxWeightKg, 8)
  assert.equal(curl.actual.totalReps, 22)
  assert.equal(curl.actual.maxWeightKg, 10) // 목표 중량이 없던 2세트의 실제 중량(10kg)이 최대
  // 시간형: 완료 없음, 목표 시간 합은 남고 실제 측정은 null
  assert.equal(plank.completedSetCount, 0)
  assert.equal(plank.target.totalSeconds, 120)
  assert.equal(plank.target.totalReps, null)
  assert.equal(plank.actual.measuredMs, null)
  // 미완료 세트도 표시용 행으로 남지만 실제 값은 없다.
  assert.equal(pushup.sets.length, 3)
  assert.deepEqual(
    plain(pushup.sets[2]),
    plain({
      setNumber: 3,
      target: { reps: 8 },
      completed: false,
      actualReps: null,
      actualWeightKg: null,
      measuredMs: null,
      timeStatus: null,
    }),
  )
})

test('5-1. 일부 세트만 완료한 운동은 운동 완료로 세지 않는다', () => {
  const session = withDone(newSession(), [
    [0, 0],
    [0, 1],
    [0, 2],
    [1, 0],
    [2, 0],
  ])
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  assert.equal(s.completedExerciseCount, 1) // 푸시업만
  assert.equal(s.incompleteExerciseCount, 2)
  assert.equal(s.startedExerciseCount, 3) // 완료 세트가 있는 운동(기록의 exerciseCount 기준)
})

test('6. 전체 완료', () => {
  const session = withDone(newSession(), ALL)
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  assert.equal(s.allCompleted, true)
  assert.equal(s.partial, false)
  assert.equal(s.noneCompleted, false)
  assert.equal(s.completedExerciseCount, 3)
  assert.equal(s.percent, 100)
  // 진행 중 세션은 세트를 모두 마쳐도 in_progress, 완료 처리된 세션은 full
  assert.equal(R.deriveSessionResultStatus(session), 'in_progress')
  assert.equal(
    R.deriveSessionResultStatus({ ...session, status: 'completed' }),
    'full',
  )
})

test('7. 부분 완료와 파생 기록 상태', () => {
  const session = withDone(newSession(), [[0, 0]])
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  assert.equal(s.partial, true)
  assert.equal(s.allCompleted, false)
  // 진행 중 세션은 in_progress, 완료 세션은 부분/전체, 중단·취소는 abandoned
  assert.equal(R.deriveSessionResultStatus(session), 'in_progress')
  assert.equal(
    R.deriveSessionResultStatus({ ...session, status: 'completed' }),
    'partial',
  )
  assert.equal(
    R.deriveSessionResultStatus({
      ...withDone(newSession(), ALL),
      status: 'completed',
    }),
    'full',
  )
  assert.equal(
    R.deriveSessionResultStatus({ ...session, status: 'interrupted' }),
    'abandoned',
  )
  assert.equal(
    R.deriveSessionResultStatus({ ...session, status: 'cancelled' }),
    'abandoned',
  )
  // 완료 기록만으로도 파생할 수 있다(W01).
  const partialRecord = M.buildWorkoutRecord({ id: 'r', session, now: NOW })
  assert.equal(R.deriveRecordResultStatus(partialRecord), 'partial')
  const fullRecord = M.buildWorkoutRecord({
    id: 'r',
    session: withDone(newSession(), ALL),
    now: NOW,
  })
  assert.equal(R.deriveRecordResultStatus(fullRecord), 'full')
})

test('8. 완료 세트 0개', () => {
  const session = newSession()
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  assert.equal(s.noneCompleted, true)
  assert.equal(s.partial, false)
  assert.equal(s.allCompleted, false)
  assert.equal(s.completedSetCount, 0)
  assert.equal(s.percent, 0)
  assert.equal(s.measuredMs, null)
})

test('9. 완료율 계산(반올림)', () => {
  const session = withDone(newSession(), [
    [0, 0],
    [0, 1],
  ])
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  assert.equal(s.ratio, 2 / 7)
  assert.equal(s.percent, 29)
  // 기존 진행률과 같은 값이다.
  assert.equal(s.percent, P.progressOf(session.performed).percent)
})

// ─── 화면 유형 ─────────────────────────────────────────────

test('10~12. 시간형 포함 → W15, 시간형 없음 → W15-1, 혼합 → W15', () => {
  const list = makeList()
  const withTime = sessionOf(list)
  assert.equal(R.resultScreenType(withTime.listSnapshot), 'W15')
  const noTime = sessionOf({ ...list, items: list.items.slice(0, 2) })
  assert.equal(R.resultScreenType(noTime.listSnapshot), 'W15-1')
  const timeOnly = sessionOf({ ...list, items: list.items.slice(2) })
  assert.equal(R.resultScreenType(timeOnly.listSnapshot), 'W15')
  // 요약에도 같은 값이 실린다.
  assert.equal(
    R.summarizeResult(noTime.listSnapshot, noTime.performed).screenType,
    'W15-1',
  )
})

test('10-1. 유형은 스냅샷 기준이다(수행값·타이머 사용 여부와 무관, 카탈로그 최신 데이터 무관)', () => {
  // 시간형 세트를 하나도 완료하지 않았어도 W15다.
  const session = withDone(newSession(), [[0, 0]])
  assert.equal(R.resultScreenType(session.listSnapshot), 'W15')
  // 스냅샷에서 시간형만 빼면 W15-1(수행값은 그대로 두어도 영향 없음)
  const noTimeSnapshot = {
    ...session.listSnapshot,
    items: session.listSnapshot.items.slice(0, 2),
  }
  assert.equal(R.resultScreenType(noTimeSnapshot), 'W15-1')
})

// ─── 실제값 편집 ───────────────────────────────────────────

test('13. 횟수형 실제 횟수 수정(원본·초안 불변)', () => {
  const session = withDone(newSession(), ALL)
  const before = plain(session)
  const draft = draftOf(session)
  const next = mustEdit(session, draft, {
    kind: 'reps',
    position: pos(0, 0),
    value: '12',
  })
  assert.equal(next.performed[0][0].actualReps, 12)
  assert.equal(draft.performed[0][0].actualReps, 10) // 이전 초안 불변
  assert.deepEqual(plain(session), before) // 세션 불변
  assert.equal(R.hasResultChanges(next), true)
  assert.equal(R.hasResultChanges(draft), false)
})

test('14. 중량형 실제 횟수·중량 수정, 중량 비우기는 거부(A안)', () => {
  const session = withDone(newSession(), ALL)
  let draft = draftOf(session)
  draft = mustEdit(session, draft, {
    kind: 'reps',
    position: pos(1, 0),
    value: 15,
  })
  draft = mustEdit(session, draft, {
    kind: 'weightKg',
    position: pos(1, 0),
    value: '9.5',
  })
  assert.deepEqual(plain(draft.performed[1][0]), {
    completed: true,
    actualReps: 15,
    actualWeightKg: 9.5,
  })
  // 목표 중량이 없던 세트에도 실제 중량을 입력할 수 있다.
  draft = mustEdit(session, draft, {
    kind: 'weightKg',
    position: pos(1, 1),
    value: 6,
  })
  assert.equal(draft.performed[1][1].actualWeightKg, 6)
  // A안: 빈 값은 "중량 미입력"으로 저장할 수 없다(거부하고 초안은 그대로). 0kg은 직접 입력하면 된다.
  const blank = edit(session, draft, {
    kind: 'weightKg',
    position: pos(1, 0),
    value: '',
  })
  assert.deepEqual(plain(blank), {
    ok: false,
    reason: 'invalidWeight',
    detail: 'empty',
  })
  draft = mustEdit(session, draft, {
    kind: 'weightKg',
    position: pos(1, 0),
    value: '0',
  })
  assert.equal(draft.performed[1][0].actualWeightKg, 0)
  // 횟수형에는 중량 필드가 없다.
  const reject = edit(session, draft, {
    kind: 'weightKg',
    position: pos(0, 0),
    value: 5,
  })
  assert.deepEqual(plain(reject), { ok: false, reason: 'notApplicable' })
})

test('15. 완료 세트 해제(실제 값도 지운다)', () => {
  const session = withDone(newSession(), ALL, 45_000)
  let draft = draftOf(session)
  draft = mustEdit(session, draft, { kind: 'uncomplete', position: pos(1, 0) })
  assert.deepEqual(plain(draft.performed[1][0]), { completed: false })
  // 시간형 세트도 완료를 해제할 수 있다(측정 시간도 함께 사라진다).
  draft = mustEdit(session, draft, { kind: 'uncomplete', position: pos(2, 0) })
  assert.deepEqual(plain(draft.performed[2][0]), { completed: false })
  const s = R.summarizeResult(session.listSnapshot, draft.performed)
  assert.equal(s.completedSetCount, 5)
  assert.equal(s.measuredMs, 45_000) // 남은 시간형 세트(2,1)만
  // 이미 해제한 세트는 다시 해제할 수 없다.
  const again = edit(session, draft, {
    kind: 'uncomplete',
    position: pos(1, 0),
  })
  assert.equal(again.reason, 'setNotCompleted')
})

test('16. 편집 취소 시 원래 상태로 복원', () => {
  const session = withDone(newSession(), ALL, 30_000)
  const before = plain(session)
  let draft = draftOf(session)
  draft = mustEdit(session, draft, {
    kind: 'reps',
    position: pos(0, 1),
    value: 3,
  })
  draft = mustEdit(session, draft, { kind: 'uncomplete', position: pos(2, 1) })
  assert.equal(R.hasResultChanges(draft), true)
  const restored = R.cancelResultEdits(draft)
  assert.deepEqual(plain(restored.performed), plain(session.performed))
  assert.equal(R.hasResultChanges(restored), false)
  assert.deepEqual(plain(session), before)
  // 복원 뒤의 초안은 이전 초안과 객체를 공유하지 않는다.
  assert.notEqual(restored.performed[0][1], draft.performed[0][1])
})

test('17. 미완료 세트는 W15에서 완료·수정할 수 없다', () => {
  const session = withDone(newSession(), [[0, 0]])
  const draft = draftOf(session)
  for (const e of [
    { kind: 'complete', position: pos(0, 1) },
    { kind: 'reps', position: pos(0, 1), value: 5 },
    { kind: 'weightKg', position: pos(1, 1), value: 5 },
    { kind: 'uncomplete', position: pos(0, 1) },
  ]) {
    const result = edit(session, draft, e)
    assert.equal(result.ok, false, e.kind)
    assert.equal(
      result.reason,
      e.kind === 'complete' ? 'cannotComplete' : 'setNotCompleted',
      e.kind,
    )
  }
  // 초안에 직접 값을 넣어도 저장 전 검증이 막는다(미완료 → 완료).
  const forged = {
    base: draft.base,
    performed: draft.performed.map((sets, i) =>
      sets.map((set, j) =>
        i === 0 && j === 1 ? { completed: true, actualReps: 10 } : { ...set },
      ),
    ),
  }
  const check = R.prepareResultSave(session, forged, NOW)
  assert.equal(check.ok, false)
  assert.equal(check.issues[0].reason, 'forbiddenChange')
})

test('18. 측정 시간은 시간 구성값이 있는 방식에서 수정할 수 있고 입력 한계(1ms~24시간)를 지킨다', () => {
  const session = withDone(newSession(), ALL, 30_000)
  const draft = draftOf(session)
  // 초 단위 숫자·문자열, 분:초, 소수 초(밀리초 셋째 자리)
  for (const [value, ms] of [
    [99, 99_000],
    ['55.5', 55_500],
    ['1:05', 65_000],
    ['1:05.25', 65_250],
    ['0.001', 1],
  ]) {
    const next = mustEdit(session, draft, {
      kind: 'measuredMs',
      position: pos(2, 0),
      value,
    })
    assert.equal(next.performed[2][0].measuredMs, ms, String(value))
  }
  // 거부: 빈 값·0·음수·형식 오류·상한 초과·NaN/Infinity — 초안은 바뀌지 않는다
  for (const [value, detail] of [
    ['', 'empty'],
    [null, 'empty'],
    ['0', 'range'],
    ['86401', 'range'],
    ['-5', 'format'],
    ['abc', 'format'],
    ['1:75', 'format'],
    ['1.2345', 'format'],
    [Number.NaN, 'format'],
    [Number.POSITIVE_INFINITY, 'format'],
  ]) {
    const result = edit(session, draft, {
      kind: 'measuredMs',
      position: pos(2, 0),
      value,
    })
    assert.deepEqual(
      [result.ok, result.reason, result.detail],
      [false, 'invalidMeasured', detail],
      String(value),
    )
  }
  assert.equal(
    mustEdit(session, draft, {
      kind: 'measuredMs',
      position: pos(2, 0),
      value: 86400,
    }).performed[2][0].measuredMs,
    86_400_000,
  )
  // 횟수·중량형에는 시간을 넣을 수 없고, 시간형에 횟수·중량도 넣을 수 없다.
  assert.equal(
    edit(session, draft, { kind: 'measuredMs', position: pos(0, 0), value: 5 })
      .reason,
    'notApplicable',
  )
  assert.equal(
    edit(session, draft, { kind: 'reps', position: pos(2, 0), value: 5 })
      .reason,
    'notApplicable',
  )
  assert.equal(
    edit(session, draft, { kind: 'weightKg', position: pos(2, 0), value: 5 })
      .reason,
    'notApplicable',
  )
  // 초안을 직접 바꿔 횟수·중량 필드를 추가해도 저장 전 검증이 막는다.
  const forged = {
    base: draft.base,
    performed: draft.performed.map((sets, i) =>
      sets.map((set, j) =>
        i === 2 && j === 0
          ? { completed: true, measuredMs: 1000, actualReps: 3 }
          : { ...set },
      ),
    ),
  }
  const check = R.prepareResultSave(session, forged, NOW)
  assert.equal(check.ok, false)
  assert.equal(check.issues[0].reason, 'forbiddenChange')
  assert.equal(check.issues[0].itemIndex, 2)
})

test('19. 목표값·세트 수·순서·운동 추가·삭제 수정 거부', () => {
  const session = withDone(newSession(), ALL)
  const snapshotBefore = plain(session.listSnapshot)
  const draft = draftOf(session)
  const expected = {
    target: 'targetNotEditable',
    setCount: 'targetNotEditable',
    reorder: 'structureNotEditable',
    addExercise: 'structureNotEditable',
    removeExercise: 'structureNotEditable',
  }
  for (const [kind, reason] of Object.entries(expected)) {
    const result = edit(session, draft, { kind, position: pos(0, 0), value: 1 })
    assert.deepEqual(plain(result), { ok: false, reason }, kind)
  }
  assert.equal(
    edit(session, draft, { kind: 'unknown', position: pos(0, 0) }).reason,
    'unsupportedEdit',
  )
  assert.deepEqual(plain(session.listSnapshot), snapshotBefore)
})

test('20. 잘못된 입력값 거부(빈 값·NaN·Infinity·범위·형식·자릿수)', () => {
  const session = withDone(newSession(), ALL)
  const draft = draftOf(session)
  const reps = (value) =>
    edit(session, draft, { kind: 'reps', position: pos(0, 0), value })
  assert.equal(reps('').detail, 'empty')
  assert.equal(reps(null).detail, 'empty')
  assert.equal(reps(undefined).detail, 'empty')
  assert.equal(reps(Number.NaN).detail, 'format')
  assert.equal(reps(Infinity).detail, 'format')
  assert.equal(reps(1.5).detail, 'format')
  assert.equal(reps('1e3').detail, 'format')
  assert.equal(reps(0).detail, 'range')
  assert.equal(reps(1000).detail, 'range')
  assert.equal(reps(-1).reason, 'invalidReps')
  assert.equal(reps(-1).detail, 'range')
  assert.equal(reps(1).ok, true)
  assert.equal(reps(999).ok, true)
  const weight = (value) =>
    edit(session, draft, { kind: 'weightKg', position: pos(1, 0), value })
  assert.equal(weight(Number.NaN).detail, 'format')
  assert.equal(weight(Infinity).detail, 'format')
  assert.equal(weight('abc').detail, 'format')
  assert.equal(weight(-0.1).detail, 'range')
  assert.equal(weight(1000).detail, 'range')
  assert.equal(weight('2.55').detail, 'decimals')
  assert.equal(weight(0).ok, true)
  assert.equal(weight('999').ok, true)
  assert.equal(weight('12.5').ok, true)
  // 실패한 편집은 초안을 바꾸지 않는다.
  assert.equal(draft.performed[0][0].actualReps, 10)
  // 위치 오류
  assert.equal(
    edit(session, draft, { kind: 'reps', position: pos(9, 0), value: 1 })
      .reason,
    'invalidPosition',
  )
})

// ─── 시간형 ────────────────────────────────────────────────

test('21~23. 측정 시간 합계·미측정 구분·미완료 제외', () => {
  const base = newSession()
  const performed = base.performed.map((sets) => sets.map((s) => ({ ...s })))
  performed[2][0] = { completed: true, measuredMs: 61_000 }
  performed[2][1] = { completed: true } // 완료했지만 측정 없음
  const session = { ...base, performed }
  const s = R.summarizeResult(session.listSnapshot, session.performed)
  const plank = s.exercises[2]
  assert.equal(plank.actual.measuredMs, 61_000)
  assert.equal(plank.actual.measuredSetCount, 1)
  assert.equal(plank.actual.unmeasuredSetCount, 1)
  assert.deepEqual(
    plank.sets.map((row) => [row.timeStatus, row.measuredMs]),
    [
      ['measured', 61_000],
      ['unmeasured', null],
    ],
  )
  assert.equal(s.measuredMs, 61_000)
  assert.equal(s.unmeasuredSetCount, 1)
  assert.equal(R.UNMEASURED_LABEL, '측정 기록 없음')

  // 미측정만 있으면 0이 아니라 null이다. 목표 시간으로 대체하지 않는다.
  const unmeasured = withDone(newSession(), [[2, 0]])
  const u = R.summarizeResult(unmeasured.listSnapshot, unmeasured.performed)
  assert.equal(u.measuredMs, null)
  assert.equal(u.exercises[2].actual.measuredMs, null)
  assert.equal(u.exercises[2].sets[0].timeStatus, 'unmeasured')
  assert.equal(u.exercises[2].sets[0].measuredMs, null)

  // 미완료 세트는 입력 중이던 값이 있어도 제외한다.
  const stray = newSession()
  const sp = stray.performed.map((sets) => sets.map((x) => ({ ...x })))
  sp[2][0] = { completed: false, measuredMs: 99_000 }
  sp[2][1] = { completed: true, measuredMs: 10_000 }
  const t = R.summarizeResult(stray.listSnapshot, sp)
  assert.equal(t.exercises[2].actual.measuredMs, 10_000)
  assert.equal(t.exercises[2].sets[0].timeStatus, 'incomplete')
  assert.equal(t.exercises[2].sets[0].measuredMs, null)
  // 측정 시간 0은 "측정함(0ms)"이며 미측정과 구분한다.
  sp[2][1] = { completed: true, measuredMs: 0 }
  const z = R.summarizeResult(stray.listSnapshot, sp)
  assert.equal(z.exercises[2].actual.measuredMs, 0)
  assert.equal(z.exercises[2].sets[1].timeStatus, 'measured')
})

// ─── 저장 호환성 ───────────────────────────────────────────

test('24. 편집 결과를 saveProgress 입력으로 변환하고 검증한다', () => {
  const session = withDone(newSession(), ALL, 30_000)
  let draft = draftOf(session)
  draft = mustEdit(session, draft, {
    kind: 'reps',
    position: pos(0, 0),
    value: 12,
  })
  draft = mustEdit(session, draft, { kind: 'uncomplete', position: pos(1, 1) })
  const check = R.prepareResultSave(session, draft, NOW)
  assert.equal(check.ok, true, JSON.stringify(check))
  assert.equal(check.changed, true)
  assert.equal(check.input.expectedRevision, session.revision)
  assert.equal(M.validateProgressInput(check.input, session.listSnapshot), true)
  assert.equal(check.input.performed[0][0].actualReps, 12)
  assert.deepEqual(plain(check.input.performed[1][1]), { completed: false })
  assert.equal(check.summary.completedSetCount, 6)
  // 입력은 초안·세션과 객체를 공유하지 않는다.
  assert.notEqual(check.input.performed[0][0], draft.performed[0][0])
  assert.notEqual(check.input.cursor, session.cursor)
  assert.notEqual(check.input.timer, session.timer)
  // 편집이 없으면 changed=false(saveProgress 생략 가능)이고 값은 세션과 같다.
  const same = R.prepareResultSave(session, draftOf(session), NOW)
  assert.equal(same.ok, true)
  assert.equal(same.changed, false)
  assert.deepEqual(plain(same.input.performed), plain(session.performed))
})

test('24-1. 완료 세트 0개·진행 중 아님·오래된 초안·모양 불일치는 저장 불가(사유 반환)', () => {
  const session = withDone(newSession(), [[0, 0]])
  // 마지막 완료 세트를 해제 → 0개
  const draft = mustEdit(session, draftOf(session), {
    kind: 'uncomplete',
    position: pos(0, 0),
  })
  const none = R.prepareResultSave(session, draft, NOW)
  assert.equal(none.ok, false)
  assert.deepEqual(
    none.issues.map((issue) => issue.reason),
    ['noCompletedSets'],
  )
  assert.ok(none.issues[0].message.length > 0)
  // 이미 끝난 세션
  for (const status of ['completed', 'interrupted', 'cancelled']) {
    assert.equal(
      R.createResultDraft({ ...session, status }).reason,
      'sessionEnded',
    )
    const check = R.prepareResultSave(
      { ...session, status },
      draftOf(session),
      NOW,
    )
    assert.equal(check.issues[0].reason, 'sessionEnded', status)
  }
  // 세션이 다른 곳에서 바뀌었다(오래된 초안)
  const changedElsewhere = withDone(session, [[0, 1]])
  const stale = R.prepareResultSave(changedElsewhere, draftOf(session), NOW)
  assert.equal(stale.issues[0].reason, 'staleDraft')
  // 초안 모양이 세션과 다르다
  const base = draftOf(session)
  const shaped = {
    base: base.base,
    performed: base.performed.map((sets, i) =>
      i === 0 ? sets.slice(1) : sets,
    ),
  }
  assert.equal(
    R.prepareResultSave(session, shaped, NOW).issues[0].reason,
    'invalidPerformed',
  )
  // 손상된 세션
  const corrupt = {
    ...session,
    performed: session.performed.map((sets, i) =>
      i === 0 ? sets.slice(1) : sets,
    ),
  }
  assert.equal(R.createResultDraft(corrupt).reason, 'invalidSession')
  assert.equal(
    R.prepareResultSave(corrupt, base, NOW).issues[0].reason,
    'invalidSession',
  )
})

test('24-2. 저장 전 검증은 입력 한계를 벗어난 편집 값과 원본에 없는 필드 추가를 거부한다', () => {
  const session = withDone(newSession(), ALL, 30_000)
  const base = draftOf(session)
  const patch = (i, j, set) => ({
    base: base.base,
    performed: base.performed.map((sets, a) =>
      sets.map((s, b) => (a === i && b === j ? set : { ...s })),
    ),
  })
  // 횟수 범위 초과, 중량 자릿수 초과
  const overReps = R.prepareResultSave(
    session,
    patch(0, 0, { completed: true, actualReps: 1000 }),
    NOW,
  )
  assert.equal(overReps.issues[0].reason, 'invalidValue')
  const decimals = R.prepareResultSave(
    session,
    patch(1, 0, { completed: true, actualReps: 10, actualWeightKg: 8.25 }),
    NOW,
  )
  assert.equal(decimals.issues[0].reason, 'invalidValue')
  // 모델에 없는 필드(횟수형의 중량, 시간형의 횟수)는 허용하지 않는다.
  const extra = R.prepareResultSave(
    session,
    patch(0, 0, { completed: true, actualReps: 10, actualWeightKg: 5 }),
    NOW,
  )
  assert.equal(extra.ok, false)
  assert.equal(extra.issues[0].reason, 'forbiddenChange')
  const timeReps = R.prepareResultSave(
    session,
    patch(2, 0, { completed: true, measuredMs: 30_000, actualReps: 5 }),
    NOW,
  )
  assert.equal(timeReps.ok, false)
  // 완료 해제했는데 값이 남은 경우
  const leftover = R.prepareResultSave(
    session,
    patch(0, 0, { completed: false, actualReps: 10 }),
    NOW,
  )
  assert.equal(leftover.issues[0].reason, 'forbiddenChange')
})

test('25. cursor·performed·timer 정합성(수정하지 않은 값 보존)', () => {
  const session = withDone(
    newSession({
      cursor: pos(1, 1),
      timer: { accumulatedMs: 4000, runningSince: null },
      revision: 7,
    }),
    ALL,
    20_000,
  )
  const draft = mustEdit(session, draftOf(session), {
    kind: 'reps',
    position: pos(0, 2),
    value: 9,
  })
  const check = R.prepareResultSave(session, draft, NOW)
  assert.equal(check.ok, true)
  assert.deepEqual(check.input.cursor, session.cursor)
  assert.deepEqual(check.input.timer, session.timer)
  assert.equal(check.input.expectedRevision, 7)
  // 수정한 세트 외에는 원본과 같다.
  session.performed.forEach((sets, i) =>
    sets.forEach((set, j) => {
      if (i === 0 && j === 2) return
      assert.deepEqual(plain(check.input.performed[i][j]), plain(set))
    }),
  )
  // 운동·세트 구성(모양)은 스냅샷과 같다.
  assert.equal(check.input.performed.length, session.listSnapshot.items.length)
  check.input.performed.forEach((sets, i) =>
    assert.equal(sets.length, session.listSnapshot.items[i].sets.length),
  )
})

test('26. buildWorkoutRecord 호환: 기록의 값이 화면 요약과 같고 parseWorkoutRecord를 통과한다', () => {
  const session = withDone(newSession(), ALL, 45_000)
  let draft = draftOf(session)
  draft = mustEdit(session, draft, {
    kind: 'reps',
    position: pos(0, 0),
    value: 11,
  })
  draft = mustEdit(session, draft, {
    kind: 'weightKg',
    position: pos(1, 0),
    value: '10.5',
  })
  draft = mustEdit(session, draft, { kind: 'uncomplete', position: pos(0, 2) })
  const check = R.prepareResultSave(session, draft, NOW)
  assert.equal(check.ok, true)
  // 저장 후 상태를 흉내 낸다: saveProgress(입력 적용) → complete(기록 생성)
  const saved = M.applyProgress(session, check.input, NOW)
  const record = M.buildWorkoutRecord({ id: 'rec', session: saved, now: NOW })
  assert.notEqual(M.parseWorkoutRecord(plain(record)), null)
  const s = check.summary
  assert.equal(record.totals.completedSetCount, s.completedSetCount)
  assert.equal(record.totals.plannedSetCount, s.plannedSetCount)
  assert.equal(record.totals.exerciseCount, s.startedExerciseCount)
  assert.equal(record.totals.measuredMs, s.measuredMs)
  // 운동 ID·이름·순서·목표값·실제값·완료 여부(완료한 세트만, setNumber 유지)
  assert.deepEqual(
    record.exercises.map((e) => [
      e.exerciseId,
      e.exerciseNameSnapshot,
      e.recordType,
    ]),
    [
      ['e1', '푸시업', 'reps'],
      ['e2', '덤벨 컬', 'weight'],
      ['e3', '플랭크', 'time'],
    ],
  )
  const pushup = record.exercises[0]
  assert.deepEqual(
    pushup.completedSets.map((x) => [x.setNumber, x.target, x.actualReps]),
    [
      [1, { reps: 10 }, 11],
      [2, { reps: 10 }, 10],
    ],
  )
  const curl = record.exercises[1].completedSets[0]
  assert.equal(curl.actualWeightKg, 10.5)
  assert.deepEqual(curl.target, { reps: 10, weightKg: 8 }) // 목표는 그대로
  assert.equal(record.exercises[2].completedSets[0].measuredMs, 45_000)
  assert.equal(record.performedDate, '2026-11-13') // 세션 시작 날짜 유지
  assert.equal(record.plannedDate, session.listSnapshot.plannedDate)
  assert.equal(record.catalogVersion, session.listSnapshot.catalogVersion)
  // 미완료 세트는 기록에 포함되지 않는다.
  assert.equal(
    pushup.completedSets.some((x) => x.setNumber === 3),
    false,
  )
})

test('27~28. 기존 슬러그 ID와 신규 숫자 ID 운동 모두 처리한다(카탈로그에 의존하지 않음)', () => {
  for (const ids of [
    ['push-up', 'dumbbell-curl', 'plank'],
    ['12', '305', '7'],
    ['push-up', '305', 'plank'], // 혼합
  ]) {
    const session = withDone(sessionOf(makeList(ids)), ALL, 15_000)
    const draft = mustEdit(session, draftOf(session), {
      kind: 'reps',
      position: pos(0, 0),
      value: 20,
    })
    const check = R.prepareResultSave(session, draft, NOW)
    assert.equal(check.ok, true, ids.join())
    assert.deepEqual(
      check.summary.exercises.map((e) => e.exerciseId),
      ids,
    )
    const record = M.buildWorkoutRecord({
      id: 'rec',
      session: M.applyProgress(session, check.input, NOW),
      now: NOW,
    })
    assert.deepEqual(
      record.exercises.map((e) => e.exerciseId),
      ids,
    )
    assert.notEqual(M.parseWorkoutRecord(plain(record)), null)
  }
})

test('29. 세션 스냅샷·원본 세션은 어떤 경로로도 바뀌지 않는다', () => {
  const session = withDone(newSession(), ALL, 12_000)
  const frozen = plain(session)
  // 깊은 동결: 변경을 시도하면 예외가 난다(엄격 모드).
  const deepFreeze = (value) => {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(deepFreeze)
      Object.freeze(value)
    }
    return value
  }
  deepFreeze(session)
  let draft = draftOf(session)
  draft = mustEdit(session, draft, {
    kind: 'reps',
    position: pos(0, 0),
    value: 2,
  })
  draft = mustEdit(session, draft, {
    kind: 'weightKg',
    position: pos(1, 0),
    value: 1,
  })
  draft = mustEdit(session, draft, { kind: 'uncomplete', position: pos(2, 1) })
  edit(session, draft, { kind: 'target', position: pos(0, 0) })
  R.summarizeResult(session.listSnapshot, draft.performed)
  const check = R.prepareResultSave(session, draft, NOW)
  assert.equal(check.ok, true)
  R.cancelResultEdits(draft)
  R.deriveSessionResultStatus(session)
  assert.deepEqual(plain(session), frozen)
  assert.deepEqual(plain(session.listSnapshot), frozen.listSnapshot)
})

test('30. 기존 모델 규칙과의 일관성(W14 진행 입력 규칙 재사용)', () => {
  // W14의 completeSet이 만든 값으로 결과를 집계·저장 검증해도 통과한다.
  const session = newSession()
  const done = P.completeSet(session, T0, {
    position: pos(0, 0),
    entry: { reps: 12 },
  })
  assert.equal(done.ok, true)
  const afterSave = M.applyProgress(session, done.input, NOW)
  const draft = draftOf(afterSave)
  const check = R.prepareResultSave(afterSave, draft, NOW)
  assert.equal(check.ok, true)
  assert.equal(check.summary.completedSetCount, 1)
  assert.equal(check.summary.exercises[0].actual.totalReps, 12)
  // 입력 한계 상수는 W14와 같다.
  assert.equal(P.MAX_REPS, 999)
  assert.equal(P.MAX_WEIGHT_KG, 999)
  // W14 canProceedToResult가 넘기는 상태(타이머 사용 흔적)에서도 검증이 통과한다.
  const withTimer = {
    ...afterSave,
    timer: { accumulatedMs: 5000, runningSince: T0.toISOString() },
  }
  assert.equal(R.prepareResultSave(withTimer, draftOf(withTimer), NOW).ok, true)
})
