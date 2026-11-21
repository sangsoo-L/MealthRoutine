import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// 월간 몸무게 확인 알림 서비스: 주기 키·생성 조건·완료 처리·기록과의 조합 흐름. 실제 Mock 저장소 두 개와 서비스를 함께 쓴다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let svcMod
let recMod
let weightRepoMod
let notifRepoMod
let notifTypes
let weightTypes
let storage
let failKeys
let writes
let events

const U = 'a'
const LOG = (o) => `mealthroutine.dev.mock.weightLog.${o}`
const BODY = (o) => `mealthroutine.dev.mock.body.${o}`
const NOTI = (o) => `mealthroutine.dev.mock.notifications.${o}`
const FLAG = (n) => `mealthroutine.dev.mock.flag.${n}`
const T0 = '2026-10-13T03:00:00.000Z' // 서울 10/13 12:00

function createStorage() {
  const data = new Map()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (failKeys.has(k)) throw new Error('quota')
      if (writes !== null) {
        if (writes <= 0) throw new Error('quota')
        writes -= 1
      }
      data.set(k, v)
    },
    removeItem: (k) => {
      if (writes !== null && writes <= 0) throw new Error('quota')
      data.delete(k)
    },
  }
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  svcMod = await server.ssrLoadModule(
    '/src/weight-notification/weightNotificationService.ts',
  )
  recMod = await server.ssrLoadModule(
    '/src/weight-notification/recordWithNotification.ts',
  )
  weightRepoMod = await server.ssrLoadModule(
    '/src/weight-log/mock/mockWeightLogRepository.ts',
  )
  notifRepoMod = await server.ssrLoadModule(
    '/src/notifications/mock/mockNotificationRepository.ts',
  )
  notifTypes = await server.ssrLoadModule(
    '/src/notifications/notificationTypes.ts',
  )
  weightTypes = await server.ssrLoadModule('/src/weight-log/weightLogTypes.ts')
})
after(async () => {
  await server?.close()
})
beforeEach(() => {
  failKeys = new Set()
  writes = null
  storage = createStorage()
  events = 0
  globalThis.window = {
    localStorage: storage,
    dispatchEvent: () => {
      events += 1
      return true
    },
  }
})

let clock
const setClock = (iso) => {
  clock = new Date(iso)
}
function make(owner = U) {
  clock ??= new Date(T0)
  let n = 0
  const opts = { userId: owner, latencyMs: 0, now: () => clock }
  const weight = weightRepoMod.createMockWeightLogRepository({
    ...opts,
    newId: () => `w-${owner}-${++n}`,
  })
  const notif = notifRepoMod.createMockNotificationRepository({
    ...opts,
    newId: () => `n-${owner}-${String(++n).padStart(3, '0')}`,
  })
  return {
    weight,
    notif,
    service: svcMod.createWeightNotificationService(notif),
  }
}
const status = (o = {}) => ({
  today: '2026-11-13',
  lastRecordedOn: '2026-10-13',
  nextDueOn: '2026-11-13',
  needsCheck: true,
  reason: 'due',
  legacyWeightUndated: false,
  consistent: true,
  ...o,
})
const code = (e) => (error) =>
  error instanceof notifTypes.NotificationError && error.code === e
const notifs = (owner = U) =>
  JSON.parse(storage.getItem(NOTI(owner)) ?? '{"items":[]}').items
const entries = (owner = U) =>
  JSON.parse(storage.getItem(LOG(owner)) ?? '{"entries":[]}').entries
const DUE = '2026-11-13T03:00:00.000Z' // 서울 11/13: 10/13 기록의 다음 확인일
beforeEach(() => {
  clock = undefined
})

// ── 주기 키와 생성 조건 ──────────────────────────────────────────────
test('주기 키는 마지막 기록일과 다음 확인일로 만들고 같은 주기에서는 항상 같다', () => {
  const k = svcMod.weightCycleKey
  assert.equal(k(status()), 'weight-check:2026-10-13:2026-11-13')
  assert.equal(k(status()), k(status({ today: '2026-11-20' }))) // 조회 시점과 무관
  assert.notEqual(
    k(status()),
    k(status({ lastRecordedOn: '2026-11-13', nextDueOn: '2026-12-13' })),
  ) // 새 기록 → 새 주기
  // 같은 달에 끝나는 서로 다른 주기도 구분된다(현재 달만 쓰지 않는다)
  assert.notEqual(
    k(status({ lastRecordedOn: '2026-10-31', nextDueOn: '2026-11-30' })),
    k(status({ lastRecordedOn: '2026-10-05', nextDueOn: '2026-11-05' })),
  )
  for (const bad of [
    { lastRecordedOn: null },
    { nextDueOn: null },
    { lastRecordedOn: 'x' },
    { nextDueOn: '2026-02-30' },
  ])
    assert.equal(k(status(bad)), null, JSON.stringify(bad))
})

