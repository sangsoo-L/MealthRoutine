import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// 알림 Mock 저장소와 검증 규칙. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let repoMod
let types
let validation
let storage
let failKeys

const U = 'a'
const KEY = (owner) => `mealthroutine.dev.mock.notifications.${owner}`
const FLAG = (name) => `mealthroutine.dev.mock.flag.${name}`
const T0 = '2026-11-13T03:00:00.000Z'

function createStorage() {
  const data = new Map()
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      if (failKeys.has(key)) throw new Error('quota')
      data.set(key, value)
    },
    removeItem: (key) => data.delete(key),
  }
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  repoMod = await server.ssrLoadModule(
    '/src/notifications/mock/mockNotificationRepository.ts',
  )
  types = await server.ssrLoadModule('/src/notifications/notificationTypes.ts')
  validation = await server.ssrLoadModule(
    '/src/notifications/notificationValidation.ts',
  )
})
after(async () => {
  await server?.close()
})
beforeEach(() => {
  failKeys = new Set()
  storage = createStorage()
  globalThis.window = { localStorage: storage }
})

let clock
let seq
const repo = (owner = U, at = T0) => {
  clock = new Date(at)
  seq = 0
  return repoMod.createMockNotificationRepository({
    userId: owner,
    latencyMs: 0,
    now: () => clock,
    newId: () => `${owner}-${String(++seq).padStart(3, '0')}`,
  })
}
const draft = (n = 1, o = {}) => ({
  type: 'system',
  title: `알림 ${n}`,
  body: `내용 ${n}`,
  dedupeKey: `test:${n}`,
  target: null,
  ...o,
})
const code = (expected) => (error) =>
  error instanceof types.NotificationError && error.code === expected
const stored = (owner = U) => JSON.parse(storage.getItem(KEY(owner)))
const snapshot = () => new Map(storage.data)
/** 시간을 1분씩 늦추며 n건을 만든다. */
async function seed(r, n, make = (i) => draft(i)) {
  for (let i = 1; i <= n; i++) {
    clock = new Date(Date.parse(T0) + i * 60_000)
    await r.create(make(i))
  }
}

// ── 생성·목록·읽음 ──────────────────────────────────────────────────
test('알림을 만들면 읽지 않음·처리 전 상태로 저장되고 최신순으로 조회된다', async () => {
  const r = repo()
  const { notification, created } = await r.create(
    draft(1, { type: 'body', target: { route: '/mypage' } }),
  )
  assert.equal(created, true)
  assert.deepEqual(notification, {
    id: 'a-001',
    userId: U,
    type: 'body',
    title: '알림 1',
    body: '내용 1',
    createdAt: T0,
    readAt: null,
    resolvedAt: null,
    dedupeKey: 'test:1',
    target: { route: '/mypage' },
  })
  assert.equal(stored().v, 1)
  assert.equal(stored().ownerId, U)
  await seed(r, 3, (i) => draft(i + 1))
  const page = await r.list({ filter: 'all' })
  assert.deepEqual(
    page.items.map((n) => n.title),
    ['알림 4', '알림 3', '알림 2', '알림 1'],
  )
  assert.equal(page.nextCursor, null)
})

test('같은 시각에 만든 알림은 id가 큰 것이 먼저다', async () => {
  const r = repo()
  await r.create(draft(1))
  await r.create(draft(2))
  const page = await r.list({ filter: 'all' })
  assert.deepEqual(
    page.items.map((n) => n.id),
    ['a-002', 'a-001'],
  )
})

test('읽음 처리: 읽지 않은 개수가 줄고 처음 읽은 시각이 유지된다', async () => {
  const r = repo()
  await seed(r, 3)
  assert.equal(await r.getUnreadCount(), 3)
  clock = new Date('2026-11-14T00:00:00.000Z')
  const read = await r.markRead('a-002')
  assert.equal(read.readAt, '2026-11-14T00:00:00.000Z')
  assert.equal(await r.getUnreadCount(), 2)
  // 다시 읽어도 처음 읽은 시각 그대로이고 저장소를 쓰지 않는다
  clock = new Date('2026-11-20T00:00:00.000Z')
  const before = storage.getItem(KEY(U))
  const again = await r.markRead('a-002')
  assert.equal(again.readAt, '2026-11-14T00:00:00.000Z')
  assert.equal(storage.getItem(KEY(U)), before)
  assert.equal(await r.getUnreadCount(), 2)
  await assert.rejects(r.markRead('nope'), code('notFound'))
})

