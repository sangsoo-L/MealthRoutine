import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 운동 JSON 시드(frontend/src/exercise/seed/) 검증·조회·화면 연동·기존 데이터 호환 테스트. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
// 원본 JSON은 읽기만 하고(복제본을 변형해 검사한다) 수정하지 않는다.
let server
let V // seedValidation
let C // seedCatalog
let D // seedData
let Repo // seedExerciseRepository
let Draft // workoutDraftModel
let Model // workoutModel
let RM // recordMode
let DraftTypes // workoutDraftTypes
let DetailView
let AuthContext

const SEED_DIR = new URL('../src/exercise/seed/', import.meta.url)
const readSeed = (name) =>
  JSON.parse(readFileSync(new URL(name, SEED_DIR), 'utf8'))
const raw = () => ({
  exercises: readSeed('exercises.json'),
  routines: readSeed('exercise_routines.json'),
  routineItems: readSeed('exercise_routine_items.json'),
})

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  V = await server.ssrLoadModule('/src/exercise/seed/seedValidation.ts')
  C = await server.ssrLoadModule('/src/exercise/seed/seedCatalog.ts')
  D = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  Repo = await server.ssrLoadModule(
    '/src/exercise/seed/seedExerciseRepository.ts',
  )
  Draft = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  Model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
  RM = await server.ssrLoadModule('/src/exercise/recordMode.ts')
  DraftTypes = await server.ssrLoadModule('/src/exercise/workoutDraftTypes.ts')
  DetailView = (
    await server.ssrLoadModule(
      '/src/components/exercise/ExerciseDetailView.tsx',
    )
  ).default
  ;({ AuthContext } = await server.ssrLoadModule('/src/auth/authContext.ts'))
})
after(async () => {
  await server?.close()
})

const norm = (text) => text.replace(/\s+/g, '').toLowerCase()
const issueFields = (validation) =>
  validation.ok
    ? []
    : validation.issues.map((i) => `${i.file}.${i.field ?? '-'}`)

// ─── 1. 원본 데이터 ─────────────────────────────────────────

test('원본 3종: 파일 개수와 검증 통과', () => {
  const data = raw()
  assert.equal(data.exercises.length, 105)
  assert.equal(data.routines.length, 33)
  assert.equal(data.routineItems.length, 99)
  const result = V.validateSeed(data)
  assert.equal(
    result.ok,
    true,
    result.ok ? '' : JSON.stringify(result.issues.slice(0, 3)),
  )
})

test('시드 모듈(seedData)이 같은 데이터를 조회 계층으로 제공한다', () => {
  const catalog = D.getSeedCatalog()
  assert.equal(catalog.getAllExercises().length, 105)
  assert.equal(catalog.getAllRoutines().length, 33)
  assert.equal(D.getSeedCatalog(), catalog, '한 번만 만든다')
})

// ─── 2. 검증: 문제는 조용히 넘기지 않는다 ─────────────────

const MUTATIONS = [
  [
    '운동 id 중복',
    (d) => {
      d.exercises[1].exercise_id = d.exercises[0].exercise_id
    },
    'exercises.exercise_id',
  ],
  [
    '난이도 값',
    (d) => {
      d.exercises[0].difficulty = '초급'
    },
    'exercises.difficulty',
  ],
  [
    '부위 분류에 없는 값',
    (d) => {
      d.exercises[0].exercise_type = '목'
    },
    'exercises.exercise_type',
  ],
  [
    '모르는 장비',
    (d) => {
      d.exercises[0].exercise_equipment = '케틀벨'
    },
    'exercises.exercise_equipment',
  ],
  [
    '빈 운동명',
    (d) => {
      d.exercises[0].name = '  '
    },
    'exercises.name',
  ],
  [
    '설명 누락',
    (d) => {
      delete d.exercises[0].description
    },
    'exercises.description',
  ],
  [
    '빈 문자열 source_url',
    (d) => {
      d.exercises[0].source_url = ''
    },
    'exercises.source_url',
  ],
  [
    '시간 형식',
    (d) => {
      d.exercises[0].created_at = '2026-11-12'
    },
    'exercises.created_at',
  ],
  [
    '루틴 id 중복',
    (d) => {
      d.routines[1].routine_id = d.routines[0].routine_id
    },
    'routines.routine_id',
  ],
  [
    '루틴 공개 범위',
    (d) => {
      d.routines[0].visibility = 'friends'
    },
    'routines.visibility',
  ],
  [
    'is_template 형식',
    (d) => {
      d.routines[0].is_template = 'false'
    },
    'routines.is_template',
  ],
  [
    '소유자 형식',
    (d) => {
      d.routines[0].owner_user_id = ''
    },
    'routines.owner_user_id',
  ],
  [
    '항목의 없는 운동',
    (d) => {
      d.routineItems[0].exercise_id = 9999
    },
    'routineItems.exercise_id',
  ],
  [
    '항목의 없는 루틴',
    (d) => {
      d.routineItems[0].routine_id = 9999
    },
    'routineItems.routine_id',
  ],
  [
    '루틴 안 순서 중복',
    (d) => {
      d.routineItems[1].sequence_number = d.routineItems[0].sequence_number
    },
    'routineItems.sequence_number',
  ],
  [
    '횟수와 시간 동시',
    (d) => {
      d.routineItems[0].target_duration_seconds = 30
    },
    'routineItems.target_reps',
  ],
  [
    '횟수와 시간 모두 없음',
    (d) => {
      d.routineItems[0].target_reps = null
    },
    'routineItems.target_reps',
  ],
  [
    '세트 0',
    (d) => {
      d.routineItems[0].target_sets = 0
    },
    'routineItems.target_sets',
  ],
  [
    '세트 상한 초과',
    (d) => {
      d.routineItems[0].target_sets = 201
    },
    'routineItems.target_sets',
  ],
  [
    '횟수 상한 초과',
    (d) => {
      d.routineItems[0].target_reps = 1000
    },
    'routineItems.target_reps',
  ],
  [
    '횟수가 소수',
    (d) => {
      d.routineItems[0].target_reps = 8.5
    },
    'routineItems.target_reps',
  ],
  [
    '시간 상한 초과',
    (d) => {
      const i = d.routineItems.find((x) => x.target_duration_seconds !== null)
      i.target_duration_seconds = 3601
    },
    'routineItems.target_duration_seconds',
  ],
  [
    '휴식 음수',
    (d) => {
      d.routineItems[0].rest_seconds = -1
    },
    'routineItems.rest_seconds',
  ],
  [
    '항목 없는 루틴',
    (d) => {
      d.routineItems = d.routineItems.filter((i) => i.routine_id !== 1)
    },
    'routineItems.-',
  ],
]

