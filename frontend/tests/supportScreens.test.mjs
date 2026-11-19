import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// FAST-01: 랜딩 연결·P07 즐겨찾기·S01 공지·S01-1 공지 상세·S04 FAQ·P15 레벨 안내의 렌더링과 데이터 규칙.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 이동·키보드·반응형은 Chrome 스크립트(support-screens)가 검증한다.
let server
let N // support/notices.ts
let F // support/faq.ts
let NoticeList
let NoticeDetail
let Faq
let Favorites
let LevelGuide
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  N = await server.ssrLoadModule('/src/support/notices.ts')
  F = await server.ssrLoadModule('/src/support/faq.ts')
  NoticeList = (
    await server.ssrLoadModule('/src/components/support/NoticeListView.tsx')
  ).default
  NoticeDetail = (
    await server.ssrLoadModule('/src/components/support/NoticeDetailView.tsx')
  ).default
  Faq = (await server.ssrLoadModule('/src/components/support/FaqView.tsx'))
    .default
  Favorites = (
    await server.ssrLoadModule('/src/components/favorites/FavoritesView.tsx')
  ).default
  LevelGuide = (
    await server.ssrLoadModule('/src/components/level/LevelGuideView.tsx')
  ).default
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

// ── 공지 데이터 규칙 ──
const notice = (n, over = {}) => ({
  id: `n${n}`,
  category: '계정',
  title: `공지 ${n}`,
  body: `본문 ${n}\n둘째 문단 ${n}`,
  author: '운영팀',
  publishedAt: `2026-11-${String(10 + n).padStart(2, '0')}`,
  ...over,
})

test('공지 데이터: 운영 공지가 없으므로 목록은 비어 있고 공지를 만들어 채우지 않는다', () => {
  assert.deepEqual([...N.getNotices()], [])
  assert.deepEqual([...N.NOTICE_CATEGORIES], ['멤버십', '기록', '계정', '음식'])
})

test('공지 정렬·검색·이전/다음: 최신순, 제목·본문 검색, 검색 결과 안에서 앞뒤를 찾는다', () => {
  const list = [notice(1), notice(3), notice(2, { title: '점검 안내' })]
  const sorted = N.sortNotices(list)
  assert.deepEqual(
    sorted.map((x) => x.id),
    ['n3', 'n2', 'n1'],
  )
  // 같은 날짜는 id 내림차순
  assert.deepEqual(
    N.sortNotices([
      notice(1, { publishedAt: '2026-11-20' }),
      notice(2, { publishedAt: '2026-11-20' }),
    ]).map((x) => x.id),
    ['n2', 'n1'],
  )
  assert.deepEqual(
    N.filterNotices(sorted, '  점검 ').map((x) => x.id),
    ['n2'],
  )
  assert.deepEqual(
    N.filterNotices(sorted, '둘째 문단 1').map((x) => x.id),
    ['n1'],
  )
  assert.equal(N.filterNotices(sorted, '').length, 3)
  assert.equal(N.filterNotices(sorted, '없는말').length, 0)
  // 이전 글 = 더 최근, 다음 글 = 더 오래된
  const mid = N.findNoticeNeighbors(sorted, 'n2')
  assert.equal(mid.notice.id, 'n2')
  assert.equal(mid.previous.id, 'n3')
  assert.equal(mid.next.id, 'n1')
  const first = N.findNoticeNeighbors(sorted, 'n3')
  assert.equal(first.previous, null)
  const last = N.findNoticeNeighbors(sorted, 'n1')
  assert.equal(last.next, null)
  // 검색어가 있고 결과에 들어 있으면 결과 안에서, 아니면 전체에서
  const inSearch = N.findNoticeNeighbors(sorted, 'n3', '공지')
  assert.equal(inSearch.next.id, 'n1')
  const outOfSearch = N.findNoticeNeighbors(sorted, 'n3', '점검')
  assert.equal(outOfSearch.next.id, 'n2')
  // 없는 id
  assert.deepEqual(N.findNoticeNeighbors(sorted, 'nope'), {
    notice: null,
    previous: null,
    next: null,
  })
})

