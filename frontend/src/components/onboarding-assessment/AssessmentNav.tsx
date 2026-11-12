import { useId } from 'react'
import { ASSESSMENT_TEXT } from '../../onboarding-assessment/assessmentLabels.ts'
import {
  disabledButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './assessmentStyles.ts'

interface AssessmentNavProps {
  /** 현재 문항 위치(0부터) */
  index: number
  total: number
  /** 현재 문항에 답했는지 */
  answered: boolean
  submitting: boolean
  submitFailed: boolean
  onPrevious: () => void
  onNext: () => void
}

/**
 * 이전·다음(마지막 문항은 결과 확인) 이동. 답하지 않은 문항에서는 다음으로 갈 수 없다(미응답 제출 방지).
 *
 * - 다음 버튼은 disabled 대신 aria-disabled를 써서 포커스를 유지하고, 이유 문구와 aria-describedby로 연결해 읽어 준다.
 *   눌러도 아무 일이 일어나지 않는다(클릭 핸들러가 막는다).
 * - 제출 중에는 이전·다음을 모두 막고 "확인하는 중…"을 보여 준다. 제출이 실패하면 응답은 그대로 두고 다시 시도할 수 있다.
 * - 폭이 모자라면(글자 확대) 주 버튼이 이전 버튼 아래 줄로 내려간다.
 */
export default function AssessmentNav({
  index,
  total,
  answered,
  submitting,
  submitFailed,
  onPrevious,
  onNext,
}: AssessmentNavProps) {
  const hintId = useId()
  const isLast = index === total - 1
  const blocked = !answered || submitting
  const hint = answered
    ? null
    : isLast
      ? ASSESSMENT_TEXT.finishHint
      : ASSESSMENT_TEXT.answerHint

  return (
    <div className="mt-auto pt-5">
      <div className="flex flex-wrap gap-3">
        {index > 0 ? (
          <button
            type="button"
            aria-disabled={submitting}
            onClick={() => {
              if (!submitting) onPrevious()
            }}
            className={`${secondaryButtonClass} ${submitting ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            {ASSESSMENT_TEXT.previous}
          </button>
        ) : null}
        <button
          type="button"
          aria-disabled={blocked}
          aria-busy={submitting}
          aria-describedby={hint ? hintId : undefined}
          onClick={() => {
            if (!blocked) onNext()
          }}
          className={blocked ? disabledButtonClass : primaryButtonClass}
        >
          {submitting
            ? ASSESSMENT_TEXT.submitting
            : isLast
              ? ASSESSMENT_TEXT.finish
              : ASSESSMENT_TEXT.next}
          {submitting ? null : <span aria-hidden="true">→</span>}
        </button>
      </div>
      {submitFailed ? (
        <p
          role="alert"
          className="mt-3 rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger"
        >
          {ASSESSMENT_TEXT.submitError}
        </p>
      ) : hint ? (
        <p
          id={hintId}
          className="mt-3 text-center text-support leading-relaxed font-normal text-muted"
        >
          {hint}
        </p>
      ) : null}
    </div>
  )
}
