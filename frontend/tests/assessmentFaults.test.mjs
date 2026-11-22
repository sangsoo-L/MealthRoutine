import assert from 'node:assert/strict'
import { after, before, beforeEach, mock, test } from 'node:test'
import { createServer } from 'vite'

// S7 P3-2: 개발용 이해도 mock의 테스트 전용 실패·지연·미연결 스위치와, 그 상태에서 운동 이해도(추천 권한)가 어떻게 나오는지 확인한다.
// 스위치는 개발 서버 전용 mock 모듈에서만 읽는다(운영 빌드에 없음은 npm run verify:dist가 확인한다).
let server
let Repo
let Level
let Access
const flags = new Map()

before(async () => {
  // devMockStorage는 window.localStorage의 스위치를 읽는다. Node에는 없으므로 같은 모양의 대체물을 둔다.
  globalThis.window = {
    localStorage: { getItem: (key) => flags.get(key) ?? null },
    sessionStorage: { getItem: () => null, setItem: () => {} },
  }
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Repo = await server.ssrLoadModule(
    '/src/onboarding-assessment/mock/mockAssessmentRepository.ts',
  )
  Level = await server.ssrLoadModule('/src/exercise/exerciseLevel.ts')
  Access = await server.ssrLoadModule('/src/exercise/recommend/access.ts')
})
after(async () => {
  await server?.close()
  delete globalThis.window
})
beforeEach(() => flags.clear())

const FLAG = (name) => `mealthroutine.dev.mock.flag.${name}`
const repo = (storage) =>
  Repo.createMockAssessmentRepository({ userId: 'u1', latencyMs: 0, storage })
const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries))
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  }
}

test('스위치가 없으면 결과 조회는 정상이다(결과 없음은 null)', async () => {
  assert.equal(await repo(memoryStorage()).getResult(), null)
})

test('failLoad=assessment이면 결과 조회가 실패한다(다른 도메인 값에는 영향 없음)', async () => {
  flags.set(FLAG('failLoad'), 'body,goal')
  assert.equal(await repo(memoryStorage()).getResult(), null)
  flags.set(FLAG('failLoad'), 'assessment')
  await assert.rejects(
    () => repo(memoryStorage()).getResult(),
    /mock load failure/,
  )
  flags.set(FLAG('failLoad'), 'all')
  await assert.rejects(() => repo(memoryStorage()).getResult())
})

test('slowLoad=assessment이면 SLOW_LOAD_MS 뒤에야 결과가 나온다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  flags.set(FLAG('slowLoad'), 'assessment')
  let settled = false
  const pending = repo(memoryStorage())
    .getResult()
    .then((r) => {
      settled = true
      return r
    })
  await Promise.resolve()
  t.mock.timers.tick(Repo.SLOW_LOAD_MS - 1)
  await Promise.resolve()
  assert.equal(settled, false)
  t.mock.timers.tick(1)
  assert.equal(await pending, null)
  assert.equal(settled, true)
})

test('운동 이해도: 조회 실패는 failed(차단), 결과 없음·미연결은 미확인(차단), 정상 beginner만 허용', async () => {
  const levelOf = async (userId, loader) =>
    Level.loadExerciseLevel(userId, loader)
  // 정상: 이해도 beginner
  const ok = await levelOf('u1', async () => ({
    exercise: { tier: 'beginner', source: 'assessment' },
    meal: null,
  }))
  assert.deepEqual([ok.level, ok.failed], ['beginner', false])
  assert.equal(Access.checkBeginnerPlanAccess(ok.level).ok, true)
  // 미확인(결과 없음)
  const unknown = await levelOf('u1', async () => ({
    exercise: null,
    meal: null,
  }))
  assert.deepEqual([unknown.level, unknown.failed], [null, false])
  assert.equal(Access.checkBeginnerPlanAccess(unknown.level).ok, false)
  // 미연결(조회 수단 없음 → null)
  const none = await levelOf('u1', async () => null)
  assert.equal(Access.checkBeginnerPlanAccess(none.level).ok, false)
  // 조회 실패: 실패로 알리고 추천 권한은 없다
  const failed = await levelOf('u1', async () => {
    throw new Error('mock load failure')
  })
  assert.equal(failed.failed, true)
  assert.equal(
    Access.checkBeginnerPlanAccess(failed.failed ? null : failed.level).ok,
    false,
  )
})

test('knowledgeSource: failLoad=assessment이면 이해도 조회가 예외로 끝나 운동 이해도는 failed가 된다', async () => {
  const { loadKnowledgeLevels } = await server.ssrLoadModule(
    '/src/mypage/knowledgeSource.ts',
  )
  flags.set(FLAG('failLoad'), 'assessment')
  await assert.rejects(() => loadKnowledgeLevels('member-x'))
  const result = await Level.loadExerciseLevel('member-x')
  assert.equal(result.failed, true)
  assert.equal(result.level, null)
  // unavailable=assessment: 조회 수단 없음 → 미확인(실패 아님)
  flags.clear()
  flags.set(FLAG('unavailable'), 'assessment')
  const none = await Level.loadExerciseLevel('member-x')
  assert.deepEqual([none.level, none.failed], [null, false])
  assert.equal(Access.checkBeginnerPlanAccess(none.level).ok, false)
})

void mock
