/**
 * 오늘의 퀴즈(H02) 전용 스타일 상수. 도메인색이 없는 화면이라 브랜드 블루를 쓴다.
 * Tailwind가 클래스를 찾을 수 있도록 값은 모두 완성된 문자열로 둔다.
 */

export const quizFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export const quizCard = 'rounded-card border border-line bg-surface p-4'

export const quizPrimaryButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50 motion-reduce:transition-none ${quizFocusRing}`

export const quizSecondaryButton = `flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${quizFocusRing}`

export const quizSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

/** 영역(운동·식단) 칩의 색. 글자로도 영역을 알리므로 색만으로 구분하지 않는다. */
export const QUIZ_DOMAIN_CHIP = {
  exercise: 'bg-exercise-soft text-exercise',
  meal: 'bg-meal-soft text-meal',
} as const
