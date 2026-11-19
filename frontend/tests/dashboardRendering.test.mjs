import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 브라우저 시각 검증이 아닌 실제 TSX의 서버 렌더링 검증이다. 새 패키지·저장소를 사용하지 않는다.
let server
let Dashboard
let AuthContext
let WorkoutDraftContext
let TodayExerciseSection
let WeeklyExerciseSection
let RecentRecordsSection
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Dashboard = (
    await server.ssrLoadModule('/src/pages/ExerciseDashboardPage.tsx')
  ).default
  ;({ AuthContext } = await server.ssrLoadModule('/src/auth/authContext.ts'))
  TodayExerciseSection = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/TodayExerciseSection.tsx',
    )
  ).default
  WeeklyExerciseSection = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/WeeklyExerciseSection.tsx',
    )
  ).default
  RecentRecordsSection = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/RecentRecordsSection.tsx',
    )
  ).default
  ;({ WorkoutDraftContext } = await server.ssrLoadModule(
    '/src/exercise/workoutDraftContext.ts',
  ))
})
after(async () => {
  await server?.close()
})

function render(sample, draftCount = 0) {
  const items = Array.from({ length: draftCount }, (_, index) => ({
    itemId: String(index),
    exerciseId: String(index),
    name: '운동',
    recordType: 'reps',
    sets: [{ reps: 10 }],
  }))
  const auth = {
    status: 'authenticated',
    user: {
      id: 'test',
      email: 'test@example.invalid',
      nickname: '테스트',
      entitlement: 'free',
    },
    login: async () => ({ ok: false, reason: 'unavailable' }),
    logout: noop,
  }
  const draft = {
    status: 'ready',
    draft: { v: 1, day: 'today', items, updatedAt: '2026-11-12T00:00:00Z' },
    hasContent: items.length > 0,
    persistence: 'ok',
    discardedNotice: false,
    startNew: noop,
    addExercises: noop,
    removeItem: noop,
    moveItem: noop,
    setRecordType: noop,
    addSet: noop,
    removeSet: noop,
    updateSet: noop,
  }
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      {
        initialEntries: [
          `/records/exercise${sample ? `?sample=${sample}` : ''}`,
        ],
      },
      createElement(
        AuthContext,
        { value: auth },
        createElement(
          WorkoutDraftContext,
          { value: draft },
          createElement(Dashboard),
        ),
      ),
    ),
  )
}

function renderToday(slot, draftCount = 0) {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/records/exercise'] },
      createElement(TodayExerciseSection, {
        slot,
        draftCount,
        onRetry: noop,
      }),
    ),
  )
}

test('기본 화면은 제목·오늘·주간·최근·관리 순서이며 완료 기록 조회 전에는 상태 문구로 알린다', () => {
  const html = render()
  assert.match(html, /<h1[^>]*>운동 기록<\/h1>/)
  // 오늘 상태와 주요 행동을 헤더 바로 다음에 둔다(주간 현황·최근 기록은 그 아래).
  const headings = [
    'dashboard-today-title',
    'dashboard-weekly-title',
    'dashboard-recent-title',
    'dashboard-management-title',
  ].map((id) => html.indexOf(`id="${id}"`))
  assert.ok(headings.every((position) => position >= 0))
  assert.deepEqual(
    headings,
    headings.toSorted((a, b) => a - b),
  )
  // S8-2: 주간·최근은 저장된 완료 기록을 조회한다. 조회 전에는 0회·기록 없음이 아니라 "확인 중"·"불러오는 중"으로 알린다. 부제는 없다.
  assert.match(html, /확인 중/)
  assert.match(html, /최근 운동 기록을 불러오는 중이에요/)
  assert.doesNotMatch(html, /—|0<span class="ml-1 text-body">회/)
  assert.doesNotMatch(html, /나의 운동을 한눈에 확인해요/)
  assert.doesNotMatch(html, /개발용 예시 화면/)
  // 기록 여부를 알 수 없으면 범례를 그리지 않는다.
  assert.doesNotMatch(html, /운동 완료한 날/)
})

test('저장소가 없으면(운영 빌드) 주간·최근은 준비 중 안내를 한 번만 통합해 보인다', () => {
  const unavailable = { status: 'unavailable' }
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      { initialEntries: ['/records/exercise'] },
      createElement(WeeklyExerciseSection, {
        slot: unavailable,
        today: '2026-11-16',
        sharedUnavailable: true,
        onRetry: noop,
      }),
      createElement(RecentRecordsSection, {
        slot: unavailable,
        sharedUnavailable: true,
        onRetry: noop,
      }),
    ),
  )
  assert.equal((html.match(/운동 기록을 준비 중이에요\./g) ?? []).length, 1)
  assert.match(html, /기록 연결 전/)
  assert.doesNotMatch(html, /0<span class="ml-1 text-body">회|운동 완료한 날/)
})

