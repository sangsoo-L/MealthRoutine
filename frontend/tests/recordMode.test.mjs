import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// 운동 기록 방식 5종(S1): 코드 매핑·카탈로그 메타데이터 검증·기본 방식 결정·신규 완료 세트 검증·하위 호환.
// 화면(W02·W11·W14·W15)은 바뀌지 않으며, 이 테스트는 순수 로직과 기존 읽기 경로만 확인한다. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let RM // recordMode
let CV // completedSetValidation
let V // seedValidation
let C // seedCatalog
let D // seedData
let Draft // workoutDraftModel
let DraftTypes // workoutDraftTypes
let Model // workoutModel

const SRC = new URL('../src/', import.meta.url)
const SEED_DIR = new URL('exercise/seed/', SRC)
const readSeed = (name) =>
  JSON.parse(readFileSync(new URL(name, SEED_DIR), 'utf8'))
// S1의 기준 데이터: 실제 시드는 S2부터 기록 방식 메타데이터를 가지므로, S1의 "메타데이터 없음" 시나리오는 메타데이터를 뺀 사본으로 확인한다.
// 실제 시드의 메타데이터(105종 전수)는 exerciseSeed.test.mjs가 검증한다.
const META_FIELDS = ['default_record_mode', 'allowed_record_modes']
const raw = () => ({
  exercises: readSeed('exercises.json').map((row) => {
    const copy = { ...row }
    for (const field of META_FIELDS) delete copy[field]
    return copy
  }),
  routines: readSeed('exercise_routines.json'),
  routineItems: readSeed('exercise_routine_items.json'),
})

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  RM = await server.ssrLoadModule('/src/exercise/recordMode.ts')
  CV = await server.ssrLoadModule('/src/exercise/completedSetValidation.ts')
  V = await server.ssrLoadModule('/src/exercise/seed/seedValidation.ts')
  C = await server.ssrLoadModule('/src/exercise/seed/seedCatalog.ts')
  D = await server.ssrLoadModule('/src/exercise/seed/seedData.ts')
  Draft = await server.ssrLoadModule('/src/exercise/workoutDraftModel.ts')
  DraftTypes = await server.ssrLoadModule('/src/exercise/workoutDraftTypes.ts')
  Model = await server.ssrLoadModule('/src/exercise/workoutModel.ts')
})
after(async () => {
  await server?.close()
})

const plain = (value) => JSON.parse(JSON.stringify(value))
const fieldsOf = (validation) =>
  validation.ok ? [] : validation.issues.map((i) => i.field)

// ─── 코드 매핑 ─────────────────────────────────────────────

test('코드 매핑: weight_reps만 저장 코드 weight로 바뀌고 나머지는 그대로다', () => {
  assert.equal(RM.toStoredRecordType('weight_reps'), 'weight')
  assert.equal(RM.toStoredRecordType('time'), 'time')
  assert.equal(RM.toStoredRecordType('reps'), 'reps')
  assert.equal(RM.toStoredRecordType('time_reps'), 'time_reps')
  assert.equal(RM.toStoredRecordType('weight_time'), 'weight_time')
})

test('코드 집합: 카탈로그 5종·저장 5종, weight와 weight_reps는 서로 다른 집합의 이름이다', () => {
  assert.deepEqual([...RM.CATALOG_RECORD_MODES].sort(), [
    'reps',
    'time',
    'time_reps',
    'weight_reps',
    'weight_time',
  ])
  assert.deepEqual([...RM.STORED_RECORD_TYPES].sort(), [
    'reps',
    'time',
    'time_reps',
    'weight',
    'weight_time',
  ])
  // 카탈로그 코드는 weight를, 저장 코드는 weight_reps를 받지 않는다(혼용 방지).
  assert.equal(RM.isCatalogRecordMode('weight'), false)
  assert.equal(RM.isCatalogRecordMode('weight_reps'), true)
  assert.equal(RM.isStoredRecordType('weight_reps'), false)
  assert.equal(RM.isStoredRecordType('weight'), true)
  for (const bad of [
    '',
    'Time',
    'distance',
    null,
    undefined,
    1,
    {},
    ['time'],
  ]) {
    assert.equal(RM.isCatalogRecordMode(bad), false, String(bad))
    assert.equal(RM.isStoredRecordType(bad), false, String(bad))
  }
  // 모든 카탈로그 코드의 변환 결과는 저장 코드이고, 서로 다른 카탈로그 코드는 서로 다른 저장 코드가 된다(중복 집계 없음).
  const stored = RM.CATALOG_RECORD_MODES.map(RM.toStoredRecordType)
  assert.ok(stored.every(RM.isStoredRecordType))
  assert.equal(new Set(stored).size, RM.CATALOG_RECORD_MODES.length)
})

