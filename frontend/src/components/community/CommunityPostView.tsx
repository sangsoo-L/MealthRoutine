import {
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type SubmitEvent,
} from 'react'
import { Link, useLocation } from 'react-router'
import {
  ANSWERER_TIER_LABEL,
  COMMENT_ERROR_MESSAGE,
  COMMUNITY_UNAVAILABLE_TEXT,
  MEDICAL_NOTE,
  QA_CATEGORY_LABEL,
  countLabel,
  formatPostDate,
  validateComment,
  type CommunityBoard,
  type PostComment,
  type PostDetail,
  type PostState,
} from '../../community/community.ts'
import type { AnswerEligibility } from '../../community/useCommunity.ts'
import {
  errorClass,
  noticeClass,
  primaryButtonClass,
  primaryDisabledClass,
  secondaryButtonClass,
} from '../auth/authStyles.ts'
import Icon from '../icons/Icon.tsx'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'

/** 화면이 서버에 요청하는 동작. 반환값은 서버가 성공 응답을 줬는지다(화면은 성공 전에는 반영한 것처럼 보이지 않는다). */
export interface PostActions {
  like: (liked: boolean) => Promise<boolean>
  comment: (body: string) => Promise<boolean>
}

const help = 'text-support leading-relaxed font-normal text-muted'
/** 입력창 글자 16px(text-base)는 authStyles의 입력 규칙과 같다(모바일 Safari 확대 방지). */
const field =
  'min-h-12 w-full min-w-0 rounded-control border border-muted/75 bg-surface px-3 py-2 text-base font-normal text-content placeholder:text-body placeholder:text-muted focus-visible:border-brand focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-brand aria-invalid:border-danger aria-invalid:bg-danger-soft'

const TITLE_FALLBACK: Record<CommunityBoard, string> = {
  free: '게시글',
  qa: '질문',
}
const LIST_LABEL: Record<CommunityBoard, string> = {
  free: '자유게시판 목록으로',
  qa: '질문 목록으로',
}

/** 로그인 안내 링크. 로그인 뒤 지금 보던 글로 돌아오도록 현재 경로를 알린다. */
function LoginLink({ children }: { children: string }) {
  const location = useLocation()
  return (
    <Link
      to="/login"
      state={{ returnTo: location.pathname + location.search }}
      data-community-login=""
      className={`inline-flex min-h-11 items-center font-semibold text-brand underline ${focusRing}`}
    >
      {children}
    </Link>
  )
}

/**
 * 댓글(자유게시판)·답변(Q&A) 입력. 빈 내용은 막고, 서버가 성공 응답을 준 때만 비운다. 실패하면 입력을 유지한다.
 * 처리 중에는 다시 제출해도 한 번만 나간다.
 */
function CommentForm({
  kind,
  onSubmit,
}: {
  kind: 'comment' | 'answer'
  onSubmit: (body: string) => Promise<boolean>
}) {
  const [draft, setDraft] = useState('')
  const [invalid, setInvalid] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'busy' | 'failed' | 'done'>(
    'idle',
  )
  const busyRef = useRef(false)
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const id = useId()
  const noun = kind === 'answer' ? '답변' : '댓글'

  function handleChange(event: ChangeEvent<HTMLTextAreaElement>) {
    setDraft(event.target.value)
    setInvalid(false)
    if (!busyRef.current) setPhase('idle')
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busyRef.current) return
    const body = validateComment(draft)
    if (body === null) {
      setInvalid(true)
      areaRef.current?.focus()
      return
    }
    busyRef.current = true
    setPhase('busy')
    const ok = await onSubmit(body)
    busyRef.current = false
    if (ok) {
      setDraft('')
      setPhase('done')
    } else setPhase('failed')
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      aria-busy={phase === 'busy'}
      data-community-form={kind}
      className="flex flex-col gap-2"
    >
      <label htmlFor={id} className="text-body font-normal text-content">
        {noun} 쓰기
      </label>
      <textarea
        ref={areaRef}
        id={id}
        rows={4}
        value={draft}
        onChange={handleChange}
        placeholder={`${noun}을 입력해 주세요`}
        aria-required="true"
        aria-invalid={invalid ? true : undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className={`${field} resize-y`}
      />
      <div role="alert" className="empty:hidden">
        {invalid ? (
          <p
            id={`${id}-error`}
            className="text-support leading-relaxed font-semibold text-danger"
          >
            {COMMENT_ERROR_MESSAGE}
          </p>
        ) : null}
      </div>
      <div role="status" className="empty:hidden">
        {phase === 'failed' ? (
          <p data-community-failed="" className={`${errorClass} mt-0`}>
            {noun}을 등록하지 못했어요. 입력한 내용은 그대로 남아 있으니 다시
            시도해 주세요.
          </p>
        ) : null}
        {phase === 'done' ? (
          <p data-community-done="" className={help}>
            {noun}을 등록했어요.
          </p>
        ) : null}
      </div>
      <button
        type="submit"
        disabled={phase === 'busy'}
        data-community-submit={kind}
        className={`${primaryButtonClass} ${primaryDisabledClass}`}
      >
        {phase === 'busy' ? '등록 중…' : `${noun} 등록`}
      </button>
    </form>
  )
}

