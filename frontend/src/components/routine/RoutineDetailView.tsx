import { Link } from 'react-router'
import {
  routineCreatedLabel,
  routineSummaryText,
} from '../../exercise/routineView.ts'
import type { RoutineState } from '../../exercise/useRoutines.ts'
import {
  PATH_ROUTINES,
  routineDetailPath,
  routineEditPath,
} from '../../exercise/routinePaths.ts'
import type { WorkoutRoutine } from '../../exercise/workoutRoutineModel.ts'
import {
  composeCard,
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../exercise/compose/composeStyles.ts'
import { RoutineExerciseSteps } from './RoutineParts.tsx'

/** 루틴 상태가 ready가 아닐 때의 안내(불러오는 중·준비 중·불러오지 못함·없는 루틴). 상세·수정 화면이 함께 쓴다. */
export function RoutineStateNotice({
  state,
  onRetry,
}: {
  state: Exclude<RoutineState, { status: 'ready' }>
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <h1 className="text-app-title leading-snug font-semibold text-content">
        운동 루틴
      </h1>
      {state.status === 'loading' ? (
        <p role="status" className={`${composeCard} text-body text-muted`}>
          루틴을 불러오는 중이에요…
        </p>
      ) : state.status === 'unavailable' ? (
        <div className={composeCard}>
          <p className="text-body leading-snug font-semibold text-content">
            루틴 기능을 준비 중이에요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            이 환경에서는 저장한 루틴을 볼 수 없어요.
          </p>
        </div>
      ) : state.status === 'error' ? (
        <div role="alert" className={composeCard}>
          <p className="text-body leading-snug font-semibold text-content">
            루틴을 불러오지 못했어요
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
        <div role="status" className={composeCard}>
          <p className="text-body leading-snug font-semibold text-content">
            루틴을 찾을 수 없어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            삭제되었거나 주소가 올바르지 않을 수 있어요.
          </p>
        </div>
      )}
      {state.status !== 'loading' ? (
        <Link to={PATH_ROUTINES} className={composeSecondaryButton}>
          내 운동 루틴으로
        </Link>
      ) : null}
    </div>
  )
}

export type RoutineStartPanel = 'none' | 'replace'
export type RoutineDeletePanel = 'none' | 'confirm'

/**
 * W07 운동 루틴 상세 본문. 루틴 이름·소개, 운동 수·세트·부위 요약, 운동 순서와 세트별 목표, 운동 방법 확인(E02)을 보인다.
 * - 운동 준비: 이 루틴을 오늘의 운동 구성(W02 초안)으로 복사해 W02로 간다. 루틴은 바뀌지 않는다. 구성 중인 초안이 있으면 먼저 교체할지 묻는다.
 * - 수정(W08)·삭제는 따로 둔다. 삭제는 확인 패널을 거치고 되돌릴 수 없다(운동 목록·완료 기록에는 영향이 없다).
 * - 커뮤니티 공유는 준비 중이라 눌리지 않는 비활성 버튼만 보인다(연결 없음).
 * - 부위 요약은 운동 목록(카탈로그)에서 찾은 값만 쓴다(bodyParts가 null이면 부위 줄을 그리지 않는다).
 */
export default function RoutineDetailView({
  routine,
  bodyParts,
  startPanel,
  startError,
  onStart,
  onConfirmReplace,
  onCancelReplace,
  deletePanel,
  deleting,
  deleteError,
  onOpenDelete,
  onConfirmDelete,
  onCancelDelete,
}: {
  routine: WorkoutRoutine
  bodyParts: readonly string[] | null
  startPanel: RoutineStartPanel
  startError: string | null
  onStart: () => void
  onConfirmReplace: () => void
  onCancelReplace: () => void
  deletePanel: RoutineDeletePanel
  deleting: boolean
  deleteError: string | null
  onOpenDelete: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <div className="flex items-start justify-between gap-3">
          <h1 className="min-w-0 text-app-title leading-snug font-semibold text-content">
            {routine.name}
          </h1>
          <Link
            to={routineEditPath(routine.id)}
            state={{ from: routineDetailPath(routine.id) }}
            className="-mt-1 flex min-h-11 shrink-0 items-center rounded-control px-2 text-body font-semibold text-exercise hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise"
          >
            수정하기
          </Link>
        </div>
        {routine.description !== '' ? (
          <p className="mt-1 text-body leading-relaxed font-normal whitespace-pre-line text-muted">
            {routine.description}
          </p>
        ) : null}
        <p className="mt-2 text-support leading-snug font-normal tabular-nums text-muted">
          {routineSummaryText(routine.items)} ·{' '}
          {routineCreatedLabel(routine.createdAt)}
        </p>
        {bodyParts !== null && bodyParts.length > 0 ? (
          <p className="mt-0.5 text-support leading-snug font-normal text-muted">
            부위 {bodyParts.join('·')}
          </p>
        ) : null}
      </header>

      <section aria-labelledby="routine-order-title">
        <h2 id="routine-order-title" className={`mb-3 ${composeSectionTitle}`}>
          운동 순서와 세트별 목표
        </h2>
        <RoutineExerciseSteps
          items={routine.items}
          detailFrom={routineDetailPath(routine.id)}
        />
      </section>

      <section aria-label="루틴 동작" className="flex flex-col gap-3">
        <button
          type="button"
          onClick={onStart}
          className={composePrimaryButton}
        >
          이 루틴으로 운동 준비
        </button>
        {startError ? (
          <p role="alert" className="text-support leading-relaxed text-danger">
            {startError}
          </p>
        ) : null}
        {startPanel === 'replace' ? (
          <div
            role="group"
            aria-labelledby="routine-replace-title"
            className={composeCardActive}
          >
            <h3 id="routine-replace-title" className={composeSectionTitle}>
              구성 중인 운동을 바꿀까요?
            </h3>
            <p className="mt-2 text-body leading-relaxed font-normal text-muted">
              지금 오늘의 운동으로 구성하던 내용이 있어요. 이 루틴으로 바꾸면
              구성하던 내용은 사라져요. 루틴은 그대로 남아요.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                onClick={onConfirmReplace}
                className={composePrimaryButton}
              >
                이 루틴으로 바꾸기
              </button>
              <button
                type="button"
                onClick={onCancelReplace}
                className={`w-full ${composeSecondaryButton}`}
              >
                취소하고 유지하기
              </button>
            </div>
          </div>
        ) : null}
        <Link
          to={routineEditPath(routine.id)}
          state={{ from: routineDetailPath(routine.id) }}
          className={`w-full ${composeSecondaryButton}`}
        >
          수정
        </Link>
        <div>
          <button
            type="button"
            aria-disabled="true"
            aria-describedby="routine-share-note"
            className="flex min-h-11 w-full cursor-not-allowed items-center justify-center rounded-control border border-line bg-page px-4 text-body font-normal text-muted"
          >
            커뮤니티 공유
          </button>
          <p
            id="routine-share-note"
            className="mt-1 text-support leading-relaxed font-normal text-muted"
          >
            커뮤니티 공유는 준비 중이에요.
          </p>
        </div>
      </section>

      <section aria-label="루틴 삭제" className="border-t border-line pt-5">
        {deletePanel === 'confirm' ? (
          <div
            role="group"
            aria-labelledby="routine-delete-title"
            className="rounded-card border border-danger bg-danger-soft p-4"
          >
            <h3
              id="routine-delete-title"
              className="text-section-title leading-snug font-semibold text-danger"
            >
              이 루틴을 삭제할까요?
            </h3>
            <p className="mt-2 text-body leading-relaxed font-normal text-content">
              “{routine.name}” 루틴이 사라지고 되돌릴 수 없어요. 저장한 운동
              기록과 오늘의 운동 목록에는 영향이 없어요.
            </p>
            {deleteError ? (
              <p
                role="alert"
                className="mt-2 text-support leading-relaxed text-danger"
              >
                {deleteError}
              </p>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                aria-disabled={deleting || undefined}
                onClick={onConfirmDelete}
                className="flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-danger px-4 text-body font-semibold text-surface hover:opacity-90 aria-disabled:cursor-wait aria-disabled:opacity-60"
              >
                {deleting ? '삭제하는 중…' : '삭제하기'}
              </button>
              <button
                type="button"
                onClick={onCancelDelete}
                className={`w-full ${composeSecondaryButton}`}
              >
                취소
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={onOpenDelete}
            className="flex min-h-11 w-full cursor-pointer items-center justify-center rounded-control border border-danger bg-surface px-4 text-body font-semibold text-danger hover:bg-danger-soft"
          >
            루틴 삭제
          </button>
        )}
      </section>
    </div>
  )
}