test('저장 모델은 5종을 담고, 진행·결과(W14·W15)도 S5부터 5종을 모두 처리한다(그 밖의 방식은 계속 차단)', () => {
  assert.deepEqual([...DraftTypes.RECORD_TYPES].sort(), [
    'reps',
    'time',
    'time_reps',
    'weight',
    'weight_time',
  ])
  assert.deepEqual(plain(DraftTypes.RECORD_TYPE_LABEL), {
    time: '시간형',
    weight: '중량+횟수형',
    reps: '횟수형',
    time_reps: '시간+횟수형',
    weight_time: '중량+시간형',
  })
  assert.deepEqual([...RM.RUNNABLE_RECORD_TYPES].sort(), [
    'reps',
    'time',
    'time_reps',
    'weight',
    'weight_time',
  ])
  for (const type of DraftTypes.RECORD_TYPES) {
    assert.equal(RM.isRunnableRecordType(type), true, type)
  }
  // 허용 목록에 없는 방식(앞으로 추가될 방식 등)은 계속 차단 대상이다.
  assert.equal(RM.isRunnableRecordType('future_mode'), false)
  const items = [
    { recordType: 'reps' },
    { recordType: 'time_reps' },
    { recordType: 'future_mode' },
    { recordType: 'weight_time' },
  ]
  assert.deepEqual(
    RM.findUnrunnableItems(items).map((i) => i.recordType),
    ['future_mode'],
  )
  assert.deepEqual(RM.findUnrunnableItems([{ recordType: 'time' }]), [])
})

test('방식별 구성값 표: 5종의 시간·횟수·중량 구성', () => {
  assert.deepEqual(plain(RM.RECORD_COMPONENTS), {
    time: { time: true, reps: false, weight: false },
    reps: { time: false, reps: true, weight: false },
    weight: { time: false, reps: true, weight: true },
    time_reps: { time: true, reps: true, weight: false },
    weight_time: { time: true, reps: false, weight: true },
  })
})

test('방식별 필수 실제 값: 5종 모두 정의되고 구성값과 같다', () => {
  assert.deepEqual(plain(RM.REQUIRED_ACTUAL_FIELDS), {
    time: ['measuredMs'],
    reps: ['actualReps'],
    weight: ['actualWeightKg', 'actualReps'],
    time_reps: ['measuredMs', 'actualReps'],
    weight_time: ['actualWeightKg', 'measuredMs'],
  })
})

// ─── 카탈로그 메타데이터 검증 ──────────────────────────────

test('메타데이터 검증: 유효한 조합은 값을 그대로 돌려준다(원본 배열은 복사)', () => {
  const allowed = ['time', 'reps', 'time_reps']
  const result = RM.validateRecordModes('time', allowed)
  assert.equal(result.ok, true)
  assert.deepEqual(plain(result.value), { default: 'time', allowed })
  assert.notEqual(result.value.allowed, allowed)
  assert.equal(RM.validateRecordModes('weight_reps', ['weight_reps']).ok, true)
  assert.equal(
    RM.validateRecordModes('weight_time', ['weight_time', 'time']).ok,
    true,
  )
})

test('메타데이터 검증: 잘못된 기본 방식·허용 배열 오류를 모두 구분한다', () => {
  const issues = (d, a) => {
    const r = RM.validateRecordModes(d, a)
    assert.equal(r.ok, false)
    return [...r.issues]
  }
  assert.deepEqual(issues('weight', ['weight']), [
    'defaultInvalid',
    'allowedInvalidValue',
  ])
  assert.deepEqual(issues('distance', ['time']), ['defaultInvalid'])
  assert.deepEqual(issues(undefined, ['time']), ['defaultInvalid'])
  assert.deepEqual(issues('time', []), ['allowedEmpty', 'defaultNotAllowed'])
  assert.deepEqual(issues('time', 'time'), ['allowedNotArray'])
  assert.deepEqual(issues('time', null), ['allowedNotArray'])
  assert.deepEqual(issues('time', ['time', 'distance']), [
    'allowedInvalidValue',
  ])
  assert.deepEqual(issues('time', ['time', 'time']), ['allowedDuplicate'])
  assert.deepEqual(issues('reps', ['time']), ['defaultNotAllowed'])
  // 한 번에 여러 문제를 모두 알린다.
  assert.deepEqual(issues('x', ['time', 'time', 'y']), [
    'defaultInvalid',
    'allowedInvalidValue',
    'allowedDuplicate',
  ])
})

