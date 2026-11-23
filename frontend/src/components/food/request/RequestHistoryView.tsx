import { useState } from 'react'
import { Link } from 'react-router'
import {
  PATH_FOOD_REQUEST,
  REQUEST_FILTERS,
  REQUEST_FILTER_LABEL,
  REQUEST_STATUS_LABEL,
  commentTimeLabel,
  filterCounts,
  filterItems,
  requestDateLabel,
  requestStatus,
  sortedComments,
  statusKeyOf,
  type FoodRequestItem,
  type RequestFilter,
  type RequestListState,
} from '../../../food-request/foodRequest.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'
const card = 'rounded-card border border-line bg-surface p-4'
const primary = `flex min-h-12 w-full items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface hover:bg-brand-hover ${focusRing}`
const secondary = `flex min-h-11 w-full items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`

/** 상태 배지: 색이 아니라 글자로 전한다. */
const BADGE: Record<string, string> = {
  received: 'border-line bg-page text-content',
  review: 'border-brand/30 bg-brand-soft text-brand',
  needInfo: 'border-warning/40 bg-warning-soft text-warning',
  completed: 'border-meal/40 bg-meal-soft text-meal',
  rejected: 'border-danger/30 bg-danger-soft text-danger',
  unknown: 'border-line bg-page text-muted',
}

function AdminThread({ item }: { item: FoodRequestItem }) {
  const comments = sortedComments(item)
  return (
    <details data-request-thread={item.requestId} className="group mt-3">
      <summary
        className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-control bg-page px-3 text-support font-semibold text-content ${focusRing}`}
      >
        <span>관리자 진행 메모</span>
        <span className="font-normal text-muted">{comments.length}개</span>
      </summary>
      {comments.length === 0 ? (
        <p className="mt-2 px-1 text-support leading-relaxed font-normal text-muted">
          아직 관리자 메모가 없어요.
        </p>
      ) : (
        <ol role="list" className="mt-2 flex flex-col gap-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className="rounded-control border border-line px-3 py-2"
            >
              <p className="text-support leading-snug font-normal text-muted">
                {comment.authorName ?? '관리자'} ·{' '}
                {commentTimeLabel(comment.createdAt)}
                {comment.status !== null &&
                statusKeyOf(comment.status) !== 'unknown'
                  ? ` · ${REQUEST_STATUS_LABEL[statusKeyOf(comment.status)].label}`
                  : ''}
              </p>
              <p className="mt-1 text-body leading-relaxed font-normal wrap-break-word text-content">
                {comment.body}
              </p>
            </li>
          ))}
        </ol>
      )}
    </details>
  )
}

function RequestCard({ item }: { item: FoodRequestItem }) {
  const key = requestStatus(item)
  const status = REQUEST_STATUS_LABEL[key]
  return (
    <article
      data-request-item={item.requestId}
      data-request-status={key}
      className={card}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
        <h3 className="min-w-0 text-section-title leading-snug font-semibold wrap-break-word text-content">
          {item.foodName}
        </h3>
        <span
          className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-support leading-snug font-semibold ${BADGE[key]}`}
        >
          {status.label}
        </span>
      </header>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-support leading-snug">
        <dt className="font-normal text-muted">접수 번호</dt>
        <dd className="min-w-0 font-semibold wrap-break-word text-content">
          {item.requestId}
        </dd>
        <dt className="font-normal text-muted">요청일</dt>
        <dd className="font-semibold text-content">
          {requestDateLabel(item.createdAt)}
        </dd>
        {item.brand ? (
          <>
            <dt className="font-normal text-muted">브랜드</dt>
            <dd className="min-w-0 font-semibold wrap-break-word text-content">
              {item.brand}
            </dd>
          </>
        ) : null}
      </dl>
      {item.description ? (
        <p className="mt-2 text-body leading-relaxed font-normal wrap-break-word text-content">
          {item.description}
        </p>
      ) : null}
      <p className="mt-2 text-support leading-relaxed font-normal text-muted">
        {status.guide}
      </p>
      <AdminThread item={item} />
    </article>
  )
}

