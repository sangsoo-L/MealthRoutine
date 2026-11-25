import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { after, before, test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router'
import { createServer } from 'vite'

// 알아가기 퀴즈(H02) 출제 로직·모델·화면·운영 안전장치 테스트. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
// IndexedDB 저장소의 실제 동작(원자적 보상, 중복 방지, 마이그레이션)은 Chrome 회귀 테스트(tests/chrome/specs/quiz.mjs)가 확인한다.
let server
let Select
let Policy
let Model
let Bank
let View
let Parts
let Types
let EX
let ME

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const code = (path) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  Select = await server.ssrLoadModule('/src/quiz/quizSelect.ts')
  Policy = await server.ssrLoadModule('/src/quiz/quizPolicy.ts')
  Model = await server.ssrLoadModule('/src/quiz/quizModel.ts')
  Bank = await server.ssrLoadModule('/src/quiz/quizBank.ts')
  View = await server.ssrLoadModule('/src/quiz/quizView.ts')
  Parts = await server.ssrLoadModule('/src/components/quiz/QuizParts.tsx')
  Types = await server.ssrLoadModule('/src/quiz/quizTypes.ts')
  EX = await server.ssrLoadModule('/src/quiz/data/exerciseQuestions.ts')
  ME = await server.ssrLoadModule('/src/quiz/data/mealQuestions.ts')
})
after(async () => {
  await server.close()
})