function CommentItem({
  comment,
  board,
}: {
  comment: PostComment
  board: CommunityBoard
}) {
  return (
    <li
      data-community-comment={comment.id}
      className={`${board === 'qa' ? 'rounded-card border border-brand/30 bg-brand-soft p-4' : 'py-3'}`}
    >
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-support leading-snug font-normal text-muted">
        <span className="min-w-0 font-semibold break-all text-content">
          {comment.authorName}
        </span>
        {board === 'qa' ? (
          <span className={`${chipClass} bg-surface`}>
            {comment.authorTier
              ? `${ANSWERER_TIER_LABEL[comment.authorTier]} 회원`
              : '등급 확인 전'}
          </span>
        ) : null}
        <span className="tabular-nums">
          {formatPostDate(comment.createdAt)}
        </span>
      </p>
      <p className="mt-1.5 text-body leading-relaxed font-normal whitespace-pre-line text-content">
        {comment.body}
      </p>
    </li>
  )
}

/** 답변 입력 영역(C04). 자격은 서버가 정하며 화면은 이해도로 입력을 열고 닫는다. */
function AnswerArea({
  eligibility,
  onRetry,
  actions,
}: {
  eligibility: AnswerEligibility
  onRetry: () => void
  actions: PostActions
}) {
  switch (eligibility.kind) {
    case 'allowed':
      return <CommentForm kind="answer" onSubmit={actions.comment} />
    case 'guest':
      return (
        <p data-community-guide="guest" className={`${noticeClass} mt-0`}>
          <span className="min-w-0">
            답변은 로그인한 중급·고급 회원이 남길 수 있어요.{' '}
            <LoginLink>로그인하기</LoginLink>
          </span>
        </p>
      )
    case 'loading':
      return (
        <p role="status" data-community-guide="loading" className={help}>
          답변 자격을 확인하고 있어요…
        </p>
      )
    case 'error':
      return (
        <div className="flex flex-col gap-2" data-community-guide="error">
          <p role="alert" className={`${errorClass} mt-0`}>
            답변 자격을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={secondaryButtonClass}
          >
            다시 시도
          </button>
        </div>
      )
    case 'beginner':
      return (
        <p
          role="status"
          data-community-guide="beginner"
          className={`${noticeClass} mt-0`}
        >
          답변은 이 질문 영역의 이해도가 중급 이상인 회원이 남길 수 있어요.
          질문은 누구나 할 수 있어요.
        </p>
      )
    default:
      return (
        <p
          role="status"
          data-community-guide="unknown"
          className={`${noticeClass} mt-0`}
        >
          이해도를 확인할 수 없어 답변 입력을 열지 못했어요. 이해도 확인을 마친
          회원이 답변할 수 있어요.
        </p>
      )
  }
}

