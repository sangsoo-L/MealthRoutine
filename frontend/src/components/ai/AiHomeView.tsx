import { Link } from 'react-router'
import Icon from '../icons/Icon.tsx'
import {
  AI_COMMON,
  AI_FEATURES,
  AI_FLOW_STEPS,
  AI_HOME,
  STATUS_LABEL,
  effectiveStatus,
  type AiFeature,
  type AiFeatureStatus,
} from './aiIntroContent.ts'
import { aiFocusRing } from './aiStyles.ts'

/*
 * 이 화면은 비회원 /ai·탐색 화면과 같은 공통 규칙을 따른다(사용자 지시):
 * 제목 text-app-title(22px) · 섹션/카드 제목 text-section-title(15px) · 본문·버튼·링크 text-body(14px) · 배지·보조 안내 text-support(12px),
 * 카드 모서리 rounded-card(12px), 굵기는 제목·버튼 600·설명 400. 예외 글자 크기(text-xl·text-metric 등)와 큰 모서리는 쓰지 않는다.
 */
const card = 'rounded-card border border-line bg-surface'
const badgeBase =
  'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-support leading-snug font-semibold'

const feature = (key: string): AiFeature => {
  const found = AI_FEATURES.find((item) => item.key === key)
  if (!found) throw new Error(`unknown AI feature: ${key}`)
  return found
}

/** 상태 배지 모양. 이용 가능·로컬 예시는 브랜드색, 준비 중은 중립색이며 항상 글자가 함께 있다(색만으로 구분하지 않는다). */
function statusBadge(status: AiFeatureStatus): string {
  return status === 'available' || status === 'local'
    ? `${badgeBase} bg-brand-soft text-brand`
    : `${badgeBase} border border-line bg-page text-muted`
}

const iconTile =
  'flex size-10 shrink-0 items-center justify-center rounded-control'

/**
 * 회원 전용 AI 코칭 허브(`/ai`, 로그인한 회원). 긴 설명 대신 지금 고를 수 있는 기능과 다음 행동이 바로 보이도록 구성한다.
 * 순서: 제목 → 대표 기능(AI 운동 플랜, 이 화면의 유일한 채움 버튼) → 보조 기능(주간 기록 리포트·AI 식단 추천) → 준비 중인 기능(눌 수 없음)
 * → 접이식 이용 범위·체험 안내 → 의료 안내와 기록 바로가기.
 *
 * - 기능 데이터·이용 조건·상태는 AI_FEATURES(비회원 화면과 같은 목록)를 그대로 쓴다. 이 화면은 표현만 바꿨고 정책·권한·체험 횟수는 건드리지 않는다.
 * - 운동 플랜은 "로컬 예시"다: 실제 AI가 분석한 추천이 아니라고 카드에 밝힌다. 조건 선택(I02-1)이 대표 행동이고 안내(I02)는 가벼운 보조 링크다.
 * - 주간 리포트(I05)는 AI 없이 제공되는 기본 리포트라 "이용 가능"이다(테두리 버튼).
 * - 식단 추천은 "준비 중"이다. 식단 목표 확인과 조건 선택(I03)까지만 열려 있어 가장 가벼운 텍스트 링크로 두고, 추천 결과가 즉시 나오는 것처럼 강조하지 않는다.
 * - 사진 분석은 분석 서버가 없어 "준비 중"이다. 행 자체는 눌리지 않고, 사진을 골라 볼 수 있는 I04로 가는 링크만 따로 둔다(분석은 시작할 수 없다).
 * 체험 횟수는 저장·차감하지 않고 실제 AI 결과를 만들지 않는다.
 */
