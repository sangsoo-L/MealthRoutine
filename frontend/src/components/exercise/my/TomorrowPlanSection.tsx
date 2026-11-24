import { Link } from 'react-router'
import type { WorkoutPlansState } from '../../../exercise/useWorkoutPlans.ts'
import {
  RECORD_TYPE_LABEL,
  type RecordType,
} from '../../../exercise/workoutDraftTypes.ts'
import {
  describeSets,
  formatDateLabel,
  summarizeItems,
} from '../../../exercise/workoutListView.ts'
import type { WorkoutPlan } from '../../../exercise/workoutPlanModel.ts'
import type { LocalDate } from '../../../exercise/workoutTypes.ts'
import {
  composeCard,
  composePrimaryButton,
  composeSecondaryButton,
} from '../compose/composeStyles.ts'
import {
  DashboardSection,
  PendingBadge,
  dashboardFocusRing,
  dashboardSectionTitle,
} from '../dashboard/DashboardParts.tsx'

/** 내일 운동 계획 구성(W02, day=tomorrow)의 경로. */
export const PATH_PLAN_COMPOSE = '/records/exercise/compose?day=tomorrow'

const dangerButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-danger px-4 text-body font-semibold text-surface hover:opacity-90 aria-disabled:cursor-wait aria-disabled:opacity-60 ${dashboardFocusRing}`

function PlanItems({ plan }: { plan: WorkoutPlan }) {
  return (
    <ol role="list" className="mt-3 flex flex-col gap-2">
      {plan.items.map((item, index) => (
        <li
          key={`${item.exerciseId}-${index}`}
          data-plan-item
          className="rounded-control bg-page px-3 py-2"
        >
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
              <span className="mr-2 text-support font-normal tabular-nums text-muted">
                {index + 1}
              </span>
              {item.exerciseNameSnapshot}
            </p>
            <span className="shrink-0 text-support font-normal text-muted">
              {RECORD_TYPE_LABEL[item.recordType as RecordType]}
            </span>
          </div>
          <p className="mt-0.5 text-support leading-snug font-normal break-keep text-muted">
            {describeSets(item.recordType, item.sets)}
          </p>
        </li>
      ))}
    </ol>
  )
}

function PlanCard({
  plan,
  arrived,
  editable,
  confirmingDelete,
  deleting,
  deleteError,
  onEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  plan: WorkoutPlan
  /** 계획 날짜가 오늘이 되었다(조회·삭제만 가능). */
  arrived: boolean
  editable: boolean
  confirmingDelete: boolean
  deleting: boolean
  deleteError: string | null
  onEdit: () => void
  onAskDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  const summary = summarizeItems(plan.items)
  return (
    <article
      data-plan-card={plan.planDate}
      aria-label={`${formatDateLabel(plan.planDate)} ${arrived ? '예정일이 된 운동 계획' : '내일 운동 계획'}`}
      className={`${composeCard} ${arrived ? 'border-warning' : ''}`}
    >
      <p className="text-support font-normal text-muted">
        {arrived ? '예정일이 된 계획' : '내일 계획'} ·{' '}
        <time dateTime={plan.planDate}>{formatDateLabel(plan.planDate)}</time>
      </p>
      <p className="mt-1 text-section-title leading-snug font-semibold tabular-nums text-content">
        운동 {summary.exerciseCount}개 · 총 {summary.setCount}세트
      </p>
      {arrived ? (
        <p className="mt-2 rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal break-keep text-warning">
          계획 날짜가 오늘이 되었어요. 이 계획은 자동으로 오늘의 운동이 되거나
          시작되지 않아요. 지금은 조회하거나 삭제할 수 있어요.
        </p>
      ) : null}
      <PlanItems plan={plan} />
      {confirmingDelete ? (
        <div
          role="group"
          aria-label="내일 운동 계획 삭제 확인"
          className="mt-4 rounded-control border border-danger bg-danger-soft p-3"
        >
          <p className="text-body leading-relaxed font-normal text-content">
            이 계획을 삭제할까요? 되돌릴 수 없어요. 오늘 운동 목록과 운동 기록은
            그대로예요.
          </p>
          {deleteError ? (
            <p
              role="alert"
              className="mt-1 text-support leading-relaxed text-danger"
            >
              {deleteError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              aria-disabled={deleting || undefined}
              onClick={() => {
                if (!deleting) onConfirmDelete()
              }}
              className={dangerButton}
            >
              {deleting ? '삭제하는 중…' : '삭제하기'}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {editable ? (
            <button
              type="button"
              onClick={onEdit}
              className={composePrimaryButton}
            >
              계획 수정
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAskDelete}
            className={`${composeSecondaryButton} text-danger`}
          >
            계획 삭제
          </button>
        </div>
      )}
    </article>
  )
}

/**
 * W10 "내일 계획" 영역. 저장된 내일 운동 계획을 운동 순서·기록 방식·세트별 목표와 함께 보여 주고 수정·삭제한다.
 * 오늘의 운동·완료 기록과 별개의 영역이며, 계획 전용 저장소(workoutPlans)만 읽는다. 어떤 운동 기록·통계에도 반영되지 않는다.
 *
 * - 계획이 없으면 빈 상태와 "내일 운동 계획 만들기"(W02, day=tomorrow)를 보인다.
 * - 계획 날짜가 오늘이 된 계획은 자동으로 오늘의 운동이 되지 않으며 조회·삭제만 할 수 있다(수정 버튼 없음).
 * - 삭제는 확인 패널을 거친다. 수정은 계획을 내일 초안으로 옮긴 뒤 W02로 이동한다(구성 중이던 내일 초안이 있으면 먼저 확인한다).
 * - 저장소가 없으면(계정 없음) "준비 중"이다.
 */
export default function TomorrowPlanSection({
  state,
  today,
  notice,
  editConfirmPlanId,
  deleteTargetId,
  deleting,
  deleteError,
  onRetry,
  onEdit,
  onConfirmEdit,
  onCancelEdit,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  state: WorkoutPlansState
  today: LocalDate
  notice: string | null
  /** 구성 중이던 내일 초안을 버리고 수정을 시작할지 묻는 계획의 id. */
  editConfirmPlanId: string | null
  deleteTargetId: string | null
  deleting: boolean
  deleteError: string | null
  onRetry: () => void
  onEdit: (plan: WorkoutPlan) => void
  onConfirmEdit: (plan: WorkoutPlan) => void
  onCancelEdit: () => void
  onAskDelete: (plan: WorkoutPlan) => void
  onConfirmDelete: (plan: WorkoutPlan) => void
  onCancelDelete: () => void
}) {
  const plans = state.status === 'ready' ? state.plans : []
  const hasTomorrow = plans.some((plan) => plan.planDate > today)
  return (
    <DashboardSection labelId="my-tomorrow-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="my-tomorrow-title" className={dashboardSectionTitle}>
          내일 계획
        </h2>
        {state.status === 'unavailable' ? <PendingBadge /> : null}
      </div>
      <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
        내일 할 운동을 미리 구성해 두는 계획이에요. 오늘의 운동과 완료 기록에는
        반영되지 않아요.
      </p>
      <div aria-live="polite" className="mt-2 empty:hidden">
        {notice ? (
          <p
            role="status"
            className="rounded-control bg-exercise-soft px-3 py-2 text-support leading-relaxed font-semibold text-exercise"
          >
            {notice}
          </p>
        ) : null}
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {state.status === 'loading' ? (
          <p role="status" className={`${composeCard} text-body text-muted`}>
            내일 계획을 불러오는 중이에요…
          </p>
        ) : state.status === 'unavailable' ? (
          <p className={`${composeCard} text-body text-muted`}>
            내일 계획 저장 기능을 준비 중이에요.
          </p>
        ) : state.status === 'error' ? (
          <div role="alert" className={composeCard}>
            <p className="text-body leading-snug font-semibold text-content">
              내일 계획을 불러오지 못했어요
            </p>
            <button
              type="button"
              onClick={onRetry}
              className={`mt-3 w-full ${composeSecondaryButton}`}
            >
              다시 시도
            </button>
          </div>
        ) : (
          <>
            {plans.map((plan) => {
              const arrived = plan.planDate <= today
              return (
                <div key={plan.id} className="flex flex-col gap-2">
                  <PlanCard
                    plan={plan}
                    arrived={arrived}
                    editable={!arrived}
                    confirmingDelete={deleteTargetId === plan.id}
                    deleting={deleting}
                    deleteError={
                      deleteTargetId === plan.id ? deleteError : null
                    }
                    onEdit={() => onEdit(plan)}
                    onAskDelete={() => onAskDelete(plan)}
                    onConfirmDelete={() => onConfirmDelete(plan)}
                    onCancelDelete={onCancelDelete}
                  />
                  {editConfirmPlanId === plan.id ? (
                    <div
                      role="group"
                      aria-label="내일 계획 수정 확인"
                      className="rounded-control border border-warning bg-warning-soft p-3"
                    >
                      <p className="text-body leading-relaxed font-normal text-content">
                        구성 중이던 내일 운동이 있어요. 계획 수정을 시작하면 그
                        구성은 사라져요. 계속할까요?
                      </p>
                      <div className="mt-3 flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => onConfirmEdit(plan)}
                          className={composePrimaryButton}
                        >
                          계획 수정 시작
                        </button>
                        <button
                          type="button"
                          onClick={onCancelEdit}
                          className={composeSecondaryButton}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
            {!hasTomorrow ? (
              <div data-plan-empty className={composeCard}>
                <p className="text-body leading-snug font-semibold text-content">
                  아직 내일 계획이 없어요
                </p>
                <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
                  내일 할 운동을 골라 세트별 목표와 함께 저장해 두세요.
                </p>
                <Link
                  to={PATH_PLAN_COMPOSE}
                  state={{ from: '/records/exercise/my' }}
                  className={`mt-3 ${composePrimaryButton}`}
                >
                  내일 운동 계획 만들기
                </Link>
              </div>
            ) : null}
            {state.status === 'ready' && state.skippedCount > 0 ? (
              <p className="text-support leading-relaxed font-normal text-muted">
                읽을 수 없는 계획 {state.skippedCount}개를 제외했어요.
              </p>
            ) : null}
          </>
        )}
      </div>
    </DashboardSection>
  )
}
