import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// 월간 몸무게 기록의 날짜 계산·상태 판단·Mock 저장소 검증. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let dates
let status
let types
let repoMod
let goalMod
let storage
let writes // 실패 주입: 허용된 쓰기 횟수(null이면 제한 없음)
let failKeys // 이 키에 쓰면 실패

const U = 'a'
const LOG = (owner) => `mealthroutine.dev.mock.weightLog.${owner}`
const BODY = (owner) => `mealthroutine.dev.mock.body.${owner}`
const GOAL = (owner) => `mealthroutine.dev.exercise-goal.value.${owner}`
const FLAG = (name) => `mealthroutine.dev.mock.flag.${name}`
const META = { ownerId: U, age: 33, sex: 'female' }
const T0 = '2026-11-13T03:00:00.000Z' // 서울 2026-11-13 12:00

function createStorage() {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failKeys.has(key)) throw new Error('quota')
      if (writes !== null) {
        if (writes <= 0) throw new Error('quota')
        writes -= 1
      }
      data.set(key, value)
    },
    removeItem: (key) => {
      if (writes !== null && writes <= 0) throw new Error('quota')
      data.delete(key)
    },
  }
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  dates = await server.ssrLoadModule('/src/weight-log/weightDate.ts')
  status = await server.ssrLoadModule('/src/weight-log/weightLogStatus.ts')
  types = await server.ssrLoadModule('/src/weight-log/weightLogTypes.ts')
  repoMod = await server.ssrLoadModule(
    '/src/weight-log/mock/mockWeightLogRepository.ts',
  )
  goalMod = await server.ssrLoadModule(
    '/src/exercise-goal/local/localExerciseGoalRepository.ts',
  )
})
after(async () => {
  await server?.close()
})
beforeEach(() => {
  writes = null
  failKeys = new Set()
  storage = createStorage()
  globalThis.window = { localStorage: storage }
})

let clock
let seq
const repo = (owner = U, at = T0) => {
  clock = new Date(at)
  seq = 0
  return repoMod.createMockWeightLogRepository({
    userId: owner,
    latencyMs: 0,
    now: () => clock,
    newId: () => `${owner}-${++seq}-${Math.random().toString(36).slice(2, 6)}`,
  })
}
const putBody = (owner, value) =>
  storage.setItem(
    BODY(owner),
    typeof value === 'string' ? value : JSON.stringify(value),
  )
const body = (extra = {}) => ({
  v: 1,
  heightCm: 161,
  weightKg: 64,
  updatedAt: '2026-10-01T00:00:00.000Z',
  exerciseGoalProfile: META,
  ...extra,
})
const log = (owner = U) => JSON.parse(storage.getItem(LOG(owner)))
const bodyOf = (owner = U) => JSON.parse(storage.getItem(BODY(owner)))
const snapshot = () => new Map(storage.data)
const code = (expected) => (error) =>
  error instanceof types.WeightLogError && error.code === expected
const entry = (o = {}) => ({
  id: 'e1',
  userId: U,
  recordedOn: '2026-10-13',
  weightKg: 64,
  kind: 'initial',
  createdAt: '2026-10-13T03:00:00.000Z',
  ...o,
})
const putLog = (entries, owner = U) =>
  storage.setItem(LOG(owner), JSON.stringify({ v: 1, ownerId: owner, entries }))

// ── 1. 날짜 계산 ────────────────────────────────────────────────────
test('달력 기준 1개월 뒤: 말일 보정·윤년·연도 넘김', () => {
  const add = (d) => dates.addCalendarMonths(d, 1)
  assert.equal(add('2026-01-31'), '2026-02-28')
  assert.equal(add('2028-01-31'), '2028-02-29') // 윤년
  assert.equal(add('2028-02-29'), '2028-03-29')
  assert.equal(add('2000-01-31'), '2000-02-29') // 400으로 나누어떨어지는 윤년
  assert.equal(add('2100-01-31'), '2100-02-28') // 100으로 나누어떨어지는 평년
  assert.equal(add('2026-03-31'), '2026-04-30')
  assert.equal(add('2026-08-31'), '2026-09-30')
  assert.equal(add('2026-05-15'), '2026-06-15')
  assert.equal(add('2026-12-15'), '2027-01-15')
  assert.equal(add('2026-12-31'), '2027-01-31')
  assert.equal(add('2026-11-30'), '2026-12-30')
})