test('공지 경로·날짜: 검색어를 인코딩해 유지하고 날짜를 UTC로 해석하지 않는다', () => {
  assert.equal(N.noticeListPath(''), '/support')
  assert.equal(N.noticeListPath('  '), '/support')
  assert.equal(
    N.noticeListPath('점검 안내'),
    '/support?q=%EC%A0%90%EA%B2%80%20%EC%95%88%EB%82%B4',
  )
  assert.equal(N.noticeDetailPath('a b', ''), '/support/notices/a%20b')
  assert.equal(N.noticeDetailPath('n1', 'x&y'), '/support/notices/n1?q=x%26y')
  assert.equal(N.formatNoticeDate('2026-11-18'), '2026년 11월 18일')
  assert.equal(N.formatNoticeDate('깨진값'), '깨진값')
})

// ── S01 공지 목록 화면 ──
const listHtml = (notices, query = '') =>
  html(createElement(NoticeList, { notices, query, onQueryChange: noop }))

test('S01: 공지가 없으면 "등록된 공지가 없어요"만 보이고 공지 링크는 없다(검색·FAQ 진입은 있다)', () => {
  const out = listHtml([])
  assert.match(out, /<h1[^>]*>공지사항<\/h1>/)
  assert.match(out, /등록된 공지가 없어요/)
  assert.doesNotMatch(out, /\/support\/notices\//)
  assert.match(out, /type="search"/)
  assert.deepEqual(hrefs(out), ['/support/faq'])
  // 화면이 없는 챗봇·1:1 문의는 링크가 아니라 준비 중으로만 알린다.
  assert.match(out, /키워드 챗봇/)
  assert.match(out, /1:1 문의/)
  assert.equal((out.match(/준비 중/g) ?? []).length, 2)
})

test('S01: 공지가 있으면 분류·제목·작성자·날짜와 상세 링크(검색어 유지), 전체 건수를 보인다', () => {
  const sorted = N.sortNotices([notice(1), notice(2)])
  const out = listHtml(sorted)
  assert.match(out, /전체 2건/)
  assert.deepEqual(hrefs(out).slice(0, 2), [
    '/support/notices/n2',
    '/support/notices/n1',
  ])
  assert.match(out, /공지 2/)
  assert.match(out, /운영팀/)
  assert.match(out, /2026년 11월 12일/)
  const searching = listHtml(sorted, '공지 1')
  assert.match(searching, /검색 결과 1건/)
  assert.deepEqual(hrefs(searching).slice(0, 1), [
    '/support/notices/n1?q=%EA%B3%B5%EC%A7%80%201',
  ])
})

test('S01: 검색 결과가 없으면 안내와 "전체 보기"를 보인다', () => {
  const out = listHtml(N.sortNotices([notice(1)]), '없는말')
  assert.match(out, /검색 결과가 없어요/)
  assert.match(out, /전체 보기/)
  assert.doesNotMatch(out, /\/support\/notices\//)
})

// ── S01-1 공지 상세 화면 ──
const detailHtml = (sorted, id, query = '') =>
  html(
    createElement(NoticeDetail, {
      neighbors: N.findNoticeNeighbors(sorted, id, query),
      query,
    }),
  )

test('S01-1: 제목·분류·작성자·본문(문단)과 이전 글·다음 글·목록 링크(검색어 유지)', () => {
  const sorted = N.sortNotices([notice(1), notice(2), notice(3)])
  const out = detailHtml(sorted, 'n2', '공지')
  assert.match(out, /<h1[^>]*>공지 2<\/h1>/)
  assert.match(out, /본문 2<\/p>/)
  assert.match(out, /둘째 문단 2<\/p>/)
  assert.deepEqual(hrefs(out), [
    '/support/notices/n3?q=%EA%B3%B5%EC%A7%80',
    '/support/notices/n1?q=%EA%B3%B5%EC%A7%80',
    '/support?q=%EA%B3%B5%EC%A7%80',
  ])
  assert.match(out, /이전 글/)
  assert.match(out, /다음 글/)
  // 맨 앞 공지에는 이전 글이, 맨 끝 공지에는 다음 글이 없다.
  assert.doesNotMatch(detailHtml(sorted, 'n3'), /이전 글/)
  assert.doesNotMatch(detailHtml(sorted, 'n1'), /다음 글/)
})

test('S01-1: 없는 공지 id는 공지를 만들지 않고 "찾을 수 없어요"와 목록 링크만 보인다', () => {
  const out = detailHtml(N.sortNotices([notice(1)]), 'nope', '검색')
  assert.match(out, /공지를 찾을 수 없어요/)
  assert.doesNotMatch(out, /이전 글|다음 글/)
  assert.deepEqual(hrefs(out), ['/support?q=%EA%B2%80%EC%83%89'])
  // 공지가 하나도 없는 지금의 운영 상태에서도 어떤 id든 없는 공지다.
  const empty = detailHtml([], 'n1')
  assert.match(empty, /공지를 찾을 수 없어요/)
})

// ── S04 FAQ ──
const faqHtml = (query = '') =>
  html(
    createElement(Faq, {
      items: F.FAQ_ITEMS,
      query,
      onQueryChange: noop,
    }),
  )

test('S04: 질문 아코디언(<details>)과 관련 화면 링크, 전체 건수', () => {
  const out = faqHtml()
  assert.match(out, /<h1[^>]*>자주 묻는 질문<\/h1>/)
  assert.equal((out.match(/<details/g) ?? []).length, F.FAQ_ITEMS.length)
  assert.match(out, new RegExp(`전체 ${F.FAQ_ITEMS.length}건`))
  assert.match(out, /type="search"/)
  for (const item of F.FAQ_ITEMS) assert.ok(out.includes(item.question))
})

test('S04: 검색은 질문·답변에서 찾고 결과가 없으면 안내와 "전체 보기"를 보인다', () => {
  assert.deepEqual(
    F.filterFaq(F.FAQ_ITEMS, '즐겨찾기').map((x) => x.id),
    ['exercise-favorite'],
  )
  assert.ok(F.filterFaq(F.FAQ_ITEMS, '  운동 ').length >= 3)
  assert.equal(F.filterFaq(F.FAQ_ITEMS, '').length, F.FAQ_ITEMS.length)
  const none = faqHtml('없는질문xyz')
  assert.match(none, /검색 결과가 없어요/)
  assert.match(none, /전체 보기/)
  assert.doesNotMatch(none, /<details/)
})

test('S04: 관련 화면은 라우터에 있는 경로만 가리키고 확정되지 않은 정책(AI·유료·결제·멤버십)은 안내하지 않는다', () => {
  const router = read('../src/app/router.tsx')
  const paths = new Set(
    [...router.matchAll(/path: '([^']+)'/g)].map((m) => `/${m[1]}`),
  )
  for (const item of F.FAQ_ITEMS) {
    if (!item.related) continue
    assert.ok(paths.has(item.related.to), `${item.id}: ${item.related.to}`)
  }
  const text = F.FAQ_ITEMS.map((x) => `${x.question} ${x.answer}`).join(' ')
  assert.doesNotMatch(text, /\bAI\b|유료|결제|멤버십|구독|환불/)
  // id는 서로 달라야 한다.
  assert.equal(new Set(F.FAQ_ITEMS.map((x) => x.id)).size, F.FAQ_ITEMS.length)
})

// ── P07 즐겨찾기 ──
const exercise = (id, name, over = {}) => ({
  id,
  name,
  category: '상체',
  targetMuscles: ['가슴'],
  difficulty: '초급',
  equipment: ['맨몸'],
  instructions: [],
  precautions: [],
  ...over,
})
const favHtml = (section, tab = 'exercise', extra = {}) =>
  html(
    createElement(Favorites, {
      tab,
      onTabChange: noop,
      exercises: section,
      savingIds: new Set(),
      failedIds: new Set(),
      onRemove: async () => 'removed',
      foods: { kind: 'unavailable' },
      foodSavingIds: new Set(),
      foodFailedIds: new Set(),
      onRemoveFood: async () => 'removed',
      ...extra,
    }),
  )
const ready = (items, missing = 0) => ({ kind: 'ready', items, missing })

test('P07: 음식·운동 탭(tablist, 선택 탭, 운동 개수)과 h1', () => {
  const out = favHtml(ready([exercise('e1', '푸시업')]))
  assert.match(out, /<h1[^>]*>즐겨찾기<\/h1>/)
  assert.match(out, /role="tablist"/)
  assert.equal((out.match(/role="tab"/g) ?? []).length, 2)
  assert.match(out, /id="favorites-tab-exercise"[^>]*aria-selected="true"/)
  assert.match(out, /id="favorites-tab-food"[^>]*aria-selected="false"/)
  assert.match(out, /tabindex="-1"[^>]*>음식/)
  assert.match(out, /<span class="sr-only">개수 <\/span>1/)
})

test('P07 운동: 이름·메타·자세히(E02, 진입 경로 전달)·별 해제 버튼이 있다', () => {
  const out = favHtml(
    ready([
      exercise('e1', '푸시업', { targetMuscles: ['가슴', '팔'] }),
      exercise('e 2', '스쿼트', { difficulty: '중급', equipment: ['덤벨'] }),
    ]),
  )
  assert.equal((out.match(/data-favorite-item/g) ?? []).length, 2)
  assert.match(out, /푸시업/)
  assert.match(out, /초급 · 가슴·팔 · 맨몸/)
  assert.match(out, /중급 · 가슴 · 덤벨/)
  assert.deepEqual(hrefs(out), ['/exercises/e1', '/exercises/e%202'])
  assert.match(out, /aria-label="즐겨찾기 해제: 푸시업"/)
  assert.match(out, /aria-label="즐겨찾기 해제: 스쿼트"/)
  assert.match(out, /자세히<span class="sr-only">: 푸시업<\/span>/)
})

test('P07 운동: 비어 있음·불러오는 중·연결 전·실패는 서로 다른 안내다', () => {
  const empty = favHtml(ready([]))
  assert.match(empty, /즐겨찾기한 운동이 없어요/)
  assert.match(empty, /운동 찾아보기/)
  assert.deepEqual(hrefs(empty), ['/exercises'])
  assert.match(
    favHtml({ kind: 'loading' }),
    /role="status"[^>]*>즐겨찾기를 불러오는 중/,
  )
  assert.match(
    favHtml({ kind: 'unavailable' }),
    /즐겨찾기 기능을 준비하고 있어요/,
  )
  const error = favHtml({ kind: 'error', onRetry: noop })
  assert.match(error, /role="alert"/)
  assert.match(error, /즐겨찾기를 불러오지 못했어요/)
  assert.match(error, /다시 시도/)
  assert.doesNotMatch(error, /즐겨찾기한 운동이 없어요/)
})

test('P07 운동: 목록에서 찾지 못한 즐겨찾기 건수와 저장 실패 안내, 저장 중 표시', () => {
  const out = favHtml(ready([exercise('e1', '푸시업')], 2), 'exercise', {
    failedIds: new Set(['e1']),
    savingIds: new Set(['e1']),
  })
  assert.match(out, /찾지 못한 즐겨찾기 2개는 보이지 않아요/)
  assert.match(out, /즐겨찾기를 변경하지 못했어요\. 다시 시도해 주세요\./)
  assert.match(out, /aria-disabled="true"/)
})

const food = (id, name, over = {}) => ({
  id,
  name,
  category: '한식',
  per100g: { kcal: 153, protein: 3.1, fat: 1, carb: 33 },
  allergyNote: null,
  source: { kind: 'dev-sample', label: '개발용 예시 데이터' },
  ...over,
})
const foodHtml = (foods, extra = {}) =>
  favHtml(ready([]), 'food', { foods, ...extra })

test('P07 음식: 음식 데이터가 없으면(연결 전) 안내만 있고 가짜 음식이 없다', () => {
  const out = favHtml(ready([exercise('e1', '푸시업')]), 'food')
  assert.match(out, /음식 즐겨찾기는 연결 전이에요/)
  assert.match(out, /id="favorites-tab-food"[^>]*aria-selected="true"/)
  assert.deepEqual(hrefs(out), ['/foods'])
  assert.doesNotMatch(out, /data-favorite-food/)
  assert.doesNotMatch(out, /data-favorite-item/)
})

test('P07 음식: 이름(F02)·분류·1인분 열량·기록하기(D02)·별 해제와 개수를 보인다', () => {
  const out = foodHtml(
    ready([
      food('dev-food-1', '현미밥'),
      food('f 2', '카페라테', {
        category: '음료',
        per100g: { kcal: 60, protein: 3, fat: 3, carb: 5 },
      }),
    ]),
  )
  assert.equal((out.match(/data-favorite-food=/g) ?? []).length, 2)
  assert.match(out, /한식 · 1인분 153kcal/)
  assert.match(out, /음료 · 1인분 60kcal/)
  assert.match(out, /aria-label="즐겨찾기 해제: 현미밥"/)
  assert.match(out, /기록하기<span class="sr-only">: 현미밥<\/span>/)
  const links = hrefs(out)
  assert.ok(links.includes('/foods/dev-food-1'))
  assert.ok(links.includes('/foods/f%202'))
  assert.ok(links.includes('/records/meal/record?food=dev-food-1'))
  assert.match(
    out,
    /id="favorites-tab-food"[^>]*>음식<span[^>]*><span class="sr-only">개수 <\/span>2/,
  )
})

test('P07 음식: 열량 정보가 없으면 0이 아니라 "열량 정보 없음"이다', () => {
  const out = foodHtml(
    ready([
      food('x', '열량 미상', {
        per100g: { kcal: null, protein: 1, fat: 1, carb: 1 },
      }),
    ]),
  )
  assert.match(out, /1인분 열량 정보 없음/)
  assert.doesNotMatch(out, /1인분 0kcal/)
})

test('P07 음식: 비어 있음·불러오는 중·실패는 서로 다른 안내이고 찾지 못한 건수·저장 실패를 알린다', () => {
  const empty = foodHtml(ready([]))
  assert.match(empty, /즐겨찾기한 음식이 없어요/)
  assert.match(empty, /음식 찾아보기/)
  assert.deepEqual(hrefs(empty), ['/foods'])
  assert.match(foodHtml({ kind: 'loading' }), /즐겨찾기를 불러오는 중/)
  const error = foodHtml({ kind: 'error', onRetry: noop })
  assert.match(error, /role="alert"/)
  assert.match(error, /다시 시도/)
  assert.doesNotMatch(error, /즐겨찾기한 음식이 없어요/)
  const out = foodHtml(ready([food('a', '현미밥')], 3), {
    foodFailedIds: new Set(['a']),
    foodSavingIds: new Set(['a']),
  })
  assert.match(out, /찾지 못한 즐겨찾기 3개는 보이지 않아요/)
  assert.match(out, /즐겨찾기를 변경하지 못했어요\. 다시 시도해 주세요\./)
  assert.match(out, /aria-disabled="true"/)
})

// ── P15 레벨 안내 ──
const levelHtml = (level, knowledge) =>
  html(createElement(LevelGuide, { level, knowledge }))

test('P15: 연결된 값이 없으면 "연결 전"·"미확인"이고, 명세의 예시 수치와 적립 동작을 표시하지 않는다', () => {
  const out = levelHtml(
    { state: 'unavailable' },
    { status: 'ready', levels: { exercise: null, meal: null } },
  )
  assert.match(out, /<h1[^>]*>레벨 안내<\/h1>/)
  assert.match(out, /연결 전/)
  assert.match(out, /미확인/)
  assert.doesNotMatch(out, /320|180 EXP|500|Lv\.3/)
  assert.match(out, /아직 정해지지 않았어요/)
  assert.match(out, /지금은 경험치가 쌓이거나 포인트가 지급되지 않고/)
  assert.deepEqual(hrefs(out), ['/mypage'])
})

test('P15: 초보·중급·고급 설명, 이해도와 활동 레벨·경험치와 포인트의 차이, 현재 상태(마이페이지와 같은 값)', () => {
  const out = levelHtml(
    { state: 'ready', data: { level: 7, progress: null } },
    {
      status: 'ready',
      levels: {
        exercise: { tier: 'intermediate', source: 'assessment' },
        meal: null,
      },
    },
  )
  for (const label of ['초보', '중급', '고급'])
    assert.match(out, new RegExp(label))
  assert.doesNotMatch(out, /초급|중수|고수/)
  assert.match(out, /Lv\.7/)
  assert.match(out, /<dd[^>]*>중급<\/dd>/)
  assert.match(
    out,
    /경험치는 활동 레벨을 정하는 값이고, 포인트는 따로 관리되는 값/,
  )
  assert.match(out, /활동 레벨\(Lv\.\)은 이해도와 다른 값/)
  assert.match(
    levelHtml({ state: 'unavailable' }, { status: 'loading' }),
    /확인 중/,
  )
})

// ── 연결: 라우터·설정 메뉴·마이페이지·랜딩 ──
test('라우터: 새 화면이 정해진 접근 정책으로 추가되고 S01은 placeholder가 아니다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const gateEnd = router.indexOf('element: <AuthOrExperienceGate />')
  for (const [path, comp] of [
    ['favorites', 'FavoritesPage'],
    ['mypage/level', 'LevelGuidePage'],
  ]) {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > gate && at < gateEnd, `${path}는 AuthGate 안`)
    assert.match(router.slice(at, at + 80), new RegExp(`<${comp} />`))
  }
  for (const [path, comp, parent] of [
    ['support', 'SupportPage', '/settings'],
    ['support/notices/:noticeId', 'NoticeDetailPage', '/support'],
    ['support/faq', 'FaqPage', '/settings'],
  ]) {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > gateEnd, `${path}는 공개(AuthGate 밖)`)
    const block = router.slice(at, router.indexOf('satisfies RouteHandle', at))
    assert.ok(block.includes(`<${comp} />`), comp)
    assert.ok(block.includes(`parent: '${parent}'`), `${path} parent`)
    assert.ok(block.includes('ownH1: true'), `${path} ownH1`)
  }
  assert.doesNotMatch(router, /screenId: 'S01',\s*title: '고객지원'/)
})

