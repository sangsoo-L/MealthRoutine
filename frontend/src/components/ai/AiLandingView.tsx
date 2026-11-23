import { Link } from 'react-router'
import { PLAN_EXAMPLES } from '../../ai/exercisePlanExample.ts'
import Icon from '../icons/Icon.tsx'
import { LANDING_IMAGES } from '../landing/landingImages.ts'
import {
  AI_COMMON,
  AI_FEATURES,
  AI_LANDING,
  type AiFeature,
} from './aiIntroContent.ts'
import { aiFocusRing } from './aiStyles.ts'

/*
 * 이 화면은 탐색·운동 찾기·음식 찾기와 같은 공통 규칙을 따른다(사용자 지시):
 * 제목 text-app-title(22px) · 섹션/카드 제목 text-section-title(15px) · 본문·행 제목·행동 text-body(14px) · 짧은 보조 정보·배지 text-support(12px),
 * 카드 모서리 rounded-card(12px) · 버튼 rounded-control, 굵기는 제목 600·설명 400. 전역 토큰과 다른 화면은 바꾸지 않는다.
 * 운동은 exercise·exercise-soft, 식단은 meal·meal-soft 토큰을 그대로 쓴다.
 */
const card = 'rounded-card border border-line bg-surface'
const badge =
  'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-support leading-snug font-semibold'

const feature = (key: string): AiFeature => {
  const found = AI_FEATURES.find((item) => item.key === key)
  if (!found) throw new Error(`unknown AI feature: ${key}`)
  return found
}

/** 고정 예시 한 건(맨몸·초급). I02 안내 화면이 쓰는 데이터를 그대로 쓰며 이 화면에서 새로 만들지 않는다. */
const EXAMPLE = PLAN_EXAMPLES[0]
const HERO = LANDING_IMAGES.hero

/**
 * 비회원 AI 서비스 화면(`/ai`, 로그인하지 않았을 때). 서비스 목록처럼 한눈에 고르도록 구성한다.
 * 순서: 제목과 작은 운동·식단 삽화 → 운동 플랜·식단 추천 카드 2개 → 기록 목록(주간 리포트·음식 사진 분석) → 접이식 이용·체험 안내 → 의료 안내와 회원가입.
 *
 * - 운동 플랜 카드는 카드 전체가 고정 예시(I02) 링크다(안에 링크·버튼을 중첩하지 않는다). 조건 요약은 I02와 같은 PLAN_EXAMPLES에서 가져온다.
 *   예시 운동 구성은 I02에서 보고, 이 화면에는 두지 않는다. 실제 AI 추천이 아니라는 점은 "고정 예시" 배지와 카드 아래 안내로 전한다.
 * - 식단 카드는 준비 중이라 링크·화살표·클릭 효과가 없고 "준비 중" 배지로 상태를 전한다.
 * - 주간 리포트(I05) 행은 로그인 링크다. 로그인 후 리포트로 돌아오게 returnTo를 넘긴다(검증은 auth/returnTo의 safeReturnTo). 수치·점수는 보이지 않는다.
 * - 음식 사진 분석 행은 준비 중이라 링크·chevron·클릭 효과가 없다. 네 기능은 각각 한 번씩만 나온다.
 * - 이용 조건은 AI_FEATURES·AI_COMMON의 기존 문구를 그대로 옮긴다(의미를 바꾸지 않는다). 체험·결제·AI 호출은 없다.
 * 같은 기능 목록을 쓰는 회원 허브(AiHomeView)는 이 화면과 별개다.
 */