test('잘못된 날짜와 형식은 거부한다', () => {
  for (const bad of [
    '2026-02-30',
    '2027-02-29',
    '2026-13-01',
    '2026-00-10',
    '2026-04-31',
    '2026-1-1',
    '20260101',
    '2026-01-01T00:00:00Z',
    '1800-01-01',
    '',
    null,
    undefined,
    20260101,
  ]) {
    assert.equal(dates.isValidIsoDate(bad), false, String(bad))
    assert.equal(dates.addCalendarMonths(bad, 1), null, String(bad))
  }
  assert.equal(dates.isValidIsoDate('2028-02-29'), true)
  assert.equal(dates.addCalendarMonths('2026-01-31', 0.5), null)
})

test('서울 기준 날짜 경계: 한국 시간 자정에 날짜가 바뀐다', () => {
  const day = (iso) => dates.seoulToday(new Date(iso))
  assert.equal(day('2026-11-12T14:59:59.999Z'), '2026-11-12')
  assert.equal(day('2026-11-12T15:00:00.000Z'), '2026-11-13')
  assert.equal(day('2026-12-31T14:59:59Z'), '2026-12-31')
  assert.equal(day('2026-12-31T15:00:00Z'), '2027-01-01')
  assert.equal(day('2027-02-28T15:00:00Z'), '2027-03-01')
  assert.equal(day('2028-02-28T15:00:00Z'), '2028-02-29')
  assert.equal(dates.seoulToday(new Date('invalid')), null)
})

test('서울 기준 날짜는 기기의 시간대와 무관하다', () => {
  const original = process.env.TZ
  try {
    for (const tz of [
      'America/Los_Angeles',
      'Pacific/Kiritimati',
      'UTC',
      'Asia/Tokyo',
    ]) {
      process.env.TZ = tz
      assert.equal(
        dates.seoulToday(new Date('2026-11-12T14:59:59Z')),
        '2026-11-12',
        tz,
      )
      assert.equal(
        dates.seoulToday(new Date('2026-11-12T15:00:00Z')),
        '2026-11-13',
        tz,
      )
      assert.equal(dates.addCalendarMonths('2026-01-31', 1), '2026-02-28', tz)
    }
  } finally {
    if (original === undefined) delete process.env.TZ
    else process.env.TZ = original
  }
})

// ── 2. 확인 상태 계산 ───────────────────────────────────────────────
const at = (iso) => new Date(iso)
const compute = (entries, currentWeightKg, iso) =>
  status.computeWeightCheckStatus({ entries, currentWeightKg, now: at(iso) })

test('다음 확인일 전에는 확인이 필요하지 않고 당일부터 필요하다', () => {
  const entries = [entry({ recordedOn: '2026-01-31' })]
  const before = compute(entries, 64, '2026-02-26T15:00:00Z') // 서울 2/27
  assert.equal(before.nextDueOn, '2026-02-28')
  assert.equal(before.needsCheck, false)
  assert.equal(before.reason, 'not-due')
  const day = compute(entries, 64, '2026-02-27T15:00:00Z') // 서울 2/28
  assert.equal(day.needsCheck, true)
  assert.equal(day.reason, 'due')
  assert.equal(compute(entries, 64, '2026-03-20T00:00:00Z').needsCheck, true)
})

test('한국 시간 자정 경계에서 확인일 판단이 바뀐다', () => {
  const entries = [entry({ recordedOn: '2026-10-13' })]
  assert.equal(compute(entries, 64, '2026-11-12T14:59:59Z').needsCheck, false)
  assert.equal(compute(entries, 64, '2026-11-12T15:00:00Z').needsCheck, true)
  const year = [entry({ recordedOn: '2026-12-15' })]
  assert.equal(compute(year, 64, '2027-01-14T14:59:59Z').needsCheck, false)
  assert.equal(compute(year, 64, '2027-01-14T15:00:00Z').needsCheck, true)
})

