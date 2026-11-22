import type { QuestionRecord } from './questionBank.ts'

/**
 * [개발 전용] Mock 문항 은행 무결성·품질 검사. 화면이나 출제 코드가 부르지 않는 도구이며, 문항을 고칠 때 한 번 돌려 본다
 * (저장소 밖의 검사 스크립트나 나중에 만들 단위 테스트가 부른다). React에 의존하지 않는 순수 함수다.
 *
 * 구조 검사(ID·보기·구성)뿐 아니라 "정답을 문장 길이만으로 맞힐 수 있는지" 같은 작성 품질도 숫자로 확인한다.
 * 기준값은 작성 기준(questionBank.ts 머리 설명)을 숫자로 옮긴 것이다.
 */

export const AUDIT_LIMITS = {
  /** 정답이 단독으로 가장 긴 보기인 문항의 비율 범위. 무작위라면 25% 안팎이다. */
  correctLongestRate: { min: 0.1, max: 0.4 },
  /** 정답이 단독으로 가장 짧은 보기인 문항의 비율 범위 */
  correctShortestRate: { min: 0.1, max: 0.4 },
  /** 정답 길이와 오답 평균 길이 차이(글자 수)의 문항 평균 절댓값 상한 */
  meanAbsLengthGap: 3,
  /** 한 문항 안에서 가장 긴 보기 / 가장 짧은 보기의 길이 비율 상한 */
  maxLengthRatio: 1.5,
  /** 질문 최대 글자 수. 대화체로 1~2문장을 쓰므로 여유를 둔다. */
  maxPromptLength: 70,
  /** 질문 최대 문장 수(마침표·물음표 기준) */
  maxPromptSentences: 2,
} as const

/** 정답이나 오답에 몰려 쓰이면 정답을 짐작하게 하는 단정어 */
const ABSOLUTE_WORDS = ['항상', '절대', '전혀', '무조건', '반드시', '오직']

/** 시험 문제처럼 읽히게 하는 질문 표현 */
const STIFF_PHRASES = [
  '가장 알맞은 것은',
  '알맞은 것은?',
  '옳은 것은',
  '올바른 것은',
  '해당하는 것은?',
  '고르시오',
  '무엇인가?',
]

/** 초보자에게 설명 없이 쓰면 이해를 가로막는 전문 용어 */
const JARGON = [
  '점진적 과부하',
  '인터벌',
  '쿨다운',
  '유산소',
  '근력운동',
  '중강도',
  '식이섬유',
  '총내용량',
  '영양성분표',
  '지연성',
  '대사',
  '혈당',
]

const len = (text: string) => [...text].length

export interface BankAudit {
  /** 어기면 안 되는 규칙 위반 목록. 비어 있어야 한다. */
  errors: string[]
  stats: {
    total: number
    byDomain: Record<string, number>
    byLevel: Record<string, number>
    topicsPerDomain: Record<string, number>
    correctLongestRate: number
    correctShortestRate: number
    meanAbsLengthGap: number
    maxLengthRatio: number
    longestPrompt: number
    correctPositionCounts: Record<string, number>
  }
}

