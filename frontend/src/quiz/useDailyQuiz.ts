import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadKnowledgeLevels } from '../mypage/knowledgeSource.ts'
import { loadQuizBank } from './quizBank.ts'
import type {
  DailyQuiz,
  QuizRepository,
  RewardEntry,
  RewardTotals,
} from './quizRepository.ts'
import { pickQuestion, secureRandom } from './quizSelect.ts'
import { createQuizRepository } from './quizSource.ts'
import type {
  QuizDifficulty,
  QuizDomain,
  QuizAnswerId,
  QuizQuestion,
} from './quizTypes.ts'

export interface DailyQuizReady {
  status: 'ready'
  repository: QuizRepository
  localDate: string
  question: QuizQuestion
  quiz: DailyQuiz
  /** 오늘 지급한 보상(보상 내역 기준). 응시 전이거나 오답이면 null이다. */
  reward: RewardEntry | null
  /** 보상 내역 기준 누적 PT·XP */
  totals: RewardTotals
}

export type DailyQuizState =
  | { status: 'loading' }
  /** 이 빌드에는 저장 수단이 연결되어 있지 않다(운영 빌드). */
  | { status: 'unavailable' }
  /** 낼 수 있는(검증된) 문제가 없다. */
  | { status: 'preparing' }
  | { status: 'error' }
  | DailyQuizReady

type Tiers = Record<QuizDomain, QuizDifficulty | null>

/** 지식 수준을 읽지 못하면(저장소 없음·읽기 실패) 모름(초급 정책)으로 본다. 퀴즈 출제가 이 조회 실패로 막히지 않게 한다. */
async function loadTiers(userId: string): Promise<Tiers> {
  try {
    const levels = await loadKnowledgeLevels(userId)
    return {
      exercise: levels?.exercise?.tier ?? null,
      meal: levels?.meal?.tier ?? null,
    }
  } catch {
    return { exercise: null, meal: null }
  }
}

async function loadState(
  userId: string,
  localDate: string,
): Promise<DailyQuizState> {
  const repository = createQuizRepository(userId)
  if (!repository) return { status: 'unavailable' }
  const bank = await loadQuizBank()
  if (bank.length === 0) return { status: 'preparing' }

  let quiz = await repository.get(localDate)
  if (!quiz) {
    const [answered, tiers] = await Promise.all([
      repository.listAnsweredQuestionIds(),
      loadTiers(userId),
    ])
    const picked = pickQuestion({
      bank,
      tiers,
      answeredIds: new Set(answered),
      random: secureRandom,
    })
    if (!picked) return { status: 'preparing' }
    // 다른 탭이 먼저 출제했다면 assign은 그 출제를 돌려준다(문제는 바뀌지 않는다).
    quiz = (await repository.assign(localDate, picked.id)).quiz
  }
  const question = bank.find((item) => item.id === quiz.questionId)
  // 출제된 문항을 은행에서 찾지 못하면 다른 문제로 바꾸지 않고 오류로 둔다.
  if (!question) return { status: 'error' }
  const [reward, totals] = await Promise.all([
    quiz.completedAt ? repository.getReward(localDate) : Promise.resolve(null),
    repository.totals(),
  ])
  return {
    status: 'ready',
    repository,
    localDate,
    question,
    quiz,
    reward,
    totals,
  }
}

interface Loaded {
  key: string
  state: DailyQuizState
}

/**
 * 오늘의 퀴즈(H02) 상태. 계정·날짜가 바뀌면 다시 불러오며, 출제는 그 날 처음 들어올 때 한 번 확정해 저장한다.
 * 제출은 한 번만 진행되고(진행 중 중복 호출 무시) 보상은 저장소가 같은 트랜잭션에서 한 번만 지급한다.
 */
export function useDailyQuiz(userId: string | null, localDate: string) {
  const key = userId ? `${userId}|${localDate}` : ''
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  const submittingRef = useRef(false)

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    loadState(userId, localDate).then(
      (state) => {
        if (!cancelled) setLoaded({ key, state })
      },
      () => {
        if (!cancelled) setLoaded({ key, state: { status: 'error' } })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, localDate, key, attempt])

  const state = useMemo<DailyQuizState>(
    () => (loaded && loaded.key === key ? loaded.state : { status: 'loading' }),
    [loaded, key],
  )

  const reload = useCallback(() => {
    setLoaded(null)
    setAttempt((value) => value + 1)
  }, [])

  const submit = useCallback(
    async (selectedAnswerId: QuizAnswerId) => {
      if (submittingRef.current) return
      if (state.status !== 'ready' || state.quiz.completedAt) return
      submittingRef.current = true
      setSubmitting(true)
      setSubmitFailed(false)
      try {
        const result = await state.repository.complete({
          localDate: state.localDate,
          selectedAnswerId,
          correctAnswerId: state.question.correctAnswerId,
        })
        const [reward, totals] = await Promise.all([
          result.reward
            ? Promise.resolve(result.reward)
            : state.repository.getReward(state.localDate),
          state.repository.totals(),
        ])
        setLoaded({
          key,
          state: { ...state, quiz: result.quiz, reward, totals },
        })
      } catch {
        setSubmitFailed(true)
      } finally {
        submittingRef.current = false
        setSubmitting(false)
      }
    },
    [state, key],
  )

  return { state, reload, submit, submitting, submitFailed }
}

/**
 * 오늘의 퀴즈를 이미 마쳤는지만 조회한다(홈 카드 표시용). 출제를 만들지 않으며,
 * 저장소가 없거나 읽기에 실패하면 마치지 않은 것으로 본다(카드를 숨기지 않는다).
 */
export function useTodayQuizCompleted(
  userId: string | null,
  localDate: string,
): boolean {
  const key = userId ? `${userId}|${localDate}` : ''
  const [done, setDone] = useState<{ key: string; value: boolean } | null>(null)
  useEffect(() => {
    if (!userId) return undefined
    const repository = createQuizRepository(userId)
    if (!repository) return undefined
    let cancelled = false
    repository.get(localDate).then(
      (quiz) => {
        if (!cancelled) setDone({ key, value: Boolean(quiz?.completedAt) })
      },
      () => {
        if (!cancelled) setDone({ key, value: false })
      },
    )
    return () => {
      cancelled = true
    }
  }, [userId, localDate, key])
  return done !== null && done.key === key && done.value
}
