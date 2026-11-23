import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// S5: W15 운동 결과의 5가지 기록 방식 표시·편집·집계·저장 전 검증. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let View
let M
let WR
let V
let Input
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  View = (
    await server.ssrLoadModule('/src/components/exercise/result/ResultView.tsx')
  ).default
  M = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  WR = await server.ssrLoadModule('/src/exercise/workoutResult.ts')
  V = await server.ssrLoadModule('/src/exercise/workoutResultView.ts')
  Input = await server.ssrLoadModule('/src/exercise/setInput.ts')
})
after(async () => {
  await server?.close()
})

const T0 = new Date('2026-11-16T03:00:00.000Z')
const NOW = new Date('2026-11-16T04:00:00.000Z')
const pos = (itemIndex, setIndex) => ({ itemIndex, setIndex })
const plain = (value) => JSON.parse(JSON.stringify(value))

/** 0 reps, 1 weight, 2 time, 3 time_reps, 4 weight_time(2세트째는 목표 중량 없음). */
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
        sets: [{ targetSeconds: 60 }],
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
        exerciseNameSnapshot: '덤벨 수트케이스 캐리',
        recordType: 'weight_time',
        sets: [{ targetSeconds: 45, weightKg: 20 }, { targetSeconds: 45 }],
      },
    ],
  }
}
const DONE_VALUES = [
  [{ actualReps: 10 }, { actualReps: 8 }],
  [
    { actualReps: 10, actualWeightKg: 8 },
    { actualReps: 12, actualWeightKg: 10 },
  ],
  [{ measuredMs: 55_000 }],
  [
    { actualReps: 28, measuredMs: 58_000 },
    { actualReps: 30, measuredMs: 61_000 },
  ],
  [
    { actualWeightKg: 20, measuredMs: 44_000 },
    { actualWeightKg: 0, measuredMs: 46_500 },
  ],
]
function mkSession(over = {}, values = DONE_VALUES) {
  const base = M.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list: makeList(),
    now: T0,
  })
  const performed = values.map((sets) =>
    sets.map((set) => ({ completed: true, ...set })),
  )
  return { ...base, performed, ...over }
}
const draftOf = (session) => {
  const created = WR.createResultDraft(session)
  assert.equal(created.ok, true)
  return created.draft
}
const edit = (session, draft, e) =>
  WR.applyResultEdit(session.listSnapshot, draft, e)
const mustEdit = (session, draft, e) => {
  const r = edit(session, draft, e)
  assert.equal(r.ok, true, JSON.stringify(r))
  return r.draft
}

// ── 화면 유형·집계 ──────────────────────────────────────────
test('화면 유형: 시간 구성값이 있는 방식(time·time_reps·weight_time)이 하나라도 있으면 W15, 없으면 W15-1', () => {
  const snap = (...types) => ({
    items: types.map((recordType) => ({ recordType })),
  })
  assert.equal(WR.resultScreenType(snap('reps', 'weight')), 'W15-1')
  assert.equal(WR.resultScreenType(snap('time')), 'W15')
  assert.equal(WR.resultScreenType(snap('reps', 'time_reps')), 'W15')
  assert.equal(WR.resultScreenType(snap('weight', 'weight_time')), 'W15')
})

