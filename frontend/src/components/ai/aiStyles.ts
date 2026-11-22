/** AI 서비스 화면(`/ai` 랜딩·홈) 공용 스타일 상수. AI는 브랜드 블루, 기능별로 운동 인디고·식단 오렌지를 쓴다. */
export const aiFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export const aiCard = 'rounded-card border border-line bg-surface p-4'

export const aiSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

export const aiPrimaryButton = `flex min-h-12 items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface hover:bg-brand-hover ${aiFocusRing}`

export const aiSecondaryButton = `flex min-h-11 items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${aiFocusRing}`
