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
