import { accountScopedKey } from '../auth/accountScope.ts'
import type { AssessmentSession } from './assessmentTypes.ts'

/**
 * 이해도 확인의 진행 상태(응답·현재 문항) 임시 저장. 새로고침해도 응답을 복구하려는 화면 쪽 저장이다.
 *
 * - 계정별 키(accountScopedKey)로만 sessionStorage에 저장한다. 로그인·로그아웃이 이 접두어 키를 모두 지우므로
 *   로그아웃하면 진행 상태가 정리되고, 다른 계정의 응답을 다시 쓰지 않는다. (auth/accountScope.ts의 규약)
 * - 저장된 값은 현재 출제(sessionId, 문항, 보기)와 맞는 것만 복구한다. 맞지 않거나 손상된 값은 버린다.
 * - 정답 정보는 화면에 없으므로 여기에도 없다. 저장하는 것은 사용자가 고른 보기 ID뿐이다.
 * - 저장소를 쓸 수 없는 환경(사생활 보호 모드 등)에서는 조용히 건너뛰고 화면은 메모리 상태로만 동작한다.
 */

const DRAFT_NAME = 'assessment.draft'
const DRAFT_VERSION = 1

export interface AssessmentDraft {
  v: typeof DRAFT_VERSION
  sessionId: string
  /** 안내 화면을 지나 문항을 시작했는지 */
  started: boolean
  /** 현재 문항 위치(0부터) */
  index: number
  answers: Record<string, string>
}

/** sessionStorage와 같은 모양의 최소 저장소. 테스트에서 대체할 수 있다. */
export interface DraftStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

function defaultStorage(): DraftStorage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

/**
 * 저장된 값을 현재 출제에 맞게 검증해 돌려준다. 순수 함수다.
 * sessionId가 다르거나, 문항에 없는 문항 ID·보기 ID가 있거나, 위치가 범위를 벗어나면 null이다.
 */
export function sanitizeDraft(
  raw: unknown,
  session: AssessmentSession,
): AssessmentDraft | null {
  if (typeof raw !== 'object' || raw === null) return null
  const value = raw as Record<string, unknown>
  if (value.v !== DRAFT_VERSION || value.sessionId !== session.sessionId) {
    return null
  }
  if (typeof value.started !== 'boolean') return null
  const total = session.questions.length
  if (
    typeof value.index !== 'number' ||
    !Number.isInteger(value.index) ||
    value.index < 0 ||
    value.index >= total
  ) {
    return null
  }
  if (typeof value.answers !== 'object' || value.answers === null) return null

  const answers: Record<string, string> = {}
  for (const [questionId, choiceId] of Object.entries(value.answers)) {
    const question = session.questions.find((q) => q.id === questionId)
    if (
      !question ||
      typeof choiceId !== 'string' ||
      !question.choices.some((c) => c.id === choiceId)
    ) {
      return null
    }
    answers[questionId] = choiceId
  }
  // 문항은 앞에서부터 답해야 넘어갈 수 있으므로 현재 위치는 첫 미응답 문항을 넘을 수 없다.
  // 어긋난 값(응답 없이 뒤쪽 문항에 있음)은 마지막 문항에서 제출이 조용히 막히는 원인이 되므로 버린다.
  const firstUnanswered = session.questions.findIndex(
    (q) => answers[q.id] === undefined,
  )
  if (firstUnanswered !== -1 && value.index > firstUnanswered) return null
  return {
    v: DRAFT_VERSION,
    sessionId: session.sessionId,
    started: value.started,
    index: value.index,
    answers,
  }
}

export function loadDraft(
  userId: string,
  session: AssessmentSession,
  storage: DraftStorage | null = defaultStorage(),
): AssessmentDraft | null {
  if (!storage) return null
  try {
    const text = storage.getItem(accountScopedKey(userId, DRAFT_NAME))
    if (text === null) return null
    return sanitizeDraft(JSON.parse(text), session)
  } catch {
    return null
  }
}

export function saveDraft(
  userId: string,
  draft: Omit<AssessmentDraft, 'v'>,
  storage: DraftStorage | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    storage.setItem(
      accountScopedKey(userId, DRAFT_NAME),
      JSON.stringify({ v: DRAFT_VERSION, ...draft }),
    )
  } catch {
    // 저장하지 못해도 화면은 메모리 상태로 계속 동작한다.
  }
}

export function clearDraft(
  userId: string,
  storage: DraftStorage | null = defaultStorage(),
): void {
  if (!storage) return
  try {
    storage.removeItem(accountScopedKey(userId, DRAFT_NAME))
  } catch {
    // 지울 수 없으면 지울 데이터도 없다.
  }
}
