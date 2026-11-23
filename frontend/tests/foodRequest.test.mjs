import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// F03 음식 등록 요청·P04 내 요청 내역(P04-1 목록 상태): 입력 검증·서버 계약 경계·상태별 화면·라우트·연결·범위.
// 대문자 드라이브(C:\)의 PowerShell에서 실행한다. 화면 상태는 시험이 주입한 값으로만 만든다(실제 화면은 서버 연결이 없다).
let server
let R
let Form
let View
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const text = (out) => out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
const signal = new AbortController().signal

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  R = await server.ssrLoadModule('/src/food-request/foodRequest.ts')
  Form = (
    await server.ssrLoadModule(
      '/src/components/food/request/FoodRequestForm.tsx',
    )
  ).default
  View = (
    await server.ssrLoadModule(
      '/src/components/food/request/RequestHistoryView.tsx',
    )
  ).default
})
after(async () => {
  await server.close()
})

// ── 입력 검증 ─────────────────────────────────────────────────────────────────
test('음식 이름은 필수이고(공백만도 오류) 앞뒤 공백은 뺀다. 명세에 없는 길이 제한을 만들지 않는다', () => {
  assert.deepEqual(R.validateFoodName(''), { ok: false, error: 'empty' })
  assert.deepEqual(R.validateFoodName('   '), { ok: false, error: 'empty' })
  assert.deepEqual(R.validateFoodName('  현미 즉석밥 '), {
    ok: true,
    name: '현미 즉석밥',
  })
  assert.equal(R.validateFoodName('가'.repeat(5000)).ok, true)
})

test('첨부는 이미지이고 10MB 이하여야 한다', () => {
  assert.equal(R.MAX_ATTACHMENT_BYTES, 10 * 1024 * 1024)
  assert.equal(R.validateAttachment({ type: 'image/png', size: 1 }), null)
  assert.equal(
    R.validateAttachment({ type: 'image/jpeg', size: R.MAX_ATTACHMENT_BYTES }),
    null,
  )
  assert.equal(
    R.validateAttachment({
      type: 'image/png',
      size: R.MAX_ATTACHMENT_BYTES + 1,
    }),
    'size',
  )
  assert.equal(
    R.validateAttachment({ type: 'application/pdf', size: 1 }),
    'type',
  )
  assert.equal(R.validateAttachment({ type: '', size: 1 }), 'type')
  assert.match(R.ATTACHMENT_ERROR_MESSAGE.size, /텍스트만 요청해도/)
})

// ── 서버 계약 경계 ────────────────────────────────────────────────────────────
const input = {
  foodName: '두부',
  brand: null,
  description: null,
  attachment: null,
}

test('서버 연결은 아직 없다: 요청·조회를 보내지 않고 연결 전이다', async () => {
  assert.equal(R.createFoodRequestSource(), null)
  assert.deepEqual(await R.runFoodRequest(null, input, signal), {
    phase: 'unavailable',
  })
  assert.deepEqual(await R.runListRequests(null, signal), {
    status: 'unavailable',
  })
})

test('요청 실행: 서버가 접수하면 done(서버 결과 그대로), 예외는 failed', async () => {
  const ok = {
    createRequest: async () => ({ kind: 'accepted', requestId: 'REQ-1' }),
  }
  assert.deepEqual(await R.runFoodRequest(ok, input, signal), {
    phase: 'done',
    result: { kind: 'accepted', requestId: 'REQ-1' },
  })
  const bad = {
    createRequest: async () => {
      throw new Error('x')
    },
  }
  assert.deepEqual(await R.runFoodRequest(bad, input, signal), {
    phase: 'failed',
  })
})

