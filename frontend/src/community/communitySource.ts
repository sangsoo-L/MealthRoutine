import type { CommunityActor, CommunitySource } from './community.ts'

/**
 * 커뮤니티 서버 연결. 게시글·댓글·좋아요 API(README의 API 인수인계 §13 #78~89)의 요청·응답 형식이 정해지지 않아 운영 빌드는 항상 null(연결 전)이다.
 * 연결이 정해지면 이 함수가 `CommunitySource`를 구현한 객체를 돌려주도록 바꾼다(화면·조회 상태·검증은 그대로 쓴다).
 *
 * 개발 서버에서만 탭 메모리 예시 저장소(`dev/devCommunity.ts`)로 연결한다. 동적 import가 `import.meta.env.DEV` 분기 안에 있어 운영 번들에서는 코드째 제거된다.
 */
const devModule = import.meta.env.DEV
  ? await import('./dev/devCommunity.ts')
  : null

export function createCommunitySource(
  actor: CommunityActor | null,
): CommunitySource | null {
  return devModule ? devModule.createDevCommunitySource(actor) : null
}