test('오늘의 운동: 기본 화면은 저장소 조회 전이라 불러오는 중이고 개발용 예시에서는 조회하지 않는다', () => {
  const base = render()
  const today = base.slice(
    base.indexOf('id="dashboard-today-title"'),
    base.indexOf('id="dashboard-weekly-title"'),
  )
  assert.match(today, /오늘의 운동을 불러오는 중이에요/)
  assert.doesNotMatch(today, /운동 목록 만들기/)
  // 개발용 예시는 저장소와 무관하게 예시 값을 쓴다.
  assert.match(render('empty'), /href="\/records\/exercise\/new"/)
  assert.match(render('before'), /덤벨 스쿼트/)
})

test('오늘의 운동: 초안이 있을 때만 구성 이어가기, 목록이 없으면 W12 링크, 저장소가 없으면 준비 중 버튼', () => {
  const unavailable = renderToday({ status: 'unavailable' }, 0)
  assert.doesNotMatch(unavailable, /href="\/records\/exercise\/compose"/)
  assert.doesNotMatch(unavailable, /href="\/records\/exercise\/new"/)
  assert.match(unavailable, /aria-disabled="true"/)
  assert.match(unavailable, /최종 검토 기능을 준비 중이에요/)

  const empty = renderToday({ status: 'empty' }, 0)
  assert.match(empty, /href="\/records\/exercise\/new"/)
  assert.match(empty, /운동 목록 만들기/)
  assert.doesNotMatch(empty, /aria-disabled="true"/)
  assert.doesNotMatch(empty, /href="\/records\/exercise\/compose"/)

  for (const slot of [{ status: 'unavailable' }, { status: 'empty' }]) {
    const withDraft = renderToday(slot, 2)
    assert.match(withDraft, /href="\/records\/exercise\/compose"/)
    assert.match(withDraft, /이어서 구성하기/)
    assert.match(withDraft, /최종 검토에서 저장해요/)
    assert.doesNotMatch(withDraft, /최종 검토·저장은 준비 중이에요/)
  }
})

test('오늘의 운동: 조회 중·오류는 목록 만들기 링크를 그리지 않는다', () => {
  const loading = renderToday({ status: 'loading' }, 0)
  assert.match(loading, /불러오는 중이에요/)
  assert.doesNotMatch(loading, /운동 목록 만들기/)
  const error = renderToday({ status: 'error' }, 0)
  assert.match(error, /role="alert"/)
  assert.match(error, /다시 시도/)
  assert.doesNotMatch(error, /운동 목록 만들기/)
})

test('오늘의 운동: 저장된 목록은 운동 수·세트 수·방식·목표를 보이고 다시 구성하기 링크가 있으며 시작은 준비 중이다', () => {
  const html = renderToday(
    {
      status: 'ready',
      data: {
        phase: 'planned',
        listName: '오늘 할 운동 목록',
        exerciseCount: 2,
        setCount: 5,
        items: [
          { name: '스쿼트', detail: '10회 × 3세트', trailing: '횟수형' },
          { name: '플랭크', detail: '1분 × 2세트', trailing: '시간형' },
        ],
      },
    },
    0,
  )
  assert.match(html, /오늘 할 운동 목록/)
  assert.match(html, /2개/)
  assert.match(html, /5세트/)
  assert.match(html, /10회 × 3세트/)
  assert.match(html, /시간형/)
  assert.match(html, /href="\/records\/exercise\/new"[^>]*>목록 다시 구성하기/)
  assert.match(html, /aria-disabled="true"/)
  assert.match(html, /운동 진행 기능을 준비 중이에요/)
  assert.doesNotMatch(html, /읽지 못했어요/)
  const skipped = renderToday(
    {
      status: 'ready',
      data: {
        phase: 'planned',
        listName: '오늘 할 운동 목록',
        exerciseCount: 1,
        setCount: 1,
        items: [{ name: '스쿼트', detail: '10회 × 1세트' }],
        skippedCount: 2,
      },
    },
    0,
  )
  assert.match(skipped, /일부 저장 목록\(2개\)을 읽지 못했어요/)
})

