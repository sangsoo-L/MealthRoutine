/**
 * 로그인(A01)·회원가입(A03)이 함께 쓰는 Tailwind 클래스.
 * 두 화면의 입력창·라벨·버튼·안내 스타일을 한곳에서 관리해 같은 서비스로 보이게 한다.
 */

export const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * - text-base(16px): 타입 스케일(본문 14px)의 예외다. 모바일 Safari는 16px 미만 입력창에
 *   포커스하면 화면을 확대하므로 입력값에만 적용하고, placeholder는 본문 크기를 유지한다.
 * - border-muted/75: line 토큰은 흰 배경 대비가 1.24:1이라 입력창 경계로 약하다. 3.22:1을 확보한다.
 *   (경계는 채움 배경으로 대체하지 않는다. 오류 상태에서도 danger 테두리로 유지한다.)
 * - placeholder-shown:text-ellipsis: 글자 확대로 placeholder가 입력창보다 길어지면 글자 조각이 보이게 잘리므로
 *   말줄임으로 정리한다. placeholder가 보이는 동안(입력이 비어 있을 때)에만 적용되어 입력값의 표시·편집에는 영향이 없다.
 * - read-only:bg-page: 읽기 전용(주소)은 면 색으로 구분하되 경계는 그대로 둔다.
 */
const inputBase =
  'h-12 rounded-control border border-muted/75 bg-surface px-4 text-base font-normal text-content transition-colors placeholder:text-body placeholder:text-muted placeholder-shown:text-ellipsis hover:border-muted read-only:bg-page focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-[invalid=true]:border-danger aria-[invalid=true]:bg-danger-soft aria-[invalid=true]:focus-visible:outline-danger motion-reduce:transition-none'

export const inputClass = `w-full ${inputBase}`

/** 버튼과 나란히 놓는 입력창. 폭이 좁으면(글자 확대 등) 버튼이 아래 줄로 내려간다. */
export const inputWithActionClass = `min-w-0 flex-1 basis-40 ${inputBase}`

export const labelClass = 'mb-2 block text-body font-normal text-content'

/** 입력 + 보조 행동(본인인증·중복확인·주소 검색) 행의 보조 버튼. 입력창과 높이(48px)를 맞춘다. */
export const actionButtonClass = `min-h-12 min-w-24 shrink-0 cursor-pointer rounded-control border border-brand/25 bg-brand-soft px-4 text-body font-semibold text-brand transition-colors hover:border-brand/50 hover:bg-brand/10 active:bg-brand/15 motion-reduce:transition-none ${focusRing}`

/** 주 버튼(전체 폭). 비활성·처리 중 상태는 각 화면에서 덧붙인다. */
export const primaryButtonClass = `flex min-h-13 w-full cursor-pointer items-center justify-center rounded-control bg-brand text-body font-semibold text-surface transition-colors hover:bg-brand-hover active:bg-brand-hover motion-reduce:transition-none ${focusRing}`

/** 하단 안내 블록 안의 보조 링크 버튼(전체 폭, 44px 이상). */
export const secondaryLinkClass = `flex min-h-12 w-full items-center justify-center gap-1 rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`

/**
 * 안내 메시지 공통 모양. 왼쪽 기호는 ::before로 그려 글자 내용(textContent)에 섞이지 않게 하고,
 * 대체 텍스트를 빈 문자열로 줘서(content: '…' / '') 보조기기가 읽지 않게 한다.
 * 색만으로 전하지 않도록 기호와 글자를 함께 둔다.
 */
const messageBase =
  'mt-3 flex items-start gap-2 rounded-control px-[12px] py-[10px] text-support leading-relaxed font-normal before:flex before:size-4 before:shrink-0 before:items-center before:justify-center before:rounded-full before:text-support before:leading-none before:font-semibold'

export const errorClass = `${messageBase} border border-danger/30 bg-danger-soft text-danger before:bg-danger before:text-surface before:content-['!'_/_'']`

export const noticeClass = `${messageBase} border border-brand/20 bg-brand-soft text-content before:bg-brand before:text-surface before:content-['i'_/_'']`

/** 단계 이동의 보조 버튼("이전"). secondaryLinkClass와 같은 모양의 <button>이다. */
export const secondaryButtonClass = `flex min-h-13 w-full cursor-pointer items-center justify-center gap-1 rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`

/** 주 버튼이 비활성일 때의 모양. 회색 덩어리 대신 점선 테두리의 빈 버튼으로 "아직 누를 수 없음"을 보여 준다. */
export const primaryDisabledClass =
  'disabled:cursor-not-allowed disabled:border disabled:border-dashed disabled:border-muted/60 disabled:bg-page disabled:text-muted'

/**
 * 순차 등장하는 필드의 전환: 투명 → 불투명, 8px 아래 → 제자리, 200ms. 튀거나 커지는 효과는 없다.
 * `starting:`은 요소가 처음 그려질 때의 시작 상태이고, 지원하지 않는 브라우저에서는 그냥 나타난다.
 * 움직임을 줄이는 설정(prefers-reduced-motion)에서는 전환 없이 바로 나타난다.
 */
export const revealClass =
  'transition-[opacity,translate] duration-200 ease-out starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none motion-reduce:starting:translate-y-0 motion-reduce:starting:opacity-100'
