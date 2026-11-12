/**
 * 상세 설정(P09)의 메뉴 구성. 그룹·항목·순서는 화면명세 v5.0 P09의 wire를 그대로 옮긴 것이다.
 *
 * `to`가 null이면 아직 화면(경로)이 없어 링크로 만들지 않고 "준비 중"으로 표시한다. 경로는 임의로 만들지 않는다.
 * 화면이 구현되어 경로가 정해지면 해당 항목의 `to`만 채운다. 지금 경로가 있는 항목은 공지사항(S01, `/support`)뿐이다.
 * 로그아웃·회원 탈퇴·앱 버전은 이동 메뉴가 아니라서 SettingsAccountActions가 따로 그린다.
 */
export interface SettingsMenuItem {
  /** 화면명세 v5.0의 화면 ID. 화면이 없는 항목(결제 내역 등)은 null */
  screenId: string | null
  label: string
  /** 앱 안의 경로. 없으면 null(준비 중) */
  to: string | null
}

export interface SettingsMenuGroup {
  id: string
  title: string
  items: readonly SettingsMenuItem[]
}

export const SETTINGS_MENU_GROUPS: readonly SettingsMenuGroup[] = [
  {
    id: 'activity',
    title: '나의 활동',
    items: [
      { screenId: 'P08', label: '알림 목록', to: null },
      { screenId: 'P07', label: '즐겨찾기', to: null },
      { screenId: 'D03', label: '식단 리스트', to: null },
      { screenId: 'W06', label: '내 운동 루틴', to: null },
      { screenId: 'P04', label: '내 요청 내역', to: null },
      { screenId: 'P13', label: '내 문의', to: null },
    ],
  },
  {
    id: 'account',
    title: '계정 · 설정',
    items: [
      { screenId: 'P02', label: '프로필·개인정보', to: null },
      { screenId: 'P06', label: '키·몸무게', to: null },
      // 명세: 2차 비밀번호가 미설정이면 "등록"(P11), 설정됨이면 "변경"(P12). 등록 여부를 알 수 있는 데이터가 없어
      // 메뉴 이름을 정하지 않고 중립적인 이름으로 둔다.
      { screenId: 'P11·P12', label: '2차 비밀번호', to: null },
    ],
  },
  {
    id: 'membership',
    title: '멤버십 · 결제',
    items: [
      { screenId: 'P03', label: '멤버십 관리', to: null },
      { screenId: null, label: '결제 내역', to: null },
    ],
  },
  {
    id: 'support',
    title: '고객지원',
    items: [
      { screenId: 'S01', label: '공지사항', to: '/support' },
      { screenId: 'S04', label: 'FAQ', to: null },
      { screenId: 'S02', label: '문의', to: null },
      { screenId: null, label: '약관·개인정보처리방침', to: null },
    ],
  },
]