function Filters({
  items,
  filter,
  onFilter,
}: {
  items: readonly FoodRequestItem[]
  filter: RequestFilter
  onFilter: (value: RequestFilter) => void
}) {
  const counts = filterCounts(items)
  return (
    <div
      role="group"
      aria-label="처리 상태별 보기"
      className="flex flex-wrap gap-2"
    >
      {REQUEST_FILTERS.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={filter === value}
          data-request-filter={value}
          onClick={() => onFilter(value)}
          className={`inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-control border px-3 text-body ${focusRing} ${filter === value ? 'border-brand bg-brand-soft font-semibold text-brand' : 'border-line bg-surface font-normal text-content'}`}
        >
          {REQUEST_FILTER_LABEL[value]}
          <span className="tabular-nums">{counts[value]}</span>
        </button>
      ))}
    </div>
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
      data-request-list={state}
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
 * P04 내 요청 내역(요청 있음 상태가 P04-1의 목록 모양이다. P04-1의 "고정 예시"는 서비스에 두지 않는다).
 * 조회 상태를 구분한다: 조회 중 · 서버 연결 전 · 조회 실패 · 요청 없음 · 요청 있음. 서버 연결이 없다는 이유로 "요청이 없다"고 하지 않는다.
 * 요청 있음: 상태별 건수 버튼(전체·접수·검토 중·반영 완료)과 카드(음식명·접수 번호·요청일·상태 배지·처리 안내·관리자 진행 메모). 읽기 전용이며
 * 이 앱은 요청 상태를 바꾸거나 승인하지 않는다. 선택한 상태 필터는 이 화면에 머무는 동안 유지된다.
 */
export default function RequestHistoryView({
  state,
  onRetry,
  initialFilter = 'all',
}: {
  state: RequestListState
  onRetry: () => void
  initialFilter?: RequestFilter
}) {
  const [filter, setFilter] = useState<RequestFilter>(initialFilter)
  const itemCount = state.status === 'ready' ? state.items.length : null
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          내 요청 내역
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {itemCount === null
            ? '내가 요청한 음식의 접수 내역을 확인해요.'
            : `전체 ${itemCount}건`}
        </p>
      </header>

      {state.status === 'loading' ? (
        <p
          role="status"
          data-request-list="loading"
          className={`${card} text-body font-normal text-muted`}
        >
          요청 내역을 불러오는 중이에요…
        </p>
      ) : null}
      {state.status === 'unavailable' ? (
        <Notice state="unavailable" title="요청 내역을 아직 볼 수 없어요">
          요청 내역 기능이 서버에 연결되기 전이에요. 요청이 없다는 뜻이
          아니에요.
        </Notice>
      ) : null}
      {state.status === 'error' ? (
        <div className="flex flex-col gap-2">
          <Notice state="error" title="요청 내역을 불러오지 못했어요">
            요청이 없는 것은 아니에요. 잠시 후 다시 시도해 주세요.
          </Notice>
          <button
            type="button"
            data-request-retry=""
            onClick={onRetry}
            className={secondary}
          >
            다시 시도
          </button>
        </div>
      ) : null}
      {state.status === 'empty' ? (
        <Notice state="empty" title="아직 요청한 음식이 없어요">
          찾는 음식이 없다면 등록을 요청해 주세요.
        </Notice>
      ) : null}
      {state.status === 'ready' ? (
        <section aria-label="요청 목록" data-request-list="ready">
          <Filters items={state.items} filter={filter} onFilter={setFilter} />
          <ul role="list" className="mt-3 flex flex-col gap-3">
            {filterItems(state.items, filter).map((item) => (
              <li key={item.requestId}>
                <RequestCard item={item} />
              </li>
            ))}
          </ul>
          {filterItems(state.items, filter).length === 0 ? (
            <p className="mt-3 text-body leading-relaxed font-normal text-muted">
              이 상태의 요청이 없어요.
            </p>
          ) : null}
        </section>
      ) : null}

      <Link to={PATH_FOOD_REQUEST} data-request-new="" className={primary}>
        음식 등록 요청하기
      </Link>
    </div>
  )
}
