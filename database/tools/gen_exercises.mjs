// 프론트 운동 시드(frontend/src/exercise/seed/exercises.json) → database/seed/001_insert_exercises.sql 변환 (KSH)
// 실행: node database/tools/gen_exercises.mjs          SQL 파일을 다시 만든다
//       node database/tools/gen_exercises.mjs --check  SQL 파일이 JSON과 같은지만 확인한다(다르면 종료 코드 1)
//
// 프론트와 서버가 같은 운동 id를 쓰도록 exercise_id를 JSON 값 그대로 넣는다. 결과 SQL은 같은 id가 있으면 JSON 내용으로 덮어써서
// 다시 실행해도 중복 행을 만들지 않는다. 단 기존 운동의 참조가 다른 운동을 가리키게 되는 DB에는 적용을 막는다(결과 SQL 머리 주석 참고).
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = new URL('../../', import.meta.url)
const SOURCE = fileURLToPath(new URL('frontend/src/exercise/seed/exercises.json', root))
const TARGET = fileURLToPath(new URL('database/seed/001_insert_exercises.sql', root))

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced']
const RECORD_MODES = ['time', 'reps', 'weight_reps', 'time_reps', 'weight_time']
const DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

function fail(message) {
  console.error(message)
  process.exit(2)
}

// VARCHAR(n)은 글자 수, TEXT는 바이트 수(최대 65535)로 길이를 센다. 한글은 utf8mb4에서 한 글자가 3바이트다.
function text(value, limit, field, id) {
  if (value === null || value === undefined) return null
  const tooLong =
    typeof value === 'string' &&
    (limit === 'TEXT' ? Buffer.byteLength(value, 'utf8') > 65535 : [...value].length > limit)
  if (typeof value !== 'string' || value.length === 0 || tooLong) {
    fail(`exercise_id ${id}: ${field} 값이 올바르지 않아요`)
  }
  return value
}

// 형식뿐 아니라 실제로 있는 날짜·시각인지 본다(2026-02-30 같은 값은 MySQL이 거절한다).
function validDatetime(value) {
  if (typeof value !== 'string' || !DATETIME.test(value)) return false
  const [date, time] = value.split(' ')
  const [y, mo, d] = date.split('-').map(Number)
  const [h, mi, se] = time.split(':').map(Number)
  const at = new Date(Date.UTC(y, mo - 1, d, h, mi, se))
  return (
    at.getUTCFullYear() === y &&
    at.getUTCMonth() === mo - 1 &&
    at.getUTCDate() === d &&
    at.getUTCHours() === h &&
    at.getUTCMinutes() === mi &&
    at.getUTCSeconds() === se
  )
}

// 따옴표는 두 번 쓰고 백슬래시와 제어 문자는 이스케이프한다. 줄바꿈을 그대로 두면 Windows 체크아웃(autocrlf)에서
// 문자열 안의 줄바꿈이 CRLF로 바뀌어 DB에 \r이 들어가므로, 줄바꿈도 이스케이프해서 SQL 파일 한 줄에 운동 한 행만 둔다.
const ESCAPES = { '\\': '\\\\', '\n': '\\n', '\r': '\\r', '\0': '\\0', '\x1a': '\\Z' }
function sql(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'number') return String(value)
  return `'${value.replace(/[\\\n\r\0\x1a]/g, (c) => ESCAPES[c]).replace(/'/g, "''")}'`
}

const rows = JSON.parse(readFileSync(SOURCE, 'utf8'))
if (!Array.isArray(rows) || rows.length === 0) fail('exercises.json이 비어 있어요')

