import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { DailyQuizReady } from '../../quiz/useDailyQuiz.ts'
import type { QuizAnswerId, QuizQuestion } from '../../quiz/quizTypes.ts'
import {
  QUIZ_DOMAIN_LABEL,
  answerChoices,
  categoryLabel,
  correctAnswerText,
  markOption,
  rewardNotice,
  summarizeReward,
} from '../../quiz/quizView.ts'
import {
  QUIZ_DOMAIN_CHIP,
  quizCard,
  quizFocusRing,
  quizPrimaryButton,
  quizSecondaryButton,
  quizSectionTitle,
} from './quizStyles.ts'

/** 영역·카테고리 칩. 색과 함께 글자로 영역을 알린다. */
function QuestionMeta({ question }: { question: QuizQuestion }) {
  return (
    <p className="flex flex-wrap items-center gap-2">
      <span
        className={`rounded-full px-2.5 py-1 text-support leading-none font-semibold ${QUIZ_DOMAIN_CHIP[question.domain]}`}
      >
        {QUIZ_DOMAIN_LABEL[question.domain]}
      </span>
      <span className="text-support font-normal text-muted">
        {categoryLabel(question)}
      </span>
    </p>
  )
}

/** 시작 전 안내: 오늘의 문제 영역, 보상 안내, "문제 풀기". 문제와 보기는 아직 보이지 않는다. */
export function QuizEntry({
  question,
  onStart,
}: {
  question: QuizQuestion
  onStart: () => void
}) {
  return (
    <section aria-labelledby="quiz-entry-title" className={quizCard}>
      <QuestionMeta question={question} />
      <h2 id="quiz-entry-title" className={`${quizSectionTitle} mt-3`}>
        오늘의 문제가 준비됐어요
      </h2>
      <p className="mt-1 text-body leading-relaxed font-normal break-keep text-muted">
        하루에 한 문제만 풀 수 있어요. 맞혀도 틀려도 오늘의 퀴즈는 완료돼요.
      </p>
      <p className="mt-3 rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal break-keep text-content">
        {rewardNotice()} 시험용 임시 보상 기준이에요.
      </p>
      <button
        type="button"
        onClick={onStart}
        className={`mt-4 ${quizPrimaryButton}`}
      >
        문제 풀기
      </button>
    </section>
  )
}

