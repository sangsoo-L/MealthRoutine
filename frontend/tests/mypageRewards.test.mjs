import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// 마이페이지 레벨·포인트 서버 연결 회귀 테스트(PR #32 리뷰 P2-01·P2-02·P2-03).
// api/http.ts를 가짜 백엔드로 바꿔 끼운다.
const FAKE_HTTP = `
export class ApiError extends Error {
  constructor(status, errorCode) { super(errorCode); this.status = status; this.errorCode = errorCode }
}
export function apiRequest(method, path) { return globalThis.__fakeRewards(method, path, ApiError) }
`

let server
let Source
let Hook

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    plugins: [
      {
        name: 'fake-http',
        enforce: 'pre',
        load(id) {
          if (id.replace(/\\/g, '/').endsWith('/src/api/http.ts'))
            return FAKE_HTTP
        },
      },
    ],
  })
  Source = await server.ssrLoadModule('/src/mypage/mypageSource.ts')
  Hook = await server.ssrLoadModule('/src/mypage/useMyPageSummary.ts')
})

after(async () => {
  await server?.close()
})

const ok = {
  level: 1,
  levelName: '새싹',
  totalXp: 0,
  nextLevelXp: 100,
  balance: 0,
}
function respond(body) {
  globalThis.__fakeRewards = async (method, path, ApiError) => {
    assert.equal(`${method} ${path}`, 'GET /users/me/rewards')
    if (body instanceof Error) throw new ApiError(500, 'INTERNAL_ERROR')
    return body
  }
}

test('정상 응답: 정산 전 0XP·0P도 유효한 값으로 채운다', async () => {
  respond(ok)
  const slots = await Source.fetchServerRewardSlots()
  assert.equal(slots.level.state, 'ready')
  assert.deepEqual(slots.level.data, {
    level: 1,
    progress: { experience: 0, nextLevelExperience: 100 },
  })
  assert.deepEqual(slots.points, { state: 'ready', data: { balance: 0 } })
})

test('최고 레벨(nextLevelXp=null)은 진행바 없이 채운다', async () => {
  respond({ ...ok, level: 10, totalXp: 99999, nextLevelXp: null, balance: 75 })
  const slots = await Source.fetchServerRewardSlots()
  assert.equal(slots.level.data.progress, null)
  assert.equal(slots.points.data.balance, 75)
})

test('계약과 다른 HTTP 200 응답은 반영하지 않는다(null → 연결 전 유지)', async () => {
  const bad = [
    null,
    'ok',
    {},
    { ...ok, level: undefined },
    { ...ok, level: 0 },
    { ...ok, level: '1' },
    { ...ok, totalXp: null },
    { ...ok, totalXp: -1 },
    { ...ok, totalXp: 1.5 },
    { ...ok, balance: undefined },
    { ...ok, balance: '50' },
    { ...ok, balance: -10 },
    { ...ok, nextLevelXp: undefined },
    { ...ok, nextLevelXp: '100' },
    { ...ok, nextLevelXp: -5 },
  ]
  for (const body of bad) {
    respond(body)
    assert.equal(
      await Source.fetchServerRewardSlots(),
      null,
      JSON.stringify(body),
    )
  }
})

test('요청 실패는 null(예외를 화면으로 던지지 않는다)', async () => {
  respond(new Error('down'))
  assert.equal(await Source.fetchServerRewardSlots(), null)
})

const slots50 = { points: { state: 'ready', data: { balance: 50 } } }
const slots75 = { points: { state: 'ready', data: { balance: 75 } } }

test('같은 id로 다시 로그인하면(새 세션) 이전 세션의 값을 쓰지 않는다', () => {
  const first = { id: '2' }
  const relogin = { id: '2' } // 로그인마다 새 user 객체
  const prev = { session: first, slots: slots50 }
  assert.equal(Hook.currentRewardSlots(prev, first), slots50)
  assert.equal(Hook.currentRewardSlots(prev, relogin), null) // 새 조회 결과 전까지 연결 전
  assert.equal(
    Hook.currentRewardSlots({ session: relogin, slots: slots75 }, relogin),
    slots75,
  )
})

test('성공 → 재조회 실패 → 복구: 실패하면 이전 성공 값 대신 연결 전, 복구되면 새 값', () => {
  const s = { id: '2' }
  assert.equal(
    Hook.currentRewardSlots({ session: s, slots: slots50 }, s),
    slots50,
  )
  assert.equal(Hook.currentRewardSlots({ session: s, slots: null }, s), null)
  assert.equal(
    Hook.currentRewardSlots({ session: s, slots: slots75 }, s),
    slots75,
  )
})

test('다른 계정으로 바뀌거나 로그아웃하면 이전 계정 값을 쓰지 않는다', () => {
  const a = { id: '2' }
  const b = { id: '3' }
  const prev = { session: a, slots: slots50 }
  assert.equal(Hook.currentRewardSlots(prev, b), null)
  assert.equal(Hook.currentRewardSlots(prev, null), null)
  assert.equal(Hook.currentRewardSlots(null, a), null)
})
