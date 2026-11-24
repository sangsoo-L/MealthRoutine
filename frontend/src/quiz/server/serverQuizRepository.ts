import { ApiError, apiRequest } from '../../api/http.ts'
import { SERVER_QUIZ_REWARD } from '../quizPolicy.ts'
import {
  QuizDayChangedError,
  type CompleteResult,
  type DailyQuiz,
  type QuizRepository,
  type RewardEntry,
  type RewardTotals,
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
      serverQuestion: r.question, // 은행 문항과 같은지 화면에서 확인한다
    }
  }

  function rewardFor(quiz: DailyQuiz): RewardEntry | null {
    if (!quiz.completedAt || quiz.isCorrect === null) return null
    // 다음 날 00:05 정산 때 들어갈 퀴즈 몫(정산 예정 값)
    const share = quiz.isCorrect
      ? SERVER_QUIZ_REWARD.correct
      : SERVER_QUIZ_REWARD.wrong
    return {
      transactionId: quiz.id,
      ownerId,
      schemaVersion: 1,
      rewardKey: `QUIZ:${quiz.localDate}`,
      rewardType: 'quiz',
      localDate: quiz.localDate,
      points: share.points,
      experience: share.experience,
      createdAt: quiz.completedAt,
    }
  }

  // 날짜별로 화면에 띄운 서버 문제 id(제출할 때 같은 문제인지 서버가 확인한다)
  const shownQuizId = new Map<string, number>()

  async function get(localDate: string): Promise<DailyQuiz | null> {
    if (localDate !== todayKst()) return null // 서버는 오늘의 퀴즈만 준다
    const r = await apiRequest<TodayQuizResponse>('GET', '/quizzes/today')
    shownQuizId.set(localDate, r.quizId)
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
      // 자정을 넘겼으면 어제 문제의 답을 보내지 않는다(서버가 오늘 문제로 채점하게 된다)
      if (localDate !== todayKst()) throw new QuizDayChangedError()
      try {
        await apiRequest<QuizResultResponse>('POST', '/quizzes/today/attempt', {
          body: {
            answer: selectedAnswerId,
            questionId: shownQuizId.get(localDate),
          },
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
        // 요청 중에 자정이 지나 서버의 오늘 문제가 바뀜 → 채점하지 않고 거절됨
        if (error instanceof ApiError && error.errorCode === 'QUIZ_CHANGED')
          throw new QuizDayChangedError()
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