/** 문제와 보기(4지선다 4개 또는 OX 2개). 보기를 고르는 것만으로는 아무것도 기록하지 않고, 제출해야 확정된다. */
export function QuizQuestionForm({
  question,
  submitting,
  failed,
  onSubmit,
}: {
  question: QuizQuestion
  submitting: boolean
  failed: boolean
  onSubmit: (id: QuizAnswerId) => void
}) {
  const [selected, setSelected] = useState<QuizAnswerId | null>(null)
  const legendRef = useRef<HTMLLegendElement>(null)
  useEffect(() => {
    legendRef.current?.focus()
  }, [])

  return (
    <form
      className={quizCard}
      onSubmit={(event) => {
        event.preventDefault()
        if (selected && !submitting) onSubmit(selected)
      }}
    >
      <QuestionMeta question={question} />
      <fieldset className="mt-3 min-w-0" disabled={submitting}>
        <legend
          ref={legendRef}
          tabIndex={-1}
          className={`${quizSectionTitle} break-keep outline-none`}
        >
          {question.question}
        </legend>
        <div className="mt-4 flex flex-col gap-2">
          {answerChoices(question).map((option) => (
            <label
              key={option.id}
              className="flex min-h-12 cursor-pointer items-start gap-3 rounded-control border border-line bg-surface px-3 py-3 text-body leading-snug font-normal break-keep text-content has-checked:border-brand has-checked:bg-brand-soft has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand"
            >
              <input
                type="radio"
                name="quiz-answer"
                value={option.id}
                checked={selected === option.id}
                onChange={() => setSelected(option.id)}
                className="mt-0.5 size-4 shrink-0 accent-brand"
              />
              <span className="min-w-0">
                <span className="font-semibold">{option.id}.</span>{' '}
                {option.text}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {failed ? (
        <p
          role="alert"
          className="mt-3 text-support leading-relaxed font-normal text-danger"
        >
          제출하지 못했어요. 선택은 그대로 있으니 다시 제출해 주세요.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={selected === null || submitting}
        className={`mt-4 ${quizPrimaryButton}`}
      >
        {submitting ? '제출하는 중…' : '제출하기'}
      </button>
    </form>
  )
}

/** 결과와 완료: 정답 여부, 고른 답과 정답의 구분, 해설, 이번 보상과 누적(보상 내역 기준), 다음 퀴즈 안내. */
export function QuizResult({
  ready,
  focusOnMount,
}: {
  ready: DailyQuizReady
  focusOnMount: boolean
}) {
  const { question, quiz, reward, totals } = ready
  const outcome = quiz.isCorrect ? 'correct' : 'wrong'
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus()
  }, [focusOnMount])
  const summary = summarizeReward(outcome, reward, totals)
  const correctText = correctAnswerText(question)

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <section aria-labelledby="quiz-result-title" className={quizCard}>
        <QuestionMeta question={question} />
        {/* 제출 직후 포커스를 받아 보조기기가 결과를 읽는다. role=status로 결과 변화도 알린다. */}
        <h2
          id="quiz-result-title"
          ref={headingRef}
          tabIndex={-1}
          role="status"
          className="mt-3 text-app-title leading-snug font-semibold break-keep text-content outline-none"
        >
          {outcome === 'correct' ? '정답이에요!' : '아쉬워요! 함께 알아봐요.'}
        </h2>
        <p className="mt-3 text-body leading-snug font-semibold break-keep text-content">
          {question.question}
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {answerChoices(question).map((option) => {
            const mark = markOption(
              option.id,
              quiz.selectedAnswerId,
              question.correctAnswerId,
            )
            const tone =
              mark.tone === 'correct'
                ? 'border-success bg-success-soft'
                : mark.tone === 'wrong'
                  ? 'border-danger bg-danger-soft'
                  : 'border-line bg-surface'
            return (
              <li
                key={option.id}
                className={`flex items-start gap-3 rounded-control border px-3 py-3 text-body leading-snug font-normal break-keep text-content ${tone}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{option.id}.</span>{' '}
                  {option.text}
                </span>
                {mark.tag ? (
                  <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 text-support leading-snug font-semibold text-content">
                    <span aria-hidden="true">
                      {mark.tone === 'correct' ? '✓ ' : '✕ '}
                    </span>
                    {mark.tag}
                  </span>
                ) : null}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="quiz-explain-title" className={quizCard}>
        <h2 id="quiz-explain-title" className={quizSectionTitle}>
          해설
        </h2>
        <p className="mt-2 text-body leading-relaxed font-normal break-keep text-content">
          {question.explanation}
        </p>
      </section>

      <section aria-labelledby="quiz-done-title" className={quizCard}>
        <h2 id="quiz-done-title" className={quizSectionTitle}>
          오늘의 퀴즈 완료
        </h2>
        <dl className="mt-3 flex flex-col gap-3">
          <div>
            <dt className="text-support font-normal text-muted">
              오늘 알게 된 내용
            </dt>
            <dd className="mt-1 text-body leading-relaxed font-semibold break-keep text-content">
              {correctText}
            </dd>
          </div>
          <div>
            <dt className="text-support font-normal text-muted">보상</dt>
            <dd className="mt-1 text-body leading-relaxed font-normal text-content tabular-nums">
              <span className="font-semibold">{summary.thisTime}</span>
              <br />
              <span className="text-muted">{summary.cumulative}</span>
            </dd>
          </div>
        </dl>
        {totals.skippedCount > 0 ? (
          <p className="mt-2 text-support leading-relaxed font-normal text-muted">
            읽을 수 없는 보상 내역 {totals.skippedCount}개는 누적에서
            제외했어요.
          </p>
        ) : null}
        <p className="mt-3 text-support leading-relaxed font-normal break-keep text-muted">
          다음 퀴즈는 내일 새로 만나요. 날짜는 이 기기의 시계를 기준으로 해요.
        </p>
        <Link to="/home" className={`mt-4 ${quizSecondaryButton}`}>
          홈으로
        </Link>
      </section>
    </div>
  )
}

/** 불러오기·준비 중·오류 안내(공통 모양). */
export function QuizNotice({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div
      role={action ? 'alert' : 'status'}
      className={`${quizCard} text-center break-keep`}
    >
      <p className={quizSectionTitle}>{title}</p>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        {body}
      </p>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className={`mx-auto mt-4 max-w-60 ${quizSecondaryButton}`}
        >
          {action.label}
        </button>
      ) : null}
      <Link
        to="/home"
        className={`mt-4 inline-block text-body font-semibold text-brand underline ${quizFocusRing}`}
      >
        홈으로
      </Link>
    </div>
  )
}