test('이력이 없으면 확인 안내를 만들지 않고, 기존 몸무게는 기록일을 모른다고만 알린다', () => {
  const none = compute([], null, T0)
  assert.deepEqual(
    {
      r: none.reason,
      n: none.needsCheck,
      l: none.legacyWeightUndated,
      c: none.consistent,
    },
    { r: 'no-history', n: false, l: false, c: true },
  )
  assert.equal(none.lastRecordedOn, null)
  assert.equal(none.nextDueOn, null)
  const legacy = compute([], 64, T0)
  assert.equal(legacy.legacyWeightUndated, true)
  assert.equal(legacy.needsCheck, false)
})

test('마지막 기록일이 오늘보다 늦으면 다음 확인일을 계산하지 않는다', () => {
  const s = compute([entry({ recordedOn: '2026-12-01' })], 64, T0)
  assert.equal(s.reason, 'future-date')
  assert.equal(s.nextDueOn, null)
  assert.equal(s.needsCheck, false)
  assert.equal(s.lastRecordedOn, '2026-12-01')
})

test('가장 최근 기록은 기록일, 생성 시각 순으로 정한다(저장 순서와 무관)', () => {
  const a = entry({ id: 'a', recordedOn: '2026-10-01', weightKg: 60 })
  const b = entry({ id: 'b', recordedOn: '2026-10-20', weightKg: 61 })
  const c = entry({
    id: 'c',
    recordedOn: '2026-10-20',
    weightKg: 62,
    createdAt: '2026-10-20T09:00:00.000Z',
  })
  assert.equal(status.latestWeightEntry([c, a, b]).id, 'c')
  assert.equal(status.latestWeightEntry([b, c, a]).id, 'c')
  assert.equal(status.latestWeightEntry([]), null)
})

test('상태에는 몸무게 수치가 없고 일치 여부만 있다', () => {
  const s = compute(
    [entry({ weightKg: 73.4, recordedOn: '2026-10-13' })],
    73.4,
    T0,
  )
  assert.equal(s.consistent, true)
  assert.doesNotMatch(JSON.stringify(s), /73\.4/)
  assert.equal(compute([entry({ weightKg: 73.4 })], 70, T0).consistent, false)
  assert.equal(compute([entry({ weightKg: 73.4 })], null, T0).consistent, false)
})

// ── 3. 저장소: 기록 추가 ────────────────────────────────────────────
test('최초 기록: 이력이 생기고 현재 몸무게가 갱신되며 수치 없는 상태를 돌려준다', async () => {
  putBody(U, { v: 1, heightCm: 161, updatedAt: '2026-10-01T00:00:00.000Z' })
  const r = repo()
  const s = await r.logWeight({ weightKg: 64.5 })
  assert.equal(s.lastRecordedOn, '2026-11-13')
  assert.equal(s.nextDueOn, '2026-12-13')
  assert.equal(s.needsCheck, false)
  assert.equal(s.consistent, true)
  assert.equal(s.legacyWeightUndated, false)
  assert.doesNotMatch(JSON.stringify(s), /64\.5/)
  const stored = log()
  assert.equal(stored.entries.length, 1)
  assert.deepEqual(
    { ...stored.entries[0], id: 'x' },
    {
      id: 'x',
      userId: U,
      recordedOn: '2026-11-13',
      weightKg: 64.5,
      kind: 'initial',
      createdAt: T0,
    },
  )
  assert.equal(bodyOf().weightKg, 64.5)
  assert.equal(bodyOf().heightCm, 161)
  assert.equal(bodyOf().updatedAt, T0)
})

test('이력이 없고 신체 정보도 없던 계정도 첫 기록을 남길 수 있다', async () => {
  const r = repo()
  await r.logWeight({ weightKg: 60 })
  assert.deepEqual(bodyOf(), { v: 1, weightKg: 60, updatedAt: T0 })
  assert.equal(log().entries[0].kind, 'initial')
})

