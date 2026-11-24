// 프론트 운동 시드(frontend/src/exercise/seed/exercises.json) → database/seed/001_insert_exercises.sql 변환 (KSH)
// 실행: node database/tools/gen_exercises.mjs          SQL 파일을 다시 만든다
//       node database/tools/gen_exercises.mjs --check  SQL 파일이 JSON과 같은지만 확인한다(다르면 종료 코드 1)
//
// 프론트와 서버가 같은 운동 id를 쓰도록 exercise_id를 JSON 값 그대로 넣는다. 결과 SQL은 INSERT ... ON DUPLICATE KEY UPDATE라
// 이미 운동이 들어 있는 DB에 다시 실행해도 같은 id의 행을 JSON 내용으로 덮어쓸 뿐 중복 행을 만들지 않는다.
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
const updates = columns.filter((c) => c !== 'exercise_id' && c !== 'created_at')

const output = [
  '-- 운동 카탈로그 시드. database/tools/gen_exercises.mjs가 frontend/src/exercise/seed/exercises.json에서 만든 파일이라 직접 고치지 않는다.',
  '-- exercise_id는 프론트 시드와 같은 값이다(로컬에 저장한 운동 목록·완료 기록이 이 id로 서버 운동을 가리킨다).',
  '-- 같은 id가 이미 있으면 JSON 내용으로 덮어쓰므로 기존 DB에 다시 실행해도 된다.',
  'SET NAMES utf8mb4;',
  '',
  `INSERT INTO exercises (${columns.join(', ')}) VALUES`,
  values.map((v) => `(${v.map(sql).join(', ')})`).join(',\n'),
  // VALUES() 함수는 MySQL 8.0.20부터 사용 중단 예정이라 행 별칭(8.0.19+)으로 새 값을 가리킨다.
  'AS new',
  `ON DUPLICATE KEY UPDATE ${updates.map((c) => `${c} = new.${c}`).join(', ')};`,
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
