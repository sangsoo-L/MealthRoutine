import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// S8-4B: W10 완료한 운동 기록 영역·W16 목록 카드·라우트 메타데이터·W01 진입 링크의 렌더링과 연결 구조.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 이동·복귀·키보드·반응형은 Chrome 스크립트(w10-my-exercise·w16-previous-lists)가 검증한다.
let server
let Records
let Card
let Recent
let My
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Records = (
    await server.ssrLoadModule(
      '/src/components/exercise/my/CompletedRecordsSection.tsx',
    )
  ).default
  Card = (
    await server.ssrLoadModule(
      '/src/components/exercise/previous/PreviousListCard.tsx',
    )
  ).default
  Recent = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/RecentRecordsSection.tsx',
    )
  ).default
  My = await server.ssrLoadModule('/src/exercise/myExercise.ts')
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

const item = (n, over = {}) => ({
  id: `r${n}`,
  sessionId: `sess-${n}`,
  performedDate: '2026-11-16',
  title: `스쿼트 ${n}`,
  exerciseCount: 2,
  completedSetCount: 4,
  measuredMs: null,
  ...over,
})
const records = (slot) =>
  createElement(Records, {
    slot,
    fromPath: '/records/exercise/my',
    onRetry: noop,
  })
const ready = (items, skippedCount = 0) => ({
  status: 'ready',
  data: { items, skippedCount },
})

test('완료 기록: 로딩·오류(다시 시도)·준비 중·빈 상태를 구분한다', () => {
  assert.match(
    html(records({ status: 'loading' })),
    /role="status"[^>]*>완료한 운동 기록을 불러오는 중/,
  )
  const err = html(records({ status: 'error' }))
  assert.match(err, /role="alert"/)
  assert.match(err, /완료한 운동 기록을 불러오지 못했어요/)
  assert.match(err, /다시 시도/)
  assert.match(
    html(records({ status: 'unavailable' })),
    /운동 기록을 준비 중이에요/,
  )
  const empty = html(records({ status: 'empty' }))
  assert.match(empty, /아직 저장된 운동 기록이 없어요/)
  assert.doesNotMatch(empty, /더 보기/)
})

test('완료 기록: 손상 기록만 있으면 비어 있다고 말하지 않고, 정상 기록이 있으면 건수만 알린다', () => {
  const only = html(records(ready([], 2)))
  assert.match(only, /기록을 확인할 수 없어요/)
  assert.doesNotMatch(only, /아직 저장된 운동 기록이 없어요/)
  assert.match(only, /읽을 수 없는 기록 2건을 제외했어요/)
  const mixed = html(records(ready([item(1)], 1)))
  assert.match(mixed, /스쿼트 1/)
  assert.match(mixed, /읽을 수 없는 기록 1건을 제외했어요/)
})

test('완료 기록: 처음 20건만 보이고 "더 보기"가 남은 건수를 알린다(전체 건수 표시)', () => {
  const items = Array.from({ length: 25 }, (_, i) => item(i + 1))
  const out = html(records(ready(items)))
  assert.equal((out.match(/data-record-item/g) ?? []).length, 20)
  assert.match(out, /전체 25건 중 20건/)
  assert.match(out, /더 보기/)
  assert.match(out, /남은 5건/)
  assert.match(out, /스쿼트 20</)
  assert.doesNotMatch(out, /스쿼트 21</)
})

test('완료 기록: 20건 이하이면 더 보기가 없다', () => {
  const out = html(
    records(ready(Array.from({ length: 20 }, (_, i) => item(i + 1)))),
  )
  assert.equal((out.match(/data-record-item/g) ?? []).length, 20)
  assert.doesNotMatch(out, /더 보기/)
  assert.match(out, /전체 20건 중 20건/)
})