export function auditQuestionBank(bank: readonly QuestionRecord[]): BankAudit {
  const errors: string[] = []
  const err = (message: string) => errors.push(message)

  // ── 구조 ──
  const ids = new Set<string>()
  const prompts = new Set<string>()
  for (const q of bank) {
    if (ids.has(q.id)) err(`문항 ID 중복: ${q.id}`)
    ids.add(q.id)
    if (prompts.has(q.prompt)) err(`질문 중복: ${q.id}`)
    prompts.add(q.prompt)
    if (q.choices.length !== 4) err(`${q.id}: 보기가 4개가 아님`)
    if (new Set(q.choices.map((c) => c.id)).size !== q.choices.length) {
      err(`${q.id}: 보기 ID 중복`)
    }
    if (new Set(q.choices.map((c) => c.label)).size !== q.choices.length) {
      err(`${q.id}: 보기 문장 중복`)
    }
    if (!q.choices.some((c) => c.id === q.correctChoiceId)) {
      err(`${q.id}: 정답 ID가 보기에 없음`)
    }
    if (q.explanation.trim().length < 20) err(`${q.id}: 해설이 너무 짧음`)
    if (!q.active)
      err(`${q.id}: 비활성 문항이 은행에 있음(이번 구성은 30개 모두 활성)`)
  }

  // ── 구성: 영역 15씩, 주제 5개 × 3문항, 두 종류 모두 주제 2개 이상 ──
  const byDomain: Record<string, number> = {}
  const byLevel: Record<string, number> = {}
  const topicsPerDomain: Record<string, number> = {}
  for (const q of bank) {
    byDomain[q.domain] = (byDomain[q.domain] ?? 0) + 1
    byLevel[`${q.domain}/${q.level}`] =
      (byLevel[`${q.domain}/${q.level}`] ?? 0) + 1
  }
  if (bank.length !== 30) err(`총 문항 수가 30이 아님: ${bank.length}`)
  for (const domain of ['exercise', 'meal']) {
    const qs = bank.filter((q) => q.domain === domain)
    if (qs.length !== 15) err(`${domain}: 15문항이 아님(${qs.length})`)
    const topics = new Map<string, number>()
    qs.forEach((q) => topics.set(q.topic, (topics.get(q.topic) ?? 0) + 1))
    topicsPerDomain[domain] = topics.size
    if (topics.size !== 5)
      err(`${domain}: 세부 주제가 5개가 아님(${topics.size})`)
    for (const [topic, count] of topics) {
      if (count !== 3) err(`${domain}/${topic}: 주제당 3문항이 아님(${count})`)
    }
    for (const level of ['basic', 'applied'] as const) {
      const levelTopics = new Set(
        qs.filter((q) => q.level === level).map((q) => q.topic),
      )
      if (levelTopics.size < 2) {
        err(
          `${domain}/${level}: 서로 다른 주제가 2개 미만이라 주제 중복 없이 뽑을 수 없음`,
        )
      }
    }
  }

  // ── 작성 품질 ──
  let longest = 0
  let shortest = 0
  let gapSum = 0
  let maxRatio = 0
  let longestPrompt = 0
  const positions: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 }
  for (const q of bank) {
    positions[q.correctChoiceId] = (positions[q.correctChoiceId] ?? 0) + 1
    const correct = q.choices.find((c) => c.id === q.correctChoiceId)
    const wrongs = q.choices.filter((c) => c.id !== q.correctChoiceId)
    if (!correct) continue
    const cl = len(correct.label)
    const wl = wrongs.map((c) => len(c.label))
    if (cl > Math.max(...wl)) longest += 1
    if (cl < Math.min(...wl)) shortest += 1
    gapSum += Math.abs(cl - wl.reduce((a, b) => a + b, 0) / wl.length)
    const all = [cl, ...wl]
    const ratio = Math.max(...all) / Math.min(...all)
    maxRatio = Math.max(maxRatio, ratio)
    if (ratio > AUDIT_LIMITS.maxLengthRatio) {
      err(`${q.id}: 보기 길이 차이가 큼(최장/최단 ${ratio.toFixed(2)})`)
    }
    // 대화체 규칙: 해요체 물음("…요?")으로 끝나고, 1~2문장이며, 딱딱한 시험 문구를 쓰지 않는다.
    if (!/요\?$/.test(q.prompt))
      err(`${q.id}: 질문이 해요체 물음(…요?)으로 끝나지 않음`)
    if (
      (q.prompt.match(/[.?!]/g) ?? []).length > AUDIT_LIMITS.maxPromptSentences
    ) {
      err(`${q.id}: 질문이 ${AUDIT_LIMITS.maxPromptSentences}문장을 넘음`)
    }
    for (const stiff of STIFF_PHRASES) {
      if (q.prompt.includes(stiff))
        err(`${q.id}: 딱딱한 시험 표현 "${stiff}" 사용`)
    }
    longestPrompt = Math.max(longestPrompt, len(q.prompt))
    if (len(q.prompt) > AUDIT_LIMITS.maxPromptLength) {
      err(`${q.id}: 질문이 ${AUDIT_LIMITS.maxPromptLength}자를 넘음`)
    }
    const text = [q.prompt, ...q.choices.map((c) => c.label)]
    if (text.some((t) => /[0-9]/.test(t)))
      err(`${q.id}: 숫자가 들어 있음(숫자를 외워야 하는 문항 방지)`)
    for (const word of ABSOLUTE_WORDS) {
      if (text.some((t) => t.includes(word)))
        err(`${q.id}: 단정어 "${word}" 사용`)
    }
    for (const word of JARGON) {
      if (text.some((t) => t.includes(word)))
        err(`${q.id}: 전문 용어 "${word}" 사용`)
    }
  }
  const total = bank.length || 1
  const longestRate = longest / total
  const shortestRate = shortest / total
  const meanGap = gapSum / total
  if (
    longestRate < AUDIT_LIMITS.correctLongestRate.min ||
    longestRate > AUDIT_LIMITS.correctLongestRate.max
  ) {
    err(
      `정답이 단독 최장 보기인 비율이 범위를 벗어남: ${(longestRate * 100).toFixed(0)}%`,
    )
  }
  if (
    shortestRate < AUDIT_LIMITS.correctShortestRate.min ||
    shortestRate > AUDIT_LIMITS.correctShortestRate.max
  ) {
    err(
      `정답이 단독 최단 보기인 비율이 범위를 벗어남: ${(shortestRate * 100).toFixed(0)}%`,
    )
  }
  if (meanGap > AUDIT_LIMITS.meanAbsLengthGap) {
    err(`정답과 오답 평균 길이 차이가 큼: ${meanGap.toFixed(1)}자`)
  }

  return {
    errors,
    stats: {
      total: bank.length,
      byDomain,
      byLevel,
      topicsPerDomain,
      correctLongestRate: longestRate,
      correctShortestRate: shortestRate,
      meanAbsLengthGap: meanGap,
      maxLengthRatio: maxRatio,
      longestPrompt,
      correctPositionCounts: positions,
    },
  }
}