test('두 번째 기록은 이력에 추가되고 마지막 기록일과 다음 확인일이 갱신된다', async () => {
  const r = repo()
  await r.logWeight({ weightKg: 64 })
  clock = new Date('2026-12-14T03:00:00.000Z')
  const s = await r.logWeight({ weightKg: 62.3 })
  assert.equal(log().entries.length, 2)
  assert.equal(log().entries[1].kind, 'recorded')
  assert.equal(s.lastRecordedOn, '2026-12-14')
  assert.equal(s.nextDueOn, '2027-01-14')
  assert.equal(bodyOf().weightKg, 62.3)
  assert.equal(log().entries[0].weightKg, 64) // 이전 기록은 그대로
})

test('같은 몸무게를 다시 기록해도 새 이력이 추가되고 다음 확인일이 갱신된다', async () => {
  const r = repo()
  await r.logWeight({ weightKg: 64 })
  clock = new Date('2026-12-13T03:00:00.000Z')
  const s = await r.logWeight({ weightKg: 64 })
  assert.equal(log().entries.length, 2)
  assert.equal(log().entries[1].weightKg, 64)
  assert.equal(log().entries[1].kind, 'recorded')
  assert.equal(s.lastRecordedOn, '2026-12-13')
  assert.equal(s.nextDueOn, '2027-01-13')
  assert.equal(new Set(log().entries.map((e) => e.id)).size, 2)
})

test('"지난번과 같아요"는 저장소가 값을 복사해 새 이력을 만든다', async () => {
  const r = repo()
  await r.logWeight({ weightKg: 64 })
  clock = new Date('2026-12-13T03:00:00.000Z')
  const s = await r.logWeight({ sameAsLast: true })
  const last = log().entries[1]
  assert.equal(last.kind, 'same-as-last')
  assert.equal(last.weightKg, 64)
  assert.equal(bodyOf().weightKg, 64)
  assert.equal(s.lastRecordedOn, '2026-12-13')
  assert.doesNotMatch(JSON.stringify(s), /64/)
})

test('"지난번과 같아요"는 복사할 기록이 없거나 기준이 불확실하면 거부한다', async () => {
  const r = repo()
  await assert.rejects(r.logWeight({ sameAsLast: true }), code('noPrevious'))
  putBody(U, body({ weightKg: 70 })) // 기록일을 모르는 기존 값
  await assert.rejects(r.logWeight({ sameAsLast: true }), code('noPrevious'))
  assert.equal(storage.getItem(LOG(U)), null)
  // 이력을 거치지 않고 몸무게가 바뀐 불일치 상태
  await r.logWeight({ weightKg: 64 })
  putBody(U, { ...bodyOf(), weightKg: 66 })
  const before = snapshot()
  await assert.rejects(r.logWeight({ sameAsLast: true }), code('inconsistent'))
  assert.deepEqual(snapshot(), before)
  assert.equal((await r.getCheckStatus()).consistent, false)
  // 값을 직접 입력하면 새 기록이 기준이 되어 일치 상태로 돌아온다(임의 복구가 아니라 사용자의 기록)
  const s = await r.logWeight({ weightKg: 65 })
  assert.equal(s.consistent, true)
})

test('기록 날짜 기준은 서울 날짜이고 날짜를 호출자가 정하지 않는다', async () => {
  const r = repo(U, '2026-11-12T15:30:00.000Z')
  await r.logWeight({ weightKg: 64 })
  assert.equal(log().entries[0].recordedOn, '2026-11-13')
  const r2 = repo('b', '2026-11-12T14:59:59.000Z')
  await r2.logWeight({ weightKg: 64 })
  assert.equal(log('b').entries[0].recordedOn, '2026-11-12')
})

test('마지막 기록일이 미래이면 새 기록을 거부한다', async () => {
  putLog([entry({ recordedOn: '2026-12-25' })])
  putBody(U, body())
  const before = snapshot()
  await assert.rejects(repo().logWeight({ weightKg: 64 }), code('invalidDate'))
  assert.deepEqual(snapshot(), before)
})

