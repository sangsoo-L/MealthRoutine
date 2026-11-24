// 운동·즐겨찾기 API 연결(F2). 가짜 request 함수로 서버 응답을 흉내 내고, vite SSR 로더로 소스를 불러온다.
// 서버의 운동 행은 프론트 시드(exercises.json)에서 만든 DB 시드와 같은 값이므로, 시드를 서버 응답 모양(camelCase)으로 바꿔 넣으면
// API 저장소가 개발용 시드 저장소와 똑같은 운동을 만들어야 한다(목록 순서는 서버 응답 순서라 다를 수 있어 id로 정렬해 비교한다).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

let server
let api
let favorites
let seed
let http

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })
  api = await server.ssrLoadModule('/src/exercise/api/apiExerciseRepository.ts')
  favorites = await server.ssrLoadModule(
    '/src/exercise/api/apiFavoriteRepository.ts',
  )
  seed = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  http = await server.ssrLoadModule('/src/api/http.ts')
})

after(async () => {
  await server?.close()
})

const SEED = JSON.parse(
  readFileSync(
    new URL('../src/exercise/seed/exercises.json', import.meta.url),
    'utf8',
  ),
)

/** 백엔드 ExerciseResponse 모양(B3 이후). */
function toApiRow(row) {
  return {
    exerciseId: row.exercise_id,
    name: row.name,
    instructions: row.instructions,
    difficulty: row.difficulty,
    exerciseType: row.exercise_type,
    exerciseEquipment: row.exercise_equipment,
    description: row.description,
    cautions: row.cautions,
    sourceUrl: row.source_url,
    defaultRecordMode: row.default_record_mode ?? null,
    allowedRecordModes: row.allowed_record_modes ?? null,
  }
}

const API_ROWS = SEED.map(toApiRow).sort((a, b) => a.exerciseId - b.exerciseId)

function page(rows, number, size, total = rows.length) {
  return {
    content: rows.slice(number * size, number * size + size),
    page: number,
    size,
    totalElements: total,
    totalPages: Math.ceil(total / size),
  }
}

/** 경로별 응답을 차례로 꺼내는 가짜 request. 응답 자리에 Error를 넣으면 그 요청이 실패한다. */
function fakeRequest(routes) {
  const calls = []
  const request = async (method, path, options) => {
    calls.push({ method, path, options })
    const queue = routes[`${method} ${path}`]
    if (!queue || queue.length === 0) {
      throw new Error(`준비되지 않은 요청: ${method} ${path}`)
    }
    const next = queue.shift()
    if (next instanceof Error) throw next
    return typeof next === 'function' ? next() : next
  }
  return { request, calls }
}

const PAGE_0 = 'GET /exercises?page=0&size=100'
const PAGE_1 = 'GET /exercises?page=1&size=100'
const ALL = { query: '', difficulty: null, part: null, tool: null }
const byId = (a, b) => Number(a.id) - Number(b.id)

test('서버 운동 105개를 두 페이지로 받아 개발용 시드 저장소와 같은 운동을 만든다', async () => {
  const { request, calls } = fakeRequest({
    [PAGE_0]: [page(API_ROWS, 0, 100)],
    [PAGE_1]: [page(API_ROWS, 1, 100)],
  })
  const repository = api.createApiExerciseRepository(request)
  assert.equal(repository.kind, 'api')
  const fromApi = [...(await repository.list(ALL))].sort(byId)
  const fromSeed = [...seed.getSeedCatalog().getAllExercises()].sort(byId)
  assert.equal(fromApi.length, 105)
  assert.deepEqual(fromApi, fromSeed)
  // 비회원도 볼 수 있는 조회라 optional, 페이지 크기는 서버 최대값 100, 두 페이지가 같은 시간 제한 신호를 쓴다
  assert.deepEqual(
    calls.map((c) => [c.method, c.path, c.options.auth]),
    [
      ['GET', '/exercises?page=0&size=100', 'optional'],
      ['GET', '/exercises?page=1&size=100', 'optional'],
    ],
  )
  assert.ok(calls[0].options.signal instanceof AbortSignal)
  assert.equal(calls[0].options.signal, calls[1].options.signal)
  assert.equal(calls[0].options.signal.aborted, false)
  const rowing = await repository.getById('2')
  assert.equal(rowing.name, '원암 덤벨 로우')
  assert.deepEqual(rowing.recordModes, {
    default: 'weight_reps',
    allowed: ['weight_reps'],
  })
})

test('카탈로그는 한 번만 받고, 조건 검색과 상세는 받아 둔 목록에서 찾는다', async () => {
  const { request, calls } = fakeRequest({
    [PAGE_0]: [page(API_ROWS, 0, 100)],
    [PAGE_1]: [page(API_ROWS, 1, 100)],
  })
  const repository = api.createApiExerciseRepository(request)
  const [all, dumbbell, detail] = await Promise.all([
    repository.list(ALL),
    repository.list({ ...ALL, tool: '덤벨' }),
    repository.getById('105'),
  ])
  assert.equal(calls.length, 2, '동시에 불러도 페이지마다 한 번')
  assert.equal(all.length, 105)
  assert.ok(dumbbell.length > 0)
  assert.ok(dumbbell.every((e) => e.equipment.includes('덤벨')))
  assert.equal(
    dumbbell.length,
    SEED.filter((r) => r.exercise_equipment === '덤벨').length,
  )
  assert.equal(detail.name, '마사지볼 발바닥 이완')
  assert.equal(await repository.getById('999'), null)
  assert.equal(calls.length, 2, '이후 조회는 다시 요청하지 않는다')
})