const seen = new Set()
const values = rows
  .slice()
  .sort((a, b) => a.exercise_id - b.exercise_id)
  .map((row) => {
    const id = row.exercise_id
    if (!Number.isSafeInteger(id) || id < 1 || seen.has(id)) fail(`exercise_id ${id}가 올바르지 않거나 중복이에요`)
    seen.add(id)
    if (row.difficulty !== null && !DIFFICULTIES.includes(row.difficulty)) fail(`exercise_id ${id}: difficulty`)
    const allowed = row.allowed_record_modes
    if (
      !RECORD_MODES.includes(row.default_record_mode) ||
      !Array.isArray(allowed) ||
      allowed.length === 0 ||
      new Set(allowed).size !== allowed.length ||
      !allowed.every((mode) => RECORD_MODES.includes(mode)) ||
      !allowed.includes(row.default_record_mode)
    ) {
      fail(`exercise_id ${id}: 기록 방식(default_record_mode·allowed_record_modes)이 올바르지 않아요`)
    }
    for (const field of ['created_at', 'updated_at']) {
      if (!validDatetime(row[field])) fail(`exercise_id ${id}: ${field}`)
    }
    return [
      id,
      text(row.name, 160, 'name', id) ?? fail(`exercise_id ${id}: name이 없어요`),
      text(row.instructions, 'TEXT', 'instructions', id),
      row.difficulty,
      text(row.exercise_type, 60, 'exercise_type', id),
      text(row.exercise_equipment, 60, 'exercise_equipment', id),
      text(row.description, 'TEXT', 'description', id),
      text(row.cautions, 'TEXT', 'cautions', id),
      text(row.source_url, 1000, 'source_url', id),
      row.default_record_mode,
      JSON.stringify(allowed),
      row.created_at,
      row.updated_at,
    ]
  })