const withMeta = (index, meta) => {
  const data = raw()
  Object.assign(data.exercises[index], meta)
  return data
}

test('시드 검증: 올바른 메타데이터가 있는 운동은 통과하고 Exercise.recordModes로 담긴다(카탈로그 코드 그대로)', () => {
  const data = withMeta(0, {
    default_record_mode: 'weight_reps',
    allowed_record_modes: ['weight_reps', 'reps'],
  })
  assert.equal(V.validateSeed(data).ok, true)
  const catalog = C.createSeedCatalog(data)
  const first = catalog.getAllExercises()[0]
  assert.deepEqual(plain(first.recordModes), {
    default: 'weight_reps',
    allowed: ['weight_reps', 'reps'],
  })
  assert.equal(Object.isFrozen(first.recordModes), true)
  assert.equal(Object.isFrozen(first.recordModes.allowed), true)
  // 메타데이터가 없는 다른 운동에는 recordModes가 없다.
  assert.equal(catalog.getAllExercises()[1].recordModes, undefined)
})

test('시드 검증: 잘못된 메타데이터는 필드와 함께 오류가 된다(한 번에 여러 문제)', () => {
  const field = (meta) => {
    const result = V.validateSeed(withMeta(3, meta))
    assert.equal(result.ok, false)
    return result.issues
      .filter((i) => i.file === 'exercises')
      .map((i) => `${i.index}:${i.field}`)
  }
  assert.deepEqual(
    field({
      default_record_mode: 'weight',
      allowed_record_modes: ['weight_reps'],
    }),
    ['3:default_record_mode'],
  )
  assert.deepEqual(
    field({ default_record_mode: 'time', allowed_record_modes: [] }),
    ['3:allowed_record_modes', '3:default_record_mode'],
  )
  assert.deepEqual(
    field({ default_record_mode: 'time', allowed_record_modes: 'time' }),
    ['3:allowed_record_modes'],
  )
  assert.deepEqual(
    field({
      default_record_mode: 'time',
      allowed_record_modes: ['time', 'time'],
    }),
    ['3:allowed_record_modes'],
  )
  assert.deepEqual(
    field({
      default_record_mode: 'time',
      allowed_record_modes: ['time', 'weight'],
    }),
    ['3:allowed_record_modes'],
  )
  assert.deepEqual(
    field({ default_record_mode: 'reps', allowed_record_modes: ['time'] }),
    ['3:default_record_mode'],
  )
  // 둘 중 하나만 있거나 null이면 오류다(null을 "없음"으로 읽지 않는다).
  assert.deepEqual(field({ default_record_mode: 'time' }), [
    '3:allowed_record_modes',
  ])
  assert.deepEqual(field({ allowed_record_modes: ['time'] }), [
    '3:default_record_mode',
  ])
  assert.deepEqual(
    field({ default_record_mode: null, allowed_record_modes: null }),
    ['3:default_record_mode', '3:allowed_record_modes'],
  )
  // 잘못된 데이터로는 조회 계층을 만들지 않는다(다른 운동으로 바꾸지 않는다).
  assert.throws(
    () =>
      C.createSeedCatalog(
        withMeta(0, { default_record_mode: 'x', allowed_record_modes: ['x'] }),
      ),
    (error) => error.name === 'SeedDataError',
  )
})

test('메타데이터가 없는 시드 사본(105종)도 그대로 로딩되고 recordModes가 없다', () => {
  const data = raw()
  assert.equal(data.exercises.length, 105)
  assert.ok(
    data.exercises.every(
      (e) => !('default_record_mode' in e) && !('allowed_record_modes' in e),
    ),
    '기준 사본에는 메타데이터가 없다',
  )
  assert.equal(V.validateSeed(data).ok, true)
  const all = C.createSeedCatalog(data).getAllExercises()
  assert.equal(all.length, 105)
  assert.ok(all.every((e) => e.recordModes === undefined))
})

