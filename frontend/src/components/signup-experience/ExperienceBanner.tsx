import { useNavigate } from 'react-router'
import {
  endSignupExperience,
  endSignupExperienceOnLeave,
} from '../../signup-experience/signupExperience.ts'
import { useOnboardingSubject } from '../../signup-experience/useOnboardingSubject.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

interface ExperienceBannerProps {
  /**
   * 접근 게이트 뒤의 화면(이해도 확인)에서는 true. 체험을 바로 끝내면 이동이 반영되기 전에 접근 제한 안내가 잠깐 보이므로,
   * 화면을 실제로 떠날 때 끝나도록 예약한다.
   */
  endOnLeave?: boolean
  /**
   * default: 옅은 노란 면의 안내 상자(설문 등). quiet: 면·테두리 없이 한 줄 글자와 텍스트 버튼만 둔 조용한 형태.
   * 이해도 확인의 안내·문제 화면처럼 디자인을 방해하면 안 되는 곳에서 쓴다. 문구·체험 종료 기능·접근성은 둘 다 같다.
   */
  variant?: 'default' | 'quiet'
}

/**
 * 개발용 가입 체험 중임을 알리는 배너. 체험 중일 때만 보이고, 로그인한 회원이나 체험이 아닐 때, 운영 빌드에서는 렌더링되지 않는다.
 * 체험은 실제 계정 생성도 로그인도 아니라는 점을 분명히 밝히고, 언제든 체험을 끝내 임시 데이터를 지울 수 있게 한다.
 */
export default function ExperienceBanner({
  endOnLeave = false,
  variant = 'default',
}: ExperienceBannerProps) {
  const subject = useOnboardingSubject()
  const navigate = useNavigate()

  if (subject?.kind !== 'experience') return null

  function handleEnd() {
    if (endOnLeave) {
      // 게이트 뒤의 화면: 떠나는 순간에 끝나도록 예약하고 이동한다(AuthOrExperienceGate).
      endSignupExperienceOnLeave()
      void navigate('/home')
      return
    }
    // 게이트 밖의 화면(설문): 이동이 끝난 뒤에 지운다.
    void Promise.resolve(navigate('/home')).then(endSignupExperience)
  }

  if (variant === 'quiet') {
    return (
      <div
        role="note"
        className="mb-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-0"
      >
        <p className="min-w-0 flex-1 basis-48 text-support leading-relaxed font-normal text-muted">
          <strong className="font-semibold text-warning">
            개발용 가입 체험 중
          </strong>
          이에요. 실제 계정은 만들어지지 않았고 로그인한 상태도 아니에요.
        </p>
        <button
          type="button"
          onClick={handleEnd}
          className={`inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center text-support font-semibold text-warning underline underline-offset-4 transition-colors hover:text-content motion-reduce:transition-none ${focusRing}`}
        >
          체험 종료
        </button>
      </div>
    )
  }

  return (
    <div
      role="note"
      className="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-card bg-warning-soft px-3 py-2"
    >
      <p className="min-w-0 flex-1 basis-48 text-support leading-relaxed font-normal text-warning">
        <strong className="font-semibold">개발용 가입 체험 중</strong>이에요.
        실제 계정은 만들어지지 않았고 로그인한 상태도 아니에요.
      </p>
      <button
        type="button"
        onClick={handleEnd}
        className={`inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center rounded-control border border-warning/40 bg-surface px-3 text-support font-semibold text-warning transition-colors hover:border-warning motion-reduce:transition-none ${focusRing}`}
      >
        체험 종료
      </button>
    </div>
  )
}