test('집계: 방식별 구성값만 행에 담고 합계는 횟수 합·시간 합, 중량은 세트별(최대) 표시', () => {
  const s = mkSession()
  const summary = WR.summarizeResult(s.listSnapshot, s.performed)
  const [reps, weight, time, timeReps, weightTime] = summary.exercises
  assert.equal(summary.screenType, 'W15')
  // time_reps: 횟수·시간만(중량 없음)
  assert.deepEqual(
    plain(
      timeReps.sets.map((r) => [r.actualReps, r.actualWeightKg, r.measuredMs]),
    ),
    [
      [28, null, 58_000],
      [30, null, 61_000],
    ],
  )
  assert.equal(timeReps.actual.totalReps, 58)
  assert.equal(timeReps.actual.measuredMs, 119_000)
  assert.equal(timeReps.actual.maxWeightKg, null)
  assert.equal(timeReps.target.totalReps, 60)
  assert.equal(timeReps.target.totalSeconds, 120)
  assert.equal(timeReps.target.maxWeightKg, null)
  // weight_time: 중량·시간만(횟수 없음). 0kg은 0이고 미입력(null)이 아니다.
  assert.deepEqual(
    plain(
      weightTime.sets.map((r) => [
        r.actualReps,
        r.actualWeightKg,
        r.measuredMs,
      ]),
    ),
    [
      [null, 20, 44_000],
      [null, 0, 46_500],
    ],
  )
  assert.equal(weightTime.actual.totalReps, null)
  assert.equal(weightTime.actual.maxWeightKg, 20)
  assert.equal(weightTime.actual.measuredMs, 90_500)
  assert.equal(weightTime.target.maxWeightKg, 20)
  assert.equal(weightTime.target.totalReps, null)
  // 기존 3종 집계는 그대로
  assert.equal(reps.actual.totalReps, 18)
  assert.equal(weight.actual.maxWeightKg, 10)
  assert.equal(time.actual.measuredMs, 55_000)
  // 전체 측정 시간 합계는 시간 구성값이 있는 모든 방식의 합
  assert.equal(summary.measuredMs, 55_000 + 119_000 + 90_500)
  assert.equal(summary.measuredSetCount, 5)
})

test('집계: 옛 기록의 빠진 값은 0으로 바뀌지 않고 null·미측정으로 남는다', () => {
  const s = mkSession({}, [
    [{ actualReps: 10 }, { actualReps: 8 }],
    [{ actualReps: 10 }, { actualReps: 12 }], // 중량 없음
    [{}], // 미측정
    [{ actualReps: 28 }, {}],
    [{ measuredMs: 44_000 }, { actualWeightKg: 5 }],
  ])
  const summary = WR.summarizeResult(s.listSnapshot, s.performed)
  const [, weight, time, timeReps, weightTime] = summary.exercises
  assert.equal(weight.actual.maxWeightKg, null)
  assert.equal(time.sets[0].timeStatus, 'unmeasured')
  assert.equal(time.actual.measuredMs, null)
  assert.equal(timeReps.sets[0].measuredMs, null)
  assert.equal(timeReps.sets[0].timeStatus, 'unmeasured')
  assert.equal(weightTime.sets[0].actualWeightKg, null)
  assert.equal(weightTime.sets[1].timeStatus, 'unmeasured')
})

// ── 표시 문구 ───────────────────────────────────────────────
test('표시: 구성값을 횟수 · 중량 · 시간 순서로 보이고 목표 중량이 없으면 중량 항목을 만들지 않는다(0kg 아님)', () => {
  const list = makeList()
  const label = (i, j) =>
    V.targetLabel(list.items[i].recordType, list.items[i].sets[j])
  assert.equal(label(0, 0), '10회')
  assert.equal(label(1, 0), '10회 · 8kg')
  assert.equal(label(1, 1), '12회')
  assert.equal(label(2, 0), '1분')
  assert.equal(label(3, 0), '30회 · 1분')
  assert.equal(label(4, 0), '20kg · 45초')
  assert.equal(label(4, 1), '45초') // 목표 중량 없음 → 0kg으로 보이지 않는다
  const actual = (type, set) =>
    V.actualLabel(type, {
      actualReps: null,
      actualWeightKg: null,
      measuredMs: null,
      ...set,
    })
  assert.equal(actual('time', { measuredMs: 55_000 }), '0:55')
  assert.equal(
    actual('time_reps', { actualReps: 28, measuredMs: 58_000 }),
    '28회 · 측정 0:58',
  )
  assert.equal(
    actual('weight_time', { actualWeightKg: 0, measuredMs: 46_500 }),
    '0kg · 측정 0:47',
  )
  // 빠진 값(옛 기록)은 미입력·미측정으로 표시
  assert.equal(
    actual('weight_time', { measuredMs: 1000 }),
    '중량 미입력 · 측정 0:01',
  )
  assert.equal(actual('time_reps', { actualReps: 3 }), '3회 · 측정 기록 없음')
  assert.equal(actual('weight', { actualReps: 10 }), '10회 · 중량 미입력')
})

