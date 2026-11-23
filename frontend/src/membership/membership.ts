/**
 * 멤버십과 결제 관리(P03)의 서버 계약과 표시 규칙. 통합 AI 멤버십 최종 정책을 따른다.
 *
 * 정책(사용자 확정):
 * - 운동·식단 통합 AI 멤버십이다. 운동·식단별 멤버십 상품 구분은 없고, 운동 AI와 식단 AI는 공통 사용량을 공유한다.
 * - 무료: 가입 후 최초 총 5회, 월간 초기화 없음. 베이직: 매월 30회, 프로: 매월 100회(두 값은 권장안이며 최종 승인 전이다).
 * - 일반 기록·조회는 AI 사용 횟수를 차감하지 않는다. 유료 멤버십의 사용 횟수는 매월 갱신된다.
 * - 가격과 결제 정책은 미확정이다.
 *
 * 구독·결제 API는 API 명세서의 89개에 없다(`GET /users/me/entitlements`는 원본에서 개발 후순위로 표시돼 연동을 전제로 구현하지 않는다,
 * API 정책 문서 §3-2). 아래 `MembershipSource`·`MembershipInfo`는 **확정된 API가 아니라** 화면이 받을 값의 모양이며, 연결된 구현
 * (`createMembershipSource`)은 지금 항상 null(연결 전)이다.
 *
 * 이 앱이 하지 않는 것: 사용량을 차감하거나 갱신하는 것, 멤버십·구독 상태를 만들거나 저장하는 것(localStorage 등), 결제 성공을 가장하는 것.
 * 멤버십 종류·잔여 횟수·갱신일·사용 내역은 모두 서버가 준 값만 화면에 보인다. 서버가 주지 않은 값은 "확인 전"이다.
 */

/** 멤버십 종류. 운동·식단 구분 없는 통합 멤버십이다. */
export type MembershipPlan = 'free' | 'basic' | 'pro'

/**
 * 통합 AI 사용량(서버 값). 운동 AI와 식단 AI가 함께 쓰는 공통 횟수다.
 * - limit: 현재 기간(무료는 가입 후 전체, 유료는 이번 달)에 쓸 수 있는 총 횟수
 * - remaining: 남은 횟수(서버가 계산해 준 값이며 이 앱은 차감하지 않는다)
 */
export interface AiUsage {
  limit: number
  remaining: number
}

/** 운동·식단별 사용 내역(서버가 줄 때만). 합은 통합 사용량의 사용 횟수와 같아야 하지만 이 앱은 맞추거나 보정하지 않는다. */
export interface AiUsageBreakdown {
  exercise: number
  meal: number
}

/**
 * 서버가 준 멤버십 정보(확정된 API 응답이 아니다).
 * - usage: 통합 AI 사용량. 서버가 주지 않으면 없음(확인 전).
 * - nextResetAt: 다음 사용량 갱신일(ISO 8601). 유료 멤버십에만 의미가 있고 서버가 주지 않으면 없음.
 * - breakdown: 운동·식단별 사용 내역. 서버가 줄 때만 있다.
 */
export interface MembershipInfo {
  plan: MembershipPlan
  usage?: AiUsage | null
  nextResetAt?: string | null
  breakdown?: AiUsageBreakdown | null
}

/**
 * 서버 연결 경계(확정된 API가 아니다).
 * - getMembership: 내 멤버십·AI 사용량 조회(읽기 전용). 결제·멤버십 시작·변경·해지·사용량 차감은 이 경계에 없다.
 */
export interface MembershipSource {
  getMembership(signal: AbortSignal): Promise<MembershipInfo>
}

/** 연결된 서버 구현. API가 정해지기 전이라 항상 null(연결 전)이다. */
export function createMembershipSource(): MembershipSource | null {
  return null
}

/** 서버 연결은 한 번 정한다(지금은 연결 전이라 null). P03과 AI 화면(I02-1·I04)이 같은 연결을 쓴다. */
export const MEMBERSHIP_SOURCE: MembershipSource | null =
  createMembershipSource()

/**
 * 멤버십 조회 상태(조회 전·로딩은 loading으로 보인다).
 * unavailable은 서버 연결 전이다. 서버에서 확인하지 않은 멤버십을 "무료"나 "베이직·프로"로 단정하지 않는다.
 */
export type MembershipState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error' }
  | { status: 'ready'; info: MembershipInfo }