test('목록 조회: 0건은 empty, 있으면 ready, 예외는 error(요청 없음과 구분)', async () => {
  const src = (list) => ({ listRequests: list })
  assert.deepEqual(
    await R.runListRequests(
      src(async () => []),
      signal,
    ),
    { status: 'empty' },
  )
  const items = [
    {
      requestId: 'A',
      foodName: 'x',
      brand: null,
      description: null,
      createdAt: null,
      status: null,
      adminComments: [],
    },
  ]
  assert.deepEqual(
    await R.runListRequests(
      src(async () => items),
      signal,
    ),
    { status: 'ready', items },
  )
  assert.deepEqual(
    await R.runListRequests(
      src(async () => {
        throw new Error('x')
      }),
      signal,
    ),
    { status: 'error' },
  )
})

// ── 상태 규칙(서버 값을 표시만 한다) ──────────────────────────────────────────
const comment = (id, createdAt, status, body = '메모') => ({
  id,
  authorName: '관리자',
  createdAt,
  status,
  body,
})
const item = (over = {}) => ({
  requestId: 'FOOD-1',
  foodName: '현미 도시락',
  brand: null,
  description: null,
  createdAt: '2026-11-02T01:00:00.000Z',
  status: 'received',
  adminComments: [],
  ...over,
})

test('상태 표시: 가장 최근의 알려진 관리자 메모 상태가 배지가 되고, 없으면 요청의 상태, 모르면 상태 확인 중', () => {
  assert.equal(R.requestStatus(item()), 'received')
  const reviewed = item({
    adminComments: [
      comment('2', '2026-11-03T00:00:00Z', '검토 중'),
      comment('1', '2026-11-01T00:00:00Z', 'received'),
    ],
  })
  assert.equal(R.requestStatus(reviewed), 'review') // 입력 순서가 아니라 시간순의 마지막
  assert.deepEqual(
    R.sortedComments(reviewed).map((c) => c.id),
    ['1', '2'],
  )
  assert.equal(R.requestStatus(item({ status: null })), 'unknown')
  assert.equal(R.requestStatus(item({ status: '이상한 값' })), 'unknown')
  // 상태가 없는 메모는 배지를 바꾸지 않는다
  assert.equal(
    R.requestStatus(
      item({ adminComments: [comment('1', '2026-11-03T00:00:00Z', null)] }),
    ),
    'received',
  )
  for (const [raw, key] of [
    ['접수', 'received'],
    ['검토 중', 'review'],
    ['추가정보 필요', 'needInfo'],
    ['반영 완료', 'completed'],
    ['반려', 'rejected'],
    ['COMPLETED', 'completed'],
  ]) {
    assert.equal(R.statusKeyOf(raw), key, raw)
  }
})

test('필터·건수: 전체·접수·검토 중·반영 완료(추가정보 필요·반려는 전체에서만)', () => {
  const items = [
    item({ requestId: 'a', status: 'received' }),
    item({ requestId: 'b', status: 'review' }),
    item({ requestId: 'c', status: 'completed' }),
    item({ requestId: 'd', status: '반려' }),
    item({ requestId: 'e', status: '추가정보 필요' }),
  ]
  assert.deepEqual(R.filterCounts(items), {
    all: 5,
    received: 1,
    review: 1,
    completed: 1,
  })
  assert.deepEqual(
    R.filterItems(items, 'review').map((x) => x.requestId),
    ['b'],
  )
  assert.equal(R.filterItems(items, 'all').length, 5)
})

test('날짜 표시: 한국 시간, 없거나 올바르지 않으면 미기록', () => {
  assert.equal(R.requestDateLabel(null), '접수일 미기록')
  assert.equal(R.requestDateLabel('not a date'), '접수일 미기록')
  assert.match(
    R.requestDateLabel('2026-11-02T01:00:00.000Z'),
    /2026\.\s?11\.\s?02/,
  )
  assert.equal(R.commentTimeLabel(null), '작성일 미기록')
})

// ── F03 화면 ──────────────────────────────────────────────────────────────────
const form = (props) => html(createElement(Form, { source: null, ...props }))