test('카드: 복합 방식의 요약에 구성값이 모두 나온다', () => {
  const s = mkSession()
  const summary = WR.summarizeResult(s.listSnapshot, s.performed)
  const cards = V.cardsFromSummary(summary, s.performed, s.performed)
  const timeReps = cards[3]
  assert.equal(timeReps.targetSummary, '목표 2세트 · 합계 60회 · 합계 2분')
  assert.equal(timeReps.actualSummary, '합계 58회 · 측정 합계 1:59')
  const weightTime = cards[4]
  assert.equal(
    weightTime.targetSummary,
    '목표 2세트 · 최대 20kg · 합계 1분 30초',
  )
  assert.equal(weightTime.actualSummary, '최대 20kg · 측정 합계 1:31')
  assert.equal(weightTime.sets[1].actualText, '0kg · 측정 0:47')
  assert.equal(weightTime.sets[1].targetText, '45초')
  assert.equal(weightTime.sets[1].measuredMs, 46_500)
})

test('편집 입력 초기값: 시간은 초 단위로(소수는 밀리초까지)', () => {
  assert.equal(V.secondsInputOf(null), '')
  assert.equal(V.secondsInputOf(55_000), '55')
  assert.equal(V.secondsInputOf(46_500), '46.5')
  assert.equal(V.secondsInputOf(1), '0.001')
})

// ── 입력 검증 ───────────────────────────────────────────────
test('시간 입력 파서: 초·분:초·소수를 ms로, 1ms~24시간만 허용한다', () => {
  const ok = (raw) => Input.parseDurationInput(raw).value
  assert.equal(ok('55'), 55_000)
  assert.equal(ok(' 55.5 '), 55_500)
  assert.equal(ok('1:05'), 65_000)
  assert.equal(ok('90:00'), 5_400_000)
  assert.equal(ok('86400'), 86_400_000)
  assert.equal(ok('0.001'), 1)
  const reason = (raw) => Input.parseDurationInput(raw).reason
  assert.equal(reason(''), 'empty')
  assert.equal(reason('   '), 'empty')
  assert.equal(reason(undefined), 'empty')
  assert.equal(reason('0'), 'range')
  assert.equal(reason('86400.001'), 'range')
  assert.equal(reason('1:60'), 'format')
  assert.equal(reason('-1'), 'format')
  assert.equal(reason('1e3'), 'format')
  assert.equal(reason('1,5'), 'format')
  assert.equal(reason('0.0001'), 'format')
  assert.equal(reason(Number.NaN), 'format')
  assert.equal(reason(Number.POSITIVE_INFINITY), 'format')
})

test('편집 입력 검증: 그 방식의 구성값만 확인하고 모두 필수다(0kg은 직접 입력)', () => {
  const v = (type, raw) => V.validateSetFields(type, raw)
  assert.deepEqual(
    plain(v('time_reps', { reps: '28', weightKg: '', measuredMs: '58' })),
    { ok: true, reps: 28, measuredMs: 58_000 },
  )
  assert.deepEqual(
    plain(v('weight_time', { reps: '', weightKg: '0', measuredMs: '1:02' })),
    { ok: true, weightKg: 0, measuredMs: 62_000 },
  )
  // 필수값 누락
  const miss = v('weight_time', { reps: '', weightKg: '', measuredMs: '' })
  assert.equal(miss.ok, false)
  assert.ok(miss.errors.weightKg && miss.errors.measuredMs)
  assert.equal(miss.errors.reps, undefined)
  const missReps = v('time_reps', { reps: '', weightKg: '', measuredMs: '5' })
  assert.deepEqual(Object.keys(missReps.errors), ['reps'])
  // 잘못된 값
  assert.ok(v('reps', { reps: '0', weightKg: '', measuredMs: '' }).errors.reps)
  assert.ok(
    v('weight', { reps: '5', weightKg: '2.55', measuredMs: '' }).errors
      .weightKg,
  )
  assert.ok(
    v('time', { reps: '', weightKg: '', measuredMs: '0' }).errors.measuredMs,
  )
  assert.ok(
    v('time', { reps: '', weightKg: '', measuredMs: 'abc' }).errors.measuredMs,
  )
  // 시간형·횟수형은 다른 입력이 있어도 보지 않는다
  assert.deepEqual(
    plain(v('reps', { reps: '5', weightKg: 'zzz', measuredMs: 'zzz' })),
    { ok: true, reps: 5 },
  )
})

