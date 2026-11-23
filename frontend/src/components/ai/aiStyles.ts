/** AI 서비스 화면(`/ai` 랜딩·홈) 공용 스타일 상수. AI는 브랜드 블루, 기능별로 운동 인디고·식단 오렌지를 쓴다. */
export const aiFocusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

export const aiCard = 'rounded-card border border-line bg-surface p-4'

export const aiSectionTitle =
  'text-section-title leading-snug font-semibold text-content'

export const aiPrimaryButton = `flex min-h-12 items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface hover:bg-brand-hover ${aiFocusRing}`

export const aiSecondaryButton = `flex min-h-11 items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${aiFocusRing}`

/*
 * 서비스 화면(비회원 AI 랜딩·회원 AI 코칭 허브) 공용 스타일. 두 화면이 같은 값을 써서 같은 서비스로 보이게 한다.
 * 글자 크기 예외(사용자 지시: 페이지 제목 26px 전후, 카드 제목 18~20px, 설명 15~16px, 보조 13px 이상):
 * - 페이지 제목은 타입 스케일에서 가장 가까운 text-metric(26px)을 쓴다.
 * - 카드·섹션 제목은 스케일에 18~20px가 없어 text-xl(20px), 설명·기능명은 text-base(16px), 보조 안내는 text-sm(14px)을 쓴다.
 * - 배지는 text-support(12px)다. 카드 모서리 18px(rounded-[1.125rem])도 같은 이유의 예외다(기존 rounded-card는 12px).
 * 이 예외는 이 두 화면에만 쓰고 전역 토큰은 바꾸지 않는다.
 */
import type { AiFeatureTone } from './aiIntroContent.ts'

export const aiPageTitle = 'text-metric leading-snug font-semibold text-content'

export const aiPanel =
  'rounded-[1.125rem] border border-line bg-surface p-4 min-[360px]:p-5'

export const aiPanelTitle = 'text-xl leading-snug font-semibold text-content'

export const aiBadge =
  'inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-support leading-none font-semibold'

/** 기능 아이콘 칸 색. 이름·상태 글자도 함께 있어 색만으로 구분하지 않는다. */
export const AI_TONE: Record<AiFeatureTone, string> = {
  exercise: 'bg-exercise-soft text-exercise',
  meal: 'bg-meal-soft text-meal',
  brand: 'bg-brand-soft text-brand',
  neutral: 'bg-page text-content',
}

/** 화면의 대표 행동(채움 버튼). 화면마다 하나만 쓴다. */
export const aiFillButton = `flex min-h-12 items-center justify-center gap-1 rounded-control bg-brand px-4 text-base font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${aiFocusRing}`

/** 보조 행동(테두리 버튼). */
export const aiOutlineButton = `flex min-h-11 items-center justify-between gap-2 rounded-control border border-brand bg-surface px-4 text-base font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${aiFocusRing}`

/** 카드 안의 텍스트 링크 행(구분선 위, 44px 이상). */
export const aiLinkRow = `flex min-h-11 items-center justify-between gap-2 text-base font-semibold text-brand ${aiFocusRing}`