test('생성 조건: 확인일이 되었고 이력이 있으며 기록과 일치하는 정상 상태만', () => {
  const ok = svcMod.shouldCreateWeightNotification
  assert.equal(ok(status()), true)
  const no = (o) => assert.equal(ok(status(o)), false, JSON.stringify(o))
  no({ reason: 'not-due', needsCheck: false })
  no({
    reason: 'no-history',
    lastRecordedOn: null,
    nextDueOn: null,
    needsCheck: false,
    legacyWeightUndated: true,
  })
  no({
    reason: 'no-history',
    lastRecordedOn: null,
    nextDueOn: null,
    needsCheck: false,
  })
  no({ legacyWeightUndated: true })
  no({
    reason: 'future-date',
    lastRecordedOn: '2026-12-25',
    nextDueOn: null,
    needsCheck: false,
  })
  no({ consistent: false })
  no({ needsCheck: false })
  no({ nextDueOn: null })
})

test('알림 내용: 확정 문구, 신체 수치 없음, 앱 내부 경로 대상', async () => {
  const d = svcMod.weightNotificationDraft(status())
  assert.equal(d.title, '이번 달 몸무게를 확인해 주세요')
  assert.equal(
    d.body,
    '마지막 기록 이후 한 달이 지났어요. 몸무게를 기록해 보세요.',
  )
  assert.equal(d.type, 'body')
  assert.deepEqual(d.target, { route: '/mypage#weight-log' })
  assert.equal(d.dedupeKey, 'weight-check:2026-10-13:2026-11-13')
  assert.doesNotMatch(JSON.stringify(d), /\d+(\.\d)?\s?(kg|cm)/i)
  const { notif } = make()
  assert.equal((await notif.create(d)).created, true) // 저장소의 내용 검증(경로·수치)을 통과한다
})

// ── 자동 생성 ──────────────────────────────────────────────────────
test('확인일 전에는 알림이 없고, 확인일이 되면 한 건이 만들어진다', async () => {
  const { service } = make()
  assert.deepEqual(
    await service.sync(status({ reason: 'not-due', needsCheck: false })),
    { created: false, reconciled: 0 },
  )
  assert.equal(notifs().length, 0)
  assert.deepEqual(await service.sync(status()), {
    created: true,
    reconciled: 0,
  })
  const [n] = notifs()
  assert.equal(notifs().length, 1)
  assert.equal(n.readAt, null)
  assert.equal(n.resolvedAt, null)
  assert.equal(n.dedupeKey, 'weight-check:2026-10-13:2026-11-13')
})

test('같은 주기를 반복 조회하거나 동시에 호출해도 중복되지 않는다', async () => {
  const { service } = make()
  for (let i = 0; i < 3; i++)
    await service.sync(status({ today: `2026-11-${13 + i}` }))
  assert.equal(notifs().length, 1)
  const results = await Promise.all(
    Array.from({ length: 6 }, () => service.sync(status())),
  )
  assert.equal(results.filter((r) => r.created).length, 0) // 이미 있음
  assert.equal(notifs().length, 1)
  // 아직 없을 때 동시에 호출해도 한 건
  storage.data.delete(NOTI(U))
  const race = await Promise.all(
    Array.from({ length: 6 }, () => service.sync(status())),
  )
  assert.equal(race.filter((r) => r.created).length, 1)
  assert.equal(notifs().length, 1)
})

test('새로운 기록 주기는 새 dedupeKey로 새 알림을 만들고 이전 알림은 그대로 둔다', async () => {
  const { service } = make()
  await service.sync(status())
  const first = notifs()[0]
  const next = status({
    today: '2026-12-13',
    lastRecordedOn: '2026-11-13',
    nextDueOn: '2026-12-13',
  })
  const result = await service.sync(next)
  assert.equal(result.created, true)
  assert.equal(notifs().length, 2)
  assert.notEqual(notifs()[1].dedupeKey, first.dedupeKey)
  // 이전 주기의 미처리 알림은 새 기록이 있으므로 정리(처리 완료)되고, 지워지지 않는다
  assert.equal(result.reconciled, 1)
  const old = notifs().find((n) => n.dedupeKey === first.dedupeKey)
  assert.notEqual(old.resolvedAt, null)
  assert.equal(old.readAt, null)
  assert.equal(
    notifs().find((n) => n.dedupeKey === next && 0),
    undefined,
  )
})

