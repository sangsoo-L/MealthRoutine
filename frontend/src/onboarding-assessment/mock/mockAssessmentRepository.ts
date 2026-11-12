import { accountScopedKey } from '../../auth/accountScope.ts'
import {
  AssessmentSubmitError,
  type AssessmentRepository,
} from '../assessmentRepository.ts'
import type {
  AssessmentAnswers,
  AssessmentAttempt,
  AssessmentLevelCode,
  AssessmentResult,
  AssessmentSession,
  PublicChoice,
  PublicQuestion,
} from '../assessmentTypes.ts'
import {
  QUESTION_BANK,
  QUESTION_BANK_VERSION,
  type QuestionRecord,
} from './questionBank.ts'
import { gradeByDomain } from './scoring.ts'
import {
  MOCK_BLUEPRINT,
  buildSession,
  type BlueprintSlot,
  type Rng,
} from './selection.ts'

/**
 * [개발 전용] 운동·식단 이해도 확인 Mock 저장소. 서버가 맡을 출제·채점·결과 저장을 개발 환경에서 흉내 낸다.
 * 개발 서버에서만 불러오며(assessmentSource.ts) 운영 빌드에는 포함되지 않는다.
 *
 * - 출제와 결과는 계정별 키(accountScopedKey)로 sessionStorage에 둔다. 다른 계정의 출제·결과를 읽지 않고,
 *   로그인·로그아웃이 이 접두어 키를 지우므로 Mock에서는 로그아웃하면 응시 기록도 사라진다(실제 서비스는 서버가 보관).
 * - 출제는 한 번 만들면 저장해 두고 같은 출제를 다시 돌려준다(새로고침해도 문항·보기 순서 고정).
 *   저장하는 것은 화면에 내려간 문항(정답 없음)뿐이다. 채점할 때만 문항 은행의 정답을 조회한다.
 * - 제출은 멱등이다. 이미 완료했거나 같은 출제가 채점 중이면 다시 채점하지 않고 같은 결과를 돌려준다.
 * - 네트워크 지연을 흉내 내려고 짧은 지연을 둔다(중복 제출·로딩 상태를 실제처럼 확인하기 위함).
 * - 저장한 출제·결과에는 문항 은행 버전(QUESTION_BANK_VERSION)을 함께 남긴다. 버전이 다르면(문항을 고친 뒤) 저장된 출제와
 *   결과를 "없는 것"으로 보고 새로 시작한다. 이전 문항으로 만든 진행 상태가 새 문항과 어긋나는 일을 막는다.
 *   진행 상태(draft)는 출제 ID에 묶여 있어 출제가 바뀌면 함께 버려진다.
 * - 저장소에서 읽은 값은 외부 입력으로 보고, 문항 은행과 맞는 필드만 골라 새 객체로 돌려준다(남는 필드를 그대로 넘기지 않는다).
 */

const SESSION_NAME = 'assessment.mock.session'
const RESULT_NAME = 'assessment.mock.result'

interface MockStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export interface MockAssessmentOptions {
  userId: string
  /** 기본은 sessionStorage. 쓸 수 없으면 메모리에만 둔다. 테스트에서 대체할 수 있다. */
  storage?: MockStorage | null
  rng?: Rng
  bank?: readonly QuestionRecord[]
  blueprint?: readonly BlueprintSlot[]
  /** 응답 지연(ms). 기본 300 */
  latencyMs?: number
  now?: () => Date
  newSessionId?: () => string
  /** 실제로 채점할 때마다 호출된다(중복 채점 방지를 검증하려는 테스트용) */
  onGrade?: () => void
  /** 문항 은행 버전. 기본은 QUESTION_BANK_VERSION이며 테스트에서 버전 불일치를 만들 때 쓴다. */
  bankVersion?: number
}

function defaultStorage(): MockStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function defaultSessionId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  }
}

const LEVEL_CODES: readonly AssessmentLevelCode[] = [
  'beginner',
  'intermediate',
  'advanced',
]

/**
 * 저장된 출제가 문항 은행·구성과 맞는지 확인하고, 맞으면 검증한 필드만 복사한 출제를 돌려준다. 맞지 않으면 null(새로 출제한다).
 * 은행 버전, 문항 ID·영역·질문 문장, 보기 ID·문장(중복 없음), 영역별 문항 수가 모두 현재 은행·청사진과 같아야 한다.
 */
function parseSession(
  raw: unknown,
  bank: readonly QuestionRecord[],
  blueprint: readonly BlueprintSlot[],
  bankVersion: number,
): AssessmentSession | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as {
    bankVersion?: unknown
    sessionId?: unknown
    questions?: unknown
  }
  if (value.bankVersion !== bankVersion) return null
  if (typeof value.sessionId !== 'string' || value.sessionId === '') return null
  if (!Array.isArray(value.questions)) return null
  if (value.questions.length !== blueprint.length) return null

  const seen = new Set<string>()
  const domainCounts: Record<string, number> = {}
  const questions: PublicQuestion[] = []
  for (const q of value.questions as unknown[]) {
    if (typeof q !== 'object' || q === null) return null
    const item = q as {
      id?: unknown
      domain?: unknown
      prompt?: unknown
      choices?: unknown
    }
    const record = bank.find((r) => r.id === item.id)
    if (
      !record ||
      record.domain !== item.domain ||
      record.prompt !== item.prompt ||
      seen.has(record.id)
    ) {
      return null
    }
    seen.add(record.id)
    domainCounts[record.domain] = (domainCounts[record.domain] ?? 0) + 1
    if (
      !Array.isArray(item.choices) ||
      item.choices.length !== record.choices.length
    ) {
      return null
    }
    const choiceIds = new Set<string>()
    const choices: PublicChoice[] = []
    for (const c of item.choices as unknown[]) {
      if (typeof c !== 'object' || c === null) return null
      const choice = c as { id?: unknown; label?: unknown }
      const known = record.choices.find(
        (rc) => rc.id === choice.id && rc.label === choice.label,
      )
      if (!known || choiceIds.has(known.id)) return null
      choiceIds.add(known.id)
      choices.push({ id: known.id, label: known.label })
    }
    questions.push({
      id: record.id,
      domain: record.domain,
      prompt: record.prompt,
      choices,
    })
  }
  for (const slot of blueprint) {
    domainCounts[slot.domain] = (domainCounts[slot.domain] ?? 0) - 1
  }
  if (Object.values(domainCounts).some((n) => n !== 0)) return null
  return { sessionId: value.sessionId, questions }
}

