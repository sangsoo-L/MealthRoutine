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

test('기본 화면은 제목·주간·최근·오늘·관리 순서이며 준비 중 안내를 통합한다', () => {
  const html = render()
  assert.match(html, /<h1[^>]*>운동 기록<\/h1>/)
  const headings = [
    'dashboard-weekly-title',
    'dashboard-recent-title',
    'dashboard-today-title',
    'dashboard-management-title',
  ].map((id) => html.indexOf(`id="${id}"`))
  assert.ok(headings.every((position) => position >= 0))
  assert.deepEqual(
    headings,
    headings.toSorted((a, b) => a - b),
  )
  assert.equal((html.match(/운동 기록을 준비 중이에요\./g) ?? []).length, 1)
  assert.match(html, /aria-label="아직 알 수 없음"/)
  assert.doesNotMatch(html, /개발용 예시 화면/)
})

test('초안이 있을 때만 기존 구성 화면으로 이어가며 신규 목록 생성은 비활성이다', () => {
  assert.doesNotMatch(render(), /href="\/records\/exercise\/compose"/)
  assert.match(render(), /aria-disabled="true"/)
  assert.match(render(null, 2), /href="\/records\/exercise\/compose"/)
  assert.match(render(null, 2), /이어서 구성하기/)
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
  assert.match(html, /aria-label="아직 알 수 없음"/)
})

test('조회 성공·빈 기록은 실제 빈 상태이며 완료 기록을 만들지 않는다', () => {
  const html = render('empty')
  assert.match(html, /아직 저장된 운동 기록이 없어요/)
  assert.doesNotMatch(html, /저장 완료/)
  assert.doesNotMatch(html, /아직 알 수 없음/)
})