for (const [name, mutate, expected] of MUTATIONS) {
  test(`검증 실패: ${name}`, () => {
    const data = raw()
    const before = JSON.stringify(data)
    mutate(data)
    const result = V.validateSeed(data)
    assert.equal(result.ok, false)
    assert.ok(
      issueFields(result).includes(expected),
      `${expected} 없음: ${issueFields(result).join(', ')}`,
    )
    assert.ok(
      result.issues.every((i) => typeof V.describeSeedIssue(i) === 'string'),
    )
    // 조회 계층도 같은 이유로 던지며 일부만 보여 주지 않는다
    assert.throws(() => C.createSeedCatalog(data), C.SeedDataError)
    assert.notEqual(JSON.stringify(data), before, '변형이 적용돼야 한다')
  })
}

test('검증 실패: 배열이 아니거나 비어 있는 파일', () => {
  const notArray = V.validateSeed({ ...raw(), exercises: {} })
  assert.equal(notArray.ok, false)
  const empty = V.validateSeed({ ...raw(), routines: [] })
  assert.equal(empty.ok, false)
})

test('검증 실패: 한 번에 여러 문제를 모두 알려 준다', () => {
  const data = raw()
  data.exercises[0].difficulty = 'x'
  data.exercises[1].exercise_equipment = 'y'
  data.routineItems[0].target_sets = 0
  const result = V.validateSeed(data)
  assert.equal(result.ok, false)
  assert.ok(result.issues.length >= 3)
})

test('null 처리: source_url이 null이면 sourceUrl을 만들지 않고, 값이 있으면 그대로 담는다', () => {
  const data = raw()
  const plain = C.createSeedCatalog(data).getExerciseById('1')
  assert.equal(Object.hasOwn(plain, 'sourceUrl'), false)
  data.exercises.find((e) => e.exercise_id === 1).source_url =
    'https://example.com/a'
  const linked = C.createSeedCatalog(data).getExerciseById('1')
  assert.equal(linked.sourceUrl, 'https://example.com/a')
  // rest_seconds가 null이어도 올바른 데이터다
  const noRest = raw()
  noRest.routineItems[0].rest_seconds = null
  assert.equal(
    C.createSeedCatalog(noRest).getRoutineItems('1')[0].restSeconds,
    null,
  )
})

// ─── 3. 운동 조회 ───────────────────────────────────────────

test('운동 전체 조회: 105종, 문자열 id, 읽기 전용', () => {
  const all = C.createSeedCatalog(raw()).getAllExercises()
  assert.equal(all.length, 105)
  assert.ok(all.every((e) => typeof e.id === 'string' && /^\d+$/.test(e.id)))
  assert.equal(new Set(all.map((e) => e.id)).size, 105)
  assert.ok(Object.isFrozen(all))
  assert.ok(Object.isFrozen(all[0]))
})

test('운동 id 단건 조회: 값 매핑(밴드 로우)과 없는 id', () => {
  const catalog = C.createSeedCatalog(raw())
  const row = catalog.getExerciseById('1')
  assert.equal(row.name, '밴드 로우')
  assert.equal(row.difficulty, '초급')
  assert.equal(row.category, '상체')
  assert.deepEqual([...row.targetMuscles], ['등'])
  assert.deepEqual([...row.equipment], ['밴드'])
  assert.equal(
    row.summary,
    '등 근육과 견갑골 주변 근육을 사용하는 당기기 운동입니다.',
  )
  assert.match(row.description, /바닥에 앉아/)
  assert.deepEqual([...row.instructions], [])
  assert.equal(row.precautions.length, 1)
  assert.match(row.precautions[0], /밴드가 발에서 빠지지/)
  assert.equal(catalog.getExerciseById('999'), null)
  assert.equal(
    catalog.getExerciseById('push-up'),
    null,
    '옛 슬러그를 다른 운동으로 바꾸지 않는다',
  )
  assert.equal(
    catalog.getExerciseById('밴드 로우'),
    null,
    '이름은 식별자가 아니다',
  )
})

test('분류 변환: 풀업바 정규화·코어·전신·난이도', () => {
  const catalog = C.createSeedCatalog(raw())
  assert.deepEqual([...catalog.getExerciseById('3').equipment], ['풀업 바'])
  assert.equal(catalog.getExerciseById('3').difficulty, '고급')
  assert.equal(catalog.getExerciseById('22').category, '코어', '복부')
  assert.equal(catalog.getExerciseById('25').category, '코어', '허리')
  assert.equal(catalog.getExerciseById('28').category, '전신', '유산소')
  assert.equal(catalog.getExerciseById('31').category, '전신', '스트레칭')
  assert.equal(catalog.getExerciseById('7').category, '상체')
  assert.equal(catalog.getExerciseById('18').category, '하체')
})

test('운동명 검색: 부분 일치·공백 무시·결과 없음', () => {
  const data = raw()
  const catalog = C.createSeedCatalog(data)
  const expectedPush = data.exercises.filter((e) =>
    norm(e.name).includes('푸시업'),
  ).length
  assert.ok(expectedPush >= 8)
  assert.equal(catalog.searchExercises('푸시업').length, expectedPush)
  assert.equal(catalog.searchExercises(' 푸시 업 ').length, expectedPush)
  assert.equal(catalog.searchExercises('').length, 105)
  assert.equal(catalog.searchExercises('없는운동이름').length, 0)
  assert.deepEqual(
    catalog.searchExercises('덤벨 숄더').map((e) => e.name),
    ['덤벨 숄더 프레스'],
  )
})

