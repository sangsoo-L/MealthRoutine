import { Link } from 'react-router'
import Icon from '../icons/Icon.tsx'
import AiFeatureCard from './AiFeatureCard.tsx'
import { AI_COMMON, AI_FEATURES, AI_LANDING } from './aiIntroContent.ts'
import {
  aiCard,
  aiPrimaryButton,
  aiSecondaryButton,
  aiSectionTitle,
} from './aiStyles.ts'

/** 히어로의 장식 아이콘(운동·식단·사진·리포트). 의미는 아래 기능 카드의 글자로 전한다. */
const HERO_ICONS = ['dumbbell', 'utensils', 'eye', 'chart'] as const

/**
 * 비회원 AI 소개 랜딩(`/ai`, 로그인하지 않았을 때). 구성: 히어로 → 주요 기능 4종 → 이용 흐름 → 기본 기록 무료 안내 → 고정 예시(I02) 링크 → 로그인·가입.
 * 아직 제공되지 않는 기능은 "준비 중"으로 표시하고 이용 가능하다고 쓰지 않는다. 이용할 수 있는 것은 기본 주간 리포트(로그인 후)뿐이다.
 * 실제 AI 결과·영양값·점수를 만들거나 보여 주지 않고, 체험 횟수를 저장·차감하지 않는다.
 * 로그인 링크는 현재 경로(`/ai`)를 returnTo로 넘겨 로그인 후 AI 서비스 홈으로 돌아오게 한다(검증은 auth/returnTo의 safeReturnTo).
 */
export default function AiLandingView() {
  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header className="rounded-card bg-brand p-5 text-surface">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-surface/15 px-2.5 py-1 text-support leading-none font-semibold">
          <Icon name="sparkle" size={18} />
          {AI_LANDING.badge}
        </p>
        <h1 className="mt-3 text-app-title leading-snug font-semibold">
          {AI_LANDING.title}
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal">
          {AI_LANDING.lead}
        </p>
        <ul
          aria-hidden="true"
          className="mt-4 flex items-center gap-2"
          data-ai-hero-icons=""
        >
          {HERO_ICONS.map((icon) => (
            <li
              key={icon}
              className="flex size-10 items-center justify-center rounded-full bg-surface/15"
            >
              <Icon name={icon} size={20} />
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-control bg-surface/15 px-3 py-2 text-support leading-relaxed font-semibold">
          {AI_LANDING.heroNote}
        </p>
      </header>

      <section
        aria-labelledby="ai-features-title"
        className="flex flex-col gap-3"
      >
        <div>
          <h2 id="ai-features-title" className={aiSectionTitle}>
            {AI_COMMON.featuresTitle}
          </h2>
          <p className="mt-1 text-body leading-relaxed font-normal text-muted">
            {AI_LANDING.featuresLead}
          </p>
        </div>
        <ul role="list" className="flex flex-col gap-3">
          {AI_FEATURES.map((feature) => (
            <AiFeatureCard
              key={feature.key}
              feature={feature}
              audience="guest"
              loginNote={AI_LANDING.loginNote}
              state={{ from: '/ai' }}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="ai-flow-title" className={aiCard}>
        <h2 id="ai-flow-title" className={aiSectionTitle}>
          {AI_LANDING.flowTitle}
        </h2>
        <ol role="list" className="mt-3 flex flex-col gap-3">
          {AI_LANDING.flowSteps.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-support leading-none font-semibold tabular-nums text-surface"
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block text-body leading-snug font-semibold text-content">
                  {step.title}
                </span>
                <span className="mt-0.5 block text-support leading-relaxed font-normal text-muted">
                  {step.text}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="ai-free-title" className={aiCard}>
        <h2 id="ai-free-title" className={aiSectionTitle}>
          {AI_LANDING.freeTitle}
        </h2>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {AI_LANDING.freeText}
        </p>
        <p
          role="note"
          className="mt-3 rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
        >
          {AI_COMMON.disclaimer}
        </p>
      </section>

      <section aria-labelledby="ai-example-title" className={aiCard}>
        <h2 id="ai-example-title" className={aiSectionTitle}>
          {AI_LANDING.exampleTitle}
        </h2>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {AI_LANDING.exampleText}
        </p>
        <Link
          to="/ai/exercise"
          state={{ from: '/ai' }}
          data-ai-example-link=""
          className={`mt-3 ${aiSecondaryButton}`}
        >
          {AI_LANDING.exampleLabel}
        </Link>
      </section>

      <section
        aria-labelledby="ai-cta-title"
        className={aiCard}
        data-ai-cta="guest"
      >
        <h2 id="ai-cta-title" className={aiSectionTitle}>
          {AI_LANDING.ctaTitle}
        </h2>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {AI_LANDING.ctaText}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            to="/login"
            state={{ returnTo: '/ai' }}
            className={aiPrimaryButton}
          >
            로그인하기
          </Link>
          <Link to="/signup" className={aiSecondaryButton}>
            회원가입
          </Link>
        </div>
      </section>
    </div>
  )
}