test('조회가 실패하면 저장하지 않고 다음 조회가 다시 받는다', async () => {
  const { request, calls } = fakeRequest({
    [PAGE_0]: [new Error('network'), page(API_ROWS, 0, 100)],
    [PAGE_1]: [page(API_ROWS, 1, 100)],
  })
  const repository = api.createApiExerciseRepository(request)
  await assert.rejects(repository.list(ALL), /network/)
  assert.equal((await repository.list(ALL)).length, 105)
  assert.equal(calls.length, 3)
})

test('모양이 맞지 않는 운동이 하나라도 있으면 목록 전체를 쓰지 않는다', async () => {
  const broken = [
    { ...API_ROWS[0], exerciseType: '하체' }, // 큰 분류는 운동 부위 값이 아니다
    { ...API_ROWS[0], exerciseEquipment: 'dumbbell' }, // 예전 DB 시드의 영어 값
    { ...API_ROWS[0], difficulty: null },
    { ...API_ROWS[0], name: ' ' },
    { ...API_ROWS[0], exerciseId: '1' },
    { ...API_ROWS[0], defaultRecordMode: 'reps', allowedRecordModes: null },
    { ...API_ROWS[0], defaultRecordMode: 'time', allowedRecordModes: ['reps'] },
    { ...API_ROWS[0], cautions: 3 },
  ]
  for (const row of broken) {
    const { request } = fakeRequest({ [PAGE_0]: [page([row], 0, 100)] })
    await assert.rejects(
      api.createApiExerciseRepository(request).list(ALL),
      (error) => error.name === 'ExerciseApiDataError',
      JSON.stringify(row).slice(0, 120),
    )
  }
  for (const data of [
    null,
    [],
    { content: [], totalElements: '0', totalPages: 0 },
    page(API_ROWS, 0, 100, 2100), // 21페이지: 상한을 넘는다
  ]) {
    const { request } = fakeRequest({ [PAGE_0]: [data] })
    await assert.rejects(
      api.createApiExerciseRepository(request).list(ALL),
      (error) => error.name === 'ExerciseApiDataError',
    )
  }
})

test('기록 방식이 둘 다 null이면 recordModes 없이, 비어 있는 설명은 빼고 만든다', async () => {
  const row = {
    ...API_ROWS[0],
    defaultRecordMode: null,
    allowedRecordModes: null,
    instructions: null,
    description: '',
    cautions: null,
    sourceUrl: 'javascript:alert(1)',
  }
  const { request } = fakeRequest({ [PAGE_0]: [page([row], 0, 100)] })
  const [exercise] = await api.createApiExerciseRepository(request).list(ALL)
  assert.equal(exercise.recordModes, undefined)
  assert.equal(exercise.summary, undefined)
  assert.equal(exercise.description, undefined)
  assert.equal(exercise.sourceUrl, undefined)
  assert.deepEqual(exercise.precautions, [])
  assert.ok(Object.isFrozen(exercise))
})

test('기록 방식 필드가 아예 없는 응답(필드 추가 전 백엔드)도 null과 같게 보고, 한쪽만 null이고 다른 쪽이 없어도 같다', async () => {
  const { defaultRecordMode, allowedRecordModes, ...withoutModes } = API_ROWS[0]
  assert.ok(defaultRecordMode && allowedRecordModes)
  for (const row of [
    withoutModes,
    { ...withoutModes, defaultRecordMode: null },
    { ...withoutModes, allowedRecordModes: null },
  ]) {
    const { request } = fakeRequest({ [PAGE_0]: [page([row], 0, 100)] })
    const [exercise] = await api.createApiExerciseRepository(request).list(ALL)
    assert.equal(exercise.recordModes, undefined)
    assert.equal(exercise.name, API_ROWS[0].name)
  }
  // 한쪽만 값이 있으면 여전히 잘못된 응답이다.
  const { request } = fakeRequest({
    [PAGE_0]: [page([{ ...withoutModes, defaultRecordMode: 'reps' }], 0, 100)],
  })
  await assert.rejects(
    api.createApiExerciseRepository(request).list(ALL),
    (error) => error.name === 'ExerciseApiDataError',
  )
})