// ── 결과 편집 ───────────────────────────────────────────────
test('편집: 5가지 방식 각각 구성값을 고치고, 고치지 않은 값·다른 세트는 그대로 둔다', () => {
  const s = mkSession()
  let draft = draftOf(s)
  draft = mustEdit(s, draft, { kind: 'reps', position: pos(0, 0), value: 12 })
  draft = mustEdit(s, draft, {
    kind: 'values',
    position: pos(1, 0),
    reps: 9,
    weightKg: '9.5',
  })
  draft = mustEdit(s, draft, {
    kind: 'measuredMs',
    position: pos(2, 0),
    value: '1:00',
  })
  draft = mustEdit(s, draft, {
    kind: 'values',
    position: pos(3, 0),
    reps: 25,
    measuredMs: '61.5',
  })
  draft = mustEdit(s, draft, {
    kind: 'values',
    position: pos(4, 1),
    weightKg: '2.5',
    measuredMs: 50,
  })
  assert.deepEqual(plain(draft.performed[0][0]), {
    completed: true,
    actualReps: 12,
  })
  assert.deepEqual(plain(draft.performed[1][0]), {
    completed: true,
    actualReps: 9,
    actualWeightKg: 9.5,
  })
  assert.deepEqual(plain(draft.performed[2][0]), {
    completed: true,
    measuredMs: 60_000,
  })
  assert.deepEqual(plain(draft.performed[3][0]), {
    completed: true,
    actualReps: 25,
    measuredMs: 61_500,
  })
  assert.deepEqual(plain(draft.performed[4][1]), {
    completed: true,
    actualWeightKg: 2.5,
    measuredMs: 50_000,
  })
  // 손대지 않은 세트
  assert.deepEqual(plain(draft.performed[3][1]), plain(s.performed[3][1]))
  assert.deepEqual(plain(draft.performed[4][0]), plain(s.performed[4][0]))
  // 일부 값만 고치면(시간+횟수형의 횟수만) 시간은 유지
  const partial = mustEdit(s, draftOf(s), {
    kind: 'reps',
    position: pos(3, 1),
    value: 29,
  })
  assert.deepEqual(plain(partial.performed[3][1]), {
    completed: true,
    actualReps: 29,
    measuredMs: 61_000,
  })
  // 세션 원본은 바뀌지 않는다
  assert.deepEqual(plain(s.performed), plain(mkSession().performed))
})