// ─── 기본 기록 방식 결정 ───────────────────────────────────

const ex = (over) => ({
  equipment: ['맨몸'],
  targetMuscles: ['복부'],
  ...over,
})

test('기본 방식: 메타데이터가 없으면 기존 추론 규칙이 그대로다', () => {
  const stored = (over) => Draft.resolveStoredRecordType(ex(over))
  assert.equal(stored({ equipment: ['덤벨'], targetMuscles: ['팔'] }), 'weight')
  assert.equal(stored({ targetMuscles: ['유산소'] }), 'time')
  assert.equal(stored({ targetMuscles: ['스트레칭'] }), 'time')
  assert.equal(stored({}), 'reps')
  // 실제 시드 운동이어도 메타데이터가 없으면 기존 규칙이 그대로다(플랭크는 기존 규칙으로 횟수형). 메타데이터가 있는 실제 시드는 exerciseSeed.test.mjs가 확인한다.
  const catalog = C.createSeedCatalog(raw())
  const byId = (id) =>
    Draft.resolveStoredRecordType(catalog.getExerciseById(id))
  assert.equal(byId('22'), 'reps')
  assert.equal(byId('28'), 'time')
  assert.equal(byId('2'), 'weight')
  assert.equal(byId('5'), 'reps')
  assert.equal(byId('103'), 'time')
  // 메타데이터가 없으면 허용 방식은 기존 3종 호환 정책이다.
  assert.deepEqual([...Draft.allowedRecordTypes(ex({}))].sort(), [
    'reps',
    'time',
    'weight',
  ])
})

test('기본 방식: 메타데이터가 있으면 그 기본값을 우선하고 weight_reps는 weight로 변환한다', () => {
  const meta = (d, allowed = [d]) => ({ recordModes: { default: d, allowed } })
  const stored = (over) => Draft.resolveStoredRecordType(ex(over))
  // 장비·부위 추론과 달라도 메타데이터가 이긴다.
  assert.equal(stored({ ...meta('time') }), 'time')
  assert.equal(stored({ ...meta('reps'), equipment: ['덤벨'] }), 'reps')
  assert.equal(stored({ ...meta('weight_reps') }), 'weight')
  assert.equal(
    stored({ ...meta('time', ['time', 'reps', 'time_reps']) }),
    'time',
  )
})

test('기본·허용 방식: 복합 방식도 저장 코드로 결정되고 허용 목록은 카탈로그 순서의 저장 코드다', () => {
  const composite = (d, allowed = [d]) => ({
    recordModes: { default: d, allowed },
  })
  assert.equal(
    Draft.resolveStoredRecordType(ex(composite('time_reps'))),
    'time_reps',
  )
  assert.equal(
    Draft.resolveStoredRecordType(ex(composite('weight_time'))),
    'weight_time',
  )
  assert.deepEqual(
    plain(
      Draft.allowedRecordTypes(
        ex(composite('weight_time', ['weight_time', 'time'])),
      ),
    ),
    ['weight_time', 'time'],
  )
  assert.deepEqual(
    plain(Draft.allowedRecordTypes(ex(composite('weight_reps')))),
    ['weight'],
  )
  assert.deepEqual(
    plain(
      Draft.allowedRecordTypes(
        ex(composite('time', ['time', 'reps', 'time_reps'])),
      ),
    ),
    ['time', 'reps', 'time_reps'],
  )
})

test('운동 추가(W13→W02 경로): 초안 항목의 recordType이 메타데이터의 기본 방식(저장 코드)을 따른다', () => {
  const base = Draft.createEmptyDraft(() => '2026-11-16T00:00:00.000Z')
  const mk = (id, over) => ({
    id,
    name: `운동${id}`,
    category: '코어',
    difficulty: '초급',
    instructions: [],
    precautions: [],
    ...ex({}),
    ...over,
  })
  const draft = Draft.addExercisesToDraft(
    base,
    [
      mk('a', { recordModes: { default: 'time', allowed: ['time'] } }),
      mk('b', {
        recordModes: { default: 'weight_reps', allowed: ['weight_reps'] },
      }),
      mk('c', {
        recordModes: {
          default: 'weight_time',
          allowed: ['weight_time', 'time'],
        },
      }),
      mk('d', {}),
    ],
    () => '2026-11-16T00:00:00.000Z',
  )
  assert.deepEqual(
    draft.items.map((i) => i.recordType),
    ['time', 'weight', 'weight_time', 'reps'],
  )
  assert.ok(
    draft.items.every((i) => DraftTypes.RECORD_TYPES.includes(i.recordType)),
  )
})

