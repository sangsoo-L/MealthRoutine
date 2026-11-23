import { Link } from 'react-router'
import {
  formatNoticeDate,
  noticeDetailPath,
  noticeListPath,
  type NoticeNeighbors,
} from '../../support/notices.ts'
import Icon from '../icons/Icon.tsx'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'

const navLink = `flex min-h-11 w-full items-center gap-2 rounded-control border border-line bg-surface px-4 py-2 text-left hover:bg-page ${focusRing}`

/**
 * S01-1 공지사항 상세 본문. 없는 공지(neighbors.notice가 null)는 없는 공지를 만들지 않고 "찾을 수 없어요"와 목록 링크만 보인다.
 * 이전 글은 목록에서 더 최근 공지, 다음 글은 더 오래된 공지다. 목록으로 돌아갈 때 검색어(query)를 유지한다.
 */
export default function NoticeDetailView({
  neighbors,
  query,
}: {
  neighbors: NoticeNeighbors
  query: string
}) {
  const { notice, previous, next } = neighbors
  const listPath = noticeListPath(query)

  if (notice === null) {
    return (
      <div className="flex flex-col gap-5 break-keep wrap-anywhere">
        <h1 className="text-app-title leading-snug font-semibold text-content">
          공지사항
        </h1>
        <div className={cardClass} role="status">
          <p className="text-body leading-snug font-semibold text-content">
            공지를 찾을 수 없어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            삭제되었거나 주소가 올바르지 않을 수 있어요.
          </p>
        </div>
        <Link
          to={listPath}
          className={`flex min-h-11 w-full items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`}
        >
          공지 목록으로
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <article aria-labelledby="notice-title">
        <header className="border-b border-line pb-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`${chipClass} bg-page`}>{notice.category}</span>
            <span className="text-support font-normal tabular-nums text-muted">
              {formatNoticeDate(notice.publishedAt)}
            </span>
          </div>
          <h1
            id="notice-title"
            className="mt-2 text-app-title leading-snug font-semibold text-content"
          >
            {notice.title}
          </h1>
          <p className="mt-1 text-support font-normal text-muted">
            {notice.author}
          </p>
        </header>
        <div className="mt-4 flex flex-col gap-3 text-body leading-relaxed font-normal text-content">
          {notice.body.split('\n').map((line, index) => (
            // 문단은 줄바꿈으로만 나뉘는 정적 본문이라 순서가 곧 식별자다.
            <p key={index}>{line}</p>
          ))}
        </div>
      </article>

      <nav aria-label="공지 이동" className="flex flex-col gap-2">
        {previous ? (
          <Link
            to={noticeDetailPath(previous.id, query)}
            state={{ from: listPath }}
            className={navLink}
          >
            <Icon name="arrow-left" size={18} className="shrink-0 text-muted" />
            <span className="min-w-0">
              <span className="block text-support font-normal text-muted">
                이전 글
              </span>
              <span className="block text-body leading-snug font-semibold text-content">
                {previous.title}
              </span>
            </span>
          </Link>
        ) : null}
        {next ? (
          <Link
            to={noticeDetailPath(next.id, query)}
            state={{ from: listPath }}
            className={navLink}
          >
            <span className="min-w-0 flex-1">
              <span className="block text-support font-normal text-muted">
                다음 글
              </span>
              <span className="block text-body leading-snug font-semibold text-content">
                {next.title}
              </span>
            </span>
            <Icon
              name="arrow-right"
              size={18}
              className="shrink-0 text-muted"
            />
          </Link>
        ) : null}
        <Link
          to={listPath}
          className={`flex min-h-11 w-full items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`}
        >
          공지 목록으로
        </Link>
      </nav>
    </div>
  )
}
