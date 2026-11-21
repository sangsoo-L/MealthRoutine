export const goalFocus =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'
export const goalCard = 'rounded-card border border-line bg-surface p-4'
export const goalHeading =
  'text-section-title leading-snug font-semibold text-content'
export const goalPrimary = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-exercise px-4 py-3 text-body font-semibold text-surface hover:bg-exercise/90 disabled:cursor-wait disabled:opacity-60 ${goalFocus}`
export const goalSecondary = `flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-4 py-2 text-body font-semibold text-content hover:bg-page disabled:cursor-wait disabled:opacity-60 ${goalFocus}`

// 기존 인증 입력과 같은 16px 예외: 모바일 Safari의 입력 확대를 막는다.
export const goalInput =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-exercise focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-exercise aria-invalid:border-danger aria-invalid:bg-danger-soft'
