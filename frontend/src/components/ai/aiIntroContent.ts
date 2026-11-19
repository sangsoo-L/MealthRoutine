import type { IconName } from '../icons/iconTypes.ts'

/**
 * AI 서비스 `/ai`(I01)의 고정 문구와 기능 목록. 근거는 v5.0 명세의 I01~I05(소개·접근 정의)와 랜딩 AI 안내(LANDING_AI)다.
 * `/ai`는 로그인 상태에 따라 두 화면으로 나뉜다: 비회원 AI 소개 랜딩(AiLandingView)과 회원 전용 AI 서비스 홈(AiHomeView). 둘이 같은 기능 목록을 쓴다.
 * 이 파일의 내용은 소개와 상태 표시뿐이다: 실제 AI 추천·영양값·점수 예시를 만들지 않고, 체험 횟수를 저장하거나 차감하지 않는다.
 *
 * 기능의 제공 상태(status):
 * - available: 지금 이용할 수 있다(주간 기록 리포트의 기본 리포트: AI 미사용·무료).
 * - local: 실제 AI는 아직 없지만 로컬 예시 추천으로 체험할 수 있다(AI 운동 플랜 I02-1, 로그인한 회원만). 비회원에게는 아직 "준비 중"이다.
 * - guide: 기능 자체는 준비 중이고 안내 화면(고정 예시)만 볼 수 있다(AI 운동 플랜 I02, 비회원에게 보이는 상태).
 * - pending: 준비 중이며 눌러서 갈 곳이 없다.
 * 새 AI 기능을 더할 때는 AI_FEATURES에 한 항목만 추가하면 두 화면에 함께 나타난다.
 */
export type AiFeatureTone = 'exercise' | 'meal' | 'brand' | 'neutral'

export type AiFeatureStatus = 'available' | 'local' | 'guide' | 'pending'

export interface AiFeature {
  key: string
  tone: AiFeatureTone
  icon: IconName
  title: string
  summary: string
  /** 이용 조건(v5.0 access 항목을 쉬운 말로 옮긴 것) */
  access: string
  status: AiFeatureStatus
  /** 눌러서 갈 수 있는 화면들. memberOnly인 화면은 로그인한 회원에게만 링크로 보인다(비회원은 링크 없이 로그인 안내만). */
  links?: readonly { to: string; label: string; memberOnly: boolean }[]
}

export const AI_FEATURES: readonly AiFeature[] = [
  {
    key: 'exercise',
    tone: 'exercise',
    icon: 'dumbbell',
    title: 'AI 운동 플랜',
    summary:
      '시간·장소·도구와 내 운동 기록을 반영해 실행하기 쉬운 운동을 제안해요. 제안은 직접 고치고 운동 목록으로 저장할 수 있어요.',
    access: '유료 운동·종합 권한 · 일반 회원은 합산 5회 체험',
    // 회원은 I02-1에서 로컬 예시 추천을 체험할 수 있고(실제 AI 아님), 비회원은 I02 안내(고정 예시)만 볼 수 있다. I02는 비회원에게도 공개다.
    status: 'local',
    links: [
      {
        to: '/ai/exercise',
        label: 'AI 운동 플랜 안내 보기',
        memberOnly: false,
      },
      {
        to: '/ai/exercise/plan',
        label: '운동 조건 선택하고 예시 받기',
        memberOnly: true,
      },
    ],
  },
  {
    key: 'meal',
    tone: 'meal',
    icon: 'utensils',
    title: 'AI 식단 추천',
    summary:
      '저장된 식단 목표와 알레르기를 확인하고, 등록된 음식과 선택한 양으로 내일 식단 후보를 제안해요. 식단 목표가 있어야 이용할 수 있어요.',
    access: '유료 회원 · 일반 회원은 합산 5회 체험',
    status: 'pending',
  },
  {
    key: 'photo',
    tone: 'brand',
    icon: 'eye',
    title: '음식 사진 분석',
    summary:
      '식단 사진을 분석해 수정할 수 있는 식단 입력 초안으로 정리해요. 확인하고 고친 뒤에 기록해요.',
    access:
      '로그인 회원 전용 · 유료 식단·종합 권한 · 일반 회원은 합산 5회 체험',
    status: 'pending',
  },
  {
    key: 'weekly',
    tone: 'neutral',
    icon: 'chart',
    title: '주간 기록 리포트',
    summary:
      '한 주(월~일)의 운동·식단 기록 수로 주간 점수를 확인해요. 기본 리포트는 AI 없이 무료이고, AI 심층 코칭은 유료예요.',
    access: '기본 리포트 무료 · 심층 코칭은 유료 · 일반 회원은 합산 5회 체험',
    // 기본 주간 리포트(I05)는 AI 없이 기록 수로 계산해 이미 이용할 수 있다(AI 심층 코칭은 준비 중). I05는 회원 전용이다.
    status: 'available',
    links: [
      {
        to: '/ai/weekly-report',
        label: '주간 리포트 보기',
        memberOnly: true,
      },
    ],
  },
]

