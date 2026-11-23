/**
 * 마이페이지(P01)에서 이동하는 화면. 이동 목적지는 v5.0 스토리보드 기준이며 화면 ID로 보존한다.
 *
 * `to`가 null이면 아직 화면(경로)이 없어 링크로 만들지 않고 "준비 중"으로 표시한다. 경로는 임의로 만들지 않는다.
 * 화면이 구현되어 경로가 정해지면 해당 항목의 `to`만 채운다.
 */
export interface MyDestination {
  /** 화면명세 v5.0의 화면 ID */
  screenId: string
  /** 앱 안의 경로. 없으면 null */
  to: string | null
}

export const MY_DESTINATIONS = {
  settings: { screenId: 'P09', to: '/settings' },
  // P14 경험치 내역(`/mypage/experience`).
  experienceHistory: { screenId: 'P14', to: '/mypage/experience' },
  levelGuide: { screenId: 'P15', to: '/mypage/level' },
  // P16 포인트 내역(`/mypage/points`).
  pointHistory: { screenId: 'P16', to: '/mypage/points' },
  // P03 멤버십과 결제 관리(`/settings/membership`).
  membership: { screenId: 'P03', to: '/settings/membership' },
  weeklyExercise: { screenId: 'W10', to: '/records/exercise/my' },
  weeklyMeal: { screenId: 'D03', to: '/records/meal/list' },
  // 명세 P01은 "주간 점수 → I05"(주간 리포트)다. I05-1(기록 점수)은 I05에서 들어가는 하위 화면이라 여기서 직접 연결하지 않는다.
  weeklyScore: { screenId: 'I05', to: '/ai/weekly-report' },
  // P10 건강 목표 상세 설정(`/settings/health-goal`). P01의 건강 목표 시트와 별개로 상세 화면으로 간다.
  healthGoal: { screenId: 'P10', to: '/settings/health-goal' },
  // P05 신체 정보 확인(확인 모드). 가입 설정 모드(`/signup/pin`)는 이 항목이 아니다(보류).
  bodyUnlock: { screenId: 'P05', to: '/mypage/body/unlock' },
  // P06 키·몸무게 입력(`/settings/body`).
  bodyEdit: { screenId: 'P06', to: '/settings/body' },
  // P02 프로필과 개인정보 설정(`/settings/profile`).
  profile: { screenId: 'P02', to: '/settings/profile' },
} as const satisfies Record<string, MyDestination>

/** 마이페이지(P01)의 경로. 여기서 이동한 화면의 "이전"이 돌아올 곳으로 `state.from`에 담는다(허용 경로 검증은 useBackTarget이 한다). */
export const MY_PAGE_PATH = '/mypage'
