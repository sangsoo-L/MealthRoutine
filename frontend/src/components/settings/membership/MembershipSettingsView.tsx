import type { ReactNode } from 'react'
import { Link } from 'react-router'
import {
  BREAKDOWN_EMPTY_TEXT,
  EXHAUSTED_GUIDE_TEXT,
  MEMBERSHIP_COMPARE_NOTE,
  MEMBERSHIP_FAQ,
  MEMBERSHIP_PLANS,
  MEMBERSHIP_PLAN_LABEL,
  MEMBERSHIP_UNAVAILABLE_TEXT,
  PATH_MEMBERSHIP,
  PAYMENT_TEXT,
  USAGE_RULES,
  exhaustedNoticeText,
  isUsageExhausted,
  membershipDateLabel,
  usageCountLabel,
  usageProgress,
  type MembershipInfo,
  type MembershipState,
} from '../../../membership/membership.ts'
import { AI_COMMON, AI_FEATURES } from '../../ai/aiIntroContent.ts'
import { AI_TONE } from '../../ai/aiStyles.ts'
import {
  errorClass,
  noticeClass,
  secondaryButtonClass,
} from '../../auth/authStyles.ts'
import Icon from '../../icons/Icon.tsx'
import {
  cardClass,
  chipClass,
  focusRing,
  sectionTitleClass,
} from '../../mypage/myStyles.ts'

const help = 'text-support leading-relaxed font-normal text-muted'
const disabledButton =
  'flex min-h-12 w-full cursor-not-allowed items-center justify-center rounded-control border border-dashed border-muted/60 bg-page px-4 text-body font-semibold text-muted'

const unavailableChip = (
  <span className={`${chipClass} bg-surface`}>연결 전</span>
)

/** 서버가 확인해 준 멤버십 정보. 확인하지 못한 상태(조회 중·연결 전·실패)에서는 null이다. */
function readyInfo(state: MembershipState): MembershipInfo | null {
  return state.status === 'ready' ? state.info : null
}

/** 현재 멤버십 한 줄의 값. 서버에서 확인한 값만 쓰고, 확인하지 못한 상태는 그 사실을 쓴다. */
function planText(state: MembershipState): ReactNode {
  switch (state.status) {
    case 'loading':
      return '확인 중…'
    case 'unavailable':
      return unavailableChip
    case 'error':
      return '불러오지 못했어요'
    case 'ready':
      return `${MEMBERSHIP_PLAN_LABEL[state.info.plan]} 멤버십`
  }
}

/** 멤버십 변경 버튼 이름(모두 비활성). 서버에서 확인한 멤버십이 있을 때만 상태에 맞는 이름을 쓴다. */
function actionLabel(info: MembershipInfo | null): string {
  if (info === null) return '멤버십 관리하기'
  return info.plan === 'free' ? '멤버십 시작하기' : '멤버십 변경하기'
}

/** 한 줄(이름과 값) */
function Row({
  row,
  name,
  children,
}: {
  row: string
  name: string
  children: ReactNode
}) {
  return (
    <div
      data-membership-row={row}
      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
    >
      <dt className="text-support leading-snug font-normal text-muted">
        {name}
      </dt>
      <dd className="min-w-0 text-body leading-snug font-semibold text-content">
        {children}
      </dd>
    </div>
  )
}

