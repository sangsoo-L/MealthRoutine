import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// 실제 TSX의 서버 렌더링과 순수 규칙 검증이다. 브라우저 시각 검증을 대신하지 않는다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let select
let Card
let Retry
let title

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  const rules = await server.ssrLoadModule(
    '/src/components/home/homeBodyInfo.ts',
  )
  select = rules.selectHomeBodyInfoView
  title = rules.MISSING_TITLE
  const mod = await server.ssrLoadModule(
    '/src/components/home/HomeBodyInfoCard.tsx',
  )
  Card = mod.default
  Retry = mod.HomeBodyInfoRetry
})
after(async () => {
  await server?.close()
})

const ready = (height, weight) => ({
  status: 'ready',
  value: { height, weight },
})

test('조회 중·API 미연결은 기존 배너를 유지하고 누락·등록 완료로 보지 않는다', () => {
  assert.deepEqual(select({ status: 'loading' }), { kind: 'banner' })
  assert.deepEqual(select({ status: 'unavailable' }), { kind: 'banner' })
})

test('조회 실패는 미등록이 아니라 재시도가 붙은 기존 배너다', () => {
  assert.deepEqual(select({ status: 'error' }), { kind: 'banner-with-retry' })
})

test('등록이 끝났으면 기존 배너, 누락이면 항목별 카드다', () => {
  assert.deepEqual(select(ready(true, true)), { kind: 'banner' })
  assert.deepEqual(select(ready(false, false)), {
    kind: 'card',
    missing: 'both',
  })
  assert.deepEqual(select(ready(false, true)), {
    kind: 'card',
    missing: 'height',
  })
  assert.deepEqual(select(ready(true, false)), {
    kind: 'card',
    missing: 'weight',
  })
})

test('카드는 누락된 항목 이름만 말하고 수치·마스킹 값을 담지 않는다', () => {
  for (const missing of ['both', 'height', 'weight']) {
    const html = renderToStaticMarkup(
      createElement(Card, { missing, onOpen() {} }),
    )
    assert.ok(html.includes(title[missing]), missing)
    assert.match(html, /지금 입력하기/)
    assert.doesNotMatch(html, /\*\*\*|\d+(\.\d)?\s?(cm|kg)/)
    assert.match(html, /<button type="button"/)
    assert.doesNotMatch(html, /<a /)
    const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
    for (const [, ref] of html.matchAll(/aria-labelledby="([^"]+)"/g))
      assert.ok(ids.has(ref), ref)
  }
})

test('재시도 안내는 실패를 미등록이라고 말하지 않고 다시 확인 버튼을 둔다', () => {
  const html = renderToStaticMarkup(createElement(Retry, { onRetry() {} }))
  assert.match(html, /확인하지 못했어요/)
  assert.match(html, /다시 확인/)
  assert.doesNotMatch(html, /입력해|미등록|등록되지/)
})
