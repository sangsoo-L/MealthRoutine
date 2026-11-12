import { version } from '../../package.json'
import SettingsAccountActions from '../components/settings/SettingsAccountActions.tsx'
import SettingsGroup from '../components/settings/SettingsGroup.tsx'
import { SETTINGS_MENU_GROUPS } from '../settings/settingsMenu.ts'

/**
 * P09 상세 설정. 마이페이지(P01)의 설정 버튼으로 들어와 "나의 활동" 이하 메뉴를 한곳에서 확인한다.
 * 그룹·순서는 화면명세 v5.0 P09를 따른다: 나의 활동 → 계정·설정 → 멤버십·결제 → 고객지원 → 계정 관리(로그아웃·회원 탈퇴), 앱 버전.
 *
 * 무료·유료 회원 모두 같은 화면이며 회원 유형이나 이해도에 따라 메뉴가 달라지지 않는다. 비회원은 라우터의 AuthGate가
 * 로그인 안내를 보여 주므로 이 화면에 오지 않는다. 화면 제목(h1 "상세 설정")은 이 화면이 보여 주고(라우트 handle.ownH1),
 * 뒤로가기("이전", →P01 /mypage)는 AppShell이 본문 맨 위에 그린다.
 *
 * 동작하는 항목은 공지사항(기존 /support), 로그아웃뿐이다. 나머지 이동 메뉴는 화면이 아직 없어 "준비 중"이며
 * 값을 저장하는 스위치는 없다(알림 설정 등은 명세에 없고 API도 없다). 앱 버전은 package.json의 값이다.
 */
export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          상세 설정
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          내 계정 관리
        </p>
      </header>
      {SETTINGS_MENU_GROUPS.map((group) => (
        <SettingsGroup key={group.id} group={group} />
      ))}
      <SettingsAccountActions />
      <p className="text-center text-support leading-relaxed font-normal text-muted">
        앱 버전 <span className="tabular-nums">{version}</span>
      </p>
    </div>
  )
}