/** 상태 배지 글자. available은 "이용 가능", 그 밖(guide·pending)은 기능이 아직 제공되지 않으므로 "준비 중"이다. */
export const STATUS_LABEL: Record<AiFeatureStatus, string> = {
  available: '이용 가능',
  local: '로컬 예시',
  guide: '준비 중',
  pending: '준비 중',
}

/** 보는 사람에 따른 실제 상태. 로컬 예시(local)는 회원만 쓸 수 있어서 비회원에게는 안내만 가능한 guide다. */
export function effectiveStatus(
  feature: Pick<AiFeature, 'status'>,
  audience: 'member' | 'guest',
): AiFeatureStatus {
  return audience === 'guest' && feature.status === 'local'
    ? 'guide'
    : feature.status
}

export const AI_FLOW_STEPS = ['조건 선택', '초안 수정', '기록·회고'] as const

/** 두 화면이 함께 쓰는 문구. */
export const AI_COMMON = {
  featuresTitle: 'AI 코칭 기능',
  accessTitle: '이용 범위',
  accessLines: [
    '기본 기록과 기본 주간 리포트는 무료예요.',
    'AI 기능은 로그인 후 권한을 확인하고 이용할 수 있어요.',
    '일반 회원은 AI 운동·식단·사진·주간 코칭을 합산 5회 체험할 수 있도록 준비하고 있어요.',
    '자동으로 결제되지 않아요.',
  ],
  disclaimer: 'AI 분석 결과는 참고용이며 의료적 진단을 대신하지 않아요.',
} as const

/** 회원 전용 AI 서비스 홈(`/ai`, 로그인). */
export const AI_HOME = {
  title: 'AI 서비스 홈',
  lead: '밀스루틴의 AI 코칭 기능을 한곳에서 확인해요. 지금 이용할 수 있는 기능과 준비 중인 기능을 구분해 보여 드려요.',
  legendTitle: '상태 안내',
  legend: [
    { status: 'available', text: '지금 바로 이용할 수 있어요.' },
    {
      status: 'local',
      text: '로컬 예시로 체험할 수 있어요. 실제 AI 추천은 아니에요.',
    },
    { status: 'pending', text: '아직 제공 전이에요.' },
  ],
  flowTitle: '이용 흐름',
  flowNote: 'AI는 초안을 제안하고, 확인하고 고치는 것은 내가 해요.',
  ctaTitle: 'AI 기능은 준비 중이에요',
  ctaText: '지금은 운동과 식단 기록을 먼저 이용할 수 있어요.',
} as const

/** 비회원 AI 소개 랜딩(`/ai`, 비로그인). */
export const AI_LANDING = {
  badge: '제공 예정',
  title: '밀스루틴 AI 코칭',
  lead: '기록을 바탕으로 운동과 식단을 더 쉽게 이어가도록 돕는 제안을 준비하고 있어요.',
  heroNote:
    '지금은 기본 운동·식단 기록과 기본 주간 리포트를 무료로 이용할 수 있어요.',
  featuresLead:
    '네 가지 AI 코칭을 준비하고 있어요. 이용할 수 있는 기능과 준비 중인 기능을 표시해 두었어요.',
  loginNote: '로그인 후 이용할 수 있어요.',
  flowTitle: '이용 흐름',
  flowSteps: [
    {
      title: '로그인',
      text: '로그인하면 이용할 수 있는 기능과 권한을 확인해요.',
    },
    {
      title: '조건 선택',
      text: '운동 시간·도구, 식단 조건처럼 필요한 조건을 골라요.',
    },
    { title: '초안 수정', text: '제안받은 초안을 확인하고 내게 맞게 고쳐요.' },
    {
      title: '기록·회고',
      text: '운동과 식단을 기록하고 한 주를 돌아봐요.',
    },
  ],
  freeTitle: '기본 기록은 무료예요',
  freeText:
    '운동·식단 기록과 기본 주간 리포트는 AI 없이 무료로 이용할 수 있어요.',
  exampleTitle: 'AI 운동 플랜 미리보기',
  exampleText:
    '고정 예시로 AI 운동 플랜이 어떤 모습인지 로그인 없이 볼 수 있어요.',
  exampleLabel: '고정 예시 보기',
  ctaTitle: '로그인하고 시작해요',
  ctaText: 'AI 기능이 준비되면 로그인한 회원이 바로 이용할 수 있어요.',
} as const
