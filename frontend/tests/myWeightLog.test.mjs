import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// 마이페이지 "몸무게 기록" 섹션의 상태 선택 규칙과 화면 문구 검증. 시트 열기·저장 등 동작은 브라우저 검증으로 확인한다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let entry
let Summary

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  entry = await server.ssrLoadModule('/src/components/mypage/weightLogEntry.ts')
  Summary = (
    await server.ssrLoadModule('/src/components/mypage/WeightLogSummary.tsx')
  ).default
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
    lastRecordedOn: '2026-10-20',
    nextDueOn: '2026-11-20',
    needsCheck: false,
    reason: 'not-due',
    legacyWeightUndated: false,
    consistent: true,
    ...overrides,
  },
})
const noHistory = (legacy = true) =>
  weightReady({
    lastRecordedOn: null,
    nextDueOn: null,
    reason: 'no-history',
    legacyWeightUndated: legacy,
  })
const view = (o = {}) =>
  entry.selectWeightLogEntry({
    body: bodyReady(),
    weight: weightReady(),
    retrying: false,
    ...o,
  })

test('이력이 없으면(기존 몸무게가 있어도) 체중 기록 시작하기다', () => {
  assert.deepEqual(view({ weight: noHistory(true) }), { kind: 'start' })
  assert.deepEqual(view({ weight: noHistory(false) }), { kind: 'start' })
})

test('이력이 있고 정상이면 몸무게 기록하기(record), 확인일 도래 여부와 무관하다', () => {
  assert.equal(view().kind, 'record')
  assert.equal(
    view({ weight: weightReady({ needsCheck: true, reason: 'due' }) }).kind,
    'record',
  )
  assert.deepEqual(view(), {
    kind: 'record',
    lastRecordedOn: '2026-10-20',
    nextDueOn: '2026-11-20',
  })
})

test('이력과 현재 몸무게가 어긋나면 기록 확인하기(mismatch)다', () => {
  assert.equal(
    view({ weight: weightReady({ consistent: false }) }).kind,
    'mismatch',
  )
})

test('마지막 기록일이 미래이면 기록할 수 없는 안내(future)다', () => {
  const v = view({
    weight: weightReady({
      reason: 'future-date',
      lastRecordedOn: '2026-12-25',
      nextDueOn: null,
    }),
  })
  assert.deepEqual(v, { kind: 'future', lastRecordedOn: '2026-12-25' })
})

test('키 또는 몸무게가 미등록이면 기존 입력 기능 안내(body-missing)이고 기록 버튼이 없다', () => {
  for (const body of [
    bodyReady(false, true),
    bodyReady(true, false),
    bodyReady(false, false),
  ]) {
    assert.deepEqual(view({ body }), { kind: 'body-missing' })
    assert.deepEqual(view({ body, weight: noHistory() }), {
      kind: 'body-missing',
    })
  }
})

test('조회 중·재시도 중·실패를 구분한다', () => {
  assert.deepEqual(view({ weight: { status: 'loading' } }), { kind: 'loading' })
  assert.deepEqual(view({ weight: { status: 'loading' }, retrying: true }), {
    kind: 'retrying',
  })
  assert.deepEqual(view({ weight: { status: 'error' } }), { kind: 'error' })
  assert.deepEqual(view({ body: { status: 'loading' } }), { kind: 'loading' })
})

test('저장소 미연결은 사용 불가 안내이고, 신체 정보를 모르면 섹션을 그리지 않는다', () => {
  assert.deepEqual(view({ weight: { status: 'unavailable' } }), {
    kind: 'unavailable',
  })
  assert.deepEqual(
    view({
      body: { status: 'unavailable' },
      weight: { status: 'unavailable' },
    }),
    { kind: 'unavailable' },
  )
  assert.deepEqual(view({ body: { status: 'error' } }), { kind: 'hidden' })
  assert.deepEqual(view({ body: { status: 'unavailable' } }), {
    kind: 'hidden',
  })
})

test('기록일 표시는 올해는 월·일만, 다른 해는 연도를 붙이고 잘못된 날짜는 null이다', () => {
  assert.equal(entry.weightDateLabel('2026-11-13', TODAY), '11월 13일')
  assert.equal(entry.weightDateLabel('2025-12-05', TODAY), '2025년 12월 5일')
  assert.equal(entry.weightDateLabel('2026-02-30', TODAY), null)
  assert.equal(entry.weightDateLabel('x', TODAY), null)
})

// ── 화면 문구 ──────────────────────────────────────────────────────
const render = (o = {}) =>
  renderToStaticMarkup(
    createElement(Summary, {
      body: bodyReady(),
      weight: weightReady(),
      retrying: false,
      onRetry() {},
      log: async () => {},
      notificationSync: 'idle',
      onRetryNotificationSync() {},
      ...o,
    }),
  )
