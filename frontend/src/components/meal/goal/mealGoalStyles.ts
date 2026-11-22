/** 식단 목표 화면 전용 스타일. 식단 도메인 색(meal, 오렌지)을 쓴다. */
export const goalCard = 'rounded-card border border-line bg-surface p-4'
export const goalHeading =
  'text-section-title leading-snug font-semibold text-content'

// 기존 입력과 같은 16px 예외: 모바일 Safari의 입력 확대를 막는다(운동 목표 입력과 같다).
export const goalInput = `min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-meal focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-meal aria-invalid:border-danger aria-invalid:bg-danger-soft`
