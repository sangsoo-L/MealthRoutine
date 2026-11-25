import {
  QUIZ_REWARD,
  SERVER_QUIZ_REWARD,
  type QuizRewardTiming,
} from './quizPolicy.ts'
import type { RewardEntry, RewardTotals } from './quizRepository.ts'
import {
  QUIZ_CATEGORIES,
  type QuizAnswerId,
  type QuizDomain,
  type QuizQuestion,
} from './quizTypes.ts'

export const QUIZ_DOMAIN_LABEL: Record<QuizDomain, string> = {
  exercise: '운동',
  meal: '식단',
}

/** 카테고리 한국어 이름. 목록에 없으면 영역 이름만 쓴다. */
export function categoryLabel(question: QuizQuestion): string {
  const spec = QUIZ_CATEGORIES.find(
    (item) => item.domain === question.domain && item.key === question.category,
  )
  return spec?.label ?? QUIZ_DOMAIN_LABEL[question.domain]
}

/**
 * 서버가 보낸 질문이 은행 문항과 같은지(공백 차이는 무시). 서버 질문이 없으면(로컬 모드) 확인하지 않는다.
 * 다르면 DB id → 은행 id 매핑이 어긋난 것이라, 화면은 제출을 막고 오류로 둔다.
 */
export function serverQuestionMatches(
  serverQuestion: string | undefined,
  bankQuestion: string,
): boolean {
  if (serverQuestion === undefined) return true
  const norm = (text: string) => text.replace(/\s+/g, ' ').trim()
  return norm(serverQuestion) === norm(bankQuestion)
}

/** 저장소 종류로 보상이 들어가는 방식을 정한다(서버 = 다음 날 정산). */
export function rewardTimingOf(repository: {
  kind: 'local' | 'server'
}): QuizRewardTiming {
  return repository.kind === 'server' ? 'nextDay' : 'instant'
}

/** 보상 안내 문구(정책 상수에서 만든다). 서버 모드는 다음 날 정산되는 실제 몫을 안내한다. */
export function rewardNotice(timing: QuizRewardTiming = 'instant'): string {
  if (timing === 'nextDay') {
    const { correct, wrong } = SERVER_QUIZ_REWARD
    return `맞히면 ${correct.points}PT·${correct.experience}XP, 틀려도 ${wrong.points}PT·${wrong.experience}XP를 받아요. 보상은 다음 날 00:05에 정산돼요.`
  }
  return `정답을 맞히면 ${QUIZ_REWARD.points}PT와 ${QUIZ_REWARD.experience}XP를 받아요.`
}

/** OX 선택지의 안내 글자. */
export const TRUE_FALSE_TEXT = { O: '맞아요', X: '아니에요' } as const

export interface AnswerChoice {
  id: QuizAnswerId
  text: string
}

/** 화면에 보일 선택지. 4지선다는 보기 4개(A~D), OX는 O·X 두 개다. */
export function answerChoices(question: QuizQuestion): AnswerChoice[] {
  return question.type === 'true_false'
    ? [
        { id: 'O', text: TRUE_FALSE_TEXT.O },
        { id: 'X', text: TRUE_FALSE_TEXT.X },
      ]
    : question.options.map((option) => ({ id: option.id, text: option.text }))
}

/** 정답을 한 줄로 보여 줄 글자(4지선다는 정답 보기 문장, OX는 서술문과 정답). */
export function correctAnswerText(question: QuizQuestion): string {
  if (question.type === 'true_false') {
    return `${question.question} → 정답은 ${question.correctAnswerId}(${TRUE_FALSE_TEXT[question.correctAnswerId]})예요.`
  }
  return (
    question.options.find((option) => option.id === question.correctAnswerId)
      ?.text ?? ''
  )
}

export type QuizOutcome = 'correct' | 'wrong'

export interface OptionMark {
  /** 글자로 알리는 표시(색에만 의존하지 않는다). 없으면 일반 보기. */
  tag: string | null
  tone: 'correct' | 'wrong' | 'plain'
}

/** 결과 화면의 보기 표시: 정답은 "정답", 내가 고른 오답은 "내가 고른 답"이다. 정답을 고른 경우 하나로 합쳐 "내가 고른 정답"이다. */
export function markOption(
  optionId: QuizAnswerId,
  selectedId: QuizAnswerId | null,
  correctId: QuizAnswerId,
): OptionMark {
  if (optionId === correctId) {
    return {
      tag: selectedId === optionId ? '내가 고른 정답' : '정답',
      tone: 'correct',
    }
  }
  if (optionId === selectedId) return { tag: '내가 고른 답', tone: 'wrong' }
  return { tag: null, tone: 'plain' }
}

export interface RewardSummary {
  /** 이번에 받은 보상 한 줄 */
  thisTime: string
  /** 누적 한 줄(보상 내역 기준) */
  cumulative: string
}

/** 이번 보상과 누적을 문구로 만든다. 값은 모두 보상 내역(rewardLedger)에서 온 것이다. */
export function summarizeReward(
  outcome: QuizOutcome,
  reward: RewardEntry | null,
  totals: RewardTotals,
  timing: QuizRewardTiming = 'instant',
): RewardSummary {
  if (timing === 'nextDay') {
    // 서버 모드: 이번 몫은 아직 지급 전(정산 예정), 아래 숫자는 지금까지 정산된 값
    return {
      thisTime: reward
        ? `정산 예정 ${reward.points}PT · ${reward.experience}XP (다음 날 00:05)`
        : '정산 예정 보상을 확인하지 못했어요',
      cumulative: `보유 ${totals.points}PT · 누적 ${totals.experience}XP (정산된 값)`,
    }
  }
  const thisTime = reward
    ? `이번 보상 ${reward.points}PT · ${reward.experience}XP`
    : outcome === 'correct'
      ? '이번 보상을 확인하지 못했어요'
      : '이번에는 보상이 없어요'
  return {
    thisTime,
    cumulative: `누적 ${totals.points}PT · ${totals.experience}XP`,
  }
}
