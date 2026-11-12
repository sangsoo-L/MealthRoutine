import { Link } from 'react-router'
import { ASSESSMENT_TEXT } from '../../onboarding-assessment/assessmentLabels.ts'
import {
  cardClass,
  primaryButtonClass,
  secondaryButtonClass,
} from './assessmentStyles.ts'

type NoticeKind = 'loading' | 'error' | 'unavailable'

interface AssessmentNoticeProps {
  kind: NoticeKind
  /** 오류일 때 다시 시도 */
  onRetry?: () => void
}

/**
 * 불러오는 중·불러오기 실패·이용 불가 안내. 문항 화면과 같은 카드 모양이다.
 * 이용 불가는 이 빌드에서 출제·채점을 할 수 없는 경우(운영 빌드)이며, 서버 연동 전까지 정상적인 상태다.
 */
export default function AssessmentNotice({
  kind,
  onRetry,
}: AssessmentNoticeProps) {
  if (kind === 'loading') {
    return (
      <section role="status" className={cardClass}>
        <p className="text-body leading-relaxed font-normal text-muted">
          {ASSESSMENT_TEXT.loading}
        </p>
      </section>
    )
  }

  return (
    <>
      <section
        role={kind === 'error' ? 'alert' : undefined}
        className={cardClass}
      >
        <p className="text-body leading-relaxed font-normal text-content">
          {kind === 'error'
            ? ASSESSMENT_TEXT.loadError
            : ASSESSMENT_TEXT.unavailable}
        </p>
      </section>
      <div className="mt-auto flex flex-wrap gap-3 pt-3">
        {kind === 'error' && onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={primaryButtonClass}
          >
            {ASSESSMENT_TEXT.retry}
          </button>
        ) : null}
        <Link
          to="/home"
          className={
            kind === 'error' ? secondaryButtonClass : primaryButtonClass
          }
        >
          {ASSESSMENT_TEXT.goHome}
        </Link>
      </div>
    </>
  )
}
