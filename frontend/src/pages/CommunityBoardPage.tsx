import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import CommunityBoardView from '../components/community/CommunityBoardView.tsx'
import type { CommunityBoard } from '../community/community.ts'
import { useCommunitySource, usePostList } from '../community/useCommunity.ts'

const TITLE: Record<CommunityBoard, string> = {
  free: '자유게시판',
  qa: '초보자 Q&A',
}

/**
 * C01 자유게시판(`/community`) · C01-2 초보자 Q&A(`/community/qa`) 목록(비회원도 열람). 서버가 준 글만 보이며(서버 연결 전에는 "아직 글을 볼 수 없어요"),
 * 글을 지어내거나 세지 않는다. 글쓰기(질문하기)는 작성 화면(C02·C02-1, 회원 전용)으로 이동한다. 상위 화면은 홈이고 화면이 h1을 직접 가진다.
 */
export default function CommunityBoardPage({
  board,
}: {
  board: CommunityBoard
}) {
  usePageTitle(TITLE[board])
  const source = useCommunitySource()
  const { state, reload } = usePostList(source, board)
  return <CommunityBoardView board={board} state={state} onRetry={reload} />
}
