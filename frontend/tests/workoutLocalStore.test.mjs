// 운동 로컬 저장소의 운영 빌드 연결(F1). 오늘 운동 목록·수행 세션·완료 기록·내일 계획은 운영 빌드에서도 IndexedDB 저장소를 쓰고,
// 루틴은 서버에 저장하기로 해서 운영 빌드에서는 서버 연결 전까지 저장소가 없다(null). 새로 저장하는 목록·계획의 카탈로그 식별자도 빌드에 따라 다르다.
// vite의 SSR 로더로 소스를 불러와 import.meta.env를 실제 빌드와 같은 방식으로 바꾼다(NODE_ENV=production이면 DEV가 false).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function loadSources(nodeEnv) {
  const script = `
    import { createServer } from 'vite'
    const server = await createServer({
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    })
    const workout = await server.ssrLoadModule('/src/exercise/workoutSource.ts')
    const plan = await server.ssrLoadModule('/src/exercise/workoutPlanSource.ts')
    const local = await server.ssrLoadModule('/src/exercise/local/indexedDbWorkoutRepositories.ts')
    console.log(JSON.stringify({
      list: workout.createWorkoutListRepository('7') !== null,
      session: workout.createWorkoutSessionRepository('7') !== null,
      record: workout.createWorkoutRecordRepository('7') !== null,
      plan: plan.createWorkoutPlanRepository('7') !== null,
      routine: workout.createWorkoutRoutineRepository('7') !== null,
      catalogVersion: local.CURRENT_CATALOG_VERSION,
    }))
    await server.close()
  `
  const env = { ...process.env }
  if (nodeEnv) env.NODE_ENV = nodeEnv
  else delete env.NODE_ENV
  const out = execFileSync(
    process.execPath,
    ['--input-type=module', '-e', script],
    { cwd: process.cwd(), env, encoding: 'utf8' },
  )
  return JSON.parse(out.trim().split('\n').at(-1))
}

test('운영 빌드: 오늘 목록·세션·기록·내일 계획은 로컬 저장소가 있고, 루틴은 서버 연결 전이라 없다', () => {
  assert.deepEqual(loadSources('production'), {
    list: true,
    session: true,
    record: true,
    plan: true,
    routine: false,
    catalogVersion: 'server-1',
  })
})

test('개발 서버: 루틴까지 다섯 저장소가 모두 로컬이고 카탈로그는 개발용 시드다', () => {
  assert.deepEqual(loadSources(null), {
    list: true,
    session: true,
    record: true,
    plan: true,
    routine: true,
    catalogVersion: 'dev-mock-1',
  })
})

test('저장소 소스는 로컬 모듈을 정적으로 불러오고 루틴만 DEV로 막는다', () => {
  const source = readFileSync(
    new URL('../src/exercise/workoutSource.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(source, /await import\(/)
  const routine = source.slice(
    source.indexOf('export function createWorkoutRoutineRepository'),
  )
  assert.match(
    routine,
    /import\.meta\.env\.DEV\s*\?\s*createIndexedDbWorkoutRoutineRepository/,
  )
})