// ─── 신규 완료 세트 검증 ───────────────────────────────────

const ok = (type, set) =>
  CV.validateNewCompletedSet(type, { completed: true, ...set })
const bad = (type, set) => {
  const result = ok(type, set)
  assert.equal(result.ok, false, JSON.stringify([type, set]))
  return result.issues.map((i) => `${i.field}:${i.reason}`)
}

test('신규 완료: time — 양수 정수 ms만 인정하고 미측정·0ms를 거부한다', () => {
  assert.equal(ok('time', { measuredMs: 1 }).ok, true)
  assert.equal(ok('time', { measuredMs: 61_000 }).ok, true)
  assert.equal(ok('time', { measuredMs: 24 * 60 * 60 * 1000 }).ok, true)
  assert.deepEqual(bad('time', {}), ['measuredMs:missing'])
  assert.deepEqual(bad('time', { measuredMs: null }), ['measuredMs:missing'])
  assert.deepEqual(bad('time', { measuredMs: undefined }), [
    'measuredMs:missing',
  ])
  assert.deepEqual(bad('time', { measuredMs: 0 }), ['measuredMs:zero'])
  assert.deepEqual(bad('time', { measuredMs: -1 }), ['measuredMs:invalid'])
  assert.deepEqual(bad('time', { measuredMs: 1.5 }), ['measuredMs:invalid'])
  assert.deepEqual(bad('time', { measuredMs: Number.NaN }), [
    'measuredMs:invalid',
  ])
  assert.deepEqual(bad('time', { measuredMs: Infinity }), [
    'measuredMs:invalid',
  ])
  assert.deepEqual(bad('time', { measuredMs: 24 * 60 * 60 * 1000 + 1 }), [
    'measuredMs:invalid',
  ])
  assert.deepEqual(bad('time', { measuredMs: '30000' }), ['measuredMs:invalid'])
})

test('신규 완료: reps — 1~999 정수 횟수만 인정한다', () => {
  assert.equal(ok('reps', { actualReps: 1 }).ok, true)
  assert.equal(ok('reps', { actualReps: 999 }).ok, true)
  assert.deepEqual(bad('reps', {}), ['actualReps:missing'])
  assert.deepEqual(bad('reps', { actualReps: null }), ['actualReps:missing'])
  assert.deepEqual(bad('reps', { actualReps: 0 }), ['actualReps:zero'])
  assert.deepEqual(bad('reps', { actualReps: -3 }), ['actualReps:invalid'])
  assert.deepEqual(bad('reps', { actualReps: 2.5 }), ['actualReps:invalid'])
  assert.deepEqual(bad('reps', { actualReps: 1000 }), ['actualReps:invalid'])
  assert.deepEqual(bad('reps', { actualReps: Number.NaN }), [
    'actualReps:invalid',
  ])
  assert.deepEqual(bad('reps', { actualReps: '10' }), ['actualReps:invalid'])
})