test('상세 설정(P09): 즐겨찾기·공지사항·FAQ가 실제 화면으로 연결되고 나머지 준비 중 항목은 그대로다', async () => {
  const { SETTINGS_MENU_GROUPS } = await server.ssrLoadModule(
    '/src/settings/settingsMenu.ts',
  )
  const items = SETTINGS_MENU_GROUPS.flatMap((g) => g.items)
  const to = (screenId) => items.find((i) => i.screenId === screenId)?.to
  assert.equal(to('P07'), '/favorites')
  assert.equal(to('S01'), '/support')
  assert.equal(to('S04'), '/support/faq')
  assert.equal(to('P08'), '/notifications')
  // W06 내 운동 루틴은 FAST-02에서 연결했다(routinesStats.test.mjs가 확인한다).
  assert.equal(to('W06'), '/records/exercise/routines')
  for (const id of ['D03', 'P04', 'P13', 'P02', 'P06', 'P03', 'S02'])
    assert.equal(to(id), null, `${id}는 아직 준비 중`)
  // 연결한 세 항목은 "이전"이 설정으로 돌아오게 진입 경로를 알린다.
  for (const id of ['P07', 'S01', 'S04'])
    assert.equal(items.find((i) => i.screenId === id).returnHere, true)
})

test('마이페이지(P01): "레벨 안내"가 P15로 연결되고 경험치 내역·포인트 내역은 그대로 준비 중이다', async () => {
  const { MY_DESTINATIONS } = await server.ssrLoadModule(
    '/src/mypage/destinations.ts',
  )
  assert.equal(MY_DESTINATIONS.levelGuide.to, '/mypage/level')
  assert.equal(MY_DESTINATIONS.experienceHistory.to, null)
  assert.equal(MY_DESTINATIONS.pointHistory.to, null)
})