test('필터: 난이도·부위·장비와 조합', () => {
  const data = raw()
  const catalog = C.createSeedCatalog(data)
  const none = { difficulty: null, part: null, tool: null }
  assert.equal(catalog.filterExercises(none).length, 105)
  assert.equal(
    catalog.filterExercises({ ...none, difficulty: '초급' }).length,
    59,
  )
  assert.equal(
    catalog.filterExercises({ ...none, difficulty: '중급' }).length,
    36,
  )
  assert.equal(
    catalog.filterExercises({ ...none, difficulty: '고급' }).length,
    10,
  )
  assert.equal(catalog.filterExercises({ ...none, part: '등' }).length, 15)
  assert.equal(catalog.filterExercises({ ...none, part: '상체' }).length, 45)
  assert.equal(catalog.filterExercises({ ...none, part: '코어' }).length, 16)
  assert.equal(catalog.filterExercises({ ...none, part: '전신' }).length, 12)
  assert.equal(catalog.filterExercises({ ...none, tool: '풀업 바' }).length, 7)
  assert.equal(catalog.filterExercises({ ...none, tool: '맨몸' }).length, 33)
  const expected = data.exercises.filter(
    (e) =>
      e.exercise_type === '가슴' &&
      e.exercise_equipment === '맨몸' &&
      e.difficulty === 'beginner',
  ).length
  assert.equal(
    catalog.filterExercises({ difficulty: '초급', part: '가슴', tool: '맨몸' })
      .length,
    expected,
  )
  const withQuery = catalog.queryExercises({
    query: '푸시업',
    difficulty: '초급',
    part: null,
    tool: null,
  })
  assert.ok(
    withQuery.every(
      (e) => e.name.includes('푸시업') && e.difficulty === '초급',
    ),
  )
})

test('저장소(ExerciseRepository): list·getById·없는 id·kind', async () => {
  const repo = Repo.createSeedExerciseRepository({ latencyMs: 0 })
  assert.equal(repo.kind, 'seed')
  const all = await repo.list({
    query: '',
    difficulty: null,
    part: null,
    tool: null,
  })
  assert.equal(all.length, 105)
  const one = await repo.getById('5')
  assert.equal(one.name, '푸시업')
  assert.equal(await repo.getById('없는-id'), null)
})

// ─── 4. 루틴 조회 ───────────────────────────────────────────

test('루틴 전체·단건 조회: 값을 해석하지 않고 그대로 담는다', () => {
  const catalog = C.createSeedCatalog(raw())
  assert.equal(catalog.getAllRoutines().length, 33)
  const routine = catalog.getRoutineById('1')
  assert.equal(routine.name, '등 초급 루틴')
  assert.equal(routine.difficulty, '초급')
  assert.equal(routine.ownerUserId, null)
  assert.equal(routine.isTemplate, false)
  assert.equal(routine.visibility, 'public')
  assert.equal(catalog.getRoutineById('99'), null)
  assert.ok(
    catalog
      .getAllRoutines()
      .every((r) => r.ownerUserId === null && r.isTemplate === false),
  )
})

test('루틴 항목: sequence_number 순서, 원본 순서가 섞여 있어도 정렬', () => {
  const data = raw()
  data.routineItems.reverse()
  const catalog = C.createSeedCatalog(data)
  const items = catalog.getRoutineItems('1')
  assert.deepEqual(
    items.map((i) => i.sequenceNumber),
    [1, 2, 3],
  )
  assert.deepEqual(
    items.map((i) => i.exerciseId),
    ['36', '37', '1'],
  )
  assert.equal(catalog.getRoutineItems('99'), null)
  for (const routine of catalog.getAllRoutines()) {
    assert.equal(catalog.getRoutineItems(routine.id).length, 3)
  }
})

test('루틴 항목 목표값: 횟수형·시간형과 휴식을 그대로 보존(기록 방식은 정하지 않는다)', () => {
  const catalog = C.createSeedCatalog(raw())
  const reps = catalog.getRoutineItems('2')[0]
  assert.deepEqual(
    [
      reps.targetSets,
      reps.targetReps,
      reps.targetDurationSeconds,
      reps.restSeconds,
    ],
    [3, 10, null, 75],
  )
  const plank = catalog.getRoutineItems('22')[1]
  assert.equal(plank.exerciseId, '22')
  assert.deepEqual(
    [
      plank.targetSets,
      plank.targetReps,
      plank.targetDurationSeconds,
      plank.restSeconds,
    ],
    [2, null, 20, 60],
  )
  assert.ok(!('recordType' in plank))
})

test('루틴과 운동 조인: 모든 항목이 운동 정보를 가진다, 같은 운동 반복은 그대로', () => {
  const catalog = C.createSeedCatalog(raw())
  const joined = catalog.getRoutineWithExercises('1')
  assert.deepEqual(
    joined.items.map((i) => i.exercise.name),
    ['프론 Y 레이즈', '프론 T 레이즈', '밴드 로우'],
  )
  assert.equal(catalog.getRoutineWithExercises('99'), null)
  for (const routine of catalog.getAllRoutines()) {
    const full = catalog.getRoutineWithExercises(routine.id)
    assert.ok(
      full.items.every((i) => i.exercise && i.exercise.id === i.exerciseId),
    )
  }
  const walking = catalog.getRoutineWithExercises('28')
  assert.deepEqual(
    walking.items.map((i) => i.exerciseId),
    ['28', '28', '28'],
  )
  assert.equal(new Set(walking.items.map((i) => i.id)).size, 3)
})

// ─── 5. 운동 상세(E02) 화면 ─────────────────────────────────

const guest = {
  status: 'unauthenticated',
  user: null,
  login: async () => ({ ok: false }),
  logout() {},
}
const renderDetail = (exercise) =>
  renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(
        AuthContext,
        { value: guest },
        createElement(DetailView, { exercise }),
      ),
    ),
  )

test('E02: 소개·방법·주의사항을 구분해 보여 주고 출처가 없으면 링크를 그리지 않는다', () => {
  const exercise = C.createSeedCatalog(raw()).getExerciseById('1')
  const html = renderDetail(exercise)
  assert.match(html, /운동 소개/)
  assert.match(
    html,
    /등 근육과 견갑골 주변 근육을 사용하는 당기기 운동입니다\./,
  )
  assert.match(html, /운동 방법/)
  assert.match(html, /바닥에 앉아 무릎을 약간 굽히고/)
  assert.match(html, /주의사항/)
  assert.match(html, /밴드가 발에서 빠지지 않도록/)
  assert.match(html, /초급/)
  assert.match(html, /밴드/)
  assert.doesNotMatch(html, /출처/)
  assert.doesNotMatch(html, /<a /)
  assert.doesNotMatch(html, /방법 안내가 아직 없어요/)
})

