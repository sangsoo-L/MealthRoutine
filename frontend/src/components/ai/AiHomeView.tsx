import { Link } from 'react-router'
import AiFeatureCard from './AiFeatureCard.tsx'
import {
  AI_COMMON,
  AI_FEATURES,
  AI_FLOW_STEPS,
  AI_HOME,
  STATUS_LABEL,
} from './aiIntroContent.ts'
import {
  aiCard,
  aiPrimaryButton,
  aiSecondaryButton,
  aiSectionTitle,
} from './aiStyles.ts'

/**
 * 회원 전용 AI 서비스 홈(`/ai`, 로그인한 회원). 기존 I01 안내를 확장했다: 제목·안내, 기능 카드(AI 운동 플랜·AI 식단 추천·음식 사진 분석·주간 기록 리포트),
 * 기능별 상태 배지("이용 가능"·"준비 중"), 상태 안내, 이용 흐름, 이용 범위·참고용 안내, 기록 화면 링크로 구성한다.
 * 기능은 AI_FEATURES 목록에서 그려서 새 AI 기능을 항목 하나로 더할 수 있다. 지금 연결된 곳은 운동 플랜 안내(I02)와 주간 리포트(I05)뿐이고,
 * 식단 추천·사진 분석은 눌 수 없는 준비 중이다. 체험 횟수는 저장·차감하지 않고 실제 AI 결과를 만들지 않는다.
 */
export default function AiHomeView() {
  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {AI_HOME.title}
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          {AI_HOME.lead}
        </p>
      </header>

      <section
        aria-labelledby="ai-features-title"
        className="flex flex-col gap-3"
      >
        <h2 id="ai-features-title" className={aiSectionTitle}>
          {AI_COMMON.featuresTitle}
        </h2>
        <ul role="list" className="flex flex-col gap-3">
          {AI_FEATURES.map((feature) => (
            <AiFeatureCard
              key={feature.key}
              feature={feature}
              audience="member"
              loginNote=""
              state={{ from: '/ai' }}
            />
          ))}
        </ul>
      </section>

      <section aria-labelledby="ai-legend-title" className={aiCard}>
        <h2 id="ai-legend-title" className={aiSectionTitle}>
          {AI_HOME.legendTitle}
        </h2>
        <ul role="list" className="mt-3 flex flex-col gap-2">
          {AI_HOME.legend.map((item) => (
            <li
              key={item.status}
              className="flex items-start gap-2 text-body leading-relaxed font-normal text-content"
            >
              <span
                className={`mt-0.5 inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-support leading-snug font-semibold ${item.status === 'pending' ? 'border-line bg-page text-muted' : 'border-brand bg-brand-soft text-brand'}`}
              >
                {STATUS_LABEL[item.status]}
              </span>
              {item.text}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="ai-flow-title" className={aiCard}>
        <h2 id="ai-flow-title" className={aiSectionTitle}>
          {AI_HOME.flowTitle}
        </h2>
        <ol role="list" className="mt-3 grid grid-cols-3 gap-2">
          {AI_FLOW_STEPS.map((step, index) => (
            <li
              key={step}
              className="flex min-w-0 flex-col items-center gap-1.5 rounded-control bg-page px-2 py-3 text-center"
            >
              <span
                aria-hidden="true"
                className="flex size-6 items-center justify-center rounded-full bg-brand text-support leading-none font-semibold tabular-nums text-surface"
              >
                {index + 1}
              </span>
              <span className="text-body leading-snug font-semibold text-content">
                {step}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-support leading-relaxed font-normal text-muted">
          {AI_HOME.flowNote}
        </p>
      </section>

      <section aria-labelledby="ai-access-title" className={aiCard}>
        <h2 id="ai-access-title" className={aiSectionTitle}>
          {AI_COMMON.accessTitle}
        </h2>
        <ul role="list" className="mt-3 flex flex-col gap-2">
          {AI_COMMON.accessLines.map((line) => (
            <li
              key={line}
              className="flex items-start gap-2 text-body leading-relaxed font-normal text-content"
            >
              <span
                aria-hidden="true"
                className="mt-2 size-1.5 shrink-0 rounded-full bg-brand"
              />
              {line}
            </li>
          ))}
        </ul>
        <p
          role="note"
          className="mt-3 rounded-control bg-page px-3 py-2 text-support leading-relaxed font-normal text-muted"
        >
          {AI_COMMON.disclaimer}
        </p>
      </section>

      <section
        aria-labelledby="ai-cta-title"
        className={aiCard}
        data-ai-cta="member"
      >
        <h2 id="ai-cta-title" className={aiSectionTitle}>
          {AI_HOME.ctaTitle}
        </h2>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {AI_HOME.ctaText}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            to="/records/exercise"
            state={{ from: '/ai' }}
            className={aiPrimaryButton}
          >
            운동 기록으로 가기
          </Link>
          <Link
            to="/records/meal"
            state={{ from: '/ai' }}
            className={aiSecondaryButton}
          >
            식단 기록으로 가기
          </Link>
        </div>
      </section>
    </div>
  )
}