test('전체/읽지 않음 필터와 읽지 않은 개수 갱신', async () => {
  const r = repo()
  await seed(r, 4)
  await r.markRead('a-001')
  await r.markRead('a-003')
  const all = await r.list({ filter: 'all' })
  const unread = await r.list({ filter: 'unread' })
  assert.equal(all.items.length, 4)
  assert.deepEqual(
    unread.items.map((n) => n.id),
    ['a-004', 'a-002'],
  )
  assert.equal(await r.getUnreadCount(), unread.items.length)
  await r.markRead('a-004')
  assert.deepEqual(
    (await r.list({ filter: 'unread' })).items.map((n) => n.id),
    ['a-002'],
  )
  assert.equal(await r.getUnreadCount(), 1)
})

test('읽음과 처리 완료는 서로 독립이다', async () => {
  const r = repo()
  await r.create(draft(1, { dedupeKey: 'weight-check:2026-12' }))
  await r.create(draft(2))
  // 처리 완료로 표시해도 읽지 않음 그대로, 개수도 그대로
  clock = new Date('2026-11-15T00:00:00.000Z')
  const resolved = await r.resolve('weight-check:2026-12')
  assert.equal(resolved.resolvedAt, '2026-11-15T00:00:00.000Z')
  assert.equal(resolved.readAt, null)
  assert.equal(await r.getUnreadCount(), 2)
  assert.equal((await r.list({ filter: 'unread' })).items.length, 2)
  // 읽어도 처리 완료는 그대로
  clock = new Date('2026-11-16T00:00:00.000Z')
  const read = await r.markRead(resolved.id)
  assert.equal(read.readAt, '2026-11-16T00:00:00.000Z')
  assert.equal(read.resolvedAt, '2026-11-15T00:00:00.000Z')
  // 읽기만 한 알림은 처리 완료가 되지 않는다
  const other = await r.markRead('a-002')
  assert.equal(other.resolvedAt, null)
  // 이미 처리 완료면 그대로, 없는 키는 notFound
  const before = storage.getItem(KEY(U))
  assert.equal(
    (await r.resolve('weight-check:2026-12')).resolvedAt,
    '2026-11-15T00:00:00.000Z',
  )
  assert.equal(storage.getItem(KEY(U)), before)
  await assert.rejects(r.resolve('missing'), code('notFound'))
})

// ── 중복 방지 ───────────────────────────────────────────────────────
test('같은 dedupeKey는 한 번만 만들고 기존 알림(읽음 상태 포함)을 그대로 돌려준다', async () => {
  const r = repo()
  const first = await r.create(draft(1, { dedupeKey: 'weight-check:2026-12' }))
  await r.markRead(first.notification.id)
  clock = new Date('2026-12-01T00:00:00.000Z')
  const second = await r.create(draft(2, { dedupeKey: 'weight-check:2026-12' }))
  assert.equal(second.created, false)
  assert.equal(second.notification.id, first.notification.id)
  assert.equal(second.notification.title, '알림 1') // 새 내용으로 덮어쓰지 않는다
  assert.notEqual(second.notification.readAt, null) // 읽음 상태를 되돌리지 않는다
  assert.equal(stored().items.length, 1)
  assert.equal(await r.getUnreadCount(), 0)
  // 다른 키는 만들어진다
  assert.equal(
    (await r.create(draft(3, { dedupeKey: 'weight-check:2027-01' }))).created,
    true,
  )
  assert.equal(stored().items.length, 2)
})

test('같은 키를 동시에 만들어도 한 건만 저장된다', async () => {
  const r = repo()
  const results = await Promise.all(
    [1, 2, 3].map((n) => r.create(draft(n, { dedupeKey: 'same' }))),
  )
  assert.equal(results.filter((x) => x.created).length, 1)
  assert.equal(new Set(results.map((x) => x.notification.id)).size, 1)
  assert.equal(stored().items.length, 1)
})

// ── 페이지 단위 조회 ─────────────────────────────────────────────────
test('페이지 단위 조회: 중복·누락 없이 이어지고 마지막에 nextCursor가 없다', async () => {
  const r = repo()
  await seed(r, 7)
  const seen = []
  let cursor = null
  let pages = 0
  do {
    const page = await r.list({ filter: 'all', cursor, limit: 3 })
    seen.push(...page.items.map((n) => n.id))
    cursor = page.nextCursor
    pages += 1
  } while (cursor)
  assert.equal(pages, 3)
  assert.deepEqual(seen, [
    'a-007',
    'a-006',
    'a-005',
    'a-004',
    'a-003',
    'a-002',
    'a-001',
  ])
  // 정확히 limit 개일 때는 다음 페이지가 없다
  assert.equal((await r.list({ filter: 'all', limit: 7 })).nextCursor, null)
  assert.notEqual((await r.list({ filter: 'all', limit: 6 })).nextCursor, null)
})

