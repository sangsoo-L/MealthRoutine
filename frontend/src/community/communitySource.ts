import type { CommunityActor, CommunitySource } from './community.ts'
import { createServerCommunitySource } from './serverCommunitySource.ts'

/**
 * 커뮤니티 연결(C1). 실제/모의 모드는 F1-D3과 같은 기준이다(bodySource.ts·pinSource.ts와 같은 식).
 * - 모의 모드(개발 서버 + `VITE_DEV_AUTH=true`, 모의 로그인): 탭 메모리 예시 저장소(`dev/devCommunity.ts`). 글·댓글·응원 모두 동작한다.
 * - 실제 모드(개발 기본·운영 빌드): 서버 연결(`serverCommunitySource.ts`). 자유게시판 목록·상세·작성과 내 글 수정·삭제(C2)가 있다.
 *   로그인한 사용자(actor)가 있으면 회원 연결로 만들어 상세에서 `mine`을 받는다. 비회원은 토큰 없이 읽는다.
 *
 * 모의 모드 식은 빌드 때 상수가 되어, 운영 번들에서는 예시 저장소가 코드째 제거된다. 서버 실패 때 예시 저장소로 넘어가지 않는다.
 */
const MOCK_AUTH =
  import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH === 'true'

const devModule = MOCK_AUTH ? await import('./dev/devCommunity.ts') : null

export function createCommunitySource(
  actor: CommunityActor | null,
): CommunitySource | null {
  if (!MOCK_AUTH)
    return createServerCommunitySource(undefined, { member: actor !== null })
  return devModule ? devModule.createDevCommunitySource(actor) : null
}
