import { useEffect, useRef, useState } from 'react'
import { clearDraft, loadDraft, saveDraft } from './assessmentDraft.ts'
import {
  AssessmentSubmitError,
  type AssessmentRepository,
} from './assessmentRepository.ts'
import type {
  AssessmentAttempt,
  AssessmentAnswers,
  PublicQuestion,
} from './assessmentTypes.ts'

type LoadStatus = 'loading' | 'error' | 'ready'

const NO_QUESTIONS: readonly PublicQuestion[] = []

/**
 * 이해도 확인 화면의 진행 상태. 저장소(AssessmentRepository)에서 출제 또는 결과를 받아 오고, 응답·현재 문항을 관리한다.
 *
 * - 응답과 현재 문항은 바뀔 때마다 계정별 임시 저장(assessmentDraft)에 남겨 새로고침 후 복구한다.
 *   저장은 이벤트 핸들러에서 하며, 복구는 현재 출제(sessionId·문항·보기)와 맞는 값만 받아들인다.
 * - 제출은 한 번에 하나만 보낸다(ref로 막아 같은 틱의 연속 클릭도 걸러낸다). 실패하면 응답은 그대로 두고 다시 시도할 수 있다.
 * - 완료된 응시(completed)는 결과만 보여 준다. 재응시는 지원하지 않는다.
 */
export function useAssessmentFlow(
  repository: AssessmentRepository,
  userId: string,
) {
  const [status, setStatus] = useState<LoadStatus>('loading')
  const [attempt, setAttempt] = useState<AssessmentAttempt | null>(null)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [started, setStarted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitFailed, setSubmitFailed] = useState(false)
  // 제출이 "모르는 출제"로 거절되어 새 출제로 처음부터 다시 시작했는지(안내 표시용)
  const [restarted, setRestarted] = useState(false)
  // 다시 불러오기 요청. 값이 바뀌면 불러오기가 다시 실행된다.
  const [loadRound, setLoadRound] = useState(0)
  const submittingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    repository
      .loadAttempt()
      .then((loaded) => {
        if (cancelled) return
        if (loaded.state === 'open') {
          const draft = loadDraft(userId, loaded.session)
          setAnswers(draft?.answers ?? {})
          setIndex(draft?.index ?? 0)
          setStarted(draft?.started ?? false)
        } else {
          // 완료된 응시에는 진행 상태가 남아 있지 않아야 한다.
          clearDraft(userId)
        }
        setAttempt(loaded)
        setStatus('ready')
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [repository, userId, loadRound])

  const session = attempt?.state === 'open' ? attempt.session : null
  // 출제가 없을 때도 같은 빈 배열을 써서 제출 콜백의 의존성이 렌더마다 바뀌지 않게 한다.
  const questions: readonly PublicQuestion[] = session
    ? session.questions
    : NO_QUESTIONS
  const total = questions.length
  const question: PublicQuestion | undefined = questions[index]
  const currentAnswered = question ? answers[question.id] !== undefined : false

  function persist(next: {
    started: boolean
    index: number
    answers: Record<string, string>
  }) {
    if (!session) return
    saveDraft(userId, { sessionId: session.sessionId, ...next })
  }

  function start() {
    setStarted(true)
    persist({ started: true, index, answers })
  }

  function select(questionId: string, choiceId: string) {
    if (submittingRef.current) return
    const next = { ...answers, [questionId]: choiceId }
    setAnswers(next)
    setSubmitFailed(false)
    persist({ started: true, index, answers: next })
  }

  function goTo(target: number) {
    if (submittingRef.current || total === 0) return
    const next = Math.max(0, Math.min(total - 1, target))
    setIndex(next)
    persist({ started: true, index: next, answers })
  }

  function submit() {
    if (!session || submittingRef.current) return
    if (!questions.every((q) => answers[q.id] !== undefined)) return
    submittingRef.current = true
    setSubmitting(true)
    setSubmitFailed(false)
    const payload: AssessmentAnswers = { ...answers }
    repository
      .submit(session.sessionId, payload)
      .then((result) => {
        clearDraft(userId)
        setAttempt({ state: 'completed', result })
      })
      .catch((error: unknown) => {
        // 출제가 만료·교체되어 서버가 모르는 출제로 거절하면 다시 시도해도 같은 오류다. 응답을 버리고 새 출제로 처음부터 다시 시작한다.
        if (
          error instanceof AssessmentSubmitError &&
          error.reason === 'unknown-session'
        ) {
          clearDraft(userId)
          setAnswers({})
          setIndex(0)
          setStarted(false)
          setRestarted(true)
          reload()
          return
        }
        // 그 밖의 실패(일시 오류 등)는 응답을 그대로 두고 다시 시도할 수 있다.
        setSubmitFailed(true)
      })
      .finally(() => {
        submittingRef.current = false
        setSubmitting(false)
      })
  }

  function reload() {
    setStatus('loading')
    setLoadRound((round) => round + 1)
  }

  return {
    status,
    attempt,
    total,
    question,
    index,
    answers,
    currentAnswered,
    started,
    submitting,
    submitFailed,
    restarted,
    start,
    select,
    goTo,
    submit,
    reload,
  }
}