test('페이지 조회 중 새 알림이 생겨도 이미 본 알림을 다시 주지 않는다', async () => {
  const r = repo()
  await seed(r, 5)
  const first = await r.list({ filter: 'all', limit: 2 })
  clock = new Date('2026-12-30T00:00:00.000Z')
  await r.create(draft(99))
  const second = await r.list({
    filter: 'all',
    cursor: first.nextCursor,
    limit: 2,
  })
  assert.deepEqual(
    second.items.map((n) => n.id),
    ['a-003', 'a-002'],
  )
})

test('읽지 않음 필터도 페이지 단위로 이어진다', async () => {
  const r = repo()
  await seed(r, 6)
  await r.markRead('a-005')
  await r.markRead('a-002')
  const p1 = await r.list({ filter: 'unread', limit: 2 })
  const p2 = await r.list({ filter: 'unread', cursor: p1.nextCursor, limit: 2 })
  assert.deepEqual(
    p1.items.map((n) => n.id),
    ['a-006', 'a-004'],
  )
  assert.deepEqual(
    p2.items.map((n) => n.id),
    ['a-003', 'a-001'],
  )
  assert.equal(p2.nextCursor, null)
})

test('잘못된 조회 조건은 거부한다', async () => {
  const r = repo()
  await seed(r, 2)
  for (const q of [
    { filter: 'x' },
    {},
    null,
    { filter: 'all', limit: 0 },
    { filter: 'all', limit: 51 },
    { filter: 'all', limit: 1.5 },
  ])
    await assert.rejects(r.list(q), code('invalidInput'), JSON.stringify(q))
  for (const cursor of [
    'x',
    '|a',
    'not-a-date|a-001',
    '2026-11-13T03:00:00.000Z|',
  ])
    await assert.rejects(
      r.list({ filter: 'all', cursor }),
      code('invalidCursor'),
      cursor,
    )
})

// ── 계정 분리 ───────────────────────────────────────────────────────
test('계정별로 알림이 분리되고 한 계정의 변경이 다른 계정을 바꾸지 않는다', async () => {
  const a = repo('a')
  const b = repo('b')
  await a.create(draft(1))
  await b.create(draft(1))
  const beforeB = storage.getItem(KEY('b'))
  await a.create(draft(2))
  await a.markRead('a-001')
  await a.resolve('test:1')
  assert.equal(storage.getItem(KEY('b')), beforeB)
  assert.equal(await a.getUnreadCount(), 1)
  assert.equal(await b.getUnreadCount(), 1)
  assert.equal((await repo('c').list({ filter: 'all' })).items.length, 0)
  const keys = [...storage.data.keys()].sort()
  assert.deepEqual(keys, [KEY('a'), KEY('b')])
  // 같은 dedupeKey·같은 id 형식이어도 계정이 다르면 서로의 알림이 아니다
  await assert.rejects(b.markRead('a-001'), code('notFound'))
})

test('다른 계정의 알림이 섞이거나 소유자가 다르면 손상으로 본다', async () => {
  const a = repo('a')
  await a.create(draft(1))
  const raw = storage.getItem(KEY('a'))
  storage.setItem(KEY('b'), raw) // A의 데이터가 B의 키에 복사됨
  await assert.rejects(repo('b').list({ filter: 'all' }), code('corrupt'))
  await assert.rejects(repo('b').getUnreadCount(), code('corrupt'))
  const mixed = JSON.parse(raw)
  mixed.items[0].userId = 'b'
  storage.setItem(KEY('a'), JSON.stringify(mixed))
  await assert.rejects(a.list({ filter: 'all' }), code('corrupt'))
})

// ── 실패와 손상 ─────────────────────────────────────────────────────
test('저장 실패는 기존 데이터를 그대로 둔다(쓰기 오류·스위치)', async () => {
  const r = repo()
  await seed(r, 2)
  const before = snapshot()
  failKeys.add(KEY(U))
  await assert.rejects(r.create(draft(9)), code('save'))
  await assert.rejects(r.markRead('a-001'), code('save'))
  await assert.rejects(r.resolve('test:1'), code('save'))
  failKeys.clear()
  assert.deepEqual(snapshot(), before)
  storage.setItem(FLAG('failSave'), 'notifications')
  before.set(FLAG('failSave'), 'notifications')
  await assert.rejects(r.create(draft(9)), code('save'))
  await assert.rejects(r.markRead('a-001'), code('save'))
  assert.deepEqual(snapshot(), before)
  assert.equal((await r.list({ filter: 'all' })).items.length, 2) // 조회는 가능
})

test('조회 실패 스위치는 모든 읽기를 막고 아무것도 쓰지 않는다', async () => {
  const r = repo()
  await seed(r, 1)
  storage.setItem(FLAG('failLoad'), 'notifications')
  const before = snapshot()
  await assert.rejects(r.list({ filter: 'all' }), code('load'))
  await assert.rejects(r.getUnreadCount(), code('load'))
  await assert.rejects(r.markRead('a-001'), code('load'))
  await assert.rejects(r.create(draft(2)), code('load'))
  assert.deepEqual(snapshot(), before)
})

