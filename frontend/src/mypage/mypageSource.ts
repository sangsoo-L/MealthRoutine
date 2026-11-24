import { apiRequest } from '../api/http.ts'
import type { DevAccountId } from '../auth/dev/devAccounts.ts'
import type {
  KnowledgeLevels,
  MyPageSummary,
  SampleFlags,
} from './mypageTypes.ts'

/**
 * 마이페이지(P01) 데이터 출처. 지금은 연결된 마이페이지 API가 없어서 기본은 모든 구역이 "연결 전(unavailable)"이다.
 * 가짜 수치나 0 같은 값으로 채우지 않는다. 데이터가 없는 것(empty)과 연결되지 않은 것(unavailable)은 다른 상태다.
 *
 * 개발 서버에서만 두 가지 개발용 값을 쓴다. import.meta.env.DEV는 빌드 때 상수로 바뀌어 운영 빌드에서는 이 분기와
 * 개발용 데이터 청크가 제거된다(auth/authBackend.ts와 같은 방식).
 * 1) 주소의 `?sample=1`(값이 있는 예시) / `?sample=empty`(비어 있는 예시) / `?sample=error`(불러오기 실패 예시): 디자인 검수용. 계정과 무관하다.
 * 2) 개발용 임시 회원(member.free / member.full)의 레벨·포인트: mypage/dev/devMemberData.ts. 값이 있으면 화면 맨 위의 개발용 안내 한 줄이 알린다.
 * 우선순위는 `?sample` > 계정별 개발용 값 > 연결 전이다. 계정별 값은 로그인한 계정 id로만 고른다.
 *
 * 실제 API(`GET /api/v1/users/me/rewards`, `/point-transactions`, `/users/me/profile` 등)가 정해지면
 * 응답을 MyPageSummary로 바꾸는 코드를 getMyPageSummary 안에 연결한다. 응답 구조는 아직 확정되지 않았다.
 */
const NO_SAMPLE: SampleFlags = {
  level: false,
  points: false,
  weekly: false,
}

const UNAVAILABLE_SUMMARY: MyPageSummary = {
  sample: NO_SAMPLE,
  level: { state: 'unavailable' },
  points: { state: 'unavailable' },
  weekly: { state: 'unavailable' },
}

const sampleModule = import.meta.env.DEV
  ? await import('./dev/sampleSummary.ts')
  : null

const devMemberModule = import.meta.env.DEV
  ? await import('./dev/devMemberData.ts')
  : null

function devMemberData(userId: string | null) {
  if (!devMemberModule || userId === null) return undefined
  return devMemberModule.DEV_MEMBER_DATA[userId as DevAccountId]
}

export function getMyPageSummary(
  sampleParam: string | null,
  userId: string | null,
): MyPageSummary {
  if (sampleModule) {
    if (sampleParam === '1') return sampleModule.SAMPLE_FILLED
    if (sampleParam === 'empty') return sampleModule.SAMPLE_EMPTY
    if (sampleParam === 'error') return sampleModule.SAMPLE_ERROR
  }
  const member = devMemberData(userId)
  if (member) {
    return {
      ...UNAVAILABLE_SUMMARY,
      // 레벨·포인트만 개발용 값이 있는 구역이다. 나머지 구역은 연결 전 그대로이고 예시 표시도 붙지 않는다.
      sample: { ...NO_SAMPLE, level: true, points: true },
      level: {
        state: 'ready',
        // 경험치 정책이 없으므로 진행값은 만들지 않는다.
        data: { level: member.level, progress: null },
      },
      points: { state: 'ready', data: { balance: member.points } },
    }
  }
  return UNAVAILABLE_SUMMARY
}

/** GET /api/v1/users/me/rewards 응답 */
interface MyRewardResponse {
  level: number
  totalXp: number
  nextLevelXp: number | null // 최고 레벨이면 null
  balance: number
}

const isCount = (v: unknown): v is number =>
  typeof v === 'number' && Number.isSafeInteger(v) && v >= 0

/**
 * 응답 검증: 화면에 쓰는 필드만 타입과 범위를 확인한다. 계약과 다르면 null(레벨·포인트는 "연결 전" 유지).
 * level은 1 이상 정수, totalXp·balance는 0 이상 정수(정산 전 0은 정상 값), nextLevelXp는 0 이상 정수 또는 최고 레벨의 null.
 */
export function parseRewardResponse(raw: unknown): MyRewardResponse | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!isCount(r.level) || r.level < 1) return null
  if (!isCount(r.totalXp) || !isCount(r.balance)) return null
  if (r.nextLevelXp !== null && !isCount(r.nextLevelXp)) return null
  return {
    level: r.level,
    totalXp: r.totalXp,
    nextLevelXp: r.nextLevelXp,
    balance: r.balance,
  }
}

/** 레벨·포인트 구역을 서버 값으로 채운다. 요청 실패나 계약과 다른 응답이면 null(호출한 쪽이 연결 전 상태로 둔다) */
export async function fetchServerRewardSlots(): Promise<Pick<
  MyPageSummary,
  'level' | 'points'
> | null> {
  let r: MyRewardResponse | null
  try {
    r = parseRewardResponse(
      await apiRequest<unknown>('GET', '/users/me/rewards'),
    )
  } catch {
    return null
  }
  if (!r) return null
  return {
    level: {
      state: 'ready',
      data: {
        level: r.level,
        progress:
          r.nextLevelXp === null
            ? null // 최고 레벨이면 진행바 없음
            : { experience: r.totalXp, nextLevelExperience: r.nextLevelXp },
      },
    },
    points: { state: 'ready', data: { balance: r.balance } },
  }
}

/**
 * 개발용 임시 회원의 이해도 "초기값". 응시 기록이 아니며 개발 서버의 지정된 계정에만 있다.
 * 값이 없으면(운영 빌드·지정되지 않은 계정) null이고, 호출한 쪽이 "미확인"으로 처리한다.
 */
export function getDevInitialKnowledge(
  userId: string,
): Pick<KnowledgeLevels, 'exercise' | 'meal'> | null {
  const member = devMemberData(userId)
  if (!member) return null
  return {
    exercise: { tier: member.knowledge.exercise, source: 'dev-initial' },
    meal: { tier: member.knowledge.meal, source: 'dev-initial' },
  }
}
