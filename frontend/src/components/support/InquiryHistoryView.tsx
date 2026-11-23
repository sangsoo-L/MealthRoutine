import { Link } from 'react-router'
import {
  INQUIRY_STATUS_LABEL,
  PATH_INQUIRY,
  PATH_MY_INQUIRIES,
  inquiryDateLabel,
  inquiryStatus,
  inquiryTypeLabel,
  replyTimeLabel,
  sortInquiries,
  type InquiryItem,
  type InquiryListState,
  type InquiryStatusKey,
} from '../../inquiry/inquiry.ts'
import {
  focusRing,
  primaryButtonClass,
  secondaryButtonClass,
} from '../auth/authStyles.ts'

const card = 'rounded-card border border-line bg-surface p-4'

/** 상태 배지: 색이 아니라 글자로 전한다. */
const BADGE: Record<InquiryStatusKey, string> = {
  waiting: 'border-line bg-page text-content',
  answered: 'border-brand/30 bg-brand-soft text-brand',
}

/**
 * 문의 한 건. 행(요약)을 펼치면 문의 내용과 관리자 답변(없으면 미답변 안내)이 보인다(명세 P13: 목록 펼침). 읽기 전용이다.
 * 접는 방식은 요청 내역(P04)과 같은 네이티브 `details`다(키보드·보조기기가 그대로 동작한다).
 */
function InquiryCard({ item }: { item: InquiryItem }) {
  const key = inquiryStatus(item)
  const status = INQUIRY_STATUS_LABEL[key]
  const type = inquiryTypeLabel(item.type)
  return (
    <details
      data-inquiry-item={item.inquiryId}
      data-inquiry-status={key}
      className={`${card} group`}
    >
      <summary
        className={`flex cursor-pointer list-none flex-col gap-1.5 rounded-control [&::-webkit-details-marker]:hidden ${focusRing}`}
      >
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <span className="text-support leading-snug font-normal text-muted">
            {type ?? '유형 미기록'}
          </span>
          <span
            className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-support leading-snug font-semibold ${BADGE[key]}`}
          >
            {status.label}
          </span>
        </span>
        <span className="min-w-0 text-section-title leading-snug font-semibold wrap-break-word text-content">
          {item.title}
        </span>
        <span className="text-support leading-snug font-normal text-muted">
          접수 번호 {item.inquiryId} · {inquiryDateLabel(item.createdAt)}
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3 border-t border-line pt-3">
        <section aria-label="문의 내용">
          <h3 className="text-support leading-snug font-semibold text-muted">
            문의 내용
          </h3>
          <p className="mt-1 text-body leading-relaxed font-normal wrap-break-word whitespace-pre-wrap text-content">
            {item.body}
          </p>
        </section>
        <section aria-label="관리자 답변">
          <h3 className="text-support leading-snug font-semibold text-muted">
            관리자 답변
          </h3>
          {item.reply ? (
            <div
              data-inquiry-reply=""
              className="mt-1 rounded-control bg-brand-soft px-3 py-2"
            >
              <p className="text-support leading-snug font-normal text-muted">
                {item.reply.authorName ?? '관리자'} ·{' '}
                {replyTimeLabel(item.reply.createdAt)}
              </p>
              <p className="mt-1 text-body leading-relaxed font-normal wrap-break-word whitespace-pre-wrap text-content">
                {item.reply.body}
              </p>
            </div>
          ) : (
            <p
              data-inquiry-no-reply=""
              className="mt-1 text-body leading-relaxed font-normal text-muted"
            >
              {INQUIRY_STATUS_LABEL.waiting.guide}
            </p>
          )}
        </section>
      </div>
    </details>
  )
}

function Notice({
  state,
  title,
  children,
}: {
  state: string
  title: string
  children: string
}) {
  return (
    <div
      role={state === 'error' ? 'alert' : 'status'}
      data-inquiry-list={state}
      className={card}
    >
      <p className="text-section-title leading-snug font-semibold text-content">
        {title}
      </p>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        {children}
      </p>
    </div>
  )
}

/**
 * P13 내 문의. 조회 상태를 구분한다: 조회 중 · 서버 연결 전 · 조회 실패 · 문의 없음 · 문의 있음.
 * 서버 연결이 없다는 이유로 "문의가 없다"고 하지 않으며, 서버가 주지 않은 문의·답변을 만들어 보이지 않는다(예시 데이터 없음).
 * 문의 있음: 최신순 목록(유형·제목·접수 번호·접수일·상태 배지)을 펼치면 문의 내용과 관리자 답변(없으면 "아직 답변이 등록되지 않았어요")이 보인다.
 * 문의 작성(S02)으로 가는 버튼은 어느 상태에서나 있으며, 문의가 없으면 "첫 문의 남기기"다. 상세는 별도 화면이 아니라 목록 안에서 펼친다(명세).
 */
export default function InquiryHistoryView({
  state,
  onRetry,
}: {
  state: InquiryListState
  onRetry: () => void
}) {
  const itemCount = state.status === 'ready' ? state.items.length : null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          내 문의
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {itemCount === null
            ? '내가 남긴 문의와 관리자 답변을 확인해요.'
            : `전체 ${itemCount}건`}
        </p>
      </header>

      {state.status === 'loading' ? (
        <p
          role="status"
          data-inquiry-list="loading"
          className={`${card} text-body font-normal text-muted`}
        >
          문의 내역을 불러오는 중이에요…
        </p>
      ) : null}
      {state.status === 'unavailable' ? (
        <Notice state="unavailable" title="문의 내역을 아직 볼 수 없어요">
          문의 기능이 서버에 연결되기 전이에요. 문의가 없다는 뜻이 아니에요.
        </Notice>
      ) : null}
      {state.status === 'error' ? (
        <div className="flex flex-col gap-2">
          <Notice state="error" title="문의 내역을 불러오지 못했어요">
            문의가 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.
          </Notice>
          <button
            type="button"
            data-inquiry-retry=""
            onClick={onRetry}
            className={secondaryButtonClass}
          >
            다시 시도
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? (
        <Notice state="empty" title="아직 남긴 문의가 없어요">
          궁금한 점이 있다면 문의를 남겨 주세요. 답변은 이곳에서 확인할 수
          있어요.
        </Notice>
      ) : null}
      {state.status === 'ready' ? (
        <section aria-label="문의 목록" data-inquiry-list="ready">
          <ul role="list" className="flex flex-col gap-3">
            {sortInquiries(state.items).map((item) => (
              <li key={item.inquiryId}>
                <InquiryCard item={item} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Link
        to={PATH_INQUIRY}
        state={{ from: PATH_MY_INQUIRIES }}
        data-inquiry-new=""
        className={primaryButtonClass}
      >
        {state.status === 'empty' ? '첫 문의 남기기' : '문의하기'}
      </Link>
    </div>
  )
}
