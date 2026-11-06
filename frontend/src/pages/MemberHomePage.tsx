import { useNavigate } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import {
  ENTITLEMENT_LABEL,
  getExercisePlanAccess,
  getPhotoAnalysisAccess,
  type AiAccess,
} from '../auth/entitlements.ts'
import HomeNotices from '../components/home/HomeNotices.tsx'
import HomeQuizCard from '../components/home/HomeQuizCard.tsx'
import HomeShortcuts from '../components/home/HomeShortcuts.tsx'
import { DOMAIN_TONE, focusRing } from '../components/home/homeStyles.ts'

const cardClass = 'rounded-card border border-line bg-surface px-[16px] py-4'

/** 줄 안에 짧게 보여 주는 기능별 구분. 일반 회원의 체험 안내 문장은 영역에 한 번만 쓴다. */
const ACCESS_TEXT: Record<AiAccess, string> = {
  paid: '유료 권한으로 이용할 수 있어요',
  trial: '합산 체험 대상',
  unspecified: '체험 대상인지 명세에 정해지지 않았어요',
}

const TRIAL_NOTICE =
  '일반 회원은 AI 운동·식단·사진·주간 코칭을 합산 5회 체험할 수 있어요.'

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
 * 로그인한 회원의 홈. 같은 /home 경로에서 HomePage가 로그인 상태일 때 보여 준다.
 *
 * 계정 상태 영역은 개발용 로그인임을 알리는 표시다. 실제 인증이 아니며 AI 기능도 아직 제공하지 않는다.
 * 운동·식단 기록은 기록 기능이 구현되기 전이라 "아직 기록이 없어요" 상태만 보여 주고, 가짜 기록이나 달성률을 만들지 않는다.
 * 바로가기·퀴즈·공지는 components/home/을 그대로 쓴다. 화면 제목(h1)은 AppBar가 가진다.
 */
export default function MemberHomePage() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  // HomePage가 로그인 상태에서만 이 화면을 렌더링하므로 사용자가 없는 경우는 도달하지 않는다.
  if (!user) return null

  const exercisePlan = getExercisePlanAccess(user.entitlement)
  const photoAnalysis = getPhotoAnalysisAccess(user.entitlement)
  const showTrialNotice = exercisePlan === 'trial' || photoAnalysis === 'trial'

  function handleLogout() {
    logout()
    navigate('/home', { replace: true })
  }

  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <p className="text-app-title leading-snug font-semibold text-content">
        {user.nickname}님, 안녕하세요.
      </p>

      <section aria-labelledby="member-account-title" className={cardClass}>
        <h2
          id="member-account-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          로그인 상태
        </h2>
        <dl className="mt-3 flex flex-col gap-2">
          <InfoRow term="회원 유형">
            {ENTITLEMENT_LABEL[user.entitlement]}
          </InfoRow>
          <InfoRow term="이메일">{user.email}</InfoRow>
        </dl>
        <p className="mt-3 rounded-control bg-brand-soft px-3 py-2 text-support leading-relaxed font-normal text-content">
          개발용 로그인이에요. 실제 인증은 아니에요.
        </p>

        <h3 className="mt-4 text-body leading-snug font-semibold text-content">
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
          className={`mt-4 inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-muted/75 bg-surface px-4 text-body font-semibold text-content transition-colors hover:border-muted motion-reduce:transition-none ${focusRing}`}
        >
          로그아웃
        </button>
      </section>

      <section aria-labelledby="member-today-title" className={cardClass}>
        <h2
          id="member-today-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          오늘의 기록
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          <li className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <span
              className={`text-body font-semibold ${DOMAIN_TONE.exercise.label}`}
            >
              운동
            </span>
            <span className="text-body font-normal text-muted">
              아직 기록이 없어요
            </span>
          </li>
          <li className="flex flex-wrap justify-between gap-x-3 gap-y-0.5">
            <span
              className={`text-body font-semibold ${DOMAIN_TONE.meal.label}`}
            >
              식단
            </span>
            <span className="text-body font-normal text-muted">
              아직 기록이 없어요
            </span>
          </li>
        </ul>
      </section>

      <HomeShortcuts />
      <HomeQuizCard />
      <HomeNotices />
    </div>
  )
}
