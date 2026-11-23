/**
 * 상세 설정(P09)의 메뉴 구성. 그룹·항목·순서는 화면명세 v5.0 P09의 wire를 그대로 옮긴 것이다.
 *
 * `to`가 null이면 아직 화면(경로)이 없어 링크로 만들지 않고 "준비 중"으로 표시한다. 경로는 임의로 만들지 않는다.
 * 화면이 구현되어 경로가 정해지면 해당 항목의 `to`만 채운다. 지금 경로가 있는 항목은 알림 목록(P08), 즐겨찾기(P07), 내 운동 루틴(W06), 공지사항(S01), FAQ(S04)다.
 * 로그아웃·회원 탈퇴·앱 버전은 이동 메뉴가 아니라서 SettingsAccountActions가 따로 그린다.
 */
export interface SettingsMenuItem {
  /** 화면명세 v5.0의 화면 ID. 화면이 없는 항목(결제 내역 등)은 null */
  screenId: string | null
  label: string
  /** 앱 안의 경로. 없으면 null(준비 중) */
  to: string | null
  /**
   * true이면 이 항목으로 이동한 화면의 "이전"이 상세 설정으로 돌아오게 진입 화면(`state.from`)을 알린다.
   * 상위 화면(handle.parent)이 설정이 아닌 화면(예: 알림 목록의 홈)일 때 쓴다. 생략하면 지금까지처럼 상위 화면으로 돌아간다.
   */
  returnHere?: boolean
  /**
   * 'pin'이면 이동 경로와 보조 문구를 2차 비밀번호 등록 여부로 정한다(미등록 → P11, 등록됨 → P12).
   * 등록 여부를 확인하기 전·확인하지 못한 때·운영 빌드(서버 연결 전)에는 어디로도 이동하지 않는다. `to`는 쓰지 않는다.
   */
  dynamic?: 'pin'
}

/** 상세 설정(P09)의 경로. 메뉴 항목이 진입 화면으로 알려 주는 값이다(router.tsx의 `settings` 경로와 같다). */
export const SETTINGS_PATH = '/settings'

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
      // P08 알림 목록. 새 경로를 만들지 않고 기존 `/notifications`에 연결한다. "이전"은 설정으로 돌아온다.
      {
        screenId: 'P08',
        label: '알림 목록',
        to: '/notifications',
        returnHere: true,
      },
      // P07 즐겨찾기(`/favorites`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'P07',
        label: '즐겨찾기',
        to: '/favorites',
        returnHere: true,
      },
      // D03 식단 리스트(`/records/meal/list`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'D03',
        label: '식단 리스트',
        to: '/records/meal/list',
        returnHere: true,
      },
      // W06 내 운동 루틴(`/records/exercise/routines`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'W06',
        label: '내 운동 루틴',
        to: '/records/exercise/routines',
        returnHere: true,
      },
      // P04 내 요청 내역(`/mypage/requests`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'P04',
        label: '내 요청 내역',
        to: '/mypage/requests',
        returnHere: true,
      },
      // P13 내 문의(`/mypage/inquiries`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'P13',
        label: '내 문의',
        to: '/mypage/inquiries',
        returnHere: true,
      },
    ],
  },
  {
    id: 'account',
    title: '계정 · 설정',
    items: [
      // P02 프로필과 개인정보 설정(`/settings/profile`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'P02',
        label: '프로필·개인정보',
        to: '/settings/profile',
        returnHere: true,
      },
      // P06 키·몸무게 입력(`/settings/body`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'P06',
        label: '키·몸무게',
        to: '/settings/body',
        returnHere: true,
      },
      // P10 건강 목표 상세 설정(`/settings/health-goal`). 명세 P09의 메뉴 목록에는 없지만 사용자 지시로 계정·설정에 둔다. "이전"은 설정으로 돌아온다.
      {
        screenId: 'P10',
        label: '건강 목표',
        to: '/settings/health-goal',
        returnHere: true,
      },
      // 명세: 2차 비밀번호가 미설정이면 "등록"(P11), 설정됨이면 "변경"(P12). 메뉴 이름은 "2차 비밀번호"로 두고
      // 등록 여부(미등록·등록됨·확인 중·연결 전)를 보조 문구로 알린다. 이동은 SettingsGroup의 PinMenuRow가 정한다.
      { screenId: 'P11·P12', label: '2차 비밀번호', to: null, dynamic: 'pin' },
    ],
  },
  {
    id: 'membership',
    title: '멤버십 · 결제',
    items: [
      // P03 멤버십과 결제 관리(`/settings/membership`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'P03',
        label: '멤버십 관리',
        to: '/settings/membership',
        returnHere: true,
      },
      { screenId: null, label: '결제 내역', to: null },
    ],
  },
  {
    id: 'support',
    title: '고객지원',
    items: [
      { screenId: 'S01', label: '공지사항', to: '/support', returnHere: true },
      { screenId: 'S04', label: 'FAQ', to: '/support/faq', returnHere: true },
      // S02 문의 작성(`/support/inquiry`). "이전"은 설정으로 돌아온다.
      {
        screenId: 'S02',
        label: '문의',
        to: '/support/inquiry',
        returnHere: true,
      },
      { screenId: null, label: '약관·개인정보처리방침', to: null },
    ],
  },
]
