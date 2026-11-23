// S02 문의 작성 · P13 내 문의: 입력 검증(필수·trim·길이 제한 없음) · 서버 연결 전/조회 상태 구분 · 화면 상태 · 진입점 · 라우트(회원 전용)를 확인한다.
// 문의 API가 없어 접수 성공·문의 내역을 가장하는 테스트는 없다. 서버 응답이 필요한 경우(접수 성공·목록 있음)는 시험용 가짜 source를
// 화면에 직접 넘겨 "서버가 준 값만 보여 준다"는 규칙을 확인한다(실제 서비스 데이터가 아니다). 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, inq, Form, History, Notice, Faq, menu
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  const load = (path) => server.ssrLoadModule(path)
  inq = await load('/src/inquiry/inquiry.ts')
  Form = (await load('/src/components/support/InquiryForm.tsx')).default
  History = (await load('/src/components/support/InquiryHistoryView.tsx'))
    .default
  Notice = (await load('/src/components/support/NoticeListView.tsx')).default
  Faq = (await load('/src/components/support/FaqView.tsx')).default
  menu = await load('/src/settings/settingsMenu.ts')
})
after(async () => {
  await server?.close()
})

const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const noop = () => {}
const signal = new AbortController().signal
const hrefs = (html) => [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1])

// ── 검증 ──────────────────────────────────────────────────────────────────
test('S02 유형은 명세의 4가지이고 처음에는 기록 이용이 선택돼 있다', () => {
  assert.deepEqual(
    inq.INQUIRY_TYPES.map((t) => inq.INQUIRY_TYPE_LABEL[t]),
    ['기록 이용', '계정', '멤버십', '음식 요청'],
  )
  assert.equal(inq.DEFAULT_INQUIRY_TYPE, 'record')
})

test('제목·내용은 앞뒤 공백을 뺀 뒤 비어 있으면 차단하고 화면 순서로 알린다', () => {
  for (const blank of ['', '   ', '\n\t  ']) {
    assert.equal(inq.validateInquiryField(blank), 'empty')
  }
  assert.equal(inq.validateInquiryField(' a '), null)
  const none = inq.validateInquiry({ type: 'account', title: '  ', body: '' })
  assert.deepEqual(none, { ok: false, errors: ['title', 'body'] })
  assert.deepEqual(
    inq.validateInquiry({ type: 'account', title: '제목', body: ' \n ' }),
    { ok: false, errors: ['body'] },
  )
  assert.deepEqual(
    inq.validateInquiry({ type: 'food', title: ' 제목 ', body: '\n내용 \n' }),
    { ok: true, input: { type: 'food', title: '제목', body: '내용' } },
  )
})

test('글자 수 제한 같은 명세에 없는 규칙을 만들지 않는다(아주 긴 입력도 통과)', () => {
  const long = '가'.repeat(20_000)
  const checked = inq.validateInquiry({
    type: 'record',
    title: long,
    body: long,
  })
  assert.equal(checked.ok, true)
  assert.equal(checked.input.title.length, 20_000)
})

test('오류 문구는 칸 이름을 알리고 입력값을 담지 않는다', () => {
  assert.equal(inq.INQUIRY_ERROR_MESSAGE.title, '문의 제목을 입력해 주세요.')
  assert.equal(inq.INQUIRY_ERROR_MESSAGE.body, '문의 내용을 입력해 주세요.')
})

// ── 연결(source)·상태 ─────────────────────────────────────────────────────
test('서버 연결은 아직 없다(source는 null)이고 연결이 없으면 접수·조회를 하지 않는다', async () => {
  assert.equal(inq.createInquirySource(), null)
  const input = { type: 'record', title: 't', body: 'b' }
  assert.equal(await inq.runCreateInquiry(null, input, signal), null)
  assert.deepEqual(await inq.runListInquiries(null, signal), {
    status: 'unavailable',
  })
})

test('접수는 서버가 접수 응답을 줄 때만 done이고 예외는 failed다', async () => {
  const input = { type: 'record', title: 't', body: 'b' }
  const ok = {
    createInquiry: async () => ({ inquiryId: 'Q-1' }),
    listInquiries: async () => [],
  }
  assert.deepEqual(await inq.runCreateInquiry(ok, input, signal), {
    phase: 'done',
    result: { inquiryId: 'Q-1' },
  })
  const bad = {
    createInquiry: async () => {
      throw new Error('boom')
    },
    listInquiries: async () => [],
  }
  assert.deepEqual(await inq.runCreateInquiry(bad, input, signal), {
    phase: 'failed',
  })
})