export default function AiHomeView() {
  const exercise = feature('exercise')
  const weekly = feature('weekly')
  const meal = feature('meal')
  const photo = feature('photo')
  const exerciseStatus = effectiveStatus(exercise, 'member')
  const weeklyStatus = effectiveStatus(weekly, 'member')
  const mealStatus = effectiveStatus(meal, 'member')
  const guide = exercise.links?.[0]
  const plan = exercise.links?.[1]
  const mealLink = meal.links?.[0]
  const photoLink = photo.links?.[0]
  const weeklyLink = weekly.links?.[0]

  return (
    <div className="flex min-w-0 flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {AI_HOME.title}
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-muted">
          {AI_HOME.lead}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <section
          aria-labelledby="ai-main-title"
          data-ai-feature="exercise"
          data-ai-status={exerciseStatus}
          data-ai-main=""
          className={`${card} p-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-32 flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                id="ai-main-title"
                className="text-section-title leading-snug font-semibold text-content"
              >
                {exercise.title}
              </h2>
              <p>
                <span className={statusBadge(exerciseStatus)}>
                  {STATUS_LABEL[exerciseStatus]}
                </span>
              </p>
            </div>
            <span
              aria-hidden="true"
              className={`${iconTile} bg-exercise-soft text-exercise`}
            >
              <Icon name={exercise.icon} size={20} />
            </span>
          </div>
          <p className="mt-3 text-body leading-relaxed font-normal text-content">
            {AI_HOME.mainLead}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {AI_HOME.mainNote}
          </p>
          {plan ? (
            <Link
              to={plan.to}
              state={{ from: '/ai' }}
              className={`mt-4 flex min-h-11 items-center justify-center gap-1 rounded-control bg-brand px-4 text-body font-semibold text-surface transition-colors hover:bg-brand-hover motion-reduce:transition-none ${aiFocusRing}`}
            >
              {plan.label}
              <Icon name="chevron-right" size={18} />
            </Link>
          ) : null}
          {guide ? (
            <Link
              to={guide.to}
              state={{ from: '/ai' }}
              className={`mt-1 flex min-h-11 items-center justify-between gap-2 rounded-control text-body font-semibold text-brand ${aiFocusRing}`}
            >
              {guide.label}
              <Icon name="chevron-right" size={18} />
            </Link>
          ) : null}
        </section>

        <section
          aria-labelledby="ai-weekly-title"
          data-ai-feature="weekly"
          data-ai-status={weeklyStatus}
          className={`${card} p-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-32 flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                id="ai-weekly-title"
                className="text-section-title leading-snug font-semibold text-content"
              >
                {weekly.title}
              </h2>
              <p>
                <span className={statusBadge(weeklyStatus)}>
                  {STATUS_LABEL[weeklyStatus]}
                </span>
              </p>
            </div>
            <span
              aria-hidden="true"
              className={`${iconTile} bg-page text-content`}
            >
              <Icon name={weekly.icon} size={20} />
            </span>
          </div>
          <p className="mt-3 text-body leading-relaxed font-normal text-content">
            {AI_HOME.weeklyLead}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {AI_HOME.weeklyNote}
          </p>
          {weeklyLink ? (
            <Link
              to={weeklyLink.to}
              state={{ from: '/ai' }}
              className={`mt-3 flex min-h-11 items-center justify-between gap-2 rounded-control border border-brand bg-surface px-4 text-body font-semibold text-brand transition-colors hover:bg-brand-soft motion-reduce:transition-none ${aiFocusRing}`}
            >
              {weeklyLink.label}
              <Icon name="chevron-right" size={18} />
            </Link>
          ) : null}
        </section>

        <section
          aria-labelledby="ai-meal-title"
          data-ai-feature="meal"
          data-ai-status={mealStatus}
          className={`${card} p-4`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 basis-32 flex-wrap items-center gap-x-2 gap-y-1">
              <h2
                id="ai-meal-title"
                className="text-section-title leading-snug font-semibold text-content"
              >
                {meal.title}
              </h2>
            </div>
            <span
              aria-hidden="true"
              className={`${iconTile} bg-meal-soft text-meal`}
            >
              <Icon name={meal.icon} size={20} />
            </span>
          </div>
          <p className="mt-3 text-body leading-relaxed font-normal text-content">
            {AI_HOME.mealLead}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {AI_HOME.mealNote}
          </p>
          {mealLink ? (
            <Link
              to={mealLink.to}
              state={{ from: '/ai' }}
              className={`mt-2 flex min-h-11 items-center justify-between gap-2 rounded-control border-t border-line pt-1 text-body font-semibold text-brand ${aiFocusRing}`}
            >
              {AI_HOME.mealCta}
              <Icon name="chevron-right" size={18} />
            </Link>
          ) : null}
        </section>
      </div>

      <section aria-labelledby="ai-pending-title">
        <h2
          id="ai-pending-title"
          className="text-section-title leading-snug font-semibold text-content"
        >
          {AI_HOME.pendingTitle}
        </h2>
        <ul role="list" className={`mt-3 ${card}`}>
          <li
            data-ai-feature="photo"
            data-ai-status={photo.status}
            className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3"
          >
            <span
              aria-hidden="true"
              className={`${iconTile} bg-page text-muted`}
            >
              <Icon name="camera" size={20} />
            </span>
            <span className="min-w-0 flex-1 basis-32">
              <span className="block text-body leading-snug font-semibold text-content">
                {photo.title}
              </span>
              <span className="mt-0.5 block text-support leading-snug font-normal text-muted">
                {AI_HOME.photoSummary}
              </span>
            </span>
            {photoLink ? (
              <>
                <p className="basis-full text-support leading-relaxed font-normal text-muted">
                  {AI_HOME.photoNote}
                </p>
                <Link
                  to={photoLink.to}
                  state={{ from: '/ai' }}
                  className={`flex min-h-11 basis-full items-center justify-between gap-2 rounded-control border-t border-line pt-1 text-body font-semibold text-brand ${aiFocusRing}`}
                >
                  {AI_HOME.photoCta}
                  <Icon name="chevron-right" size={18} />
                </Link>
              </>
            ) : null}
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
          <span className="min-w-0">{AI_HOME.guideTitle}</span>
          <Icon
            name="chevron-down"
            size={18}
            className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          />
        </summary>
        <div className="flex flex-col gap-5 border-t border-line px-4 py-4">
          <section aria-labelledby="ai-legend-title">
            <h3
              id="ai-legend-title"
              className="text-body leading-snug font-semibold text-content"
            >
              {AI_HOME.legendTitle}
            </h3>
            <ul role="list" className="mt-2 flex flex-col gap-2">
              {AI_HOME.legend.map((item) => (
                <li
                  key={item.status}
                  className="flex flex-wrap items-start gap-x-2 gap-y-1 text-body leading-relaxed font-normal text-content"
                >
                  <span className={statusBadge(item.status)}>
                    {STATUS_LABEL[item.status]}
                  </span>
                  <span className="min-w-0 flex-1 basis-40">{item.text}</span>
                </li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="ai-flow-title">
            <h3
              id="ai-flow-title"
              className="text-body leading-snug font-semibold text-content"
            >
              {AI_HOME.flowTitle}
            </h3>
            <ol
              role="list"
              className="mt-2 grid grid-cols-[repeat(auto-fit,minmax(min(6rem,100%),1fr))] gap-2"
            >
              {AI_FLOW_STEPS.map((step, index) => (
                <li
                  key={step}
                  className="flex min-w-0 flex-col items-center gap-1.5 rounded-control bg-page px-2 py-3 text-center"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 items-center justify-center rounded-full bg-brand text-support leading-none font-semibold text-surface tabular-nums"
                  >
                    {index + 1}
                  </span>
                  <span className="text-body leading-snug font-semibold text-content">
                    {step}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              {AI_HOME.flowNote}
            </p>
          </section>
          <section aria-labelledby="ai-access-title">
            <h3
              id="ai-access-title"
              className="text-body leading-snug font-semibold text-content"
            >
              {AI_COMMON.accessTitle}
            </h3>
            <ul
              role="list"
              className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-body leading-relaxed font-normal text-muted"
            >
              {AI_COMMON.accessLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
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

      <footer
        aria-labelledby="ai-cta-title"
        data-ai-cta="member"
        className="flex flex-col gap-3"
      >
        <p
          role="note"
          className="text-support leading-relaxed font-normal text-muted"
        >
          {AI_COMMON.disclaimer}
        </p>
        <div>
          <h2
            id="ai-cta-title"
            className="text-body leading-snug font-semibold text-content"
          >
            {AI_HOME.ctaTitle}
          </h2>
          <p className="mt-0.5 text-support leading-relaxed font-normal text-muted">
            {AI_HOME.ctaText}
          </p>
          <div className="mt-1 flex flex-wrap gap-x-5">
            <Link
              to="/records/exercise"
              state={{ from: '/ai' }}
              className={`inline-flex min-h-11 items-center text-body font-semibold text-brand underline underline-offset-2 ${aiFocusRing}`}
            >
              운동 기록으로 가기
            </Link>
            <Link
              to="/records/meal"
              state={{ from: '/ai' }}
              className={`inline-flex min-h-11 items-center text-body font-semibold text-brand underline underline-offset-2 ${aiFocusRing}`}
            >
              식단 기록으로 가기
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
