import { DIFFICULTY_ORDER, DIFFICULTY_WEIGHTS } from './quizPolicy.ts'
import type { QuizDifficulty, QuizDomain, QuizQuestion } from './quizTypes.ts'

export interface PickInput {
  bank: readonly QuizQuestion[]
  /** 영역별 지식 수준. null은 모름(초급 정책). */
  tiers: Record<QuizDomain, QuizDifficulty | null>
  /** 이미 푼(완료한) 문항 id */
  answeredIds: ReadonlySet<string>
  /** 0 이상 1 미만의 난수. 테스트에서 고정해 쓴다. */
  random: () => number
}

/** 브라우저의 암호용 난수로 만든 0~1 난수. 출제를 확정하는 순간에만 쓰고 렌더링마다 부르지 않는다. */
export function secureRandom(): number {
  const c = globalThis.crypto
  if (c?.getRandomValues) {
    return c.getRandomValues(new Uint32Array(1))[0] / 4294967296
  }
  return Math.random()
}

function pickIndex(length: number, random: () => number): number {
  return Math.min(length - 1, Math.floor(random() * length))
}

/**
 * 오늘의 문제 하나를 고른다(출제를 확정하는 순간에 한 번만 부른다).
 * 1) 운동·식단은 50:50으로 고르되, 고른 영역에 안 푼 문항이 없으면 다른 영역으로 넘어간다(전체를 소진하기 전에는 푼 문항을 다시 내지 않는다).
 * 2) 그 영역의 지식 수준에 맞는 난이도 비율로 난이도를 고르고, 그 난이도에 낼 문항이 없으면 비율이 높은 다른 난이도로 대체한다.
 * 3) 전체 문항을 모두 푼 뒤에만 푼 문항을 다시 낼 수 있다.
 * 낼 문항이 하나도 없으면 null이다.
 */
export function pickQuestion(input: PickInput): QuizQuestion | null {
  const { bank, tiers, answeredIds, random } = input
  if (bank.length === 0) return null
  const unanswered = bank.filter((q) => !answeredIds.has(q.id))
  const pool = unanswered.length === 0 ? bank : unanswered

  const first: QuizDomain = random() < 0.5 ? 'exercise' : 'meal'
  const second: QuizDomain = first === 'exercise' ? 'meal' : 'exercise'
  const domain: QuizDomain = pool.some((q) => q.domain === first)
    ? first
    : second
  const inDomain = pool.filter((q) => q.domain === domain)
  if (inDomain.length === 0) return null

  const weights = DIFFICULTY_WEIGHTS[tiers[domain] ?? 'beginner']
  const total = weights[0] + weights[1] + weights[2]
  let roll = random() * total
  let chosen: QuizDifficulty = DIFFICULTY_ORDER[2]
  for (let i = 0; i < 3; i += 1) {
    if (roll < weights[i]) {
      chosen = DIFFICULTY_ORDER[i]
      break
    }
    roll -= weights[i]
  }
  const fallback = DIFFICULTY_ORDER.filter((d) => d !== chosen).sort(
    (a, b) =>
      weights[DIFFICULTY_ORDER.indexOf(b)] -
      weights[DIFFICULTY_ORDER.indexOf(a)],
  )
  for (const difficulty of [chosen, ...fallback]) {
    const candidates = inDomain.filter((q) => q.difficulty === difficulty)
    if (candidates.length > 0) {
      return candidates[pickIndex(candidates.length, random)]
    }
  }
  return null
}
