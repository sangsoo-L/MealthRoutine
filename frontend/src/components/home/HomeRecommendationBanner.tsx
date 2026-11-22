import { Link } from 'react-router'
import { focusRing } from './homeStyles.ts'
import {
  PREPARING_LABEL,
  getHomeRecommendation,
  type HomeRecommendation,
} from './homeRecommendation.ts'

interface HomeRecommendationBannerProps {
  /** 보여 줄 추천. 없으면 규칙(getHomeRecommendation)이 정한다 */
  recommendation?: HomeRecommendation
}

/**
 * 회원 홈의 "오늘의 추천" 배너. 인사 바로 아래에서 다음 행동 하나를 안내한다.
 *
 * - 규칙 기반이다. AI·개인화 추천이 아니다(homeRecommendation.ts). 자동 넘김·캐러셀·애니메이션이 없다.
 * - 연한 블루 면에 제목·설명·CTA를 위계대로 놓는다. 장식 이모지는 글을 가리지 않는 작은 타일이다.
 * - 이동할 화면이 임시 화면(availability: preparing)이면 "화면 준비 중"을 글자로 함께 표시하고, 설명도 준비 중임을 밝힌다.
 * - CTA는 기존 라우트로 가는 링크이고 터치 영역이 44px 이상이다. 연한 면 위의 채워진 버튼이라 포커스 윤곽선은 파란색(focusRing)이다. 폭이 모자라면(글자 확대) 안내 글과 CTA가 줄을 바꾼다.
 */
export default function HomeRecommendationBanner({
  recommendation = getHomeRecommendation(),
}: HomeRecommendationBannerProps) {
  const preparing = recommendation.availability === 'preparing'

  return (
    <section
      aria-labelledby="home-recommendation-title"
      className="rounded-card bg-brand-soft px-[20px] py-6"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-3">
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-support leading-snug font-semibold text-brand">
            {recommendation.label}
          </p>
          <h2
            id="home-recommendation-title"
            className="mt-1 text-section-title leading-snug font-semibold text-balance text-content"
          >
            {recommendation.title}
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
            {recommendation.description}
          </p>
        </div>
        <span
          aria-hidden="true"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-card bg-surface text-metric"
        >
          {recommendation.emoji}
        </span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to={recommendation.href}
          className={`inline-flex min-h-11 items-center justify-center rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${focusRing}`}
        >
          {recommendation.ctaLabel}
          <span aria-hidden="true" className="ml-1">
            ›
          </span>
        </Link>
        {preparing ? (
          <span className="rounded-full bg-surface px-2.5 py-0.5 text-support leading-snug font-normal text-content">
            {PREPARING_LABEL}
          </span>
        ) : null}
      </div>
    </section>
  )
}
