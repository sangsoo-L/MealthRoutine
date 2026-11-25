import { useNavigate } from 'react-router'
import { usePageTitle } from '../ai/meal/usePageTitle.ts'
import { useAuth } from '../auth/authContext.ts'
import CommunityComposeForm from '../components/community/CommunityComposeForm.tsx'
import { useBackTarget } from '../components/layout/useBackTarget.ts'
import {
  BOARD_LIST_PATH,
  postPath,
  submitPost,
  type CommunityBoard,
} from '../community/community.ts'
import { useCommunitySource } from '../community/useCommunity.ts'

const COPY: Record<CommunityBoard, { title: string; lead: string }> = {
  free: {
    title: '자유게시판 글쓰기',
    lead: '자랑·성과·일상 이야기를 자유롭게 나눠 보세요.',
  },
  qa: {
    title: '초보자 Q&A 질문하기',
    lead: '궁금한 점을 질문 게시판에 남기면 중급·고급 사용자가 답변해요.',
  },
}

/**
 * C02 자유게시판 글 작성(`/community/posts/new`) · C02-1 초보자 Q&A 질문 작성(`/community/qa/new`), 회원 전용(AuthGate: 비회원은 로그인 안내).
 * 글 등록·저장·작성자 판정은 서버 담당이며 서버 연결 전에는 등록 버튼을 비활성으로 두고 "등록되지도 저장되지도 않아요"를 알린다(등록 성공 화면을 만들지 않는다).
 * 서버가 등록 응답을 주면 그 글의 상세(C05·C04)로 이동한다. 취소·이전은 해당 목록으로 돌아간다. 입력은 이 화면에서만 유지하고 저장하지 않는다.
 * 계정별 처리(C1-R1): 폼은 계정 id를 key로 그려 다른 계정으로 바뀌면 입력을 비우고 진행 중 요청을 중단한다(닉네임 변경으로는 비우지 않는다).
 * 등록은 로그인 작업에 묶여(`submitPost`) 계정이 바뀌거나 다시 로그인한 뒤 도착한 이전 응답으로 이동·오류를 표시하지 않는다.
 */
export default function CommunityWritePage({
  board,
}: {
  board: CommunityBoard
}) {
  const copy = COPY[board]
  usePageTitle(copy.title)
  const navigate = useNavigate()
  const { user, beginAccountWork } = useAuth()
  const source = useCommunitySource(board)
  const listPath = BOARD_LIST_PATH[board]
  const cancelTo = useBackTarget(listPath) ?? listPath
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          {copy.title}
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          {copy.lead}
        </p>
      </header>
      <CommunityComposeForm
        key={user?.id ?? ''}
        board={board}
        submit={
          source
            ? (input, signal) =>
                submitPost(source, input, signal, beginAccountWork)
            : null
        }
        cancelTo={cancelTo}
        onCreated={(id) =>
          void navigate(postPath(board, id), {
            replace: true,
            state: { from: listPath },
          })
        }
      />
    </div>
  )
}
