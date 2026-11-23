// 최종 UI·UX 검수(Phase 4)에서 고친 항목의 회귀 시험:
// - 회원 홈의 공지 미리보기는 공지사항(S01)과 같은 데이터를 읽고, 공지가 없으면 가짜 공지 없이 "등록된 공지가 없어요"만 보인다.
// - 퀴즈 안내의 "홈으로" 링크는 터치 영역이 44px 이상이다.
// 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

let server, HomeNotices, notices, QuizParts
before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  HomeNotices = (
    await server.ssrLoadModule('/src/components/home/HomeNotices.tsx')
  ).default
  notices = await server.ssrLoadModule('/src/support/notices.ts')
  QuizParts = await server.ssrLoadModule('/src/components/quiz/QuizParts.tsx')
})
after(async () => {
  await server?.close()
})

const render = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))

test('홈 공지 미리보기: 공지 데이터가 없으면 가짜 공지 없이 빈 안내만 보이고 공지사항으로 가는 링크는 남는다', () => {
  assert.equal(notices.getNotices().length, 0)
  const html = render(createElement(HomeNotices))
  assert.match(html, /data-home-notices-empty/)
  assert.match(html, /등록된 공지가 없어요/)
  assert.match(html, /href="\/support"/)
  assert.doesNotMatch(html, /시안 이용 안내|무료 기록과 AI 코칭 이용 안내/)
  // 공지 항목 링크(상세 이동)는 만들지 않는다.
  assert.doesNotMatch(html, /href="\/support\/notices\//)
})

test('홈 공지 미리보기 코드는 지어낸 공지 문구를 갖지 않고 공지 데이터 모듈을 읽는다', () => {
  const code = readFileSync('src/components/home/HomeNotices.tsx', 'utf8')
  assert.match(code, /getNotices\(\)\.slice\(0, 2\)/)
  const content = readFileSync('src/components/home/homeContent.ts', 'utf8')
  assert.doesNotMatch(content, /HOME_NOTICES|시안 이용 안내/)
})

test('퀴즈 안내 "홈으로" 링크는 터치 영역 44px 이상이다', () => {
  const html = render(
    createElement(QuizParts.QuizNotice, { title: '제목', body: '본문' }),
  )
  const link = html.match(/<a[^>]*href="\/home"[^>]*>/)[0]
  assert.match(link, /min-h-11/)
  assert.match(link, /inline-flex/)
})