test('랜딩: 운동 찾기·음식 찾기·고객지원에 "화면 준비 중"이 없고 실제 경로로 연결된다', async () => {
  const c = await server.ssrLoadModule(
    '/src/components/landing/landingContent.ts',
  )
  assert.deepEqual(
    c.LANDING_EXPLORE.links.map((l) => [l.label, l.to]),
    [
      ['운동 찾기', '/exercises'],
      ['음식 찾기', '/foods'],
    ],
  )
  for (const link of c.LANDING_EXPLORE.links)
    assert.equal('status' in link, false, link.label)
  assert.deepEqual(c.LANDING_FOOTER.links, [
    { label: '고객지원', to: '/support' },
  ])
  // 두 경로는 로그인 안내(AuthGate) 밖의 공개 경로다.
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  for (const path of ['exercises', 'foods'])
    assert.ok(router.indexOf(`path: '${path}'`) < gate, `${path}는 공개`)
  const explore = html(
    createElement(
      (await server.ssrLoadModule('/src/components/landing/LandingExplore.tsx'))
        .default,
    ),
  )
  assert.deepEqual(hrefs(explore), ['/exercises', '/foods'])
  assert.doesNotMatch(explore, /준비 중/)
  const footer = html(
    createElement(
      (await server.ssrLoadModule('/src/components/landing/LandingFooter.tsx'))
        .default,
    ),
  )
  assert.deepEqual(hrefs(footer), ['/support'])
  assert.doesNotMatch(footer, /준비 중/)
  // 아직 만들지 않은 기능 안내(퀴즈·AI·기록 제공 예정)는 그대로다.
  assert.equal(c.LANDING_QUIZ.status, '제공 예정')
  // AI 소개는 섹션 전체 배지 대신 기능별 제공 상태를 쓰고, 미구현 기능(식단 추천·사진 분석)은 "준비 중"이다.
  assert.deepEqual(
    c.LANDING_AI.items.map((item) => [item.title, item.status]),
    [
      ['AI 운동 플랜', 'login'],
      ['AI 식단 추천', 'pending'],
      ['음식 사진 분석', 'pending'],
      ['주간 운동·식단 기록 분석', 'login'],
    ],
  )
})

test('회원 홈 추천 배너: 운동 찾기는 정식 화면이라 "화면 준비 중" 없이 바로 이동한다', async () => {
  const r = await server.ssrLoadModule(
    '/src/components/home/homeRecommendation.ts',
  )
  assert.equal(r.DEFAULT_RECOMMENDATION.availability, 'available')
  assert.equal(r.DEFAULT_RECOMMENDATION.href, '/exercises')
  assert.doesNotMatch(r.DEFAULT_RECOMMENDATION.description, /준비/)
})
