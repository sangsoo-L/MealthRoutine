import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// P01 이번 주 활동: 데이터 상태와 무관한 진입 링크와 복귀 경로(state.from). 대문자 드라이브(C:\)의 PowerShell에서 실행한다.
let server
let Weekly
let Back
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])
const text = (out) => out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Weekly = (
    await server.ssrLoadModule('/src/components/mypage/WeeklyActivity.tsx')
  ).default
  Back = await server.ssrLoadModule('/src/components/layout/useBackTarget.ts')
})
after(async () => {
  await server.close()
})

const render = (weekly) => html(createElement(Weekly, { weekly }))
const LINKS = [
  '/records/exercise/my',
  '/records/meal/list',
  '/ai/weekly-report',
]

test('값이 없는 세 상태(연결 전·기록 0건·실패)에서도 W10·D03·I05 링크가 있고 문구는 서로 다르다', () => {
  const texts = new Set()
  for (const state of ['unavailable', 'empty', 'error']) {
    const out = render({ state })
    assert.deepEqual(hrefs(out), LINKS, state)
    const t = text(out)
    assert.match(t, /운동 기록 보기/)
    assert.match(t, /식단 기록 보기/)
    assert.match(t, /주간 리포트 보기/)
    // 수치·타일을 만들지 않는다
    assert.doesNotMatch(out, /tabular-nums|>\d+<|점<|회<|끼</)
    texts.add(t.split('운동 기록 보기')[0].trim())
  }
  assert.equal(texts.size, 3)
  assert.match(
    render({ state: 'unavailable' }),
    /아직 연결된 활동 기록이 없어요/,
  )
  assert.match(render({ state: 'empty' }), /이번 주 활동 기록이 아직 없어요/)
  assert.match(
    render({ state: 'error' }),
    /role="alert"[^>]*>활동 기록을 불러오지 못했어요/,
  )
})

test('값이 있으면 기존 타일 링크를 유지하고 별도 진입 링크 목록은 없다', () => {
  const out = render({
    state: 'ready',
    data: { exerciseCount: 3, mealCount: 5, score: 72 },
  })
  assert.deepEqual(hrefs(out), LINKS)
  assert.doesNotMatch(out, /data-weekly-entry-links/)
  assert.doesNotMatch(text(out), /기록 보기|리포트 보기/)
  assert.match(text(out), /운동/)
  assert.match(text(out), /72/)
})

test('복귀 경로: 링크는 마이페이지(/mypage)를 진입 화면으로 알린다', () => {
  const src = read('../src/components/mypage/WeeklyActivity.tsx')
  assert.equal(
    (src.match(/state=\{\{ from: MY_PAGE_PATH \}\}/g) ?? []).length,
    2,
  )
  const dest = read('../src/mypage/destinations.ts')
  assert.match(dest, /MY_PAGE_PATH = '\/mypage'/)
})

test('복귀 경로 검증: 앱 안의 경로만 쓰고 외부·임의 값은 상위 화면으로 돌아간다', async () => {
  // useBackTarget은 훅이라 MemoryRouter state로 렌더해 확인한다.
  const probe = (state, parent) => {
    function P() {
      return createElement('i', { 'data-to': Back.useBackTarget(parent) ?? '' })
    }
    const out = renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: [{ pathname: '/x', state }] },
        createElement(P),
      ),
    )
    return out.match(/data-to="([^"]*)"/)[1]
  }
  assert.equal(probe({ from: '/mypage' }, '/records/exercise'), '/mypage')
  assert.equal(probe(undefined, '/records/exercise'), '/records/exercise') // 직접 접근
  assert.equal(probe({ from: 'https://evil.example' }, '/ai'), '/ai')
  assert.equal(probe({ from: '//evil.example' }, '/ai'), '/ai')
  assert.equal(probe({ from: '\evil' }, '/ai'), '/ai')
  assert.equal(probe({ from: 5 }, '/ai'), '/ai')
})

test('다른 화면(설정)의 복귀 방식은 그대로다', () => {
  const menu = read('../src/settings/settingsMenu.ts')
  assert.match(
    menu,
    /label: '식단 리스트',\s*to: '\/records\/meal\/list',\s*returnHere: true/,
  )
})