/** 조회 한 번의 결과. 연결이 없으면 조회하지 않고 unavailable이다. */
export async function runGetMembership(
  source: MembershipSource | null,
  signal: AbortSignal,
): Promise<Exclude<MembershipState, { status: 'loading' }>> {
  if (source === null) return { status: 'unavailable' }
  try {
    const info = await source.getMembership(signal)
    return isMembershipInfo(info)
      ? { status: 'ready', info }
      : { status: 'error' }
  } catch {
    return { status: 'error' }
  }
}

const PLANS: readonly string[] = ['free', 'basic', 'pro']

const isCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0

function isAiUsage(value: unknown): value is AiUsage {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return isCount(v.limit) && isCount(v.remaining) && v.remaining <= v.limit
}

function isBreakdown(value: unknown): value is AiUsageBreakdown {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return isCount(v.exercise) && isCount(v.meal)
}

/**
 * 서버 값이 화면이 아는 모양인지(모르는 모양은 조회 실패로 본다. 멤버십·사용량을 지어내지 않는다).
 * 종류는 무료·베이직·프로만 허용한다(옛 운동·식단·종합 구분 값은 모르는 모양이다).
 */
export function isMembershipInfo(value: unknown): value is MembershipInfo {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (typeof v.plan !== 'string' || !PLANS.includes(v.plan)) return false
  if (v.usage != null && !isAiUsage(v.usage)) return false
  if (v.nextResetAt != null && typeof v.nextResetAt !== 'string') return false
  if (v.breakdown != null && !isBreakdown(v.breakdown)) return false
  return true
}

/** 멤버십 이름. 서버가 준 종류의 표시 이름이다. */
export const MEMBERSHIP_PLAN_LABEL: Record<MembershipPlan, string> = {
  free: '무료',
  basic: '베이직',
  pro: '프로',
}

const dateFormat = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** 날짜(한국 시간). 없거나 올바르지 않으면 "확인 전". */
export function membershipDateLabel(value: string | null | undefined): string {
  const time = value == null ? NaN : Date.parse(value)
  return Number.isNaN(time) ? '확인 전' : dateFormat.format(new Date(time))
}

/** 횟수 표시. 서버가 유효한 값을 주지 않으면 "확인 전"이다. */
export function usageCountLabel(value: number | null | undefined): string {
  return isCount(value) ? `${value}회` : '확인 전'
}

/**
 * 사용량 진행 표시용 값(표시 계산일 뿐 저장·차감이 아니다). 서버가 준 limit·remaining에서 사용 횟수와 비율(0~100)을 구한다.
 * 한도가 0이면 비율은 0이다.
 */
export function usageProgress(usage: AiUsage): {
  used: number
  percent: number
} {
  const used = usage.limit - usage.remaining
  return {
    used,
    percent: usage.limit === 0 ? 0 : Math.round((used / usage.limit) * 100),
  }
}

/** 사용 횟수를 모두 쓴 상태(서버가 준 잔여가 0일 때만). 프론트엔드가 횟수를 세어 판단하지 않는다. */
export function isUsageExhausted(info: MembershipInfo): boolean {
  return info.usage != null && info.usage.remaining === 0
}

/** 서버 연결 전 안내(멤버십·결제 기능). 실제 결제·멤버십 변경이 되지 않는다는 사실을 분명히 알린다. */
export const MEMBERSHIP_UNAVAILABLE_TEXT =
  '멤버십·사용량 정보가 아직 서버에 연결되지 않았어요. 지금은 내 멤버십과 AI 잔여 횟수를 확인하거나 멤버십을 시작·변경할 수 없어요.'

/** 사용 내역을 서버가 주지 않을 때 안내. 운동·식단별 숫자를 만들지 않는다. */
export const BREAKDOWN_EMPTY_TEXT =
  '운동·식단별 사용 내역은 서버에서 제공하면 이곳에 표시해요. 지금은 보여 줄 내역이 없어요.'

/** 운동 AI와 식단 AI가 한 횟수를 함께 쓰고 일반 기록·조회는 차감하지 않는다는 공통 안내. */
export const USAGE_RULES: readonly string[] = [
  '운동 AI와 식단 AI는 같은 횟수를 함께 사용해요.',
  '운동·식단 기록과 조회는 AI 사용 횟수를 쓰지 않아요.',
]

/**
 * 멤버십 비교. 무료·베이직·프로의 AI 사용 횟수 정책이다.
 * 베이직·프로의 횟수는 권장안이며 최종 승인 전이라 `confirmed: false`로 알린다. 가격은 확정 전이라 두지 않는다.
 */
