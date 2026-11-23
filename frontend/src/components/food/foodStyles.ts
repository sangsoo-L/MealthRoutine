/** 식단(음식·식단 기록) 화면 전용 스타일 상수. 식단 도메인 색(meal, 오렌지)을 쓴다. */

export const mealFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-meal'

/** 흰 카드: 모서리 12px, 경계 1px, 안쪽 여백 16px. */
export const mealCard = 'rounded-card border border-line bg-surface p-4'

export const mealSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

/** 채운 주 버튼(식단 오렌지). 최소 높이 48px. */
export const mealPrimaryButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-meal px-4 text-body font-semibold text-surface transition-colors hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none ${mealFocusRing}`

/** 윤곽선 보조 버튼(식단 오렌지). 최소 높이 44px. */
export const mealSecondaryButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-meal bg-surface px-4 text-body font-semibold text-meal transition-colors hover:bg-meal-soft aria-disabled:cursor-not-allowed aria-disabled:opacity-60 motion-reduce:transition-none ${mealFocusRing}`

/** 위험한 동작(삭제)의 채운 버튼. */
export const mealDangerButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-danger px-4 text-body font-semibold text-surface hover:opacity-90 aria-disabled:cursor-wait aria-disabled:opacity-60 ${mealFocusRing}`

/** 상태 칩(개발용 예시 표시 등). 색이 아니라 글자로 상태를 전한다. */
export const mealChip =
  'inline-flex shrink-0 items-center rounded-full border border-line bg-page px-2.5 py-0.5 text-support leading-snug font-semibold text-muted'