test('목록 조회 상태: 서버 값이 비면 empty, 있으면 ready, 예외는 error, 연결 전은 unavailable(empty 아님)', async () => {
  const make = (list) => ({
    createInquiry: async () => ({ inquiryId: 'x' }),
    listInquiries: list,
  })
  assert.deepEqual(
    await inq.runListInquiries(
      make(async () => []),
      signal,
    ),
    {
      status: 'empty',
    },
  )
  const items = [
    {
      inquiryId: 'Q-1',
      type: 'record',
      title: 't',
      body: 'b',
      createdAt: null,
      reply: null,
    },
  ]
  assert.deepEqual(
    await inq.runListInquiries(
      make(async () => items),
      signal,
    ),
    {
      status: 'ready',
      items,
    },
  )
  assert.deepEqual(
    await inq.runListInquiries(
      make(async () => {
        throw new Error('x')
      }),
      signal,
    ),
    { status: 'error' },
  )
  assert.notDeepEqual(await inq.runListInquiries(null, signal), {
    status: 'empty',
  })
})

test('답변 여부는 서버 값(reply)이 정하고, 모르는 유형·날짜는 지어내지 않는다', () => {
  const base = {
    inquiryId: 'Q',
    type: 'record',
    title: 't',
    body: 'b',
    createdAt: null,
  }
  assert.equal(inq.inquiryStatus({ ...base, reply: null }), 'waiting')
  assert.equal(
    inq.inquiryStatus({
      ...base,
      reply: { authorName: null, createdAt: null, body: '답' },
    }),
    'answered',
  )
  assert.equal(inq.inquiryTypeLabel('account'), '계정')
  assert.equal(inq.inquiryTypeLabel('exotic'), null)
  assert.equal(inq.inquiryTypeLabel('toString'), null)
  assert.equal(inq.inquiryDateLabel(null), '접수일 미기록')
  assert.equal(inq.inquiryDateLabel('not-a-date'), '접수일 미기록')
  assert.match(
    inq.inquiryDateLabel('2026-11-20T00:00:00+09:00'),
    /2026\.\s?11\.\s?20/,
  )
  assert.equal(inq.replyTimeLabel(undefined), '작성일 미기록')
})

test('문의는 최신순이고 날짜가 없는 항목은 맨 아래다', () => {
  const mk = (id, createdAt) => ({
    inquiryId: id,
    type: 'record',
    title: id,
    body: '',
    createdAt,
    reply: null,
  })
  const sorted = inq.sortInquiries([
    mk('none', null),
    mk('old', '2026-11-01T00:00:00+09:00'),
    mk('new', '2026-11-20T00:00:00+09:00'),
  ])
  assert.deepEqual(
    sorted.map((i) => i.inquiryId),
    ['new', 'old', 'none'],
  )
})

// ── 화면: S02 ─────────────────────────────────────────────────────────────
const form = (props = {}) =>
  render(createElement(Form, { source: null, cancelTo: '/support', ...props }))
const fakeSource = {
  createInquiry: async () => ({ inquiryId: 'Q-1' }),
  listInquiries: async () => [],
}

test('S02 연결 전: 안내가 보이고 제출은 비활성이며 접수·저장됐다는 표현이 없다', () => {
  const html = form()
  assert.match(html, /문의 접수 기능이 아직 서버에 연결되지 않았어요/)
  assert.match(html, /접수되지도 저장되지도 않아요/)
  assert.match(html, /role="status"[^>]*data-inquiry-unavailable/)
  assert.match(
    html,
    /<button[^>]*data-inquiry-submit[^>]*disabled=""|<button[^>]*disabled=""[^>]*data-inquiry-submit/,
  )
  assert.doesNotMatch(
    html,
    /접수되었어요|접수가 완료|등록되었어요|감사합니다|data-inquiry-state="done"/,
  )
  // 입력 폼은 확인할 수 있다.
  assert.match(html, /name="inquiryTitle"/)
  assert.match(html, /name="inquiryBody"/)
})

