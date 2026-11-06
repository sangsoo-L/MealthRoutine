import { focusRingOnBrand } from '../home/homeStyles.ts'
import LandingCtaLink from './LandingCtaLink.tsx'
import LandingDashboardPreview from './LandingDashboardPreview.tsx'
import LandingExploreLink from './LandingExploreLink.tsx'
import { LANDING_HERO } from './landingContent.ts'

/**
 * 히어로 배경의 장식 원 하나. 색은 기존 토큰 surface의 투명도(10%)만 쓴다.
 * 원 위에서는 배경이 밝아져 brand-soft 보조 문구의 대비가 4.5:1 아래로 내려가므로, 보조 문구가 시작하는 높이보다 위에서 끝나게 한다.
 */
const HERO_RINGS =
  'bg-[radial-gradient(circle_at_calc(100%-24px)_0px,color-mix(in_srgb,var(--color-surface)_10%,transparent)_72px,transparent_72px)]'

/**
 * 파란 면과 다음 밝은 영역의 경계. 카드의 높이가 글자 확대로 늘어나도 항상 절반 지점에서 색이 바뀌어
 * 음수 여백 없이 카드가 두 영역에 걸친다.
 */
const HERO_CARD_BAND =
  'bg-[linear-gradient(to_bottom,var(--color-brand)_50%,var(--color-page)_50%)]'

/**
 * 홈의 첫 화면. 서비스 가치(제목·설명), 주요 행동(가입), 보조 행동(둘러보기), "운동도 식단도, 한곳에" 카드를 한 화면에 둔다.
 * 카드는 운동 기록과 식단 기록이라는 서비스의 두 축을 소개하는 정적 콘텐츠다. 수치가 없고 눌러서 바꿀 수 없다(기록 기능은 아직 없다).
 *
 * 제목이 화면 제목(h1)을 겸한다. 글자는 타입 스케일의 가장 큰 값(text-metric)이고, 의미 단위로 두 줄로 나눈다.
 * 간격은 제목↔설명 12px < 설명↔버튼 24px < 버튼↔카드 32px로, 묶음이 커질수록 넓어진다.
 * 본문 좌우 여백을 -mx-5로 넘어 화면 폭 끝까지 채우고, 안쪽 여백은 글자 확대에 따라 커지지 않도록 px로 고정한다.
 */
export default function LandingHero() {
  return (
    <section aria-labelledby="landing-hero-title" className="-mx-5">
      <div
        className={`bg-brand px-[20px] pt-8 pb-8 text-surface ${HERO_RINGS}`}
      >
        <h1
          id="landing-hero-title"
          className="text-metric leading-tight font-semibold text-balance text-surface"
        >
          {LANDING_HERO.titleLines.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>
        {/* 보조 문구는 제목보다 한 단계 낮추려고 brand-soft를 쓴다. 파란 면 위 대비는 4.75:1로 기준(4.5:1)을 넘는다. */}
        <p className="mt-3 text-body leading-relaxed font-normal text-pretty text-brand-soft">
          {LANDING_HERO.description}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
          <LandingCtaLink to={LANDING_HERO.ctaTo}>
            {LANDING_HERO.ctaLabel}
          </LandingCtaLink>
          <LandingExploreLink
            className={`inline-flex min-h-11 items-center rounded-control text-body font-normal text-surface underline underline-offset-4 ${focusRingOnBrand}`}
          >
            {LANDING_HERO.exploreLabel}
          </LandingExploreLink>
        </div>
      </div>
      <div className={`px-[20px] ${HERO_CARD_BAND}`}>
        <LandingDashboardPreview />
      </div>
    </section>
  )
}
