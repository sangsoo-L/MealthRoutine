import { Link } from 'react-router'
import {
  BOARD_LIST_PATH,
  BOARD_NEW_PATH,
  COMMUNITY_UNAVAILABLE_TEXT,
  PATH_COMMUNITY,
  PATH_QA,
  QA_CATEGORY_LABEL,
  countLabel,
  formatPostDate,
  postPath,
  type CommunityBoard,
  type ListState,
  type PostSummary,
} from '../../community/community.ts'
import {
  errorClass,
  noticeClass,
  secondaryButtonClass,
} from '../auth/authStyles.ts'
import Icon from '../icons/Icon.tsx'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'

const COPY: Record<
  CommunityBoard,
  {
    title: string
    lead: string
    countLabel: string
    write: string
    emptyTitle: string
    emptyBody: string
    otherLabel: string
    otherTo: string
  }
> = {
  free: {
    title: '자유게시판',
    lead: '일상·자랑·성과를 편하게 나누는 게시판이에요.',
    countLabel: '전체 글',
    write: '글쓰기',
    emptyTitle: '아직 올라온 글이 없어요',
    emptyBody: '첫 글을 남겨 보세요.',
    otherLabel: '초보자 Q&A 보기',
    otherTo: PATH_QA,
  },
  qa: {
    title: '초보자 Q&A',
    lead: '초보자의 질문과 중급·고급 사용자의 답변을 확인해요.',
    countLabel: '전체 질문',
    write: '질문하기',
    emptyTitle: '아직 올라온 질문이 없어요',
    emptyBody: '궁금한 점을 질문해 보세요.',
    otherLabel: '자유게시판 보기',
    otherTo: PATH_COMMUNITY,
  },
}

function PostRow({
  post,
  board,
}: {
  post: PostSummary
  board: CommunityBoard
}) {
  return (
    <li>
      <Link
        to={postPath(board, post.id)}
        state={{ from: BOARD_LIST_PATH[board] }}
        data-community-post={post.id}
        className={`flex min-h-11 items-start gap-3 p-4 hover:bg-page ${focusRing}`}
      >
        <span className="min-w-0 flex-1">
          <span className="flex items-start justify-between gap-2">
            <span className="min-w-0 text-section-title leading-snug font-semibold text-content">
              {post.title}
            </span>
            {board === 'free' && post.commentCount !== null ? (
              <span
                data-community-comments={post.commentCount}
                className="shrink-0 text-support leading-snug font-semibold tabular-nums text-brand"
              >
                <span className="sr-only">댓글 </span>(
                {countLabel(post.commentCount)})
              </span>
            ) : null}
            {board === 'qa' ? (
              <span
                data-community-status={
                  post.answered === null
                    ? 'unknown'
                    : post.answered
                      ? 'answered'
                      : 'waiting'
                }
                className={`${chipClass} ${post.answered ? 'bg-brand-soft' : 'bg-page'}`}
              >
                {post.answered === null
                  ? '상태 확인 전'
                  : post.answered
                    ? '답변 완료'
                    : '답변 대기'}
              </span>
            ) : null}
          </span>
          {board === 'free' && post.excerpt ? (
            <span className="mt-1 line-clamp-2 block text-support leading-snug font-normal text-muted">
              {post.excerpt}
            </span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-support leading-snug font-normal text-muted">
            {board === 'qa' && post.qaCategory ? (
              <span className="font-semibold">
                {QA_CATEGORY_LABEL[post.qaCategory]}
              </span>
            ) : null}
            <span className="min-w-0 break-all">{post.authorName}</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">
              {formatPostDate(post.createdAt)}
            </span>
          </span>
        </span>
        <Icon
          name="chevron-right"
          size={18}
          className="mt-1 shrink-0 text-muted"
        />
      </Link>
    </li>
  )
}

/**
 * C01 자유게시판 / C01-2 초보자 Q&A 목록 본문(화면명세 v5.0). 게시판 이름·안내 → 전체 글 수·글쓰기 → 단일 열 목록(행 전체가 상세로 가는 링크).
 * - 자유게시판 행은 제목 오른쪽 댓글 수(n), 아래에 작성자·작성일이다. Q&A 행은 댓글 수 대신 답변 상태 배지(답변 대기·답변 완료)다.
 * - 읽기는 비회원도 한다. 글쓰기(질문하기)는 작성 화면으로 가며 비회원은 거기서 로그인 안내를 본다.
 * - 상태: 조회 중 · 서버 연결 전(글 없음이 아니다) · 조회 실패(다시 시도) · 글 없음(서버가 비어 있다고 답함) · 목록.
 *   서버가 준 글만 보이며 글·댓글 수·답변 상태를 화면이 만들거나 계산하지 않는다.
 * - 명세에 게시판 전환 탭이 없어 두 게시판은 아래의 작은 링크로만 오간다(사용자 승인).
 */
export default function CommunityBoardView({
  board,
  state,
  onRetry,
}: {
  board: CommunityBoard
  state: ListState
  onRetry: () => void
}) {
  const copy = COPY[board]
  const posts = state.status === 'ready' ? state.posts : null
  const hasExample =
    import.meta.env.DEV && posts !== null && posts.some((post) => post.example)

  return (
    <div className="flex min-w-0 flex-col gap-4 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {copy.title}
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          {copy.lead}
        </p>
        <Link
          to={copy.otherTo}
          data-community-switch=""
          className={`mt-1 inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
        >
          {copy.otherLabel}
          <Icon name="chevron-right" size={18} />
        </Link>
      </header>

      {hasExample ? (
        <p role="note" data-community-dev="" className={`${noticeClass} mt-0`}>
          개발용 커뮤니티 예시 글이에요. 실제 게시글이 아니며 등록한 글도 이
          탭에서만 보이고 새로고침하면 사라져요.
        </p>
      ) : null}

      <section aria-labelledby="community-list-title">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2
            id="community-list-title"
            className="text-section-title leading-snug font-semibold text-content"
          >
            {posts === null
              ? copy.title
              : `${copy.countLabel} ${posts.length}개`}
          </h2>
          <Link
            to={BOARD_NEW_PATH[board]}
            data-community-write=""
            className={`inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${focusRing}`}
          >
            {copy.write}
          </Link>
        </div>

        {state.status === 'loading' ? (
          <p
            role="status"
            data-community-state="loading"
            className={`${cardClass} text-body font-normal text-muted`}
          >
            글을 불러오고 있어요…
          </p>
        ) : null}

        {state.status === 'unavailable' ? (
          <div
            role="status"
            data-community-state="unavailable"
            className={cardClass}
          >
            <p className="text-body leading-snug font-semibold text-content">
              아직 글을 볼 수 없어요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              {COMMUNITY_UNAVAILABLE_TEXT}
            </p>
          </div>
        ) : null}

        {state.status === 'error' ? (
          <div className="flex flex-col gap-2" data-community-state="error">
            <p role="alert" className={`${errorClass} mt-0`}>
              글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
            <button
              type="button"
              data-community-retry=""
              onClick={onRetry}
              className={secondaryButtonClass}
            >
              다시 시도
            </button>
          </div>
        ) : null}

        {posts !== null && posts.length === 0 ? (
          <div role="status" data-community-state="empty" className={cardClass}>
            <p className="text-body leading-snug font-semibold text-content">
              {copy.emptyTitle}
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              {copy.emptyBody}
            </p>
          </div>
        ) : null}

        {posts !== null && posts.length > 0 ? (
          <ul
            role="list"
            data-community-list=""
            className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
          >
            {posts.map((post) => (
              <PostRow key={post.id} post={post} board={board} />
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  )
}