test('E02: 출처가 있으면 새 탭 링크로, 이미지가 없으면 플레이스홀더', () => {
  const data = raw()
  data.exercises.find((e) => e.exercise_id === 1).source_url =
    'https://example.com/source'
  const exercise = C.createSeedCatalog(data).getExerciseById('1')
  const html = renderDetail(exercise)
  assert.match(html, /href="https:\/\/example\.com\/source"/)
  assert.match(html, /rel="noopener noreferrer"/)
  assert.doesNotMatch(html, /<img/)
})

// ─── 6. 기존 데이터·모델 호환(W02·W11·W14·W15) ──────────────

const T0 = new Date('2026-11-13T03:00:00.000Z')
const draftOf = (items) => ({
  v: 1,
  day: 'today',
  updatedAt: T0.toISOString(),
  items,
})

test('W02: 새 카탈로그의 운동을 기존 초안 모델로 담고 기본 기록 방식 규칙은 그대로다', () => {
  const catalog = C.createSeedCatalog(raw())
  const ex = (id) => catalog.getExerciseById(id)
  const base = draftOf([])
  const draft = Draft.addExercisesToDraft(
    base,
    [ex('5'), ex('2'), ex('28')],
    () => T0.toISOString(),
  )
  assert.deepEqual(
    draft.items.map((i) => i.exerciseId),
    ['5', '2', '28'],
  )
  assert.deepEqual(
    draft.items.map((i) => i.name),
    ['푸시업', '원암 덤벨 로우', '제자리 걷기'],
  )
  assert.deepEqual(
    draft.items.map((i) => i.recordType),
    ['reps', 'weight', 'time'],
  )
  // 기록 방식 메타데이터가 있으면 기존 추론(덤벨→중량형, 부위가 유산소·스트레칭→시간형, 그 외 횟수형)보다 우선한다(S2).
  // 플랭크(22)는 기존 추론으로는 횟수형이었지만 카탈로그 메타데이터(time)에 따라 시간형이다. defaultRecordType은 화면용 기존 3종 계약이다.
  assert.equal(Draft.resolveStoredRecordType(ex('22')), 'time')
  const known = new Set(catalog.getAllExercises().map((e) => e.id))
  assert.equal(Draft.validateDraft(draft, known).ok, true)
})

test('W02: 옛 슬러그·알 수 없는 운동 id는 다른 운동으로 바꾸지 않고 검증 오류가 된다', () => {
  const catalog = C.createSeedCatalog(raw())
  const known = new Set(catalog.getAllExercises().map((e) => e.id))
  const old = draftOf([
    {
      itemId: 'a',
      exerciseId: 'push-up',
      name: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 10 }],
    },
  ])
  const result = Draft.validateDraft(old, known)
  assert.equal(result.ok, false)
  assert.ok(
    result.issues.some((i) => i.field === 'exercise' && i.itemId === 'a'),
  )
  assert.equal(Draft.normalizeDraft(old, known), null)
  assert.equal(old.items[0].exerciseId, 'push-up', '초안 값은 그대로다')
})

test('W11: 새 운동으로 저장 목록을 만들고 다시 읽어도 같다(저장 구조·멱등 규칙은 그대로)', () => {
  const catalog = C.createSeedCatalog(raw())
  const known = new Set(catalog.getAllExercises().map((e) => e.id))
  const draft = draftOf([
    {
      itemId: 'a',
      exerciseId: '5',
      name: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 12 }, { reps: 10 }],
    },
    {
      itemId: 'b',
      exerciseId: '28',
      name: '제자리 걷기',
      recordType: 'time',
      sets: [{ targetSeconds: 60 }],
    },
  ])
  const list = Model.buildWorkoutList({
    id: 'l1',
    ownerId: 'u',
    requestId: 'r1',
    draft,
    knownExerciseIds: known,
    catalogVersion: 'seed-1',
    now: T0,
  })
  assert.ok(list)
  assert.deepEqual(
    list.items.map((i) => i.exerciseId),
    ['5', '28'],
  )
  assert.deepEqual(
    Model.parseWorkoutList(JSON.parse(JSON.stringify(list))),
    list,
  )
  const same = Model.buildWorkoutList({
    id: 'l2',
    ownerId: 'u',
    requestId: 'r1',
    draft,
    knownExerciseIds: known,
    catalogVersion: 'seed-1',
    now: T0,
  })
  assert.equal(Model.sameListItems(list.items, same.items), true)
})

// 저장된 목록·세션·기록은 카탈로그를 다시 조회하지 않는다. 아래는 카탈로그에 없거나 정보가 다른 운동으로 저장된 데이터다.
const storedList = () => ({
  id: 'old',
  ownerId: 'u',
  schemaVersion: 1,
  plannedDate: '2026-11-13',
  catalogVersion: 'mock-15',
  revision: 1,
  requestId: 'old-r',
  createdAt: T0.toISOString(),
  updatedAt: T0.toISOString(),
  items: [
    {
      exerciseId: 'push-up',
      exerciseNameSnapshot: '푸시업(옛)',
      recordType: 'reps',
      sets: [{ reps: 10 }],
    },
    // 같은 id지만 새 카탈로그의 운동('1' = 밴드 로우)과 다른 이름으로 저장된 경우
    {
      exerciseId: '1',
      exerciseNameSnapshot: '옛 이름의 운동',
      recordType: 'reps',
      sets: [{ reps: 8 }],
    },
    {
      exerciseId: '5',
      exerciseNameSnapshot: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 8 }],
    },
  ],
})

test('W14: 카탈로그에 없거나 정보가 다른 운동의 저장 목록으로도 세션을 만들고 복원한다', () => {
  const list = storedList()
  assert.ok(
    Model.parseWorkoutList(list),
    '저장된 목록은 카탈로그와 무관하게 읽힌다',
  )
  const session = Model.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list,
    now: T0,
  })
  assert.deepEqual(
    session.listSnapshot.items.map((i) => [
      i.exerciseId,
      i.exerciseNameSnapshot,
    ]),
    [
      ['push-up', '푸시업(옛)'],
      ['1', '옛 이름의 운동'],
      ['5', '푸시업'],
    ],
  )
  const restored = Model.parseWorkoutSession(
    JSON.parse(JSON.stringify(session)),
  )
  assert.deepEqual(restored.listSnapshot, session.listSnapshot)
  // 카탈로그가 같은 id에 다른 운동을 돌려줘도 스냅샷의 이름·목표·순서는 그대로다
  const catalog = C.createSeedCatalog(raw())
  assert.equal(catalog.getExerciseById('1').name, '밴드 로우')
  assert.equal(
    restored.listSnapshot.items[1].exerciseNameSnapshot,
    '옛 이름의 운동',
  )
})

