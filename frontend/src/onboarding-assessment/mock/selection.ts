import type {
  AssessmentDomain,
  AssessmentSession,
  PublicQuestion,
} from '../assessmentTypes.ts'
import type { QuestionLevel, QuestionRecord } from './questionBank.ts'

/**
 * [개발 전용] Mock 출제 로직. 서버가 맡을 일(문항 추출, 순서·보기 섞기)을 개발 환경에서 흉내 낸다.
 * React에 의존하지 않는 순수 함수라서 난수 함수를 주입하면 화면 없이 결과를 재현해 검증할 수 있다.
 */

/** 0 이상 1 미만 난수를 돌려주는 함수. 기본은 Math.random이고 테스트에서는 시드 난수를 넣는다. */
export type Rng = () => number

/** 시드로 같은 난수열을 재현하는 난수 함수(mulberry32). 테스트용이다. */
export function createSeededRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Fisher–Yates. 원본은 바꾸지 않고 섞은 새 배열을 돌려준다. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export interface BlueprintSlot {
  domain: AssessmentDomain
  level: QuestionLevel
}

/**
 * 출제 청사진: 영역마다 기초 이해형(basic) 1 + 상황 적용형(applied) 1, 운동 2문항 + 식단 2문항 = 총 4문항.
 * level은 문항의 종류(평가 목적)이며 어려움의 정도나 사용자의 최종 단계와 다른 개념이다(questionBank.ts).
 * 5문항·통합 문항은 이번 범위에서 제외되었다(기획 확정 전).
 */
export const MOCK_BLUEPRINT: readonly BlueprintSlot[] = [
  { domain: 'exercise', level: 'basic' },
  { domain: 'exercise', level: 'applied' },
  { domain: 'meal', level: 'basic' },
  { domain: 'meal', level: 'applied' },
]

/**
 * 청사진 칸마다 조건(영역·난이도)에 맞는 문항을 하나씩 무작위로 뽑는다.
 * - 같은 문항은 두 번 뽑지 않는다.
 * - 같은 영역 안에서는 가능하면 서로 다른 세부 주제에서 뽑는다. 주제가 모자랄 때만 같은 주제를 허용한다.
 * - 비활성(active: false) 문항은 뽑지 않는다.
 * 조건에 맞는 문항이 없으면 오류를 던진다(문항 은행이 모자란 것이다).
 */
export function pickQuestions(
  bank: readonly QuestionRecord[],
  blueprint: readonly BlueprintSlot[],
  rng: Rng,
): QuestionRecord[] {
  const chosen: QuestionRecord[] = []
  const usedTopics = new Map<AssessmentDomain, Set<string>>()

  for (const slot of blueprint) {
    const topics = usedTopics.get(slot.domain) ?? new Set<string>()
    const candidates = bank.filter(
      (q) =>
        q.active &&
        q.domain === slot.domain &&
        q.level === slot.level &&
        !chosen.some((picked) => picked.id === q.id),
    )
    const fresh = candidates.filter((q) => !topics.has(q.topic))
    const pool = fresh.length > 0 ? fresh : candidates
    if (pool.length === 0) {
      throw new Error(
        `문항 은행에 조건에 맞는 문항이 없습니다: ${slot.domain}/${slot.level}`,
      )
    }
    const picked = pool[Math.floor(rng() * pool.length)]
    chosen.push(picked)
    topics.add(picked.topic)
    usedTopics.set(slot.domain, topics)
  }
  return chosen
}

/** 화면에 내려보낼 문항으로 바꾼다. 정답·해설·난이도·주제를 빼고 보기 순서를 섞는다. 보기 ID는 그대로다. */
export function toPublicQuestion(
  record: QuestionRecord,
  rng: Rng,
): PublicQuestion {
  return {
    id: record.id,
    domain: record.domain,
    prompt: record.prompt,
    choices: shuffle(record.choices, rng).map((c) => ({
      id: c.id,
      label: c.label,
    })),
  }
}

/** 출제 하나를 만든다. 문항 순서와 보기 순서가 모두 섞이며, 만들어진 뒤에는 고정된다(저장은 저장소의 일). */
export function buildSession(
  bank: readonly QuestionRecord[],
  blueprint: readonly BlueprintSlot[],
  rng: Rng,
  sessionId: string,
): AssessmentSession {
  const picked = shuffle(pickQuestions(bank, blueprint, rng), rng)
  return {
    sessionId,
    questions: picked.map((record) => toPublicQuestion(record, rng)),
  }
}
