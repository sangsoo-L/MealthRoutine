import type { AssessmentLevelCode } from '../onboarding-assessment/assessmentTypes.ts'

/**
 * 마이페이지(P01) 화면 데이터의 타입.
 *
 * 연결된 마이페이지 API가 없어서 응답 구조가 정해지지 않았다. 이 타입은 화면이 필요로 하는 값만 담은 임시 형태이며
 * 실제 API 응답 구조가 아니다. API가 확정되면 응답을 이 형태로 바꾸는 변환을 `mypageSource.ts`에 둔다.
 * 닉네임·회원 유형은 인증 정보(AuthUser)에서 오므로 여기에 두지 않는다.
 */

/**
 * 한 구역의 데이터 상태.
 * - ready: 값이 있다.
 * - unavailable: API가 연결되지 않아 값을 알 수 없다. 데이터가 없는 것과는 다른 상태다.
 */
export type Slot<T> = { state: 'ready'; data: T } | { state: 'unavailable' }

/**
 * 연결은 되어 있지만 아직 값이 없을 수 있는 구역. 세 가지 "값 없음"은 서로 다른 상태이고 화면 문구도 다르다.
 * - empty: 연결됐고 기록이 0건이다(아직 활동·설정이 없음).
 * - unavailable: API가 연결되지 않아 알 수 없다(Slot과 같음).
 * - error: 불러오는 중 문제가 생겼다. 아직 불러오는 호출이 없어 실제로는 개발용 `?sample=error` 예시로만 나타난다.
 */
export type OptionalSlot<T> = Slot<T> | { state: 'empty' } | { state: 'error' }

/**
 * 이해도 단계. 운동·식단 이해도 확인(onboarding-assessment)의 단계 코드를 그대로 쓴다(타입을 새로 만들지 않는다).
 * 활동 레벨(경험치 누적)과 별개의 값이며 서로 계산하거나 대체하지 않는다.
 */
export type KnowledgeTier = AssessmentLevelCode

/**
 * 이해도 값의 출처. 화면은 출처를 구분해서 보여 준다.
 * - assessment: 이 계정이 이해도 확인에 응시한 실제 결과(Mock 저장소 포함)
 * - dev-initial: 개발용 임시 회원의 초기값. 응시 기록이 아니다(개발 서버 한정).
 */
export type KnowledgeSource = 'assessment' | 'dev-initial'

export interface KnowledgeEntry {
  tier: KnowledgeTier
  source: KnowledgeSource
}

/**
 * 영역별 이해도. 운동과 식단은 서로 독립이며 한쪽만 값이 있을 수 있다.
 * null은 해당 영역의 값을 알 수 없다는 뜻이다("미확인"으로 표시하고 초보 등으로 채우지 않는다).
 */
export interface KnowledgeLevels {
  exercise: KnowledgeEntry | null
  meal: KnowledgeEntry | null
}

/**
 * 이해도를 불러오는 상태.
 * - loading: 불러오는 중
 * - error: 불러오지 못함(다시 시도 가능)
 * - unavailable: 이 빌드에서는 조회 수단이 없음(운영 빌드, 이해도 API 연결 전)
 * - ready: 조회를 마침. 값이 없는 영역은 null(미확인)
 */
export type KnowledgeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'unavailable' }
  | { status: 'ready'; levels: KnowledgeLevels }

/** 경험치 진행. 레벨 기준·경험치 정책이 확정되지 않아 값이 없으면 null이며 화면이 값을 만들지 않는다. */
export interface ExperienceProgress {
  experience: number
  nextLevelExperience: number
}

/** 활동 레벨(경험치 누적 기준). 이해도와 서로 계산하거나 대체하지 않는다. */
export interface ActivityLevel {
  level: number
  /** 경험치 진행. 알 수 없으면 null */
  progress: ExperienceProgress | null
}

export interface PointBalance {
  balance: number
}

/** 이번 주 활동 수치. 기간(주차·날짜 범위)은 백엔드 주간 리포트 기준이 정해질 때까지 담지 않는다. */
export interface WeeklyActivityData {
  exerciseCount: number
  mealCount: number
  score: number
}

/**
 * 개발용 값이 적용된 구역. 값이 개발용 예시·초기값인 구역에만 "개발용 예시" 표시를 붙인다.
 * 운영 빌드에서는 모두 false다.
 */
export interface SampleFlags {
  level: boolean
  points: boolean
  weekly: boolean
}

/** 이해도(지식 수준)는 비동기로 따로 불러오므로 이 요약에 없다(mypage/useKnowledgeLevels.ts). */
export interface MyPageSummary {
  sample: SampleFlags
  level: Slot<ActivityLevel>
  points: Slot<PointBalance>
  weekly: OptionalSlot<WeeklyActivityData>
}
