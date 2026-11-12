import type { Entitlement } from '../../auth/authTypes.ts'
import type { KnowledgeTier } from '../mypageTypes.ts'

/**
 * [개발 전용] 개발용 임시 회원의 마이페이지 값. 실제 회원·운영 데이터가 아니다.
 * 개발 서버에서만 불러오며(mypageSource.ts) 운영 빌드에는 포함되지 않는다.
 *
 * - 키는 개발용 계정 id(auth/dev/devAccounts.ts)다. 이메일·인증 구조·회원 유형(이용 권한)은 그 파일이 유일한 출처이고
 *   여기서는 중복해서 갖지 않는다(회원 유형은 인증 사용자의 entitlement에서 읽는다).
 * - 여기 값은 계정마다 독립이다. 레벨과 포인트 사이, 레벨과 이해도 사이에는 어떤 계산 규칙도 없다.
 *   (레벨 12여도 이해도는 초보일 수 있고, 활동 레벨로 이해도를 정하지 않는다.)
 * - 경험치(EXP) 값은 정해진 것이 없어 두지 않는다. 화면은 값을 만들지 않고 "연결 전"으로 표시한다.
 * - `knowledge`는 이해도 확인에 응시하지 않은 임시 회원의 "초기값"이다. 응시 기록이 아니므로 정답·완료 시각 등을
 *   만들지 않고 이해도 확인 결과 저장소에도 쓰지 않는다. 같은 계정에 실제 응시 결과가 있으면 그 결과가 우선한다.
 * - 코드 상수이며 저장소(sessionStorage 등)에 쓰지 않는다. 그래서 이전에 저장된 값이 새 초기값을 덮어쓰지 않는다.
 * - 값이 없는 계정(운동·식단 멤버십 임시 회원)은 레벨·포인트가 "연결 전", 이해도가 "미확인"으로 표시된다.
 * - 개발용 가입 체험(subject id `signup-experience`)의 결과는 이 계정들과 연결하지 않는다(저장 키가 다르다).
 */
export interface DevMemberData {
  level: number
  /** 보유 포인트(P). 레벨과 무관한 값이다. */
  points: number
  knowledge: { exercise: KnowledgeTier; meal: KnowledgeTier }
}

export const DEV_MEMBER_DATA: Readonly<
  Partial<Record<Entitlement, DevMemberData>>
> = {
  // 일반 회원 member.free@example.com
  free: {
    level: 3,
    points: 500,
    knowledge: { exercise: 'beginner', meal: 'beginner' },
  },
  // 종합 멤버십 회원 member.full@example.com (유료 회원)
  full: {
    level: 12,
    points: 24000,
    knowledge: { exercise: 'beginner', meal: 'beginner' },
  },
}