test('W15: 완료 기록은 세션 스냅샷의 이름·목표·실제 값을 그대로 보존한다', () => {
  const session = Model.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list: storedList(),
    now: T0,
  })
  const performed = session.performed.map((sets) => sets.map((s) => ({ ...s })))
  performed[0][0] = { completed: true, actualReps: 9 }
  performed[1][0] = { completed: true, actualReps: 8 }
  const record = Model.buildWorkoutRecord({
    id: 'r1',
    session: { ...session, performed },
    now: new Date(T0.getTime() + 60_000),
  })
  assert.deepEqual(
    record.exercises.map((e) => [
      e.exerciseId,
      e.exerciseNameSnapshot,
      e.completedSets.length,
    ]),
    [
      ['push-up', '푸시업(옛)', 1],
      ['1', '옛 이름의 운동', 1],
      ['5', '푸시업', 0],
    ],
  )
  assert.equal(record.exercises[0].completedSets[0].actualReps, 9)
  assert.equal(record.exercises[0].completedSets[0].target.reps, 10)
  assert.deepEqual(
    Model.parseWorkoutRecord(JSON.parse(JSON.stringify(record))),
    record,
  )
})

// ─── S2. 기본 운동 105종 기록 방식 메타데이터 ───────────────
// 확정 분류표(2차 전수 조사 B절)를 이 테스트 안에 독립적으로 둔다: 운동 ID | 운동명 | 기본 방식(카탈로그 코드) | 허용 방식(쉼표 구분, 순서 포함).
// exercises.json에서 만들어 낸 값이 아니므로, 데이터가 분류표와 달라지면 이 테스트가 실패한다.
const CONFIRMED_TABLE = `
  1|밴드 로우|reps|reps
  2|원암 덤벨 로우|weight_reps|weight_reps
  3|풀업|reps|reps
  4|월 푸시업|reps|reps
  5|푸시업|reps|reps
  6|덤벨 플로어 프레스|weight_reps|weight_reps
  7|덤벨 숄더 프레스|weight_reps|weight_reps
  8|덤벨 레터럴 레이즈|weight_reps|weight_reps
  9|밴드 풀어파트|reps|reps
  10|덤벨 바이셉스 컬|weight_reps|weight_reps
  11|덤벨 해머 컬|weight_reps|weight_reps
  12|덤벨 트라이셉스 킥백|weight_reps|weight_reps
  13|글루트 브리지|reps|reps
  14|밴드 클램셸|reps|reps
  15|밴드 사이드 워크|reps|reps
  16|맨몸 스쿼트|reps|reps
  17|리버스 런지|reps|reps
  18|덤벨 고블릿 스쿼트|weight_reps|weight_reps
  19|스탠딩 카프 레이즈|reps|reps
  20|싱글 레그 카프 레이즈|reps|reps
  21|덤벨 카프 레이즈|weight_reps|weight_reps
  22|플랭크|time|time
  23|데드 버그|reps|reps
  24|사이드 플랭크|time|time
  25|버드 도그|reps|reps
  26|맨몸 굿모닝|reps|reps
  27|덤벨 루마니안 데드리프트|weight_reps|weight_reps
  28|제자리 걷기|time|time
  29|점핑 잭|time|time,reps,time_reps
  30|하이 니즈|time|time,reps,time_reps
  31|벽 종아리 스트레칭|time|time
  32|폼롤러 등 상부 이완|time|time
  33|마사지볼 엉덩이 이완|time|time
  34|덤벨 벤트오버 로우|weight_reps|weight_reps
  35|덤벨 레니게이드 로우|weight_reps|weight_reps
  36|프론 Y 레이즈|reps|reps
  37|프론 T 레이즈|reps|reps
  38|리버스 스노 엔젤|reps|reps
  39|밴드 랫풀다운|reps|reps
  40|밴드 스트레이트 암 풀다운|reps|reps
  41|와이드 그립 풀업|reps|reps
  42|스캐풀러 풀업|reps|reps
  43|폼롤러 광배근 이완|time|time
  44|마사지볼 등 상부 이완|time|time
  45|덤벨 스퀴즈 플로어 프레스|weight_reps|weight_reps
  46|원암 덤벨 플로어 프레스|weight_reps|weight_reps
  47|니 푸시업|reps|reps
  48|밴드 체스트 프레스|reps|reps
  49|밴드 체스트 플라이|reps|reps
  50|밴드 푸시업|reps|reps
  51|마사지볼 가슴 근육 이완|time|time
  52|덤벨 리버스 플라이|weight_reps|weight_reps
  53|파이크 푸시업|reps|reps
  54|스캐풀러 푸시업|reps|reps
  55|월 슬라이드|reps|reps
  56|밴드 외회전|reps|reps
  57|밴드 숄더 프레스|reps|reps
  58|마사지볼 후면 어깨 이완|time|time
  59|클로즈 그립 푸시업|reps|reps
  60|다이아몬드 푸시업|reps|reps
  61|스핑크스 푸시업|reps|reps
  62|밴드 바이셉스 컬|reps|reps
  63|밴드 트라이셉스 푸시다운|reps|reps
  64|밴드 오버헤드 트라이셉스 익스텐션|reps|reps
  65|친업|reps|reps
  66|싱글 레그 글루트 브리지|reps|reps
  67|사이드 라잉 힙 어브덕션|reps|reps
  68|덤벨 글루트 브리지|weight_reps|weight_reps
  69|덤벨 스모 스쿼트|weight_reps|weight_reps
  70|덤벨 싱글 레그 루마니안 데드리프트|weight_reps|weight_reps
  71|밴드 글루트 브리지|reps|reps
  72|폼롤러 둔근 이완|time|time
  73|맨몸 스플릿 스쿼트|reps|reps
  74|덤벨 리버스 런지|weight_reps|weight_reps
  75|밴드 스쿼트|reps|reps
  76|밴드 레그 익스텐션|reps|reps
  77|밴드 라잉 레그 컬|reps|reps
  78|폼롤러 대퇴사두근 이완|time|time
  79|폼롤러 햄스트링 이완|time|time
  80|폼롤러 내전근 이완|time|time
  81|벤트 니 카프 레이즈|reps|reps
  82|덤벨 시티드 카프 레이즈|weight_reps|weight_reps
  83|덤벨 싱글 레그 카프 레이즈|weight_reps|weight_reps
  84|밴드 발목 저측굴곡|reps|reps
  85|폼롤러 종아리 이완|time|time
  86|마사지볼 종아리 이완|time|time
  87|덤벨 수트케이스 캐리|weight_time|weight_time,time
  88|덤벨 데드 버그|weight_reps|weight_reps
  89|덤벨 우드초퍼|weight_reps|weight_reps
  90|밴드 팔로프 프레스|reps|reps
  91|밴드 우드초퍼|reps|reps
  92|밴드 스탠딩 크런치|reps|reps
  93|행잉 니 레이즈|reps|reps
  94|행잉 레그 레이즈|reps|reps
  95|행잉 오블리크 니 레이즈|reps|reps
  96|프론 얼터네이팅 암 레그 레이즈|reps|reps
  97|밴드 굿모닝|reps|reps
  98|차일드 포즈|time|time
  99|누운 둔근 스트레칭|time|time
  100|밴드 햄스트링 스트레칭|time|time
  101|밴드 종아리 스트레칭|time|time
  102|밴드 어깨 패스스루|reps|reps
  103|폼롤러 흉추 신전|reps|reps
  104|폼롤러 스노 엔젤|reps|reps
  105|마사지볼 발바닥 이완|time|time
`
const CONFIRMED = new Map(
  CONFIRMED_TABLE.trim()
    .split('\n')
    .map((line) => {
      const [id, name, def, allowed] = line.trim().split('|')
      return [Number(id), { name, default: def, allowed: allowed.split(',') }]
    }),
)

