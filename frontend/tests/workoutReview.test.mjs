import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// W11 화면의 서버 렌더링 검증(브라우저 실제 동작은 별도 브라우저 검증). 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let Page
let AuthContext
let WorkoutDraftContext
let Parts
let Slider
let helpers
const noop = () => {}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Page = (await server.ssrLoadModule('/src/pages/ExerciseReviewPage.tsx'))
    .default
  ;({ AuthContext } = await server.ssrLoadModule('/src/auth/authContext.ts'))
  ;({ WorkoutDraftContext } = await server.ssrLoadModule(
    '/src/exercise/workoutDraftContext.ts',
  ))
  Parts = await server.ssrLoadModule(
    '/src/components/exercise/review/ReviewParts.tsx',
  )
  Slider = (
    await server.ssrLoadModule('/src/components/exercise/review/SetSlider.tsx')
  ).default
  helpers = await server.ssrLoadModule(
    '/src/components/exercise/review/reviewHelpers.ts',
  )
})
after(async () => {
  await server?.close()
})

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

function renderPage(items) {
  const draft = {
    status: 'ready',
    draft: { v: 1, day: 'today', items, updatedAt: '2026-11-13T09:30:00.123Z' },
    hasContent: items.length > 0,
    persistence: 'ok',
    discardedNotice: false,
    startNew: noop,
    clearSaved: noop,
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
      { initialEntries: ['/records/exercise/review'] },
      createElement(
        AuthContext,
        { value: auth },
        createElement(
          WorkoutDraftContext,
          { value: draft },
          createElement(Page),
        ),
      ),
    ),
  )
}

const item = (id, recordType, sets, name = `운동 ${id}`) => ({
  itemId: `i${id}`,
  exerciseId: `e${id}`,
  name,
  recordType,
  sets,
})
const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node))

test('초안이 비어 있으면 저장 버튼 없이 구성하러 가는 링크를 보인다', () => {
  const html = renderPage([])
  assert.match(html, /<h1[^>]*>운동 목록 최종 검토<\/h1>/)
  assert.match(html, /구성한 운동이 없어요/)
  assert.match(html, /href="\/records\/exercise\/new"/)
  assert.doesNotMatch(html, /오늘의 운동으로 저장/)
})

test('올바른 초안은 날짜·운동 수·총 세트·방식 배지·세트 목표와 저장·구성 수정·준비 중 시작 버튼을 보인다', () => {
  const html = renderPage([
    item(1, 'reps', [{ reps: 10 }, { reps: 10 }, { reps: 10 }], '스쿼트'),
    item(2, 'time', [{ targetSeconds: 45 }, { targetSeconds: 90 }], '플랭크'),
    item(3, 'weight', [{ reps: 10, weightKg: 8 }], '덤벨 컬'),
  ])
  assert.match(html, /<h1[^>]*>운동 목록 최종 검토<\/h1>/)
  assert.match(html, /<time dateTime="\d{4}-\d{2}-\d{2}">오늘 · /)
  assert.match(html, /운동<\/dt><dd[^>]*>3개/)
  assert.match(html, /총 세트<\/dt><dd[^>]*>6세트/)
  for (const label of ['시간형', '중량+횟수형', '횟수형'])
    assert.ok(html.includes(label), label)
  for (const name of ['스쿼트', '플랭크', '덤벨 컬'])
    assert.ok(html.includes(name), name)
  assert.match(html, /오늘의 운동으로 저장/)
  assert.match(html, /href="\/records\/exercise\/compose"[^>]*>구성 수정/)
  assert.match(html, /오늘 운동 시작/)
  assert.match(html, /운동 진행 기능을 준비 중이에요/)
  // 운동 정보를 확인하는 동안(서버 렌더링 첫 상태)에는 저장 버튼이 비활성이고 이유를 알린다.
  assert.match(html, /aria-disabled="true"[^>]*>오늘의 운동으로 저장/)
  assert.match(html, /운동 정보를 확인하는 중이에요/)
})

test('초안 검증을 통과하지 못하면 오류와 구성 수정 링크만 보이고 저장 버튼은 없다', () => {
  const html = renderPage([item(1, 'reps', [{ reps: 0 }], '스쿼트')])
  assert.match(html, /구성을 확인해 주세요/)
  assert.match(html, /스쿼트 1세트/)
  assert.match(html, /href="\/records\/exercise\/compose"/)
  assert.doesNotMatch(html, /오늘의 운동으로 저장/)
})

