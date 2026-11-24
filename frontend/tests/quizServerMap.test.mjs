import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// 백엔드 퀴즈 DB id → 프론트 문제 은행 id 대응표(quiz/server/quizIdMap.ts) 검증.
let server
let MAP
let bankIds

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  MAP = (await server.ssrLoadModule('/src/quiz/server/quizIdMap.ts'))
    .QUIZ_CODE_BY_DB_ID
  const EX = await server.ssrLoadModule('/src/quiz/data/exerciseQuestions.ts')
  const ME = await server.ssrLoadModule('/src/quiz/data/mealQuestions.ts')
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
