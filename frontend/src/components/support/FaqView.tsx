import { Link } from 'react-router'
import { filterFaq, type FaqItem } from '../../support/faq.ts'
import Icon from '../icons/Icon.tsx'
import { cardClass, chipClass, focusRing } from '../mypage/myStyles.ts'
import SupportSearchInput from './SupportSearchInput.tsx'

/**
 * S04 FAQ 본문. 질문·답변 검색, 질문 아코디언(키보드로 열고 닫는 <details>), 관련 화면 링크, 검색 결과 없음("전체 보기")을 그린다.
 * 질문·답변은 지금 구현되었거나 확정된 내용뿐이다(support/faq.ts). 챗봇(S03)·1:1 문의(S02)는 화면이 없어 준비 중으로만 알린다.
 */
export default function FaqView({
  items,
  query,
  onQueryChange,
}: {
  items: readonly FaqItem[]
  query: string
  onQueryChange: (value: string) => void
}) {
  const shown = filterFaq(items, query)
  const searching = query.trim() !== ''
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          자주 묻는 질문
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          궁금한 점을 검색하거나 질문을 눌러 답변을 확인해요.
        </p>
      </header>

      <section aria-labelledby="faq-search-title">
        <h2 id="faq-search-title" className="sr-only">
          질문 검색
        </h2>
        <label htmlFor="faq-search" className="sr-only">
          질문·답변 검색
        </label>
        <SupportSearchInput
          id="faq-search"
          value={query}
          onChange={onQueryChange}
          placeholder="궁금한 내용을 검색해 보세요"
        />
      </section>

      <section aria-labelledby="faq-list-title">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h2
            id="faq-list-title"
            className="text-section-title leading-snug font-semibold text-content"
          >
            질문 목록
          </h2>
          <span
            aria-live="polite"
            className="text-support font-normal tabular-nums text-muted"
          >
            {searching
              ? `검색 결과 ${shown.length}건`
              : `전체 ${items.length}건`}
          </span>
        </div>
        {shown.length === 0 ? (
          <div className={cardClass} role="status">
            <p className="text-body leading-snug font-semibold text-content">
              검색 결과가 없어요
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal text-muted">
              다른 검색어로 찾아보거나 전체 질문을 확인해 보세요.
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
            {shown.map((item) => (
              <li key={item.id}>
                <details className="group">
                  <summary
                    className={`flex min-h-11 cursor-pointer items-center gap-3 p-4 ${focusRing}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`${chipClass} bg-page`}>
                        {item.category}
                      </span>
                      <span className="mt-1.5 block text-body leading-snug font-semibold text-content">
                        {item.question}
                      </span>
                    </span>
                    <Icon
                      name="chevron-down"
                      size={18}
                      className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
                    />
                  </summary>
                  <div className="px-4 pb-4">
                    <p className="text-body leading-relaxed font-normal text-content">
                      {item.answer}
                    </p>
                    {item.related ? (
                      <Link
                        to={item.related.to}
                        className={`mt-2 inline-flex min-h-11 items-center gap-1 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
                      >
                        {item.related.label}
                        <Icon name="chevron-right" size={18} />
                      </Link>
                    ) : null}
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="faq-help-title"
        className="rounded-card border border-line bg-surface"
      >
        <h2
          id="faq-help-title"
          className="px-4 pt-4 text-section-title leading-snug font-semibold text-content"
        >
          답을 찾지 못하셨나요?
        </h2>
        <ul className="mt-2 divide-y divide-line">
          <li>
            <Link
              to="/support"
              className={`flex min-h-11 items-center justify-between gap-3 px-4 py-3 text-body font-semibold text-content ${focusRing}`}
            >
              <span className="min-w-0">공지사항 보기</span>
              <Icon
                name="chevron-right"
                size={18}
                className="shrink-0 text-muted"
              />
            </Link>
          </li>
          {['키워드 챗봇', '1:1 문의'].map((label) => (
            <li key={label}>
              <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-body font-normal text-muted">
                <span className="min-w-0">{label}</span>
                <span className={`${chipClass} bg-page`}>준비 중</span>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