test('손상된 저장 데이터 위에는 쓰지 않는다', async () => {
  const r = repo()
  const good = {
    id: 'x1',
    userId: U,
    type: 'system',
    title: 't',
    body: 'b',
    createdAt: T0,
    readAt: null,
    resolvedAt: null,
    dedupeKey: 'k1',
    target: null,
  }
  const wrap = (items, extra = {}) =>
    JSON.stringify({ v: 1, ownerId: U, items, ...extra })
  const broken = [
    '{broken',
    '123',
    'null',
    JSON.stringify({ v: 2, ownerId: U, items: [] }),
    JSON.stringify({ v: 1, ownerId: U, items: 'x' }),
    wrap([{ ...good, type: 'x' }]),
    wrap([{ ...good, title: '' }]),
    wrap([{ ...good, createdAt: 'nope' }]),
    wrap([{ ...good, readAt: 'nope' }]),
    wrap([{ ...good, resolvedAt: 5 }]),
    wrap([{ ...good, dedupeKey: 'bad key!' }]),
    wrap([{ ...good, target: { route: 'https://evil.example' } }]),
    wrap([{ ...good, target: { route: '//evil.example' } }]),
    wrap([good, { ...good, dedupeKey: 'k2' }]), // 중복 id
    wrap([good, { ...good, id: 'x2' }]), // 중복 dedupeKey
  ]
  for (const raw of broken) {
    storage.setItem(KEY(U), raw)
    const before = snapshot()
    await assert.rejects(r.list({ filter: 'all' }), code('corrupt'), raw)
    await assert.rejects(r.getUnreadCount(), code('corrupt'), raw)
    await assert.rejects(r.markRead('x1'), code('corrupt'), raw)
    await assert.rejects(r.create(draft(1)), code('corrupt'), raw)
    await assert.rejects(r.resolve('k1'), code('corrupt'), raw)
    assert.deepEqual(snapshot(), before, raw)
  }
})

// ── 내용 검증과 개인정보 ────────────────────────────────────────────
test('알림 내용 규칙: 잘못된 유형·빈 문구·긴 문구·잘못된 키·외부 경로는 거부한다', async () => {
  const r = repo()
  const bad = [
    draft(1, { type: 'x' }),
    draft(1, { title: '   ' }),
    draft(1, { body: '' }),
    draft(1, { title: 'a'.repeat(101) }),
    draft(1, { body: 'a'.repeat(501) }),
    draft(1, { dedupeKey: '' }),
    draft(1, { dedupeKey: 'has space' }),
    draft(1, { dedupeKey: 'a'.repeat(201) }),
    draft(1, { target: { route: 'https://evil.example' } }),
    draft(1, { target: { route: '//evil.example' } }),
    draft(1, { target: { route: '/ok\\bad' } }),
    draft(1, { target: { route: 'mypage' } }),
    draft(1, { target: { route: 5 } }),
    draft(1, { target: 'x' }),
    null,
    'x',
  ]
  for (const d of bad)
    await assert.rejects(r.create(d), code('invalidInput'), JSON.stringify(d))
  assert.equal(storage.getItem(KEY(U)), null)
  await r.create(draft(1, { target: { route: '/mypage?tab=body#a' } }))
  assert.equal(stored().items.length, 1)
})

test('알림에는 몸무게·키 같은 신체 수치를 담을 수 없다', async () => {
  const r = repo()
  for (const text of [
    '현재 64.5kg이에요',
    '몸무게 64 kg',
    '키 170cm',
    '키 170.5 ㎝',
    '64킬로',
  ]) {
    await assert.rejects(
      r.create(draft(1, { title: text })),
      code('invalidInput'),
      text,
    )
    await assert.rejects(
      r.create(draft(1, { body: text })),
      code('invalidInput'),
      text,
    )
  }
  assert.equal(storage.getItem(KEY(U)), null)
  // 일반 문장과 숫자(날짜·개수)는 허용한다
  await r.create(
    draft(1, {
      title: '이번 달 몸무게를 기록할 시간이에요',
      body: '2026년 12월 13일까지 확인해 주세요. 알림 3개',
    }),
  )
  assert.equal(stored().items.length, 1)
})