// 독립 목록(표와 별개로 사람이 읽는 분류 기준을 한 번 더 적는다).
const DUMBBELL_23 = [
  2, 6, 7, 8, 10, 11, 12, 18, 21, 27, 34, 35, 45, 46, 52, 68, 69, 70, 74, 82,
  83, 88, 89,
]
const RELEASE_12 = [32, 33, 43, 44, 51, 58, 72, 78, 79, 80, 85, 86]
const META_KEYS_ORDER = [
  'exercise_id',
  'name',
  'instructions',
  'difficulty',
  'exercise_type',
  'exercise_equipment',
  'description',
  'cautions',
  'source_url',
  'default_record_mode',
  'allowed_record_modes',
  'created_at',
  'updated_at',
]

test('S2: 확정 분류표 자체가 올바르다(105행, ID 1~105 연속, 불변식)', () => {
  assert.equal(CONFIRMED.size, 105)
  assert.deepEqual(
    [...CONFIRMED.keys()],
    Array.from({ length: 105 }, (_, i) => i + 1),
  )
  for (const [id, row] of CONFIRMED) {
    assert.ok(RM.isCatalogRecordMode(row.default), `${id}`)
    assert.equal(
      RM.validateRecordModes(row.default, row.allowed).ok,
      true,
      `${id}`,
    )
  }
})

test('S2: 105종 각각의 ID·이름·기본 방식·허용 방식이 확정 분류표와 정확히 일치한다', () => {
  const rows = readSeed('exercises.json')
  assert.equal(rows.length, 105)
  const seen = new Set()
  for (const row of rows) {
    const expected = CONFIRMED.get(row.exercise_id)
    assert.ok(expected, `표에 없는 운동 ${row.exercise_id}`)
    assert.equal(row.name, expected.name, `ID ${row.exercise_id} 이름`)
    assert.equal(
      row.default_record_mode,
      expected.default,
      `ID ${row.exercise_id} 기본`,
    )
    assert.deepEqual(
      row.allowed_record_modes,
      expected.allowed,
      `ID ${row.exercise_id} 허용`,
    )
    seen.add(row.exercise_id)
  }
  assert.equal(seen.size, 105, '모든 ID가 한 번씩')
  // 조회 계층(Exercise.recordModes)도 같다.
  const catalog = D.getSeedCatalog()
  for (const [id, expected] of CONFIRMED) {
    const exercise = catalog.getExerciseById(String(id))
    assert.deepEqual(
      JSON.parse(JSON.stringify(exercise.recordModes)),
      { default: expected.default, allowed: expected.allowed },
      `ID ${id}`,
    )
  }
})

test('S2: 기록 방식별 수량 58/23/23/1/0, 복수 방식은 정확히 29·30·87', () => {
  const rows = readSeed('exercises.json')
  const count = (mode) =>
    rows.filter((r) => r.default_record_mode === mode).length
  assert.equal(count('reps'), 58)
  assert.equal(count('time'), 23)
  assert.equal(count('weight_reps'), 23)
  assert.equal(count('weight_time'), 1)
  assert.equal(count('time_reps'), 0)
  assert.equal(
    ['reps', 'time', 'weight_reps', 'weight_time', 'time_reps'].reduce(
      (n, m) => n + count(m),
      0,
    ),
    105,
  )
  const multi = rows
    .filter((r) => r.allowed_record_modes.length > 1)
    .map((r) => r.exercise_id)
  assert.deepEqual(
    multi.sort((a, b) => a - b),
    [29, 30, 87],
  )
  assert.equal(
    rows.filter((r) => r.allowed_record_modes.length === 1).length,
    102,
  )
})