/** 저장된 결과가 현재 은행 버전의 것이고 모양이 맞으면 검증한 필드만 복사해 돌려준다. 아니면 null. */
function parseResult(
  raw: unknown,
  bankVersion: number,
): AssessmentResult | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  if (
    v.bankVersion !== bankVersion ||
    typeof v.sessionId !== 'string' ||
    typeof v.completedAt !== 'string' ||
    !LEVEL_CODES.includes(v.exercise as AssessmentLevelCode) ||
    !LEVEL_CODES.includes(v.meal as AssessmentLevelCode)
  ) {
    return null
  }
  return {
    sessionId: v.sessionId,
    exercise: v.exercise as AssessmentLevelCode,
    meal: v.meal as AssessmentLevelCode,
    completedAt: v.completedAt,
  }
}

export function createMockAssessmentRepository(
  options: MockAssessmentOptions,
): AssessmentRepository {
  const {
    userId,
    rng = Math.random,
    bank = QUESTION_BANK,
    blueprint = MOCK_BLUEPRINT,
    latencyMs = 300,
    now = () => new Date(),
    newSessionId = defaultSessionId,
    onGrade,
    bankVersion = QUESTION_BANK_VERSION,
  } = options
  const storage =
    options.storage === undefined ? defaultStorage() : options.storage

  // 저장소를 쓸 수 없을 때를 위한 메모리 대체. 쓰기가 실패한 키는 읽을 때도 메모리를 본다(쓰기만 실패하고 읽기는 되는 환경 대응).
  const memory = new Map<string, string>()
  const memoryOnly = new Set<string>()
  const sessionKey = accountScopedKey(userId, SESSION_NAME)
  const resultKey = accountScopedKey(userId, RESULT_NAME)

  function read(key: string): unknown {
    let text: string | null = null
    try {
      text =
        storage && !memoryOnly.has(key)
          ? storage.getItem(key)
          : (memory.get(key) ?? null)
    } catch {
      text = memory.get(key) ?? null
    }
    if (text === null) return null
    try {
      return JSON.parse(text)
    } catch {
      return null
    }
  }

  function write(key: string, value: unknown): void {
    const text = JSON.stringify(value)
    memory.set(key, text)
    memoryOnly.delete(key)
    try {
      storage?.setItem(key, text)
    } catch {
      // 저장하지 못하면 메모리 값만 쓴다(읽을 때도 메모리를 본다).
      memoryOnly.add(key)
    }
  }

  const delay = () =>
    latencyMs > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, latencyMs))
      : Promise.resolve()

  const readResult = () => parseResult(read(resultKey), bankVersion)
  const readSession = () =>
    parseSession(read(sessionKey), bank, blueprint, bankVersion)

  /** 같은 출제가 채점 중이면 그 요청을 공유해 동시에 두 번 채점하지 않는다. */
  const inFlight = new Map<string, Promise<AssessmentResult>>()

  return {
    kind: 'mock',

    async getResult(): Promise<AssessmentResult | null> {
      await delay()
      // 읽기만 한다. 출제를 만들거나 저장하지 않는다.
      return readResult()
    },

    async loadAttempt(): Promise<AssessmentAttempt> {
      await delay()
      // 지연 뒤의 확인·생성·저장은 중간에 await가 없어 한 번에 일어난다(동시에 두 번 불러도 출제는 하나다).
      const result = readResult()
      if (result) return { state: 'completed', result }
      let session = readSession()
      if (!session) {
        session = buildSession(bank, blueprint, rng, newSessionId())
        write(sessionKey, { bankVersion, ...session })
      }
      return { state: 'open', session }
    },

    submit(
      sessionId: string,
      answers: AssessmentAnswers,
    ): Promise<AssessmentResult> {
      const pending = inFlight.get(sessionId)
      if (pending) return pending

      const task = (async () => {
        await delay()
        // 완료한 응시는 다시 채점하지 않고 저장된 결과를 돌려준다.
        const existing = readResult()
        if (existing) return existing

        const session = readSession()
        if (!session || session.sessionId !== sessionId) {
          throw new AssessmentSubmitError('unknown-session')
        }
        const records: QuestionRecord[] = []
        for (const question of session.questions) {
          const record = bank.find((r) => r.id === question.id)
          if (!record) throw new AssessmentSubmitError('unknown-session')
          const choiceId = answers[question.id]
          if (choiceId === undefined)
            throw new AssessmentSubmitError('incomplete')
          if (!question.choices.some((c) => c.id === choiceId)) {
            throw new AssessmentSubmitError('invalid-answer')
          }
          records.push(record)
        }

        onGrade?.()
        const levels = gradeByDomain(records, answers)
        const result: AssessmentResult = {
          sessionId,
          exercise: levels.exercise,
          meal: levels.meal,
          completedAt: now().toISOString(),
        }
        write(resultKey, { bankVersion, ...result })
        return result
      })().finally(() => {
        inFlight.delete(sessionId)
      })

      inFlight.set(sessionId, task)
      return task
    },
  }
}
