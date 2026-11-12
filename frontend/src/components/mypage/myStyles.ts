/**
 * 마이페이지(P01) 전용 스타일 상수. 여러 섹션이 같은 클래스를 쓰므로 한곳에서 관리한다.
 * Tailwind가 클래스를 찾을 수 있도록 값은 모두 완성된 문자열로 둔다.
 */

/** 밝은 배경 위 링크·버튼의 키보드 포커스 표시 */
export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/** 흰 카드: 모서리 12px, 경계 1px, 안쪽 여백 16px, 그림자 없음(디자인 가이드의 정보 카드) */
export const cardClass = 'rounded-card border border-line bg-surface p-4'

/** 섹션 제목(15/600) */
export const sectionTitleClass =
  'text-section-title leading-snug font-semibold text-content'

/**
 * 상태 표시 칩("준비 중", "연결 전" 등). 색이 아니라 글자로 상태를 전하고 경계로 모양을 낸다.
 * 면 색(bg-page)은 흰 카드·페이지 배경 위에서 쓴다. 옅은 색 면 위에서는 StatusNote의 onTint가 흰색으로 바꾼다.
 */
export const chipClass =
  'inline-flex shrink-0 items-center rounded-control border border-line px-1.5 py-0.5 text-support leading-snug font-semibold text-content'
