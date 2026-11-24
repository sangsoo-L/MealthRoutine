import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// 백엔드 퀴즈 DB id → 프론트 문제 은행 id 대응표(quiz/server/quizIdMap.ts) 검증.
let server
let MAP
let bankIds
let bankById

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  MAP = (await server.ssrLoadModule('/src/quiz/server/quizIdMap.ts'))
    .QUIZ_CODE_BY_DB_ID
  const EX = await server.ssrLoadModule('/src/quiz/data/exerciseQuestions.ts')
  const ME = await server.ssrLoadModule('/src/quiz/data/mealQuestions.ts')
  bankById = new Map(
    [...EX.EXERCISE_QUESTIONS, ...ME.MEAL_QUESTIONS].map((q) => [q.id, q]),
  )
  bankIds = new Set(
    [...EX.EXERCISE_QUESTIONS, ...ME.MEAL_QUESTIONS].map((q) => q.id),
  )
})
after(async () => {
  await server.close()
})

test('대응표는 DB 1,012문항(OX 12 + 4지선다 1,000)을 모두 담고, 0번은 비어 있다', () => {
  assert.equal(MAP.length, 1013)
  assert.equal(MAP[0], null)
  assert.equal(MAP.filter((c) => c === null).length, 1 + 12)
})

test('4지선다 대응 id는 모두 프론트 문제 은행에 있고 중복이 없다', () => {
  const codes = MAP.filter((c) => c !== null)
  assert.equal(new Set(codes).size, 1000)
  for (const code of codes) assert.ok(bankIds.has(code), code)
})

test('오늘의 퀴즈 규칙(날짜 % 문항 수)대로 2026-11-25는 DB 543번 = EX-0110이다', () => {
  assert.equal(MAP[543], 'EX-0110')
})

/**
 * 시드 SQL(database/seed/004_insert_quizzes.sql)을 행 순서대로 읽는다. 행 순서 = AUTO_INCREMENT id(1부터).
 * 각 행의 문자열 값: 유형, 질문, (보기 'id', A, 'text', 내용)×4, 해설, 주제, 난이도, 정답
 */
function readSeedRows() {
  const sql = readFileSync(
    new URL('../../database/seed/004_insert_quizzes.sql', import.meta.url),
    'utf8',
  )
  const rows = []
  for (const line of sql.split(/\r?\n/)) {
    const m = line.match(/^(?:VALUES\s*|\s+)\((.*)\)[,;]\s*$/)
    if (!m) continue
    const strings = [...m[1].matchAll(/'((?:[^']|'')*)'/g)].map((x) =>
      x[1].replace(/''/g, "'"),
    )
    const [type, question] = strings
    const [explanation, , , answer] = strings.slice(-4)
    const middle = strings.slice(2, -4)
    const options = []
    for (let i = 0; i + 3 < middle.length; i += 4)
      options.push({ id: middle[i + 1], text: middle[i + 3] })
    rows.push({ type, question, options, explanation, answer })
  }
  return rows
}

test('대응표의 모든 문항은 시드의 질문·보기·정답·해설과 실제 내용이 같다(두 항목이 바뀌어도 잡는다)', () => {
  const rows = readSeedRows()
  assert.equal(rows.length, 1012)
  let checked = 0
  for (let dbId = 1; dbId < MAP.length; dbId++) {
    const seed = rows[dbId - 1]
    const code = MAP[dbId]
    if (code === null) {
      assert.equal(
        seed.type,
        'true_false',
        `DB ${dbId}는 OX여야 매핑이 비어 있다`,
      )
      continue
    }
    const bank = bankById.get(code)
    const at = `DB ${dbId} → ${code}`
    assert.equal(seed.type, 'multiple_choice', at)
    assert.equal(bank.question, seed.question, at)
    assert.equal(bank.correctAnswerId, seed.answer, at)
    assert.equal(bank.explanation, seed.explanation, at)
    assert.deepEqual(
      bank.options.map((o) => ({ id: o.id, text: o.text })),
      seed.options,
      at,
    )
    checked++
  }
  assert.equal(checked, 1000)
})