test('신규 완료: weight(중량+횟수) — 중량과 횟수가 모두 필수이고 0kg은 인정한다', () => {
  assert.equal(ok('weight', { actualWeightKg: 8, actualReps: 10 }).ok, true)
  assert.equal(ok('weight', { actualWeightKg: 0, actualReps: 10 }).ok, true) // 0kg은 명시적으로 입력한 값
  assert.equal(ok('weight', { actualWeightKg: 12.5, actualReps: 1 }).ok, true)
  assert.equal(ok('weight', { actualWeightKg: 999, actualReps: 999 }).ok, true)
  assert.deepEqual(bad('weight', { actualReps: 10 }), [
    'actualWeightKg:missing',
  ]) // 중량 미입력
  assert.deepEqual(bad('weight', { actualWeightKg: null, actualReps: 10 }), [
    'actualWeightKg:missing',
  ])
  assert.deepEqual(bad('weight', { actualWeightKg: 8 }), ['actualReps:missing'])
  assert.deepEqual(bad('weight', {}), [
    'actualWeightKg:missing',
    'actualReps:missing',
  ])
  assert.deepEqual(bad('weight', { actualWeightKg: -1, actualReps: 10 }), [
    'actualWeightKg:invalid',
  ])
  assert.deepEqual(bad('weight', { actualWeightKg: 8.25, actualReps: 10 }), [
    'actualWeightKg:invalid',
  ])
  assert.deepEqual(bad('weight', { actualWeightKg: 1000, actualReps: 10 }), [
    'actualWeightKg:invalid',
  ])
  assert.deepEqual(
    bad('weight', { actualWeightKg: Number.NaN, actualReps: 10 }),
    ['actualWeightKg:invalid'],
  )
  assert.deepEqual(bad('weight', { actualWeightKg: 8, actualReps: 0 }), [
    'actualReps:zero',
  ])
  assert.deepEqual(bad('weight', { actualWeightKg: 8, actualReps: 1.5 }), [
    'actualReps:invalid',
  ])
})

test('신규 완료: time_reps — 시간과 횟수가 모두 필수다', () => {
  assert.equal(ok('time_reps', { measuredMs: 30_000, actualReps: 40 }).ok, true)
  assert.deepEqual(bad('time_reps', { actualReps: 40 }), ['measuredMs:missing']) // 시간 미측정
  assert.deepEqual(bad('time_reps', { measuredMs: 30_000 }), [
    'actualReps:missing',
  ])
  assert.deepEqual(bad('time_reps', {}), [
    'measuredMs:missing',
    'actualReps:missing',
  ])
  assert.deepEqual(bad('time_reps', { measuredMs: 0, actualReps: 40 }), [
    'measuredMs:zero',
  ])
  assert.deepEqual(bad('time_reps', { measuredMs: 30_000, actualReps: 0 }), [
    'actualReps:zero',
  ])
  assert.deepEqual(bad('time_reps', { measuredMs: -5, actualReps: 2.5 }), [
    'measuredMs:invalid',
    'actualReps:invalid',
  ])
})

test('신규 완료: weight_time — 중량과 시간이 모두 필수이고 0kg은 인정, 0ms는 거부한다', () => {
  assert.equal(
    ok('weight_time', { actualWeightKg: 10, measuredMs: 45_000 }).ok,
    true,
  )
  assert.equal(
    ok('weight_time', { actualWeightKg: 0, measuredMs: 45_000 }).ok,
    true,
  )
  assert.deepEqual(bad('weight_time', { measuredMs: 45_000 }), [
    'actualWeightKg:missing',
  ])
  assert.deepEqual(bad('weight_time', { actualWeightKg: 10 }), [
    'measuredMs:missing',
  ])
  assert.deepEqual(bad('weight_time', { actualWeightKg: 10, measuredMs: 0 }), [
    'measuredMs:zero',
  ])
  assert.deepEqual(
    bad('weight_time', { actualWeightKg: -2, measuredMs: 1000 }),
    ['actualWeightKg:invalid'],
  )
  assert.deepEqual(bad('weight_time', {}), [
    'actualWeightKg:missing',
    'measuredMs:missing',
  ])
})

test('신규 완료: 방식의 구성값이 아닌 필드·알 수 없는 필드는 거부한다(null·undefined는 없는 것)', () => {
  assert.deepEqual(bad('reps', { actualReps: 5, actualWeightKg: 3 }), [
    'actualWeightKg:unexpected',
  ])
  assert.deepEqual(bad('reps', { actualReps: 5, measuredMs: 1000 }), [
    'measuredMs:unexpected',
  ])
  assert.deepEqual(bad('time', { measuredMs: 1000, actualReps: 5 }), [
    'actualReps:unexpected',
  ])
  assert.deepEqual(
    bad('weight', { actualWeightKg: 3, actualReps: 5, measuredMs: 100 }),
    ['measuredMs:unexpected'],
  )
  assert.deepEqual(
    bad('time_reps', { measuredMs: 1000, actualReps: 5, actualWeightKg: 0 }),
    ['actualWeightKg:unexpected'],
  )
  assert.deepEqual(
    bad('weight_time', { actualWeightKg: 3, measuredMs: 100, actualReps: 1 }),
    ['actualReps:unexpected'],
  )
  assert.deepEqual(bad('reps', { actualReps: 5, foo: 1 }), ['foo:unexpected'])
  assert.deepEqual(bad('reps', { actualReps: 5, foo: null }), [
    'foo:unexpected',
  ])
  // 구성값이 아닌 실제 값 필드가 null·undefined이면 없는 것으로 본다.
  assert.equal(
    ok('reps', { actualReps: 5, actualWeightKg: null, measuredMs: undefined })
      .ok,
    true,
  )
  assert.equal(ok('time', { measuredMs: 1000, actualReps: null }).ok, true)
})