test('응답이 오지 않으면 시간 제한에서 요청을 취소해 실패로 끝내고, 다음 조회가 다시 받는다', async () => {
  let hung = true
  const calls = []
  const request = (method, path, options) => {
    calls.push(path)
    if (!hung) {
      return Promise.resolve(
        page(API_ROWS, path.includes('page=1') ? 1 : 0, 100),
      )
    }
    hung = false
    // 서버가 응답하지 않는 상황: 취소 신호가 올 때만 끝난다.
    return new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () =>
        reject(options.signal.reason),
      )
    })
  }
  const repository = api.createApiExerciseRepository(request, {
    timeoutMs: 50,
  })
  await assert.rejects(
    repository.list(ALL),
    (error) => error.name === 'TimeoutError',
  )
  assert.equal((await repository.list(ALL)).length, 105)
  assert.equal(calls.length, 3)
})

test('페이지 사이에 순서가 바뀌어 같은 운동이 두 번 오면 하나만 두고, 빠진 운동이 있으면 실패한다', async () => {
  const shifted = { ...page(API_ROWS, 1, 100), content: API_ROWS.slice(99) }
  const ok = fakeRequest({
    [PAGE_0]: [page(API_ROWS, 0, 100)],
    [PAGE_1]: [shifted], // 100번이 두 번 온다
  })
  assert.equal(
    (await api.createApiExerciseRepository(ok.request).list(ALL)).length,
    105,
  )
  const missing = fakeRequest({
    [PAGE_0]: [page(API_ROWS, 0, 100)],
    [PAGE_1]: [{ ...page(API_ROWS, 1, 100), content: API_ROWS.slice(101) }],
  })
  await assert.rejects(
    api.createApiExerciseRepository(missing.request).list(ALL),
    (error) => error.name === 'ExerciseApiDataError',
  )
})

// ── 즐겨찾기 ────────────────────────────────────────────────

const FAV = '/users/me/favorite-exercises'

test('즐겨찾기 목록: 서버의 최근 등록 순을 등록한 순으로 뒤집어 id만 돌려준다', async () => {
  const { request, calls } = fakeRequest({
    [`GET ${FAV}`]: [
      [API_ROWS[2], API_ROWS[0], API_ROWS[1]],
      [{ exerciseId: 0 }],
      { content: [] },
    ],
  })
  const repository = favorites.createApiFavoriteRepository(request)
  assert.equal(repository.kind, 'api')
  assert.deepEqual(await repository.list(), ['2', '1', '3'])
  assert.deepEqual(calls[0].options, undefined, '로그인 필요(기본)')
  await assert.rejects(repository.list())
  await assert.rejects(repository.list())
})

test('즐겨찾기 등록·해제: PUT·DELETE, 없는 운동은 invalid, 그 밖의 실패는 failed', async () => {
  const notFound = new http.ApiError(
    404,
    'EXERCISE_NOT_FOUND',
    '운동을 찾을 수 없습니다',
  )
  const serverError = new http.ApiError(500, 'INTERNAL_ERROR', 'x')
  const { request, calls } = fakeRequest({
    [`PUT ${FAV}/2`]: [undefined, serverError],
    [`PUT ${FAV}/999`]: [notFound],
    [`DELETE ${FAV}/2`]: [undefined, new Error('network')],
  })
  const repository = favorites.createApiFavoriteRepository(request)
  await repository.add('2')
  await repository.remove('2')
  const reason = (r) => (error) =>
    error.name === 'FavoriteSaveError' && error.reason === r
  await assert.rejects(repository.add('999'), reason('invalid'))
  await assert.rejects(repository.add('2'), reason('failed'))
  await assert.rejects(repository.remove('2'), reason('failed'))
  // 서버 id 모양이 아니면 요청하지 않는다(경로에 그대로 들어가므로).
  for (const id of ['', 'abc', '0', '1/../2', ' 2', '01']) {
    await assert.rejects(repository.add(id), reason('invalid'))
  }
  assert.equal(calls.length, 5)
})

// ── 저장소 출처(운영 빌드·개발 서버) ──────────────────────────

function loadSources(nodeEnv) {
  const script = `
    import { createServer } from 'vite'
    const server = await createServer({
      server: { middlewareMode: true, watch: null, hmr: false, ws: false },
      appType: 'custom',
      logLevel: 'error',
    })
    const exercise = await server.ssrLoadModule('/src/exercise/exerciseSource.ts')
    const favorite = await server.ssrLoadModule('/src/exercise/favoriteSource.ts')
    const a = exercise.createExerciseRepository()
    const b = exercise.createExerciseRepository()
    console.log(JSON.stringify({
      exercise: a?.kind ?? null,
      sameExerciseRepository: a === b,
      favorite: favorite.createFavoriteRepository('7')?.kind ?? null,
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

test('운영 빌드는 운동·즐겨찾기 API 저장소를 쓰고 운동 저장소는 하나를 계속 쓴다', () => {
  assert.deepEqual(loadSources('production'), {
    exercise: 'api',
    sameExerciseRepository: true,
    favorite: 'api',
  })
})

test('개발 서버는 그대로 운동 시드와 즐겨찾기 Mock을 쓴다', () => {
  assert.deepEqual(loadSources(null), {
    exercise: 'seed',
    sameExerciseRepository: false,
    favorite: 'mock',
  })
})
