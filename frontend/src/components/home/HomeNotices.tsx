import { Link } from 'react-router'
import { HOME_NOTICES } from './homeContent.ts'
import { focusRing } from './homeStyles.ts'

/**
 * v5.0 홈 하단의 공지사항 미리보기. 회원 홈(MemberHomePage)이 사용하고, 비회원 랜딩(H01)은 렌더링하지 않는다.
 *
 * 공지사항 미리보기 2개와 고객지원(S01)으로 가는 링크. 목록은 시안 콘텐츠(Mock)이며 공지 API가 정해지면 교체한다.
 * 홈의 맨 아래라 가장 조용하게: 한 장의 목록 카드 안에서 행 구분선만 둔다.
 */
export default function HomeNotices() {
  return (
    <section aria-labelledby="home-notices-title">
      {/* 폭이 모자라면(글자 확대 등) "전체 보기" 링크가 아래로 내려가 제목이 끊기지 않는다. */}
      <div className="flex flex-wrap items-end justify-between gap-x-3">
        <div className="min-w-0">
          <p className="text-support font-normal text-muted">밀스루틴 소식</p>
          <h2
            id="home-notices-title"
            className="mt-1 text-section-title leading-snug font-semibold text-content"
          >
            공지사항
          </h2>
        </div>
        <Link
          to="/support"
          className={`inline-flex min-h-11 shrink-0 items-center rounded-control text-support font-normal text-brand ${focusRing}`}
        >
          <span>
            전체 보기 <span aria-hidden="true">›</span>
          </span>
        </Link>
      </div>
      <ul className="mt-3 overflow-clip rounded-card border border-line bg-surface">
        {HOME_NOTICES.map((notice) => (
          <li
            key={notice.title}
            className="border-b border-line last:border-b-0"
          >
            <Link
              to="/support"
              // 포커스 윤곽선이 카드 모서리에서 잘리지 않도록 안쪽으로 그린다.
              className="flex min-h-14 items-center gap-3 px-[16px] py-3 transition-colors hover:bg-brand-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-brand motion-reduce:transition-none"
            >
              <span className="min-w-0 flex-1">
                <span className="inline-flex rounded-full bg-brand-soft px-2 py-0.5 text-support font-normal text-brand">
                  {notice.tag}
                </span>
                <span className="mt-1 block text-body leading-snug font-semibold text-content">
                  {notice.title}
                </span>
              </span>
              <span aria-hidden="true" className="shrink-0 text-muted">
                ›
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
