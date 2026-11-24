import { useCallback, useMemo, useRef } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import { PendingButton } from '../components/exercise/dashboard/DashboardParts.tsx'
import {
  composeCard,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../components/exercise/compose/composeStyles.ts'
import PlanReviewBody from '../components/exercise/review/PlanReviewBody.tsx'
import {
  ReviewItemCard,
  ReviewPanel,
  ReviewSummary,
  SaveErrorAlert,
} from '../components/exercise/review/ReviewParts.tsx'
import {
  PATH_COMPOSE,
  PATH_DASHBOARD,
  PATH_METHOD,
  isRetryable,
} from '../components/exercise/review/reviewHelpers.ts'
import { PATH_PLAN } from '../exercise/recommend/planFlow.ts'
import { useExerciseCatalog } from '../exercise/useExerciseCatalog.ts'
import { useLocalToday } from '../exercise/useLocalToday.ts'
import { useWorkoutListSave } from '../exercise/useWorkoutListSave.ts'
import {
  buildAllowedRecordTypes,
  normalizeDraft,
  validateDraft,
} from '../exercise/workoutDraftModel.ts'
import { useWorkoutDraft } from '../exercise/workoutDraftContext.ts'
import { summarizeItems } from '../exercise/workoutListView.ts'
import { createWorkoutListRepository } from '../exercise/workoutSource.ts'

const primaryDisabled =
  'aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100'

/**
 * W11 운동 목록 최종 검토. W02에서 구성한 초안을 저장하기 전에 확인하고 "오늘의 운동"으로 저장한다. 회원 전용이며 비회원은 라우트의 AuthGate가 안내한다.
 *
 * - 저장 전에는 초안을 그대로 둔다. 저장에 성공해야만(또는 같은 구성이 이미 오늘의 목록일 때) 초안을 비우고 W01로 이동한다.
 * - 저장 절차(날짜 확인·교체 확인·요청 ID·재시도)는 exercise/saveWorkoutList.ts와 useWorkoutListSave가 맡는다. 이 화면은 상태별 안내만 그린다.
 * - 저장소가 없으면(계정 없음) "준비 중"으로 안내하고 저장하지 않는다. 운동 정보를 읽지 못하면 저장하지 않는다(운영 빌드는 저장소가 있어도 운동 카탈로그가 연결되기 전에는 이 경우다)(알 수 없는 운동을 가려낼 수 없다).
 * - "오늘 운동 시작"은 운동 진행(W14)이 만들어질 때까지 준비 중 버튼이다. 내일 계획·AI 추천은 이 화면의 범위가 아니다.
 */
function ReviewBody() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? null
  // 초급 운동 추천에서 넘어온 초안이면(진입 state.from) "구성 수정"이 복잡한 직접 설정(W02) 대신 추천 화면으로 돌아간다. 저장 절차는 그대로다.
  const location = useLocation()
  const fromPlan =
    (location.state as { from?: unknown } | null)?.from === PATH_PLAN
  const editPath = fromPlan ? PATH_PLAN : PATH_COMPOSE
  const editLabel = fromPlan ? '추천 화면으로 돌아가기' : '구성 수정'
  const {
    status: draftStatus,
    draft,
    hasContent,
    clearSaved,
  } = useWorkoutDraft()
  const catalog = useExerciseCatalog()
  const today = useLocalToday()
  const saveButtonRef = useRef<HTMLButtonElement>(null)

  const repository = useMemo(
    () => (userId ? createWorkoutListRepository(userId) : null),
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
  // 운동별 허용 기록 방식. W02에서 선택지를 제한했어도 저장 전에 여기서 다시 확인한다(운동 정보를 읽은 뒤에만).
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
    (kind: 'saved' | 'same') =>
      void navigate(PATH_DASHBOARD, { state: { workoutSaved: kind } }),
    [navigate],
  )
  const save = useWorkoutListSave({
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
        저장했어요. 운동 기록으로 이동해요…
      </p>
    )
  }

  if (draftStatus !== 'ready' || !hasContent) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-app-title leading-snug font-semibold text-content">
            운동 목록 최종 검토
          </h1>
        </header>
        <section className={composeCard} aria-labelledby="review-empty-title">
          <h2 id="review-empty-title" className={composeSectionTitle}>
            구성한 운동이 없어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal text-muted">
            운동 목록을 먼저 구성해 주세요. 저장하지 않은 구성은 이 탭을 닫으면
            사라져요.
          </p>
          <Link to={PATH_METHOD} className={`mt-4 ${composeSecondaryButton}`}>
            운동 목록 구성하러 가기
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
        <header>
          <h1 className="text-app-title leading-snug font-semibold text-content">
            운동 목록 최종 검토
          </h1>
        </header>
        <section
          role="alert"
          className={composeCard}
          aria-labelledby="review-invalid-title"
        >
          <h2 id="review-invalid-title" className={composeSectionTitle}>
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
          <Link to={editPath} className={`mt-4 ${composeSecondaryButton}`}>
            {editLabel}
          </Link>
        </section>
      </div>
    )
  }

  const summary = summarizeItems(items)
  const dateChanged = today !== save.acknowledgedDate

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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          운동 목록 최종 검토
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          운동과 세트 목표를 확인하고 오늘의 운동으로 저장해요.
        </p>
      </header>

      {dateChanged && !save.panel ? (
        <p
          role="status"
          className="rounded-control bg-warning-soft px-3 py-2 text-support leading-relaxed font-semibold text-warning"
        >
          날짜가 바뀌었어요. 지금 저장하면 오늘 날짜의 운동 목록이 돼요. 저장할
          때 한 번 더 확인해요.
        </p>
      ) : null}

      <ReviewSummary summary={summary} date={today} />

      <section aria-labelledby="review-items-title">
        <h2 id="review-items-title" className={`mb-3 ${composeSectionTitle}`}>
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
          운동 목록 저장 기능을 준비 중이에요. 구성한 운동은 이 탭에 그대로 남아
          있어요.
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

      {save.error ? <SaveErrorAlert error={save.error} today={today} /> : null}

      <div className="flex flex-col gap-3">
        {save.panel ? (
          <ReviewPanel
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
              : isRetryable(save.error)
                ? '저장 다시 시도'
                : '오늘의 운동으로 저장'}
          </button>
        )}
        <Link to={editPath} className={composeSecondaryButton}>
          {editLabel}
        </Link>
        <div>
          <PendingButton describedBy="review-start-note">
            오늘 운동 시작
          </PendingButton>
          <p
            id="review-start-note"
            className="mt-2 text-support leading-relaxed font-normal text-muted"
          >
            운동 진행 기능을 준비 중이에요. 저장한 목록은 운동 기록에서 볼 수
            있어요.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ExerciseReviewPage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  // 사용자가 바뀌면 저장 상태·확인 패널도 새로 시작한다(초안 자체의 격리는 WorkoutDraftProvider가 한다).
  // `?day=tomorrow`는 내일 운동 계획 검토다(내일 초안·계획 전용 저장소). day가 없으면 기존 오늘의 운동 목록 검토 그대로다.
  if (params.get('day') === 'tomorrow') {
    return <PlanReviewBody key={user?.id ?? ''} />
  }
  return <ReviewBody key={user?.id ?? ''} />
}