test('오류 메시지와 콘솔에 알림 내용을 쓰지 않는다', async () => {
  const r = repo()
  const secret = '비밀 제목 64kg'
  const error = await r.create(draft(1, { title: secret })).catch((e) => e)
  assert.equal(error.message, 'notification invalidInput')
  const original = { ...console }
  const calls = []
  for (const m of ['log', 'info', 'warn', 'error', 'debug'])
    console[m] = (...a) => calls.push(a)
  try {
    await r.create(draft(1))
    await r.list({ filter: 'all' })
    await r.markRead('a-001')
    await r.resolve('test:1')
    failKeys.add(KEY(U))
    await r.markRead('nope').catch(() => {})
    await r.create(draft(2)).catch(() => {})
  } finally {
    Object.assign(console, original)
  }
  assert.deepEqual(calls, [])
})

test('저장 구조: 인터페이스는 일부 읽기만 있고 모든 알림에 계정·상태 필드가 있다', async () => {
  const r = repo()
  assert.deepEqual(Object.keys(r).sort(), [
    'create',
    'getUnreadCount',
    'kind',
    'list',
    'markAllRead',
    'markRead',
    'resolve',
  ])
  await r.create(draft(1))
  assert.deepEqual(Object.keys(stored().items[0]).sort(), [
    'body',
    'createdAt',
    'dedupeKey',
    'id',
    'readAt',
    'resolvedAt',
    'target',
    'title',
    'type',
    'userId',
  ])
})

test('정렬·조회 위치 규칙(순수 함수)', () => {
  const a = { createdAt: '2026-11-13T03:00:00.000Z', id: 'a' }
  const b = { createdAt: '2026-11-13T04:00:00.000Z', id: 'b' }
  assert.ok(validation.compareNewestFirst(b, a) < 0)
  assert.ok(validation.compareNewestFirst(a, b) > 0)
  assert.equal(validation.compareNewestFirst(a, a), 0)
  assert.deepEqual(validation.decodeCursor(validation.encodeCursor(b)), b)
  assert.equal(validation.isInternalRoute('/notifications'), true)
  assert.equal(validation.isInternalRoute('/a?b=1#c'), true)
  for (const bad of ['', 'x', '//x', '/\\x', 'http://x', '/a\nb', null, 5])
    assert.equal(validation.isInternalRoute(bad), false, String(bad))
})

// ── 질의 확장: resolved · dedupeKeyPrefix ─────────────────────────────
/** 알림을 직접 저장한다. specs: [{dedupeKey, resolved, read}] 순서대로 1분씩 늦게 만들어진 것으로 한다. */
function putNotifications(specs, owner = U) {
  const base = Date.parse(T0)
  const items = specs.map((x, i) => {
    const at = new Date(base + (i + 1) * 60_000).toISOString()
    return {
      id: `${owner}-${String(i + 1).padStart(4, '0')}`,
      userId: owner,
      type: 'system',
      title: `알림 ${i + 1}`,
      body: `내용 ${i + 1}`,
      createdAt: at,
      readAt: x.read ? at : null,
      resolvedAt: x.resolved ? at : null,
      dedupeKey: x.dedupeKey ?? `other:${i + 1}`,
      target: null,
    }
  })
  storage.setItem(KEY(owner), JSON.stringify({ v: 1, ownerId: owner, items }))
  return items
}
const ids = (page) => page.items.map((n) => n.id)

test('resolved 필터: false는 처리 완료가 없는 알림만, true는 있는 알림만, 생략하면 구분하지 않는다', async () => {
  const r = repo()
  putNotifications([{ resolved: true }, {}, { resolved: true }, {}])
  assert.deepEqual(ids(await r.list({ filter: 'all', resolved: false })), [
    'a-0004',
    'a-0002',
  ])
  assert.deepEqual(ids(await r.list({ filter: 'all', resolved: true })), [
    'a-0003',
    'a-0001',
  ])
  assert.deepEqual(ids(await r.list({ filter: 'all' })), [
    'a-0004',
    'a-0003',
    'a-0002',
    'a-0001',
  ])
  assert.deepEqual(ids(await r.list({ filter: 'all', resolved: undefined })), [
    'a-0004',
    'a-0003',
    'a-0002',
    'a-0001',
  ])
})

test('dedupeKeyPrefix 필터: 그 접두어로 시작하는 알림만', async () => {
  const r = repo()
  putNotifications([
    { dedupeKey: 'weight-check:2026-01-05:2026-02-05' },
    { dedupeKey: 'other:1' },
    { dedupeKey: 'weight-check:2026-02-05:2026-03-05' },
    { dedupeKey: 'weightcheck:x' },
  ])
  assert.deepEqual(
    ids(await r.list({ filter: 'all', dedupeKeyPrefix: 'weight-check:' })),
    ['a-0003', 'a-0001'],
  )
  assert.deepEqual(
    ids(await r.list({ filter: 'all', dedupeKeyPrefix: 'other:' })),
    ['a-0002'],
  )
  assert.deepEqual(
    ids(
      await r.list({ filter: 'all', dedupeKeyPrefix: 'weight-check:2026-02' }),
    ),
    ['a-0003'],
  )
  assert.deepEqual(
    ids(await r.list({ filter: 'all', dedupeKeyPrefix: 'none:' })),
    [],
  )
})

