import type { Ref } from 'react'
import {
  ASSESSMENT_DOMAIN_LABEL,
  ASSESSMENT_TEXT,
} from '../../onboarding-assessment/assessmentLabels.ts'
import type { PublicQuestion } from '../../onboarding-assessment/assessmentTypes.ts'
import MockBadge from './MockBadge.tsx'
import { DOMAIN_CHIP_CLASS, cardClass } from './assessmentStyles.ts'

interface AssessmentQuestionViewProps {
  question: PublicQuestion
  /** 이 문항에서 고른 보기 ID */
  selectedChoiceId: string | undefined
  direction: 'next' | 'back'
  headingRef: Ref<HTMLHeadingElement>
  isMock: boolean
  /** true이면 선택을 막고 비활성으로 표시한다(제출 중) */
  disabled: boolean
  onSelect: (choiceId: string) => void
}

/**
 * 한 문항. 선택지는 라디오 그룹(<input type="radio">)이라 방향키로 고르고 Tab으로 다음 컨트롤로 이동한다.
 * 고르는 즉시 다음 문항으로 넘어가지 않으므로(이동은 "다음" 버튼) 방향키로 탐색해도 화면이 바뀌지 않고, 답은 언제든 바꿀 수 있다.
 *
 * - 선택 상태는 테두리·배경색뿐 아니라 채워진 원 표시로도 전한다(색만으로 전하지 않는다).
 * - 선택 원의 테두리는 muted 단색이다(흰 배경에서 3:1 이상. 반투명 테두리는 비텍스트 대비가 모자란다).
 * - 제출 중에는 보기를 비활성으로 표시하고 선택을 막는다.
 * - 문항 질문이 라디오 그룹의 이름이다(aria-labelledby).
 * - 보기의 가로 여백과 라디오 원은 px로 고정한다(글자를 200%로 키워도 rem 여백이 함께 커져 글자 칸이 좁아지지 않게 한다).
 * - 문항이 바뀔 때만 전환 효과를 재생한다(key로 새로 그림). 모션 줄이기 설정에서는 효과가 없다.
 */
export default function AssessmentQuestionView({
  question,
  selectedChoiceId,
  direction,
  headingRef,
  isMock,
  disabled,
  onSelect,
}: AssessmentQuestionViewProps) {
  const headingId = `assessment-question-${question.id}`

  return (
    <section
      key={question.id}
      className={`${cardClass} motion-reduce:animate-none ${
        direction === 'back' ? 'animate-survey-back' : 'animate-survey-next'
      }`}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-support leading-snug font-semibold ${DOMAIN_CHIP_CLASS[question.domain]}`}
        >
          {ASSESSMENT_DOMAIN_LABEL[question.domain]}
        </span>
        {isMock ? <MockBadge>{ASSESSMENT_TEXT.mockBadge}</MockBadge> : null}
      </div>
      <h2
        ref={headingRef}
        id={headingId}
        tabIndex={-1}
        className="mb-5 scroll-mt-4 text-section-title leading-snug font-semibold text-content focus:outline-none"
      >
        {question.prompt}
      </h2>
      <div
        role="radiogroup"
        aria-labelledby={headingId}
        className="flex flex-col gap-3"
      >
        {question.choices.map((choice) => {
          const selected = selectedChoiceId === choice.id
          return (
            <label
              key={choice.id}
              className={`flex min-h-14 items-start gap-[12px] rounded-card border px-[16px] py-4 transition-colors has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-brand motion-reduce:transition-none ${
                selected
                  ? 'border-brand bg-brand-soft'
                  : 'border-muted/40 bg-surface'
              } ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-brand'}`}
            >
              <input
                type="radio"
                name={question.id}
                value={choice.id}
                checked={selected}
                disabled={disabled}
                onChange={() => onSelect(choice.id)}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-[20px] shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? 'border-brand' : 'border-muted'
                }`}
              >
                {selected ? (
                  <span className="size-[10px] rounded-full bg-brand" />
                ) : null}
              </span>
              <span className="min-w-0 text-body leading-relaxed font-normal text-content">
                {choice.label}
              </span>
            </label>
          )
        })}
      </div>
    </section>
  )
}