/** 시드를 고정한 난수(mulberry32). 테스트 재현성을 위해 쓴다. */
function seeded(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const allQuestions = () => [...EX.EXERCISE_QUESTIONS, ...ME.MEAL_QUESTIONS]
const NONE = { exercise: null, meal: null }
const empty = new Set()

// ── 출제 로직 ──
test('출제: 운동과 식단이 대략 50:50으로 나온다', () => {
  const bank = allQuestions()
  const random = seeded(1)
  const counts = { exercise: 0, meal: 0 }
  for (let i = 0; i < 4000; i += 1) {
    counts[
      Select.pickQuestion({
        bank,
        tiers: NONE,
        answeredIds: empty,
        random,
      }).domain
    ] += 1
  }
  assert.ok(
    counts.exercise > 1800 && counts.exercise < 2200,
    JSON.stringify(counts),
  )
})

test('출제: 난이도 비율이 지식 수준(초급 70/25/5, 중급 30/50/20, 고급 10/30/60)을 따르고 수준을 모르면 초급이다', () => {
  const bank = allQuestions()
  const sample = (tier) => {
    const random = seeded(7)
    const c = { beginner: 0, intermediate: 0, advanced: 0 }
    for (let i = 0; i < 6000; i += 1) {
      const q = Select.pickQuestion({
        bank,
        tiers: { exercise: tier, meal: tier },
        answeredIds: empty,
        random,
      })
      c[q.difficulty] += 1
    }
    return c
  }
  const near = (value, expected) =>
    assert.ok(
      Math.abs(value / 6000 - expected) < 0.03,
      `${value / 6000} vs ${expected}`,
    )
  const b = sample('beginner')
  near(b.beginner, 0.7)
  near(b.intermediate, 0.25)
  near(b.advanced, 0.05)
  const i = sample('intermediate')
  near(i.beginner, 0.3)
  near(i.intermediate, 0.5)
  near(i.advanced, 0.2)
  const a = sample('advanced')
  near(a.beginner, 0.1)
  near(a.intermediate, 0.3)
  near(a.advanced, 0.6)
  const unknown = sample(null)
  near(unknown.beginner, 0.7)
})

test('출제: 영역마다 지식 수준을 따로 적용한다(운동 고급·식단 초급)', () => {
  const bank = allQuestions()
  const random = seeded(11)
  const c = { exercise: { b: 0, a: 0 }, meal: { b: 0, a: 0 } }
  for (let i = 0; i < 6000; i += 1) {
    const q = Select.pickQuestion({
      bank,
      tiers: { exercise: 'advanced', meal: 'beginner' },
      answeredIds: empty,
      random,
    })
    if (q.difficulty === 'beginner') c[q.domain].b += 1
    if (q.difficulty === 'advanced') c[q.domain].a += 1
  }
  assert.ok(c.exercise.a > c.exercise.b * 3, JSON.stringify(c))
  assert.ok(c.meal.b > c.meal.a * 5, JSON.stringify(c))
})

test('출제: 안 푼 문항을 우선하고, 전체를 모두 푼 뒤에만 다시 낸다', () => {
  const bank = allQuestions()
  const random = seeded(3)
  const answered = new Set(bank.slice(0, 999).map((q) => q.id))
  for (let i = 0; i < 50; i += 1) {
    const q = Select.pickQuestion({
      bank,
      tiers: NONE,
      answeredIds: answered,
      random,
    })
    assert.equal(q.id, bank[999].id)
  }
  const all = new Set(bank.map((q) => q.id))
  const again = Select.pickQuestion({
    bank,
    tiers: NONE,
    answeredIds: all,
    random,
  })
  assert.ok(again && all.has(again.id))
})

test('출제: 고른 난이도에 안 푼 문항이 없으면 다른 난이도로 대체하고, 은행이 비면 null이다', () => {
  const bank = allQuestions().filter((q) => q.difficulty === 'advanced')
  const q = Select.pickQuestion({
    bank,
    tiers: NONE,
    answeredIds: empty,
    random: seeded(5),
  })
  assert.equal(q.difficulty, 'advanced')
  assert.equal(
    Select.pickQuestion({
      bank: [],
      tiers: NONE,
      answeredIds: empty,
      random: seeded(1),
    }),
    null,
  )
})

test('출제: 한 영역을 모두 푼 뒤에는 다른 영역에서 낸다', () => {
  const bank = allQuestions()
  const answered = new Set(
    bank.filter((q) => q.domain === 'exercise').map((q) => q.id),
  )
  const random = seeded(9)
  for (let i = 0; i < 40; i += 1) {
    assert.equal(
      Select.pickQuestion({ bank, tiers: NONE, answeredIds: answered, random })
        .domain,
      'meal',
    )
  }
})

test('출제: 같은 난수열이면 같은 문항이다(결정적)이며 secureRandom은 0~1 범위다', () => {
  const bank = allQuestions()
  const a = Select.pickQuestion({
    bank,
    tiers: NONE,
    answeredIds: empty,
    random: seeded(42),
  })
  const b = Select.pickQuestion({
    bank,
    tiers: NONE,
    answeredIds: empty,
    random: seeded(42),
  })
  assert.equal(a.id, b.id)
  for (let i = 0; i < 100; i += 1) {
    const r = Select.secureRandom()
    assert.ok(r >= 0 && r < 1)
  }
})

// ── 보상 정책·모델 ──
test('보상 정책: 정답 10PT + 10XP, 하루 한 번의 키(quiz:날짜)', () => {
  assert.deepEqual({ ...Policy.QUIZ_REWARD }, { points: 10, experience: 10 })
  assert.equal(Policy.rewardKeyFor('2026-11-19'), 'quiz:2026-11-19')
  assert.deepEqual(
    [...Policy.DIFFICULTY_ORDER],
    ['beginner', 'intermediate', 'advanced'],
  )
})

test('모델: 퀴즈 행과 보상 내역의 모양 검증(응시 전·후 일관성, 손상은 null)', () => {
  const now = new Date('2026-11-19T09:00:00.000Z')
  const fresh = Model.newDailyQuiz({
    id: 'q1',
    ownerId: 'member-free',
    localDate: '2026-11-19',
    questionId: 'EX-0001',
    now,
  })
  assert.ok(Model.parseDailyQuiz(fresh))
  const done = {
    ...fresh,
    selectedAnswerId: 'B',
    isCorrect: true,
    completedAt: now.toISOString(),
  }
  assert.ok(Model.parseDailyQuiz(done))
  assert.equal(Model.parseDailyQuiz({ ...fresh, selectedAnswerId: 'B' }), null)
  assert.equal(Model.parseDailyQuiz({ ...done, selectedAnswerId: 'Z' }), null)
  assert.equal(Model.parseDailyQuiz({ ...done, isCorrect: null }), null)
  assert.equal(
    Model.parseDailyQuiz({ ...fresh, localDate: '2026-02-31' }),
    null,
  )
  assert.equal(Model.parseDailyQuiz(null), null)
  const reward = Model.newRewardEntry({
    transactionId: 't1',
    ownerId: 'member-free',
    localDate: '2026-11-19',
    now,
  })
  assert.equal(reward.points, 10)
  assert.equal(reward.experience, 10)
  assert.equal(reward.rewardKey, 'quiz:2026-11-19')
  assert.ok(Model.parseRewardEntry(reward))
  assert.equal(Model.parseRewardEntry({ ...reward, points: -1 }), null)
  assert.equal(Model.parseRewardEntry({ ...reward, points: 1.5 }), null)
  assert.equal(Model.parseRewardEntry({ ...reward, schemaVersion: 2 }), null)
})

// ── 문구·표시 ──
test('표시: 정답·내가 고른 답을 글자로 구분하고 보상 문구는 보상 내역에서 만든다', () => {
  assert.deepEqual(View.markOption('B', 'B', 'B'), {
    tag: '내가 고른 정답',
    tone: 'correct',
  })
  assert.deepEqual(View.markOption('B', 'C', 'B'), {
    tag: '정답',
    tone: 'correct',
  })
  assert.deepEqual(View.markOption('C', 'C', 'B'), {
    tag: '내가 고른 답',
    tone: 'wrong',
  })
  assert.deepEqual(View.markOption('A', 'C', 'B'), { tag: null, tone: 'plain' })
  const totals = { points: 30, experience: 30, count: 3, skippedCount: 0 }
  const reward = { points: 10, experience: 10 }
  assert.deepEqual(View.summarizeReward('correct', reward, totals), {
    thisTime: '이번 보상 10PT · 10XP',
    cumulative: '누적 30PT · 30XP',
  })
  assert.equal(
    View.summarizeReward('wrong', null, totals).thisTime,
    '이번에는 보상이 없어요',
  )
  assert.equal(
    View.summarizeReward('correct', null, totals).thisTime,
    '이번 보상을 확인하지 못했어요',
  )
  assert.match(View.rewardNotice(), /10PT.*10XP/)
})

// ── 화면(SSR) ──
const render = (node) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node))

