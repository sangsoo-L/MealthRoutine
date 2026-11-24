import { ApiError, apiRequest } from '../../api/http.ts'
import type {
  CompleteResult,
  DailyQuiz,
  QuizRepository,
  RewardEntry,
  RewardTotals,
} from '../quizRepository.ts'
import type { QuizAnswerId } from '../quizTypes.ts'
import { QUIZ_CODE_BY_DB_ID } from './quizIdMap.ts'

/** 백엔드 GET /quizzes/today 응답 */
interface TodayQuizResponse {
  quizId: number
  question: string
  topic: string | null
  questionType: string
  solved: boolean
  result: QuizResultResponse | null
}

/** 백엔드 POST /quizzes/today/attempt 응답 (정답을 맞혔는지, 정답, 해설) */
interface QuizResultResponse {
  correct: boolean
  answer: string
  explanation: string | null
}

interface MyRewardResponse {
  totalXp: number
  balance: number
}

/**
 * 하루 점수에 퀴즈가 더하는 몫(정답 10점·오답 5점). 보상은 다음 날 00:05 정산 때
 * 경험치 = 점수, 포인트 = 점수 ÷ 2로 들어간다. 화면에는 "이번 보상"으로 이 예정 몫을 보여 준다.
 */
const SCORE = { correct: 10, wrong: 5 }

function todayKst(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

/** 서버는 오답일 때 고른 답을 돌려주지 않아, 제출한 답을 이 브라우저에 기억해 둔다. */
function selectedKey(ownerId: string, localDate: string): string {
  return `mealthroutine.quizAnswer.${ownerId}.${localDate}`
}
function saveSelected(key: string, answer: QuizAnswerId): void {
  try {
    localStorage.setItem(key, answer)
  } catch {
    // 저장소를 못 쓰면 고른 답 표시만 빠진다
  }
}
function loadSelected(key: string): QuizAnswerId | null {
  try {
    return localStorage.getItem(key) as QuizAnswerId | null
  } catch {
    return null
  }
}

export function createServerQuizRepository(ownerId: string): QuizRepository {
  function toQuiz(
    r: TodayQuizResponse,
    localDate: string,
    selected: QuizAnswerId | null,
  ): DailyQuiz | null {
    const questionId = QUIZ_CODE_BY_DB_ID[r.quizId]
    if (!questionId) return null // 프론트 문제 은행에 없는 문항(OX)
    const done = r.solved && r.result !== null
    const answer = done
      ? (selected ??
        (r.result!.correct ? (r.result!.answer as QuizAnswerId) : null))
      : null
    return {
      id: `server-${r.quizId}-${localDate}`,
      ownerId,
      schemaVersion: 1,
      localDate,
      questionId,
      assignedAt: `${localDate}T00:00:00+09:00`,
      selectedAnswerId: answer,
      isCorrect: done ? r.result!.correct : null,
      completedAt: done ? new Date().toISOString() : null,
    }
  }

  function rewardFor(quiz: DailyQuiz): RewardEntry | null {
    if (!quiz.completedAt || quiz.isCorrect === null) return null
    const score = quiz.isCorrect ? SCORE.correct : SCORE.wrong
    return {
      transactionId: quiz.id,
      ownerId,
      schemaVersion: 1,
      rewardKey: `QUIZ:${quiz.localDate}`,
      rewardType: 'quiz',
      localDate: quiz.localDate,
      points: Math.floor(score / 2),
      experience: score,
      createdAt: quiz.completedAt,
    }
  }

  async function get(localDate: string): Promise<DailyQuiz | null> {
    if (localDate !== todayKst()) return null // 서버는 오늘의 퀴즈만 준다
    const r = await apiRequest<TodayQuizResponse>('GET', '/quizzes/today')
    return toQuiz(r, localDate, loadSelected(selectedKey(ownerId, localDate)))
  }

  return {
    kind: 'server',
    get,
    // 서버가 출제하므로 프론트의 재출제 방지 목록은 쓰지 않는다
    async listAnsweredQuestionIds() {
      return []
    },
    // 서버가 오늘의 문제를 이미 정했으므로, 화면이 고른 문항 대신 서버 문항을 돌려준다
    async assign(localDate) {
      const quiz = await get(localDate)
      if (!quiz) throw new Error('오늘의 퀴즈를 불러오지 못했습니다.')
      return { quiz, created: false }
    },
    async complete({ localDate, selectedAnswerId }): Promise<CompleteResult> {
      const key = selectedKey(ownerId, localDate)
      try {
        await apiRequest<QuizResultResponse>('POST', '/quizzes/today/attempt', {
          body: { answer: selectedAnswerId },
        })
        saveSelected(key, selectedAnswerId)
        const quiz = await get(localDate)
        if (!quiz) throw new Error('오늘의 퀴즈를 불러오지 못했습니다.')
        return { quiz, reward: rewardFor(quiz), alreadyCompleted: false }
      } catch (error) {
        if (
          error instanceof ApiError &&
          error.errorCode === 'QUIZ_ALREADY_ATTEMPTED'
        ) {
          const quiz = await get(localDate)
          if (quiz) return { quiz, reward: null, alreadyCompleted: true }
        }
        throw error
      }
    },
    async getReward(localDate) {
      const quiz = await get(localDate)
      return quiz ? rewardFor(quiz) : null
    },
    // 누적은 서버의 레벨·포인트 기준(포인트 잔액, 누적 경험치)
    async totals(): Promise<RewardTotals> {
      const r = await apiRequest<MyRewardResponse>('GET', '/users/me/rewards')
      return {
        points: r.balance,
        experience: r.totalXp,
        count: 0,
        skippedCount: 0,
      }
    },
  }
}