test('S2: 대표 분류 — 29·30·87 허용 목록, 플랭크 계열·이완 12종 시간형, 102~104 횟수형, 덤벨 23종 중량+횟수형, 87 중량+시간형', () => {
  const byId = new Map(
    readSeed('exercises.json').map((r) => [r.exercise_id, r]),
  )
  const mode = (id) => byId.get(id).default_record_mode
  const allowed = (id) => byId.get(id).allowed_record_modes
  assert.deepEqual(allowed(29), ['time', 'reps', 'time_reps'])
  assert.deepEqual(allowed(30), ['time', 'reps', 'time_reps'])
  assert.deepEqual(allowed(87), ['weight_time', 'time'])
  assert.equal(mode(29), 'time')
  assert.equal(mode(30), 'time')
  assert.equal(mode(87), 'weight_time')
  for (const id of [22, 24]) {
    assert.equal(mode(id), 'time', `플랭크 계열 ${id}`)
    assert.deepEqual(allowed(id), ['time'])
  }
  assert.equal(RELEASE_12.length, 12)
  for (const id of RELEASE_12) {
    assert.equal(mode(id), 'time', `이완 ${id}`)
    assert.deepEqual(allowed(id), ['time'])
  }
  for (const id of [102, 103, 104]) {
    assert.equal(mode(id), 'reps', `가동성 ${id}`)
    assert.deepEqual(allowed(id), ['reps'])
  }
  assert.equal(DUMBBELL_23.length, 23)
  for (const id of DUMBBELL_23) {
    assert.equal(mode(id), 'weight_reps', `덤벨 ${id}`)
    assert.deepEqual(allowed(id), ['weight_reps'])
    assert.equal(byId.get(id).exercise_equipment, '덤벨')
  }
  // 덤벨 장비 24종 중 23종이 중량+횟수형이고 나머지 1종(87)은 중량+시간형이다.
  const dumbbell = [...byId.values()].filter(
    (r) => r.exercise_equipment === '덤벨',
  )
  assert.equal(dumbbell.length, 24)
  assert.deepEqual(
    dumbbell
      .filter((r) => !DUMBBELL_23.includes(r.exercise_id))
      .map((r) => r.exercise_id),
    [87],
  )
})

test('S2: JSON 형식 — 카탈로그 코드만 쓰고(weight 없음) 기존 필드·순서를 보존하며 조사 전용 필드를 넣지 않았다', () => {
  const rows = readSeed('exercises.json')
  for (const row of rows) {
    assert.deepEqual(Object.keys(row), META_KEYS_ORDER, `ID ${row.exercise_id}`)
    assert.ok(RM.isCatalogRecordMode(row.default_record_mode))
    assert.ok(row.allowed_record_modes.every(RM.isCatalogRecordMode))
    assert.ok(!row.allowed_record_modes.includes('weight'))
    assert.notEqual(row.default_record_mode, 'weight')
    assert.equal(typeof row.name, 'string')
    assert.ok(
      row.description.length > 0 &&
        row.instructions.length > 0 &&
        row.cautions.length > 0,
    )
    assert.equal(row.source_url, null)
  }
  // 원래 배열 순서(ID 순이 아니다)가 유지됐다: 첫 운동은 ID 2다.
  assert.equal(rows[0].exercise_id, 2)
  assert.equal(V.validateSeed(raw()).ok, true)
})

test('S2: 코드 매핑 — 메타데이터가 저장 코드로 변환된다(weight_reps→weight, 나머지는 그대로)', () => {
  const catalog = D.getSeedCatalog()
  let weightMapped = 0
  for (const exercise of catalog.getAllExercises()) {
    const stored = Draft.resolveStoredRecordType(exercise)
    assert.equal(stored, RM.toStoredRecordType(exercise.recordModes.default))
    assert.ok(RM.isStoredRecordType(stored))
    assert.ok(DraftTypes.RECORD_TYPES.includes(stored), exercise.id)
    if (exercise.recordModes.default === 'weight_reps') {
      assert.equal(stored, 'weight')
      weightMapped += 1
    } else {
      assert.equal(stored, exercise.recordModes.default)
    }
  }
  assert.equal(weightMapped, 23)
  // 87: 카탈로그 기본은 weight_time이고 저장 코드도 weight_time이다(S3부터 W02가 그대로 쓴다).
  const suitcase = catalog.getExerciseById('87')
  assert.equal(Draft.resolveStoredRecordType(suitcase), 'weight_time')
  // 대표값
  const typeOf = (id) =>
    Draft.resolveStoredRecordType(catalog.getExerciseById(id))
  assert.deepEqual(['22', '24', '28', '29', '30'].map(typeOf), [
    'time',
    'time',
    'time',
    'time',
    'time',
  ])
  assert.deepEqual(['5', '16', '102', '103', '104'].map(typeOf), [
    'reps',
    'reps',
    'reps',
    'reps',
    'reps',
  ])
  assert.deepEqual(['2', '10', '88'].map(typeOf), [
    'weight',
    'weight',
    'weight',
  ])
  // 허용 방식(저장 코드, 카탈로그 순서): 단일 102종과 복수 3종
  const allowedOf = (id) => [
    ...Draft.allowedRecordTypes(catalog.getExerciseById(id)),
  ]
  assert.deepEqual(allowedOf('22'), ['time'])
  assert.deepEqual(allowedOf('10'), ['weight'])
  assert.deepEqual(allowedOf('29'), ['time', 'reps', 'time_reps'])
  assert.deepEqual(allowedOf('30'), ['time', 'reps', 'time_reps'])
  assert.deepEqual(allowedOf('87'), ['weight_time', 'time'])
  const multi = catalog
    .getAllExercises()
    .filter((e) => Draft.allowedRecordTypes(e).length > 1)
    .map((e) => e.id)
    .sort()
  assert.deepEqual(multi, ['29', '30', '87'])
})

test('S2: W13→W02 경로 — 메타데이터의 기본 방식(저장 코드)으로 초안에 담기고 허용 방식 검증을 통과한다', () => {
  const catalog = D.getSeedCatalog()
  const picked = ['22', '32', '87', '2', '5', '103'].map((id) =>
    catalog.getExerciseById(id),
  )
  const draft = Draft.addExercisesToDraft(draftOf([]), picked, () =>
    T0.toISOString(),
  )
  assert.deepEqual(
    draft.items.map((i) => i.recordType),
    ['time', 'time', 'weight_time', 'weight', 'reps', 'reps'],
  )
  const known = new Set(catalog.getAllExercises().map((e) => e.id))
  const allowed = Draft.buildAllowedRecordTypes(catalog.getAllExercises())
  assert.equal(Draft.validateDraft(draft, known, allowed).ok, true)
})

