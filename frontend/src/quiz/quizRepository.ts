import type { QuizAnswerId } from './quizTypes.ts'

/**
 * 알아가기 퀴즈 저장소(H02). 계정 id로 만들며 모든 조회·쓰기는 그 계정의 기록만 다룬다(다른 계정의 기록은 "없음"과 같다).
 * 응시 완료와 보상 지급은 한 트랜잭션에서 확정하고, 보상 내역(rewardLedger)이 보상의 유일한 근거다.
 * 오류는 다른 로컬 저장소와 같은 WorkoutStoreError를 던진다. 지금 구현은 개발 서버 전용 IndexedDB다.
 */

export interface DailyQuiz {
  id: string
  ownerId: string
  schemaVersion: 1
  localDate: string
  questionId: string
  assignedAt: string
  /** 응시 전에는 null */
  /** 4지선다는 A~D, OX는 O·X. */
  selectedAnswerId: QuizAnswerId | null
  isCorrect: boolean | null
  completedAt: string | null
}

export interface RewardEntry {
  transactionId: string
  ownerId: string
  schemaVersion: 1
  rewardKey: string
  rewardType: string
  localDate: string
  points: number
  experience: number
  createdAt: string
}

export interface CompleteResult {
  quiz: DailyQuiz
  /** 이번 퀴즈가 지급한 보상(정답일 때만). 오답이거나 지급 내역이 없으면 null이다. */
  reward: RewardEntry | null
  /** 이미 완료된 퀴즈라 아무것도 바꾸지 않았다(재응시·재보상 불가). */
  alreadyCompleted: boolean
}

export interface RewardTotals {
  points: number
  experience: number
  /** 지급 내역 수 */
  count: number
  /** 읽을 수 없어 건너뛴 내역 수 */
  skippedCount: number
}

export interface QuizRepository {
  readonly kind: 'local' | 'server'
  get(localDate: string): Promise<DailyQuiz | null>
  /** 이 계정이 완료한 모든 퀴즈의 문항 id(재출제 방지용). */
  listAnsweredQuestionIds(): Promise<string[]>
  /** 그 날짜의 출제를 확정한다. 이미 있으면 기존 출제를 그대로 돌려준다(문제는 바뀌지 않는다). */
  assign(
    localDate: string,
    questionId: string,
  ): Promise<{ quiz: DailyQuiz; created: boolean }>
  /**
   * 답안을 제출한다. 완료 기록과(정답이면) 보상 내역을 같은 트랜잭션에서 쓴다. 이미 완료한 날은 아무것도 바꾸지 않는다.
   * 출제가 없으면 notFound, 선택지 id가 올바르지 않거나 정답과 같은 유형(A~D 또는 O·X)이 아니면 validation이다.
   */
  complete(input: {
    localDate: string
    selectedAnswerId: QuizAnswerId
    correctAnswerId: QuizAnswerId
  }): Promise<CompleteResult>
  getReward(localDate: string): Promise<RewardEntry | null>
  /** 보상 내역(rewardLedger) 기준 누적 PT·XP. 화면 숫자를 따로 늘리지 않는다. */
  totals(): Promise<RewardTotals>
}