test('생성하지 않는 상태: 이력 없음·기존 몸무게·미래 기록일·기록 불일치', async () => {
  const { service } = make()
  const cases = [
    status({
      reason: 'no-history',
      lastRecordedOn: null,
      nextDueOn: null,
      needsCheck: false,
      legacyWeightUndated: true,
    }),
    status({
      reason: 'no-history',
      lastRecordedOn: null,
      nextDueOn: null,
      needsCheck: false,
    }),
    status({
      reason: 'future-date',
      lastRecordedOn: '2026-12-25',
      nextDueOn: null,
      needsCheck: false,
    }),
    status({ consistent: false }),
    status({ legacyWeightUndated: true }),
    status({ reason: 'not-due', needsCheck: false }),
  ]
  for (const s of cases)
    assert.equal((await service.sync(s)).created, false, JSON.stringify(s))
  assert.equal(storage.getItem(NOTI(U)), null)
})

test('생성 실패는 오류로 알리고 아무것도 만들지 않으며 다음 호출에서 만들어진다', async () => {
  const { service } = make()
  failKeys.add(NOTI(U))
  await assert.rejects(service.sync(status()), code('save'))
  assert.equal(storage.getItem(NOTI(U)), null)
  failKeys.clear()
  assert.equal((await service.sync(status())).created, true)
  assert.equal(notifs().length, 1)
})

test('계정별로 분리된다', async () => {
  const a = make('a')
  const b = make('b')
  await a.service.sync(status())
  assert.equal(notifs('a').length, 1)
  assert.equal(notifs('b').length, 0)
  await b.service.sync(status())
  assert.equal(notifs('b').length, 1)
  assert.equal(notifs('b')[0].userId, 'b')
})

// ── 완료 처리 ──────────────────────────────────────────────────────
test('완료 처리: 그 주기의 알림만 resolvedAt이 생기고 readAt과 다른 알림은 그대로다', async () => {
  const { service, notif } = make()
  await notif.create({
    type: 'system',
    title: '다른 알림',
    body: '내용',
    dedupeKey: 'other:1',
    target: null,
  })
  await service.sync(status())
  const before = JSON.stringify(notifs().find((n) => n.dedupeKey === 'other:1'))
  setClock('2026-11-14T03:00:00.000Z')
  assert.equal(await service.resolveCycle(status()), 'resolved')
  const w = notifs().find((n) => n.dedupeKey.startsWith('weight-check:'))
  assert.equal(w.resolvedAt, '2026-11-14T03:00:00.000Z')
  assert.equal(w.readAt, null) // 읽음은 자동으로 바뀌지 않는다
  assert.equal(
    JSON.stringify(notifs().find((n) => n.dedupeKey === 'other:1')),
    before,
  )
  assert.equal(await notif.getUnreadCount(), 2) // 처리 완료여도 읽지 않음은 그대로
})

test('완료 처리는 멱등이고 알림이 없으면 오류가 아니라 none이다', async () => {
  const { service } = make()
  assert.equal(await service.resolveCycle(status()), 'none') // 아직 알림이 없음
  assert.equal(
    await service.resolveCycle({ lastRecordedOn: null, nextDueOn: null }),
    'none',
  )
  await service.sync(status())
  setClock('2026-11-14T03:00:00.000Z')
  await service.resolveCycle(status())
  const stamped = notifs()[0].resolvedAt
  setClock('2026-11-20T03:00:00.000Z')
  assert.equal(await service.resolveCycle(status()), 'resolved')
  assert.equal(notifs()[0].resolvedAt, stamped) // 처음 처리한 시각 유지
})

test('이미 읽은 알림도 완료 처리 후 readAt이 그대로다(읽음과 처리 완료의 독립)', async () => {
  const { service, notif } = make()
  await service.sync(status())
  setClock('2026-11-13T05:00:00.000Z')
  const read = await notif.markRead(notifs()[0].id)
  setClock('2026-11-14T05:00:00.000Z')
  await service.resolveCycle(status())
  const n = notifs()[0]
  assert.equal(n.readAt, read.readAt)
  assert.equal(n.resolvedAt, '2026-11-14T05:00:00.000Z')
})

// ── 이전 주기 정리(안전망) ───────────────────────────────────────────
test('정리: 마지막 기록일이 더 늦어진 이전 주기의 미처리 알림만 처리 완료로 바꾼다', async () => {
  const { service, notif } = make()
  await service.sync(status()) // 주기 10/13
  const current = status({
    today: '2026-12-13',
    lastRecordedOn: '2026-11-13',
    nextDueOn: '2026-12-13',
    needsCheck: false,
    reason: 'not-due',
  })
  await notif.create({
    type: 'system',
    title: '다른 알림',
    body: '내용',
    dedupeKey: 'other:1',
    target: null,
  })
  const result = await service.sync(current)
  assert.equal(result.reconciled, 1)
  assert.notEqual(
    notifs().find((n) => n.dedupeKey.startsWith('weight-check:2026-10-13'))
      .resolvedAt,
    null,
  )
  assert.equal(notifs().find((n) => n.dedupeKey === 'other:1').resolvedAt, null)
  assert.equal((await service.sync(current)).reconciled, 0) // 이미 정리됨
})

