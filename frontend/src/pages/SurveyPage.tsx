import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import {
  ALLERGY_CUSTOM,
  ALLERGY_MAX_LENGTH,
  QUESTION_COUNT,
  SURVEY_QUESTIONS,
  SURVEY_TEXT,
  isAnswerReady,
  reviewValue,
  type SurveyAnswers,
  type SurveyQuestion,
} from './surveyQuestions.ts'

type Direction = 'next' | 'back'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 입력창 규칙은 로그인·회원가입과 같다.
 * - text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다.
 * - border-muted/75: line 토큰은 흰 배경 대비가 1.24:1이라 입력창 경계로 약하다. 3.22:1을 확보한다.
 */
const inputClass =
  'h-12 w-full rounded-control border border-muted/75 bg-surface px-4 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted hover:border-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand motion-reduce:transition-none'

/**
 * 선택지 카드 하나. 질문마다 하나만 고르므로 선택 상태는 aria-pressed로 전달한다.
 * 라디오 대신 버튼을 쓰는 이유: 선택 즉시 다음 질문으로 넘어가는데, 라디오는 방향키만 눌러도
 * 선택이 바뀌어 탐색 중에 화면이 넘어간다. 버튼은 Enter·Space로 확정하므로 이동이 예측 가능하다.
 * - border-muted/40: 스토리보드 기본 테두리(#CBD5E1)에 가까운 토큰 기반 값이다.
 */
