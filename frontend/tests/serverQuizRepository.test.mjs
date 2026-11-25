import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

// 퀴즈 서버 저장소 회귀 테스트(PR #31 리뷰 P2-01·P2-02·P2-03).
// api/http.ts를 가짜 백엔드로 바꿔 끼운다. 가짜 백엔드는 실제 QuizService 규칙을 따른다:
// 하루 1번, questionId가 오늘 문제와 다르면 QUIZ_CHANGED로 거절(채점·저장하지 않음)
const FAKE_HTTP = `
export class ApiError extends Error {
  constructor(status, errorCode) { super(errorCode); this.status = status; this.errorCode = errorCode }
}
export function apiRequest(method, path, options) { return globalThis.__fakeQuizApi(method, path, options, ApiError) }
`

let server
let Repo
let Types
let View

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    plugins: [
      {
        name: 'fake-http',
        enforce: 'pre',
        load(id) {
          if (id.replace(/\\/g, '/').endsWith('/src/api/http.ts'))
            return FAKE_HTTP
        },
      },
    ],
  })
  Repo = await server.ssrLoadModule('/src/quiz/server/serverQuizRepository.ts')
  Types = await server.ssrLoadModule('/src/quiz/quizRepository.ts')
  View = await server.ssrLoadModule('/src/quiz/quizView.ts')
})

after(async () => {
  await server?.close()
})

const todayKst = () =>
  new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)

// DB 543번 = EX-0110(quizIdMap)
let backend
function installBackend({ todayQuizId = 543, correctAnswer = 'B' } = {}) {
  backend = { todayQuizId, attempt: null, posts: [] }
  globalThis.__fakeQuizApi = async (method, path, options, ApiError) => {
    if (method === 'GET' && path === '/quizzes/today') {
      const a = backend.attempt
      return {
        quizId: backend.todayQuizId,
        question: '서버 질문',
        topic: null,
        questionType: 'multiple_choice',
        solved: a !== null,
        result: a
          ? { correct: a.correct, answer: correctAnswer, explanation: '해설' }
          : null,
      }
    }
    if (method === 'POST' && path === '/quizzes/today/attempt') {
      backend.posts.push(options.body)
      if (backend.attempt) throw new ApiError(409, 'QUIZ_ALREADY_ATTEMPTED')
      const { questionId, answer } = options.body
      if (questionId != null && questionId !== backend.todayQuizId)
        throw new ApiError(409, 'QUIZ_CHANGED')
      backend.attempt = { correct: answer === correctAnswer }
      return {
        correct: backend.attempt.correct,
        answer: correctAnswer,
        explanation: '해설',
      }
    }
    if (method === 'GET' && path === '/users/me/rewards')
      return {
        level: 1,
        levelName: '',
        totalXp: 0,
        nextLevelXp: 100,
        balance: 0,
      }
    throw new Error(`unexpected ${method} ${path}`)
  }
}

beforeEach(() => {
  globalThis.localStorage = undefined // 고른 답 저장은 실패해도 된다
  installBackend()
})

test('조회: 서버 질문 원문을 함께 넘겨 화면이 은행 문항과 비교할 수 있다', async () => {
  const repo = Repo.createServerQuizRepository('2')
  const quiz = await repo.get(todayKst())
  assert.equal(quiz.questionId, 'EX-0110')
  assert.equal(quiz.serverQuestion, '서버 질문')
})

test('제출: 화면에 띄운 서버 문제 id를 같이 보낸다', async () => {
  const repo = Repo.createServerQuizRepository('2')
  const d = todayKst()
  await repo.get(d)
  await repo.complete({
    localDate: d,
    selectedAnswerId: 'B',
    correctAnswerId: 'B',
  })
  assert.deepEqual(backend.posts, [{ answer: 'B', questionId: 543 }])
})

test('자정을 넘긴 화면의 답은 서버에 보내지 않고 QuizDayChangedError', async () => {
  const repo = Repo.createServerQuizRepository('2')
  await assert.rejects(
    repo.complete({
      localDate: '2000-01-01',
      selectedAnswerId: 'B',
      correctAnswerId: 'B',
    }),
    (e) => e instanceof Types.QuizDayChangedError,
  )
  assert.equal(backend.posts.length, 0)
  assert.equal(backend.attempt, null)
})

test('요청 중 서버의 오늘 문제가 바뀌면(QUIZ_CHANGED) 채점·저장 없이 QuizDayChangedError', async () => {
  const repo = Repo.createServerQuizRepository('2')
  const d = todayKst()
  await repo.get(d) // 543번을 띄움
  backend.todayQuizId = 544 // 그 사이 자정이 지남
  await assert.rejects(
    repo.complete({
      localDate: d,
      selectedAnswerId: 'B',
      correctAnswerId: 'B',
    }),
    (e) => e instanceof Types.QuizDayChangedError,
  )
  assert.equal(backend.attempt, null)
})

test('정산 예정 보상: 정답 5PT·10XP, 오답 2PT·5XP', async () => {
  const d = todayKst()
  const right = Repo.createServerQuizRepository('2')
  await right.get(d)
  const r1 = await right.complete({
    localDate: d,
    selectedAnswerId: 'B',
    correctAnswerId: 'B',
  })
  assert.deepEqual([r1.reward.points, r1.reward.experience], [5, 10])

  installBackend()
  const wrong = Repo.createServerQuizRepository('3')
  await wrong.get(d)
  const r2 = await wrong.complete({
    localDate: d,
    selectedAnswerId: 'A',
    correctAnswerId: 'B',
  })
  assert.deepEqual([r2.reward.points, r2.reward.experience], [2, 5])
})

test('문구: 서버 모드는 실제 몫과 다음 날 00:05 정산을 안내한다', () => {
  const notice = View.rewardNotice('nextDay')
  assert.match(notice, /5PT·10XP/)
  assert.match(notice, /2PT·5XP/)
  assert.match(notice, /다음 날 00:05/)
  assert.doesNotMatch(notice, /10PT/)
  const summary = View.summarizeReward(
    'correct',
    { points: 5, experience: 10 },
    { points: 0, experience: 0, count: 0, skippedCount: 0 },
    'nextDay',
  )
  assert.match(summary.thisTime, /정산 예정 5PT · 10XP/)
  assert.match(summary.cumulative, /보유 0PT · 누적 0XP/)
  // 개발용 로컬 모드 문구는 그대로
  assert.match(View.rewardNotice(), /10PT.*10XP/)
})

test('매핑 검증: 서버 질문이 은행 문항과 다르면 제출을 막는다(공백 차이는 같다고 본다)', () => {
  assert.equal(View.serverQuestionMatches(undefined, '질문'), true)
  assert.equal(
    View.serverQuestionMatches('운동 후  스트레칭은?', '운동 후 스트레칭은?'),
    true,
  )
  assert.equal(
    View.serverQuestionMatches('다른 문제', '운동 후 스트레칭은?'),
    false,
  )
})