test('화면: 시작 전에는 문제와 보기를 보이지 않고 "문제 풀기"와 보상 안내만 보인다', () => {
  const q = EX.EXERCISE_QUESTIONS[0]
  const html = render(
    createElement(Parts.QuizEntry, { question: q, onStart: () => {} }),
  )
  assert.match(html, /문제 풀기/)
  assert.match(html, /10PT/)
  assert.ok(!html.includes(q.question))
  for (const option of q.options) assert.ok(!html.includes(option.text))
})

test('화면: 문제 화면은 보기 4개를 라디오로 보이고 제출은 선택 전까지 비활성이며 정답을 드러내지 않는다', () => {
  const q = ME.MEAL_QUESTIONS[3]
  const html = render(
    createElement(Parts.QuizQuestionForm, {
      question: q,
      submitting: false,
      failed: false,
      onSubmit: () => {},
    }),
  )
  assert.equal((html.match(/type="radio"/g) ?? []).length, 4)
  assert.match(html, /<legend/)
  assert.match(html, /<button[^>]*disabled[^>]*>제출하기/)
  assert.ok(!html.includes(q.explanation))
  assert.ok(!html.includes('정답이에요'))
  assert.doesNotMatch(html, /checked=""/)
})

function readyFor(question, selectedAnswerId, isCorrect, reward) {
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
    reward,
    totals: {
      points: reward ? 10 : 0,
      experience: reward ? 10 : 0,
      count: reward ? 1 : 0,
      skippedCount: 0,
    },
  }
}

test('화면: 정답 결과는 정답 문구·해설·이번 보상과 누적·홈 링크·다음 퀴즈 안내를 보인다', () => {
  const q = EX.EXERCISE_QUESTIONS[10]
  const reward = { points: 10, experience: 10 }
  const html = render(
    createElement(Parts.QuizResult, {
      ready: readyFor(q, q.correctAnswerId, true, reward),
      focusOnMount: false,
    }),
  )
  assert.match(html, /정답이에요!/)
  assert.match(html, /내가 고른 정답/)
  assert.ok(html.includes(q.explanation))
  assert.match(html, /이번 보상 10PT · 10XP/)
  assert.match(html, /누적 10PT · 10XP/)
  assert.match(html, /오늘의 퀴즈 완료/)
  assert.match(html, /다음 퀴즈는 내일/)
  assert.match(html, /href="\/home"/)
  assert.match(html, /role="status"/)
})