// ── 4. 입력 검증 ────────────────────────────────────────────────────
test('잘못된 몸무게와 입력은 아무것도 저장하지 않고 오류에 수치를 담지 않는다', async () => {
  const r = repo()
  putBody(U, body())
  const before = snapshot()
  for (const weightKg of [
    0,
    -1,
    0.9,
    500.1,
    65.55,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    '65',
    null,
    undefined,
  ])
    await assert.rejects(
      r.logWeight({ weightKg }),
      code('invalidWeight'),
      String(weightKg),
    )
  for (const input of [{}, null, undefined, { sameAsLast: false }, 'x'])
    await assert.rejects(
      r.logWeight(input),
      code('invalidInput'),
      String(input),
    )
  assert.deepEqual(snapshot(), before)
  await assert.rejects(
    r.logWeight({ weightKg: 65.55 }),
    (e) => !/65/.test(e.message),
  )
  for (const ok of [1, 500, 65.5]) await r.logWeight({ weightKg: ok })
  assert.equal(log().entries.length, 3)
})

test('이상한 기기 시각이면 날짜 오류로 거부한다', async () => {
  const r = repo()
  clock = new Date('invalid')
  await assert.rejects(r.logWeight({ weightKg: 64 }), code('invalidDate'))
  assert.equal(storage.getItem(LOG(U)), null)
})

// ── 5. 계정 분리 ────────────────────────────────────────────────────
test('계정별로 이력이 분리되고 한 계정의 기록이 다른 계정을 바꾸지 않는다', async () => {
  putBody(
    'b',
    body({ weightKg: 80, exerciseGoalProfile: { ...META, ownerId: 'b' } }),
  )
  const rb = repo('b')
  await rb.logWeight({ weightKg: 80 })
  const beforeB = new Map([...storage.data].filter(([k]) => k.endsWith('.b')))
  const ra = repo(U)
  await ra.logWeight({ weightKg: 64 })
  await ra.logWeight({ weightKg: 63 })
  for (const [k, v] of beforeB) assert.equal(storage.getItem(k), v, k)
  assert.equal(log('a').entries.length, 2)
  assert.equal(log('b').entries.length, 1)
  const empty = await repo('c').getCheckStatus()
  assert.equal(empty.reason, 'no-history')
  const keys = [...storage.data.keys()].filter((k) => k.includes('weightLog'))
  assert.deepEqual(keys.sort(), [LOG('a'), LOG('b')])
})

test('다른 계정의 이력이 섞이거나 소유자가 다르면 손상으로 본다', async () => {
  putLog([entry({ userId: 'b' })])
  await assert.rejects(repo().getCheckStatus(), code('corrupt'))
  storage.setItem(LOG(U), JSON.stringify({ v: 1, ownerId: 'b', entries: [] }))
  await assert.rejects(repo().getCheckStatus(), code('corrupt'))
  // A의 이력 문자열이 B의 키에 복사돼 있어도 B는 읽지 않는다
  putLog([entry()], U)
  storage.setItem(LOG('b'), storage.getItem(LOG(U)))
  await assert.rejects(repo('b').getCheckStatus(), code('corrupt'))
})

// ── 6. 기존 데이터와 보존 ───────────────────────────────────────────
test('기록일이 없는 기존 몸무게로 이력을 자동 생성하지 않는다', async () => {
  putBody(U, body())
  const before = snapshot()
  const s = await repo().getCheckStatus()
  assert.equal(s.legacyWeightUndated, true)
  assert.equal(s.reason, 'no-history')
  assert.equal(s.needsCheck, false)
  assert.deepEqual(snapshot(), before)
  assert.equal(storage.getItem(LOG(U)), null)
})

test('기록해도 기존 신체 정보·운동 목표용 나이·성별·다른 필드가 보존된다', async () => {
  putBody(U, body({ futureField: { keep: [1, 2] } }))
  await repo().logWeight({ weightKg: 62 })
  const after = bodyOf()
  assert.equal(after.heightCm, 161)
  assert.deepEqual(after.exerciseGoalProfile, META)
  assert.deepEqual(after.futureField, { keep: [1, 2] })
  assert.equal(after.weightKg, 62)
})