test('편집 거부: 방식에 없는 값, 잘못된 값, 누락 — 초안은 바뀌지 않고 사유를 돌려준다', () => {
  const s = mkSession()
  const draft = draftOf(s)
  const reason = (e) => {
    const r = edit(s, draft, e)
    assert.equal(r.ok, false)
    return [r.reason, r.detail]
  }
  // 방식에 없는 값
  assert.deepEqual(
    reason({ kind: 'weightKg', position: pos(3, 0), value: 5 }),
    ['notApplicable', undefined],
  )
  assert.deepEqual(reason({ kind: 'reps', position: pos(4, 0), value: 5 }), [
    'notApplicable',
    undefined,
  ])
  assert.deepEqual(
    reason({ kind: 'measuredMs', position: pos(1, 0), value: 5 }),
    ['notApplicable', undefined],
  )
  assert.deepEqual(
    reason({ kind: 'values', position: pos(3, 0), reps: 5, weightKg: 5 }),
    ['notApplicable', undefined],
  )
  // 잘못된 값
  assert.deepEqual(reason({ kind: 'reps', position: pos(3, 0), value: 0 }), [
    'invalidReps',
    'range',
  ])
  assert.deepEqual(reason({ kind: 'reps', position: pos(3, 0), value: '' }), [
    'invalidReps',
    'empty',
  ])
  assert.deepEqual(
    reason({ kind: 'weightKg', position: pos(4, 0), value: '1.55' }),
    ['invalidWeight', 'decimals'],
  )
  assert.deepEqual(
    reason({ kind: 'weightKg', position: pos(4, 0), value: '' }),
    ['invalidWeight', 'empty'],
  )
  assert.deepEqual(
    reason({ kind: 'weightKg', position: pos(4, 0), value: -1 }),
    ['invalidWeight', 'range'],
  )
  assert.deepEqual(
    reason({ kind: 'weightKg', position: pos(4, 0), value: 1000 }),
    ['invalidWeight', 'range'],
  )
  assert.deepEqual(
    reason({ kind: 'measuredMs', position: pos(4, 0), value: 0 }),
    ['invalidMeasured', 'range'],
  )
  assert.deepEqual(
    reason({ kind: 'measuredMs', position: pos(4, 0), value: 'x' }),
    ['invalidMeasured', 'format'],
  )
  // values 편집은 하나라도 틀리면 아무것도 바꾸지 않는다
  assert.deepEqual(
    reason({ kind: 'values', position: pos(3, 0), reps: 30, measuredMs: '0' }),
    ['invalidMeasured', 'range'],
  )
  // 미완료 세트는 고칠 수 없다
  const incomplete = mkSession(
    {},
    DONE_VALUES.map((sets, i) => (i === 3 ? [sets[0], {}] : sets)),
  )
  incomplete.performed[3][1] = { completed: false }
  const d2 = draftOf(incomplete)
  assert.equal(
    edit(incomplete, d2, { kind: 'reps', position: pos(3, 1), value: 5 })
      .reason,
    'setNotCompleted',
  )
  // 옛 세션의 값 없는 세트에 일부 값만 values로 고치면 A안 위반(invalidSet)
  const legacy = mkSession(
    {},
    DONE_VALUES.map((sets, i) =>
      i === 3 ? [{ actualReps: 28 }, sets[1]] : sets,
    ),
  )
  const ld = draftOf(legacy)
  const bad = edit(legacy, ld, {
    kind: 'values',
    position: pos(3, 0),
    reps: 20,
  })
  assert.equal(bad.reason, 'invalidSet')
  assert.deepEqual(plain(bad.issues), [
    { field: 'measuredMs', reason: 'missing' },
  ])
})

// ── 저장 전 검증(A안) ───────────────────────────────────────
test('저장 전 검증: 5가지 방식의 완료 세트가 정상이면 saveProgress 입력으로 변환되고 기록 요약과 일치한다', () => {
  const s = mkSession()
  const check = WR.prepareResultSave(s, draftOf(s), NOW)
  assert.equal(check.ok, true, JSON.stringify(check))
  assert.equal(check.changed, false)
  // 편집 후에도 통과
  const edited = mustEdit(s, draftOf(s), {
    kind: 'values',
    position: pos(3, 0),
    reps: 25,
    measuredMs: '70',
  })
  const c2 = WR.prepareResultSave(s, edited, NOW)
  assert.equal(c2.ok, true)
  assert.equal(c2.changed, true)
  assert.deepEqual(plain(c2.input.performed[3][0]), {
    completed: true,
    actualReps: 25,
    measuredMs: 70_000,
  })
})

test('저장 전 검증: 구성값이 빠진 완료 세트(옛 세션)는 저장할 수 없고 어느 세트인지 알려 준다. 값을 입력하면 저장된다', () => {
  const legacy = mkSession(
    {},
    DONE_VALUES.map((sets, i) =>
      i === 4 ? [sets[0], { actualWeightKg: 5 }] : i === 2 ? [{}] : sets,
    ),
  )
  const check = WR.prepareResultSave(legacy, draftOf(legacy), NOW)
  assert.equal(check.ok, false)
  const where = check.issues.map((i) => [i.reason, i.itemIndex, i.setIndex])
  assert.deepEqual(where, [
    ['invalidValue', 2, 0],
    ['invalidValue', 4, 1],
  ])
  assert.match(
    check.issues[0].message,
    /플랭크 1세트: 측정 시간을 입력해 주세요/,
  )
  assert.match(
    check.issues[1].message,
    /수트케이스 캐리 2세트: 측정 시간을 입력해 주세요/,
  )
  // 값을 입력하면 저장 가능
  let draft = draftOf(legacy)
  draft = mustEdit(legacy, draft, {
    kind: 'measuredMs',
    position: pos(2, 0),
    value: 30,
  })
  draft = mustEdit(legacy, draft, {
    kind: 'measuredMs',
    position: pos(4, 1),
    value: 30,
  })
  assert.equal(WR.prepareResultSave(legacy, draft, NOW).ok, true)
  // 또는 완료를 해제하면 저장 가능
  let drop = draftOf(legacy)
  drop = mustEdit(legacy, drop, { kind: 'uncomplete', position: pos(2, 0) })
  drop = mustEdit(legacy, drop, { kind: 'uncomplete', position: pos(4, 1) })
  assert.equal(WR.prepareResultSave(legacy, drop, NOW).ok, true)
})