function Ready({
  detail,
  board,
  isMember,
  eligibility,
  onEligibilityRetry,
  actions,
  listPath,
}: {
  detail: PostDetail
  board: CommunityBoard
  isMember: boolean
  eligibility: AnswerEligibility
  onEligibilityRetry: () => void
  actions: PostActions
  listPath: string
}) {
  const { post, comments } = detail
  const [likeBusy, setLikeBusy] = useState(false)
  const [likeFailed, setLikeFailed] = useState(false)
  const liked = post.likedByMe === true

  async function toggleLike() {
    if (likeBusy || !isMember) return
    setLikeBusy(true)
    setLikeFailed(false)
    const ok = await actions.like(!liked)
    setLikeBusy(false)
    if (!ok) setLikeFailed(true)
  }

  return (
    <article
      data-community-detail={board}
      className="flex min-w-0 flex-col gap-4"
    >
      <header>
        {board === 'qa' ? (
          <p className="mb-2 flex flex-wrap items-center gap-2">
            <span
              data-community-status={post.answered ? 'answered' : 'waiting'}
              className={`${chipClass} ${post.answered ? 'bg-brand-soft' : 'bg-page'}`}
            >
              {post.answered === null
                ? '상태 확인 전'
                : post.answered
                  ? '답변 완료'
                  : '답변 대기'}
            </span>
            {post.qaCategory ? (
              <span
                data-community-category={post.qaCategory}
                className={`${chipClass} bg-page`}
              >
                {QA_CATEGORY_LABEL[post.qaCategory]}
              </span>
            ) : null}
          </p>
        ) : null}
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          {post.title}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-support leading-snug font-normal text-muted">
          <span className="min-w-0 break-all">{post.authorName}</span>
          <span aria-hidden="true">·</span>
          <span className="tabular-nums">{formatPostDate(post.createdAt)}</span>
        </p>
      </header>

      <p
        data-community-body=""
        className="text-body leading-relaxed font-normal whitespace-pre-line text-content"
      >
        {post.body}
      </p>

      {board === 'free' ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-community-like=""
              aria-pressed={liked}
              aria-disabled={!isMember || likeBusy || undefined}
              onClick={() => void toggleLike()}
              className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border px-4 text-body font-semibold aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${focusRing} ${
                liked
                  ? 'border-brand bg-brand-soft text-brand'
                  : 'border-muted/60 bg-surface text-content'
              }`}
            >
              <Icon name="sparkle" size={18} />
              응원
              {post.likeCount !== null ? (
                <span
                  className="tabular-nums"
                  data-community-like-count={post.likeCount}
                >
                  {countLabel(post.likeCount)}
                </span>
              ) : null}
            </button>
          </div>
          {likeFailed ? (
            <p
              role="alert"
              data-community-like-failed=""
              className={`${errorClass} mt-0`}
            >
              응원을 반영하지 못했어요. 잠시 후 다시 시도해 주세요.
            </p>
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="community-comments-title" className={cardClass}>
        <h2
          id="community-comments-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          {board === 'qa' ? '답변' : '댓글'}{' '}
          <span
            className="tabular-nums"
            data-community-comment-count={comments.length}
          >
            {comments.length}
          </span>
        </h2>

        {comments.length === 0 ? (
          <p data-community-empty="" className={`mt-2 ${help}`}>
            {board === 'qa'
              ? '아직 답변이 없어요. 중급·고급 회원이 답변하면 여기에 보여요.'
              : '아직 댓글이 없어요.'}
          </p>
        ) : (
          <ul
            role="list"
            className={
              board === 'qa'
                ? 'mt-3 flex flex-col gap-3'
                : 'mt-2 divide-y divide-line'
            }
          >
            {comments.map((comment) => (
              <CommentItem key={comment.id} comment={comment} board={board} />
            ))}
          </ul>
        )}

        <div className="mt-4 border-t border-line pt-4">
          {board === 'qa' ? (
            <AnswerArea
              eligibility={eligibility}
              onRetry={onEligibilityRetry}
              actions={actions}
            />
          ) : isMember ? (
            <CommentForm kind="comment" onSubmit={actions.comment} />
          ) : (
            <p data-community-guide="guest" className={`${noticeClass} mt-0`}>
              <span className="min-w-0">
                댓글과 응원은 로그인한 회원이 남길 수 있어요.{' '}
                <LoginLink>로그인하기</LoginLink>
              </span>
            </p>
          )}
        </div>
      </section>

      {board === 'qa' ? <p className={help}>{MEDICAL_NOTE}</p> : null}

      <Link
        to={listPath}
        data-community-list-link=""
        className={secondaryButtonClass}
      >
        {LIST_LABEL[board]}
      </Link>
    </article>
  )
}

/**
 * C05 자유게시판 글 상세 / C04 초보자 Q&A 상세 본문(화면명세 v5.0).
 * - 자유게시판: 제목·작성자·작성일·본문 → 응원(게시글 좋아요) → 댓글 목록과 입력 → 목록으로.
 * - Q&A: 답변 상태·카테고리 → 제목·작성자·작성일·본문 → 구분선 아래 답변 카드(답변자·등급·작성일) → 답변 입력(자격이 있을 때) → 질문 목록으로.
 * - 읽기는 비회원도 한다. 댓글·응원은 회원이고 비회원은 로그인 안내를 본다. 답변은 질문 영역의 이해도가 중급 이상인 회원에게만 입력을 연다(안내용, 판정은 서버).
 * - 상태: 조회 중 · 서버 연결 전 · 조회 실패(다시 시도) · 없는 글·삭제된 글(목록으로) · 글. 서버가 성공을 알린 때만 댓글·응원이 반영된다.
 * - 수정·삭제·신고는 명세에 화면이 없어 만들지 않았다.
 */
export default function CommunityPostView({
  board,
  state,
  onRetry,
  isMember,
  eligibility,
  onEligibilityRetry,
  actions,
  listPath,
}: {
  board: CommunityBoard
  state: PostState
  onRetry: () => void
  isMember: boolean
  /** Q&A 답변 자격(자유게시판에서는 쓰지 않는다). */
  eligibility: AnswerEligibility
  onEligibilityRetry: () => void
  actions: PostActions
  /** "목록으로"가 돌아갈 경로(진입한 목록). */
  listPath: string
}) {
  if (state.status === 'ready')
    return (
      <Ready
        detail={state.detail}
        board={board}
        isMember={isMember}
        eligibility={eligibility}
        onEligibilityRetry={onEligibilityRetry}
        actions={actions}
        listPath={listPath}
      />
    )

  const fallbackTitle = TITLE_FALLBACK[board]
  return (
    <div className="flex min-w-0 flex-col gap-4 break-keep wrap-anywhere">
      <h1 className="text-app-title leading-snug font-semibold text-content">
        {fallbackTitle}
      </h1>

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

      {state.status === 'notfound' ? (
        <div
          role="status"
          data-community-state="notfound"
          className={cardClass}
        >
          <p className="text-body leading-snug font-semibold text-content">
            찾을 수 없는 글이에요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            삭제되었거나 주소가 올바르지 않은 글이에요. 목록에서 다른 글을
            확인해 보세요.
          </p>
        </div>
      ) : null}

      <Link
        to={listPath}
        data-community-list-link=""
        className={secondaryButtonClass}
      >
        {LIST_LABEL[board]}
      </Link>
    </div>
  )
}