const buttons = (html) => (html.match(/<button type="button"/g) ?? []).length
// 아이콘(SVG) 좌표의 소수와 구분하려고 SVG를 지운 뒤 kg 단위 수치가 없는지 본다.
const noWeightValue = (html) =>
  assert.doesNotMatch(
    html.replace(/<svg[\s\S]*?<\/svg>/g, ''),
    /\d+(\.\d)?\s?kg/,
  )

test('이력 없음: 체중 기록 시작하기만 보이고 이전 몸무게 값이 없다', () => {
  const html = render({ weight: noHistory() })
  assert.match(html, /몸무게 기록/)
  assert.match(html, /아직 몸무게 기록이 없어요/)
  assert.match(html, /체중 기록 시작하기/)
  assert.doesNotMatch(html, />몸무게 기록하기|>기록 확인하기|>다시 확인</)
  assert.equal(buttons(html), 1)
  noWeightValue(html)
})

test('이력 있음·정상: 몸무게 기록하기와 기록일만 보인다', () => {
  const html = render()
  assert.match(html, /마지막 기록 10월 20일 · 다음 확인 11월 20일/)
  assert.match(html, /몸무게 기록하기/)
  assert.doesNotMatch(html, /체중 기록 시작하기|기록 확인하기/)
  assert.equal(buttons(html), 1)
  noWeightValue(html)
})

test('불일치: 기록 확인하기와 불일치 안내가 보인다', () => {
  const html = render({ weight: weightReady({ consistent: false }) })
  assert.match(html, /등록된 몸무게와 마지막 기록이 일치하지 않아요/)
  assert.match(html, /기록 확인하기/)
  assert.doesNotMatch(html, /몸무게 기록하기|체중 기록 시작하기/)
  noWeightValue(html)
})

test('신체 정보 미등록: 기록 버튼 없이 기존 입력 기능을 안내한다', () => {
  const html = render({ body: bodyReady(false, true), weight: noHistory() })
  assert.match(html, /키와 몸무게를 먼저 입력해 주세요/)
  assert.match(html, /나의 신체 정보/)
  assert.equal(buttons(html), 0)
})

test('조회 실패: 안내와 다시 확인, 재시도 중에는 확인 중이고 눌러도 반응하지 않는다', () => {
  const error = render({ weight: { status: 'error' } })
  assert.match(error, /몸무게 기록 상태를 확인하지 못했어요/)
  assert.match(error, /다시 확인/)
  assert.match(error, /aria-disabled="false"/)
  const busy = render({ weight: { status: 'loading' }, retrying: true })
  assert.match(busy, /몸무게 기록 상태를 확인하지 못했어요/)
  assert.match(busy, /확인 중…/)
  assert.match(busy, /aria-disabled="true"/)
  assert.doesNotMatch(busy, / disabled=/)
  for (const html of [error, busy]) {
    assert.doesNotMatch(html, /기록이 없|체중 기록 시작하기/)
    noWeightValue(html)
  }
})

test('저장소 미연결: 사용할 수 없는 상태이고 버튼이 없다', () => {
  const html = render({ weight: { status: 'unavailable' } })
  assert.match(html, /아직 사용할 수 없어요/)
  assert.equal(buttons(html), 0)
})

test('미래 기록일: 기록 버튼 없이 날짜 확인 안내만 보인다', () => {
  const html = render({
    weight: weightReady({
      reason: 'future-date',
      lastRecordedOn: '2026-12-25',
      nextDueOn: null,
    }),
  })
  assert.match(html, /기기의 날짜/)
  assert.equal(buttons(html), 0)
})

test('신체 정보를 모를 때(조회 실패)는 섹션을 그리지 않고 제목 참조가 유효하다', () => {
  assert.equal(render({ body: { status: 'error' } }), '')
  for (const w of [
    noHistory(),
    weightReady(),
    weightReady({ consistent: false }),
  ]) {
    const html = render({ weight: w })
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
    for (const [, ref] of html.matchAll(/aria-labelledby="([^"]+)"/g))
      assert.ok(ids.has(ref), ref)
  }
})

test('알림 완료 처리 실패: 기록은 성공했다고 알리고 알림만 다시 확인하게 한다(몸무게 기록을 다시 요구하지 않는다)', () => {
  const failed = render({ notificationSync: 'failed' })
  assert.match(failed, /몸무게는 기록했어요\. 알림 상태를 갱신하지 못했어요\./)
  assert.match(failed, />알림 다시 확인</)
  assert.match(failed, /aria-disabled="false"/)
  assert.doesNotMatch(failed, /저장하지 못했어요|다시 기록/)
  const retrying = render({ notificationSync: 'retrying' })
  assert.match(retrying, /확인 중…/)
  assert.match(retrying, /aria-disabled="true"/)
  assert.doesNotMatch(retrying, / disabled=/)
  assert.doesNotMatch(
    render({ notificationSync: 'idle' }),
    /알림 상태를 갱신하지 못했어요/,
  )
  noWeightValue(failed)
})

test('몸무게 기록 섹션은 알림이 가리키는 위치(#weight-log)이다', () => {
  assert.match(render(), /<section[^>]*id="weight-log"/)
})