test('저장 전 검증: 초안을 직접 위조해도(방식에 없는 값·범위 밖 값) 막는다', () => {
  const s = mkSession()
  const forge = (i, j, set) => {
    const d = draftOf(s)
    return {
      base: d.base,
      performed: d.performed.map((sets, a) =>
        sets.map((x, b) => (a === i && b === j ? set : { ...x })),
      ),
    }
  }
  const reasons = (draft) => {
    const c = WR.prepareResultSave(s, draft, NOW)
    assert.equal(c.ok, false)
    return c.issues.map((x) => x.reason)
  }
  assert.deepEqual(
    reasons(
      forge(3, 0, {
        completed: true,
        actualReps: 28,
        measuredMs: 1000,
        actualWeightKg: 5,
      }),
    ),
    ['forbiddenChange'],
  )
  assert.deepEqual(
    reasons(
      forge(4, 0, {
        completed: true,
        actualReps: 3,
        actualWeightKg: 5,
        measuredMs: 1000,
      }),
    ),
    ['forbiddenChange'],
  )
  assert.deepEqual(
    reasons(
      forge(3, 0, { completed: true, actualReps: 1000, measuredMs: 1000 }),
    ),
    ['invalidValue'],
  )
  assert.deepEqual(
    reasons(
      forge(4, 0, { completed: true, actualWeightKg: 8.25, measuredMs: 1000 }),
    ),
    ['invalidValue'],
  )
})

// ── 완료 기록 ───────────────────────────────────────────────
test('완료 기록: 복합 방식의 실제 값·세트 번호·방식 코드가 정확히 담기고 weight 코드는 그대로다', () => {
  const s = mkSession()
  const record = M.buildWorkoutRecord({ id: 'r1', session: s, now: NOW })
  assert.notEqual(M.parseWorkoutRecord(plain(record)), null)
  const byType = Object.fromEntries(
    record.exercises.map((e) => [e.recordType, e]),
  )
  assert.deepEqual(Object.keys(byType).sort(), [
    'reps',
    'time',
    'time_reps',
    'weight',
    'weight_time',
  ])
  assert.ok(!('weight_reps' in byType))
  assert.deepEqual(
    plain(
      byType.time_reps.completedSets.map((x) => [
        x.setNumber,
        x.actualReps,
        x.measuredMs,
        'actualWeightKg' in x,
      ]),
    ),
    [
      [1, 28, 58_000, false],
      [2, 30, 61_000, false],
    ],
  )
  assert.deepEqual(
    plain(
      byType.weight_time.completedSets.map((x) => [
        x.setNumber,
        x.actualWeightKg,
        x.measuredMs,
        'actualReps' in x,
      ]),
    ),
    [
      [1, 20, 44_000, false],
      [2, 0, 46_500, false],
    ],
  )
  assert.equal(record.totals.measuredMs, 55_000 + 119_000 + 90_500)
  assert.equal(record.totals.completedSetCount, 9)
  assert.equal(record.totals.plannedSetCount, 9)
  // 미완료 세트는 기록에서 빠진다(번호는 유지)
  const partial = mkSession({}, DONE_VALUES)
  partial.performed[3][0] = { completed: false }
  const r2 = M.buildWorkoutRecord({ id: 'r2', session: partial, now: NOW })
  const tr = r2.exercises.find((e) => e.recordType === 'time_reps')
  assert.deepEqual(plain(tr.completedSets.map((x) => x.setNumber)), [2])
  assert.equal(tr.plannedSetCount, 2)
})

