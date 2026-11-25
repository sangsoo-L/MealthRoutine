import { Link } from 'react-router'
import { focusRing } from '../home/homeStyles.ts'
import Icon from '../icons/Icon.tsx'
import LandingBadge from './LandingBadge.tsx'
import { LANDING_AI } from './landingContent.ts'

/**
 * AI 건강관리 소개. 기능 4종(AI 운동 플랜·AI 식단 추천·음식 사진 분석·주간 운동·식단 기록 분석)을 제공 상태와 함께 소개하고,
 * "AI 서비스 자세히 알아보기"로 `/ai`(비로그인은 AI 소개 랜딩)에 로그인 없이 들어가게 한다.
 * 운동 플랜·식단 추천·사진 분석은 "로컬 예시 체험 · 로그인 후", 주간 기록 분석은 "로그인 후 이용" 배지로 같은 모양을 쓴다.
 * 카드 없이 여백으로 묶는 기존 섹션 구조를 유지한다. 가짜 AI 결과와 가격은 없고, 이용 조건은 v5.0 명세에서 확인되는 내용만 적는다(근거는 LANDING_AI 주석).
 */
export default function LandingAiServices() {
  return (
    <section
      aria-labelledby="landing-ai-title"
      className="-mx-5 px-[20px] py-12"
    >
      <h2
        id="landing-ai-title"
        className="text-section-title leading-snug font-semibold text-content"
      >
        {LANDING_AI.title}
      </h2>
      <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
        {LANDING_AI.lead}
      </p>
      <ul className="mt-5 flex flex-col gap-5">
        {LANDING_AI.items.map((item) => (
          <li
            key={item.title}
            data-landing-ai-item={item.status}
            className="flex gap-3"
          >
            <span
              aria-hidden="true"
              className="flex h-[32px] w-[32px] shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand"
            >
              <Icon name={item.icon} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex min-h-[32px] flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-body leading-snug font-semibold text-content">
                  {item.title}
                </h3>
                <LandingBadge kind="member">{item.statusLabel}</LandingBadge>
              </div>
              <p className="text-body leading-relaxed font-normal text-pretty text-muted">
                {item.text}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <Link
        to={LANDING_AI.ctaTo}
        data-landing-ai-cta=""
        className={`mt-6 flex min-h-12 items-center justify-center rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand transition hover:bg-brand-soft motion-reduce:transition-none ${focusRing}`}
      >
        {LANDING_AI.ctaLabel}
      </Link>
      <div className="mt-6 border-t border-line pt-5">
        <p className="text-body leading-relaxed font-normal text-pretty text-muted">
          {LANDING_AI.access}
        </p>
        <p className="mt-2 text-body leading-relaxed font-normal text-pretty text-muted">
          {LANDING_AI.disclaimer}
        </p>
      </div>
    </section>
  )
}
