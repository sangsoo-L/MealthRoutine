import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// 홈 월간 몸무게 확인 카드의 선택 규칙·"나중에 하기"·문구 검증. 실제 시트와 화면 동작은 브라우저 검증으로 확인한다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let rules
let dismissal
let messages
let weightTypes
let statusMod
let Card
let Retry

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  rules = await server.ssrLoadModule('/src/components/home/homeWeightCheck.ts')
  dismissal = await server.ssrLoadModule(
    '/src/weight-log/weightCardDismissal.ts',
  )
  messages = await server.ssrLoadModule('/src/weight-log/weightLogMessages.ts')
  weightTypes = await server.ssrLoadModule('/src/weight-log/weightLogTypes.ts')
  statusMod = await server.ssrLoadModule('/src/weight-log/weightLogStatus.ts')
  const cardMod = await server.ssrLoadModule(
    '/src/components/home/HomeWeightCheckCard.tsx',
  )
  Card = cardMod.default
  Retry = cardMod.HomeWeightCheckRetry
})
after(async () => {
  await server?.close()
})

const TODAY = '2026-11-13'
const bodyReady = (height = true, weight = true) => ({
  status: 'ready',
  value: { height, weight },
})
const weightReady = (overrides = {}) => ({
  status: 'ready',
  value: {
    today: TODAY,
    lastRecordedOn: '2026-10-13',
    nextDueOn: '2026-11-13',
    needsCheck: true,
    reason: 'due',
    legacyWeightUndated: false,
    consistent: true,
    ...overrides,
  },
})
const pick = (o = {}) =>
  rules.selectHomeWeightView({
    body: bodyReady(),
    weight: weightReady(),
    dismissal: null,
    ...o,
  })
const none = { kind: 'none' }

test('확인일이 도래하고 기록이 일치하면 월간 확인 카드(due)다', () => {
  assert.deepEqual(pick(), { kind: 'card', variant: 'due' })
})

test('확인일 전이면 기존 추천이다', () => {
  assert.deepEqual(
    pick({ weight: weightReady({ needsCheck: false, reason: 'not-due' }) }),
    none,
  )
})

test('기록과 현재 몸무게가 어긋나면 불일치 카드(mismatch)이고 확인일 도래보다 우선한다', () => {
  assert.deepEqual(pick({ weight: weightReady({ consistent: false }) }), {
    kind: 'card',
    variant: 'mismatch',
  })
  assert.deepEqual(
    pick({
      weight: weightReady({
        consistent: false,
        needsCheck: false,
        reason: 'not-due',
      }),
    }),
    { kind: 'card', variant: 'mismatch' },
  )
})

test('키 또는 몸무게가 미등록이면 몸무게 카드를 보이지 않는다(신체 정보 입력 카드가 먼저)', () => {
  for (const body of [
    bodyReady(false, true),
    bodyReady(true, false),
    bodyReady(false, false),
  ]) {
    assert.deepEqual(pick({ body }), none)
    assert.deepEqual(
      pick({ body, weight: weightReady({ consistent: false }) }),
      none,
    )
  }
})

test('신체 정보 상태를 모를 때(조회 중·실패·연결 전)는 몸무게 카드를 보이지 않는다', () => {
  for (const status of ['loading', 'error', 'unavailable'])
    assert.deepEqual(pick({ body: { status } }), none, status)
})

test('몸무게 기록 상태를 모를 때(조회 중·실패·연결 전)는 카드를 보이지 않는다', () => {
  for (const status of ['loading', 'error', 'unavailable'])
    assert.deepEqual(pick({ weight: { status } }), none, status)
})