test('F03 초기: 라벨 연결 입력(필수·선택 표시)·이미지 첨부 안내·직접 입력 링크, 안내 없음', () => {
  const out = form({})
  const t = text(out)
  assert.match(t, /음식 이름 필수/)
  assert.match(t, /브랜드 또는 판매처 선택/)
  assert.match(t, /영양표 사진 선택/)
  assert.match(t, /추가 설명 선택/)
  assert.match(t, /최대 10MB/)
  assert.match(
    out,
    /type="file"[^>]*accept="image\/\*"|accept="image\/\*"[^>]*type="file"/,
  )
  assert.equal((out.match(/<label for="/g) ?? []).length, 4)
  assert.match(out, /noValidate|novalidate/)
  assert.doesNotMatch(out, /data-request-state/)
  assert.deepEqual(hrefs(out), ['/records/meal/record'])
  assert.match(t, /직접 입력으로 기록/)
})

test('F03 입력 오류: 이름 오류는 입력에 연결되고 입력은 유지된다. 첨부 오류는 텍스트만 제출을 안내한다', () => {
  const out = form({ initial: { nameError: 'empty', foodName: '' } })
  assert.match(out, /aria-invalid="true"/)
  const id = out.match(/aria-describedby="([^"]+)"/)[1]
  assert.match(out, new RegExp(`<p id="${id.replace(/:/g, '\\:')}"`))
  assert.match(text(out), /음식 이름을 입력해 주세요/)
  const att = form({ initial: { attachmentError: 'size' } })
  assert.match(att, /data-request-attachment-error/)
  assert.match(
    text(att),
    /10MB 이하만 첨부할 수 있어요.*텍스트만 요청해도 괜찮아요/,
  )
})

test('F03 상태: 연결 전·실패는 접수되지 않았다고 알리고 완료 문구가 없다. 완료는 서버 결과가 있을 때만 접수 번호를 보인다', () => {
  const states = {}
  for (const phase of ['preparing', 'submitting', 'unavailable', 'failed']) {
    states[phase] = form({ initial: { phase: { phase }, foodName: '두부' } })
    assert.match(
      states[phase],
      new RegExp(`data-request-state="${phase}"`),
      phase,
    )
    assert.match(states[phase], /value="두부"/, phase)
  }
  for (const phase of ['preparing', 'submitting']) {
    assert.match(states[phase], /<button[^>]* aria-disabled="true"/, phase)
  }
  assert.match(text(states.unavailable), /접수되지 않았고 저장되지도 않았어요/)
  assert.match(text(states.failed), /다시 시도해 주세요/)
  for (const phase of ['preparing', 'submitting', 'unavailable', 'failed']) {
    assert.doesNotMatch(text(states[phase]), /접수되었어요|접수 번호/, phase)
  }
  const accepted = form({
    initial: {
      phase: {
        phase: 'done',
        result: { kind: 'accepted', requestId: 'REQ-77' },
      },
    },
  })
  assert.match(text(accepted), /접수되었어요\. 접수 번호 REQ-77/)
  assert.ok(hrefs(accepted).includes('/mypage/requests'))
  const similar = form({
    initial: {
      phase: { phase: 'done', result: { kind: 'similar', requestId: 'REQ-5' } },
    },
  })
  assert.match(text(similar), /비슷한 요청이 이미 있어요.*REQ-5/)
  assert.doesNotMatch(text(similar), /접수되었어요/)
})

// ── P04·P04-1 화면 ────────────────────────────────────────────────────────────
const view = (state, props) =>
  html(createElement(View, { state, onRetry() {}, ...props }))
const sample = [
  item({
    requestId: 'FOOD-3',
    foodName: '현미 닭가슴살 도시락',
    status: 'received',
  }),
  item({
    requestId: 'FOOD-2',
    foodName: '무가당 그릭요거트',
    brand: '○○유업',
    description: '설명 문구',
    adminComments: [
      comment('r1', '2026-10-30T02:00:00Z', 'received', '확인했습니다.'),
      comment('r2', '2026-11-02T00:00:00Z', '검토 중', '검토를 시작할게요.'),
    ],
  }),
  item({ requestId: 'FOOD-1', foodName: '두부 샐러드', status: '반영 완료' }),
]

test('P04 상태: 조회 중·서버 연결 전·조회 실패·요청 없음이 서로 다르고, 연결 전을 "요청 없음"이라고 하지 않는다', () => {
  const loading = view({ status: 'loading' })
  assert.match(loading, /data-request-list="loading"/)
  const unavailable = view({ status: 'unavailable' })
  assert.match(unavailable, /data-request-list="unavailable"/)
  assert.match(text(unavailable), /아직 볼 수 없어요/)
  assert.match(text(unavailable), /요청이 없다는 뜻이 아니에요/)
  assert.doesNotMatch(text(unavailable), /아직 요청한 음식이 없어요/)
  const error = view({ status: 'error' })
  assert.match(error, /role="alert"/)
  assert.match(error, /data-request-retry/)
  assert.match(text(error), /요청이 없는 것은 아니에요/)
  const empty = view({ status: 'empty' })
  assert.match(empty, /data-request-list="empty"/)
  assert.match(text(empty), /아직 요청한 음식이 없어요/)
  for (const out of [loading, unavailable, error, empty]) {
    assert.ok(hrefs(out).includes('/foods/request'))
    assert.doesNotMatch(out, /data-request-item/)
  }
})

test('P04-1 요청 있음: 전체 건수·상태 필터 건수·카드(음식명·접수 번호·요청일·상태·처리 안내·상세)', () => {
  const out = view({ status: 'ready', items: sample })
  const t = text(out)
  assert.match(t, /전체 3건/)
  assert.deepEqual(
    [...out.matchAll(/data-request-filter="(\w+)"/g)].map((m) => m[1]),
    ['all', 'received', 'review', 'completed'],
  )
  assert.equal((out.match(/data-request-item="/g) ?? []).length, 3)
  assert.match(t, /현미 닭가슴살 도시락/)
  assert.match(t, /접수 번호 FOOD-2/)
  assert.match(t, /요청일 2026\./)
  assert.match(t, /브랜드 ○○유업/)
  assert.match(t, /설명 문구/)
  // 상태는 서버 값: 마지막 관리자 메모(검토 중)가 배지가 된다
  assert.match(
    out.match(/<article[^>]*data-request-item="FOOD-2"[^>]*>/)[0],
    /data-request-status="review"/,
  )
  assert.match(
    out.match(/<article[^>]*data-request-item="FOOD-1"[^>]*>/)[0],
    /data-request-status="completed"/,
  )
  assert.match(t, /반영 완료/)
  assert.match(t, /음식 정보와 영양 자료를 확인하고 있어요/)
})

test('요청 카드의 관리자 진행 메모는 접힌 드롭다운이고 시간순이며 없으면 안내한다', () => {
  const out = view({ status: 'ready', items: sample })
  assert.equal((out.match(/<details/g) ?? []).length, 3)
  assert.doesNotMatch(out, /<details[^>]* open/)
  const thread = out.match(
    /<details data-request-thread="FOOD-2".*?<\/details>/s,
  )[0]
  assert.ok(
    thread.indexOf('확인했습니다.') < thread.indexOf('검토를 시작할게요.'),
  )
  assert.match(text(thread), /관리자 진행 메모 2개/)
  assert.match(text(thread), /관리자 · \d{4}/)
  const none = out.match(
    /<details data-request-thread="FOOD-3".*?<\/details>/s,
  )[0]
  assert.match(text(none), /아직 관리자 메모가 없어요/)
})

test('상태 필터: 선택한 상태만 보이고 건수 버튼은 눌림 상태를 알린다', () => {
  const out = view(
    { status: 'ready', items: sample },
    { initialFilter: 'review' },
  )
  assert.equal((out.match(/data-request-item="/g) ?? []).length, 1)
  assert.match(out, /data-request-item="FOOD-2"/)
  assert.match(
    out.match(/<button[^>]*data-request-filter="review"[^>]*>/)[0],
    /aria-pressed="true"/,
  )
  assert.match(
    out.match(/<button[^>]*data-request-filter="all"[^>]*>/)[0],
    /aria-pressed="false"/,
  )
  const none = view(
    { status: 'ready', items: [sample[0]] },
    { initialFilter: 'completed' },
  )
  assert.match(text(none), /이 상태의 요청이 없어요/)
})

test('P04 필터: 추가정보 필요·반려는 전체에만 보이고, 필터별 건수와 실제 표시 항목이 일치한다', () => {
  const items = [
    item({ requestId: 'a', status: 'received' }),
    item({ requestId: 'b', status: 'review' }),
    item({ requestId: 'c', status: 'completed' }),
    item({ requestId: 'd', status: '반려' }),
    item({ requestId: 'e', status: '추가정보 필요' }),
    item({ requestId: 'f', status: 'something-new' }),
  ]
  const counts = R.filterCounts(items)
  assert.equal(counts.all, 6)
  for (const filter of R.REQUEST_FILTERS) {
    const out = view({ status: 'ready', items }, { initialFilter: filter })
    const shown = [...out.matchAll(/data-request-item="(\w+)"/g)].map(
      (m) => m[1],
    )
    assert.equal(shown.length, counts[filter], `${filter} 건수 = 표시 항목`)
    // 버튼에 적힌 건수도 같은 값이다
    assert.match(
      out.match(
        new RegExp(
          `<button[^>]*data-request-filter="${filter}"[^>]*>.*?</button>`,
          's',
        ),
      )[0],
      new RegExp(`>${counts[filter]}<`),
    )
    if (filter !== 'all') {
      for (const id of ['d', 'e', 'f'])
        assert.ok(!shown.includes(id), `${filter}에 ${id} 없음`)
    }
  }
  const all = view({ status: 'ready', items })
  for (const id of ['a', 'b', 'c', 'd', 'e', 'f'])
    assert.match(all, new RegExp(`data-request-item="${id}"`))
  const t = text(all)
  assert.match(t, /반려/)
  assert.match(t, /추가 정보 필요/)
  assert.deepEqual(
    [...all.matchAll(/data-request-filter="(\w+)"/g)].map((m) => m[1]),
    ['all', 'received', 'review', 'completed'], // 필터 버튼은 명세대로 4개
  )
})

test('알 수 없는 서버 상태·형식이 잘못된 값이 들어와도 화면이 깨지지 않는다', () => {
  const odd = [
    item({ requestId: 'u1', status: null }),
    item({ requestId: 'u2', status: '이상한 값', createdAt: 'not a date' }),
    item({ requestId: 'u3', status: undefined, adminComments: undefined }),
    item({
      requestId: 'u4',
      adminComments: [
        comment('x', null, '???', '본문'),
        comment('y', 'bad', null, '둘째'),
      ],
    }),
  ]
  const out = view({ status: 'ready', items: odd })
  assert.equal((out.match(/data-request-item="/g) ?? []).length, 4)
  assert.equal((out.match(/data-request-status="unknown"/g) ?? []).length, 3)
  assert.match(text(out), /상태 확인 중/)
  assert.match(text(out), /접수일 미기록/)
  assert.match(text(out), /작성일 미기록/)
  // 알 수 없는 상태는 전체에서만 보이고 어떤 필터 건수에도 들어가지 않는다
  assert.deepEqual(R.filterCounts(odd), {
    all: 4,
    received: 1,
    review: 0,
    completed: 0,
  })
  assert.equal(R.requestStatus(odd[2]), 'unknown')
})

test('읽기 전용: 이 앱은 요청 상태를 바꾸거나 승인하는 버튼이 없다', () => {
  const out = view({ status: 'ready', items: sample })
  assert.doesNotMatch(text(out), /승인|반려하기|등록하기|삭제|취소하기/)
  assert.deepEqual(
    [...out.matchAll(/<button[^>]*>/g)].filter(
      (m) => !/data-request-filter/.test(m[0]),
    ).length,
    0,
  )
})

// ── 라우트·연결·범위 ──────────────────────────────────────────────────────────
test('라우트: F03·P04는 회원 전용이고 /foods/request는 동적 /foods/:foodId와 겹치지 않는다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const f03 = router.indexOf("path: 'foods/request',")
  const p04 = router.indexOf("path: 'mypage/requests',")
  const detail = router.indexOf("path: 'foods/:foodId',")
  assert.ok(f03 > gate && p04 > gate, 'AuthGate 안')
  assert.ok(
    detail > 0 && detail < gate,
    '동적 라우트는 회원 전용 밖(비회원 열람)',
  )
  assert.match(
    router.slice(f03, f03 + 500),
    /screenId: 'F03'[\s\S]*parent: '\/foods'/,
  )
  assert.match(
    router.slice(p04, p04 + 500),
    /screenId: 'P04'[\s\S]*parent: '\/settings'/,
  )
  assert.doesNotMatch(router, /screenId: 'P04-1'/)
})

test('라우터 우선순위: /foods/request가 F03으로, /foods/<id>가 F02로 간다', async () => {
  const { matchRoutes } = await import('react-router')
  const routes = [
    {
      path: '/',
      children: [
        { path: 'foods/:foodId', id: 'F02' },
        { path: 'foods/request', id: 'F03' },
      ],
    },
  ]
  assert.equal(matchRoutes(routes, '/foods/request').at(-1).route.id, 'F03')
  assert.equal(matchRoutes(routes, '/foods/abc').at(-1).route.id, 'F02')
})

test('연결: P09 "내 요청 내역"→P04(이전은 설정), F01 결과 없음→F03', () => {
  const menu = read('../src/settings/settingsMenu.ts')
  assert.match(
    menu,
    /label: '내 요청 내역',\s*to: '\/mypage\/requests',\s*returnHere: true/,
  )
  const foods = read('../src/pages/FoodsPage.tsx')
  assert.match(foods, /to="\/foods\/request"/)
  assert.match(foods, /state=\{\{ from: '\/foods' \}\}/)
  assert.doesNotMatch(foods, /등록 요청은 준비 중/)
})

test('범위 준수: 저장·네트워크·계정 조회·음식 DB·IndexedDB를 쓰지 않고 개발용 예시 데이터가 번들 코드에 없다', () => {
  for (const file of [
    '../src/food-request/foodRequest.ts',
    '../src/food-request/useFoodRequests.ts',
    '../src/components/food/request/FoodRequestForm.tsx',
    '../src/components/food/request/RequestHistoryView.tsx',
    '../src/pages/FoodRequestPage.tsx',
    '../src/pages/MyRequestsPage.tsx',
  ]) {
    const body = code(file)
    assert.doesNotMatch(
      body,
      /localStorage|sessionStorage|indexedDB|fetch\(|axios|XMLHttpRequest/,
      file,
    )
    assert.doesNotMatch(
      body,
      /foodRepository|createFoodRepository|workoutSource|mealSource/,
      file,
    )
    assert.doesNotMatch(
      body,
      /FOOD-EX|requestHistoryExamples|import\.meta\.env\.DEV/,
      file,
    )
  }
  // 실제 화면은 시험용 초기 상태를 넘기지 않는다
  assert.doesNotMatch(code('../src/pages/FoodRequestPage.tsx'), /initial=/)
  assert.doesNotMatch(code('../src/pages/MyRequestsPage.tsx'), /initialFilter/)
  // 완료는 runFoodRequest 결과로만 정해진다
  assert.match(
    code('../src/components/food/request/FoodRequestForm.tsx'),
    /setState\(result\)/,
  )
  assert.doesNotMatch(
    code('../src/components/food/request/FoodRequestForm.tsx'),
    /phase: 'done'/,
  )
})