test('몸무게 기록은 운동 목표를 자동으로 바꾸지 않고 목표 화면이 같은 나이·성별을 읽는다', async () => {
  putBody(U, body())
  const context = {
    healthGoal: {
      focus: 'balanced',
      exerciseRatio: 50,
      mealRatio: 50,
      updatedAt: '2026-11-11T00:00:00.000Z',
    },
    exerciseTier: 'beginner',
    knowledgeSource: 'assessment',
  }
  const goal = goalMod.createLocalExerciseGoalRepository(U, {
    storage,
    crypto: webcrypto,
    now: () => Date.parse(T0),
    loadContext: async () => structuredClone(context),
  })
  await goal.registerPin('123456', '123456')
  const access = await goal.unlock('123456')
  const profile = await goal.getProfile(access)
  await goal.saveGoal(
    access,
    {
      purpose: 'learn',
      activityId: 'bodyweight-strength',
      targetWeightKg: '64',
      daysPerWeek: '3',
      minutesPerSession: '10',
    },
    context,
    profile,
  )
  const goalBefore = storage.getItem(GOAL(U))
  const summaryBefore = await goal.getSummary()
  await repo().logWeight({ weightKg: 61.5 })
  assert.equal(storage.getItem(GOAL(U)), goalBefore)
  assert.deepEqual(await goal.getSummary(), summaryBefore)
  const access2 = await goal.unlock('123456')
  const profile2 = await goal.getProfile(access2)
  assert.equal(profile2.age, 33)
  assert.equal(profile2.sex, 'female')
  assert.equal(profile2.weightKg, 61.5)
})

// ── 7. 실패와 불일치 ───────────────────────────────────────────────
test('이력 저장 실패(스위치·쓰기 오류)는 기존 데이터를 그대로 둔다', async () => {
  putBody(U, body())
  const r = repo()
  await r.logWeight({ weightKg: 64 })
  const before = snapshot()
  storage.setItem(FLAG('failSave'), 'weightLog')
  before.set(FLAG('failSave'), 'weightLog')
  clock = new Date('2026-12-20T03:00:00Z')
  await assert.rejects(r.logWeight({ weightKg: 60 }), code('save'))
  assert.deepEqual(snapshot(), before)
  storage.data.delete(FLAG('failSave'))
  failKeys.add(LOG(U))
  await assert.rejects(r.logWeight({ weightKg: 60 }), code('save'))
  failKeys.clear()
  assert.equal(log().entries.length, 1)
  assert.equal(bodyOf().weightKg, 64)
})

test('신체 정보 저장이 실패하면 방금 쓴 이력만 되돌리고 저장 실패로 알린다', async () => {
  putBody(U, body())
  const r = repo()
  await r.logWeight({ weightKg: 64 })
  const logBefore = storage.getItem(LOG(U))
  const bodyBefore = storage.getItem(BODY(U))
  failKeys.add(BODY(U))
  clock = new Date('2026-12-20T03:00:00Z')
  await assert.rejects(r.logWeight({ weightKg: 60 }), code('save'))
  assert.equal(storage.getItem(LOG(U)), logBefore)
  assert.equal(storage.getItem(BODY(U)), bodyBefore)
  failKeys.clear()
  // 첫 기록 중 실패: 이력 키가 생기지 않는다
  storage.data.delete(LOG(U))
  failKeys.add(BODY(U))
  await assert.rejects(r.logWeight({ weightKg: 60 }), code('save'))
  assert.equal(storage.getItem(LOG(U)), null)
  // 신체 정보 쓰기 스위치로도 같다
  failKeys.clear()
  storage.setItem(FLAG('failSave'), 'body')
  await assert.rejects(r.logWeight({ weightKg: 60 }), code('save'))
  assert.equal(storage.getItem(LOG(U)), null)
})