test('기록일을 모르는 기존 사용자(no-history·legacyWeightUndated)와 미래 기록일은 확인일 도래로 취급하지 않는다', () => {
  assert.deepEqual(
    pick({
      weight: weightReady({
        reason: 'no-history',
        lastRecordedOn: null,
        nextDueOn: null,
        needsCheck: false,
        legacyWeightUndated: true,
      }),
    }),
    none,
  )
  // 값이 비정상으로 needsCheck가 true여도 이 상태들은 카드를 만들지 않는다
  for (const overrides of [
    { reason: 'no-history', needsCheck: true },
    { legacyWeightUndated: true },
    { reason: 'future-date', needsCheck: true, consistent: false },
  ])
    assert.deepEqual(
      pick({ weight: weightReady(overrides) }),
      none,
      JSON.stringify(overrides),
    )
})

test('나중에 하기: 오늘(서울)만 숨기고 다음 날에는 다시 평가한다', () => {
  assert.deepEqual(pick({ dismissal: { date: TODAY } }), none)
  assert.deepEqual(pick({ dismissal: { date: '2026-11-12' } }), {
    kind: 'card',
    variant: 'due',
  })
  // 불일치 카드도 같은 규칙
  assert.deepEqual(
    pick({
      weight: weightReady({ consistent: false }),
      dismissal: { date: TODAY },
    }),
    none,
  )
  assert.deepEqual(
    pick({
      weight: weightReady({ consistent: false, today: '2026-11-14' }),
      dismissal: { date: TODAY },
    }).kind,
    'card',
  )
})

test('서울 자정 경계: 확인일 전날 밤에는 카드가 없고 자정이 지나면 생긴다', () => {
  const entry = {
    id: 'e',
    userId: 'a',
    recordedOn: '2026-10-13',
    weightKg: 64,
    kind: 'initial',
    createdAt: '2026-10-13T03:00:00.000Z',
  }
  const at = (iso) => ({
    status: 'ready',
    value: statusMod.computeWeightCheckStatus({
      entries: [entry],
      currentWeightKg: 64,
      now: new Date(iso),
    }),
  })
  assert.deepEqual(pick({ weight: at('2026-11-12T14:59:59Z') }), none)
  assert.deepEqual(pick({ weight: at('2026-11-12T15:00:00Z') }), {
    kind: 'card',
    variant: 'due',
  })
  // 나중에 하기 기록은 전날(11-12)이면 자정 이후(11-13)에는 숨기지 않는다
  assert.equal(
    pick({
      weight: at('2026-11-12T15:00:00Z'),
      dismissal: { date: '2026-11-12' },
    }).kind,
    'card',
  )
})

// ── 나중에 하기 저장 ────────────────────────────────────────────────
function fakeStorage() {
  const data = new Map()
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
  }
}

test('나중에 하기는 사용자별로 날짜만 저장하고 다른 계정에 영향이 없다', () => {
  const storage = fakeStorage()
  assert.equal(dismissal.readWeightCardDismissal('a', storage), null)
  const record = dismissal.markWeightCardDismissed('a', TODAY, storage)
  assert.deepEqual(record, { date: TODAY })
  assert.deepEqual(dismissal.readWeightCardDismissal('a', storage), {
    date: TODAY,
  })
  assert.equal(dismissal.readWeightCardDismissal('b', storage), null)
  const keys = [...storage.data.keys()]
  assert.deepEqual(keys, ['mealthroutine.weightCard.dismissed.a'])
  assert.deepEqual(JSON.parse(storage.data.get(keys[0])), { v: 1, date: TODAY })
  assert.equal(dismissal.isWeightCardDismissed(record, TODAY), true)
  assert.equal(dismissal.isWeightCardDismissed(record, '2026-11-14'), false)
  assert.equal(dismissal.isWeightCardDismissed(null, TODAY), false)
})

test('손상되었거나 알 수 없는 저장값은 숨기지 않는 쪽으로 해석한다', () => {
  for (const raw of [
    '{broken',
    '123',
    'null',
    JSON.stringify({ v: 2, date: TODAY }),
    JSON.stringify({ v: 1, date: '2026-02-30' }),
    JSON.stringify({ v: 1 }),
  ]) {
    const storage = fakeStorage()
    storage.data.set('mealthroutine.weightCard.dismissed.x', raw)
    assert.equal(dismissal.readWeightCardDismissal('x', storage), null, raw)
  }
})