test('기록과 현재 몸무게가 어긋난 상태(partialSave 등)에서는 이전 주기 알림을 정리하지 않는다', async () => {
  const { service } = make()
  await service.sync(status())
  const newer = status({
    today: '2026-11-14',
    lastRecordedOn: '2026-11-14',
    nextDueOn: '2026-12-14',
    needsCheck: false,
    reason: 'not-due',
    consistent: false,
  })
  assert.equal((await service.sync(newer)).reconciled, 0)
  assert.equal(notifs()[0].resolvedAt, null)
  // 다시 기록해 일치하게 되면 그때 정리된다
  assert.equal(
    (await service.sync({ ...newer, consistent: true })).reconciled,
    1,
  )
  assert.notEqual(notifs()[0].resolvedAt, null)
})

test('정리는 현재 주기의 알림과 미래 기록일·이력 없음에서는 아무것도 바꾸지 않는다', async () => {
  const { service } = make()
  await service.sync(status())
  const before = storage.getItem(NOTI(U))
  assert.equal((await service.sync(status())).reconciled, 0)
  assert.equal(
    (
      await service.sync(
        status({
          reason: 'future-date',
          lastRecordedOn: '2026-12-25',
          nextDueOn: null,
          needsCheck: false,
        }),
      )
    ).reconciled,
    0,
  )
  assert.equal(
    (
      await service.sync(
        status({
          reason: 'no-history',
          lastRecordedOn: null,
          nextDueOn: null,
          needsCheck: false,
        }),
      )
    ).reconciled,
    0,
  )
  assert.equal(storage.getItem(NOTI(U)), before)
})

// ── 기록과 알림의 조합 ───────────────────────────────────────────────
async function dueSetup() {
  const ctx = make()
  setClock(T0)
  await ctx.weight.logWeight({ weightKg: 64 }) // 10/13 첫 기록
  setClock(DUE)
  const previous = await ctx.weight.getCheckStatus()
  assert.equal(previous.needsCheck, true)
  await ctx.service.sync(previous)
  return { ...ctx, previous }
}

test('확인일 도래 → 알림 한 건 → 기록 성공 → 그 알림만 처리 완료(readAt 불변)', async () => {
  const { weight, service, previous } = await dueSetup()
  assert.equal(notifs().length, 1)
  const out = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous,
    input: { weightKg: 63.5 },
  })
  assert.deepEqual(await out.completion, { state: 'resolved' })
  assert.equal(out.status.needsCheck, false)
  assert.equal(entries().length, 2)
  const n = notifs()[0]
  assert.notEqual(n.resolvedAt, null)
  assert.equal(n.readAt, null)
  // 새 주기: 같은 날 다시 조회해도 새 알림이 없고(확인일 전) 이전 알림은 그대로 한 건
  assert.deepEqual(await service.sync(out.status), {
    created: false,
    reconciled: 0,
  })
  assert.equal(notifs().length, 1)
})

test('"지난번과 같아요" 기록도 알림을 완료 처리한다', async () => {
  const { weight, service, previous } = await dueSetup()
  const out = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous,
    input: { sameAsLast: true },
  })
  assert.deepEqual(await out.completion, { state: 'resolved' })
  assert.equal(entries()[1].kind, 'same-as-last')
  assert.notEqual(notifs()[0].resolvedAt, null)
})

test('몸무게 기록이 실패하면 알림을 완료 처리하지 않는다(저장 실패·partialSave·잘못된 입력)', async () => {
  const { weight, service, previous } = await dueSetup()
  const before = storage.getItem(NOTI(U))
  // 잘못된 입력
  await assert.rejects(
    recMod.recordWeightAndComplete({
      weight,
      service,
      previous,
      input: { weightKg: 0 },
    }),
    (e) => e.code === 'invalidWeight',
  )
  // 저장 실패(되돌림 성공)
  failKeys.add(BODY(U))
  await assert.rejects(
    recMod.recordWeightAndComplete({
      weight,
      service,
      previous,
      input: { weightKg: 63 },
    }),
    (e) => e.code === 'save',
  )
  failKeys.clear()
  // partialSave: 이력만 쓰고 이후 쓰기와 되돌림이 모두 실패
  writes = 1
  await assert.rejects(
    recMod.recordWeightAndComplete({
      weight,
      service,
      previous,
      input: { weightKg: 62 },
    }),
    (e) => e.code === 'partialSave',
  )
  writes = null
  assert.equal(storage.getItem(NOTI(U)), before) // 알림 저장소는 한 번도 바뀌지 않았다
  assert.equal(notifs()[0].resolvedAt, null)
  // partialSave 뒤 화면이 상태를 다시 읽어 알림을 맞춰도(불일치 상태) 알림은 처리 완료가 되지 않는다
  const after = await weight.getCheckStatus()
  assert.equal(after.consistent, false)
  await service.sync(after)
  assert.equal(notifs()[0].resolvedAt, null)
})

