import type { Entitlement } from '../auth/authTypes.ts'
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
  return devMemberModule.DEV_MEMBER_DATA[userId as Entitlement]
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