test('신규 완료: 완료하지 않은 세트에는 아무것도 강제하지 않는다', () => {
  for (const type of RM.STORED_RECORD_TYPES) {
    assert.equal(
      CV.validateNewCompletedSet(type, { completed: false }).ok,
      true,
      type,
    )
    assert.equal(
      CV.validateNewCompletedSet(type, {
        completed: false,
        actualReps: 0,
        measuredMs: -1,
      }).ok,
      true,
      type,
    )
  }
})

test('신규 완료: 알 수 없는 기록 방식 코드는 거부하고 카탈로그 코드 weight_reps는 저장 코드가 아니므로 변환 전에는 받지 않는다', () => {
  for (const type of ['weight_reps', 'distance', '', undefined]) {
    const result = CV.validateNewCompletedSet(type, {
      completed: true,
      actualReps: 1,
    })
    assert.equal(result.ok, false, String(type))
    assert.deepEqual(plain(result.issues), [
      { field: 'recordType', reason: 'invalid' },
    ])
  }
  // 변환을 거치면 같은 입력이 검증된다.
  assert.equal(
    CV.validateNewCompletedSet(RM.toStoredRecordType('weight_reps'), {
      completed: true,
      actualWeightKg: 0,
      actualReps: 5,
    }).ok,
    true,
  )
})

test('신규 완료: 입력을 바꾸지 않는다', () => {
  const set = { completed: true, actualReps: 0, actualWeightKg: null }
  const copy = plain(set)
  CV.validateNewCompletedSet('weight', set)
  assert.deepEqual(plain(set), copy)
})

// ─── 하위 호환(기존 읽기 경로) ─────────────────────────────

const T0 = new Date('2026-11-13T03:00:00.000Z')
const legacyList = () => ({
  id: 'l1',
  ownerId: 'u',
  schemaVersion: 1,
  plannedDate: '2026-11-13',
  catalogVersion: 'dev-mock-1',
  revision: 1,
  requestId: 'r1',
  createdAt: T0.toISOString(),
  updatedAt: T0.toISOString(),
  items: [
    {
      exerciseId: 'push-up', // 옛 슬러그 ID
      exerciseNameSnapshot: '푸시업',
      recordType: 'reps',
      sets: [{ reps: 10 }],
    },
    {
      exerciseId: '305',
      exerciseNameSnapshot: '덤벨 컬',
      recordType: 'weight',
      sets: [{ reps: 10 }, { reps: 12, weightKg: 8 }],
    },
    {
      exerciseId: 'plank',
      exerciseNameSnapshot: '플랭크',
      recordType: 'time',
      sets: [{ targetSeconds: 60 }],
    },
  ],
})
/** 과거 방식의 완료 세션: 중량 미입력 weight 세트와 시간 미측정 time 세트가 완료돼 있다. */
const legacySession = () => {
  const base = Model.createWorkoutSession({
    id: 's1',
    ownerId: 'u',
    list: legacyList(),
    now: T0,
  })
  const performed = base.performed.map((sets) => sets.map((s) => ({ ...s })))
  performed[0][0] = { completed: true, actualReps: 10 }
  performed[1][0] = { completed: true, actualReps: 10 } // 중량 미입력
  performed[1][1] = { completed: true, actualReps: 12, actualWeightKg: 0 }
  performed[2][0] = { completed: true } // 시간 미측정
  return { ...base, performed }
}

