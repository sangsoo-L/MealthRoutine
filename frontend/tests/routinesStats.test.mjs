import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// FAST-02: 운동 루틴(W06~W08) 저장 모델·화면과 운동 기록 통계(계산·화면)·연결.
// 대문자 드라이브(C:\)의 작업 폴더에서 실행한다. 실제 IndexedDB(저장·계정 격리·v1→v2 업그레이드)와 화면 이동은 Chrome 스크립트(routines-stats)가 검증한다.
let server
let R // workoutRoutineModel.ts
let S // exerciseStats.ts
let V // routineView.ts
let D // exerciseDb.ts
let ListView
let DetailView
let StateNotice
let EditView
let StatsView
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  R = await server.ssrLoadModule('/src/exercise/workoutRoutineModel.ts')
  S = await server.ssrLoadModule('/src/exercise/exerciseStats.ts')
  V = await server.ssrLoadModule('/src/exercise/routineView.ts')
  D = await server.ssrLoadModule('/src/exercise/local/exerciseDb.ts')
  ListView = (
    await server.ssrLoadModule('/src/components/routine/RoutineListView.tsx')
  ).default
  const detail = await server.ssrLoadModule(
    '/src/components/routine/RoutineDetailView.tsx',
  )
  DetailView = detail.default
  StateNotice = detail.RoutineStateNotice
  EditView = (
    await server.ssrLoadModule('/src/components/routine/RoutineEditView.tsx')
  ).default
  StatsView = (
    await server.ssrLoadModule('/src/components/stats/ExerciseStatsView.tsx')
  ).default
})
after(async () => {
  await server?.close()
})

const noop = () => {}
const html = (element) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, element))
const hrefs = (out) =>
  [...out.matchAll(/<a [^>]*href="([^"]+)"/g)].map((m) => m[1])

// ── 데이터 ──
const draftItem = (id, name, over = {}) => ({
  itemId: `it-${id}`,
  exerciseId: `e-${id}`,
  name,
  recordType: 'reps',
  sets: [{ reps: 10 }, { reps: 10 }],
  ...over,
})
const draft = (items = [draftItem(1, '푸시업')]) => ({
  v: 1,
  day: 'today',
  items,
  updatedAt: '2026-11-18T01:00:00.000Z',
})
const NOW = new Date('2026-11-18T03:04:05.000Z')
const build = (over = {}) =>
  R.buildRoutine({
    id: 'r1',
    ownerId: 'free',
    requestId: 'req-1',
    name: '월요일 상체',
    description: '',
    draft: draft(),
    now: NOW,
    ...over,
  })

