import { Link } from 'react-router'
import Icon from '../components/icons/Icon.tsx'
import {
  EXPLORE_CATEGORIES,
  EXPLORE_COPY,
  EXPLORE_KEYWORD_GROUPS,
  type ExploreCategory,
  type ExploreKeywordGroup,
} from './exploreContent.ts'

const focusRing =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand'

/**
 * 통합검색 진입 요소. 입력창처럼 보이지만 입력 필드가 아니라 `/search`로 가는 링크다(탐색 화면에서는 입력하지 않는다).
 * 입력은 검색 화면에서 하고, 그곳에서 입력창에 바로 포커스가 간다.
 */
function ExploreSearchEntry() {
  return (
    <Link
      to="/search"
      className={`relative flex h-12 w-full items-center rounded-full border border-line bg-surface pr-4 pl-12 text-body font-normal text-muted transition-colors hover:border-muted motion-reduce:transition-none ${focusRing}`}
    >
      <Icon
        name="search"
        className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted"
      />
      {EXPLORE_COPY.searchPlaceholder}
      <span className="sr-only"> (통합검색 화면으로 이동)</span>
    </Link>
  )
}

// 디자인 가이드 v5.0: 운동은 인디고(exercise), 식단은 오렌지(meal)가 영역의 메인 컬러다. 채운 면으로 쓴다. 글자는 모두 흰색(대비 5:1 이상)이다.
// 포커스 윤곽선은 카드 바깥(offset)에 그려 채운 면 위에서도 보인다.
const TONE: Record<ExploreCategory['key'], string> = {
  exercise: 'bg-exercise hover:brightness-95 active:brightness-90',
  meal: 'bg-meal hover:brightness-95 active:brightness-90',
}

/**
 * 운동 찾기·음식 찾기 카드. 이 화면에서 가장 먼저 눈에 들어오는 행동 유도 요소다.
 * 두 칸의 폭·높이·내부 위치가 같고(위: 아이콘 타일과 화살표, 아래: 제목·설명) 카드 전체가 하나의 링크다.
 * 모서리의 큰 아이콘은 도메인을 알려 주는 장식이다(aria-hidden, 글자와 겹쳐도 읽기 방해가 없는 옅은 투명도).
 */
