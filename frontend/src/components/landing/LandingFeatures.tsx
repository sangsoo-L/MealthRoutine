import { Link } from 'react-router'
import { focusRing } from '../home/homeStyles.ts'
import LandingBadge from './LandingBadge.tsx'
import {
  LANDING_FEATURES,
  LANDING_FEATURES_ID,
  type LandingFeature,
  type LandingTone,
} from './landingContent.ts'

/** 이모지 타일 배경. Tailwind가 클래스를 찾을 수 있도록 완성된 문자열로 둔다. */
const TILE_CLASS: Record<LandingTone, string> = {
  exercise: 'bg-exercise-soft',
  meal: 'bg-meal-soft',
  // 가입 후 이용 카드의 면(bg-brand-soft) 위에 놓이므로 같은 색이면 타일이 사라진다. 흰 타일로 구분한다.
  brand: 'bg-surface',
}

function FeatureTile({ feature }: { feature: LandingFeature }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-card text-metric ${TILE_CLASS[feature.tone]}`}
    >
      {feature.emoji}
    </span>
  )
}

/**
 * [미사용] 이전 랜딩의 "주요 기능 소개" 섹션(가입 없이 이용/가입 후 이용 카드). 프로모션형 B안은 이 섹션 대신 대시보드 소개(LandingDashboardPreview)를 쓴다. 삭제 여부는 사용자 확인 대기.
 *
 * 주요 기능 소개(Section 03). 이동할 수 있는 카드와 소개만 하는 카드를 모양으로 구분한다.
 * - 가입 없이 이용: 테두리가 있는 흰 카드 + 오른쪽 화살표. 눌러서 운동 탐색·음식 검색으로 이동한다.
 * - 가입 후 이용: 테두리 없는 옅은 면 + 자물쇠 배지. 눌러도 아무 일도 없는 소개 카드다(링크·버튼이 아니다).
 * "둘러보기" 앵커의 도착 지점이다. scroll-mt-16은 앵커 도착 지점 위쪽의 숨통이다(상단 바는 없다).
 */
export default function LandingFeatures() {
  return (
    <section
      id={LANDING_FEATURES_ID}
      aria-labelledby="landing-features-title"
      className="scroll-mt-16 py-10"
    >
      <h2
        id="landing-features-title"
        className="text-app-title leading-snug font-semibold text-balance text-content"
      >
        {LANDING_FEATURES.title}
      </h2>
      <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
        {LANDING_FEATURES.description}
      </p>

      <h3 className="mt-6 text-section-title leading-snug font-semibold text-content">
        {LANDING_FEATURES.freeHeading}
      </h3>
      <ul className="mt-3 flex flex-col gap-3">
        {LANDING_FEATURES.free.map((feature) => (
          <li key={feature.title}>
            <Link
              to={feature.to}
              className={`flex min-h-20 flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-[16px] py-4 transition-colors hover:border-brand/40 active:bg-brand-soft motion-reduce:transition-none ${focusRing}`}
            >
              <FeatureTile feature={feature} />
              <span className="min-w-0 flex-1 basis-40">
                {/* 이동 카드의 화살표는 제목 줄에 붙인다: 글자를 키워 줄이 바뀌어도 화살표가 혼자 떨어지지 않는다. */}
                <strong className="block text-body leading-snug font-semibold text-content">
                  {feature.title} <span aria-hidden="true">›</span>
                </strong>
                <span className="mt-1 block text-support leading-relaxed font-normal text-muted">
                  {feature.description}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <h3 className="mt-8 text-section-title leading-snug font-semibold text-content">
        {LANDING_FEATURES.memberHeading}
      </h3>
      <ul className="mt-3 flex flex-col gap-3">
        {LANDING_FEATURES.member.map((feature) => (
          <li
            key={feature.title}
            className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-card bg-brand-soft px-[16px] py-4"
          >
            <FeatureTile feature={feature} />
            <div className="min-w-0 flex-1 basis-40">
              <strong className="block text-body leading-snug font-semibold text-content">
                {feature.title}
              </strong>
              <span className="mt-1 block text-support leading-relaxed font-normal text-muted">
                {feature.description}
              </span>
              <span className="mt-2 block">
                <LandingBadge kind="member">
                  {LANDING_FEATURES.memberBadge}
                </LandingBadge>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