test('새 필터는 전체/읽지 않음 필터와 함께 쓸 수 있고 모두 조합해도 정확하다', async () => {
  const r = repo()
  putNotifications([
    { dedupeKey: 'weight-check:1', read: true },
    { dedupeKey: 'weight-check:2', resolved: true },
    { dedupeKey: 'weight-check:3' },
    { dedupeKey: 'other:4' },
    { dedupeKey: 'weight-check:5', read: true, resolved: true },
  ])
  const q = (o) => r.list({ filter: 'all', ...o })
  assert.deepEqual(ids(await q({ filter: 'unread', resolved: false })), [
    'a-0004',
    'a-0003',
  ])
  assert.deepEqual(ids(await q({ filter: 'unread', resolved: true })), [
    'a-0002',
  ])
  assert.deepEqual(
    ids(await q({ filter: 'unread', dedupeKeyPrefix: 'weight-check:' })),
    ['a-0003', 'a-0002'],
  )
  assert.deepEqual(
    ids(await q({ resolved: false, dedupeKeyPrefix: 'weight-check:' })),
    ['a-0003', 'a-0001'],
  )
  assert.deepEqual(
    ids(
      await q({
        filter: 'unread',
        resolved: false,
        dedupeKeyPrefix: 'weight-check:',
      }),
    ),
    ['a-0003'],
  )
  assert.deepEqual(
    ids(await q({ resolved: true, dedupeKeyPrefix: 'weight-check:' })),
    ['a-0005', 'a-0002'],
  )
})

test('잘못된 resolved·dedupeKeyPrefix 값은 invalidInput이고 아무것도 읽거나 바꾸지 않는다', async () => {
  const r = repo()
  putNotifications([{}])
  const before = snapshot()
  for (const bad of [
    { resolved: 'false' },
    { resolved: 0 },
    { resolved: null },
    { resolved: [] },
    { dedupeKeyPrefix: '' },
    { dedupeKeyPrefix: 5 },
    { dedupeKeyPrefix: null },
    { dedupeKeyPrefix: 'has space' },
    { dedupeKeyPrefix: 'a'.repeat(201) },
    { dedupeKeyPrefix: {} },
  ])
    await assert.rejects(
      r.list({ filter: 'all', ...bad }),
      code('invalidInput'),
      JSON.stringify(bad),
    )
  assert.deepEqual(snapshot(), before)
})

test('필터를 건 페이지 조회: 중복·누락 없이 이어지고 마지막에 nextCursor가 없다', async () => {
  const r = repo()
  putNotifications(
    Array.from({ length: 23 }, (_, i) => ({
      dedupeKey: i % 2 === 0 ? `weight-check:${i}` : `other:${i}`,
      resolved: i % 5 === 0,
    })),
  )
  const seen = []
  let cursor = null
  let pages = 0
  do {
    const page = await r.list({
      filter: 'all',
      resolved: false,
      dedupeKeyPrefix: 'weight-check:',
      cursor,
      limit: 3,
    })
    seen.push(...ids(page))
    cursor = page.nextCursor
    pages += 1
  } while (cursor)
  const expected = Array.from({ length: 23 }, (_, i) => i)
    .filter((i) => i % 2 === 0 && i % 5 !== 0)
    .map((i) => `a-${String(i + 1).padStart(4, '0')}`)
    .reverse()
  assert.deepEqual(seen, expected)
  assert.equal(new Set(seen).size, seen.length)
  assert.equal(pages, Math.ceil(expected.length / 3))
})

test('조회 중 알림을 처리 완료로 바꿔 목록에서 사라져도 다음 페이지가 누락되지 않는다(커서는 값 기반)', async () => {
  const r = repo()
  putNotifications(
    Array.from({ length: 10 }, (_, i) => ({ dedupeKey: `weight-check:${i}` })),
  )
  const query = {
    filter: 'all',
    resolved: false,
    dedupeKeyPrefix: 'weight-check:',
    limit: 3,
  }
  const seen = []
  let cursor = null
  do {
    const page = await r.list({ ...query, cursor })
    seen.push(...ids(page))
    // 방금 받은 페이지의 알림을 모두 처리 완료로 바꿔 resolved:false 목록에서 사라지게 한다(정리가 하는 일)
    for (const n of page.items) await r.resolve(n.dedupeKey)
    cursor = page.nextCursor
  } while (cursor)
  assert.deepEqual(
    seen,
    Array.from(
      { length: 10 },
      (_, i) => `a-${String(10 - i).padStart(4, '0')}`,
    ),
  )
  assert.equal((await r.list({ ...query })).items.length, 0) // 모두 처리됨
})

