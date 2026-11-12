import { useAuth } from '../auth/authContext.ts'
import BodyInfoPrompt from '../components/body-measurements/BodyInfoPrompt.tsx'
import HomeDiscovery from '../components/home/HomeDiscovery.tsx'
import HomeGreeting from '../components/home/HomeGreeting.tsx'
import HomeNotices from '../components/home/HomeNotices.tsx'
import HomeQuizCard from '../components/home/HomeQuizCard.tsx'
import HomeRecommendationBanner from '../components/home/HomeRecommendationBanner.tsx'
import HomeShortcuts from '../components/home/HomeShortcuts.tsx'
import HomeTodayRecords from '../components/home/HomeTodayRecords.tsx'
import { HOME_GUIDE_TEXT } from '../components/home/homeContent.ts'

/**
 * 로그인한 회원의 홈. 같은 /home 경로에서 HomePage가 로그인 상태일 때 보여 준다.
 *
 * 구성과 순서는 스토리보드 v5.0 H01의 회원 화면을 따르고, 사용자 지시로 인사 아래에 규칙 기반 "오늘의 추천" 배너를 더했다(스토리보드에는 없는 구성):
 * 인사 → 오늘의 추천 → 핵심 기능 바로가기 6개 → 오늘의 기록 → 퀴즈 → 처음이라면 여기부터 → 공지.
 * 계정 정보·회원 유형·AI 이용 권한·로그아웃은 홈의 주요 콘텐츠가 아니라서 마이페이지(MyAccountPanel)로 옮겼다. 화면 제목(h1)은 AppBar가 가진다.
 *
 * 섹션 구분: 섹션 사이는 모두 같은 간격(gap-10 = 40px)이고, 오늘의 기록과 처음이라면 여기부터만 흰 밴드(sectionBand)로 감싼다.
 * 그래서 페이지 배경 → 흰 밴드 → 페이지 배경 → 흰 밴드 → 페이지 배경 순으로 면이 번갈아 나온다. 인사와 추천은 한 덩어리(gap-5)다.
 * 공지사항과 하단 탭 사이 여백은 AppShell 본문 하단 패딩(20px)과 BottomNav 위쪽의 완충 영역(16px)이 만든다(합 36px). 이 화면이 따로 더하지 않는다.
 * 스크롤 중 본문이 하단 탭 뒤로 지나갈 때의 경계도 그 완충 영역이 맡는다(화면별 여백으로는 해결되지 않는다).
 *
 * 연결된 API와 기록 기능이 없어서 오늘의 기록은 "아직 기록이 없어요" 상태만 보여 주고, 가짜 기록이나 수치를 만들지 않는다.
 * 퀴즈 카드와 커뮤니티 바로가기는 이동할 화면이 없어 "준비 중" 표시가 있는 비대화형 요소다.
 *
 * 신체 정보 안내 팝업(BodyInfoPrompt): 로그인 상태에서 키·몸무게 중 하나라도 누락되면 바텀시트로 한 번 안내한다(입력은 같은 시트에서 한다).
 *
 * 보류(스토리보드에는 있으나 선행 조건이 없는 부분): 신체 정보 미등록 안내 배너(팝업만 구현), 등록 완료 시 루틴 탐색 배너,
 * 날씨 조건 인사(실제 날씨 연동 없음).
 */
export default function MemberHomePage() {
  const { user } = useAuth()

  // HomePage가 로그인 상태에서만 이 화면을 렌더링하므로 사용자가 없는 경우는 도달하지 않는다.
  if (!user) return null

  return (
    <div className="flex flex-col gap-10 break-keep wrap-anywhere">
      <div className="flex flex-col gap-5">
        <HomeGreeting nickname={user.nickname} />
        <HomeRecommendationBanner />
      </div>
      <HomeShortcuts />
      <HomeTodayRecords />
      <HomeQuizCard />
      <HomeDiscovery note={HOME_GUIDE_TEXT.memberNote} />
      <HomeNotices />
      <BodyInfoPrompt userId={user.id} />
    </div>
  )
}
