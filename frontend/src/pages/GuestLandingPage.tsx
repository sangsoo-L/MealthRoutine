import LandingAiServices from '../components/landing/LandingAiServices.tsx'
import LandingExplore from '../components/landing/LandingExplore.tsx'
import LandingFooter from '../components/landing/LandingFooter.tsx'
import LandingHeader from '../components/landing/LandingHeader.tsx'
import LandingHero from '../components/landing/LandingHero.tsx'
import LandingHowItWorks from '../components/landing/LandingHowItWorks.tsx'
import LandingQuizBanner from '../components/landing/LandingQuizBanner.tsx'
import LandingSignupCTA from '../components/landing/LandingSignupCTA.tsx'

/**
 * H01. 로그인하지 않은 방문자를 위한 홈. 모바일 앱 폭(390px)을 유지하는 서비스 소개 화면이다.
 *
 * v5.0의 H01과 달라진 점(사용자 승인): 회원 앱 홈(바로가기 6개·퀴즈 카드)은 별도 화면(MemberHomePage)으로 나누고, H01은 비회원용으로 구성한다.
 *
 * 구성과 위계: 헤더 → 히어로(가치·가입·서비스 소개 카드) → 기록 방법 → 가입 없이 둘러보기 → 퀴즈 소개 배너
 * → AI 코칭 제공 예정 안내 → 가입 CTA → 푸터. 핵심인 기록을 앞에, 보조 기능과 제공 예정 기능을 뒤에 작게 둔다.
 * 가입 버튼은 첫 화면과 마지막 영역에만 둔다. 퀴즈 배너는 소개만 하는 정적 영역이고, 이 화면에 동작하는 퀴즈는 없다.
 *
 * AppShell은 라우트 handle의 landing으로 비회원일 때 AppBar와 하단 탭을 렌더링하지 않는다.
 * 모든 섹션은 본문 좌우 여백(px-5)을 -mx-5로 넘고 안쪽 여백을 px로 고정해, 글자를 키워도 왼쪽 시작선이 같다.
 * 화면 진입 애니메이션은 공통 RouteTransition이 처리하므로 여기서 따로 만들지 않는다.
 */
export default function GuestLandingPage() {
  return (
    <div className="break-keep wrap-anywhere">
      <LandingHeader />
      <LandingHero />
      <LandingHowItWorks />
      <LandingExplore />
      <LandingQuizBanner />
      <LandingAiServices />
      <LandingSignupCTA />
      <LandingFooter />
    </div>
  )
}