test('기록은 성공했는데 알림 완료 처리가 실패하면: 기록은 한 번만, 실패를 구분해 알리고, 완료 처리만 재시도한다', async () => {
  const { weight, service, previous } = await dueSetup()
  const logBefore = entries().length
  failKeys.add(NOTI(U))
  const out = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous,
    input: { weightKg: 63 },
  })
  const completion = await out.completion
  assert.equal(completion.state, 'failed')
  assert.equal(completion.key, 'weight-check:2026-10-13:2026-11-13')
  // 기록 자체는 성공으로 남아 있다
  assert.equal(entries().length, logBefore + 1)
  assert.equal(JSON.parse(storage.getItem(BODY(U))).weightKg, 63)
  assert.equal(notifs()[0].resolvedAt, null)
  // 재시도가 계속 실패해도 기록은 다시 만들어지지 않는다
  await assert.rejects(service.resolveByKey(completion.key), code('save'))
  assert.equal(entries().length, logBefore + 1)
  // 실패 원인이 사라진 뒤 완료 처리만 재시도한다
  failKeys.clear()
  assert.equal(await service.resolveByKey(completion.key), 'resolved')
  assert.equal(entries().length, logBefore + 1) // 같은 몸무게 기록이 다시 실행되지 않았다
  assert.notEqual(notifs()[0].resolvedAt, null)
  assert.equal(notifs()[0].readAt, null)
})

test('실패한 완료 처리를 화면을 떠난 뒤에도 정리(sync)가 바로잡는다', async () => {
  const { weight, service, previous } = await dueSetup()
  failKeys.add(NOTI(U))
  const out = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous,
    input: { weightKg: 63 },
  })
  assert.equal((await out.completion).state, 'failed')
  failKeys.clear()
  const later = await weight.getCheckStatus() // 화면을 다시 열었을 때의 상태
  assert.equal((await service.sync(later)).reconciled, 1)
  assert.notEqual(notifs()[0].resolvedAt, null)
  assert.equal(entries().length, 2) // 기록은 그대로 한 건 추가
})

test('알림이 없거나 첫 기록이거나 알림 저장소가 없으면 완료 처리는 none이다', async () => {
  const { weight, service } = make()
  setClock(T0)
  const first = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous: null,
    input: { weightKg: 64 },
  })
  assert.deepEqual(await first.completion, { state: 'none' })
  setClock(DUE)
  const previous = await weight.getCheckStatus()
  const second = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous,
    input: { weightKg: 63 },
  }) // 이 주기의 알림이 아직 없었음
  assert.deepEqual(await second.completion, { state: 'none' })
  assert.equal(notifs().length, 0)
  setClock('2026-12-20T03:00:00.000Z')
  const p2 = await weight.getCheckStatus()
  const third = await recMod.recordWeightAndComplete({
    weight,
    service: null,
    previous: p2,
    input: { weightKg: 62 },
  })
  assert.deepEqual(await third.completion, { state: 'none' })
})

test('다른 계정의 알림은 완료 처리하지 않는다', async () => {
  const a = await dueSetup()
  const b = make('b')
  setClock(T0)
  await b.weight.logWeight({ weightKg: 70 })
  setClock(DUE)
  await b.service.sync(await b.weight.getCheckStatus())
  const bBefore = storage.getItem(NOTI('b'))
  const out = await recMod.recordWeightAndComplete({
    weight: a.weight,
    service: a.service,
    previous: a.previous,
    input: { weightKg: 63 },
  })
  await out.completion
  assert.equal(storage.getItem(NOTI('b')), bBefore)
  assert.equal(notifs('b')[0].resolvedAt, null)
  assert.notEqual(notifs('a')[0].resolvedAt, null)
})

test('알림이 바뀌면 화면에 알리는 신호를 보내고, 아무것도 바뀌지 않으면 보내지 않는다', async () => {
  const { service } = make()
  await service.sync(status({ reason: 'not-due', needsCheck: false }))
  assert.equal(events, 0)
  await service.sync(status())
  assert.equal(events, 1)
  await service.sync(status()) // 이미 있음
  assert.equal(events, 1)
  await service.resolveCycle(status())
  assert.equal(events, 2)
  await service.resolveCycle({ lastRecordedOn: null, nextDueOn: null }) // 할 일 없음
  assert.equal(events, 2)
})

test('콘솔과 오류 메시지에 몸무게 수치를 쓰지 않는다', async () => {
  const { weight, service, previous } = await dueSetup()
  const original = { ...console }
  const calls = []
  for (const m of ['log', 'info', 'warn', 'error', 'debug'])
    console[m] = (...a) => calls.push(a)
  try {
    failKeys.add(NOTI(U))
    const out = await recMod.recordWeightAndComplete({
      weight,
      service,
      previous,
      input: { weightKg: 61.2 },
    })
    await out.completion
    await service.sync(await weight.getCheckStatus()).catch(() => {})
  } finally {
    Object.assign(console, original)
  }
  assert.deepEqual(calls, [])
  assert.doesNotMatch(JSON.stringify(notifs()), /61\.2/)
  assert.doesNotMatch(storage.getItem(NOTI(U)), /kg|61\.2/)
  void weightTypes
  void FLAG
})