test('커서가 가리키던 알림이 사라지거나 새 알림이 끼어들어도 이어서 조회된다', async () => {
  const r = repo()
  putNotifications(
    Array.from({ length: 6 }, (_, i) => ({ dedupeKey: `weight-check:${i}` })),
  )
  const first = await r.list({ filter: 'all', resolved: false, limit: 2 })
  assert.deepEqual(ids(first), ['a-0006', 'a-0005'])
  await r.resolve('weight-check:4') // 커서가 가리키는 알림(a-0005)이 필터에서 사라진다
  clock = new Date('2026-12-30T00:00:00.000Z')
  await r.create(draft(99, { dedupeKey: 'weight-check:new' })) // 더 새로운 알림이 끼어든다
  const second = await r.list({
    filter: 'all',
    resolved: false,
    cursor: first.nextCursor,
    limit: 2,
  })
  assert.deepEqual(ids(second), ['a-0004', 'a-0003'])
})

test('새 필드를 쓰지 않는 기존 list 호출의 동작은 그대로다(처리 완료도 포함)', async () => {
  const r = repo()
  putNotifications([{ resolved: true }, {}, { read: true, resolved: true }])
  assert.deepEqual(ids(await r.list({ filter: 'all' })), [
    'a-0003',
    'a-0002',
    'a-0001',
  ])
  assert.deepEqual(ids(await r.list({ filter: 'unread' })), [
    'a-0002',
    'a-0001',
  ])
  assert.equal(await r.getUnreadCount(), 2)
})

test('새 필터는 다른 계정의 알림을 보여 주지 않는다', async () => {
  putNotifications([{ dedupeKey: 'weight-check:1' }], 'a')
  putNotifications(
    [{ dedupeKey: 'weight-check:1' }, { dedupeKey: 'weight-check:2' }],
    'b',
  )
  const q = { filter: 'all', resolved: false, dedupeKeyPrefix: 'weight-check:' }
  assert.equal((await repo('a').list(q)).items.length, 1)
  assert.equal((await repo('b').list(q)).items.length, 2)
  assert.equal((await repo('c').list(q)).items.length, 0)
})

// ── 모두 읽기(markAllRead) ───────────────────────────────────────────
test('모두 읽기: 읽지 않은 알림 전체에 같은 읽음 시각이 생기고 이미 읽은 알림의 시각은 그대로다', async () => {
  const r = repo()
  putNotifications([{ read: true }, {}, {}, { read: true }, {}])
  const before = JSON.parse(storage.getItem(KEY(U))).items
  clock = new Date('2026-12-01T09:00:00.000Z')
  const result = await r.markAllRead()
  assert.deepEqual(result, { updated: 3, readAt: '2026-12-01T09:00:00.000Z' })
  const after = stored().items
  for (const n of after) assert.notEqual(n.readAt, null)
  // 이미 읽은 알림(1번·4번)의 처음 읽은 시각은 덮어쓰지 않는다
  assert.equal(after[0].readAt, before[0].readAt)
  assert.equal(after[3].readAt, before[3].readAt)
  // 읽지 않았던 알림은 모두 같은 시각
  assert.deepEqual(
    [after[1].readAt, after[2].readAt, after[4].readAt],
    Array(3).fill('2026-12-01T09:00:00.000Z'),
  )
  assert.equal(await r.getUnreadCount(), 0)
  assert.equal(after.length, 5) // 삭제되지 않는다
})

test('모두 읽기는 처리 완료(resolvedAt)와 알림 내용·순서를 바꾸지 않는다', async () => {
  const r = repo()
  putNotifications([{ resolved: true }, {}, { resolved: true, read: true }, {}])
  const before = JSON.parse(storage.getItem(KEY(U))).items
  await r.markAllRead()
  const after = stored().items
  assert.deepEqual(
    after.map((n) => n.resolvedAt),
    before.map((n) => n.resolvedAt),
  )
  for (const [i, n] of after.entries()) {
    const { readAt: _a, ...rest } = n
    const { readAt: _b, ...restBefore } = before[i]
    assert.deepEqual(rest, restBefore)
  }
  // 처리 완료이면서 읽지 않았던 알림도 읽음만 생기고 처리 완료는 그대로
  assert.notEqual(after[0].readAt, null)
  assert.notEqual(after[0].resolvedAt, null)
})

