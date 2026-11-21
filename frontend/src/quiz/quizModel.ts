import {
  isIsoTimestamp,
  isLocalDate,
  isValidOwnerId,
} from '../exercise/workoutModel.ts'
import { QUIZ_REWARD, QUIZ_REWARD_TYPE, rewardKeyFor } from './quizPolicy.ts'
import type { DailyQuiz, RewardEntry } from './quizRepository.ts'
import {
  QUIZ_OPTION_IDS,
  TRUE_FALSE_ANSWERS,
  type QuizAnswerId,
  type QuizOptionId,
  type QuizQuestion,
  type TrueFalseAnswer,
} from './quizTypes.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isOptionId(value: unknown): value is QuizOptionId {
  return (
    typeof value === 'string' &&
    (QUIZ_OPTION_IDS as readonly string[]).includes(value)
  )
}

export function isTrueFalseAnswer(value: unknown): value is TrueFalseAnswer {
  return (
    typeof value === 'string' &&
    (TRUE_FALSE_ANSWERS as readonly string[]).includes(value)
  )
}

/** 4지선다(A~D) 또는 OX(O·X)의 응답·정답 값. */
export function isAnswerId(value: unknown): value is QuizAnswerId {
  return isOptionId(value) || isTrueFalseAnswer(value)
}

/** 선택 값이 이 문항 유형의 선택지인가(4지선다 문항에 O·X를 낼 수 없다). */
export function isChoiceOf(
  question: QuizQuestion,
  selected: unknown,
): selected is QuizAnswerId {
  return question.type === 'true_false'
    ? isTrueFalseAnswer(selected)
    : isOptionId(selected)
}

/** 정답 여부. 선택 값이 이 문항 유형의 선택지가 아니면 null(채점하지 않는다). */
export function gradeAnswer(
  question: QuizQuestion,
  selected: unknown,
): boolean | null {
  return isChoiceOf(question, selected)
    ? selected === question.correctAnswerId
    : null
}

function nonEmpty(value: unknown, max: number): value is string {
  return typeof value === 'string' && value !== '' && value.length <= max
}

/** 저장소에서 읽은 퀴즈 행. 모양이 맞지 않으면 null(손상). 응시 전·후 상태의 일관성도 확인한다. */
export function parseDailyQuiz(raw: unknown): DailyQuiz | null {
  if (!isRecord(raw)) return null
  if (
    raw.schemaVersion !== 1 ||
    !nonEmpty(raw.id, 100) ||
    !isValidOwnerId(raw.ownerId) ||
    !isLocalDate(raw.localDate) ||
    !nonEmpty(raw.questionId, 30) ||
    !isIsoTimestamp(raw.assignedAt)
  ) {
    return null
  }
  const done = raw.completedAt !== null
  if (done) {
    if (
      !isIsoTimestamp(raw.completedAt) ||
      !isAnswerId(raw.selectedAnswerId) ||
      typeof raw.isCorrect !== 'boolean'
    ) {
      return null
    }
  } else if (raw.selectedAnswerId !== null || raw.isCorrect !== null) {
    return null
  }
  return raw as unknown as DailyQuiz
}

/** 저장소에서 읽은 보상 내역. 모양이 맞지 않으면 null. */
export function parseRewardEntry(raw: unknown): RewardEntry | null {
  if (!isRecord(raw)) return null
  if (
    raw.schemaVersion !== 1 ||
    !nonEmpty(raw.transactionId, 100) ||
    !isValidOwnerId(raw.ownerId) ||
    !nonEmpty(raw.rewardKey, 100) ||
    !nonEmpty(raw.rewardType, 50) ||
    !isLocalDate(raw.localDate) ||
    typeof raw.points !== 'number' ||
    !Number.isInteger(raw.points) ||
    raw.points < 0 ||
    typeof raw.experience !== 'number' ||
    !Number.isInteger(raw.experience) ||
    raw.experience < 0 ||
    !isIsoTimestamp(raw.createdAt)
  ) {
    return null
  }
  return raw as unknown as RewardEntry
}

export function newDailyQuiz(params: {
  id: string
  ownerId: string
  localDate: string
  questionId: string
  now: Date
}): DailyQuiz {
  return {
    id: params.id,
    ownerId: params.ownerId,
    schemaVersion: 1,
    localDate: params.localDate,
    questionId: params.questionId,
    assignedAt: params.now.toISOString(),
    selectedAnswerId: null,
    isCorrect: null,
    completedAt: null,
  }
}

export function newRewardEntry(params: {
  transactionId: string
  ownerId: string
  localDate: string
  now: Date
}): RewardEntry {
  return {
    transactionId: params.transactionId,
    ownerId: params.ownerId,
    schemaVersion: 1,
    rewardKey: rewardKeyFor(params.localDate),
    rewardType: QUIZ_REWARD_TYPE,
    localDate: params.localDate,
    points: QUIZ_REWARD.points,
    experience: QUIZ_REWARD.experience,
    createdAt: params.now.toISOString(),
  }
}