// ── 오래된 미처리 알림(탐색 범위 제한 없음) ───────────────────────────
/** 알림을 직접 저장한다. */
function putAll(items, owner = U) {
  storage.setItem(NOTI(owner), JSON.stringify({ v: 1, ownerId: owner, items }))
}
const baseMs = Date.parse('2025-01-01T00:00:00.000Z')
function note(i, over = {}) {
  const at = new Date(baseMs + i * 60_000).toISOString()
  return {
    id: `x-${String(i).padStart(5, '0')}`,
    userId: U,
    type: 'system',
    title: `알림 ${i}`,
    body: '내용',
    createdAt: at,
    readAt: null,
    resolvedAt: null,
    dedupeKey: `other:${i}`,
    target: null,
    ...over,
  }
}
/** i번째(0부터) 오래된 월간 알림의 키. 2000년 1월부터 한 달씩. */
function oldKey(i) {
  const y = 2000 + Math.floor(i / 12)
  const m = (i % 12) + 1
  const ny = m === 12 ? y + 1 : y
  const nm = m === 12 ? 1 : m + 1
  const p2 = (n) => String(n).padStart(2, '0')
  return `weight-check:${y}-${p2(m)}-05:${ny}-${p2(nm)}-05`
}
const current = () =>
  status({
    today: '2026-11-13',
    lastRecordedOn: '2026-11-13',
    nextDueOn: '2026-12-13',
    needsCheck: false,
    reason: 'not-due',
  })
/** list 호출 수를 세는 서비스 */
function countingService() {
  const { notif } = make()
  let calls = 0
  const wrapped = {
    ...notif,
    list: (q) => {
      calls += 1
      return notif.list(q)
    },
  }
  return {
    service: svcMod.createWeightNotificationService(wrapped),
    calls: () => calls,
    notif,
  }
}

test('다른 알림 250건 뒤에 있는 오래된 미처리 월간 알림도 정리된다(최근 200건 제한 없음)', async () => {
  const oldest = note(0, {
    dedupeKey: 'weight-check:2025-01-05:2025-02-05',
    type: 'body',
  })
  putAll([oldest, ...Array.from({ length: 250 }, (_, i) => note(i + 1))])
  const { service } = countingService()
  const result = await service.sync(current())
  assert.equal(result.reconciled, 1)
  const w = notifs().find((n) => n.dedupeKey.startsWith('weight-check:'))
  assert.notEqual(w.resolvedAt, null)
  assert.equal(w.readAt, null) // 읽음은 바뀌지 않는다
  assert.equal(
    notifs().filter(
      (n) => n.dedupeKey.startsWith('other:') && n.resolvedAt !== null,
    ).length,
    0,
  ) // 다른 알림 불변
  assert.equal(notifs().length, 251)
})

test('미처리 월간 알림이 여러 페이지에 걸쳐 있어도 모두 정리되고 다른 알림 수와 무관하게 조회한다', async () => {
  const weight = Array.from({ length: 130 }, (_, i) =>
    note(i * 3, { dedupeKey: oldKey(i), type: 'body' }),
  )
  const others = Array.from({ length: 320 }, (_, i) => note(i * 3 + 1))
  const alreadyDone = [
    note(1000, {
      dedupeKey: 'weight-check:1999-01-05:1999-02-05',
      resolvedAt: '2025-01-01T00:00:00.000Z',
      readAt: '2025-01-01T00:00:00.000Z',
    }),
  ]
  putAll(
    [...weight, ...others, ...alreadyDone].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : 1,
    ),
  )
  const { service, calls } = countingService()
  const result = await service.sync(current())
  assert.equal(result.reconciled, 130)
  const after = notifs()
  assert.equal(
    after.filter(
      (n) => n.dedupeKey.startsWith('weight-check:') && n.resolvedAt === null,
    ).length,
    0,
  )
  assert.equal(
    after.filter(
      (n) => n.dedupeKey.startsWith('other:') && n.resolvedAt !== null,
    ).length,
    0,
  )
  // 이미 처리된 알림은 그대로(처음 처리한 시각과 읽음 유지)
  const done = after.find(
    (n) => n.dedupeKey === 'weight-check:1999-01-05:1999-02-05',
  )
  assert.equal(done.resolvedAt, '2025-01-01T00:00:00.000Z')
  assert.equal(done.readAt, '2025-01-01T00:00:00.000Z')
  // 전체 451건이 아니라 대상 130건 기준으로만 조회한다(50건 페이지 3쪽 안팎)
  assert.ok(calls() <= 4, `list 호출 ${calls()}회`)
  assert.equal(after.length, 130 + 320 + 1)
})

