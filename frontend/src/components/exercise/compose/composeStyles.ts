export const composeFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise'

/** 카드의 공통 모양(배경·테두리 색은 변형이 정한다: 같은 속성을 두 번 지정하지 않는다). */
const composeCardBase = 'rounded-card border p-4'

export const composeCard = `${composeCardBase} border-line bg-surface`

/** 눌 수 없는 안내 카드(준비 중). */
export const composeCardMuted = `${composeCardBase} border-line bg-page`

/** 강조 테두리 카드(확인 안내 상자). */
export const composeCardActive = `${composeCardBase} border-exercise bg-surface`

export const composeSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

/** 윤곽선 보조 버튼(운동 인디고). 최소 높이 44px. */
export const composeSecondaryButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${composeFocusRing}`

/** 채운 주 버튼. 최소 높이 48px. */
export const composePrimaryButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-exercise px-4 text-body font-semibold text-surface transition-colors hover:opacity-90 motion-reduce:transition-none ${composeFocusRing}`

/** 카드 안의 작은 아이콘·글자 버튼(순서 이동·삭제). 터치 영역 44px. */
export const composeIconButton = `flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-2 text-body font-normal text-content hover:border-exercise/40 disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50 ${composeFocusRing}`

/** text-base(16px): 모바일 Safari가 16px 미만 입력창에 포커스하면 화면을 확대하므로 입력값에만 적용한다(글자 크기 토큰의 예외, 운동 탐색 입력창과 같다). */
export const composeInput =
  'h-11 w-full rounded-control border border-muted/75 bg-surface px-3 text-base font-normal text-content focus-visible:border-exercise focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-exercise aria-invalid:border-danger'

/** 입력의 DOM id. 오류가 생기면 첫 오류 입력으로 포커스를 옮기는 데 쓴다. */
export function fieldId(
  itemId: string,
  setIndex: number | null,
  field: string,
): string {
  return `compose-${itemId}-${setIndex ?? 'x'}-${field}`
}

export function itemCardId(itemId: string): string {
  return `compose-item-${itemId}`
}

/** 운동 순서 이동 버튼의 DOM id(이동 뒤 포커스를 되돌리는 데 쓴다). */
export function moveButtonId(itemId: string, direction: 'up' | 'down'): string {
  return `compose-move-${itemId}-${direction}`
}
