import { Link } from 'react-router'
import Icon from '../icons/Icon.tsx'
import { focusRing } from '../home/homeStyles.ts'
import LandingSectionHeader from './LandingSectionHeader.tsx'
import { LANDING_EXPLORE, LANDING_EXPLORE_ID } from './landingContent.ts'

const TONE_CLASS = {
  exercise: {
    tile: 'bg-exercise-soft hover:border-exercise/40',
    icon: 'text-exercise',
  },
  meal: {
    tile: 'bg-meal-soft hover:border-meal/40',
    icon: 'text-meal',
  },
} as const

/**
 * 비회원 탐색. 비회원 접근 정책상 열려 있는 운동 찾기·음식 찾기로 보낸다.
 * 두 화면은 아직 임시 화면이라 "화면 준비 중"을 함께 표시한다(콘텐츠의 status). 정식 화면이 생기면 status를 지운다.
 * 헤더와 히어로의 "둘러보기" 앵커가 도착하는 곳이다. 앵커가 이 섹션으로 포커스를 옮기므로 tabIndex={-1}을 둔다.
 * Tab 순서에는 들어가지 않고, 코드로만 받는 포커스라 윤곽선을 그리지 않는다(다음 Tab의 첫 링크에서 보인다).
 *
 * 앞 섹션과 구분되는 흰 전면 띠 위에 의미 색 면 타일 2열을 둔다. 폭이 모자라면(320px·글자 확대) 자동으로 1열이 된다.
 * 격자 최소 폭은 min(9.5rem, 100%)이다. rem만 쓰면 글자 200%에서 최소 폭이 화면보다 커져 가로 스크롤이 생긴다.
 * 타일 폭이 넓으면(320px의 1열) 컨테이너 쿼리로 아이콘을 글 왼쪽에 두어 높이를 줄인다.
 * 타일 전체가 링크이고, 상태 표시는 차분한 글자로 두어 준비 중 기능을 강조하지 않는다. 글자 대비는 두 면 모두 4.5:1 이상이다.
 */
export default function LandingExplore() {
  return (
    <section
      id={LANDING_EXPLORE_ID}
      aria-labelledby="landing-explore-title"
      tabIndex={-1}
      className="-mx-5 scroll-mt-4 bg-surface px-[20px] py-12 outline-none"
    >
      <LandingSectionHeader
        id="landing-explore-title"
        title={LANDING_EXPLORE.title}
      />
      <ul className="mt-6 grid grid-cols-[repeat(auto-fit,minmax(min(9.5rem,100%),1fr))] gap-3">
        {LANDING_EXPLORE.links.map((link) => (
          <li key={link.label} className="@container">
            <Link
              to={link.to}
              className={`flex h-full min-h-11 flex-col gap-3 rounded-card border border-transparent px-[16px] py-4 transition-colors motion-reduce:transition-none @3xs:flex-row ${TONE_CLASS[link.tone].tile} ${focusRing}`}
            >
              <span
                aria-hidden="true"
                className={`flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-control bg-surface ${TONE_CLASS[link.tone].icon}`}
              >
                <Icon name="search" size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <strong className="block text-section-title leading-snug font-semibold text-content">
                  {link.label} <span aria-hidden="true">›</span>
                </strong>
                <span className="mt-1 block text-body leading-snug font-normal text-balance text-content">
                  {link.description}
                </span>
                <span className="mt-auto block pt-4 text-body leading-snug font-normal text-muted">
                  {link.status}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