test('S02 구성: 01 유형 라디오 4개(기본 기록 이용)·02 제목·내용 필수·답변 확인 안내·취소', () => {
  const html = form({ cancelTo: '/settings' })
  assert.match(html, /<legend[^>]*>[\s\S]*01[\s\S]*문의 유형/)
  assert.match(html, /<h2[^>]*>[\s\S]*02[\s\S]*문의 내용/)
  const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(
    (m) => m[0],
  )
  assert.equal(radios.length, 4)
  assert.equal(radios.filter((r) => /checked/.test(r)).length, 1)
  assert.match(
    radios.find((r) => /checked/.test(r)),
    /value="record"/,
  )
  for (const label of ['기록 이용', '계정', '멤버십', '음식 요청'])
    assert.match(html, new RegExp(label))
  assert.equal((html.match(/>필수</g) ?? []).length, 2)
  assert.match(html, /<label[^>]*for="[^"]*"[^>]*>[^<]*문의 제목/)
  assert.match(html, /<label[^>]*for="[^"]*"[^>]*>[^<]*문의 내용/)
  assert.match(html, /aria-required="true"/)
  assert.match(
    html,
    /답변은 상세 설정의[\s\S]*내 문의[\s\S]*에서 확인할 수 있어요/,
  )
  assert.ok(hrefs(html).includes('/mypage/inquiries'))
  assert.match(html, /data-inquiry-cancel[^>]*href="\/settings"/)
  assert.match(html, /민감한 정보는 문의에 꼭 필요한 만큼만/)
})

test('S02 연결됨(시험용 source): 안내가 없고 제출이 활성이다', () => {
  const html = form({ source: fakeSource })
  assert.doesNotMatch(html, /data-inquiry-unavailable/)
  assert.doesNotMatch(html, /data-inquiry-submit[^>]*disabled=""/)
  assert.doesNotMatch(html, /서버에 연결되면 문의를 보낼 수 있어요/)
})