test('기록 읽기 호환: 옛 기록(중량 없음·미측정)과 복합 기록이 모두 계속 읽히고 읽기 경로는 A안을 요구하지 않는다', () => {
  const legacy = mkSession(
    {},
    DONE_VALUES.map((sets, i) =>
      i === 1
        ? [{ actualReps: 10 }, { actualReps: 12 }]
        : i === 2
          ? [{}]
          : i === 4
            ? [{ measuredMs: 1000 }, { actualWeightKg: 3 }]
            : sets,
    ),
  )
  const record = M.buildWorkoutRecord({ id: 'r', session: legacy, now: NOW })
  const parsed = M.parseWorkoutRecord(plain(record))
  assert.notEqual(parsed, null)
  // 읽기 전용 카드: 빠진 값은 미입력·미측정으로 표시, 0으로 바뀌지 않는다
  const cards = V.cardsFromRecord(parsed)
  assert.equal(cards[1].sets[0].actualText, '10회 · 중량 미입력')
  assert.equal(cards[2].sets[0].actualText, '측정 기록 없음')
  assert.equal(cards[2].sets[0].timeStatus, 'unmeasured')
  assert.equal(cards[4].sets[0].actualText, '중량 미입력 · 측정 0:01')
  assert.equal(cards[4].sets[1].actualText, '3kg · 측정 기록 없음')
  // 복합 기록 카드
  const full = M.parseWorkoutRecord(
    plain(M.buildWorkoutRecord({ id: 'r', session: mkSession(), now: NOW })),
  )
  const fc = V.cardsFromRecord(full)
  assert.equal(fc[3].actualSummary, '합계 58회 · 측정 합계 1:59')
  assert.equal(fc[4].sets[1].actualText, '0kg · 측정 0:47')
  assert.equal(fc[3].sets[0].timeStatus, 'measured')
})

// ── 화면 렌더링 ─────────────────────────────────────────────
function ready(s, draft) {
  const summary = WR.summarizeResult(s.listSnapshot, draft.performed)
  return {
    load: { status: 'ready' },
    sessionId: s.id,
    session: s,
    draft,
    summary,
    screenType: summary.screenType,
    hasChanges: WR.hasResultChanges(draft),
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
    canSubmit: !summary.noneCompleted,
  }
}
const actions = new Proxy({}, { get: () => noop })
const render = (snapshot, props = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(View, {
        snapshot,
        editor: null,
        panel: null,
        failureDismissed: false,
        actions,
        ...props,
      }),
    ),
  )

test('화면: 복합 방식 카드에 방식 이름·목표·실제 구성값이 모두 보이고 모든 완료 세트에 수정 버튼이 있다', () => {
  const s = mkSession()
  const html = render(ready(s, draftOf(s)))
  assert.match(html, /시간\+횟수형/)
  assert.match(html, /중량\+시간형/)
  assert.match(html, /<dt[^>]*>목표<\/dt><dd[^>]*>30회 · 1분<\/dd>/)
  assert.match(html, /<dt[^>]*>실제<\/dt><dd[^>]*>28회 · 측정 0:58<\/dd>/)
  assert.match(html, /<dt[^>]*>목표<\/dt><dd[^>]*>20kg · 45초<\/dd>/)
  assert.match(html, /<dt[^>]*>실제<\/dt><dd[^>]*>0kg · 측정 0:47<\/dd>/)
  assert.match(html, /<dt[^>]*>목표<\/dt><dd[^>]*>45초<\/dd>/) // 목표 중량 없음
  assert.match(html, /점핑 잭 1세트 실제 값 수정/)
  assert.match(html, /덤벨 수트케이스 캐리 2세트 실제 값 수정/)
  assert.match(html, /측정 시간 합계 4:25/)
})

