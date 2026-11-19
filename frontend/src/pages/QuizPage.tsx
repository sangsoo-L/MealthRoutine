import { useState } from 'react'
import { useAuth } from '../auth/authContext.ts'
import {
  QuizEntry,
  QuizNotice,
  QuizQuestionForm,
  QuizResult,
} from '../components/quiz/QuizParts.tsx'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { useDailyQuiz } from '../quiz/useDailyQuiz.ts'

function QuizBody() {
  const { user } = useAuth()
  const today = useLocalToday()
  const { state, reload, submit, submitting, submitFailed } = useDailyQuiz(
    user?.id ?? null,
    today,
  )
  const [started, setStarted] = useState(false)
  // 이 화면에서 방금 제출했는지(제출 직후에만 결과 제목으로 포커스를 옮긴다. 다시 들어왔을 때는 옮기지 않는다).
  const [justSubmitted, setJustSubmitted] = useState(false)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          오늘의 퀴즈
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
          운동·식단 상식을 하루 한 문제씩 알아가요.
        </p>
      </header>
      {state.status === 'loading' ? (
        <QuizNotice
          title="오늘의 문제를 불러오는 중이에요…"
          body="잠시만 기다려 주세요."
        />
      ) : state.status === 'unavailable' || state.status === 'preparing' ? (
        <QuizNotice
          title="오늘의 퀴즈를 준비 중이에요"
          body="준비가 끝나면 이곳에서 하루 한 문제를 만날 수 있어요."
        />
      ) : state.status === 'error' ? (
        <QuizNotice
          title="오늘의 퀴즈를 불러오지 못했어요"
          body="잠시 후 다시 시도해 주세요."
          action={{ label: '다시 시도', onClick: reload }}
        />
      ) : state.quiz.completedAt ? (
        <QuizResult ready={state} focusOnMount={justSubmitted} />
      ) : started ? (
        <QuizQuestionForm
          question={state.question}
          submitting={submitting}
          failed={submitFailed}
          onSubmit={(id) => {
            setJustSubmitted(true)
            void submit(id)
          }}
        />
      ) : (
        <QuizEntry question={state.question} onStart={() => setStarted(true)} />
      )}
    </div>
  )
}

/** H02 오늘의 퀴즈: 하루 한 문제(운동·식단 통합). 회원 전용(라우트의 AuthGate). 계정이 바뀌면 화면 상태를 새로 시작한다. */
export default function QuizPage() {
  const { user } = useAuth()
  return <QuizBody key={user?.id ?? ''} />
}
