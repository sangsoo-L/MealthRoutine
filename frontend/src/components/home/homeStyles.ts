/**
 * H01 홈 전용 스타일 상수. 여러 섹션이 같은 클래스를 쓰므로 한곳에서 관리한다.
 * Tailwind가 클래스를 찾을 수 있도록 값은 모두 완성된 문자열로 둔다.
 */

/** 밝은 배경 위 링크·버튼의 키보드 포커스 표시 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/** 브랜드 블루 배경 위 링크·버튼의 키보드 포커스 표시(파란 윤곽선은 파란 배경에서 보이지 않는다) */
export const focusRingOnBrand =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-surface'

/**
 * 회원 홈에서 섹션을 구분하는 흰 밴드. 화면 폭 전체로 펼쳐지는 흰 면에 위아래 얇은 선을 둔다(카드가 아니다).
 * -mx-5/px-5는 AppShell 본문의 좌우 여백(px-5 = 20px)과 짝이다: 밴드는 그 여백을 뚫고 프레임 양 끝까지 가고, 안의 글은 다시 같은 20px에서 시작한다.
 * AppShell의 본문 좌우 여백을 바꾸면 이 값도 함께 바꾼다. 밴드는 회원 홈의 두 섹션(오늘의 기록·처음이라면 여기부터)에만 쓴다.
 */
export const sectionBand = '-mx-5 border-y border-line bg-surface px-5 py-6'

/** 운동(인디고)·식단(앰버) 도메인별 색 클래스 */
export const DOMAIN_TONE = {
  exercise: {
    label: 'text-exercise',
    tile: 'bg-exercise-soft',
    panel: 'border-exercise/30 bg-exercise-soft',
    line: 'border-exercise/20',
    value: 'text-exercise',
    // hover는 배경을 어둡게 하지 않고 테두리만 진하게: 배경이 어두워지면 앰버 글자 대비가 4.5:1 아래로 내려간다.
    cta: 'border-exercise/20 bg-exercise-soft text-exercise hover:border-exercise/50',
  },
  meal: {
    label: 'text-meal',
    tile: 'bg-meal-soft',
    panel: 'border-meal/30 bg-meal-soft',
    line: 'border-meal/20',
    value: 'text-meal',
    cta: 'border-meal/20 bg-meal-soft text-meal hover:border-meal/50',
  },
} as const