export default function AiLandingView() {
  const exercise = feature('exercise')
  const meal = feature('meal')
  const weekly = feature('weekly')
  const photo = feature('photo')

  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-40">
          <h1 className="text-app-title leading-snug font-semibold text-content">
            {AI_LANDING.pageTitle}
          </h1>
          <p className="mt-1 text-body leading-relaxed font-normal text-muted">
            {AI_LANDING.pageLead}
          </p>
        </div>
        {HERO ? (
          <img
            src={HERO.src}
            width={HERO.width}
            height={HERO.height}
            alt=""
            aria-hidden="true"
            decoding="async"
            data-ai-hero=""
            className="h-auto w-18 shrink-0 min-[360px]:w-22"
          />
        ) : null}
      </header>

      <section aria-label="AI 코칭 기능" className="flex flex-col gap-3">
        {/* 390px에서는 두 카드가 나란히, 좁으면(320px·글자 확대) 한 줄씩이다. 칸은 컨테이너 쿼리로 아이콘을 글 옆(가로)이나 위(세로)에 둔다. */}
        <ul
          role="list"
          className="grid grid-cols-2 gap-3 max-[22.5rem]:grid-cols-1"
        >
          <li className="@container">
            <Link
              to="/ai/exercise"
              state={{ from: '/ai' }}
              data-ai-feature="exercise"
              data-ai-status="guide"
              data-ai-preview=""
              data-ai-example-link=""
              className={`flex h-full min-h-11 flex-col gap-3 rounded-card border border-exercise/20 bg-exercise-soft p-4 transition-colors hover:border-exercise/50 motion-reduce:transition-none @min-[14rem]:flex-row @min-[14rem]:items-start ${aiFocusRing}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-exercise"
              >
                <Icon name={exercise.icon} size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-section-title leading-snug font-semibold text-content">
                  {exercise.title}
                </span>
                <span className="flex">
                  <span className={`${badge} bg-surface text-exercise`}>
                    {AI_LANDING.previewBadge}
                  </span>
                </span>
                <span className="text-support leading-snug font-normal text-content">
                  {EXAMPLE.tabLabel} · {EXAMPLE.conditions.difficulty}
                </span>
                <span className="mt-auto flex items-center gap-0.5 pt-2 text-body leading-snug font-semibold text-exercise">
                  {AI_LANDING.cardExerciseCta}
                  <Icon name="chevron-right" size={18} />
                </span>
              </span>
            </Link>
          </li>
          <li className="@container">
            <div
              data-ai-feature="meal"
              data-ai-status="guide"
              className="flex h-full flex-col gap-3 rounded-card border border-meal/20 bg-meal-soft p-4 @min-[14rem]:flex-row @min-[14rem]:items-start"
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface text-meal"
              >
                <Icon name={meal.icon} size={20} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-section-title leading-snug font-semibold text-content">
                  {meal.title}
                </span>
                <span className="flex">
                  <span className={`${badge} bg-surface text-muted`}>
                    {AI_LANDING.pendingBadge}
                  </span>
                </span>
                <span className="text-support leading-snug font-normal text-content">
                  {AI_LANDING.cardMealLead}
                </span>
              </span>
            </div>
          </li>
        </ul>
        <p
          data-ai-cards-note=""
          className="text-body leading-relaxed font-normal text-muted"
        >
          {AI_LANDING.cardsNote}
        </p>
      </section>

      <section aria-labelledby="ai-records-title">
        <h2
          id="ai-records-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          {AI_LANDING.recordsTitle}
        </h2>
        <ul role="list" className={`mt-3 divide-y divide-line ${card}`}>
          <li>
            <Link
              to="/login"
              state={{ returnTo: '/ai/weekly-report' }}
              data-ai-feature="weekly"
              data-ai-status="available"
              data-ai-login-note=""
              className={`flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 rounded-card px-4 py-3 transition-colors hover:bg-page motion-reduce:transition-none ${aiFocusRing}`}
            >
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand"
              >
                <Icon name={weekly.icon} size={20} />
              </span>
              <span className="min-w-0 flex-1 basis-32">
                <span className="block text-body leading-snug font-semibold text-content">
                  {weekly.title}
                  {/* 눈에는 보이지 않지만 이 행이 로그인 후 리포트를 보는 링크임을 보조기기에 알린다. */}
                  <span className="sr-only">, {AI_LANDING.weeklyCta}</span>
                </span>
                <span className="mt-0.5 block text-support leading-snug font-normal text-muted">
                  {AI_LANDING.weeklyRowSub}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <span className={`${badge} bg-brand-soft text-brand`}>
                  {AI_LANDING.weeklyBadge}
                </span>
                <Icon
                  name="chevron-right"
                  size={18}
                  className="shrink-0 text-muted"
                />
              </span>
            </Link>
          </li>
          <li
            data-ai-feature="photo"
            data-ai-status="pending"
            className="flex min-h-16 flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
          >
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-control bg-page text-muted"
            >
              <Icon name="camera" size={20} />
            </span>
            <span className="min-w-0 flex-1 basis-32">
              <span className="block text-body leading-snug font-semibold text-content">
                {photo.title}
              </span>
              <span className="mt-0.5 block text-support leading-snug font-normal text-muted">
                {AI_LANDING.photoRowSub}
              </span>
            </span>
            <span className={`${badge} border border-line bg-page text-muted`}>
              {AI_LANDING.pendingBadge}
            </span>
          </li>
        </ul>
      </section>

      <details
        data-ai-guide=""
        className={`group ${card} [&>summary::-webkit-details-marker]:hidden`}
      >
        <summary
          className={`flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-2 text-body leading-snug font-semibold text-content ${aiFocusRing}`}
        >
          <span className="min-w-0">{AI_LANDING.guideTitle}</span>
          <Icon
            name="chevron-down"
            size={20}
            className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
          <section aria-labelledby="ai-guide-flow-title">
            <h3
              id="ai-guide-flow-title"
              className="text-body leading-snug font-semibold text-content"
            >
              {AI_LANDING.guideFlowTitle}
            </h3>
            <ol role="list" className="mt-3 flex flex-col gap-3">
              {AI_LANDING.flowSteps.map((step, index) => (
                <li key={step.title} className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand text-support leading-none font-semibold text-surface tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-body leading-snug font-semibold text-content">
                      {step.title}
                    </span>
                    <span className="mt-0.5 block text-body leading-relaxed font-normal text-muted">
                      {step.text}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="ai-guide-access-title">
            <h3
              id="ai-guide-access-title"
              className="text-body leading-snug font-semibold text-content"
            >
              {AI_LANDING.guideAccessTitle}
            </h3>
            <ul
              role="list"
              className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed font-normal text-muted"
            >
              {AI_COMMON.accessLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>{AI_LANDING.guideMealNote}</li>
              <li>{AI_LANDING.guidePhotoNote}</li>
            </ul>
            <dl className="mt-3 flex flex-col gap-2 text-body leading-relaxed">
              {AI_FEATURES.map((item) => (
                <div
                  key={item.key}
                  className="rounded-control bg-page px-3 py-2"
                >
                  <dt className="font-semibold text-content">{item.title}</dt>
                  <dd className="font-normal text-muted">{item.access}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </details>

      <footer className="flex flex-col gap-2">
        <p
          role="note"
          className="text-body leading-relaxed font-normal text-muted"
        >
          {AI_COMMON.disclaimer}
        </p>
        <p className="flex flex-wrap items-center gap-x-2 text-body leading-relaxed font-normal text-muted">
          {AI_LANDING.signupText}
          <Link
            to="/signup"
            data-ai-cta="guest"
            className={`inline-flex min-h-11 items-center rounded-control font-semibold text-brand underline underline-offset-2 ${aiFocusRing}`}
          >
            {AI_LANDING.signupLabel}
          </Link>
        </p>
      </footer>
    </div>
  )
}