const columns = [
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
// created_at도 JSON 값으로 맞춘다. 참조되지 않는 예전 운동을 새 운동으로 덮어쓸 때 예전 생성 시각이 남지 않게 한다.
const updates = columns.filter((c) => c !== 'exercise_id')

// 운동을 가리키는 테이블(schema/001_create_tables.sql의 exercises FK). 여기 있는 참조가 다른 운동으로 바뀌지 않게 시드 적용 전에 확인한다.
const REFERENCING_TABLES = [
  'preference_exercises',
  'exercise_routine_items',
  'workout_session_exercises',
  'exercise_recommendations',
]
const referenced = REFERENCING_TABLES.map(
  (t) => `EXISTS (SELECT 1 FROM ${t} r WHERE r.exercise_id = e.exercise_id)`,
).join('\n         OR ')

const output = [
  '-- 운동 카탈로그 시드. database/tools/gen_exercises.mjs가 frontend/src/exercise/seed/exercises.json에서 만든 파일이라 직접 고치지 않는다.',
  '-- exercise_id는 프론트 시드와 같은 값이다(로컬에 저장한 운동 목록·완료 기록이 이 id로 서버 운동을 가리킨다).',
  '--',
  '-- 새 DB(docker compose로 처음 만든 볼륨)에는 운동 105개가 그대로 들어가고, 이 시드로 채운 DB에 다시 실행해도 같은 결과다.',
  '-- 기존 DB에는 아래 경우에만 적용을 막고 아무것도 바꾸지 않는다(오류 seed_blocked_... 테이블이 없다는 메시지로 멈춘다).',
  '--   1) 이 시드에 없는 id의 운동이 있다(예전 시드로 들어간 운동 등). 프론트 카탈로그와 맞지 않는 운동이 남는다.',
  '--   2) 같은 id인데 이름이 다른 운동을 즐겨찾기·루틴 항목·운동 기록·운동 추천이 참조한다. 덮어쓰면 그 참조가 다른 운동을 가리키게 된다.',
  '--      (예: 예전 시드의 1번 푸시업을 즐겨찾기한 회원에게 1번 밴드 로우가 보인다.)',
  '-- 막혔을 때는 바로 위에 막힌 운동 목록이 출력된다. 지킬 데이터가 없으면 docker compose down -v 후 docker compose up -d로 DB를 새로 만든다.',
  '--   지킬 데이터가 있으면 출력된 운동을 가리키는 즐겨찾기·루틴 항목·운동 기록·운동 추천을 정리(삭제하거나 새 운동 id로 바꿈)한 뒤 다시 실행한다.',
  '-- 참조되지 않는 운동은 이름이 달라도 덮어쓴다(가리키는 데이터가 없어 바뀌는 참조가 없다).',
  '-- 확인과 적용 사이에는 잠금이 없으므로 서버(앱)를 멈춘 상태에서 실행한다.',
  'SET NAMES utf8mb4;',
  '-- 확인을 끝내기 전에는 막힌 것으로 둔다(같은 세션에서 전에 실행한 값이 남아 있어도 열린 상태로 넘어가지 않게).',
  'SET @seed_blocked = 1;',
  '',
  '-- 1) 시드의 id와 이름',
  'DROP TEMPORARY TABLE IF EXISTS seed_exercise_names;',
  'CREATE TEMPORARY TABLE seed_exercise_names (exercise_id BIGINT NOT NULL PRIMARY KEY, name VARCHAR(160) NOT NULL)',
  '  DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_0900_bin;',
  'INSERT INTO seed_exercise_names (exercise_id, name) VALUES',
  values.map((v) => `(${sql(v[0])}, ${sql(v[1])})`).join(',\n') + ';',
  '',
  '-- 2) 적용하면 안 되는 운동(위 설명의 1·2). 이름은 utf8mb4_0900_bin으로 비교해 대소문자와 끝 공백까지 다르면 다른 이름으로 본다.',
  'DROP TEMPORARY TABLE IF EXISTS seed_exercise_conflicts;',
  'CREATE TEMPORARY TABLE seed_exercise_conflicts AS',
  'SELECT e.exercise_id, e.name AS current_name, s.name AS seed_name,',
  "       IF(s.exercise_id IS NULL, 'not in seed', 'renamed but referenced') AS reason",
  '  FROM exercises e',
  '  LEFT JOIN seed_exercise_names s ON s.exercise_id = e.exercise_id',
  ' WHERE s.exercise_id IS NULL',
  '    OR (e.name COLLATE utf8mb4_0900_bin <> s.name',
  `        AND (${referenced}));`,
  'SELECT * FROM seed_exercise_conflicts ORDER BY exercise_id;',
  'SET @seed_blocked = (SELECT COUNT(*) FROM seed_exercise_conflicts);',
  '',
  '-- 3) 막아야 하면 일부러 오류를 내서 멈춘다. 오류가 나도 계속 실행하는 도구에서도 아래 INSERT는 막힌 운동이 없을 때만 행을 넣는다.',
  "SET @seed_guard = IF(@seed_blocked IS NULL OR @seed_blocked > 0, 'SELECT 1 FROM `seed_blocked__existing_exercises_conflict__see_rows_above`', 'DO 0');",
  'PREPARE seed_guard FROM @seed_guard;',
  'EXECUTE seed_guard;',
  'DEALLOCATE PREPARE seed_guard;',
  '',
  '-- 4) 운동 105개. 같은 id가 있으면 내용을 덮어쓴다. 막힌 운동 표가 없거나(확인 단계가 실패함) 행이 있으면 아무것도 넣지 않는다.',
  `INSERT INTO exercises (${columns.join(', ')})`,
  'SELECT * FROM (VALUES',
  values.map((v) => `ROW(${v.map(sql).join(', ')})`).join(',\n'),
  `) AS new (${columns.join(', ')})`,
  'WHERE @seed_blocked = 0 AND NOT EXISTS (SELECT 1 FROM seed_exercise_conflicts)',
  `ON DUPLICATE KEY UPDATE ${updates.map((c) => `${c} = new.${c}`).join(', ')};`,
  '',
  'DROP TEMPORARY TABLE seed_exercise_conflicts;',
  'DROP TEMPORARY TABLE seed_exercise_names;',
  '',
].join('\n')

if (process.argv.includes('--check')) {
  const current = readFileSync(TARGET, 'utf8').replace(/\r\n/g, '\n')
  if (current !== output) {
    console.error('001_insert_exercises.sql이 exercises.json과 달라요. node database/tools/gen_exercises.mjs로 다시 만들어 주세요.')
    process.exit(1)
  }
  console.log(`001_insert_exercises.sql이 exercises.json과 같아요(운동 ${values.length}개).`)
} else {
  writeFileSync(TARGET, output)
  console.log(`운동 ${values.length}개를 ${TARGET}에 썼어요.`)
}
