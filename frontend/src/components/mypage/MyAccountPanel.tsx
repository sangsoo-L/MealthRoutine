import { useNavigate } from 'react-router'
import { useAuth } from '../../auth/authContext.ts'
import {
  ENTITLEMENT_LABEL,
  getExercisePlanAccess,
  getPhotoAnalysisAccess,
  type AiAccess,
} from '../../auth/entitlements.ts'
import { focusRing } from '../home/homeStyles.ts'

/** 줄 안에 짧게 보여 주는 기능별 구분 */
const ACCESS_TEXT: Record<AiAccess, string> = {
  paid: '유료 권한으로 이용할 수 있어요',
  trial: '합산 체험 대상',
  unspecified: '체험 대상인지 명세에 정해지지 않았어요',
}

/**
 * 체험 횟수 안내. 정책이 확정되지 않았으므로 남은 횟수처럼 보이지 않게 "시안에 정의된 값"이라고 밝히고,
 * 횟수 차감과 잔여 횟수는 표시하지 않는다.
 */
const TRIAL_NOTICE =
  '일반 회원의 AI 체험은 운동·식단·사진·주간 코칭 합산 5회로 시안에 정의되어 있어요. 정책이 확정되기 전이라 남은 횟수는 표시하지 않아요.'

interface InfoRowProps {
  term: string
  children: string
}

/** 이름과 값을 한 줄로 보여 주는 행. 폭이 모자라면 값이 아래로 내려간다. */
function InfoRow({ term, children }: InfoRowProps) {
  return (
    <div className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
      <dt className="text-support font-normal text-muted">{term}</dt>
      <dd className="min-w-0 text-body font-normal text-content">{children}</dd>
    </div>
  )
}

/**
 * 마이페이지(P01)에 두는 계정 정보 영역. 회원 홈에 있던 "로그인 상태" 카드를 옮긴 것이다.
 *
 * - 표시: 회원 유형, 이메일, AI 기능별 이용 권한, 체험 안내, 로그아웃. 권한 구분의 근거는 auth/entitlements.ts에 있다.
 * - 개발용 로그인 안내는 개발 서버(import.meta.env.DEV)에서만 보인다. 운영 빌드에서는 개발용 로그인이 동작하지 않는다.
 * - 로그아웃은 인증 상태를 지우고 홈(비회원 H01)으로 이동한다. 기존 동작을 그대로 옮겼다.
 *
 * 마이페이지 정식 화면(P01: 프로필·레벨·멤버십·이번 주 활동·목표·신체 정보)이 구현되면 이 영역의 멤버십·이용 권한과
 * 로그아웃 부분을 그 화면의 해당 구역으로 옮기거나 대체한다. AI 기능은 아직 제공 전이며 이 영역은 구분만 표시한다.
 */
export default function MyAccountPanel() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // 마이페이지는 AuthGate 안에 있어 로그인한 회원에게만 렌더링된다. 사용자가 없는 경우는 도달하지 않는다.
  if (!user) return null

  const exercisePlan = getExercisePlanAccess(user.entitlement)
  const photoAnalysis = getPhotoAnalysisAccess(user.entitlement)
  const showTrialNotice = exercisePlan === 'trial' || photoAnalysis === 'trial'

  function handleLogout() {
    logout()
    navigate('/home', { replace: true })
  }

  return (
    <section
      aria-labelledby="my-account-title"
      className="rounded-card border border-line bg-surface px-[16px] py-4"
    >
      <h2
        id="my-account-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        계정 정보
      </h2>
      <p className="mt-1 text-body leading-snug font-semibold text-content">
        {user.nickname}
      </p>
      <dl className="mt-3 flex flex-col gap-2">
        <InfoRow term="회원 유형">
          {ENTITLEMENT_LABEL[user.entitlement]}
        </InfoRow>
        <InfoRow term="이메일">{user.email}</InfoRow>
      </dl>
      {import.meta.env.DEV ? (
        <p className="mt-3 rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal text-content">
          개발용 로그인이에요. 실제 인증은 아니에요.
        </p>
      ) : null}

      <h3 className="mt-5 text-body leading-snug font-semibold text-content">
        AI 기능 이용 권한
      </h3>
      <dl className="mt-2 flex flex-col gap-2">
        <InfoRow term="AI 운동 플랜">{ACCESS_TEXT[exercisePlan]}</InfoRow>
        <InfoRow term="사진 음식 분석">{ACCESS_TEXT[photoAnalysis]}</InfoRow>
      </dl>
      {showTrialNotice ? (
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          {TRIAL_NOTICE}
        </p>
      ) : null}
      <p className="mt-2 text-support leading-relaxed font-normal text-muted">
        AI 기능은 아직 제공 전이에요. 권한 구분만 표시해요.
      </p>

      <button
        type="button"
        onClick={handleLogout}
        className={`mt-5 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-muted/75 bg-surface px-4 text-body font-semibold text-content transition-colors hover:border-muted motion-reduce:transition-none ${focusRing}`}
      >
        로그아웃
      </button>
    </section>
  )
}
