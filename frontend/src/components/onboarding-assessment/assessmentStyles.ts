/**
 * 운동·식단 이해도 확인 화면 전용 스타일 상수. Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다.
 * 질문 카드·버튼의 모양은 A02 초기설문(SurveyPage)과 같은 계열이라 가입 흐름에서 자연스럽게 이어진다.
 */

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 안내·질문·결과를 담는 흰 카드. 좌우 안쪽 여백을 px로 고정한다(px-[16px]): rem 여백은 글자를 200%로 키우면 함께 두 배가 되어
 * 좁은 화면에서 본문 폭이 모자라기 때문이다(SurveyPage와 같은 이유).
 */
export const cardClass =
  'rounded-card border border-line bg-surface px-[16px] py-5'

/** 주 버튼(브랜드 블루). 폭이 모자라면 이전 버튼 아래로 내려간다. */
export const primaryButtonClass = `flex min-h-12 flex-1 basis-40 cursor-pointer items-center justify-center gap-2 rounded-control bg-brand px-4 text-body leading-snug font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${focusRing}`

/** 보조 버튼(이전) */
export const secondaryButtonClass = `flex min-h-12 shrink-0 cursor-pointer items-center justify-center rounded-control border border-muted/40 bg-surface px-5 text-body leading-snug font-normal text-muted transition-colors hover:border-muted motion-reduce:transition-none ${focusRing}`

/** 눌러도 동작하지 않는 주 버튼(답 미선택·제출 중). aria-disabled와 함께 쓰며 포커스는 유지한다. */
export const disabledButtonClass = `flex min-h-12 flex-1 basis-40 cursor-not-allowed items-center justify-center gap-2 rounded-control bg-line px-4 text-body leading-snug font-semibold text-muted ${focusRing}`

/** 도메인 표시(운동 인디고·식단 앰버). 글자로도 구분되며 색만으로 전하지 않는다. */
export const DOMAIN_CHIP_CLASS = {
  exercise: 'bg-exercise-soft text-exercise',
  meal: 'bg-meal-soft text-meal',
} as const