// ── 저장소 스키마 ──
test('DB v6: 버전 6이고 workoutRoutines·mealRecords·mealPlans·workoutPlans·dailyQuizzes·rewardLedger 저장소와 인덱스 이름이 정의되어 있다(기존 저장소는 그대로)', () => {
  assert.equal(D.EXERCISE_DB_VERSION, 6)
  assert.equal(D.STORE_DAILY_QUIZZES, 'dailyQuizzes')
  assert.equal(D.STORE_REWARD_LEDGER, 'rewardLedger')
  assert.equal(D.INDEX.quizzesByOwnerDate, 'byOwnerDate')
  assert.equal(D.INDEX.ledgerByOwnerKey, 'byOwnerKey')
  assert.equal(D.STORE_WORKOUT_PLANS, 'workoutPlans')
  assert.equal(D.INDEX.workoutPlansByOwnerDate, 'byOwnerDate')
  assert.equal(D.INDEX.workoutPlansByOwnerRequest, 'byOwnerRequest')
  assert.equal(D.STORE_MEAL_PLANS, 'mealPlans')
  assert.equal(D.INDEX.mealPlansByOwnerDate, 'byOwnerDate')
  assert.equal(D.INDEX.mealPlansByOwnerRequest, 'byOwnerRequest')
  assert.equal(D.STORE_MEALS, 'mealRecords')
  assert.equal(D.INDEX.mealsByOwnerDate, 'byOwnerDate')
  assert.equal(D.INDEX.mealsByOwnerRequest, 'byOwnerRequest')
  assert.equal(D.EXERCISE_DB_NAME, 'mealthroutine-exercise')
  assert.equal(D.STORE_ROUTINES, 'workoutRoutines')
  assert.equal(D.STORE_LISTS, 'workoutLists')
  assert.equal(D.STORE_SESSIONS, 'workoutSessions')
  assert.equal(D.STORE_RECORDS, 'workoutRecords')
  assert.equal(D.INDEX.routinesByOwnerUpdated, 'byOwnerUpdated')
  assert.equal(D.INDEX.routinesByOwnerRequest, 'byOwnerRequest')
  // 기존 인덱스 이름은 바뀌지 않았다.
  assert.equal(D.INDEX.listsByOwnerDate, 'byOwnerDate')
  assert.equal(D.INDEX.recordsBySession, 'bySession')
  // 업그레이드는 단계별이고 v2 단계는 저장소 추가뿐이다(기존 단계 코드는 그대로).
  const source = read('../src/exercise/local/exerciseDb.ts')
  assert.match(source, /if \(oldVersion < 1\) \{/)
  assert.match(
    source,
    /if \(oldVersion < 2\) \{[\s\S]*createObjectStore\(STORE_ROUTINES/,
  )
  assert.match(
    source,
    /if \(oldVersion < 3\) \{[\s\S]*createObjectStore\(STORE_MEALS/,
  )
  assert.match(
    source,
    /if \(oldVersion < 4\) \{[\s\S]*createObjectStore\(STORE_MEAL_PLANS/,
  )
  assert.match(
    source,
    /if \(oldVersion < 5\) \{[\s\S]*createObjectStore\(\s*STORE_WORKOUT_PLANS/,
  )
  assert.doesNotMatch(
    source.slice(source.indexOf('if (oldVersion < 2)')),
    /deleteObjectStore|deleteIndex|clear\(/,
  )
})

// ── 이름·소개 검증 ──
test('루틴 이름·소개: 이름은 필수(앞뒤 공백 제외 1~50자), 소개는 선택(200자 이하)', () => {
  assert.deepEqual(R.validateRoutineMeta('  이름  ', ' 소개 '), {
    ok: true,
    name: '이름',
    description: '소개',
  })
  const empty = R.validateRoutineMeta('   ', '')
  assert.equal(empty.ok, false)
  assert.deepEqual(
    empty.issues.map((i) => [i.field, i.message]),
    [['name', R.ROUTINE_META_MESSAGES.nameRequired]],
  )
  assert.equal(R.validateRoutineMeta('가'.repeat(50), '').ok, true)
  assert.equal(R.validateRoutineMeta('가'.repeat(51), '').ok, false)
  assert.equal(R.validateRoutineMeta('이름', '가'.repeat(200)).ok, true)
  const long = R.validateRoutineMeta('이름', '가'.repeat(201))
  assert.equal(long.ok, false)
  assert.equal(long.issues[0].field, 'description')
  // 이름과 소개가 모두 잘못되면 둘 다 알린다.
  assert.equal(R.validateRoutineMeta('', '가'.repeat(201)).issues.length, 2)
})

// ── 만들기·수정 ──
test('루틴 만들기: 초안을 저장 모양으로 정규화하고 revision 1, createdAt = updatedAt이다', () => {
  const routine = build({ name: ' 월요일 상체 ', description: ' 가슴 ' })
  assert.equal(routine.id, 'r1')
  assert.equal(routine.ownerId, 'free')
  assert.equal(routine.schemaVersion, R.ROUTINE_SCHEMA_VERSION)
  assert.equal(routine.name, '월요일 상체')
  assert.equal(routine.description, '가슴')
  assert.equal(routine.revision, 1)
  assert.equal(routine.createdAt, NOW.toISOString())
  assert.equal(routine.updatedAt, NOW.toISOString())
  assert.deepEqual(routine.items, [
    {
      exerciseId: 'e-1',
      exerciseNameSnapshot: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 10 }, { reps: 10 }],
    },
  ])
  // 읽기 검증을 통과하는 값이다(저장에 성공한 값이 손상으로 읽히지 않는다).
  assert.notEqual(R.parseWorkoutRoutine(routine), null)
})

test('루틴 만들기: 이름이 없거나 운동이 없거나 세트 목표가 올바르지 않으면 만들지 않는다', () => {
  assert.equal(build({ name: '' }), null)
  assert.equal(build({ draft: draft([]) }), null)
  assert.equal(
    build({
      draft: draft([draftItem(1, '푸시업', { sets: [{ reps: 0 }] })]),
    }),
    null,
  )
  // 알 수 없는 운동 id는 운동 목록을 알 때만 걸러 낸다.
  assert.equal(build({ knownExerciseIds: new Set(['x']) }), null)
  assert.notEqual(build({ knownExerciseIds: new Set(['e-1']) }), null)
})

test('루틴 수정: createdAt·id·소유자·요청 id는 유지하고 revision은 오르며 updatedAt은 갱신된다', () => {
  const original = build()
  const later = new Date('2026-11-19T00:00:00.000Z')
  const updated = R.buildRoutineUpdate(original, {
    name: '새 이름',
    description: '새 소개',
    draft: draft([draftItem(2, '스쿼트'), draftItem(1, '푸시업')]),
    now: later,
  })
  assert.equal(updated.id, original.id)
  assert.equal(updated.ownerId, original.ownerId)
  assert.equal(updated.requestId, original.requestId)
  assert.equal(updated.createdAt, original.createdAt)
  assert.equal(updated.updatedAt, later.toISOString())
  assert.equal(updated.revision, 2)
  assert.deepEqual(
    updated.items.map((i) => i.exerciseNameSnapshot),
    ['스쿼트', '푸시업'],
  )
  // 원본은 바뀌지 않는다.
  assert.equal(original.revision, 1)
  assert.equal(original.name, '월요일 상체')
  assert.equal(
    R.buildRoutineUpdate(original, {
      name: ' ',
      description: '',
      draft: draft(),
      now: later,
    }),
    null,
  )
})

test('같은 요청의 재전송 판정: 이름·소개·운동 구성이 모두 같을 때만 같은 내용이다', () => {
  const a = build()
  assert.equal(R.sameRoutineContent(a, build()), true)
  assert.equal(R.sameRoutineContent(a, build({ name: '다름' })), false)
  assert.equal(R.sameRoutineContent(a, build({ description: '다름' })), false)
  assert.equal(
    R.sameRoutineContent(
      a,
      build({
        draft: draft([draftItem(1, '푸시업', { sets: [{ reps: 11 }] })]),
      }),
    ),
    false,
  )
})

test('저장값 검증: 모양이 맞는 값만 읽고, 이름·소개 길이·운동 줄·revision·요청 id가 틀리면 손상이다', () => {
  const good = build()
  assert.notEqual(R.parseWorkoutRoutine(good), null)
  const bad = (patch) => R.parseWorkoutRoutine({ ...good, ...patch })
  assert.equal(bad({ schemaVersion: 2 }), null)
  assert.equal(bad({ name: '' }), null)
  assert.equal(bad({ name: '가'.repeat(51) }), null)
  assert.equal(bad({ description: '가'.repeat(201) }), null)
  assert.equal(bad({ items: [] }), null)
  assert.equal(bad({ items: '깨짐' }), null)
  assert.equal(bad({ revision: 0 }), null)
  assert.equal(bad({ requestId: '공백 있음' }), null)
  assert.equal(bad({ ownerId: '' }), null)
  assert.equal(bad({ createdAt: '어제' }), null)
  assert.equal(R.parseWorkoutRoutine(null), null)
  assert.equal(R.parseWorkoutRoutine([]), null)
})

test('루틴 → 오늘의 운동 초안: 새 항목 id로 복사하고 루틴은 바꾸지 않으며 W02 검증을 통과한다', async () => {
  const routine = build({
    draft: draft([
      draftItem(1, '푸시업'),
      draftItem(2, '플랭크', {
        recordType: 'time',
        sets: [{ targetSeconds: 60 }],
      }),
    ]),
  })
  const snapshot = JSON.stringify(routine)
  const result = R.routineToDraft(
    routine,
    () => 'T',
    (() => {
      let n = 0
      return () => `new-${n++}`
    })(),
  )
  assert.equal(result.day, 'today')
  assert.equal(result.updatedAt, 'T')
  assert.deepEqual(
    result.items.map((i) => [i.itemId, i.exerciseId, i.name, i.recordType]),
    [
      ['new-0', 'e-1', '푸시업', 'reps'],
      ['new-1', 'e-2', '플랭크', 'time'],
    ],
  )
  assert.equal(JSON.stringify(routine), snapshot)
  // 복사본이다(세트를 고쳐도 루틴이 바뀌지 않는다).
  result.items[0].sets[0].reps = 99
  assert.equal(routine.items[0].sets[0].reps, 10)
  const { validateDraft } = await server.ssrLoadModule(
    '/src/exercise/workoutDraftModel.ts',
  )
  assert.equal(validateDraft(R.routineToDraft(routine)).ok, true)
})

// ── 표시 ──
test('루틴 표시 문구: 운동·세트 수와 등록 날짜(알 수 없으면 등록일 미확인)', () => {
  const routine = build({
    draft: draft([draftItem(1, '푸시업'), draftItem(2, '스쿼트')]),
  })
  assert.equal(V.routineSummaryText(routine.items), '운동 2개 · 4세트')
  assert.match(
    V.routineCreatedLabel('2026-11-18T03:00:00.000Z'),
    /^2026\. 11\. 1[78]\. 등록$/,
  )
  assert.equal(V.routineCreatedLabel('깨진값'), '등록일 미확인')
})

// ── W06 목록 ──
const mk = (n, over = {}) =>
  build({ id: `r${n}`, requestId: `req-${n}`, name: `루틴 ${n}`, ...over })

test('W06: 루틴 목록은 이름·운동 수·세트·등록 날짜와 상세 링크, 새 루틴 만들기 링크를 보인다', () => {
  const out = html(
    createElement(ListView, {
      state: { status: 'ready', items: [mk(2), mk(1)], skippedCount: 0 },
      onRetry: noop,
    }),
  )
  assert.match(out, /<h1[^>]*>내 운동 루틴<\/h1>/)
  assert.deepEqual(hrefs(out), [
    '/records/exercise/routines/new',
    '/records/exercise/routines/r2',
    '/records/exercise/routines/r1',
  ])
  assert.match(out, /루틴 2/)
  assert.match(out, /운동 1개 · 2세트/)
  assert.match(out, /2026\. 11\. 1[78]\. 등록/)
  assert.match(out, /<span[^>]*>2개<\/span>/)
})

test('W06: 비어 있음·불러오는 중·실패·준비 중은 서로 다른 안내이고 가짜 루틴이 없다', () => {
  const view = (state) =>
    html(createElement(ListView, { state, onRetry: noop }))
  const empty = view({ status: 'ready', items: [], skippedCount: 0 })
  assert.match(empty, /아직 저장한 루틴이 없어요/)
  assert.doesNotMatch(empty, /\/routines\/r/)
  assert.match(
    view({ status: 'loading' }),
    /role="status"[^>]*>루틴을 불러오는 중/,
  )
  const error = view({ status: 'error' })
  assert.match(error, /role="alert"/)
  assert.match(error, /다시 시도/)
  // 저장소가 없으면(운영) "새 루틴 만들기"는 링크가 아니라 비활성 버튼이고 준비 중이라고 알린다.
  const unavailable = view({ status: 'unavailable' })
  assert.match(unavailable, /루틴 기능을 준비 중이에요/)
  assert.match(unavailable, /aria-disabled="true"/)
  assert.deepEqual(hrefs(unavailable), [])
  // 손상 루틴만 있으면 비어 있다고 말하지 않는다.
  const corrupt = view({ status: 'ready', items: [], skippedCount: 2 })
  assert.match(corrupt, /루틴을 확인할 수 없어요/)
  assert.doesNotMatch(corrupt, /아직 저장한 루틴이 없어요/)
  assert.match(corrupt, /읽을 수 없는 루틴 2개를 제외했어요/)
  const mixed = view({ status: 'ready', items: [mk(1)], skippedCount: 1 })
  assert.match(mixed, /루틴 1/)
  assert.match(mixed, /읽을 수 없는 루틴 1개를 제외했어요/)
})

// ── W07 상세 ──
const detail = (over = {}) =>
  html(
    createElement(DetailView, {
      routine: build({
        description: '가슴·어깨\n둘째 줄',
        draft: draft([
          draftItem(1, '푸시업', { sets: [{ reps: 10 }, { reps: 8 }] }),
          draftItem(2, '플랭크', {
            recordType: 'time',
            sets: [{ targetSeconds: 60 }],
          }),
        ]),
      }),
      bodyParts: ['가슴', '코어'],
      startPanel: 'none',
      startError: null,
      onStart: noop,
      onConfirmReplace: noop,
      onCancelReplace: noop,
      deletePanel: 'none',
      deleting: false,
      deleteError: null,
      onOpenDelete: noop,
      onConfirmDelete: noop,
      onCancelDelete: noop,
      ...over,
    }),
  )

test('W07: 이름·소개·요약(운동 수·세트·부위)과 운동 순서·세트별 목표, 운동 방법 확인 링크', () => {
  const out = detail()
  assert.match(out, /<h1[^>]*>월요일 상체<\/h1>/)
  assert.match(out, /가슴·어깨/)
  assert.match(out, /운동 2개 · 3세트/)
  assert.match(out, /부위 가슴·코어/)
  assert.equal((out.match(/data-routine-exercise/g) ?? []).length, 2)
  assert.match(out, /푸시업/)
  assert.match(out, /1세트, 목표 10회/)
  assert.match(out, /2세트, 목표 8회/)
  assert.match(out, /목표 시간 1분/)
  assert.deepEqual(
    hrefs(out).filter((h) => h.startsWith('/exercises/')),
    ['/exercises/e-1', '/exercises/e-2'],
  )
  // 부위를 알 수 없으면(운동 목록을 읽지 못함) 부위 줄을 그리지 않는다.
  assert.doesNotMatch(detail({ bodyParts: null }), /부위 /)
})

test('W07: 수정 링크·운동 준비·삭제 버튼이 있고 커뮤니티 공유는 비활성 버튼(연결 없음)이다', () => {
  const out = detail()
  assert.ok(hrefs(out).includes('/records/exercise/routines/r1/edit'))
  assert.match(out, /이 루틴으로 운동 준비/)
  assert.match(out, /루틴 삭제/)
  assert.match(
    out,
    /<button[^>]*aria-disabled="true"[^>]*aria-describedby="routine-share-note"[^>]*>커뮤니티 공유<\/button>/,
  )
  assert.match(out, /커뮤니티 공유는 준비 중이에요/)
})

test('W07: 구성 중인 운동이 있으면 교체 확인, 삭제는 확인 패널을 거치고 오류를 알린다', () => {
  const replace = detail({ startPanel: 'replace' })
  assert.match(replace, /구성 중인 운동을 바꿀까요\?/)
  assert.match(replace, /이 루틴으로 바꾸기/)
  assert.match(replace, /취소하고 유지하기/)
  assert.doesNotMatch(detail(), /구성 중인 운동을 바꿀까요/)
  const del = detail({ deletePanel: 'confirm', deleteError: '삭제 실패' })
  assert.match(del, /이 루틴을 삭제할까요\?/)
  assert.match(del, /되돌릴 수 없어요/)
  assert.match(del, /운동\s*기록과 오늘의 운동 목록에는 영향이 없어요/)
  assert.match(del, /role="alert"[^>]*>삭제 실패/)
  assert.match(del, /삭제하기/)
  assert.match(
    detail({ deletePanel: 'confirm', deleting: true }),
    /삭제하는 중…/,
  )
  assert.match(
    detail({ startError: '준비 실패' }),
    /role="alert"[^>]*>준비 실패/,
  )
})

test('W07·W08 루틴 상태 안내: 없는 루틴·실패·준비 중·불러오는 중은 목록으로 가는 링크를 둔다', () => {
  const view = (state) =>
    html(createElement(StateNotice, { state, onRetry: noop }))
  const missing = view({ status: 'notFound' })
  assert.match(missing, /루틴을 찾을 수 없어요/)
  assert.deepEqual(hrefs(missing), ['/records/exercise/routines'])
  assert.match(view({ status: 'error' }), /다시 시도/)
  assert.match(view({ status: 'unavailable' }), /준비 중이에요/)
  const loading = view({ status: 'loading' })
  assert.match(loading, /불러오는 중/)
  assert.deepEqual(hrefs(loading), [])
})

// ── W08 편집 ──
const editView = (over = {}) =>
  html(
    createElement(EditView, {
      mode: 'create',
      name: '',
      description: '',
      onNameChange: noop,
      onDescriptionChange: noop,
      draft: draft([]),
      allowedFor: () => undefined,
      liveIssues: [],
      attempt: null,
      notice: null,
      actions: {
        moveItem: noop,
        removeItem: noop,
        setRecordType: noop,
        addSet: noop,
        removeSet: noop,
        updateSet: noop,
      },
      onAddExercises: noop,
      onSave: noop,
      saving: false,
      saveError: null,
      cancelTo: '/records/exercise/routines',
      ...over,
    }),
  )

test('W08: 새 루틴 화면은 이름·소개 입력, 운동 추가, 저장·편집 취소를 보이고 비어 있는 안내가 있다', () => {
  const out = editView()
  assert.match(out, /<h1[^>]*>새 루틴 만들기<\/h1>/)
  assert.match(out, /<label for="routine-name"[^>]*>루틴 이름<\/label>/)
  assert.match(out, /<textarea id="routine-description"/)
  assert.match(out, /id="routine-add"[^>]*>＋ 운동 추가/)
  assert.match(out, /아직 추가한 운동이 없어요/)
  assert.match(out, /루틴 저장/)
  assert.deepEqual(hrefs(out), ['/records/exercise/routines'])
  assert.match(out, /편집 취소/)
  assert.match(editView({ mode: 'edit' }), /<h1[^>]*>루틴 수정<\/h1>/)
})

test('W08: 운동 구성은 W02와 같은 카드(순서 이동·세트별 목표)로 편집하고 저장 시도 오류를 한꺼번에 알린다', () => {
  const out = editView({
    name: '이름',
    draft: draft([draftItem(1, '푸시업'), draftItem(2, '스쿼트')]),
  })
  assert.match(out, /푸시업/)
  assert.match(out, /스쿼트/)
  assert.match(out, /운동별 기록 방식을 선택하고 세트별 목표를 설정해 주세요/)
  const attempted = editView({
    attempt: {
      metaIssues: [
        { field: 'name', message: R.ROUTINE_META_MESSAGES.nameRequired },
      ],
      draftIssues: [
        { field: 'items', message: '운동을 1개 이상 추가해 주세요.' },
      ],
    },
  })
  assert.match(attempted, /고칠 곳이 2개 있어요/)
  assert.match(attempted, /aria-invalid="true"/)
  assert.match(
    attempted,
    /id="routine-name-error"[^>]*>루틴 이름을 입력해 주세요\./,
  )
  assert.match(editView({ saving: true }), /저장하는 중…/)
  assert.match(
    editView({ saveError: '저장 실패' }),
    /role="alert"[^>]*>저장 실패/,
  )
  assert.match(
    editView({ notice: '운동 2개를 추가했어요.' }),
    /운동 2개를 추가했어요\./,
  )
})

// ── 통계 계산 ──
const TODAY = '2026-11-18' // 수요일
const rec = (id, date, over = {}) => ({
  id,
  ownerId: 'free',
  sessionId: `s-${id}`,
  sourceListId: 'l',
  plannedDate: date,
  performedDate: date,
  startedAt: `${date}T01:00:00.000Z`,
  completedAt: `${date}T02:00:00.000Z`,
  exercises: [
    {
      exerciseId: 'e-push',
      exerciseNameSnapshot: '푸시업',
      recordType: 'reps',
      plannedSetCount: 3,
      completedSets: [
        {
          setNumber: 1,
          target: { reps: 10 },
          actualReps: 10,
          measuredMs: null,
        },
        { setNumber: 2, target: { reps: 10 }, actualReps: 9, measuredMs: null },
      ],
    },
  ],
  totals: {
    exerciseCount: 1,
    completedSetCount: 2,
    plannedSetCount: 3,
    measuredMs: null,
  },
  catalogVersion: 'x',
  createdAt: `${date}T02:00:00.000Z`,
  ...over,
})
const exRow = (id, name, sets) => ({
  exerciseId: id,
  exerciseNameSnapshot: name,
  recordType: 'reps',
  plannedSetCount: sets,
  completedSets: Array.from({ length: sets }, (_, i) => ({
    setNumber: i + 1,
    target: { reps: 10 },
    actualReps: 10,
    measuredMs: null,
  })),
})

test('통계 기간: 주간은 월~일, 월간은 1일~말일(기기 로컬 날짜), 이전 기간 제목', () => {
  const week = S.statsRange('week', 0, TODAY)
  assert.deepEqual(
    [week.from, week.to, week.label],
    ['2026-11-16', '2026-11-22', '이번 주'],
  )
  assert.equal(week.sub, '11월 16일 ~ 11월 22일')
  const prev = S.statsRange('week', -1, TODAY)
  assert.deepEqual(
    [prev.from, prev.to, prev.label],
    ['2026-11-09', '2026-11-15', '지난주'],
  )
  assert.equal(S.statsRange('week', -3, TODAY).label, '3주 전')
  const month = S.statsRange('month', 0, TODAY)
  assert.deepEqual(
    [month.from, month.to, month.label, month.sub],
    ['2026-11-01', '2026-11-30', '이번 달', '2026년 11월'],
  )
  assert.equal(S.statsRange('month', -1, TODAY).label, '지난달')
  const older = S.statsRange('month', -2, TODAY)
  assert.deepEqual(
    [older.from, older.to, older.label],
    ['2026-09-01', '2026-09-30', '2026년 9월'],
  )
  // 해를 넘기는 이동과 2월(윤년 아님)
  const prevYear = S.statsRange('month', -11, '2027-01-15')
  assert.deepEqual([prevYear.from, prevYear.to], ['2026-02-01', '2026-02-28'])
  // 월요일·일요일 경계
  assert.equal(S.statsRange('week', 0, '2026-11-16').from, '2026-11-16')
  assert.equal(S.statsRange('week', 0, '2026-11-22').from, '2026-11-16')
  assert.equal(S.statsRange('week', 0, '2026-11-23').from, '2026-11-23')
})

test('통계 기간 오프셋: 미래로 가지 않고 한계(104주·24개월) 너머로 거슬러 가지 않으며 정수가 아니면 이번 기간이다', () => {
  assert.equal(S.clampOffset('week', 5), 0)
  assert.equal(S.clampOffset('week', -500), -S.MAX_WEEK_BACK)
  assert.equal(S.clampOffset('month', -500), -S.MAX_MONTH_BACK)
  assert.equal(S.clampOffset('week', Number.NaN), 0)
  assert.equal(S.clampOffset('week', -1.5), 0)
  assert.equal(S.statsRange('week', 3, TODAY).offset, 0)
})

test('통계 추이 구간: 주간은 요일 7칸, 월간은 달 안으로 잘라 낸 주차 칸이며 모든 날짜를 한 번씩만 덮는다', () => {
  const week = S.statsBuckets(S.statsRange('week', 0, TODAY))
  assert.deepEqual(
    week.map((b) => b.label),
    ['월', '화', '수', '목', '금', '토', '일'],
  )
  assert.equal(week[2].from, '2026-11-18')
  assert.match(week[0].spoken, /^월요일\(11월 16일\)$/)
  const nov = S.statsBuckets(S.statsRange('month', 0, TODAY))
  assert.deepEqual(
    nov.map((b) => [b.label, b.from, b.to]),
    [
      ['1주차', '2026-11-01', '2026-11-01'],
      ['2주차', '2026-11-02', '2026-11-08'],
      ['3주차', '2026-11-09', '2026-11-15'],
      ['4주차', '2026-11-16', '2026-11-22'],
      ['5주차', '2026-11-23', '2026-11-29'],
      ['6주차', '2026-11-30', '2026-11-30'],
    ],
  )
  const oct = S.statsBuckets(S.statsRange('month', -1, TODAY))
  assert.equal(oct.length, 5)
  assert.equal(oct[0].from, '2026-10-01')
  assert.equal(oct.at(-1).to, '2026-10-31')
  // 겹치거나 빠지는 날짜가 없다(각 칸은 다음 칸 바로 전날에서 끝난다).
  for (let i = 1; i < oct.length; i++) {
    const prev = new Date(`${oct[i - 1].to}T12:00:00`)
    prev.setDate(prev.getDate() + 1)
    assert.equal(prev.toISOString().slice(0, 10) <= oct[i].from, true)
  }
})

test('통계 집계: 운동 횟수는 완료 세션 수, 운동한 날짜는 서로 다른 날짜 수(하루 여러 번은 1일)', () => {
  const range = S.statsRange('week', 0, TODAY)
  const stats = S.computeStats(
    [rec('a', '2026-11-16'), rec('b', '2026-11-16'), rec('c', '2026-11-18')],
    range,
  )
  assert.equal(stats.sessionCount, 3)
  assert.equal(stats.activeDays, 2)
  assert.deepEqual(
    stats.buckets.map((b) => b.sessions),
    [2, 0, 1, 0, 0, 0, 0],
  )
})

test('통계 집계: 기간 밖·다른 계정의 기록은 세지 않는다(경계 날짜는 포함)', () => {
  const range = S.statsRange('week', 0, TODAY)
  const stats = S.computeStats(
    [
      rec('in-start', '2026-11-16'),
      rec('in-end', '2026-11-22'),
      rec('before', '2026-11-15'),
      rec('after', '2026-11-23'),
      rec('other', '2026-11-17', { ownerId: 'full' }),
    ],
    range,
    'free',
  )
  assert.equal(stats.sessionCount, 2)
  assert.equal(stats.activeDays, 2)
  // ownerId를 주지 않으면 소유자를 거르지 않는다(조회가 이미 계정별이다).
  assert.equal(
    S.computeStats([rec('other', '2026-11-17', { ownerId: 'full' })], range)
      .sessionCount,
    1,
  )
})

test('통계 집계: 운동 시간은 측정한 기록만 합산하고 측정한 기록이 없으면 0이 아니라 null이다', () => {
  const range = S.statsRange('week', 0, TODAY)
  const none = S.computeStats(
    [rec('a', '2026-11-16'), rec('b', '2026-11-17')],
    range,
  )
  assert.equal(none.measuredMs, null)
  assert.equal(none.measuredRecordCount, 0)
  const some = S.computeStats(
    [
      rec('a', '2026-11-16', {
        totals: {
          exerciseCount: 1,
          completedSetCount: 2,
          plannedSetCount: 3,
          measuredMs: 61_000,
        },
      }),
      rec('b', '2026-11-17'),
      rec('c', '2026-11-18', {
        totals: {
          exerciseCount: 1,
          completedSetCount: 2,
          plannedSetCount: 3,
          measuredMs: 59_000,
        },
      }),
    ],
    range,
  )
  assert.equal(some.measuredMs, 120_000)
  assert.equal(some.measuredRecordCount, 2)
  // 측정값 0ms도 "측정한" 값이다(null과 구분한다).
  const zero = S.computeStats(
    [
      rec('a', '2026-11-16', {
        totals: {
          exerciseCount: 1,
          completedSetCount: 2,
          plannedSetCount: 3,
          measuredMs: 0,
        },
      }),
    ],
    range,
  )
  assert.equal(zero.measuredMs, 0)
})

test('통계 집계: 운동별 수행 횟수는 완료 세트가 있는 세션 수(세션당 1번)이고 많은 순·이름 순이다', () => {
  const range = S.statsRange('month', 0, TODAY)
  const stats = S.computeStats(
    [
      rec('a', '2026-11-02', {
        exercises: [exRow('e-push', '푸시업', 3), exRow('e-sq', '스쿼트', 2)],
      }),
      rec('b', '2026-11-09', { exercises: [exRow('e-push', '푸시업', 1)] }),
      rec('c', '2026-11-16', {
        exercises: [
          exRow('e-sq', '스쿼트', 4),
          // 완료 세트가 없는 운동은 세지 않는다.
          {
            exerciseId: 'e-skip',
            exerciseNameSnapshot: '건너뜀',
            recordType: 'reps',
            plannedSetCount: 3,
            completedSets: [],
          },
          exRow('e-aa', '가나다', 1),
        ],
      }),
    ],
    range,
  )
  assert.deepEqual(
    stats.byExercise.map((r) => [r.name, r.sessions, r.completedSets]),
    [
      ['스쿼트', 2, 6],
      ['푸시업', 2, 4],
      ['가나다', 1, 1],
    ],
  )
  assert.equal(stats.sessionCount, 3)
})

test('통계 집계: 입력을 바꾸지 않고 기록이 없으면 모든 값이 비어 있다', () => {
  const range = S.statsRange('week', 0, TODAY)
  const input = [rec('a', '2026-11-16')]
  const before = JSON.stringify(input)
  S.computeStats(input, range)
  assert.equal(JSON.stringify(input), before)
  const empty = S.computeStats([], range)
  assert.equal(empty.sessionCount, 0)
  assert.equal(empty.activeDays, 0)
  assert.equal(empty.measuredMs, null)
  assert.deepEqual(empty.byExercise, [])
  assert.ok(empty.buckets.every((b) => b.sessions === 0))
})

// ── 통계 화면 ──
const statsHtml = (over = {}) => {
  const range = S.statsRange('week', 0, TODAY)
  const stats = S.computeStats(
    [
      rec('a', '2026-11-16', {
        totals: {
          exerciseCount: 1,
          completedSetCount: 2,
          plannedSetCount: 3,
          measuredMs: 125_000,
        },
      }),
      rec('b', '2026-11-18'),
    ],
    range,
  )
  return html(
    createElement(StatsView, {
      period: 'week',
      offset: 0,
      label: range.label,
      sub: range.sub,
      state: 'ready',
      stats,
      skippedCount: 0,
      onPeriodChange: noop,
      onOffsetChange: noop,
      onRetry: noop,
      ...over,
    }),
  )
}

test('통계 화면: 주간·월간 전환, 기간 이동, 요약(운동 횟수·운동한 날·측정 시간)과 추이 막대·운동별 횟수', () => {
  const out = statsHtml()
  assert.match(out, /<h1[^>]*>운동 기록 통계<\/h1>/)
  assert.match(out, /aria-pressed="true"[^>]*>주간<\/button>/)
  assert.match(out, /aria-pressed="false"[^>]*>월간<\/button>/)
  assert.match(out, /이번 주/)
  assert.match(out, /11월 16일 ~ 11월 22일/)
  assert.match(out, /aria-label="이전 주"/)
  // 미래로 갈 수 없으므로 다음 기간 버튼은 비활성이다.
  assert.match(out, /aria-disabled="true" aria-label="다음 주"/)
  assert.match(out, /운동 횟수[\s\S]*?2<span[^>]*>회<\/span>/)
  assert.match(out, /운동한 날[\s\S]*?2<span[^>]*>일<\/span>/)
  assert.match(out, /2분 5초/)
  assert.match(out, /측정한 기록 1건 합계/)
  assert.match(out, /요일별 운동 횟수/)
  assert.equal((out.match(/data-stats-bar/g) ?? []).length, 7)
  assert.match(out, /월요일\(11월 16일\) 1회/)
  assert.match(out, /운동별 수행 횟수/)
  assert.match(out, /푸시업/)
  assert.equal((out.match(/data-stats-exercise/g) ?? []).length, 1)
})

test('통계 화면: 월간은 주차 막대를 보이고 이전 기간 버튼이 한계에서 비활성이다', () => {
  const range = S.statsRange('month', 0, TODAY)
  const out = html(
    createElement(StatsView, {
      period: 'month',
      offset: 0,
      label: range.label,
      sub: range.sub,
      state: 'ready',
      stats: S.computeStats([rec('a', '2026-11-09')], range),
      skippedCount: 0,
      onPeriodChange: noop,
      onOffsetChange: noop,
      onRetry: noop,
    }),
  )
  assert.match(out, /aria-pressed="true"[^>]*>월간<\/button>/)
  assert.match(out, /이번 달/)
  assert.match(out, /주차별 운동 횟수/)
  assert.equal((out.match(/data-stats-bar/g) ?? []).length, 6)
  assert.match(out, /aria-label="이전 달"/)
  const oldest = S.statsRange('month', -S.MAX_MONTH_BACK, TODAY)
  const limited = html(
    createElement(StatsView, {
      period: 'month',
      offset: -S.MAX_MONTH_BACK,
      label: oldest.label,
      sub: oldest.sub,
      state: 'ready',
      stats: S.computeStats([], oldest),
      skippedCount: 0,
      onPeriodChange: noop,
      onOffsetChange: noop,
      onRetry: noop,
    }),
  )
  assert.match(limited, /aria-disabled="true" aria-label="이전 달"/)
})

test('통계 화면: 측정한 기록이 없으면 "측정한 시간 없음"이고 0분으로 보이지 않는다', () => {
  const range = S.statsRange('week', 0, TODAY)
  const out = html(
    createElement(StatsView, {
      period: 'week',
      offset: 0,
      label: range.label,
      sub: range.sub,
      state: 'ready',
      stats: S.computeStats([rec('a', '2026-11-16')], range),
      skippedCount: 0,
      onPeriodChange: noop,
      onOffsetChange: noop,
      onRetry: noop,
    }),
  )
  assert.match(out, /측정한 시간 없음/)
  // 안내 문장("0분으로 계산하지 않아요")을 뺀 나머지에서 0초·0분 표시와 합계 문구가 없다.
  const withoutNote = out.replace(/운동 시간은 실제로 측정한 기록만[^<]*/, '')
  assert.doesNotMatch(withoutNote, /0초|0분|측정한 기록 \d+건 합계/)
})

test('통계 화면: 기록 없음·불러오는 중·실패·준비 중·손상은 서로 다르고 0으로 채운 통계나 그래프가 없다', () => {
  const range = S.statsRange('week', 0, TODAY)
  const view = (over) =>
    html(
      createElement(StatsView, {
        period: 'week',
        offset: 0,
        label: range.label,
        sub: range.sub,
        state: 'ready',
        stats: S.computeStats([], range),
        skippedCount: 0,
        onPeriodChange: noop,
        onOffsetChange: noop,
        onRetry: noop,
        ...over,
      }),
    )
  const empty = view({})
  assert.match(empty, /이 기간에 완료한 운동 기록이 없어요/)
  assert.doesNotMatch(
    empty,
    /data-stats-bar|운동 횟수|운동별 수행 횟수|측정한 운동 시간/,
  )
  assert.match(
    view({ state: 'loading', stats: null }),
    /role="status"[^>]*>통계를 불러오는 중/,
  )
  const error = view({ state: 'error', stats: null })
  assert.match(error, /role="alert"/)
  assert.match(error, /다시 시도/)
  const unavailable = view({ state: 'unavailable', stats: null })
  assert.match(unavailable, /운동 기록 통계를 준비 중이에요/)
  assert.doesNotMatch(unavailable, /data-stats-bar/)
  const corrupt = view({ skippedCount: 2 })
  assert.match(corrupt, /기록을 확인할 수 없어요/)
  assert.doesNotMatch(corrupt, /완료한 운동 기록이 없어요/)
})

// ── 연결 ──
test('라우터: W06·W07·W08과 통계가 AuthGate 안에 정해진 handle로 추가되고 고정 경로가 :routineId보다 앞이다', () => {
  const router = read('../src/app/router.tsx')
  const gate = router.indexOf('element: <AuthGate />')
  const gateEnd = router.indexOf('element: <AuthOrExperienceGate />')
  const block = (path) => {
    const at = router.indexOf(`path: '${path}'`)
    assert.ok(at > gate && at < gateEnd, `${path}는 AuthGate 안`)
    return router.slice(at, router.indexOf('satisfies RouteHandle', at))
  }
  const list = block('records/exercise/routines')
  for (const part of [
    '<RoutineListPage />',
    "screenId: 'W06'",
    "parent: '/records/exercise'",
    'focus: false',
    'ownH1: true',
  ])
    assert.ok(list.includes(part), `W06: ${part}`)
  const create = block('records/exercise/routines/new')
  for (const part of [
    '<RoutineEditPage />',
    "screenId: 'W08'",
    'focus: true',
    'bodyBack: true',
    "parent: '/records/exercise/routines'",
  ])
    assert.ok(create.includes(part), `W08 new: ${part}`)
  const detailBlock = block('records/exercise/routines/:routineId')
  for (const part of [
    '<RoutineDetailPage />',
    "screenId: 'W07'",
    "parent: '/records/exercise/routines'",
  ])
    assert.ok(detailBlock.includes(part), `W07: ${part}`)
  const edit = block('records/exercise/routines/:routineId/edit')
  for (const part of [
    '<RoutineEditPage />',
    "screenId: 'W08'",
    'bodyBack: true',
  ])
    assert.ok(edit.includes(part), `W08 edit: ${part}`)
  assert.ok(
    router.indexOf("path: 'records/exercise/routines/new'") <
      router.indexOf("path: 'records/exercise/routines/:routineId'"),
  )
  const stats = block('records/exercise/stats')
  for (const part of [
    '<ExerciseStatsPage />',
    'screenId: null',
    "title: '운동 기록 통계'",
    "parent: '/records/exercise'",
    'ownH1: true',
  ])
    assert.ok(stats.includes(part), `stats: ${part}`)
})

test('경로 상수: 라우터의 경로와 같고 루틴 id는 인코딩된다', async () => {
  const P = await server.ssrLoadModule('/src/exercise/routinePaths.ts')
  assert.equal(P.PATH_ROUTINES, '/records/exercise/routines')
  assert.equal(P.PATH_ROUTINE_NEW, '/records/exercise/routines/new')
  assert.equal(P.PATH_EXERCISE_STATS, '/records/exercise/stats')
  assert.equal(
    P.routineDetailPath('a b/c'),
    '/records/exercise/routines/a%20b%2Fc',
  )
  assert.equal(P.routineEditPath('r1'), '/records/exercise/routines/r1/edit')
})

test('상세 설정(P09): "내 운동 루틴"이 W06으로 연결되고 나머지 준비 중 항목은 그대로다', async () => {
  const { SETTINGS_MENU_GROUPS } = await server.ssrLoadModule(
    '/src/settings/settingsMenu.ts',
  )
  const items = SETTINGS_MENU_GROUPS.flatMap((g) => g.items)
  const w06 = items.find((i) => i.screenId === 'W06')
  assert.equal(w06.to, '/records/exercise/routines')
  assert.equal(w06.returnHere, true)
  for (const id of ['D03', 'P04', 'P13', 'P02', 'P06', 'P03', 'S02'])
    assert.equal(items.find((i) => i.screenId === id).to, null, id)
})

test('W01: 운동 관리의 루틴·통계 행이 링크를 받을 때만 이동 링크를 그리고(예시·저장소 없음은 그리지 않는다) 통계의 준비 중 배지가 사라진다', async () => {
  const Routine = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/WorkoutRoutineCard.tsx',
    )
  ).default
  const Statistics = (
    await server.ssrLoadModule(
      '/src/components/exercise/dashboard/ExerciseStatistics.tsx',
    )
  ).default
  const routine = (slot, to) =>
    html(createElement(Routine, { slot, onRetry: noop, to }))
  const statistics = (to) =>
    html(
      createElement(Statistics, {
        slot: { status: 'unavailable' },
        onRetry: noop,
        to,
      }),
    )
  const ready = { status: 'ready', data: { count: 3 } }
  const withRoutine = routine(ready, '/records/exercise/routines')
  assert.deepEqual(hrefs(withRoutine), ['/records/exercise/routines'])
  assert.match(withRoutine, /루틴 보기/)
  assert.match(withRoutine, /3개/)
  const withStats = statistics('/records/exercise/stats')
  assert.deepEqual(hrefs(withStats), ['/records/exercise/stats'])
  assert.match(withStats, /통계 보기/)
  assert.match(withStats, /주간·월간 통계/)
  assert.doesNotMatch(withStats, /준비 중/)
  // 링크 경로가 없으면(예시·운영) 링크가 없고 통계는 기존처럼 준비 중이다.
  assert.deepEqual(hrefs(routine(ready, undefined)), [])
  const withoutStats = statistics(undefined)
  assert.deepEqual(hrefs(withoutStats), [])
  assert.match(withoutStats, /준비 중/)
  assert.match(withoutStats, /기록한 운동의 구성을 확인해요/)
  // 루틴이 없으면 "루틴 만들기" 링크 문구다. 불러오는 중·실패에는 링크를 그리지 않는다.
  const empty = routine({ status: 'empty' }, '/records/exercise/routines')
  assert.match(empty, /아직 저장한 루틴이 없어요/)
  assert.match(empty, /루틴 만들기/)
  assert.deepEqual(
    hrefs(routine({ status: 'loading' }, '/records/exercise/routines')),
    [],
  )
  assert.deepEqual(
    hrefs(routine({ status: 'error' }, '/records/exercise/routines')),
    [],
  )
})

test('W01 페이지: 루틴·통계 링크는 개발용 예시(?sample=)가 아닐 때만 연결하고 예시와 실제 루틴을 섞지 않는다', () => {
  const page = read('../src/pages/ExerciseDashboardPage.tsx')
  assert.match(
    page,
    /useRoutines\(usingSample \? null : \(user\?\.id \?\? null\)\)/,
  )
  assert.match(
    page,
    /routinesTo=\{\s*!usingSample && routinesSlot\.status !== 'unavailable'/,
  )
  assert.match(
    page,
    /statisticsTo=\{\s*!usingSample && slots\.recent\.status !== 'unavailable'/,
  )
})

test('루틴 → 오늘의 운동 시작: W07은 기존 초안(replaceDraft)을 쓰고 구성 중인 초안이 있으면 확인 없이는 덮어쓰지 않는다', () => {
  const page = read('../src/pages/RoutineDetailPage.tsx')
  assert.match(page, /draftCtx\.replaceDraft\(draft\)/)
  assert.match(
    page,
    /if \(draftCtx\.hasContent\) \{\s*setStartPanel\('replace'\)/,
  )
  assert.match(page, /const PATH_COMPOSE = '\/records\/exercise\/compose'/)
  // W08은 오늘의 운동 초안 Provider를 쓰지 않는다(루틴 편집은 자기 화면 안의 초안이다).
  const edit = read('../src/pages/RoutineEditPage.tsx')
  assert.doesNotMatch(edit, /useWorkoutDraft/)
})
