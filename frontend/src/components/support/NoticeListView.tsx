import { Link } from 'react-router'
import {
  filterNotices,
  formatNoticeDate,
  noticeDetailPath,
  noticeListPath,
  type Notice,
} from '../../support/notices.ts'
import Icon from '../icons/Icon.tsx'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'
import SupportSearchInput from './SupportSearchInput.tsx'

/**
 * S01 공지사항 목록 화면 본문. 데이터와 검색어를 props로 받아 화면 상태(목록 있음·공지 없음·검색 결과 없음)만 그린다.
 * - 공지가 하나도 없으면(운영 공지 데이터 없음) "등록된 공지가 없어요"만 보인다. 가짜 공지를 만들지 않는다.
 * - 검색은 목록 아래에 있다(화면명세 S01). 제목·본문에서 찾고 결과가 없으면 "전체 보기"로 검색어를 지운다.
 * - 각 공지는 분류·제목·작성자·게시일을 보이고 행 전체가 상세(S01-1)로 가는 링크다(검색어를 함께 넘긴다).
 * 공지·FAQ 사이를 오가는 탭은 없다. FAQ는 아래의 안내 줄에서 간다. 1:1 문의(S02)는 문의 작성 화면으로 가고(회원 전용이라 비회원은 로그인 안내를 본다), 키워드 챗봇(S03)은 화면이 없어 준비 중으로만 알린다.
 */
export default function NoticeListView({
  notices,
  query,
  onQueryChange,
}: {
  /** 최신순으로 정렬된 전체 공지 */
  notices: readonly Notice[]
  query: string
  onQueryChange: (value: string) => void
}) {
  const shown = filterNotices(notices, query)
  const searching = query.trim() !== ''
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          공지사항
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          서비스 소식과 이용 안내를 확인해요.
        </p>
      </header>

      <section aria-labelledby="notice-list-title">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2
            id="notice-list-title"
            className="text-section-title leading-snug font-semibold text-content"
          >
            공지 목록
          </h2>
          <span
            aria-live="polite"
            className="text-support font-normal tabular-nums text-muted"
          >
            {notices.length === 0
              ? ''
              : searching
                ? `검색 결과 ${shown.length}건`
                : `전체 ${notices.length}건`}
          </span>
        </div>
        {notices.length === 0 ? (
          <div className={cardClass}>
            <p className="text-body leading-snug font-semibold text-content">
              등록된 공지가 없어요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              새 공지가 올라오면 여기에서 확인할 수 있어요.
            </p>
          </div>
        ) : shown.length === 0 ? (
          <div className={cardClass} role="status">
            <p className="text-body leading-snug font-semibold text-content">
              검색 결과가 없어요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              다른 검색어로 찾아보거나 전체 공지를 확인해 보세요.
            </p>
            <button
              type="button"
              onClick={() => onQueryChange('')}
              className={`mt-3 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand hover:bg-brand-soft ${focusRing}`}
            >
              전체 보기
            </button>
          </div>
        ) : (
          <ul
            role="list"
            className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
          >
            {shown.map((notice) => (
              <li key={notice.id}>
                <Link
                  to={noticeDetailPath(notice.id, query)}
                  state={{ from: noticeListPath(query) }}
                  className={`flex min-h-11 items-center gap-3 p-4 hover:bg-page ${focusRing}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`${chipClass} bg-page`}>
                        {notice.category}
                      </span>
                      <span className="text-support font-normal tabular-nums text-muted">
                        {formatNoticeDate(notice.publishedAt)}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-body leading-snug font-semibold text-content">
                      {notice.title}
                    </span>
                    <span className="mt-0.5 block text-support leading-snug font-normal text-muted">
                      {notice.author}
                    </span>
                  </span>
                  <Icon
                    name="chevron-right"
                    size={18}
                    className="shrink-0 text-muted"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="notice-search-title">
        <h2
          id="notice-search-title"
          className="mb-2 text-section-title leading-snug font-semibold text-content"
        >
          공지 검색
        </h2>
        <label htmlFor="notice-search" className="sr-only">
          공지 제목·내용 검색
        </label>
        <SupportSearchInput
          id="notice-search"
          value={query}
          onChange={onQueryChange}
          placeholder="공지 제목이나 내용을 검색해 보세요"
        />
      </section>

      <section
        aria-labelledby="support-help-title"
        className="rounded-card border border-line bg-surface"
      >
        <h2
          id="support-help-title"
          className="px-4 pt-4 text-section-title leading-snug font-semibold text-content"
        >
          도움이 더 필요하세요?
        </h2>
        <ul className="mt-2 divide-y divide-line">
          <li>
            <Link
              to="/support/faq"
              state={{ from: noticeListPath(query) }}
              className={`flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-body font-semibold text-content ${focusRing}`}
            >
              <span className="min-w-0">자주 묻는 질문(FAQ)</span>
              <Icon
                name="chevron-right"
                size={18}
                className="shrink-0 text-muted"
              />
            </Link>
          </li>
          <li>
            <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-body font-normal text-muted">
              <span className="min-w-0">키워드 챗봇</span>
              <span className={`${chipClass} bg-page`}>준비 중</span>
            </div>
          </li>
          <li>
            <Link
              to="/support/inquiry"
              state={{ from: noticeListPath(query) }}
              className={`flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-body font-semibold text-content ${focusRing}`}
            >
              <span className="min-w-0">1:1 문의</span>
              <Icon
                name="chevron-right"
                size={18}
                className="shrink-0 text-muted"
              />
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}