test('화면: 편집 폼은 방식의 구성값 입력만 보인다(시간+횟수형: 횟수·시간, 중량+시간형: 중량·시간, 시간형: 시간)', () => {
  const s = mkSession()
  const editorFor = (itemIndex, setIndex, over = {}) => ({
    itemIndex,
    setIndex,
    reps: '',
    weightKg: '',
    measuredMs: '',
    errors: {},
    ...over,
  })
  const tr = render(ready(s, draftOf(s)), {
    editor: editorFor(3, 0, { reps: '28', measuredMs: '58' }),
  })
  assert.match(tr, /result-reps-3-0/)
  assert.match(tr, /result-measured-3-0/)
  assert.doesNotMatch(tr, /result-weight-3-0/)
  assert.match(
    tr,
    /<label for="result-measured-3-0"[^>]*>실제 측정 시간 \(초 또는 분:초\)/,
  )
  assert.match(tr, /id="result-measured-3-0"[^>]*value="58"/)
  const wt = render(ready(s, draftOf(s)), {
    editor: editorFor(4, 1, { weightKg: '0', measuredMs: '46.5' }),
  })
  assert.match(wt, /result-weight-4-1/)
  assert.match(wt, /result-measured-4-1/)
  assert.doesNotMatch(wt, /result-reps-4-1/)
  assert.match(wt, /id="result-weight-4-1"[^>]*value="0"/)
  const t = render(ready(s, draftOf(s)), {
    editor: editorFor(2, 0, { measuredMs: '55' }),
  })
  assert.match(t, /result-measured-2-0/)
  assert.doesNotMatch(t, /result-reps-2-0|result-weight-2-0/)
  // 오류는 해당 입력에 연결된다
  const err = render(ready(s, draftOf(s)), {
    editor: editorFor(3, 0, {
      reps: '28',
      measuredMs: '0',
      errors: { measuredMs: '측정 시간은 0보다 크고 24시간 이하여야 해요.' },
    }),
  })
  assert.match(
    err,
    /id="result-measured-3-0"[^>]*aria-invalid="true"[^>]*aria-describedby="result-measured-error-3-0 result-measured-help-3-0"/,
  )
  assert.match(
    err,
    /id="result-measured-error-3-0" role="alert"[^>]*>측정 시간은 0보다 크고/,
  )
})

test('화면: 옛 세션의 미측정·중량 없는 완료 세트는 저장 전에 입력하거나 해제해야 함을 알린다', () => {
  const legacy = mkSession(
    {},
    DONE_VALUES.map((sets, i) =>
      i === 3 ? [{ actualReps: 28 }, sets[1]] : sets,
    ),
  )
  const html = render(ready(legacy, draftOf(legacy)))
  assert.match(
    html,
    /실제 기록이 빠졌어요 \(측정 시간\)\. 저장하려면 입력하거나 완료를 해제해 주세요/,
  )
  assert.match(html, /28회 · 측정 기록 없음/)
})

test('화면: 저장된 기록(읽기 전용)은 복합 방식도 구성값을 보이고 수정 컨트롤이 없다', () => {
  const full = M.parseWorkoutRecord(
    plain(M.buildWorkoutRecord({ id: 'r', session: mkSession(), now: NOW })),
  )
  const html = render(
    {
      ...ready(mkSession(), draftOf(mkSession())),
      load: { status: 'completed' },
      record: full,
      draft: null,
      summary: null,
      session: null,
      alreadyCompleted: true,
    },
    {},
  )
  assert.match(html, /28회 · 측정 0:58/)
  assert.match(html, /0kg · 측정 0:47/)
  assert.doesNotMatch(html, /실제 값 수정/)
  assert.match(html, /측정 시간 합계 4:25/)
})

// ── 최종 저장 경로(소스 확인) ────────────────────────────────
test('최종 저장 경로: 저장소 complete는 신규 기록의 완료 세트에 A안을 다시 적용하고 읽기 경로에는 없다', () => {
  const repo = readFileSync(
    new URL(
      '../src/exercise/local/indexedDbWorkoutRepositories.ts',
      import.meta.url,
    ),
    'utf8',
  )
  const complete = repo.slice(
    repo.indexOf('async complete('),
    repo.indexOf('async abandon('),
  )
  assert.match(complete, /validateNewCompletedSet/)
  // 이미 완료된 세션을 멱등으로 돌려주는 분기는 검증 호출보다 먼저 반환한다(과거 기록은 소급 검증하지 않는다).
  assert.ok(
    complete.indexOf('created: false') <
      complete.indexOf('validateNewCompletedSet'),
  )
  const model = readFileSync(
    new URL('../src/exercise/workoutModel.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(model, /validateNewCompletedSet/)
  // 스키마 버전은 바뀌지 않았다.
  assert.equal(
    readFileSync(
      new URL('../src/exercise/workoutTypes.ts', import.meta.url),
      'utf8',
    ).includes('export const WORKOUT_SCHEMA_VERSION = 1'),
    true,
  )
})