test('저장소를 쓸 수 없으면 메모리로 이어가고 다른 계정에는 번지지 않는다', () => {
  const broken = {
    getItem: () => {
      throw new Error('denied')
    },
    setItem: () => {
      throw new Error('denied')
    },
  }
  dismissal.markWeightCardDismissed('mem', TODAY, broken)
  assert.deepEqual(dismissal.readWeightCardDismissal('mem', broken), {
    date: TODAY,
  })
  assert.equal(dismissal.readWeightCardDismissal('other', broken), null)
  assert.equal(dismissal.readWeightCardDismissal('mem', null)?.date, TODAY)
})

// ── 카드 문구와 접근성 ─────────────────────────────────────────────
test('월간 확인 카드: 확정된 제목·안내·버튼 문구이고 몸무게 수치가 없다', () => {
  const html = renderToStaticMarkup(
    createElement(Card, { variant: 'due', onRecord() {}, onLater() {} }),
  )
  assert.match(html, /이번 달 몸무게를 확인해 볼까요\?/)
  assert.match(
    html,
    /지난 기록 이후 한 달이 지났어요\. 지금 몸무게를 기록하고 변화를 확인해 보세요\./,
  )
  assert.match(html, /몸무게 기록하기/)
  assert.match(html, /나중에 하기/)
  assert.doesNotMatch(html, /\d+(\.\d)?\s?kg/)
  assert.equal((html.match(/<button type="button"/g) ?? []).length, 2)
  assert.doesNotMatch(html, /<a /)
})

