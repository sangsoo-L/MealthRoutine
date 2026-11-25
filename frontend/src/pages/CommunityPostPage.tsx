import { useEffect, useMemo, useRef } from 'react'
import { useParams } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import CommunityPostView, {
  type PostActions,
} from '../components/community/CommunityPostView.tsx'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import { BOARD_LIST_PATH, type CommunityBoard } from '../community/community.ts'
import {
  useAnswerEligibility,
  useCommunitySource,
  usePost,
} from '../community/useCommunity.ts'

const TITLE: Record<CommunityBoard, string> = {
  free: '자유게시판 글',
  qa: '초보자 Q&A 질문',
}

/**
 * C05 자유게시판 글 상세(`/community/posts/:postId`) · C04 초보자 Q&A 상세(`/community/qa/:postId`)(비회원도 열람).
 * 없는 글·삭제된 글·잘못된 주소는 "찾을 수 없는 글이에요"와 목록 링크를 보인다(글을 만들지 않는다). 댓글·응원은 회원이 서버에 요청하고,
 * 서버가 성공을 알리면 서버 값을 다시 읽어 반영한다(실패하면 입력을 유지하고 알린다). Q&A 답변은 질문 영역의 이해도가 중급 이상인 회원에게만 입력을 연다.
 * 진입한 목록(`state.from`)이 있으면 "이전"·"목록으로"가 그곳으로, 없으면 해당 게시판 목록으로 돌아간다. 화면이 h1을 직접 가진다.
 */
export default function CommunityPostPage({
  board,
}: {
  board: CommunityBoard
}) {
  usePageTitle(TITLE[board])
  const { postId = '' } = useParams()
  const { status } = useAuth()
  const source = useCommunitySource(board)
  const { state, reload, refresh } = usePost(source, board, postId)
  const listPath =
    useBackTarget(BOARD_LIST_PATH[board]) ?? BOARD_LIST_PATH[board]

  const category =
    state.status === 'ready' ? state.detail.post.qaCategory : null
  const { eligibility, retry } = useAnswerEligibility(
    board === 'qa' ? category : null,
  )

  // 화면을 떠나면 진행 중인 쓰기 요청을 중단한다.
  const pending = useRef(new Set<AbortController>())
  useEffect(() => {
    const controllers = pending.current
    return () => {
      for (const controller of controllers) controller.abort()
      controllers.clear()
    }
  }, [])

  const actions = useMemo<PostActions>(() => {
    async function run(request: (signal: AbortSignal) => Promise<unknown>) {
      if (source === null) return false
      const controller = new AbortController()
      pending.current.add(controller)
      try {
        await request(controller.signal)
        if (controller.signal.aborted) return false
        refresh()
        return true
      } catch {
        return false
      } finally {
        pending.current.delete(controller)
      }
    }
    return {
      like: (liked) => run((signal) => source!.setLike(postId, liked, signal)),
      comment: (body) =>
        run((signal) => source!.addComment(postId, body, signal)),
    }
  }, [source, postId, refresh])

  return (
    <CommunityPostView
      board={board}
      state={state}
      onRetry={reload}
      isMember={status === 'authenticated'}
      eligibility={eligibility}
      onEligibilityRetry={retry}
      actions={actions}
      listPath={listPath}
      supports={source?.supports ?? null}
    />
  )
}
