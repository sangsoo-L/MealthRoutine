import type { QuizDifficulty } from './quizTypes.ts'

/**
 * 개발 환경용 임시 보상 정책(사용자 승인): 정답 10PT + 10XP, 오답 0. 계정당 하루 최대 1회.
 * 프론트엔드 전용 보상은 조작할 수 있으므로 실제 서비스에서 신뢰할 수 있는 재화로 쓰지 않는다. 레벨업 계산은 확정되지 않아 XP는 누적만 한다.
 */
export const QUIZ_REWARD = { points: 10, experience: 10 } as const

/**
 * 서버 모드의 퀴즈 보상 몫. 퀴즈는 하루 점수에 정답 10점·오답 5점을 더하고,
 * 다음 날 00:05 정산 때 경험치 = 점수, 포인트 = 점수 ÷ 2(소수점 버림)로 들어간다.
 */
export const SERVER_QUIZ_REWARD = {
  correct: { points: 5, experience: 10 },
  wrong: { points: 2, experience: 5 },
} as const

/** 보상이 들어가는 방식: 개발용 로컬 저장소는 바로, 서버는 다음 날 정산 */
export type QuizRewardTiming = 'instant' | 'nextDay'

export const QUIZ_REWARD_TYPE = 'daily-quiz' as const

/** 보상 키: 계정·날짜·퀴즈 유형 기준(하루 한 번). */
export function rewardKeyFor(localDate: string): string {
  return `quiz:${localDate}`
}

/** 지식 수준별 난이도 비율(%): [초급, 중급, 고급]. 운동·식단 수준을 영역별로 따로 적용하고 수준을 모르면 초급으로 본다. */
export const DIFFICULTY_WEIGHTS: Record<
  QuizDifficulty,
  readonly [number, number, number]
> = {
  beginner: [70, 25, 5],
  intermediate: [30, 50, 20],
  advanced: [10, 30, 60],
}

export const DIFFICULTY_ORDER: readonly QuizDifficulty[] = [
  'beginner',
  'intermediate',
  'advanced',
]