test('하위 호환: 기존 운동 목록·세션 스냅샷을 그대로 읽는다(옛 슬러그 ID 포함)', () => {
  const list = Model.parseWorkoutList(plain(legacyList()))
  assert.notEqual(list, null)
  assert.deepEqual(
    list.items.map((i) => i.recordType),
    ['reps', 'weight', 'time'],
  )
  const session = legacySession()
  assert.notEqual(Model.parseWorkoutSession(plain(session)), null)
})

test('하위 호환: 중량 미입력 weight·시간 미측정 time 완료 세트와 기존 기록은 계속 유효하다', () => {
  const session = legacySession()
  // 신규 완료 검증은 이 세트들을 거부하지만 읽기 경로는 영향이 없다.
  assert.equal(
    CV.validateNewCompletedSet('weight', session.performed[1][0]).ok,
    false,
  )
  assert.equal(
    CV.validateNewCompletedSet('time', session.performed[2][0]).ok,
    false,
  )
  assert.notEqual(Model.parseWorkoutSession(plain(session)), null)
  const record = Model.buildWorkoutRecord({
    id: 'rec1',
    session,
    now: new Date('2026-11-13T04:00:00.000Z'),
  })
  assert.notEqual(record, null)
  const parsed = Model.parseWorkoutRecord(plain(record))
  assert.notEqual(parsed, null)
  const [reps, weight, time] = parsed.exercises
  assert.equal(reps.recordType, 'reps')
  assert.equal(weight.recordType, 'weight') // 저장값 weight는 바뀌지 않는다
  assert.equal(weight.completedSets[0].actualWeightKg, undefined) // 미입력 그대로
  assert.equal(weight.completedSets[1].actualWeightKg, 0)
  assert.equal(time.completedSets[0].measuredMs, null) // 미측정 그대로(0이 아님)
})

test('하위 호환: 읽기 경로는 신규 완료 검증을 호출하지 않고, 파서는 복합 방식을 받되 목표 구성이 맞지 않으면 손상으로 본다', () => {
  // 소스 확인: 신규 완료 검증 모듈은 "새로 완료·저장"하는 경로만 import한다: W14 세트 완료(S4), W15 편집·저장 전 검증과 최종 저장(S5).
  // 저장된 데이터를 읽는 모델(parse*)·복원·W01 집계 경로는 import하지 않는다.
  const files = readdirSync(SRC, { recursive: true }).filter(
    (name) => typeof name === 'string' && /\.(ts|tsx)$/.test(name),
  )
  const importers = files.filter((name) =>
    /from\s+['"][^'"]*completedSetValidation/.test(
      readFileSync(new URL(name, SRC), 'utf8'),
    ),
  )
  assert.deepEqual(importers.map((name) => name.replaceAll('\\', '/')).sort(), [
    'exercise/local/indexedDbWorkoutRepositories.ts',
    'exercise/workoutProgress.ts',
    'exercise/workoutResult.ts',
    'pages/ExerciseSessionPage.tsx',
  ])
  // S3: 저장 모델은 복합 방식을 읽는다. 목표 구성이 방식에 맞아야 한다.
  const timeReps = legacyList()
  timeReps.items[0] = {
    ...timeReps.items[0],
    recordType: 'time_reps',
    sets: [{ reps: 30, targetSeconds: 60 }],
  }
  assert.notEqual(Model.parseWorkoutList(plain(timeReps)), null)
  const weightTime = legacyList()
  weightTime.items[0] = {
    ...weightTime.items[0],
    recordType: 'weight_time',
    sets: [{ targetSeconds: 60, weightKg: 5 }, { targetSeconds: 60 }],
  }
  assert.notEqual(Model.parseWorkoutList(plain(weightTime)), null)
  // 목표 구성이 방식과 맞지 않으면(옛 횟수 목표만 있는 세트에 time_reps) 손상이다.
  const mismatched = legacyList()
  mismatched.items[0] = { ...mismatched.items[0], recordType: 'time_reps' }
  assert.equal(Model.parseWorkoutList(plain(mismatched)), null)
  // 완료 기록도 같은 규칙이다: 방식과 맞지 않는 세트는 손상.
  const record = Model.buildWorkoutRecord({
    id: 'r',
    session: legacySession(),
    now: T0,
  })
  const tampered = plain(record)
  tampered.exercises[0].recordType = 'weight_time'
  assert.equal(Model.parseWorkoutRecord(tampered), null)
})
