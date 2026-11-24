import { useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../../auth/authContext.ts'
import { PATH_MY_EXERCISE } from '../../../exercise/myExercise.ts'
import { useExerciseCatalog } from '../../../exercise/useExerciseCatalog.ts'
import type {
  PlanSaveError,
  PlanSavePanel,
} from '../../../exercise/useWorkoutPlanSave.ts'
import { useWorkoutPlanSave } from '../../../exercise/useWorkoutPlanSave.ts'
import { useDayWorkoutDraft } from '../../../exercise/workoutDraftContext.ts'
import {
  buildAllowedRecordTypes,
  normalizeDraft,
  validateDraft,
} from '../../../exercise/workoutDraftModel.ts'
import {
  formatDateLabel,
  summarizeItems,
} from '../../../exercise/workoutListView.ts'
import { createWorkoutPlanRepository } from '../../../exercise/workoutPlanSource.ts'
import type { PlanSaveFailureReason } from '../../../exercise/saveWorkoutPlan.ts'
import {
  composeCard,
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import { PATH_COMPOSE } from './reviewHelpers.ts'
import { ReviewItemCard, ReviewSummary } from './ReviewParts.tsx'

/** 내일 계획 구성(W02, day=tomorrow)의 경로. */
const PATH_PLAN_COMPOSE = `${PATH_COMPOSE}?day=tomorrow`

const primaryDisabled =
  'aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100'

const FAILURE_MESSAGE: Record<PlanSaveFailureReason, string> = {
  quota:
    '저장 공간이 부족해서 저장하지 못했어요. 브라우저의 저장 공간을 확보한 뒤 다시 시도해 주세요.',
  unavailable:
    '이 브라우저에서는 내일 계획을 저장할 수 없어요. 구성한 운동은 이 탭에 남아 있어요.',
  blocked:
    '다른 탭에서 운동 기록을 사용 중이라 저장하지 못했어요. 다른 탭을 닫거나 새로고침한 뒤 다시 시도해 주세요.',
  requestConflict:
    '이 구성과 겹치는 저장 기록이 있어 저장하지 못했어요. 구성을 확인한 뒤 다시 시도해 주세요.',
  invalidDraft:
    '구성이 올바르지 않아 저장하지 못했어요. 구성 수정에서 확인해 주세요.',
  revisionMismatch:
    '다른 곳에서 이 계획이 바뀌었거나 삭제되어 저장하지 않았어요. 나의 운동에서 최신 계획을 확인한 뒤 다시 저장해 주세요.',
  planExists:
    '같은 날짜에 다른 계획이 이미 저장되어 있어요. 다시 저장하면 바꿀지 물어봐요.',
  planDatePassed:
    '계획 날짜가 이미 지나 저장하지 못했어요(자정이 지났을 수 있어요). 다시 저장하면 새 날짜를 확인해요.',
  error:
    '저장하지 못했어요. 구성한 운동은 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
}

function PlanSaveErrorAlert({ error }: { error: PlanSaveError }) {
  let message: string
  let needsEdit = false
  let toMy = false
  if (error.kind === 'invalid') {
    message =
      '구성이 올바르지 않아 저장하지 않았어요. 구성 수정에서 확인해 주세요.'
    needsEdit = true
  } else if (error.stage === 'read') {
    message =
      '내일 계획을 확인하지 못해 저장하지 않았어요. 잠시 후 다시 시도해 주세요.'
  } else {
    message = FAILURE_MESSAGE[error.reason]
    needsEdit =
      error.reason === 'requestConflict' || error.reason === 'invalidDraft'
    toMy = error.reason === 'revisionMismatch'
  }
  return (
    <div
      role="alert"
      className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal break-keep text-danger"
    >
      <p>{message}</p>
      {needsEdit ? (
        <Link
          to={PATH_PLAN_COMPOSE}
          className="mt-1 inline-block font-semibold underline"
        >
          구성 수정
        </Link>
      ) : null}
      {toMy ? (
        <Link
          to={PATH_MY_EXERCISE}
          className="mt-1 inline-block font-semibold underline"
        >
          나의 운동으로
        </Link>
      ) : null}
    </div>
  )
}

/**
 * 저장을 멈추고 확인을 받는 패널(날짜 변경·기존 계획 교체). 열리면 포커스를 패널 안으로 옮겨 보조기기가 읽게 한다.
 * 닫는 쪽(페이지)이 눌렀던 저장 버튼으로 포커스를 돌려준다.
 */
function PlanReviewPanel({
  panel,
  onConfirm,
  onCancel,
}: {
  panel: PlanSavePanel
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [panel.kind])
  const summary =
    panel.kind === 'replace' ? summarizeItems(panel.existing.items) : null
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby="plan-review-panel-title"
      className={`${composeCardActive} outline-none`}
    >
      {panel.kind === 'date' ? (
        <>
          <h2 id="plan-review-panel-title" className={composeSectionTitle}>
            날짜가 바뀌었어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
            화면을 연 뒤 날짜가 바뀌었어요({formatDateLabel(panel.from)} →{' '}
            {formatDateLabel(panel.to)}). 계획 날짜가 지나 이 날짜로는 저장할 수
            없어요. {formatDateLabel(panel.to)} 계획으로 저장할까요?
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className={composePrimaryButton}
            >
              {formatDateLabel(panel.to)}로 저장
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="plan-review-panel-title" className={composeSectionTitle}>
            저장된 내일 계획이 있어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
            {formatDateLabel(panel.existing.planDate)} 계획으로 운동{' '}
            {summary?.exerciseCount}개·{summary?.setCount}세트가 저장돼 있어요.
            새로 저장하면 이 계획이 바뀌어요. 오늘 운동 목록과 운동 기록은
            그대로 남아요.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className={composePrimaryButton}
            >
              바꿔서 저장
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * W11 운동 목록 최종 검토의 내일 계획 모드(`?day=tomorrow`). W02(day=tomorrow)에서 구성한 내일 초안을 저장하기 전에 확인하고 "내일 운동 계획"으로 저장한다.
 * 회원 전용이며 비회원은 라우트의 AuthGate가 안내한다.
 *
 * - 오늘 운동 목록(workoutLists)·운동 기록·통계와 무관하다. 저장하면 계획 전용 저장소(workoutPlans)에만 쓴다. 오늘의 운동을 시작하는 버튼은 두지 않는다
 *   (오늘 운동 저장·시작 흐름과 혼동되지 않게 버튼 문구도 구분한다). 계획은 자동으로 운동을 시작하거나 완료 기록을 만들지 않는다.
 * - 저장 전에는 초안을 그대로 둔다. 저장에 성공해야만(또는 같은 구성이 이미 저장돼 있을 때) 내일 초안을 비우고 W10의 내일 계획 영역으로 이동한다.
 * - 저장 절차(날짜 확인·교체 확인·요청 ID·revision 확인)는 exercise/saveWorkoutPlan.ts와 useWorkoutPlanSave가 맡는다. 이 화면은 상태별 안내만 그린다.
 * - 저장소가 없으면(계정 없음) "준비 중"으로 안내하고 저장하지 않는다. 운동 정보를 읽지 못하면 저장하지 않는다(운영 빌드는 저장소가 있어도 운동 카탈로그가 연결되기 전에는 이 경우다).
 */
export default function PlanReviewBody() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const {
    status: draftStatus,
    draft,
    hasContent,
    clearSaved,
  } = useDayWorkoutDraft('tomorrow')
  const catalog = useExerciseCatalog()
  const saveButtonRef = useRef<HTMLButtonElement>(null)

  const repository = useMemo(
    () => (userId ? createWorkoutPlanRepository(userId) : null),
    [userId],
  )
  // 운동 정보를 읽은 뒤에만 "알 수 없는 운동"을 가려내고 저장할 수 있다.
  const known = useMemo(
    () =>
      catalog.state.status === 'ready'
        ? new Set(catalog.state.exercises.map((exercise) => exercise.id))
        : null,
    [catalog.state],
  )
  const allowed = useMemo(
    () =>
      catalog.state.status === 'ready'
        ? buildAllowedRecordTypes(catalog.state.exercises)
        : undefined,
    [catalog.state],
  )
  const validation = useMemo(
    () => validateDraft(draft, known ?? undefined, allowed),
    [draft, known, allowed],
  )
  const items = useMemo(
    () =>
      validation.ok ? normalizeDraft(draft, known ?? undefined, allowed) : null,
    [draft, known, allowed, validation.ok],
  )

  const onSaved = useCallback(
    (kind: 'saved' | 'replaced' | 'same') =>
      void navigate(PATH_MY_EXERCISE, { state: { planSaved: kind } }),
    [navigate],
  )
  const save = useWorkoutPlanSave({
    repository,
    draft,
    known,
    allowed,
    clearSaved,
    onSaved,
  })
  const saving = save.status === 'saving'

  if (save.status === 'saved') {
    return (
      <p role="status" className={`${composeCard} text-body text-muted`}>
        저장했어요. 나의 운동으로 이동해요…
      </p>
    )
  }

  const header = (
    <header>
      <h1 className="text-app-title leading-snug font-semibold text-content">
        운동 목록 최종 검토
      </h1>
      <p className="mt-2 text-body leading-relaxed font-normal text-muted">
        운동과 세트 목표를 확인하고 내일 운동 계획으로 저장해요. 내일 계획은
        오늘 운동 목록과 운동 기록에 반영되지 않아요.
      </p>
    </header>
  )

  if (draftStatus !== 'ready' || !hasContent) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section className={composeCard} aria-labelledby="plan-empty-title">
          <h2 id="plan-empty-title" className={composeSectionTitle}>
            구성한 내일 운동이 없어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            내일 운동 계획을 먼저 구성해 주세요. 저장하지 않은 구성은 이 탭을
            닫으면 사라져요.
          </p>
          <Link
            to={PATH_PLAN_COMPOSE}
            className={`mt-4 ${composeSecondaryButton}`}
          >
            내일 운동 계획 구성하러 가기
          </Link>
        </section>
      </div>
    )
  }

  if (!validation.ok || !items) {
    const issues = validation.ok ? [] : validation.issues
    const nameOf = (itemId?: string) =>
      draft.items.find((item) => item.itemId === itemId)?.name
    return (
      <div className="flex flex-col gap-6">
        {header}
        <section
          role="alert"
          className={composeCard}
          aria-labelledby="plan-invalid-title"
        >
          <h2 id="plan-invalid-title" className={composeSectionTitle}>
            구성을 확인해 주세요
          </h2>
          <ul className="mt-2 flex flex-col gap-1 text-body leading-relaxed font-normal text-danger">
            {issues.map((issue, index) => (
              <li
                key={`${issue.itemId ?? 'all'}-${issue.setIndex ?? 'x'}-${index}`}
              >
                {nameOf(issue.itemId) ? `${nameOf(issue.itemId)} ` : ''}
                {issue.setIndex !== undefined
                  ? `${issue.setIndex + 1}세트 `
                  : ''}
                · {issue.message}
              </li>
            ))}
          </ul>
          <Link
            to={PATH_PLAN_COMPOSE}
            className={`mt-4 ${composeSecondaryButton}`}
          >
            구성 수정
          </Link>
        </section>
      </div>
    )
  }

  const summary = summarizeItems(items)
  const editing = draft.editingPlanId !== undefined

  // 저장할 수 없는 환경·상태. 이유를 글자로 알리고 저장 버튼은 비활성이다.
  const blocked = !repository
    ? 'noRepository'
    : catalog.state.status === 'loading'
      ? 'catalogLoading'
      : catalog.state.status === 'unavailable'
        ? 'catalogUnavailable'
        : catalog.state.status === 'error'
          ? 'catalogError'
          : null
  const buttonDisabled = saving || blocked !== null
  const retryable =
    save.error?.kind === 'failed' &&
    (save.error.reason === 'error' ||
      save.error.reason === 'blocked' ||
      save.error.reason === 'quota' ||
      save.error.reason === 'planExists' ||
      save.error.reason === 'planDatePassed')

  return (
    <div className="flex flex-col gap-6">
      {header}

      <ReviewSummary summary={summary} date={save.planDate} dayLabel="내일" />

      <section aria-labelledby="plan-review-items-title">
        <h2
          id="plan-review-items-title"
          className={`mb-3 ${composeSectionTitle}`}
        >
          운동별 목표
        </h2>
        <ol role="list" className="flex flex-col gap-3">
          {items.map((item, index) => (
            <ReviewItemCard key={item.exerciseId} item={item} index={index} />
          ))}
        </ol>
      </section>

      {blocked === 'noRepository' ? (
        <p
          role="status"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          내일 운동 계획 저장 기능을 준비 중이에요. 구성한 운동은 이 탭에 그대로
          남아 있어요.
        </p>
      ) : blocked === 'catalogLoading' ? (
        <p role="status" className="text-support font-normal text-muted">
          운동 정보를 확인하는 중이에요…
        </p>
      ) : blocked === 'catalogUnavailable' ? (
        <p
          role="status"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-normal text-warning"
        >
          운동 정보를 불러올 수 없어 저장할 수 없어요. 구성한 운동은 그대로 남아
          있어요.
        </p>
      ) : blocked === 'catalogError' ? (
        <div
          role="alert"
          className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger"
        >
          <p>운동 정보를 불러오지 못해 저장할 수 없어요.</p>
          <button
            type="button"
            onClick={catalog.reload}
            className="mt-1 cursor-pointer font-semibold underline"
          >
            다시 시도
          </button>
        </div>
      ) : null}

      {save.error ? <PlanSaveErrorAlert error={save.error} /> : null}

      <div className="flex flex-col gap-3">
        {save.panel ? (
          <PlanReviewPanel
            panel={save.panel}
            onConfirm={
              save.panel.kind === 'date'
                ? save.confirmDate
                : save.confirmReplace
            }
            onCancel={() => {
              save.cancelPanel()
              window.setTimeout(() => saveButtonRef.current?.focus(), 0)
            }}
          />
        ) : (
          <button
            ref={saveButtonRef}
            type="button"
            aria-disabled={buttonDisabled}
            onClick={() => {
              if (!buttonDisabled) save.save()
            }}
            className={`${composePrimaryButton} ${primaryDisabled}`}
          >
            {saving
              ? '저장 중…'
              : retryable
                ? '저장 다시 시도'
                : editing
                  ? '내일 계획 수정 저장'
                  : '내일 계획으로 저장'}
          </button>
        )}
        <Link to={PATH_PLAN_COMPOSE} className={composeSecondaryButton}>
          구성 수정
        </Link>
        <p className="text-support leading-relaxed font-normal text-muted">
          내일 계획은 운동을 자동으로 시작하거나 완료 처리하지 않아요. 저장한
          계획은 나의 운동의 내일 계획에서 확인하고 고치거나 지울 수 있어요.
        </p>
      </div>
    </div>
  )
}
