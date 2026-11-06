import LandingCtaLink from './LandingCtaLink.tsx'
import { LANDING_SIGNUP } from './landingContent.ts'

/**
 * 마지막 회원가입 CTA. 히어로와 같은 문구·같은 가입 화면(/signup)으로 연결하는 마무리 장면이다.
 * 히어로(brand 면, 왼쪽 정렬, 요약 카드)를 복제하지 않도록 더 진한 brand-hover 면에 가운데 정렬로 두고, 버튼 위계는 같은 흰 버튼으로 맞춘다.
 * 설명의 brand-soft는 이 면 위에서 글자 대비 4.5:1을 넘고, 파란 면 위라 포커스 표시는 focusRingOnBrand를 쓴다.
 * 본문 좌우 여백을 -mx-5로 넘어 화면 폭 끝까지 펼친다. 안쪽 여백은 글자 확대에 따라 커지지 않도록 px로 고정한다.
 */
export default function LandingSignupCTA() {
  return (
    <section
      aria-labelledby="landing-signup-title"
      className="-mx-5 bg-brand-hover px-[20px] py-12 text-center"
    >
      <h2
        id="landing-signup-title"
        className="text-app-title leading-snug font-semibold text-balance text-surface"
      >
        {LANDING_SIGNUP.title}
      </h2>
      <p className="mt-3 text-body leading-relaxed font-normal text-pretty text-brand-soft">
        {LANDING_SIGNUP.description}
      </p>
      <LandingCtaLink to={LANDING_SIGNUP.ctaTo} className="mt-6">
        {LANDING_SIGNUP.ctaLabel}
      </LandingCtaLink>
    </section>
  )
}
