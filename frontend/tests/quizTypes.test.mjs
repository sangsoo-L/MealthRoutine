import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 퀴즈 유형 확장(multiple_choice / true_false) 테스트. OX 문항은 이 테스트 안의 검사용 객체이며 문항 데이터에는 OX가 없다.
let server
let Model
let View
let Parts
let Bank
let EX
let ME

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Model = await server.ssrLoadModule('/src/quiz/quizModel.ts')
  View = await server.ssrLoadModule('/src/quiz/quizView.ts')
  Parts = await server.ssrLoadModule('/src/components/quiz/QuizParts.tsx')
  Bank = await server.ssrLoadModule('/src/quiz/quizBank.ts')
  EX = await server.ssrLoadModule('/src/quiz/data/exerciseQuestions.ts')
  ME = await server.ssrLoadModule('/src/quiz/data/mealQuestions.ts')
})
after(async () => {
  await server.close()
})

const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node))
const all = () => [...EX.EXERCISE_QUESTIONS, ...ME.MEAL_QUESTIONS]

const tf = (over = {}) => ({
  id: 'TF-TEST-1',
  type: 'true_false',
  domain: 'exercise',
  category: 'basics',
  difficulty: 'beginner',
  question: '운동 전에 준비 운동을 하면 부상 위험을 줄이는 데 도움이 된다.',
  correctAnswerId: 'O',
  explanation: '검사용 해설입니다.',
  source: null,
  verified: false,
  version: 1,
  ...over,
})

test('기존 1,000문항은 모두 multiple_choice이고 ID·정답·검증 상태는 그대로다', () => {
  const questions = all()
  assert.equal(questions.length, 1000)
  assert.ok(questions.every((q) => q.type === 'multiple_choice'))
  assert.ok(questions.every((q) => q.options.length === 4))
  assert.ok(questions.every((q) => q.verified === false && q.source === null))
  assert.equal(new Set(questions.map((q) => q.id)).size, 1000)
  // 정답 위치 고정 규칙(ID 번호 기준)이 유지된다.
  assert.equal(EX.EXERCISE_QUESTIONS[0].id, 'EX-0001')
  assert.equal(ME.MEAL_QUESTIONS[0].id, 'ME-0001')
  for (const q of questions) {
    assert.equal(
      q.options.findIndex((o) => o.id === q.correctAnswerId),
      'ABCD'.indexOf(q.correctAnswerId),
    )
  }
})

test('채점: 4지선다는 A~D, OX는 O·X만 선택지이고 다른 유형의 값은 채점하지 않는다', () => {
  const mc = all()[0]
  const wrong = ['A', 'B', 'C', 'D'].find((id) => id !== mc.correctAnswerId)
  assert.equal(Model.gradeAnswer(mc, mc.correctAnswerId), true)
  assert.equal(Model.gradeAnswer(mc, wrong), false)
  assert.equal(Model.gradeAnswer(mc, 'O'), null)
  assert.equal(Model.gradeAnswer(mc, 'E'), null)
  assert.equal(Model.gradeAnswer(mc, undefined), null)

  assert.equal(Model.gradeAnswer(tf(), 'O'), true)
  assert.equal(Model.gradeAnswer(tf(), 'X'), false)
  assert.equal(Model.gradeAnswer(tf({ correctAnswerId: 'X' }), 'X'), true)
  assert.equal(Model.gradeAnswer(tf(), 'A'), null)
  assert.equal(Model.gradeAnswer(tf(), 'o'), null)
  assert.equal(Model.gradeAnswer(tf(), true), null)
})

test('기록 호환: 기존 A~D 응시 기록과 OX 기록을 읽고, 유형에 없는 값·불완전한 기록은 손상으로 본다', () => {
  const base = {
    id: 'q1',
    ownerId: 'free',
    schemaVersion: 1,
    localDate: '2026-11-19',
    questionId: 'EX-0001',
    assignedAt: '2026-11-19T00:00:00.000Z',
    selectedAnswerId: null,
    isCorrect: null,
    completedAt: null,
  }
  const done = (selectedAnswerId, isCorrect = true) => ({
    ...base,
    selectedAnswerId,
    isCorrect,
    completedAt: '2026-11-19T00:01:00.000Z',
  })
  assert.ok(Model.parseDailyQuiz(base)) // 응시 전
  assert.ok(Model.parseDailyQuiz(done('C'))) // 기존 4지선다 기록
  assert.ok(Model.parseDailyQuiz(done('O')))
  assert.ok(Model.parseDailyQuiz(done('X', false)))
  assert.equal(Model.parseDailyQuiz(done('E')), null)
  assert.equal(Model.parseDailyQuiz(done('o')), null)
  assert.equal(Model.parseDailyQuiz(done(null)), null)
  assert.equal(
    Model.parseDailyQuiz({ ...base, selectedAnswerId: 'O' }),
    null,
    '응시 전인데 선택 값이 있으면 손상',
  )
})

test('저장소 검증은 같은 유형의 정답·선택만 받고 보상은 날짜 기준 한 번이라는 기존 구조를 유지한다', () => {
  const repo = read('../src/quiz/local/indexedDbQuizRepository.ts')
  assert.match(repo, /isAnswerId\(selectedAnswerId\)/)
  assert.match(
    repo,
    /isOptionId\(selectedAnswerId\) !== isOptionId\(correctAnswerId\)/,
  )
  // 보상 키·보상 내역 방식은 바뀌지 않았다.
  const policy = read('../src/quiz/quizPolicy.ts')
  assert.match(policy, /return `quiz:\$\{localDate\}`/)
  assert.match(policy, /points: 10, experience: 10/)
  // DB 스키마(버전·저장소)는 바뀌지 않았다.
  const db = read('../src/exercise/local/exerciseDb.ts')
  assert.match(db, /EXERCISE_DB_VERSION = 6/)
})