test('불일치 카드: 확정된 문구이고 자동 수정을 암시하지 않는다', () => {
  const html = renderToStaticMarkup(
    createElement(Card, { variant: 'mismatch', onRecord() {}, onLater() {} }),
  )
  assert.match(html, /몸무게 기록을 확인해 주세요/)
  assert.match(
    html,
    /등록된 몸무게와 마지막 기록이 일치하지 않아요\. 현재 몸무게를 다시 기록하면 이후 변화도 이어서 관리할 수 있어요\./,
  )
  assert.match(html, /기록 확인하기/)
  assert.match(html, /나중에 하기/)
  assert.doesNotMatch(html, /\d+(\.\d)?\s?kg/)
  for (const variant of ['due', 'mismatch']) {
    const out = renderToStaticMarkup(
      createElement(Card, { variant, onRecord() {}, onLater() {} }),
    )
    const ids = new Set([...out.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
    for (const [, ref] of out.matchAll(/aria-labelledby="([^"]+)"/g))
      assert.ok(ids.has(ref), ref)
  }
})

// ── 오류 안내 ─────────────────────────────────────────────────────
test('오류 안내는 몸무게 수치를 담지 않고 partialSave를 성공처럼 말하지 않는다', () => {
  const codes = [
    'invalidWeight',
    'invalidInput',
    'invalidDate',
    'noPrevious',
    'inconsistent',
    'save',
    'partialSave',
    'corrupt',
    'load',
    'unavailable',
  ]
  for (const code of codes) {
    const text = messages.weightLogMessage(new weightTypes.WeightLogError(code))
    assert.ok(text.length > 0, code)
    assert.doesNotMatch(text, /\d+(\.\d)?\s?kg(?!\s*사이)/, code)
  }
  const partial = messages.weightLogMessage(
    new weightTypes.WeightLogError('partialSave'),
  )
  assert.match(partial, /일부만 저장/)
  assert.match(partial, /성공한 것이 아니/)
  assert.match(partial, /다시 확인/)
  assert.doesNotMatch(partial, /저장했어요|완료/)
  assert.match(
    messages.weightLogMessage(new weightTypes.WeightLogError('inconsistent')),
    /직접 입력/,
  )
  assert.match(messages.weightLogMessage(new Error('x')), /다시 시도/)
})

// ── 몸무게 기록 상태 조회 실패 안내 ────────────────────────────────
const retryOf = (o = {}) =>
  rules.selectHomeWeightRetry({
    body: bodyReady(),
    weight: { status: 'error' },
    retrying: false,
    ...o,
  })

test('몸무게 조회 실패: 신체 정보가 모두 등록돼 있으면 재시도 안내가 보인다', () => {
  assert.equal(retryOf(), 'error')
  // 실패한 조회를 다시 확인하는 동안에도 안내를 유지한다(깜빡이지 않고 버튼만 막는다)
  assert.equal(
    retryOf({ weight: { status: 'loading' }, retrying: true }),
    'retrying',
  )
  // 재시도가 아닌 일반 조회 중에는 안내가 없다
  assert.equal(
    retryOf({ weight: { status: 'loading' }, retrying: false }),
    'none',
  )
})

test('몸무게 조회 성공·연결 전에는 실패 안내가 없다', () => {
  assert.equal(retryOf({ weight: weightReady() }), 'none')
  assert.equal(retryOf({ weight: { status: 'unavailable' } }), 'none')
  assert.equal(
    retryOf({ weight: { status: 'unavailable' }, retrying: true }),
    'none',
  )
})

test('신체 정보 조회 실패·누락·조회 중·연결 전이면 몸무게 실패 안내를 보이지 않는다(신체 정보 안내가 우선)', () => {
  for (const body of [
    { status: 'error' },
    { status: 'loading' },
    { status: 'unavailable' },
    bodyReady(false, true),
    bodyReady(true, false),
    bodyReady(false, false),
  ]) {
    assert.equal(retryOf({ body }), 'none', JSON.stringify(body))
    assert.equal(
      retryOf({ body, weight: { status: 'loading' }, retrying: true }),
      'none',
      JSON.stringify(body),
    )
  }
})

test('재조회 성공 뒤에는 상태에 따라 정상 카드가 다시 선택된다', () => {
  // 조회 실패 중에는 카드가 없고, 성공하면 due·mismatch 카드가 규칙대로 나온다
  assert.deepEqual(pick({ weight: { status: 'error' } }), none)
  assert.deepEqual(pick({ weight: weightReady() }), {
    kind: 'card',
    variant: 'due',
  })
  assert.deepEqual(pick({ weight: weightReady({ consistent: false }) }), {
    kind: 'card',
    variant: 'mismatch',
  })
  // 나중에 하기 정책은 재조회 뒤에도 유지된다
  assert.deepEqual(
    pick({ weight: weightReady(), dismissal: { date: TODAY } }),
    none,
  )
})

test('실패 안내: 확정 문구와 다시 확인 버튼, 수치 없음', () => {
  const html = renderToStaticMarkup(
    createElement(Retry, { busy: false, onRetry() {} }),
  )
  assert.match(html, /몸무게 기록 상태를 확인하지 못했어요\./)
  assert.match(html, /다시 확인/)
  assert.match(html, /role="status"/)
  assert.match(html, /aria-disabled="false"/)
  assert.doesNotMatch(html, /\d+(\.\d)?\s?kg|확인 필요|기록이 없/)
  assert.equal((html.match(/<button type="button"/g) ?? []).length, 1)
})

test('다시 확인 중에는 안내를 유지하고 버튼은 누를 수 없다(포커스를 잃지 않게 disabled가 아니다)', () => {
  let clicks = 0
  const busy = renderToStaticMarkup(
    createElement(Retry, { busy: true, onRetry: () => (clicks += 1) }),
  )
  assert.match(busy, /몸무게 기록 상태를 확인하지 못했어요\./)
  assert.match(busy, /확인 중…/)
  assert.match(busy, /aria-disabled="true"/)
  assert.match(busy, /aria-busy="true"/)
  assert.doesNotMatch(busy, / disabled=/)
  assert.equal(clicks, 0)
})