test('정리 중 알림이 목록에서 사라져도 다음 페이지가 누락되지 않는다', async () => {
  // 한 페이지(50건)를 넘는 120건. 매 페이지마다 처리하면 그 알림들이 resolved:false 목록에서 사라진다.
  putAll(
    Array.from({ length: 120 }, (_, i) =>
      note(i, { dedupeKey: oldKey(i), type: 'body' }),
    ),
  )
  const { service } = countingService()
  assert.equal((await service.sync(current())).reconciled, 120)
  assert.equal(notifs().filter((n) => n.resolvedAt === null).length, 0)
  assert.equal((await service.sync(current())).reconciled, 0) // 다시 호출해도 할 일 없음(멱등)
})

test('현재 주기와 더 늦은 주기의 알림, 비월간 알림은 정리하지 않는다', async () => {
  putAll([
    note(1, { dedupeKey: oldKey(0), type: 'body' }), // 이전 주기 → 정리
    note(2, { dedupeKey: 'weight-check:2026-11-13:2026-12-13', type: 'body' }), // 현재 주기
    note(3, { dedupeKey: 'weight-check:2027-01-05:2027-02-05', type: 'body' }), // 더 늦은 주기
    note(4, { dedupeKey: 'other:4' }),
    note(5, { dedupeKey: 'weight-checkup:5' }), // 접두어가 비슷한 다른 알림
  ])
  const { service } = countingService()
  assert.equal((await service.sync(current())).reconciled, 1)
  const byKey = Object.fromEntries(
    notifs().map((n) => [n.dedupeKey, n.resolvedAt]),
  )
  assert.notEqual(byKey[oldKey(0)], null)
  assert.equal(byKey['weight-check:2026-11-13:2026-12-13'], null)
  assert.equal(byKey['weight-check:2027-01-05:2027-02-05'], null)
  assert.equal(byKey['other:4'], null)
  assert.equal(byKey['weight-checkup:5'], null)
})

test('일부 알림의 완료 처리가 실패해도 성공한 변경은 유지되고, 다음 정리에서 남은 알림만 다시 처리한다', async () => {
  putAll(
    Array.from({ length: 6 }, (_, i) =>
      note(i, { dedupeKey: oldKey(i), type: 'body' }),
    ),
  )
  const { notif } = make()
  const failing = new Set([oldKey(2), oldKey(4)])
  const flaky = {
    ...notif,
    resolve: (key) =>
      failing.has(key)
        ? Promise.reject(new notifTypes.NotificationError('save'))
        : notif.resolve(key),
  }
  await assert.rejects(
    svcMod.createWeightNotificationService(flaky).sync(current()),
    code('save'),
  )
  const left = notifs()
    .filter((n) => n.resolvedAt === null)
    .map((n) => n.dedupeKey)
    .sort()
  assert.deepEqual(left, [oldKey(2), oldKey(4)].sort()) // 성공한 4건은 유지
  // 원인이 사라진 뒤 다음 정리는 남은 2건만 처리한다
  failing.clear()
  let resolveCalls = 0
  const counting = {
    ...notif,
    resolve: (k) => {
      resolveCalls += 1
      return notif.resolve(k)
    },
  }
  const result = await svcMod
    .createWeightNotificationService(counting)
    .sync(current())
  assert.equal(result.reconciled, 2)
  assert.equal(resolveCalls, 2)
  assert.equal(notifs().filter((n) => n.resolvedAt === null).length, 0)
  assert.equal(notifs().filter((n) => n.readAt !== null).length, 0) // 읽음 변경 없음
})

test('정리는 몸무게 기록 저장소를 건드리지 않는다(기록을 다시 저장하지 않음)', async () => {
  const { weight, service } = make()
  setClock(T0)
  await weight.logWeight({ weightKg: 64 })
  putAll([
    note(0, { dedupeKey: 'weight-check:2025-01-05:2025-02-05', type: 'body' }),
  ])
  const logBefore = storage.getItem(LOG(U))
  const bodyBefore = storage.getItem(BODY(U))
  setClock(DUE)
  await service.sync(await weight.getCheckStatus())
  assert.equal(storage.getItem(LOG(U)), logBefore)
  assert.equal(storage.getItem(BODY(U)), bodyBefore)
})

