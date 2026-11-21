import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 알림 표시 규칙(벨 배지·접근 가능한 이름·시각)과 알림 항목 렌더링. 목록·시트 동작은 브라우저 검증으로 확인한다.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let view
let Item
let Bell

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  view = await server.ssrLoadModule('/src/notifications/notificationView.ts')
  Item = (
    await server.ssrLoadModule(
      '/src/components/notifications/NotificationItem.tsx',
    )
  ).default
  Bell = (
    await server.ssrLoadModule(
      '/src/components/notifications/NotificationBellLink.tsx',
    )
  ).default
})
after(async () => {
  await server?.close()
})

const NOW = new Date('2026-11-13T03:00:00.000Z')
const base = {
  id: 'n1',
  userId: 'a',
  type: 'system',
  title: '새 소식',
  body: '확인해 보세요.',
  createdAt: '2026-11-13T03:30:00.000Z',
  readAt: null,
  resolvedAt: null,
  dedupeKey: 'k1',
  target: null,
}
const render = (n = {}) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        'ul',
        null,
        createElement(Item, {
          notification: { ...base, ...n },
          now: NOW,
          onOpen() {},
        }),
      ),
    ),
  )

test('벨 배지: 0 이하·모름은 없고 99 초과는 99+다', () => {
  for (const c of [null, 0, -1, Number.NaN])
    assert.equal(view.unreadBadgeText(c), null, String(c))
  assert.equal(view.unreadBadgeText(1), '1')
  assert.equal(view.unreadBadgeText(99), '99')
  assert.equal(view.unreadBadgeText(100), '99+')
})

test('벨의 접근 가능한 이름은 개수를 글자로 알리고 모르면 알림이다', () => {
  assert.equal(view.bellAccessibleLabel(null), '알림')
  assert.equal(view.bellAccessibleLabel(0), '알림')
  assert.equal(view.bellAccessibleLabel(3), '알림, 읽지 않은 알림 3개')
  assert.equal(view.bellAccessibleLabel(99), '알림, 읽지 않은 알림 99개')
  assert.equal(view.bellAccessibleLabel(150), '알림, 읽지 않은 알림 99개 이상')
})

test('개수를 모르는 동안(조회 전) 벨은 배지 없이 알림 링크다', () => {
  const html = renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(Bell, { userId: 'a', from: '/home' }),
    ),
  )
  assert.match(html, /href="\/notifications"/)
  assert.match(html, /aria-label="알림"/)
  assert.doesNotMatch(html, /aria-hidden="true"[^>]*>\d/)
})

test('시각은 서울 기준이고 올해가 아니면 연도를 붙인다', () => {
  const f = (iso) => view.formatNotificationTime(iso, NOW)
  assert.equal(f('2026-11-13T03:30:00.000Z'), '11월 13일 12:30')
  assert.equal(f('2026-11-12T15:00:00.000Z'), '11월 13일 00:00') // 서울 자정
  assert.equal(f('2026-11-12T14:59:00.000Z'), '11월 12일 23:59')
  assert.equal(f('2025-12-04T23:05:00.000Z'), '2025년 12월 5일 08:05')
  assert.equal(f('2026-12-31T15:30:00.000Z'), '2027년 1월 1일 00:30')
  assert.equal(f('nope'), '')
  assert.equal(
    view.formatNotificationTime('2026-11-13T03:30:00.000Z', new Date('x')),
    '',
  )
})

test('빈 목록 안내는 필터에 맞는다', () => {
  assert.equal(view.emptyMessage('all'), '아직 받은 알림이 없어요.')
  assert.equal(view.emptyMessage('unread'), '읽지 않은 알림이 없어요.')
})

test('읽지 않은 알림은 점이 아닌 글자("읽지 않음")로도 구분된다', () => {
  const unread = render()
  assert.match(unread, /읽지 않음/)
  assert.match(unread, /font-semibold text-content/)
  const read = render({ readAt: '2026-11-13T04:00:00.000Z' })
  assert.doesNotMatch(read, /읽지 않음/)
})

test('처리 완료는 읽음과 따로 표시된다', () => {
  const resolvedUnread = render({ resolvedAt: '2026-11-13T05:00:00.000Z' })
  assert.match(resolvedUnread, /읽지 않음/)
  assert.match(resolvedUnread, /처리 완료/)
  const readOnly = render({ readAt: '2026-11-13T04:00:00.000Z' })
  assert.doesNotMatch(readOnly, /처리 완료/)
  const both = render({
    readAt: '2026-11-13T04:00:00.000Z',
    resolvedAt: '2026-11-13T05:00:00.000Z',
  })
  assert.match(both, /처리 완료/)
  assert.doesNotMatch(both, /읽지 않음/)
})

test('연결 대상이 있으면 링크, 없으면 버튼이고 진입 화면을 되돌아올 수 있게 넘긴다', () => {
  const link = render({ target: { route: '/mypage' } })
  assert.match(link, /<a [^>]*href="\/mypage"/)
  assert.doesNotMatch(link, /<button/)
  assert.match(link, /data-notification-id="n1"/)
  const button = render()
  assert.match(button, /<button type="button"[^>]*data-notification-id="n1"/)
  assert.doesNotMatch(button, /<a /)
})

test('유형 이름과 시각, 제목·내용이 표시되고 신체 수치는 담기지 않는다', () => {
  for (const [type, label] of [
    ['body', '신체정보'],
    ['exercise', '운동'],
    ['system', '시스템'],
  ]) {
    const html = render({ type })
    assert.match(html, new RegExp(label))
  }
  const html = render()
  assert.match(html, /11월 13일 12:30/)
  assert.match(html, /새 소식/)
  assert.match(html, /확인해 보세요/)
  assert.match(html, /<time dateTime="2026-11-13T03:30:00.000Z"/)
  assert.doesNotMatch(
    html.replace(/<svg[\s\S]*?<\/svg>/g, ''),
    /\d+(\.\d)?\s?kg/,
  )
})