/** 통합 AI 잔여 횟수와 사용량 진행 표시. 값은 모두 서버가 준 것이고 이 컴포넌트는 차감하지 않는다. */
function UsageMeter({ state }: { state: MembershipState }) {
  const info = readyInfo(state)
  if (state.status === 'loading')
    return (
      <p data-membership-usage="loading" className={help}>
        사용량을 확인하고 있어요…
      </p>
    )
  if (state.status === 'unavailable')
    return (
      <p
        data-membership-usage="unavailable"
        className="flex items-center gap-2"
      >
        <span className="text-body leading-snug font-semibold text-content">
          잔여 횟수
        </span>
        {unavailableChip}
      </p>
    )
  if (info === null) return null
  const usage = info.usage
  if (usage == null)
    return (
      <p
        data-membership-usage="unknown"
        className="text-body font-semibold text-content"
      >
        잔여 횟수 {usageCountLabel(null)}
      </p>
    )
  const { used, percent } = usageProgress(usage)
  return (
    <div data-membership-usage="ready">
      <p className="flex flex-wrap items-baseline gap-x-2">
        <span
          data-membership-remaining={usage.remaining}
          className="text-metric leading-none font-semibold tabular-nums text-content"
        >
          {usage.remaining}
          <span className="ml-1 text-body font-normal">회 남음</span>
        </span>
        <span className="text-support leading-snug font-normal text-muted">
          총 {usage.limit}회 중 {used}회 사용
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="통합 AI 사용량"
        aria-valuemin={0}
        aria-valuemax={usage.limit}
        aria-valuenow={used}
        aria-valuetext={`${usage.limit}회 중 ${used}회 사용`}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/**
 * P03 멤버십과 결제 관리(통합 AI 멤버십).
 * 구성: 현재 멤버십 · 통합 AI 사용량(잔여·진행·갱신일·소진 안내) · 운동·식단별 사용 내역 · 무료·베이직·프로 비교 · AI 기능 링크 ·
 * 결제·멤버십 변경 준비 중 · 무료 체험 FAQ.
 *
 * - 운동·식단별 멤버십 상품 구분은 없다. 운동 AI와 식단 AI는 공통 사용량을 공유하고, 일반 기록·조회는 횟수를 쓰지 않는다.
 * - 멤버십 종류·잔여 횟수·다음 갱신일·사용 내역은 서버가 준 값만 보인다. 연결 전·조회 중·조회 실패는 각각 그 사실을 알리며,
 *   서버에서 확인하지 않은 멤버십을 "무료"나 "베이직·프로"로 표시하지 않는다. 프론트엔드는 사용량을 차감하거나 갱신하지 않는다.
 * - 베이직·프로의 횟수는 권장안이며 최종 승인 전이라고 표시한다. 가격·결제 정책은 미확정이라 "정해지지 않았어요"라고만 알리고,
 *   결제 내역은 예시로 만들어 보이지 않는다.
 * - 멤버십 시작·변경 버튼은 결제 API가 없어 모두 비활성이며(성공한 것처럼 보이는 동작이 없다) 준비 중이라고 안내한다.
 * - AI 기능 목록·링크는 AI 서비스 화면(I01)과 같은 기존 정의(AI_FEATURES)를 재사용한다(이용 조건 문구는 쓰지 않는다).
 */
export default function MembershipSettingsView({
  state,
  onRetry,
}: {
  state: MembershipState
  onRetry: () => void
}) {
  const info = readyInfo(state)
  const exhausted = info !== null && isUsageExhausted(info)
  const breakdown = info?.breakdown ?? null
  const paid = info !== null && info.plan !== 'free'

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-balance text-content">
          멤버십과 결제 관리
        </h1>
        <p className="mt-1 text-body leading-relaxed font-normal text-pretty text-muted">
          내 멤버십과 AI 사용 횟수를 확인하고 무료·베이직·프로의 차이를
          살펴봐요.
        </p>
      </header>

      {state.status === 'unavailable' ? (
        <p
          role="status"
          data-membership-state="unavailable"
          className={`${noticeClass} mt-0`}
        >
          {MEMBERSHIP_UNAVAILABLE_TEXT}
        </p>
      ) : null}
      {state.status === 'error' ? (
        <div className="flex flex-col gap-2">
          <p
            role="alert"
            data-membership-state="error"
            className={`${errorClass} mt-0`}
          >
            멤버십 정보를 불러오지 못했어요. 무료 멤버십이라는 뜻은 아니에요.
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            data-membership-retry=""
            onClick={onRetry}
            className={secondaryButtonClass}
          >
            다시 시도
          </button>
        </div>
      ) : null}

      <section
        aria-labelledby="membership-status-title"
        data-membership-hero=""
        className="rounded-card bg-brand-soft p-4"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 shrink-0 items-center justify-center rounded-control bg-surface text-brand"
          >
            <Icon name="crown" />
          </span>
          <h2 id="membership-status-title" className={sectionTitleClass}>
            현재 멤버십
          </h2>
        </div>
        <dl className="mt-3 flex flex-col gap-2">
          <div
            data-membership-row="subscription"
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
          >
            <dt className="text-support leading-snug font-normal text-muted">
              멤버십
            </dt>
            <dd
              data-membership-subscription={state.status}
              className="min-w-0 text-body leading-snug font-semibold text-content"
            >
              {planText(state)}
            </dd>
          </div>
        </dl>
        <p className={`mt-3 ${help}`}>
          멤버십 종류는 서버에서 확인한 경우에만 보여요. 운동 AI와 식단 AI는
          하나의 멤버십으로 함께 이용해요.
        </p>
      </section>

      <section
        aria-labelledby="membership-usage-title"
        data-membership-usage-section=""
        className={cardClass}
      >
        <h2 id="membership-usage-title" className={sectionTitleClass}>
          통합 AI 사용량
        </h2>
        <div className="mt-3">
          <UsageMeter state={state} />
        </div>
        {info !== null ? (
          <dl className="mt-3 flex flex-col gap-2">
            {paid ? (
              <Row row="reset" name="다음 사용량 갱신일">
                {membershipDateLabel(info.nextResetAt)}
              </Row>
            ) : (
              <Row row="reset" name="사용량 갱신">
                월간 초기화 없음
              </Row>
            )}
          </dl>
        ) : null}
        {exhausted && info !== null ? (
          <p
            role="status"
            data-membership-exhausted=""
            className={`${noticeClass} mt-3`}
          >
            {exhaustedNoticeText(info)}
          </p>
        ) : null}
        <ul className="mt-3 flex flex-col gap-1">
          {USAGE_RULES.map((rule) => (
            <li key={rule} className={help}>
              {rule}
            </li>
          ))}
        </ul>
        <p data-membership-exhausted-guide="" className={`mt-1 ${help}`}>
          {EXHAUSTED_GUIDE_TEXT}
        </p>
      </section>

      <section
        aria-labelledby="membership-breakdown-title"
        className={cardClass}
      >
        <h2 id="membership-breakdown-title" className={sectionTitleClass}>
          운동·식단별 사용 내역
        </h2>
        {breakdown !== null ? (
          <dl
            data-membership-breakdown="ready"
            className="mt-3 flex flex-col gap-2"
          >
            <Row row="breakdown-exercise" name="운동 AI">
              {usageCountLabel(breakdown.exercise)}
            </Row>
            <Row row="breakdown-meal" name="식단 AI">
              {usageCountLabel(breakdown.meal)}
            </Row>
          </dl>
        ) : (
          <p data-membership-breakdown="empty" className={`mt-2 ${help}`}>
            {BREAKDOWN_EMPTY_TEXT}
          </p>
        )}
      </section>

      <section aria-labelledby="membership-compare-title" className={cardClass}>
        <h2 id="membership-compare-title" className={sectionTitleClass}>
          무료·베이직·프로 비교
        </h2>
        <ul className="mt-3 divide-y divide-line" data-membership-compare="">
          {MEMBERSHIP_PLANS.map((row) => (
            <li
              key={row.plan}
              data-membership-plan={row.plan}
              className="py-3 first:pt-0 last:pb-0"
            >
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <h3 className="min-w-0 text-body leading-snug font-semibold text-content">
                  {row.name}
                </h3>
                <span className="flex flex-wrap items-center gap-1">
                  {info?.plan === row.plan ? (
                    <span className={`${chipClass} bg-brand-soft`}>
                      현재 멤버십
                    </span>
                  ) : null}
                  {row.confirmed ? null : (
                    <span className={`${chipClass} bg-page`}>
                      권장안 · 최종 승인 전
                    </span>
                  )}
                </span>
              </div>
              <p className="mt-1 text-body leading-snug font-semibold text-content">
                AI {row.count}
              </p>
              <p className={`mt-0.5 ${help}`}>{row.renewal}</p>
            </li>
          ))}
        </ul>
        <p className={`mt-3 ${help}`}>{MEMBERSHIP_COMPARE_NOTE}</p>
      </section>

      <section
        aria-labelledby="membership-features-title"
        className={cardClass}
      >
        <h2 id="membership-features-title" className={sectionTitleClass}>
          {AI_COMMON.featuresTitle}
        </h2>
        <ul className="mt-3 divide-y divide-line" data-membership-features="">
          {AI_FEATURES.map((feature) => (
            <li
              key={feature.key}
              data-membership-feature={feature.key}
              className="py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className={`flex size-9 shrink-0 items-center justify-center rounded-control ${AI_TONE[feature.tone]}`}
                >
                  <Icon name={feature.icon} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="min-w-0 text-body leading-snug font-semibold text-content">
                    {feature.title}
                  </h3>
                  <p className={`mt-1 ${help}`}>{feature.summary}</p>
                  {feature.links?.map((link) => (
                    <Link
                      key={link.to}
                      to={link.to}
                      state={{ from: PATH_MEMBERSHIP }}
                      className={`flex min-h-11 items-center justify-between gap-2 text-body leading-snug font-semibold text-brand hover:text-brand-hover ${focusRing}`}
                    >
                      <span className="min-w-0">{link.label}</span>
                      <Icon
                        name="chevron-right"
                        size={18}
                        className="shrink-0"
                      />
                    </Link>
                  ))}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="membership-payment-title" className={cardClass}>
        <h2 id="membership-payment-title" className={sectionTitleClass}>
          결제 관리
        </h2>
        <p
          data-membership-preparing=""
          role="status"
          className={`${noticeClass} mt-3`}
        >
          {PAYMENT_TEXT.preparing}
        </p>
        <dl className="mt-3 divide-y divide-line">
          <div className="py-3 first:pt-0">
            <dt className="text-support leading-snug font-normal text-muted">
              요금·결제 방식
            </dt>
            <dd
              data-membership-pricing=""
              className="mt-0.5 text-body leading-relaxed font-normal text-content"
            >
              {PAYMENT_TEXT.pricing}
            </dd>
          </div>
          <div className="py-3 last:pb-0">
            <dt className="text-support leading-snug font-normal text-muted">
              {PAYMENT_TEXT.historyTitle}
            </dt>
            <dd
              data-membership-history=""
              className="mt-0.5 text-body leading-relaxed font-normal text-content"
            >
              {PAYMENT_TEXT.history}
            </dd>
          </div>
        </dl>
        <ul className="mt-3 flex flex-col gap-1">
          {PAYMENT_TEXT.terms.map((term) => (
            <li key={term} className={help}>
              {term}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2" data-membership-actions="">
          <button
            type="button"
            disabled
            aria-describedby="membership-actions-note"
            className={disabledButton}
          >
            {actionLabel(info)}
          </button>
          <p id="membership-actions-note" className={help}>
            {PAYMENT_TEXT.actionsOff}
          </p>
        </div>
      </section>

      <section aria-labelledby="membership-faq-title" className={cardClass}>
        <h2 id="membership-faq-title" className={sectionTitleClass}>
          무료 체험 FAQ
        </h2>
        <div className="mt-3 flex flex-col divide-y divide-line">
          {MEMBERSHIP_FAQ.map((item) => (
            <details key={item.q} data-membership-faq="" className="py-1">
              <summary
                className={`flex min-h-11 cursor-pointer items-center text-body leading-snug font-semibold text-content ${focusRing} rounded-control`}
              >
                {item.q}
              </summary>
              <p className={`pb-2 ${help}`}>{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  )
}