test('화면: 오답 결과는 비난하지 않는 문구로 고른 답과 정답을 글자로 구분하고 보상이 없다고 알린다', () => {
  const q = EX.EXERCISE_QUESTIONS[20]
  const wrongId = q.options.find((o) => o.id !== q.correctAnswerId).id
  const html = render(
    createElement(Parts.QuizResult, {
      ready: readyFor(q, wrongId, false, null),
      focusOnMount: false,
    }),
  )
  assert.match(html, /아쉬워요! 함께 알아봐요\./)
  assert.match(html, /내가 고른 답/)
  assert.match(html, />\s*정답<|정답<\/span>/)
  assert.match(html, /이번에는 보상이 없어요/)
  assert.match(html, /누적 0PT · 0XP/)
  assert.ok(html.includes(q.explanation))
})

test('화면: 준비 중·오류 안내 컴포넌트는 홈으로 가는 링크를 갖고 오류에는 다시 시도가 있다', () => {
  const info = render(
    createElement(Parts.QuizNotice, { title: '준비 중', body: '본문' }),
  )
  assert.match(info, /href="\/home"/)
  assert.ok(!info.includes('다시 시도'))
  const err = render(
    createElement(Parts.QuizNotice, {
      title: '오류',
      body: '본문',
      action: { label: '다시 시도', onClick: () => {} },
    }),
  )
  assert.match(err, /role="alert"/)
  assert.match(err, /다시 시도/)
})

// ── 운영 빌드 안전장치 ──
test('운영 안전장치: 문항 은행과 저장소는 DEV일 때만 불러오고 운영은 검증된 문항만 쓴다', () => {
  assert.match(
    code('../src/quiz/quizBank.ts'),
    /if \(!import\.meta\.env\.DEV\) return \[\]/,
  )
  // 서버 연결 후에는 개발용 체험 로그인(VITE_DEV_AUTH)일 때만 개발 저장소를 쓴다
  assert.match(
    code('../src/quiz/quizSource.ts'),
    /import\.meta\.env\.DEV(\s*&&\s*import\.meta\.env\.VITE_DEV_AUTH === 'true')?\s*\?/,
  )
  const unverified = allQuestions().slice(0, 3)
  assert.equal(Bank.usableQuestions(unverified, false).length, 0)
  assert.equal(Bank.usableQuestions(unverified, true).length, 3)
  const verified = unverified.map((q) => ({ ...q, verified: true }))
  assert.equal(Bank.usableQuestions(verified, false).length, 3)
  // 문항 데이터는 화면·훅이 정적으로 import하지 않는다(번들에 들어가지 않게 동적 import만 쓴다).
  for (const file of [
    '../src/quiz/useDailyQuiz.ts',
    '../src/components/quiz/QuizParts.tsx',
    '../src/pages/QuizPage.tsx',
    '../src/pages/MemberHomePage.tsx',
  ]) {
    assert.doesNotMatch(read(file), /quiz\/data\/|from '\.\/data\//, file)
  }
})

test('H02 연결: 홈 퀴즈 카드는 /quiz로 가고 라우트는 회원 전용 H02이며 보상은 보상 내역으로만 쓴다', () => {
  assert.match(code('../src/components/home/homeContent.ts'), /to: '\/quiz'/)
  const router = read('../src/app/router.tsx')
  const at = router.indexOf("path: 'quiz'")
  assert.ok(at > 0)
  assert.match(router.slice(at, at + 400), /screenId: 'H02'/)
  // AuthGate 아래에 있다(AuthGate 시작 이후에 나온다).
  assert.ok(router.indexOf('<AuthGate />') < at)
  assert.match(
    read('../src/pages/MemberHomePage.tsx'),
    /quizCompleted \? null : <HomeQuizCard \/>/,
  )
  const repo = code('../src/quiz/local/indexedDbQuizRepository.ts')
  assert.match(repo, /STORE_REWARD_LEDGER/)
  assert.match(repo, /STORE_DAILY_QUIZZES/)
})

test('범위 준수: 퀴즈가 P01·P14·P16(마이페이지 포인트·레벨)과 가입 지식 진단을 바꾸지 않는다', () => {
  for (const file of [
    '../src/quiz/useDailyQuiz.ts',
    '../src/quiz/local/indexedDbQuizRepository.ts',
  ]) {
    assert.doesNotMatch(
      read(file),
      /mypage\/(mypageSource|useMyPage)|onboarding-assessment\/(assessmentSource|assessmentRepo)\b.*(save|set)/,
      file,
    )
  }
  assert.ok(Types.QUIZ_CATEGORIES.length === 14)
})