test('모두 읽기는 이미 모두 읽었거나 알림이 없으면 저장하지 않는다(멱등)', async () => {
  const r = repo()
  assert.deepEqual(await r.markAllRead(), { updated: 0, readAt: null })
  assert.equal(storage.getItem(KEY(U)), null) // 알림이 없으면 키도 만들지 않는다
  putNotifications([{}, {}])
  await r.markAllRead()
  const saved = storage.getItem(KEY(U))
  failKeys.add(KEY(U)) // 저장하려 하면 실패하도록 해서 "쓰지 않음"을 확인한다
  assert.deepEqual(await r.markAllRead(), { updated: 0, readAt: null })
  failKeys.clear()
  assert.equal(storage.getItem(KEY(U)), saved)
})

test('모두 읽기는 페이지로 불러오지 않은 알림까지 한 번에 처리한다(300건)', async () => {
  const r = repo()
  putNotifications(
    Array.from({ length: 300 }, (_, i) => ({ read: i % 10 === 0 })),
  )
  assert.equal(await r.getUnreadCount(), 270)
  const result = await r.markAllRead()
  assert.equal(result.updated, 270)
  assert.equal(await r.getUnreadCount(), 0)
  assert.equal((await r.list({ filter: 'unread' })).items.length, 0)
  assert.equal(stored().items.length, 300)
})

test('모두 읽기를 동시에 여러 번 호출해도 한 번만 반영되고 읽음 시각은 하나다', async () => {
  const r = repo()
  putNotifications([{}, {}, {}])
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => r.markAllRead()))
  assert.equal(results.filter((x) => x.updated > 0).length, 1)
  assert.equal(
    results.reduce((sum, x) => sum + x.updated, 0),
    3,
  )
  assert.equal(new Set(stored().items.map((n) => n.readAt)).size, 1)
})

test('모두 읽기는 현재 계정의 알림만 바꾼다', async () => {
  putNotifications([{}, {}], 'a')
  putNotifications([{}, {}, {}], 'b')
  const bBefore = storage.getItem(KEY('b'))
  assert.equal((await repo('a').markAllRead()).updated, 2)
  assert.equal(storage.getItem(KEY('b')), bBefore)
  assert.equal(await repo('b').getUnreadCount(), 3)
  assert.equal(await repo('a').getUnreadCount(), 0)
})

test('모두 읽기 저장 실패는 아무것도 바꾸지 않고(부분 반영 없음) 재시도하면 처리된다', async () => {
  const r = repo()
  putNotifications(Array.from({ length: 40 }, () => ({})))
  const before = snapshot()
  failKeys.add(KEY(U))
  await assert.rejects(r.markAllRead(), code('save'))
  failKeys.clear()
  assert.deepEqual(snapshot(), before) // 40건 중 하나도 읽음이 되지 않았다
  assert.equal(await r.getUnreadCount(), 40)
  storage.setItem(FLAG('failSave'), 'notifications')
  before.set(FLAG('failSave'), 'notifications')
  await assert.rejects(r.markAllRead(), code('save'))
  assert.deepEqual(snapshot(), before)
  storage.data.delete(FLAG('failSave'))
  assert.equal((await r.markAllRead()).updated, 40) // 재시도
  assert.equal(await r.getUnreadCount(), 0)
})

test('모두 읽기는 조회 실패·손상된 데이터에서 아무것도 쓰지 않는다', async () => {
  const r = repo()
  putNotifications([{}])
  storage.setItem(FLAG('failLoad'), 'notifications')
  const before = snapshot()
  await assert.rejects(r.markAllRead(), code('load'))
  assert.deepEqual(snapshot(), before)
  storage.data.delete(FLAG('failLoad'))
  storage.setItem(KEY(U), '{broken')
  const broken = snapshot()
  await assert.rejects(r.markAllRead(), code('corrupt'))
  assert.deepEqual(snapshot(), broken)
})

test('모두 읽기 후에도 읽음 처리·목록·개수·생성·완료 처리 계약이 그대로 동작한다', async () => {
  const r = repo()
  await r.create(draft(1, { dedupeKey: 'weight-check:2026-10-13:2026-11-13' }))
  await r.create(draft(2))
  clock = new Date('2026-12-01T00:00:00.000Z')
  await r.markAllRead()
  // 읽은 알림을 다시 읽어도 시각 유지, 새로 만든 알림은 읽지 않음
  assert.equal((await r.markRead('a-001')).readAt, '2026-12-01T00:00:00.000Z')
  clock = new Date('2026-12-02T00:00:00.000Z')
  const { notification } = await r.create(draft(3))
  assert.equal(notification.readAt, null)
  assert.equal(await r.getUnreadCount(), 1)
  // 처리 완료는 읽음과 별개로 계속 동작한다
  const resolved = await r.resolve('weight-check:2026-10-13:2026-11-13')
  assert.equal(resolved.readAt, '2026-12-01T00:00:00.000Z')
  assert.notEqual(resolved.resolvedAt, null)
})