test('모든 개발 예시는 렌더링되고 보조기기 제목 참조가 유효하다', () => {
  for (const sample of [
    'loading',
    'error',
    'empty',
    'before',
    'after',
    'filled',
    'multiple',
    'boundary',
    'partial-error',
    'partial-unavailable',
    'corrupt',
    'corrupt-only',
    'long',
    'many',
  ]) {
    const html = render(sample)
    assert.match(html, /개발용 예시 화면/)
    const ids = new Set(
      [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]),
    )
    for (const [, references] of html.matchAll(
      /aria-(?:labelledby|describedby)="([^"]+)"/g,
    )) {
      for (const id of references.split(' '))
        assert.ok(ids.has(id), `${sample}: missing ${id}`)
    }
  }
})

test('부분 오류가 다른 영역의 정상 기록을 숨기지 않는다', () => {
  const html = render('partial-error')
  assert.match(html, /최근 운동 기록을 불러오지 못했어요/)
  assert.match(html, /다시 시도/)
  assert.match(html, /일 운동했어요/)
})

test('전부 손상된 기록을 정상 빈 기록으로 표시하지 않는다', () => {
  const html = render('corrupt-only')
  assert.match(html, /기록을 확인할 수 없어요/)
  assert.match(html, /읽을 수 없는 기록 2건/)
  assert.doesNotMatch(html, /아직 저장된 운동 기록이 없어요/)
  assert.match(html, /확인할 수 없어요/)
  assert.doesNotMatch(html, /운동 완료한 날/)
})

test('조회 성공·빈 기록은 실제 빈 상태이며 완료 기록을 만들지 않는다', () => {
  const html = render('empty')
  assert.match(html, /아직 저장된 운동 기록이 없어요/)
  assert.doesNotMatch(html, /저장 완료/)
  assert.doesNotMatch(html, /기록 연결 전|확인할 수 없어요/)
  assert.match(html, /<span class="ml-1 text-body">회<\/span>/)
  assert.match(html, /운동 완료한 날/)
})

test('최근 기록은 반복 문구 없이 날짜·운동명·종목 수·세트 수를 보이고 기록별 링크가 아니다(예시에서는 어떤 링크도 없고, 일반 모드는 전체 기록 보기 링크만 있다)', () => {
  const html = render('filled')
  assert.doesNotMatch(html, /저장 완료/)
  assert.match(html, /운동 2개/)
  assert.match(html, /3세트 수행/)
  const recentOf = (page) =>
    page.slice(
      page.indexOf('id="dashboard-recent-title"'),
      page.indexOf('id="dashboard-management-title"'),
    )
  const linksOf = (section) =>
    [...section.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
  const recent = recentOf(html)
  // S8-4D: 개발용 예시(?sample=)는 실제 운동 기록 화면(W10)으로 보내지 않는다. 기록 항목에도 링크·버튼이 없다.
  assert.deepEqual(linksOf(recent), [])
  assert.doesNotMatch(recent, /전체 기록 보기|<button|기록 자세히 보기/)
  // S8-4B: 예시가 아닌 일반 모드는 제목 옆 "전체 기록 보기"(W10) 링크 하나만 있다.
  const normal = recentOf(render())
  assert.deepEqual(linksOf(normal), ['/records/exercise/my'])
  assert.match(normal, /전체 기록 보기/)
})

test('주간 완료 표시는 원 밖의 점과 보조기기 문장으로도 알리고 원 안에 배지를 겹치지 않는다', () => {
  const html = render('filled')
  assert.doesNotMatch(html, /✓<\/span><\/span>/)
  assert.match(html, /운동 1회 완료/)
  assert.match(html, /저장된 완료 기록 없음/)
  assert.match(html, /, 오늘,/)
  assert.match(html, /aria-current="date"/)
})

test('오늘의 운동은 운동명을 최대 3개만 보이고 나머지는 개수로 줄인다', () => {
  const many = render('many')
  const today = many.slice(
    many.indexOf('id="dashboard-today-title"'),
    many.indexOf('id="dashboard-weekly-title"'),
  )
  for (const name of ['덤벨 스쿼트', '월 푸시업', '플랭크'])
    assert.ok(today.includes(name), name)
  for (const name of ['런지', '브릿지']) assert.ok(!today.includes(name), name)
  assert.match(today, /외 2개/)
  assert.equal((today.match(/목록으로 바로 운동 시작/g) ?? []).length, 1)
  assert.doesNotMatch(render('before'), /외 \d+개<\/li>/)
})