test('커서가 진행되지 않거나 반복되면 정리가 무한 반복하지 않고 끝난다', async () => {
  const item = note(1, { dedupeKey: oldKey(0), type: 'body' })
  const resolved = []
  // 같은 커서를 계속 돌려주는 비정상 저장소
  const stuck = {
    kind: 'mock',
    list: async () => ({ items: [item], nextCursor: 'same|cursor' }),
    resolve: async (k) => {
      resolved.push(k)
      return item
    },
    create: async () => {
      throw new Error('unused')
    },
    markRead: async () => {
      throw new Error('unused')
    },
    getUnreadCount: async () => 0,
  }
  const timeout = () =>
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout: 무한 반복')), 3000),
    )
  const result = await Promise.race([
    svcMod.createWeightNotificationService(stuck).sync(current()),
    timeout(),
  ])
  assert.equal(result.reconciled, 1)
  assert.deepEqual(resolved, [oldKey(0)]) // 같은 알림을 반복해서 처리하지 않는다
  // 항목 없이 커서만 계속 돌려주는 저장소도 끝난다
  let calls = 0
  const empty = {
    ...stuck,
    list: async () => {
      calls += 1
      return { items: [], nextCursor: `c|${calls}` }
    },
  }
  const r2 = await Promise.race([
    svcMod.createWeightNotificationService(empty).sync(current()),
    timeout(),
  ])
  assert.equal(r2.reconciled, 0)
  assert.ok(calls < 10, `list 호출 ${calls}회`)
})

test('partialSave 뒤 정상 재기록하면 오래된 알림이 많아도 원래 주기의 알림이 처리된다', async () => {
  const { weight, service } = make()
  setClock(T0)
  await weight.logWeight({ weightKg: 64 })
  setClock(DUE)
  const due = await weight.getCheckStatus()
  await service.sync(due) // 원래 주기(10/13) 알림 생성
  // 알림이 많아져 원래 알림이 최근 200건 밖으로 밀린 상황
  const stored = JSON.parse(storage.getItem(NOTI(U)))
  const crowd = Array.from({ length: 260 }, (_, i) =>
    note(i + 1, {
      createdAt: new Date(Date.parse(DUE) + (i + 1) * 60_000).toISOString(),
    }),
  )
  putAll([...stored.items, ...crowd])
  // partialSave: 이력만 쓰이고 되돌림도 실패
  writes = 1
  await assert.rejects(
    recMod.recordWeightAndComplete({
      weight,
      service,
      previous: due,
      input: { weightKg: 60 },
    }),
    (e) => e.code === 'partialSave',
  )
  writes = null
  const inconsistent = await weight.getCheckStatus()
  assert.equal(inconsistent.consistent, false)
  await service.sync(inconsistent)
  const original = () =>
    notifs().find((n) => n.dedupeKey.startsWith('weight-check:2026-10-13'))
  assert.equal(original().resolvedAt, null) // 불일치 동안 처리하지 않는다
  // 정상 재기록
  setClock('2026-11-14T03:00:00.000Z')
  const out = await recMod.recordWeightAndComplete({
    weight,
    service,
    previous: inconsistent,
    input: { weightKg: 60 },
  })
  assert.deepEqual(await out.completion, { state: 'none' }) // 명시적 처리는 다른 주기를 가리킨다
  const consistent = await weight.getCheckStatus()
  assert.equal(consistent.consistent, true)
  assert.equal((await service.sync(consistent)).reconciled, 1) // 정리가 원래 주기의 알림을 처리한다
  assert.notEqual(original().resolvedAt, null)
  assert.equal(original().readAt, null)
})

test('정리는 계정별로 분리된다(다른 계정의 미처리 알림은 건드리지 않는다)', async () => {
  const a = make('a')
  putAll(
    [note(0, { dedupeKey: oldKey(0), type: 'body', userId: 'a', id: 'a-1' })],
    'a',
  )
  putAll(
    [note(0, { dedupeKey: oldKey(0), type: 'body', userId: 'b', id: 'b-1' })],
    'b',
  )
  const bBefore = storage.getItem(NOTI('b'))
  assert.equal((await a.service.sync(current())).reconciled, 1)
  assert.equal(storage.getItem(NOTI('b')), bBefore)
  assert.notEqual(notifs('a')[0].resolvedAt, null)
  assert.equal(notifs('b')[0].resolvedAt, null)
})

test('모두 읽기는 월간 몸무게 알림을 처리 완료로 만들지 않고, 이후 기록 완료 처리와 정리는 그대로 동작한다', async () => {
  const { service, notif } = make()
  await service.sync(status())
  await notif.markAllRead()
  const n = notifs()[0]
  assert.notEqual(n.readAt, null)
  assert.equal(n.resolvedAt, null) // 읽는다고 기록 완료가 되지 않는다
  const readAt = n.readAt
  setClock('2026-11-14T03:00:00.000Z')
  assert.equal(await service.resolveCycle(status()), 'resolved')
  assert.equal(notifs()[0].readAt, readAt) // 처리 완료가 읽음 시각을 바꾸지 않는다
  assert.notEqual(notifs()[0].resolvedAt, null)
  // 모두 읽은 뒤에도 같은 주기의 알림은 다시 만들어지지 않는다
  assert.equal((await service.sync(status())).created, false)
  assert.equal(notifs().length, 1)
})
