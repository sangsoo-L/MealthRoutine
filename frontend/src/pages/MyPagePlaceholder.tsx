import MyAccountPanel from '../components/mypage/MyAccountPanel.tsx'
import PagePlaceholder from './PagePlaceholder.tsx'

/**
 * P01 마이페이지의 임시 화면. 정식 화면(프로필·레벨·멤버십·이번 주 활동·목표·신체 정보)은 아직 구현되지 않았다.
 * 회원 홈에서 옮긴 계정 정보·이용 권한·로그아웃(MyAccountPanel)만 임시로 함께 보여 준다. 비회원은 라우터의 AuthGate가 로그인 안내를 보여 주므로 이 화면에 오지 않는다.
 */
export default function MyPagePlaceholder() {
  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <PagePlaceholder screenId="P01" name="마이페이지" />
      <MyAccountPanel />
    </div>
  )
}