test('슬라이더: 세트별 목표가 다르면 이전·다음 조작과 위치를 보이고 가장자리 버튼은 aria-disabled다', () => {
  const html = render(
    createElement(Slider, {
      label: '스쿼트',
      slides: [
        {
          key: 'a',
          heading: '1세트',
          main: '10',
          unit: '회',
          extra: null,
          repeat: null,
          spoken: '1세트, 목표 10회',
        },
        {
          key: 'b',
          heading: '2세트',
          main: '12',
          unit: '회',
          extra: null,
          repeat: null,
          spoken: '2세트, 목표 12회',
        },
      ],
    }),
  )
  assert.match(html, /aria-roledescription="슬라이더"/)
  assert.equal((html.match(/aria-roledescription="슬라이드"/g) ?? []).length, 2)
  assert.match(html, /aria-label="이전 세트 목표" aria-disabled="true"/)
  assert.match(html, /aria-label="다음 세트 목표" aria-disabled="false"/)
  assert.match(html, /1 \/ 2/)
  assert.match(html, /tabindex="0"/)
})

test('슬라이더: 한 장이면 조작 영역 없이 동일 목표 × 세트를 보인다', () => {
  const html = render(
    createElement(Slider, {
      label: '스쿼트',
      slides: [
        {
          key: 'same',
          heading: '모든 세트 동일',
          main: '10',
          unit: '회',
          extra: null,
          repeat: 3,
          spoken: '모든 세트 동일, 목표 10회, 3세트',
        },
      ],
    }),
  )
  assert.doesNotMatch(html, /이전 세트 목표/)
  assert.doesNotMatch(html, /tabindex/)
  assert.match(html, /× 3세트/)
})

test('확인 패널: 날짜 변경과 교체 확인의 문구·버튼', () => {
  const date = render(
    createElement(Parts.ReviewPanel, {
      panel: { kind: 'date', from: '2026-11-13', to: '2026-11-14' },
      onConfirm: noop,
      onCancel: noop,
    }),
  )
  assert.match(date, /날짜가 바뀌었어요/)
  assert.match(date, /11월 13일/)
  assert.match(date, /11월 14일/)
  assert.match(date, /11월 14일[^<]*로 저장/)
  assert.match(date, /취소/)
  const replace = render(
    createElement(Parts.ReviewPanel, {
      panel: {
        kind: 'replace',
        existing: {
          items: [{ recordType: 'reps', sets: [{ reps: 5 }, { reps: 5 }] }],
        },
      },
      onConfirm: noop,
      onCancel: noop,
    }),
  )
  assert.match(replace, /오늘 저장한 운동 목록이 있어요/)
  assert.match(replace, /운동 1개 · 2세트/)
  assert.match(replace, /이전 목록과 운동 기록은 그대로\s*남아요/)
  assert.match(replace, /바꿔서 저장/)
})

test('저장 오류 안내: 원인별 문구, 구성 수정 링크는 구성을 고쳐야 할 때만', () => {
  const alert = (error) =>
    render(createElement(Parts.SaveErrorAlert, { error, today: '2026-11-14' }))
  const failed = (reason, stage = 'save') => ({ kind: 'failed', stage, reason })
  assert.match(alert(failed('quota')), /저장 공간이 부족/)
  assert.match(alert(failed('unavailable')), /이 브라우저에서는/)
  assert.match(alert(failed('blocked')), /다른 탭/)
  assert.match(alert(failed('error')), /잠시 후 다시 시도/)
  assert.match(
    alert(failed('error', 'read')),
    /오늘 저장한 목록을 확인하지 못해 저장하지 않았어요/,
  )
  for (const e of [
    failed('requestConflict'),
    failed('invalidDraft'),
    { kind: 'invalid' },
  ]) {
    const html = alert(e)
    assert.match(html, /href="\/records\/exercise\/compose"/)
    assert.match(html, /구성 수정/)
  }
  assert.doesNotMatch(alert(failed('quota')), /구성 수정/)
  const mismatch = alert({
    kind: 'dateMismatch',
    expected: '2026-11-13',
    actual: '2026-11-14',
  })
  assert.match(mismatch, /자정이 지나 11월 14일 \([^)]+\) 목록으로 저장됐어요/)
  assert.match(mismatch, /다시 저장해 주세요/)
  assert.match(mismatch, /role="alert"/)
  // 오류 안내에는 저장값·운동 내용이 없다.
  assert.doesNotMatch(alert(failed('error')), /스쿼트|kg/)
})

test('다시 시도 가능한 오류는 같은 버튼으로 재시도하고 구성 오류·날짜 불일치는 아니다', () => {
  assert.equal(helpers.isRetryable(null), false)
  assert.equal(
    helpers.isRetryable({ kind: 'failed', stage: 'save', reason: 'quota' }),
    true,
  )
  assert.equal(
    helpers.isRetryable({ kind: 'failed', stage: 'read', reason: 'error' }),
    true,
  )
  assert.equal(
    helpers.isRetryable({
      kind: 'failed',
      stage: 'save',
      reason: 'requestConflict',
    }),
    false,
  )
  assert.equal(
    helpers.isRetryable({
      kind: 'failed',
      stage: 'save',
      reason: 'invalidDraft',
    }),
    false,
  )
  assert.equal(helpers.isRetryable({ kind: 'invalid' }), false)
  assert.equal(
    helpers.isRetryable({ kind: 'dateMismatch', expected: 'a', actual: 'b' }),
    false,
  )
})
