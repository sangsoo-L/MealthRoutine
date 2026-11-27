import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import CommunityEditForm from '../components/community/CommunityEditForm.tsx'
import CommunityPostView, {
  type OwnPostControls,
  type PostActions,
} from '../components/community/CommunityPostView.tsx'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import {
  BOARD_LIST_PATH,
  DELETE_RESULT_TEXT,
  EDIT_RESULT_TEXT,
  canEditOwnPost,
  createPostWriteScope,
  editCancelNotice,
  settlePostWrite,
  submitPostDelete,
  submitPostEdit,
  type BoardNotice,
  type CommunityBoard,
  type PostWriteScope,
} from '../community/community.ts'
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
 *
 * 내 글 수정·삭제(C2, C2-R2): 같은 라우트가 글마다 이 컴포넌트를 다시 쓰므로, 실제 화면(`PostScreen`)을 **사용자·게시판·글** 키로 그려
 * 글이나 계정이 바뀌면 새로 만든다(편집 상태·확인 패널·진행 중 요청이 함께 사라진다). 이 페이지는 지금 떠 있는 대상 키를
 * 쓰기 범위(`createPostWriteScope`)에 레이아웃 효과로 알리고, 쓰기 결과는 반영 직전에 그 범위·작업 번호·로그인 작업으로 다시 판정한다.
 */
export default function CommunityPostPage({
  board,
}: {
  board: CommunityBoard
}) {
  usePageTitle(TITLE[board])
  const { postId = '' } = useParams()
  const { user } = useAuth()
  const viewer = user?.id ?? ''
  const [scope] = useState(createPostWriteScope)
  const targetKey = `${viewer}:${board}:${postId}`

  useLayoutEffect(() => {
    scope.activate(targetKey)
    return () => scope.deactivate(targetKey)
  }, [scope, targetKey])

  return (
    <PostScreen
      key={targetKey}
      board={board}
      postId={postId}
      viewer={viewer}
      scope={scope}
      targetKey={targetKey}
    />
  )
}

type OwnNotice = OwnPostControls['notice']

function PostScreen({
  board,
  postId,
  viewer,
  scope,
  targetKey,
}: {
  board: CommunityBoard
  postId: string
  viewer: string
  scope: PostWriteScope
  targetKey: string
}) {
  const navigate = useNavigate()
  const { status, beginAccountWork } = useAuth()
  const isMember = status === 'authenticated'
  const source = useCommunitySource(board)
  const { state, reload, refresh, replace } = usePost(
    source,
    board,
    postId,
    viewer,
  )
  const listPath =
    useBackTarget(BOARD_LIST_PATH[board]) ?? BOARD_LIST_PATH[board]

  const category =
    state.status === 'ready' ? state.detail.post.qaCategory : null
  const { eligibility, retry } = useAnswerEligibility(
    board === 'qa' ? category : null,
  )

  // 화면을 떠나면(글·계정이 바뀌어 새로 그려질 때 포함) 진행 중인 쓰기 요청을 중단한다.
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

  // ── 내 글 수정·삭제(C2) ──
  const [mode, setMode] = useState<OwnPostControls['mode']>('view')
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<OwnNotice>(null)
  const deletingRef = useRef(false)

  const detail = state.status === 'ready' ? state.detail : null
  const canEdit =
    detail !== null &&
    canEditOwnPost(source?.supports ?? null, board, isMember, detail.post)

  function goToList(kind: BoardNotice) {
    void navigate(listPath, { replace: true, state: { notice: kind } })
  }

  async function confirmDelete() {
    if (deletingRef.current || source === null) return
    deletingRef.current = true
    setDeleting(true)
    setNotice(null)
    const controller = new AbortController()
    pending.current.add(controller)
    const isTargetCurrent = scope.begin(targetKey)
    let submitted
    try {
      submitted = await submitPostDelete(
        source,
        postId,
        controller.signal,
        beginAccountWork,
        isTargetCurrent,
      )
    } finally {
      pending.current.delete(controller)
    }
    deletingRef.current = false
    // 반영 직전 판정(C2-IMPL-3). 다른 글·떠난 화면이면 아무것도 하지 않는다.
    settlePostWrite(submitted, {
      deleted: () => goToList('deleted'),
      // 404는 삭제·숨김·없는 글을 구분하지 못한다: "삭제했어요"라고 하지 않는다(C2-R4).
      gone: () => goToList('gone'),
      forbidden: () => {
        setDeleting(false)
        setMode('view')
        setNotice({ tone: 'error', text: DELETE_RESULT_TEXT.forbidden })
        reload()
      },
      rejected: () => {
        setDeleting(false)
        setNotice({ tone: 'error', text: DELETE_RESULT_TEXT.rejected })
      },
      uncertain: () => {
        setDeleting(false)
        setNotice({ tone: 'error', text: DELETE_RESULT_TEXT.uncertain })
      },
      unconfirmed: () => {
        setDeleting(false)
        setMode('view')
        setNotice({ tone: 'error', text: DELETE_RESULT_TEXT.unconfirmed })
      },
    })
  }

  const own: OwnPostControls | null =
    canEdit && source !== null && detail !== null
      ? {
          mode,
          deleting,
          notice,
          editor:
            mode === 'edit' ? (
              <CommunityEditForm
                initialTitle={detail.post.title}
                initialBody={detail.post.body}
                submit={(input, signal) =>
                  submitPostEdit(
                    source,
                    postId,
                    input,
                    signal,
                    beginAccountWork,
                    scope.begin(targetKey),
                  )
                }
                onUpdated={(next) => {
                  replace(next)
                  setMode('view')
                  setNotice({ tone: 'info', text: EDIT_RESULT_TEXT.updated })
                }}
                onForbidden={() => {
                  setMode('view')
                  setNotice({ tone: 'error', text: EDIT_RESULT_TEXT.forbidden })
                  reload()
                }}
                onCancel={(wasSaving) => {
                  scope.invalidate()
                  setMode('view')
                  // 저장 중 취소는 서버의 수정을 되돌리지 않는다(C2-C2): "반영됐을 수 있음"과 다시 불러오기를 남긴다.
                  // 곧바로 다시 읽어도 서버 커밋 전이면 옛 값일 수 있어 자동 재조회는 하지 않는다.
                  setNotice(editCancelNotice(wasSaving))
                }}
                onShowLatest={() => {
                  scope.invalidate()
                  setMode('view')
                  setNotice(null)
                  reload()
                }}
              />
            ) : null,
          onEdit: () => {
            setNotice(null)
            setMode('edit')
          },
          onDelete: () => {
            setNotice(null)
            setMode('confirm-delete')
          },
          onCancelDelete: () => {
            if (deletingRef.current) return
            setMode('view')
          },
          onConfirmDelete: () => void confirmDelete(),
          onRecheck: () => {
            setNotice(null)
            reload()
          },
        }
      : null

  return (
    <CommunityPostView
      board={board}
      state={state}
      onRetry={reload}
      isMember={isMember}
      eligibility={eligibility}
      onEligibilityRetry={retry}
      actions={actions}
      listPath={listPath}
      supports={source?.supports ?? null}
      own={own}
    />
  )
}