test('완료 기록: W15 읽기 전용 링크(세션 id)와 이름(날짜·제목), 측정 시간은 있을 때만', () => {
  const out = html(
    records(
      ready([
        item(1, { measuredMs: 125_000 }),
        item(2, { sessionId: undefined }),
        item(3),
      ]),
    ),
  )
  assert.deepEqual(hrefs(out), [
    '/records/exercise/result?session=sess-1',
    '/records/exercise/result?session=sess-3',
  ])
  assert.match(out, /기록 자세히 보기/)
  // 접근 가능한 이름의 꼬리는 W01과 같은 짧은 날짜("11. 16.")와 제목이다(두 형식 중 아무거나 허용하지 않는다).
  assert.match(out, /sr-only">: 11\. 16\. 스쿼트 1<\/span>/)
  assert.doesNotMatch(out, /11월 16일 스쿼트 1/)
  assert.equal((out.match(/측정 /g) ?? []).length, 1)
  assert.match(out, /측정 2분 5초/)
  assert.match(out, /운동 2개/)
  assert.match(out, /4세트 수행/)
})

test('완료 기록: 섹션 제목(h2)과 목록 구조·터치 높이 클래스', () => {
  const out = html(records(ready([item(1)])))
  assert.match(out, /<h2 id="my-records-title"[^>]*>완료한 운동 기록<\/h2>/)
  assert.match(out, /aria-labelledby="my-records-title"/)
  assert.match(out, /<ol role="list"/)
  assert.match(out, /min-h-11[^"]*text-support font-semibold text-exercise/)
})

// ── W16 카드 ──
const slide = (over = {}) => ({
  key: 'same',
  heading: '모든 세트 동일',
  main: '10',
  unit: '회',
  extra: null,
  repeat: 2,
  spoken: '모든 세트 동일, 목표 10회, 2세트',
  ...over,
})
const listView = (records = [], over = {}) => ({
  id: 'l1',
  plannedDate: '2026-11-16',
  title: '푸시업 외 1개',
  exerciseCount: 2,
  setCount: 3,
  exercises: [
    {
      name: '푸시업',
      recordType: 'reps',
      detail: '10회 × 2세트',
      slides: [slide()],
    },
    {
      name: '스쿼트',
      recordType: 'reps',
      detail: '12회 × 1세트',
      slides: [slide({ main: '12', repeat: 1 })],
    },
  ],
  records,
  ...over,
})
const rec = (n, completedAt = '2026-11-16T10:00:00.000Z') => ({
  recordId: `r${n}`,
  sessionId: `sess-${n}`,
  performedDate: '2026-11-16',
  completedAt,
})
const card = (list) => html(createElement(Card, { list }))

test('W16 카드: 계획 정보(제목·운동 수·세트 수·운동명)와 접고 펼치는 세트별 목표', () => {
  const out = html(createElement(Card, { list: listView() }))
  assert.match(out, /<h3 id="previous-list-l1"[^>]*>푸시업 외 1개<\/h3>/)
  assert.match(out, /운동 2개 · 3세트/)
  assert.match(out, /지난 운동 목록/)
  assert.match(out, /<details[^>]*>/)
  assert.match(out, /<summary[^>]*>[^<]*세트별 목표 자세히 보기/)
  assert.match(out, /<h4[^>]*>푸시업<\/h4>/)
  assert.match(out, /모든 세트 동일, 목표 10회, 2세트/)
  assert.match(out, /min-h-11/)
})

test('W16 카드: 연결 기록이 없으면 "저장한 수행 기록 보기"를 그리지 않는다', () => {
  const out = card(listView([]))
  assert.doesNotMatch(out, /저장한 수행 기록 보기/)
  assert.equal(hrefs(out).length, 0)
})

/** 링크마다 화면에 보이는 글자와 보이지 않는 글자를 이어 붙인 접근 가능한 이름(aria-label 등 별도 속성이 없을 때의 이름). */
const linkNames = (out) =>
  [...out.matchAll(/<a [^>]*>(.*?)<\/a>/gs)].map((m) =>
    m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim(),
  )
const count = (text, part) => text.split(part).length - 1

test('W16 카드: 연결 기록이 하나면 W15 읽기 전용 링크 하나(시각 없이)', () => {
  const out = card(listView([rec(1)]))
  assert.deepEqual(hrefs(out), ['/records/exercise/result?session=sess-1'])
  assert.deepEqual(linkNames(out), [
    '저장한 수행 기록 보기: 11월 16일 (월) 계획 푸시업 외 1개',
  ])
  assert.doesNotMatch(out, /완료<\/span>/)
})

test('W16 카드 접근성: 같은 제목의 계획이 다른 날짜에 있어도 링크 이름이 서로 다르다', () => {
  const a = linkNames(card(listView([rec(1)], { id: 'l1' })))
  const b = linkNames(
    card(
      listView([rec(2)], {
        id: 'l2',
        plannedDate: '2026-11-09',
      }),
    ),
  )
  assert.equal(a.length, 1)
  assert.equal(b.length, 1)
  assert.notEqual(a[0], b[0])
  assert.match(a[0], /11월 16일 \(월\) 계획 푸시업 외 1개/)
  assert.match(b[0], /11월 9일 \(월\) 계획 푸시업 외 1개/)
  // 보이는 문구가 이름의 맨 앞에 그대로 있다(레이블 인 네임).
  for (const name of [...a, ...b])
    assert.ok(name.startsWith('저장한 수행 기록 보기'), name)
})

test('W16 카드 접근성: 연결 기록이 여럿이면 이름이 모두 다르고 완료 시각·날짜·제목을 한 번씩만 읽는다', () => {
  const out = card(
    listView([
      rec(3, '2026-11-16T20:00:00.000Z'),
      rec(2, '2026-11-16T15:00:00.000Z'),
      rec(1),
    ]),
  )
  const names = linkNames(out)
  assert.equal(names.length, 3)
  assert.equal(new Set(names).size, 3, JSON.stringify(names))
  names.forEach((name, i) => {
    assert.ok(name.startsWith('저장한 수행 기록 보기'), name)
    assert.match(name, / · \d+\. \d+\. (오전|오후) \d+:\d{2} 완료: /)
    assert.equal(count(name, '완료'), 1, `완료 시각이 한 번만: ${name}`)
    assert.equal(count(name, '푸시업 외 1개'), 1, `제목이 한 번만: ${name}`)
    assert.equal(count(name, '11월 16일 (월) 계획'), 1, name)
    assert.ok(name.endsWith(`기록 3건 중 ${i + 1}번째`), name)
  })
})

test('W16 카드 접근성: 링크에 별도 id·aria 이름 속성을 더하지 않아 중복 id·중복 낭독이 없다', () => {
  const first = card(listView([rec(1), rec(2)], { id: 'l1' }))
  const second = card(listView([rec(3)], { id: 'l2' }))
  for (const anchor of [...first.matchAll(/<a [^>]*>/g)].map((m) => m[0])) {
    assert.doesNotMatch(anchor, /\bid=/)
    assert.doesNotMatch(anchor, /aria-label/)
    assert.doesNotMatch(anchor, /aria-describedby/)
  }
  // 두 카드를 한 화면에 놓아도 id가 겹치지 않는다.
  const ids = [...(first + second).matchAll(/\bid="([^"]+)"/g)].map((m) => m[1])
  assert.equal(new Set(ids).size, ids.length, JSON.stringify(ids))
})

test('W16 카드: 연결 기록이 여럿이면 모두 링크로 접근할 수 있다(완료 시각으로 구분)', () => {
  const out = card(
    listView([
      rec(3, '2026-11-16T20:00:00.000Z'),
      rec(2, '2026-11-16T15:00:00.000Z'),
      rec(1),
    ]),
  )
  assert.deepEqual(hrefs(out), [
    '/records/exercise/result?session=sess-3',
    '/records/exercise/result?session=sess-2',
    '/records/exercise/result?session=sess-1',
  ])
  assert.equal((out.match(/저장한 수행 기록 보기/g) ?? []).length, 3)
  // 보이는 완료 시각은 링크마다 한 번씩이고 서로 다르다.
  const times = [...out.matchAll(/· ([^<]+ 완료)</g)].map((m) => m[1])
  assert.equal(times.length, 3)
  assert.equal(new Set(times).size, 3, JSON.stringify(times))
})

test('W16 카드: 세션 id의 특수문자는 주소에서 인코딩된다', () => {
  const out = card(listView([{ ...rec(1), sessionId: 'a b/c' }]))
  assert.match(out, /href="\/records\/exercise\/result\?session=a%20b%2Fc"/)
})

// ── 라우트·W01 링크 ──
test('라우트: W10·W16이 기존 AuthGate 영역에 임시 확정 URL로 추가되고 상위 화면·탭이 정해져 있다', () => {
  const source = read('../src/app/router.tsx')
  assert.match(
    source,
    /path: 'records\/exercise\/my',\s*element: <ExerciseMyPage \/>/,
  )
  assert.match(
    source,
    /path: 'records\/exercise\/previous',\s*element: <ExercisePreviousPage \/>/,
  )
  const my = source.slice(source.indexOf("path: 'records/exercise/my'"))
  const myHandle = my.slice(0, my.indexOf('satisfies RouteHandle'))
  for (const part of [
    "screenId: 'W10'",
    "title: '나의 운동'",
    "tab: 'records'",
    'focus: false',
    'ownH1: true',
    "parent: '/records/exercise'",
  ]) {
    assert.ok(myHandle.includes(part), `W10 handle: ${part}`)
  }
  const prev = source.slice(source.indexOf("path: 'records/exercise/previous'"))
  const prevHandle = prev.slice(0, prev.indexOf('satisfies RouteHandle'))
  for (const part of [
    "screenId: 'W16'",
    "title: '이전 운동 리스트'",
    "tab: 'records'",
    'focus: false',
    'ownH1: true',
    "parent: '/records/exercise/my'",
  ]) {
    assert.ok(prevHandle.includes(part), `W16 handle: ${part}`)
  }
  // 두 라우트가 AuthGate 레이아웃 라우트(children) 안에 있다.
  const gate = source.indexOf('element: <AuthGate />')
  assert.ok(gate > 0 && source.indexOf("path: 'records/exercise/my'") > gate)
  assert.ok(source.indexOf("path: 'records/exercise/previous'") > gate)
})

test('W01: "최근 운동 기록" 제목 옆에 "전체 기록 보기"(W10) 링크가 있고, 기록 상세 링크는 그대로다', () => {
  const slot = { status: 'ready', data: { items: [item(1)], skippedCount: 0 } }
  const out = html(
    createElement(Recent, { slot, sharedUnavailable: false, onRetry: noop }),
  )
  assert.match(out, /전체 기록 보기/)
  assert.deepEqual(hrefs(out), [
    '/records/exercise/my',
    '/records/exercise/result?session=sess-1',
  ])
  // 기록이 없어도(빈 상태) 진입 링크는 있다. 저장소가 없는 환경(준비 중)에서는 그리지 않는다.
  assert.deepEqual(
    hrefs(
      html(
        createElement(Recent, {
          slot: { status: 'empty' },
          sharedUnavailable: false,
          onRetry: noop,
        }),
      ),
    ),
    ['/records/exercise/my'],
  )
  assert.deepEqual(
    hrefs(
      html(
        createElement(Recent, {
          slot: { status: 'unavailable' },
          sharedUnavailable: true,
          onRetry: noop,
        }),
      ),
    ),
    [],
  )
})

test('W01: 개발용 예시(?sample=)에서는 "전체 기록 보기"를 그리지 않고 일반 모드는 그대로다', () => {
  const slot = { status: 'ready', data: { items: [item(1)], skippedCount: 0 } }
  const sample = html(
    createElement(Recent, {
      slot,
      sharedUnavailable: false,
      onRetry: noop,
      showAllLink: false,
    }),
  )
  assert.doesNotMatch(sample, /전체 기록 보기/)
  assert.ok(!hrefs(sample).includes('/records/exercise/my'))
  const emptySample = html(
    createElement(Recent, {
      slot: { status: 'empty' },
      sharedUnavailable: false,
      onRetry: noop,
      showAllLink: false,
    }),
  )
  assert.deepEqual(hrefs(emptySample), [])
  // 명시하지 않으면 기존 동작(링크 있음).
  assert.match(
    html(
      createElement(Recent, { slot, sharedUnavailable: false, onRetry: noop }),
    ),
    /전체 기록 보기/,
  )
  // W01 페이지가 예시 여부로만 이 값을 정한다(예시 안내가 없을 때만 링크).
  assert.match(
    read('../src/pages/ExerciseDashboardPage.tsx'),
    /showAllLink=\{sampleNotice === null\}/,
  )
})

// ── W10 하단 이동 링크(중복·사용 불가 링크) ──
const plannedView = {
  phase: 'planned',
  listName: '푸시업 외 1개',
  exerciseCount: 2,
  setCount: 3,
  items: [],
}
const todayReady = (data) => ({ status: 'ready', data })

test('W10 이동 링크: 오늘의 운동 카드가 이미 W12로 가는 링크를 그리면 같은 곳으로 가는 링크를 더 두지 않는다', () => {
  // 오늘 계획 목록이 있다 → 카드의 "목록 다시 구성하기"가 W12로 간다.
  assert.deepEqual(My.myNavLinks(todayReady(plannedView), 0), {
    create: false,
    previous: true,
  })
  // 목록·초안이 없다 → 카드의 "운동 목록 만들기"가 W12로 간다.
  assert.deepEqual(My.myNavLinks({ status: 'empty' }, 0), {
    create: false,
    previous: true,
  })
})

test('W10 이동 링크: 카드에 W12 링크가 없을 때만 "새 운동 목록 만들기"를 둔다(완료·초안 이어쓰기·조회 실패)', () => {
  const completed = { phase: 'completed', exerciseCount: 1, setCount: 1 }
  assert.equal(My.myNavLinks(todayReady(completed), 0).create, true)
  // 초안이 있으면 카드는 "이어서 구성하기"(W02)라 W12 링크가 없다.
  assert.equal(My.myNavLinks({ status: 'empty' }, 2).create, true)
  assert.equal(My.myNavLinks({ status: 'error' }, 0).create, true)
  // 불러오는 중에는 카드 링크가 아직 없지만 자리가 뒤늦게 사라지지 않도록 그리지 않는다.
  assert.deepEqual(My.myNavLinks({ status: 'loading' }, 0), {
    create: false,
    previous: true,
  })
})

test('W10 이동 링크: 저장소가 없으면(unavailable) 쓸 수 없는 이동을 활성 링크로 그리지 않는다', () => {
  for (const draft of [0, 3])
    assert.deepEqual(My.myNavLinks({ status: 'unavailable' }, draft), {
      create: false,
      previous: false,
    })
})

// ── W10 → W14 복귀 경로 ──
test('W10 → W14: W10만 진입 경로를 알려 W14의 "이전"이 W10으로 돌아오고, W01은 기존 동작 그대로다', () => {
  const hook = read('../src/exercise/useWorkoutStart.ts')
  // 반환 경로가 있을 때만 state.from을 넘기고 없으면 아무 state도 넘기지 않는다.
  assert.match(
    hook,
    /navigate\(PATH_SESSION, returnTo \? \{ state: \{ from: returnTo \} \} : \{\}\)/,
  )
  // 시작·이어하기·충돌 패널의 이어하기가 모두 같은 goSession을 거친다.
  assert.equal(count(hook, 'navigate(PATH_SESSION'), 1)
  const myPage = read('../src/pages/ExerciseMyPage.tsx')
  assert.match(
    myPage,
    /useWorkoutStart\(\s*user\?\.id \?\? null,\s*today,\s*list,\s*true,\s*PATH_MY_EXERCISE,\s*\)/,
  )
  const dashboard = read('../src/pages/ExerciseDashboardPage.tsx')
  assert.match(
    dashboard,
    /useWorkoutStart\(\s*user\?\.id \?\? null,\s*today,\s*list,\s*sampleNotice === null,\s*\)/,
  )
  assert.doesNotMatch(dashboard, /PATH_MY_EXERCISE/)
  // W14는 바뀌지 않았다: 라우트의 상위 화면은 W01이고 "이전"은 state.from을 우선하는 공통 규칙을 쓴다.
  const router = read('../src/app/router.tsx')
  const w14 = router.slice(router.indexOf("path: 'records/exercise/session'"))
  assert.ok(
    w14
      .slice(0, w14.indexOf('satisfies RouteHandle'))
      .includes("parent: '/records/exercise'"),
  )
})

test('W10·W16: 계정이 바뀌면 화면 전체가 새로 마운트되고(key=계정 id), 훅도 지난 조회를 버린다', () => {
  assert.match(
    read('../src/pages/ExerciseMyPage.tsx'),
    /<MyBody key=\{user\?\.id \?\? ''\} \/>/,
  )
  assert.match(
    read('../src/pages/ExercisePreviousPage.tsx'),
    /<PreviousBody key=\{user\?\.id \?\? ''\} \/>/,
  )
  // 같은 훅 인스턴스에서 계정만 바뀌는 경우의 실제 동작은 Chrome 스크립트(w10-my-exercise의 H 시나리오)가 검증한다.
  for (const file of ['usePreviousLists.ts', 'useCompletedRecords.ts']) {
    const hook = read(`../src/exercise/${file}`)
    assert.match(hook, /if \(cancelled\) return|if \(!cancelled\)/, file)
    assert.match(hook, /loaded\.key === key/, file)
  }
})
