import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'

// 퀴즈 문제 데이터(frontend/src/quiz/data/) 구조·수량·중복 검증. 대문자 드라이브(C:\)의 작업 폴더에서 실행한다.
let server
let EX
let ME
let T
let all

const EXPECTED = {
  exercise: {
    basics: 100,
    warmup: 60,
    form: 100,
    intensity: 60,
    body: 60,
    recovery: 60,
    safety: 60,
  },
  meal: {
    nutrients: 100,
    balance: 100,
    label: 80,
    habit: 80,
    water: 40,
    hygiene: 50,
    practice: 50,
  },
}

before(async () => {
  server = await createServer({
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
  })
  EX = await server.ssrLoadModule('/src/quiz/data/exerciseQuestions.ts')
  ME = await server.ssrLoadModule('/src/quiz/data/mealQuestions.ts')
  T = await server.ssrLoadModule('/src/quiz/quizTypes.ts')
  all = [...EX.EXERCISE_QUESTIONS, ...ME.MEAL_QUESTIONS]
})
after(async () => {
  await server.close()
})

const bigrams = (text) => {
  const s = text.replace(/\s+/g, '')
  const set = new Set()
  for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2))
  return set
}
const jaccard = (a, b) => {
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  return inter / (a.size + b.size - inter)
}

test('총 1,000문항: 운동 500 + 식단 500', () => {
  assert.equal(EX.EXERCISE_QUESTIONS.length, 500)
  assert.equal(ME.MEAL_QUESTIONS.length, 500)
  assert.equal(all.length, 1000)
})

test('카테고리별 문항 수가 정확하다', () => {
  for (const [domain, cats] of Object.entries(EXPECTED)) {
    const list = all.filter((q) => q.domain === domain)
    for (const [key, count] of Object.entries(cats)) {
      assert.equal(
        list.filter((q) => q.category === key).length,
        count,
        `${domain}/${key}`,
      )
    }
  }
  const specTotal = T.QUIZ_CATEGORIES.reduce((n, c) => n + c.count, 0)
  assert.equal(specTotal, 1000)
})

test('ID가 모두 고유하고 형식이 올바르다', () => {
  const ids = new Set(all.map((q) => q.id))
  assert.equal(ids.size, 1000)
  for (const q of all) assert.match(q.id, /^(EX|ME)-\d{4}$/)
})

test('각 문항은 보기 4개, 정답 1개, 해설을 갖는다', () => {
  for (const q of all) {
    assert.equal(q.options.length, 4, q.id)
    assert.deepEqual(
      q.options.map((o) => o.id),
      ['A', 'B', 'C', 'D'],
      q.id,
    )
    const texts = q.options.map((o) => o.text.trim())
    assert.ok(
      texts.every((t) => t.length > 0),
      `${q.id} 빈 보기`,
    )
    assert.equal(new Set(texts).size, 4, `${q.id} 보기 중복`)
    assert.equal(
      q.options.filter((o) => o.id === q.correctAnswerId).length,
      1,
      q.id,
    )
    assert.ok(q.question.trim().length >= 8, `${q.id} 질문이 짧음`)
    assert.ok(q.explanation.trim().length >= 10, `${q.id} 해설이 짧음`)
    assert.ok(
      ['beginner', 'intermediate', 'advanced'].includes(q.difficulty),
      q.id,
    )
  }
})

test('같은 질문 문장이 없고 질문+정답이 거의 같은 문항(유사도 0.8 이상)도 없다', () => {
  const seen = new Map()
  for (const q of all) {
    const key = q.question.replace(/\s+/g, '')
    assert.ok(!seen.has(key), `${q.id}와 ${seen.get(key)}의 질문이 같음`)
    seen.set(key, q.id)
  }
  const grams = all.map((q) =>
    bigrams(
      q.question + q.options.find((o) => o.id === q.correctAnswerId).text,
    ),
  )
  const similar = []
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      if (all[i].domain !== all[j].domain) continue
      if (jaccard(grams[i], grams[j]) >= 0.8)
        similar.push(`${all[i].id}~${all[j].id}`)
    }
  }
  assert.deepEqual(similar, [], `유사 질문: ${similar.join(', ')}`)
})

test('정답 문장과 질문의 조합이 같은 문항이 없다', () => {
  const seen = new Set()
  for (const q of all) {
    const correct = q.options.find((o) => o.id === q.correctAnswerId).text
    const key = `${q.domain}|${q.question}|${correct}`
    assert.ok(!seen.has(key), q.id)
    seen.add(key)
  }
})

test('난이도가 세 단계 모두 충분하다(운동·식단 각각)', () => {
  for (const domain of ['exercise', 'meal']) {
    const list = all.filter((q) => q.domain === domain)
    for (const d of ['beginner', 'intermediate', 'advanced']) {
      assert.ok(
        list.filter((q) => q.difficulty === d).length >= 60,
        `${domain}/${d}`,
      )
    }
  }
})

test('정답 위치가 한쪽으로 몰리지 않는다', () => {
  const count = { A: 0, B: 0, C: 0, D: 0 }
  for (const q of all) count[q.correctAnswerId]++
  for (const id of ['A', 'B', 'C', 'D']) {
    assert.ok(count[id] >= 200 && count[id] <= 300, `${id}: ${count[id]}`)
  }
})

test('모든 문항은 검수 전 초안이다(verified false, source null, version 1)', () => {
  for (const q of all) {
    assert.equal(q.verified, false, q.id)
    assert.equal(q.source, null, q.id)
    assert.equal(q.version, 1, q.id)
  }
})

test('개발용 초안 문구가 운영 노출용 보기·해설에 들어 있지 않다', () => {
  for (const q of all) {
    const text = [
      q.question,
      q.explanation,
      ...q.options.map((o) => o.text),
    ].join(' ')
    assert.ok(!/TODO|임시|lorem/i.test(text), q.id)
  }
})
