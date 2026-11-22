import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

// W14 운동 수준 조회와 훅의 첫 렌더링. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let L
let useExerciseLevel
let useWorkoutSession

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  L = await server.ssrLoadModule('/src/exercise/exerciseLevel.ts')
  ;({ useExerciseLevel } = await server.ssrLoadModule(
    '/src/exercise/useExerciseLevel.ts',
  ))
  ;({ useWorkoutSession } = await server.ssrLoadModule(
    '/src/exercise/useWorkoutSession.ts',
  ))
})
after(async () => {
  await server?.close()
})

const levels = (tier, source = 'assessment') => ({
  exercise: tier === null ? null : { tier, source },
  meal: null,
})

test('수준별 입력 방식: beginner는 간단, intermediate·advanced는 상세', async () => {
  const run = (value) => L.loadExerciseLevel('u', async () => value)
  assert.deepEqual(await run(levels('beginner')), {
    mode: 'simple',
    level: 'beginner',
    source: 'assessment',
    failed: false,
  })
  assert.deepEqual(await run(levels('intermediate')), {
    mode: 'detailed',
    level: 'intermediate',
    source: 'assessment',
    failed: false,
  })
  assert.deepEqual(await run(levels('advanced', 'dev-initial')), {
    mode: 'detailed',
    level: 'advanced',
    source: 'dev-initial',
    failed: false,
  })
})

test('수준 없음(결과 없음·저장소 없음)은 오류가 아니라 간단 입력이다', async () => {
  const none = await L.loadExerciseLevel('u', async () => levels(null))
  assert.deepEqual(none, {
    mode: 'simple',
    level: null,
    source: 'unknown',
    failed: false,
  })
  const noRepository = await L.loadExerciseLevel('u', async () => null)
  assert.deepEqual(noRepository, {
    mode: 'simple',
    level: null,
    source: 'unknown',
    failed: false,
  })
})

test('조회 실패는 운동을 막지 않고 간단 입력과 안내(failed)로 대체한다', async () => {
  const failed = await L.loadExerciseLevel('u', async () => {
    throw new Error('조회 실패')
  })
  assert.deepEqual(failed, {
    mode: 'simple',
    level: null,
    source: 'unknown',
    failed: true,
  })
})

test('조회에 계정 id만 쓴다', async () => {
  const seen = []
  await L.loadExerciseLevel('member-1', async (userId) => {
    seen.push(userId)
    return levels('beginner')
  })
  assert.deepEqual(seen, ['member-1'])
})

test('훅의 첫 렌더링: 수준은 불러오는 중, 세션은 불러오는 중이며 저장 완료 표시가 없다', () => {
  function Probe() {
    const level = useExerciseLevel('probe-user')
    const { snapshot } = useWorkoutSession('probe-user')
    return createElement(
      'p',
      null,
      `${level.status}|${snapshot.load.status}|${snapshot.save.dirty}|${snapshot.warnBeforeUnload}`,
    )
  }
  assert.match(
    renderToStaticMarkup(createElement(Probe)),
    /loading\|loading\|false\|false/,
  )
})

test('계정이 없으면 저장소 없음으로 시작하고 입력 방식은 간단이다', () => {
  function Probe() {
    const level = useExerciseLevel(null)
    return createElement('p', null, `${level.status}|${level.mode}`)
  }
  assert.match(renderToStaticMarkup(createElement(Probe)), /ready\|simple/)
})