export const MEMBERSHIP_PLANS: readonly {
  plan: MembershipPlan
  name: string
  count: string
  renewal: string
  confirmed: boolean
}[] = [
  {
    plan: 'free',
    name: '무료',
    count: '가입 후 최초 총 5회',
    renewal: '월간 초기화 없음',
    confirmed: true,
  },
  {
    plan: 'basic',
    name: '베이직',
    count: '매월 30회',
    renewal: '매월 사용량 갱신',
    confirmed: false,
  },
  {
    plan: 'pro',
    name: '프로',
    count: '매월 100회',
    renewal: '매월 사용량 갱신',
    confirmed: false,
  },
]

/** 비교 아래 안내. 가격과 결제 정책이 정해지지 않았고 유료 횟수가 최종 승인 전임을 알린다. */
export const MEMBERSHIP_COMPARE_NOTE =
  '베이직·프로의 횟수는 안내용 권장안이며 최종 확정 전이에요. 가격과 결제 방식도 아직 정해지지 않았어요.'

/** 사용 횟수 소진 안내(정적). 소진되면 AI 기능만 멈추고 기록·조회는 계속 쓸 수 있다. */
export const EXHAUSTED_GUIDE_TEXT =
  'AI 사용 횟수를 모두 쓰면 AI 기능은 이용할 수 없어요. 운동·식단 기록과 조회는 횟수와 상관없이 계속 쓸 수 있어요.'

/** 소진 상태(서버 확인) 안내. 무료는 갱신이 없고 유료는 갱신일에 다시 쓸 수 있다. */
export function exhaustedNoticeText(info: MembershipInfo): string {
  if (info.plan === 'free')
    return '무료로 제공되는 AI 사용 횟수를 모두 사용했어요. 무료 횟수는 매월 다시 채워지지 않아요. 기록과 조회는 계속 쓸 수 있어요.'
  return info.nextResetAt != null &&
    membershipDateLabel(info.nextResetAt) !== '확인 전'
    ? `이번 달 AI 사용 횟수를 모두 사용했어요. ${membershipDateLabel(info.nextResetAt)}에 사용량이 갱신돼요.`
    : '이번 달 AI 사용 횟수를 모두 사용했어요. 다음 사용량 갱신일에 다시 쓸 수 있어요.'
}

/** AI 사용 횟수 FAQ(명세 P03 "무료 체험 FAQ 드롭다운"). 확정된 정책만 담는다. */
export const MEMBERSHIP_FAQ: readonly { q: string; a: string }[] = [
  {
    q: '무료 AI 횟수는 어떻게 쓰이나요?',
    a: '가입 후 최초 총 5회까지 쓸 수 있어요. 월간 초기화는 없고, 운동 AI와 식단 AI가 같은 횟수를 함께 써요.',
  },
  {
    q: '어떤 때에 횟수를 쓰나요?',
    a: 'AI 기능을 이용할 때만 사용해요. 운동·식단 기록과 조회, 기본 주간 리포트는 횟수를 쓰지 않아요.',
  },
  {
    q: '유료 멤버십의 횟수는 언제 갱신되나요?',
    a: '베이직·프로의 사용 횟수는 매월 갱신돼요. 다음 갱신일은 서버에 연결되면 이곳에서 확인할 수 있어요.',
  },
  {
    q: '자동으로 결제되나요?',
    a: '자동으로 결제되지 않아요. 가격과 결제 정책은 아직 정해지지 않았고, 정해지면 이곳에서 안내해요.',
  },
]

/** 결제 관리 영역 문구. 요금 미확정, 결제 내역은 만들지 않음, 이용 조건, 변경 준비 중. */
export const PAYMENT_TEXT = {
  pricing:
    '요금과 결제 방식은 아직 정해지지 않았어요. 정해지면 이곳에서 안내해요.',
  historyTitle: '결제 내역',
  history:
    '결제 기능이 서버에 연결되기 전이라 표시할 결제 내역이 없어요. 내역을 예시로 만들어 보여 주지 않아요.',
  terms: [
    '자동으로 결제되지 않아요.',
    '결제를 하지 않아도 기본 기록 기능은 계속 쓸 수 있어요.',
  ],
  preparing:
    '결제와 멤버십 변경 기능은 준비 중이에요. 지금은 멤버십을 시작하거나 변경할 수 없어요.',
  actionsOff: '결제·멤버십 변경은 준비가 끝나면 이용할 수 있어요.',
} as const

/** P03 경로(명세 v5.0에 URL이 없어 화면 대응표의 임시 확정 값을 쓴다). */
export const PATH_MEMBERSHIP = '/settings/membership'
