import type { RefObject } from 'react'
import {
  PLAN_TEXT,
  restLine,
  setsLine,
  summaryLine,
} from '../../../exercise/recommend/planFlow.ts'
import {
  PLAN_ROLE_LABEL,
  describeItemReason,
  describePlanWarning,
  describeUnsupportedReason,
} from '../../../exercise/recommend/rules.ts'
import type {
  BeginnerPlanResult,
  PlanWarning,
} from '../../../exercise/recommend/types.ts'
import {
  composeCard,
  composeFocusRing,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'

const smallButton = `flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-support font-semibold text-content hover:border-exercise/40 ${composeFocusRing}`

/** 화면에 보이는 경고. 운동별 사유(추천 불가)는 아래 카드에서 따로 보이므로 여기서는 전체 안내만 모은다. */
function visibleWarnings(plan: BeginnerPlanResult): PlanWarning[] {
  return plan.warnings.filter(
    (w) =>
      w.code === 'overTime' ||
      w.code === 'bodyPartSkew' ||
      w.code === 'limitedCandidates',
  )
}

/**
 * 추천 결과 미리보기(표시 전용). 결과를 직접 고치지 않는다 — 교체·빼기·다시 추천·조건 바꾸기는 모두 호출한 쪽이 새 입력으로
 * 새 추천을 만드는 동작이다. 확정할 수 없는 결과(확정 불가·추천 불가 운동·시간 초과)는 확정 버튼이 비활성이고 이유와 방법을 보인다.
 */
export default function PlanResultView({
  plan,
  headingRef,
  confirming,
  error,
  notice,
  onConfirm,
  onRetry,
  onEditConditions,
  onReplace,
  onRemove,
}: {
  plan: BeginnerPlanResult
  headingRef: RefObject<HTMLHeadingElement | null>
  confirming: boolean
  error: string | null
  notice: string | null
  onConfirm: () => void
  /** 전체 자동 추천에서만 있다(다시 추천). */
  onRetry: (() => void) | null
  onEditConditions: () => void
  onReplace: (exerciseId: string) => void
  /** 직접 선택 모드에서만 있다(사용자가 직접 누르는 빼기). */
  onRemove: ((exerciseId: string) => void) | null
}) {
  const automatic = plan.mode === 'automatic'
  const canConfirm = plan.confirmable && !confirming
  const warnings = visibleWarnings(plan)

  return (
    <div className="flex flex-col gap-5">
      <section className={composeCard} aria-labelledby="plan-result-heading">
        <h2
          id="plan-result-heading"
          ref={headingRef}
          tabIndex={-1}
          className={`${composeSectionTitle} outline-none`}
        >
          {plan.confirmable ? '오늘의 운동이 준비됐어요' : '확인이 필요해요'}
        </h2>
        <p className="mt-2 text-body font-semibold text-content">
          {summaryLine(plan)}
        </p>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          {PLAN_TEXT.timeNote} {PLAN_TEXT.estimateNote}
        </p>
        {!automatic ? (
          <p className="mt-1 text-support font-normal text-exercise">
            직접 고른 운동이에요. 순서는 고른 그대로예요.
          </p>
        ) : null}
        {notice ? (
          <p
            role="status"
            className="mt-3 rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-semibold text-exercise"
          >
            {notice}
          </p>
        ) : null}
      </section>

      {warnings.length > 0 || plan.overtime ? (
        <section
          role="status"
          aria-label="알려 드릴 내용"
          className="flex flex-col gap-2 rounded-card border border-warning bg-warning-soft p-4"
        >
          {plan.overtime ? (
            <p className="text-body leading-relaxed font-semibold text-warning">
              <span aria-hidden="true">⚠ </span>
              가장 적은 세트로 해도 약 {plan.overtime.minutesNeeded}분이
              필요해요. 시간을 {plan.overtime.minutesNeeded}분 이상으로 바꾸거나
              운동을 줄여 주세요.
              {plan.overtime.fitsExerciseCount > 0
                ? ` (앞의 ${plan.overtime.fitsExerciseCount}개는 지금 시간에 들어가요.)`
                : ''}
            </p>
          ) : null}
          {warnings
            .filter((w) => w.code !== 'overTime')
            .map((w) => (
              <p
                key={`${w.code}-${w.category ?? ''}`}
                className="text-body leading-relaxed font-normal text-content"
              >
                <span aria-hidden="true">ℹ </span>
                {w.code === 'bodyPartSkew' && w.category
                  ? `${w.category} 운동이 많아요. 다른 부위 운동을 섞어도 좋아요. (안내용이에요)`
                  : describePlanWarning(w.code)}
              </p>
            ))}
        </section>
      ) : null}

      {plan.unsupported.length > 0 ? (
        <section
          aria-labelledby="plan-unsupported-heading"
          className={`${composeCard} border-warning`}
        >
          <h2 id="plan-unsupported-heading" className={composeSectionTitle}>
            자동으로 정할 수 없는 운동이 있어요
          </h2>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            운동을 마음대로 지우거나 바꾸지 않았어요. 아래 운동을 바꾸거나 빼면
            확정할 수 있어요.
          </p>
          <ul className="mt-3 flex flex-col gap-3">
            {plan.unsupported.map((entry) => (
              <li
                key={entry.exerciseId}
                className="rounded-control border border-line px-3 py-3"
              >
                <p className="text-body font-semibold text-content">
                  {entry.name ?? '알 수 없는 운동'}
                </p>
                <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                  {describeUnsupportedReason(entry.reason)}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onReplace(entry.exerciseId)}
                    className={smallButton}
                  >
                    <span aria-hidden="true">다른 운동으로 바꾸기</span>
                    <span className="sr-only">
                      {entry.name ?? '알 수 없는 운동'} 다른 운동으로 바꾸기
                    </span>
                  </button>
                  {onRemove ? (
                    <button
                      type="button"
                      onClick={() => onRemove(entry.exerciseId)}
                      className={smallButton}
                    >
                      <span aria-hidden="true">목록에서 빼기</span>
                      <span className="sr-only">
                        {entry.name ?? '알 수 없는 운동'} 목록에서 빼기
                      </span>
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {plan.items.length > 0 ? (
        <section aria-labelledby="plan-items-heading">
          <h2 id="plan-items-heading" className={`mb-3 ${composeSectionTitle}`}>
            {automatic ? '추천 운동 순서' : '세트와 목표를 정했어요'}
          </h2>
          <ol className="flex flex-col gap-3">
            {plan.items.map((item, index) => {
              const rest = restLine(item)
              return (
                <li key={item.exerciseId} className={composeCard}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-body font-semibold text-content">
                      <span className="font-normal text-muted">
                        {index + 1}.{' '}
                      </span>
                      {item.name}
                    </span>
                    {automatic ? (
                      <span className="inline-flex items-center rounded-full bg-exercise-soft px-2 py-0.5 text-support leading-none font-semibold text-exercise">
                        {PLAN_ROLE_LABEL[item.role]}
                      </span>
                    ) : null}
                    <span className="text-support font-normal text-muted">
                      {item.category}
                    </span>
                  </div>
                  <p className="mt-2 text-body font-semibold text-content">
                    {setsLine(item)}
                  </p>
                  {rest ? (
                    <p className="text-support font-normal text-muted">
                      {rest}
                    </p>
                  ) : null}
                  <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                    {describeItemReason(item.reason)}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onReplace(item.exerciseId)}
                      className={smallButton}
                    >
                      <span aria-hidden="true">다른 운동으로 바꾸기</span>
                      <span className="sr-only">
                        {item.name} 다른 운동으로 바꾸기
                      </span>
                    </button>
                    {onRemove ? (
                      <button
                        type="button"
                        onClick={() => onRemove(item.exerciseId)}
                        className={smallButton}
                      >
                        <span aria-hidden="true">목록에서 빼기</span>
                        <span className="sr-only">
                          {item.name} 목록에서 빼기
                        </span>
                      </button>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ol>
        </section>
      ) : null}

      <section
        aria-label="안전 안내"
        className="rounded-control bg-page px-3 py-3"
      >
        <p className="text-support leading-relaxed font-normal text-muted">
          {PLAN_TEXT.safety}
        </p>
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          {PLAN_TEXT.restNote}
        </p>
      </section>

      {error ? (
        <p
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-semibold text-danger"
        >
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <button
          type="button"
          aria-disabled={!canConfirm}
          aria-describedby={!plan.confirmable ? 'plan-confirm-note' : undefined}
          onClick={() => {
            if (canConfirm) onConfirm()
          }}
          className={`${composePrimaryButton} aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100`}
        >
          {confirming ? '확인하는 중…' : '이 운동으로 목록 확인하기'}
        </button>
        {!plan.confirmable ? (
          <p
            id="plan-confirm-note"
            className="text-support leading-relaxed font-normal text-muted"
          >
            {plan.unsupported.length > 0
              ? '자동으로 정할 수 없는 운동을 바꾸거나 빼면 확정할 수 있어요.'
              : plan.overtime
                ? '시간을 늘리거나 운동을 줄이면 확정할 수 있어요.'
                : '운동을 하나 이상 골라야 확정할 수 있어요.'}
          </p>
        ) : null}
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className={composeSecondaryButton}
          >
            다시 추천받기
          </button>
        ) : null}
        <button
          type="button"
          onClick={onEditConditions}
          className={composeSecondaryButton}
        >
          조건 바꾸기 (목표 · 시간 · 도구)
        </button>
      </div>
    </div>
  )
}
