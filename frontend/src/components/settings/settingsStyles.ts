/**
 * 상세 설정(P09) 전용 스타일 상수. 면·경계·포커스 규칙은 마이페이지(P01)와 같은 값을 쓴다.
 * Tailwind가 클래스를 찾을 수 있도록 값은 모두 완성된 문자열로 둔다.
 */

/** 행 하나. 높이 48px 이상이고 행 전체가 눌린다. 카드 안쪽에 포커스 표시가 그려지도록 outline을 안쪽으로 당긴다. */
export const rowBaseClass =
  'flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left text-body leading-snug'

/** 눌리는 행의 공통 모양(링크·버튼) */
export const rowActionClass = `${rowBaseClass} cursor-pointer transition-colors hover:bg-page motion-reduce:transition-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand`