test('S2: 개발용 Mock 운동 15종은 메타데이터가 없어도 기존 추론대로 동작한다', async () => {
  // Mock 모듈은 이 테스트에서만 불러온다(앞쪽 모듈 로딩 순서가 E02 렌더링 테스트에 영향을 주지 않도록).
  const MockData = await server.ssrLoadModule(
    '/src/exercise/mock/mockExerciseData.ts',
  )
  const mocks = MockData.MOCK_EXERCISES
  assert.equal(mocks.length, 15)
  const legacy = (e) =>
    e.equipment.includes('덤벨')
      ? 'weight'
      : e.targetMuscles.some((p) => p === '유산소' || p === '스트레칭')
        ? 'time'
        : 'reps'
  for (const exercise of mocks) {
    assert.equal(exercise.recordModes, undefined, exercise.id)
    assert.deepEqual(
      [...Draft.allowedRecordTypes(exercise)].sort(),
      ['reps', 'time', 'weight'],
      exercise.id,
    ) // 메타데이터가 없으면 허용 방식은 기존 3종이다
    assert.equal(
      Draft.resolveStoredRecordType(exercise),
      legacy(exercise),
      exercise.id,
    )
  }
})

test('S2: 기존 루틴 데이터는 그대로이고 새 기본 방식과 목표 종류가 모순되지 않는다(읽기 전용)', () => {
  const data = raw()
  const catalog = D.getSeedCatalog()
  assert.equal(data.routines.length, 33)
  assert.equal(data.routineItems.length, 99)
  const reps = data.routineItems.filter((i) => i.target_reps !== null)
  const time = data.routineItems.filter(
    (i) => i.target_duration_seconds !== null,
  )
  assert.equal(reps.length, 82)
  assert.equal(time.length, 17)
  assert.equal(reps.length + time.length, 99, '횟수·시간 중 정확히 하나')
  // 루틴 항목에는 중량 목표 필드가 없다(루틴 JSON에 중량을 임의로 추가하지 않았다).
  for (const item of data.routineItems) {
    assert.deepEqual(Object.keys(item).sort(), [
      'created_at',
      'exercise_id',
      'exercise_routine_item_id',
      'rest_seconds',
      'routine_id',
      'sequence_number',
      'target_duration_seconds',
      'target_reps',
      'target_sets',
    ])
  }
  // 루틴 28의 제자리 걷기 중복 구성(60·120·60초)은 그대로다.
  const routine28 = data.routineItems
    .filter((i) => i.routine_id === 28)
    .sort((a, b) => a.sequence_number - b.sequence_number)
  assert.deepEqual(
    routine28.map((i) => i.exercise_id),
    [28, 28, 28],
  )
  assert.deepEqual(
    routine28.map((i) => i.target_duration_seconds),
    [60, 120, 60],
  )
  // 횟수 목표 항목의 운동은 횟수형 또는 중량+횟수형, 시간 목표 항목의 운동은 시간형이다(0건 모순).
  const defaultOf = (item) =>
    catalog.getExerciseById(String(item.exercise_id)).recordModes.default
  assert.ok(reps.every((i) => ['reps', 'weight_reps'].includes(defaultOf(i))))
  assert.ok(time.every((i) => defaultOf(i) === 'time'))
  // 덤벨 운동의 루틴 항목은 횟수 목표만 있다(중량 목표 없음): 항목 26건.
  const dumbbellItems = data.routineItems.filter((i) =>
    DUMBBELL_23.includes(i.exercise_id),
  )
  assert.equal(dumbbellItems.length, 26)
  assert.ok(dumbbellItems.every((i) => i.target_reps !== null))
  // 분류 사례: 플랭크·사이드 플랭크는 시간 목표, 102~104는 횟수 목표다.
  const targetKind = (id) =>
    data.routineItems
      .filter((i) => i.exercise_id === id)
      .map((i) => (i.target_reps !== null ? 'reps' : 'time'))
  assert.deepEqual(targetKind(22), ['time'])
  assert.deepEqual(targetKind(24), ['time', 'time'])
  for (const id of [102, 103, 104]) {
    assert.ok(targetKind(id).every((k) => k === 'reps'))
  }
  // 조회 계층의 루틴 항목 목표값도 그대로 보존된다(기록 방식을 정하지 않는다).
  const items = catalog.getRoutineItems('28')
  assert.deepEqual(
    items.map((i) => i.targetDurationSeconds),
    [60, 120, 60],
  )
  assert.ok(items.every((i) => i.targetReps === null))
})

test('S2: 기존 저장 목록·세션은 카탈로그가 바뀌어도 당시 기록 방식을 유지한다(재해석 없음)', () => {
  // 옛 목록은 플랭크(22)를 횟수형으로 저장했다. 카탈로그 기본은 이제 time이지만 저장된 값은 그대로다.
  const list = {
    id: 'l-old',
    ownerId: 'u',
    schemaVersion: 1,
    plannedDate: '2026-11-13',
    catalogVersion: 'seed',
    revision: 1,
    requestId: 'r-old',
    createdAt: T0.toISOString(),
    updatedAt: T0.toISOString(),
    items: [
      {
        exerciseId: '22',
        exerciseNameSnapshot: '플랭크',
        recordType: 'reps',
        sets: [{ reps: 10 }],
      },
      {
        exerciseId: '10',
        exerciseNameSnapshot: '덤벨 바이셉스 컬',
        recordType: 'weight',
        sets: [{ reps: 8 }],
      },
    ],
  }
  const parsed = Model.parseWorkoutList(JSON.parse(JSON.stringify(list)))
  assert.notEqual(parsed, null)
  assert.deepEqual(
    parsed.items.map((i) => i.recordType),
    ['reps', 'weight'],
  )
  const session = Model.createWorkoutSession({
    id: 's-old',
    ownerId: 'u',
    list,
    now: T0,
  })
  assert.deepEqual(
    session.listSnapshot.items.map((i) => i.recordType),
    ['reps', 'weight'],
  )
  assert.notEqual(
    Model.parseWorkoutSession(JSON.parse(JSON.stringify(session))),
    null,
  )
  // 같은 운동의 카탈로그 기본은 달라졌지만(플랭크 time) 저장 값은 영향받지 않는다.
  const catalog = D.getSeedCatalog()
  assert.equal(
    Draft.resolveStoredRecordType(catalog.getExerciseById('22')),
    'time',
  )
  assert.equal(session.listSnapshot.items[0].recordType, 'reps')
})
