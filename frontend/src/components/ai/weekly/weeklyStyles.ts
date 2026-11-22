/** 주간 리포트(I05·I05-1) 전용 스타일 상수. AI 파트는 브랜드 블루를 쓰고, 운동은 인디고·식단은 오렌지로 구분한다. */
export const wFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export const wCard = 'rounded-card border border-line bg-surface p-4'

export const wSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

export const wPrimaryButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${wFocusRing}`

export const wSecondaryButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${wFocusRing}`

export const wChip =
  'inline-flex shrink-0 items-center rounded-full border border-line bg-page px-2.5 py-0.5 text-support leading-snug font-semibold text-muted'