function ExploreCategoryCards() {
  return (
    <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,max(9rem,calc((100%-12px)/2))),1fr))] items-stretch gap-3">
      {EXPLORE_CATEGORIES.map((item) => (
        <li key={item.key} className="flex">
          <Link
            to={item.to}
            state={{ from: '/explore' }}
            className={`relative flex min-h-44 w-full flex-col justify-between gap-6 overflow-hidden rounded-card p-5 text-surface transition-[background-color,filter] motion-reduce:transition-none ${TONE[item.key]} ${focusRing}`}
          >
            <Icon
              name={item.icon}
              className="pointer-events-none absolute -right-4 -bottom-4 size-24 text-surface opacity-10"
            />
            <span className="relative flex items-start justify-between">
              <span
                aria-hidden="true"
                className="flex size-12 shrink-0 items-center justify-center rounded-card bg-surface/20"
              >
                <Icon name={item.icon} size={30} />
              </span>
              <Icon name="arrow-right" size={20} />
            </span>
            <span className="relative flex flex-col gap-1">
              <span className="text-section-title leading-snug font-semibold">
                {item.title}
              </span>
              <span className="text-support leading-snug font-normal">
                {item.description}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

const CHIP_TONE: Record<
  ExploreKeywordGroup['key'],
  { label: string; chip: string }
> = {
  exercise: {
    label: 'text-exercise',
    chip: 'border-exercise/20 bg-exercise-soft text-exercise hover:border-exercise/50',
  },
  meal: {
    label: 'text-meal',
    chip: 'border-meal/20 bg-meal-soft text-meal hover:border-meal/50',
  },
}

/**
 * 추천 검색어와 탐색 안내를 하나의 구역으로 묶는다(둘 다 "검색어를 모를 때"의 도움이라 목적이 이어진다).
 * 검색어는 시안용 예시이며, 누르면 그 검색어로 통합검색(/search)이 열린다. 운동·식단은 라벨과 색으로 구분한다.
 */
function ExploreHelp() {
  return (
    <section
      aria-labelledby="explore-suggestions"
      className="-mx-5 border-y border-line bg-surface px-5 py-6"
    >
      <h3
        id="explore-suggestions"
        className="text-section-title leading-snug font-semibold text-content"
      >
        {EXPLORE_COPY.suggestionsTitle}
      </h3>
      <p className="mt-1 text-support leading-relaxed font-normal text-muted">
        {EXPLORE_COPY.suggestionsDescription}
      </p>
      <div className="mt-5 flex flex-col gap-5">
        {EXPLORE_KEYWORD_GROUPS.map((group) => (
          <div key={group.key}>
            <p
              className={`text-support leading-snug font-semibold ${CHIP_TONE[group.key].label}`}
            >
              {group.label}
            </p>
            <ul
              aria-label={`${group.label} 추천 검색어`}
              className="mt-2 flex flex-wrap gap-2"
            >
              {group.keywords.map((keyword) => (
                <li key={keyword}>
                  {/* 검색어를 주소(?q=&c=)로 넘겨 통합검색이 바로 그 검색을 시작한다. 식단 키워드는 음식 검색(food)이다. */}
                  <Link
                    to={`/search?q=${encodeURIComponent(keyword)}&c=${group.key === 'meal' ? 'food' : 'exercise'}`}
                    className={`flex min-h-11 items-center rounded-full border px-[14px] text-body leading-snug font-normal transition-colors motion-reduce:transition-none ${CHIP_TONE[group.key].chip} ${focusRing}`}
                  >
                    {keyword}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-6 flex items-start gap-3 border-t border-line pt-5">
        <Icon
          name="sparkle"
          size={18}
          className="mt-[2px] shrink-0 text-brand"
        />
        <div>
          <p className="text-body leading-snug font-semibold text-content">
            {EXPLORE_COPY.guideTitle}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {EXPLORE_COPY.guideDescription}
          </p>
        </div>
      </div>
    </section>
  )
}

/**
 * 통합 탐색 메인(`/explore`). 하단 탭 '탐색'의 도착 화면이다. 화면명세 v5.0에 없는 화면이라 화면 ID가 없다.
 * 위에서부터: 브랜드 블루 그라데이션의 시작 영역(제목·검색) → 운동/음식 카드(핵심 행동) → 흰 밴드(검색어 예시·안내).
 * 회원 홈과 같은 규칙으로 섹션 사이를 40px 비우고 흰 밴드(-mx-5, AppShell 본문 좌우 여백 20px을 뚫는다)로 구역을 나눈다.
 * 검색창은 입력 필드가 아니라 통합검색(/search)으로 가는 링크이고, 추천 검색어는 그 검색어로 /search를 연다.
 */
export default function ExplorePage() {
  return (
    <div className="flex flex-col gap-10 pb-4 break-keep wrap-anywhere">
      {/* -mt-5는 AppShell 본문의 위쪽 여백(20px)을 상쇄해 그라데이션이 화면 맨 위에서 시작하게 한다. */}
      <header className="-mx-5 -mt-5 bg-linear-to-b from-brand-soft to-page px-5 pt-8 pb-2">
        <h2 className="text-app-title leading-snug font-semibold text-content">
          {EXPLORE_COPY.title}
        </h2>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {EXPLORE_COPY.description}
        </p>
        <div className="mt-6">
          <ExploreSearchEntry />
        </div>
      </header>

      <section aria-label="찾기 카테고리" className="-mt-4">
        <ExploreCategoryCards />
      </section>

      <ExploreHelp />
    </div>
  )
}