test('S02 입력 오류: 칸별 안내와 aria-invalid·aria-describedby가 연결된다', () => {
  const html = form({
    source: fakeSource,
    initial: { shown: ['title', 'body'], phase: { phase: 'invalid' } },
  })
  assert.match(html, /문의 제목을 입력해 주세요\./)
  assert.match(html, /문의 내용을 입력해 주세요\./)
  assert.equal((html.match(/aria-invalid="true"/g) ?? []).length, 2)
  for (const id of html.match(/aria-describedby="[^"]*-error"/g) ?? [])
    assert.ok(html.includes(`id="${id.slice(18, -1)}"`))
  assert.match(html, /필수 항목을 입력해 주세요/)
  // 값이 있으면 오류를 보이지 않는다.
  const ok = form({
    source: fakeSource,
    initial: { shown: ['title', 'body'], title: '제목', body: '내용' },
  })
  assert.doesNotMatch(ok, /aria-invalid="true"/)
})

test('S02 유형을 바꿔 시작해도 제목·내용이 유지된다(상태가 칸마다 분리)', () => {
  const html = form({ initial: { type: 'food', title: '제목', body: '내용' } })
  assert.match(html, /value="제목"/)
  assert.match(html, /<textarea[^>]*>내용<\/textarea>/)
  const radios = [...html.matchAll(/<input[^>]*type="radio"[^>]*>/g)].map(
    (m) => m[0],
  )
  assert.match(
    radios.find((r) => /checked/.test(r)),
    /value="food"/,
  )
})

test('S02 제출 중·실패 상태: 중복 제출을 막고 입력을 유지한다는 안내가 보인다', () => {
  const busy = form({
    source: fakeSource,
    initial: { phase: { phase: 'submitting' } },
  })
  assert.match(busy, /aria-busy="true"/)
  assert.match(busy, /문의를 접수하고 있어요/)
  assert.match(
    busy,
    /data-inquiry-submit[^>]*disabled=""|disabled=""[^>]*data-inquiry-submit/,
  )
  assert.match(busy, /접수 중…/)
  const failed = form({
    source: fakeSource,
    initial: { phase: { phase: 'failed' } },
  })
  assert.match(failed, /문의를 보내지 못했어요/)
  assert.match(failed, /입력한 내용은 그대로 남아 있으니/)
  assert.doesNotMatch(failed, /data-inquiry-submit[^>]*disabled=""/)
})

test('S02는 접수 완료 화면을 그리지 않는다(done은 이동 신호일 뿐)', () => {
  const html = form({
    source: fakeSource,
    initial: { phase: { phase: 'done', result: { inquiryId: 'Q-1' } } },
  })
  assert.doesNotMatch(html, /접수 번호|접수되었|등록되었|Q-1/)
})

// ── 화면: P13 ─────────────────────────────────────────────────────────────
const history = (state, onRetry = noop) =>
  render(createElement(History, { state, onRetry }))
const reply = {
  authorName: '운영팀',
  createdAt: '2026-11-20T10:30:00+09:00',
  body: '확인했어요.',
}
const items = [
  {
    inquiryId: 'Q-1',
    type: 'account',
    title: '비밀번호 문의',
    body: '로그인이 안 돼요.\n도와 주세요.',
    createdAt: '2026-11-18T09:00:00+09:00',
    reply: null,
  },
  {
    inquiryId: 'Q-2',
    type: 'membership',
    title: '멤버십 문의',
    body: '해지 방법이 궁금해요.',
    createdAt: '2026-11-20T09:00:00+09:00',
    reply,
  },
]

test('P13 조회 중: 안내만 보이고 목록·빈 상태 문구는 없다', () => {
  const html = history({ status: 'loading' })
  assert.match(html, /<h1[^>]*>내 문의<\/h1>/)
  assert.match(html, /문의 내역을 불러오는 중이에요/)
  assert.doesNotMatch(html, /아직 남긴 문의가 없어요|문의 목록/)
})

test('P13 서버 연결 전: "아직 볼 수 없어요"이며 문의 없음이 아니다', () => {
  const html = history({ status: 'unavailable' })
  assert.match(html, /문의 내역을 아직 볼 수 없어요/)
  assert.match(html, /문의가 없다는 뜻이 아니에요/)
  assert.doesNotMatch(html, /아직 남긴 문의가 없어요|첫 문의 남기기|<details/)
  assert.match(html, /data-inquiry-list="unavailable"/)
  // 작성 화면으로 가는 버튼은 있다.
  assert.match(html, /href="\/support\/inquiry"[^>]*>문의하기</)
})

test('P13 조회 실패: 오류 알림과 다시 시도, 문의 없음 문구가 없다', () => {
  let retried = 0
  const html = history({ status: 'error' }, () => (retried += 1))
  assert.match(html, /role="alert"/)
  assert.match(html, /문의 내역을 불러오지 못했어요/)
  assert.match(html, /문의가 없는 것은 아니에요/)
  assert.match(html, /data-inquiry-retry/)
  assert.doesNotMatch(html, /아직 남긴 문의가 없어요/)
})

test('P13 문의 없음: 빈 안내와 첫 문의 버튼(S02)이 있다', () => {
  const html = history({ status: 'empty' })
  assert.match(html, /아직 남긴 문의가 없어요/)
  assert.match(html, /href="\/support\/inquiry"[^>]*>첫 문의 남기기</)
  assert.doesNotMatch(html, /아직 볼 수 없어요/)
})

test('P13 문의 있음: 최신순 목록·건수·유형·접수 번호·날짜·상태·펼침 내용·답변/미답변 안내', () => {
  const html = history({ status: 'ready', items })
  assert.match(html, /전체 2건/)
  assert.ok(
    html.indexOf('멤버십 문의') < html.indexOf('비밀번호 문의'),
    '최신 문의가 위',
  )
  assert.equal((html.match(/<details/g) ?? []).length, 2)
  assert.match(html, />답변 완료</)
  assert.match(html, />답변 대기</)
  assert.match(html, /접수 번호 Q-2/)
  assert.match(html, /2026\.\s?11\.\s?20/)
  assert.match(html, />멤버십</)
  assert.match(html, /해지 방법이 궁금해요/)
  assert.match(
    html,
    /운영팀 · 2026\.\s?11\.\s?20\.?\s?10:30|운영팀 ·[\s\S]*10:30/,
  )
  assert.match(html, /확인했어요\./)
  assert.match(html, /아직 답변이 등록되지 않았어요/)
  assert.equal((html.match(/data-inquiry-no-reply/g) ?? []).length, 1)
  assert.match(html, /href="\/support\/inquiry"[^>]*>문의하기</)
  assert.doesNotMatch(html, /첫 문의 남기기/)
})

test('P13 모르는 유형·작성자 없는 답변은 지어내지 않고 안전하게 보인다', () => {
  const html = history({
    status: 'ready',
    items: [
      {
        inquiryId: 'Q-9',
        type: 'exotic',
        title: 'x',
        body: 'y',
        createdAt: null,
        reply: { authorName: null, createdAt: null, body: 'z' },
      },
    ],
  })
  assert.match(html, /유형 미기록/)
  assert.match(html, /접수일 미기록/)
  assert.match(html, /관리자 · 작성일 미기록/)
})

test('P13 문의 본문·답변은 HTML이 아니라 글자로 표시한다(이스케이프)', () => {
  const html = history({
    status: 'ready',
    items: [
      {
        inquiryId: 'Q-1',
        type: 'record',
        title: '<img src=x onerror=alert(1)>',
        body: '<script>alert(1)</script>',
        createdAt: null,
        reply: null,
      },
    ],
  })
  assert.doesNotMatch(html, /<img src=x|<script>alert/)
  assert.match(html, /&lt;script&gt;/)
})

// ── 진입점 ────────────────────────────────────────────────────────────────
test('P09 설정: 문의(S02)·내 문의(P13)가 링크이고 "이전"이 설정으로 돌아온다', () => {
  const items = menu.SETTINGS_MENU_GROUPS.flatMap((g) => g.items)
  const s02 = items.find((i) => i.screenId === 'S02')
  const p13 = items.find((i) => i.screenId === 'P13')
  assert.equal(s02.to, '/support/inquiry')
  assert.equal(p13.to, '/mypage/inquiries')
  assert.equal(s02.returnHere, true)
  assert.equal(p13.returnHere, true)
})

test('S01·S04: 1:1 문의는 S02 링크이고 키워드 챗봇만 준비 중이다', () => {
  const list = render(
    createElement(Notice, { notices: [], query: '', onQueryChange: noop }),
  )
  const faq = render(
    createElement(Faq, { items: [], query: '', onQueryChange: noop }),
  )
  for (const html of [list, faq]) {
    assert.ok(hrefs(html).includes('/support/inquiry'))
    assert.match(html, /1:1 문의/)
    assert.equal((html.match(/준비 중/g) ?? []).length, 1)
    assert.match(html, /키워드 챗봇/)
  }
})

// ── 라우트 ────────────────────────────────────────────────────────────────
test('라우트: S02·P13은 승인 경로·회원 전용(AuthGate)·하단 탭 마이·h1 직접', () => {
  const router = readFileSync('src/app/router.tsx', 'utf8')
  for (const [path, id, parent] of [
    ['support/inquiry', 'S02', '/support'],
    ['mypage/inquiries', 'P13', '/settings'],
  ]) {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > 0, path)
    const block = router.slice(
      at,
      router.indexOf('} satisfies RouteHandle', at),
    )
    assert.match(block, new RegExp(`screenId: '${id}'`))
    assert.match(block, /tab: 'my'/)
    assert.match(block, /ownH1: true/)
    assert.match(
      block,
      new RegExp(`parent: '${parent.replaceAll('/', '\\/')}'`),
    )
    // 이 경로 앞의 가장 가까운 게이트가 AuthGate다(비회원은 로그인 안내).
    const before = router.slice(0, at)
    assert.ok(
      before.lastIndexOf('element: <AuthGate />') >
        before.lastIndexOf('element: <AuthOrExperienceGate />'),
      path,
    )
  }
})

test('문의 화면은 서버 호출·가짜 데이터·저장소 API를 쓰지 않는다', () => {
  const strip = (text) => text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
  const files = [
    'src/inquiry/inquiry.ts',
    'src/inquiry/useInquiries.ts',
    'src/pages/InquiryPage.tsx',
    'src/pages/MyInquiriesPage.tsx',
    'src/components/support/InquiryForm.tsx',
    'src/components/support/InquiryHistoryView.tsx',
  ]
  for (const file of files)
    assert.doesNotMatch(
      strip(readFileSync(file, 'utf8')),
      /fetch\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|indexedDB|console\.|\/api\/v1/,
      file,
    )
})