test('되돌림까지 실패하면 일부만 저장됐음을 알리고 더 손대지 않는다', async () => {
  putBody(U, body())
  const r = repo()
  const bodyBefore = storage.getItem(BODY(U))
  writes = 1 // 이력만 쓰고 이후 모든 쓰기 실패
  await assert.rejects(r.logWeight({ weightKg: 60 }), code('partialSave'))
  assert.equal(storage.getItem(BODY(U)), bodyBefore)
  // 불일치가 그대로 드러나고 임의로 고치지 않는다
  writes = null
  const s = await repo().getCheckStatus()
  assert.equal(s.lastRecordedOn, '2026-11-13')
  assert.equal(s.consistent, false)
  assert.equal(log().entries.length, 1)
  assert.equal(bodyOf().weightKg, 64) // 기존 값 그대로(기록한 값 60과 다르다)
  assert.equal(log().entries[0].weightKg, 60)
})

test('조회 실패 스위치는 상태 조회와 기록을 모두 막는다', async () => {
  const r = repo()
  storage.setItem(FLAG('failLoad'), 'weightLog')
  await assert.rejects(r.getCheckStatus(), code('load'))
  await assert.rejects(r.logWeight({ weightKg: 64 }), code('load'))
  storage.setItem(FLAG('failLoad'), 'body')
  await assert.rejects(r.getCheckStatus(), code('load'))
  assert.equal(storage.getItem(LOG(U)), null)
})

test('손상된 이력이나 신체 정보 위에는 쓰지 않는다', async () => {
  const r = repo()
  const brokenLogs = [
    '{broken',
    '123',
    JSON.stringify({ v: 2, ownerId: U, entries: [] }),
    JSON.stringify({ v: 1, ownerId: U, entries: 'x' }),
    JSON.stringify({
      v: 1,
      ownerId: U,
      entries: [entry({ recordedOn: '2026-02-30' })],
    }),
    JSON.stringify({ v: 1, ownerId: U, entries: [entry({ weightKg: 0 })] }),
    JSON.stringify({ v: 1, ownerId: U, entries: [entry({ kind: 'x' })] }),
    JSON.stringify({ v: 1, ownerId: U, entries: [entry(), entry()] }), // 중복 id
  ]
  for (const raw of brokenLogs) {
    storage.setItem(LOG(U), raw)
    putBody(U, body())
    const before = snapshot()
    await assert.rejects(r.getCheckStatus(), code('corrupt'), raw)
    await assert.rejects(r.logWeight({ weightKg: 64 }), code('corrupt'), raw)
    assert.deepEqual(snapshot(), before, raw)
  }
  storage.data.delete(LOG(U))
  for (const raw of ['{broken', '123', JSON.stringify(body({ v: 2 }))]) {
    putBody(U, raw)
    const before = snapshot()
    await assert.rejects(r.logWeight({ weightKg: 64 }), code('corrupt'), raw)
    assert.deepEqual(snapshot(), before, raw)
    assert.equal(storage.getItem(LOG(U)), null)
  }
})

// ── 8. 보안 ────────────────────────────────────────────────────────
test('수치를 읽는 메서드가 없고 콘솔에도 아무것도 출력하지 않는다', async () => {
  const r = repo()
  assert.deepEqual(Object.keys(r).sort(), [
    'getCheckStatus',
    'kind',
    'logWeight',
  ])
  const original = { ...console }
  const calls = []
  for (const method of ['log', 'info', 'warn', 'error', 'debug'])
    console[method] = (...args) => calls.push(args)
  try {
    await r.logWeight({ weightKg: 64 })
    await r.getCheckStatus()
    await r.logWeight({ weightKg: 0 }).catch(() => {})
    failKeys.add(BODY(U))
    await r.logWeight({ weightKg: 63 }).catch(() => {})
  } finally {
    Object.assign(console, original)
  }
  assert.deepEqual(calls, [])
})

test('기록 데이터 구조: 이력의 각 줄에 계정·기록일·몸무게·유형이 있다', async () => {
  const r = repo()
  await r.logWeight({ weightKg: 64 })
  const e = log().entries[0]
  assert.deepEqual(Object.keys(e).sort(), [
    'createdAt',
    'id',
    'kind',
    'recordedOn',
    'userId',
    'weightKg',
  ])
  assert.equal(log().ownerId, U)
  assert.equal(log().v, 1)
})