function ChoiceButton({
  value,
  description,
  selected,
  onSelect,
}: {
  value: string
  description: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-20 w-full cursor-pointer flex-col items-start rounded-card border p-4 text-left transition-colors motion-reduce:transition-none ${
        selected
          ? 'border-brand bg-brand-soft text-brand'
          : 'border-muted/40 bg-surface text-content hover:border-brand'
      } ${focusRing}`}
    >
      <span className="block text-section-title font-semibold">{value}</span>
      <span className="mt-1 block text-support leading-relaxed font-normal text-muted">
        {description}
      </span>
    </button>
  )
}

/**
 * 미연결 버튼. 이번 단계에서는 저장·완료·화면 이동을 하지 않으므로 동작을 연결하지 않는다.
 * disabled 대신 aria-disabled를 써서 키보드 포커스는 유지하고, 보조기기에는 '비활성'으로 전달한다.
 */
function UnconnectedButton({
  className,
  children,
}: {
  className: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-disabled="true"
      className={`cursor-not-allowed ${className} ${focusRing}`}
    >
      {children}
    </button>
  )
}

/** A02 초기설문. 기능·문구 기준은 스토리보드 v5.0 화면명세와 survey 스크립트다. */
export default function SurveyPage() {
  const [step, setStep] = useState(0)
  const [direction, setDirection] = useState<Direction>('next')
  const [answers, setAnswers] = useState<SurveyAnswers>({})
  const [allergyText, setAllergyText] = useState('')

  const headingRef = useRef<HTMLHeadingElement>(null)
  const allergyInputRef = useRef<HTMLInputElement>(null)
  // 사용자가 단계를 옮긴 뒤에만 제목으로 포커스를 옮긴다. 처음 열 때는 포커스를 가져가지 않는다.
  const movedRef = useRef(false)
  // `직접 입력`을 막 골라 입력창이 나타나는 경우에만 입력창으로 포커스를 옮긴다.
  const focusAllergyRef = useRef(false)

  const baseId = useId()
  const headingId = `${baseId}-question`
  const allergyId = `${baseId}-allergy`

  const isReview = step === QUESTION_COUNT
  const question: SurveyQuestion | undefined = SURVEY_QUESTIONS[step]
  const customAllergy =
    question?.key === 'allergyMode' && answers.allergyMode === ALLERGY_CUSTOM
  const ready = isAnswerReady(question, answers, allergyText)

  useEffect(() => {
    // 단계가 바뀌면 새 질문 제목으로 포커스를 옮겨 화면 전환을 알린다.
    // 확대한 화면에서 제목이 밀려나지 않도록 scrollIntoView 없이 기본 포커스 스크롤을 쓴다.
    if (movedRef.current) headingRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (customAllergy && focusAllergyRef.current) {
      focusAllergyRef.current = false
      allergyInputRef.current?.focus()
    }
  }, [customAllergy])

  function move(next: number) {
    movedRef.current = true
    setDirection(next < step ? 'back' : 'next')
    setStep(Math.max(0, Math.min(QUESTION_COUNT, next)))
  }

  function handleSelect(target: SurveyQuestion, value: string) {
    setAnswers((current) => ({ ...current, [target.key]: value }))
    if (target.key === 'allergyMode' && value === ALLERGY_CUSTOM) {
      // 직접 입력은 이름을 적은 뒤 `입력 완료`로 진행한다. 자동으로 넘어가지 않는다.
      if (allergyInputRef.current) allergyInputRef.current.focus()
      else focusAllergyRef.current = true
      return
    }
    move(step + 1)
  }

  function handleSkip(target: SurveyQuestion) {
    if (target.required) return
    // 건너뛴 질문은 기본값 없이 미응답으로 둔다.
    setAnswers((current) => {
      const next = { ...current }
      delete next[target.key]
      return next
    })
    move(step + 1)
  }

  const progressPercent = isReview
    ? 100
    : Math.round(((step + 1) / QUESTION_COUNT) * 100)

  return (
    // AppShell 본문의 여백(위아래 1.25rem)과 AppBar 높이(3.5rem)를 뺀 높이만큼 채워 하단 영역을 아래에 둔다.
    // break-keep: 한글을 어절 단위로 줄바꿈한다. wrap-anywhere: 한 단어가 줄보다 길 때만 예외로 끊는다.
    //
    // 가로 여백을 px로 고정한다(-mx-5 px-[20px]): 본문 여백(rem)을 되찾은 뒤 20px를 다시 둔다.
    // rem 여백은 글자를 200%로 키우면 함께 두 배가 되어 320px 화면에서 질문 제목 한 단어(최대 222px)가
    // 들어갈 폭(174px)이 남지 않아 단어가 끊겼다. 기본 배율에서는 값이 같아 모양이 변하지 않고, 글자 크기는 줄이지 않는다.
    <div className="-mx-5 flex min-h-[calc(100dvh-6rem)] flex-col px-[20px] break-keep wrap-anywhere">
      <div className="mb-2.5 flex justify-between text-support font-normal text-muted">
        <span>
          {isReview
            ? SURVEY_TEXT.progressReviewLabel
            : SURVEY_TEXT.progressLabel}
        </span>
        <strong aria-live="polite" className="font-semibold text-brand">
          {isReview
            ? SURVEY_TEXT.progressReviewValue
            : `${step + 1} / ${QUESTION_COUNT}`}
        </strong>
      </div>
      <div
        role="progressbar"
        aria-label={SURVEY_TEXT.progressBarLabel}
        aria-valuemin={0}
        aria-valuemax={QUESTION_COUNT}
        aria-valuenow={Math.min(step + 1, QUESTION_COUNT)}
        className="mb-5 h-1 shrink-0 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* key로 단계마다 새로 그려 전환 효과가 다시 재생된다. 모션 줄이기 설정에서는 효과를 없앤다. */}
      <section
        key={step}
        // px-[16px]: 위 설명과 같은 이유로 카드 좌우 안쪽 여백도 글자 확대에 따라 커지지 않게 고정한다.
        className={`rounded-card border border-line bg-surface px-[16px] py-5 motion-reduce:animate-none ${
          direction === 'back' ? 'animate-survey-back' : 'animate-survey-next'
        }`}
      >
        <p className="mb-3 text-support font-semibold text-brand">
          {isReview ? SURVEY_TEXT.reviewEyebrow : question?.label}
        </p>
        <h2
          ref={headingRef}
          id={headingId}
          tabIndex={-1}
          className="mb-3 scroll-mt-16 text-app-title leading-snug font-semibold text-content focus:outline-none"
        >
          {(isReview
            ? SURVEY_TEXT.reviewTitle
            : (question?.question ?? [])
          ).map((line, index) => (
            <span key={line}>
              {index > 0 ? <br /> : null}
              {line}
            </span>
          ))}
        </h2>
        <p className="mb-5 text-support leading-relaxed font-normal text-muted">
          {isReview ? SURVEY_TEXT.reviewHelp : question?.help}
        </p>

        {isReview ? (
          <ul className="rounded-card border border-line bg-surface px-3">
            {SURVEY_QUESTIONS.map((item, index) => (
              <li
                key={item.key}
                // 글자를 키워 값 칸이 좁아지면 수정 버튼이 아래로 내려가 값이 단어 중간에서 끊기지 않게 한다.
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-line py-3 last:border-b-0"
              >
                <div className="min-w-0 flex-1 basis-32">
                  <span className="block text-support font-normal text-muted">
                    {item.label}
                  </span>
                  <strong className="block text-body font-semibold text-content">
                    {reviewValue(item, answers, allergyText)}
                  </strong>
                </div>
                <button
                  type="button"
                  aria-label={`${item.label} ${SURVEY_TEXT.reviewEdit}`}
                  onClick={() => move(index)}
                  className={`inline-flex min-h-11 min-w-14 shrink-0 cursor-pointer items-center justify-center rounded-control border border-brand/30 bg-brand-soft px-3 text-support font-semibold whitespace-nowrap text-brand transition-colors hover:border-brand motion-reduce:transition-none ${focusRing}`}
                >
                  {SURVEY_TEXT.reviewEdit}
                </button>
              </li>
            ))}
          </ul>
        ) : question ? (
          <>
            <div
              role="group"
              aria-labelledby={headingId}
              className="flex flex-col gap-3"
            >
              {question.choices.map((choice) => (
                <ChoiceButton
                  key={choice.value}
                  value={choice.value}
                  description={choice.description}
                  selected={answers[question.key] === choice.value}
                  onSelect={() => handleSelect(question, choice.value)}
                />
              ))}
            </div>
            {customAllergy ? (
              <div className="mt-5">
                <label
                  htmlFor={allergyId}
                  className="mb-2 block text-support font-normal text-muted"
                >
                  {SURVEY_TEXT.allergyLabel}
                </label>
                <input
                  ref={allergyInputRef}
                  id={allergyId}
                  type="text"
                  autoComplete="off"
                  maxLength={ALLERGY_MAX_LENGTH}
                  placeholder={SURVEY_TEXT.allergyPlaceholder}
                  value={allergyText}
                  onChange={(event) => setAllergyText(event.target.value)}
                  className={inputClass}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <div className="mt-auto pt-3">
        {/* 글자를 키워 폭이 모자라면 주 버튼이 이전 버튼 아래로 내려간다. */}
        <div className="flex flex-wrap gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => move(step - 1)}
              className={`min-h-12 shrink-0 cursor-pointer rounded-control border border-muted/40 bg-surface px-5 text-body font-normal text-muted transition-colors hover:border-muted motion-reduce:transition-none ${focusRing}`}
            >
              {SURVEY_TEXT.previous}
            </button>
          ) : null}
          {isReview ? (
            <UnconnectedButton className="flex min-h-12 flex-1 basis-40 items-center justify-center gap-3 rounded-control bg-line text-body font-semibold text-muted">
              {SURVEY_TEXT.start} <span aria-hidden="true">→</span>
            </UnconnectedButton>
          ) : customAllergy ? (
            <button
              type="button"
              disabled={!ready}
              onClick={() => move(step + 1)}
              className={`flex min-h-12 flex-1 basis-40 cursor-pointer items-center justify-center gap-3 rounded-control bg-brand text-body font-semibold text-surface transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-line disabled:text-muted motion-reduce:transition-none ${focusRing}`}
            >
              {SURVEY_TEXT.customDone} <span aria-hidden="true">→</span>
            </button>
          ) : null}
        </div>

        {isReview ? null : question?.required ? (
          <p className="mt-3 text-center text-support leading-relaxed font-normal text-muted">
            {SURVEY_TEXT.requiredFootnote}
          </p>
        ) : question ? (
          <button
            type="button"
            onClick={() => handleSkip(question)}
            className={`mt-1 block min-h-11 w-full cursor-pointer text-support font-normal text-muted underline underline-offset-4 ${focusRing}`}
          >
            {SURVEY_TEXT.skip}
          </button>
        ) : null}

        <UnconnectedButton className="block min-h-11 w-full text-support font-normal text-muted underline underline-offset-4 aria-disabled:no-underline aria-disabled:opacity-60">
          {SURVEY_TEXT.leave}
        </UnconnectedButton>
      </div>
    </div>
  )
}