test('표시: 선택지와 정답 글자를 유형별로 만든다', () => {
  const mc = all()[0]
  assert.deepEqual(
    View.answerChoices(mc).map((c) => c.id),
    ['A', 'B', 'C', 'D'],
  )
  assert.deepEqual(View.answerChoices(tf()), [
    { id: 'O', text: '맞아요' },
    { id: 'X', text: '아니에요' },
  ])
  assert.equal(
    View.correctAnswerText(mc),
    mc.options.find((o) => o.id === mc.correctAnswerId).text,
  )
  assert.match(View.correctAnswerText(tf()), /정답은 O\(맞아요\)예요/)
  assert.match(
    View.correctAnswerText(tf({ correctAnswerId: 'X' })),
    /정답은 X\(아니에요\)예요/,
  )
  // 결과 표시: OX도 정답·내가 고른 답을 글자로 구분한다.
  assert.deepEqual(View.markOption('O', 'O', 'O'), {
    tag: '내가 고른 정답',
    tone: 'correct',
  })
  assert.deepEqual(View.markOption('X', 'X', 'O'), {
    tag: '내가 고른 답',
    tone: 'wrong',
  })
  assert.deepEqual(View.markOption('O', 'X', 'O'), {
    tag: '정답',
    tone: 'correct',
  })
})

test('화면: OX 문제는 O·X 두 개의 라디오만 보이고 정답·해설을 드러내지 않으며 4지선다는 4개 그대로다', () => {
  const props = { submitting: false, failed: false, onSubmit: () => {} }
  const q = tf()
  const html = render(
    createElement(Parts.QuizQuestionForm, { question: q, ...props }),
  )
  assert.equal((html.match(/type="radio"/g) ?? []).length, 2)
  assert.match(html, /value="O"/)
  assert.match(html, /value="X"/)
  assert.ok(html.includes(q.question))
  assert.ok(!html.includes(q.explanation))
  assert.match(html, /<button[^>]*disabled[^>]*>제출하기/)

  const mc = ME.MEAL_QUESTIONS[3]
  const mcHtml = render(
    createElement(Parts.QuizQuestionForm, { question: mc, ...props }),
  )
  assert.equal((mcHtml.match(/type="radio"/g) ?? []).length, 4)
})

function ready(question, selectedAnswerId, isCorrect) {
  return {
    status: 'ready',
    repository: {},
    localDate: '2026-11-19',
    question,
    quiz: {
      id: 'q',
      ownerId: 'u',
      schemaVersion: 1,
      localDate: '2026-11-19',
      questionId: question.id,
      assignedAt: '2026-11-19T00:00:00.000Z',
      selectedAnswerId,
      isCorrect,
      completedAt: '2026-11-19T00:01:00.000Z',
    },
    reward: null,
    totals: { points: 0, experience: 0, count: 0, skippedCount: 0 },
  }
}

test('화면: OX 결과는 고른 답과 정답을 글자로 구분하고 해설을 보이며 4지선다 결과는 그대로다', () => {
  const q = tf({ correctAnswerId: 'O' })
  const wrong = render(
    createElement(Parts.QuizResult, {
      ready: ready(q, 'X', false),
      focusOnMount: false,
    }),
  )
  assert.match(wrong, /내가 고른 답/)
  assert.match(wrong, /정답<\/span>|✓ <\/span>정답/)
  assert.ok(wrong.includes(q.explanation))
  assert.match(wrong, /정답은 O\(맞아요\)예요/)

  const right = render(
    createElement(Parts.QuizResult, {
      ready: ready(q, 'O', true),
      focusOnMount: false,
    }),
  )
  assert.match(right, /정답이에요/)
  assert.match(right, /내가 고른 정답/)

  const mc = EX.EXERCISE_QUESTIONS[0]
  const mcHtml = render(
    createElement(Parts.QuizResult, {
      ready: ready(mc, mc.correctAnswerId, true),
      focusOnMount: false,
    }),
  )
  assert.equal((mcHtml.match(/<li /g) ?? []).length, 4)
  assert.ok(mcHtml.includes(mc.explanation))
})

test('출제: 유형을 고려하지 않아 OX가 섞여도 기존 출제 규칙대로 고르고 유형 비율은 하드코딩하지 않는다', () => {
  const select = read('../src/quiz/quizSelect.ts')
  const policy = read('../src/quiz/quizPolicy.ts')
  assert.doesNotMatch(select, /true_false|multiple_choice|\.type\b/)
  assert.doesNotMatch(policy, /true_false|multiple_choice/)
  // 운영 안전장치 유지: 운영 번들은 문항 모듈을 포함하지 않고 빈 은행이다.
  assert.match(
    read('../src/quiz/quizBank.ts'),
    /if \(!import\.meta\.env\.DEV\) return \[\]/,
  )
  assert.deepEqual(
    Bank.usableQuestions([...all(), tf({ verified: true })], false).map(
      (q) => q.id,
    ),
    ['TF-TEST-1'],
  )
})
