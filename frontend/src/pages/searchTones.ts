/**
 * 도메인별 검색 화면이 함께 쓰는 색 클래스. 색은 도메인 토큰(exercise 인디고·meal 오렌지)만 쓰고,
 * Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다.
 */
export type Tone = 'exercise' | 'meal'

interface ToneClasses {
  /** 헤더 위쪽 그라데이션 시작색 */
  headerFrom: string
  /** 도메인 글자색 */
  text: string
  /** 포커스 윤곽선 색 */
  outline: string
  /** 선택된 선택지(옅은 면 + 테두리 + 글자) */
  selected: string
  /** 선택되지 않은 선택지의 hover 테두리 */
  hoverBorder: string
  /** 주 버튼 배경 */
  solid: string
  /** 보조 버튼(테두리형) */
  outlined: string
  /** 조건 태그 */
  tag: string
  /** 아이콘 버튼 hover 배경 */
  iconHover: string
  /** 입력창 focus 테두리·윤곽선 */
  inputFocus: string
}

export const TONES: Record<Tone, ToneClasses> = {
  exercise: {
    headerFrom: 'from-exercise-soft',
    text: 'text-exercise',
    outline: 'focus-visible:outline-exercise',
    selected: 'border-exercise bg-exercise-soft font-semibold text-exercise',
    hoverBorder: 'hover:border-exercise/50',
    solid: 'bg-exercise',
    outlined: 'border-exercise text-exercise hover:bg-exercise-soft',
    tag: 'border-exercise/20 bg-exercise-soft text-exercise',
    iconHover: 'hover:bg-exercise/10',
    inputFocus: 'focus-visible:border-exercise focus-visible:outline-exercise',
  },
  meal: {
    headerFrom: 'from-meal-soft',
    text: 'text-meal',
    outline: 'focus-visible:outline-meal',
    selected: 'border-meal bg-meal-soft font-semibold text-meal',
    hoverBorder: 'hover:border-meal/50',
    solid: 'bg-meal',
    outlined: 'border-meal text-meal hover:bg-meal-soft',
    tag: 'border-meal/20 bg-meal-soft text-meal',
    iconHover: 'hover:bg-meal/10',
    inputFocus: 'focus-visible:border-meal focus-visible:outline-meal',
  },
}

/** 일반 포커스 표시(요소 바깥 2px). */
export const focusRingOf = (tone: Tone) =>
  `focus-visible:outline-2 focus-visible:outline-offset-2 ${TONES[tone].outline}`

/**
 * 목록 안 행의 포커스 표시(요소 안쪽 -2px). 목록이 overflow-hidden이라 바깥으로 그리면 좌우가 잘린다.
 * 같은 속성을 두 번 지정하면 어느 쪽이 이길지 알 수 없어 일반 포커스 표시와 섞지 않는다.
 */
export const focusRingInsetOf = (tone: Tone) =>
  `focus-visible:outline-2 focus-visible:-outline-offset-2 ${TONES[tone].outline}`
