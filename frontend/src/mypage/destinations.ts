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
  experienceHistory: { screenId: 'P14', to: null },
  levelGuide: { screenId: 'P15', to: null },
  pointHistory: { screenId: 'P16', to: null },
  membership: { screenId: 'P03', to: null },
  weeklyExercise: { screenId: 'W10', to: null },
  weeklyMeal: { screenId: 'D03', to: null },
  weeklyScore: { screenId: 'I05', to: null },
  healthGoal: { screenId: 'P10', to: null },
  bodyUnlock: { screenId: 'P05', to: null },
  bodyEdit: { screenId: 'P06', to: null },
} as const satisfies Record<string, MyDestination>
