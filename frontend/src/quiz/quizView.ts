import { QUIZ_REWARD } from './quizPolicy.ts'
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

/** 정답일 때 받는 보상 안내 문구(정책 상수에서 만든다). */
export function rewardNotice(): string {
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
): RewardSummary {
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
