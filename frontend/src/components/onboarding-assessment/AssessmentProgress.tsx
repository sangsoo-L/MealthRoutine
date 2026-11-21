import { ASSESSMENT_TEXT } from '../../onboarding-assessment/assessmentLabels.ts'

interface AssessmentProgressProps {
  /** 현재 문항 번호(1부터) */
  current: number
  total: number
}

/**
 * 진행률. "n / 전체" 글자와 막대를 함께 보여 준다(막대만으로 전하지 않는다).
 * 문항이 바뀌면 보조기기에 현재 번호가 읽히도록 번호에 aria-live를 둔다. 막대는 모션 줄이기 설정에서 즉시 바뀐다.
 */
export default function AssessmentProgress({
  current,
  total,
}: AssessmentProgressProps) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0
  return (
    <div className="pt-2">
      <div className="mb-2.5 flex justify-between text-support font-normal text-muted">
        <span>{ASSESSMENT_TEXT.progressLabel}</span>
        <strong aria-live="polite" className="font-semibold text-brand">
          {current} / {total}
        </strong>
      </div>
      <div
        role="progressbar"
        aria-label={ASSESSMENT_TEXT.progressBarLabel}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${total}문항 중 ${current}번째`}
        className="mb-6 h-1 shrink-0 overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-300 ease-out motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
