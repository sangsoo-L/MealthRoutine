/**
 * 공통 아이콘 이름. 스토리보드의 SVG 13종(eye-off는 eye의 숨김 상태)이다.
 * `ICON_NODES`가 이 타입의 Record라서, 이름을 추가하면 경로도 함께 정의해야 컴파일된다.
 */
export type IconName =
  // 하단 탭 (N1~N5)
  | 'home'
  | 'search'
  | 'clipboard'
  | 'sparkle'
  | 'user'
  // 앱바 (C1)
  | 'help'
  // 이후 화면에서 재사용 (U1~U7)
  | 'chevron-down'
  // 회원가입 단계의 이전 이동(스토리보드 SVG 13종에 없어 추가)
  | 'arrow-left'
  // 통합 탐색의 운동 찾기·음식 찾기 카드(스토리보드 SVG 13종에 없어 추가)
  | 'arrow-right'
  | 'chevron-right'
  // 통합검색의 검색어 삭제
  | 'close'
  | 'dumbbell'
  | 'utensils'
  | 'eye'
  | 'eye-off'
  | 'clipboard-check'
  | 'calendar-plus'
  | 'star'
  | 'clipboard-plus'
  | 'lock'

/** 스토리보드가 쓰는 아이콘 크기(px). 18: 컴팩트 버튼, 20: 입력창 안, 21: 탭·앱바·액션(기본), 30: 큰 표시 */
export type IconSize = 18 | 20 | 21 | 30
