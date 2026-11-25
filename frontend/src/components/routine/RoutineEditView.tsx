import { Link } from 'react-router'
import {
  LEGACY_ALLOWED_RECORD_TYPES,
  MAX_SAVED_ITEMS,
} from '../../exercise/workoutDraftModel.ts'
import type {
  DraftIssue,
  RecordType,
  WorkoutDraft,
} from '../../exercise/workoutDraftTypes.ts'
import {
  MAX_ROUTINE_DESCRIPTION,
  MAX_ROUTINE_NAME,
  type RoutineMetaIssue,
} from '../../exercise/workoutRoutineModel.ts'
import ComposeItemCard, {
  type ComposeItemActions,
} from '../exercise/compose/ComposeItemCard.tsx'
import {
  composeCard,
  composeFocusRing,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../exercise/compose/composeStyles.ts'

export const ROUTINE_NAME_ID = 'routine-name'
export const ROUTINE_DESCRIPTION_ID = 'routine-description'
export const ROUTINE_ADD_ID = 'routine-add'

export interface RoutineEditAttempt {
  metaIssues: readonly RoutineMetaIssue[]
  draftIssues: readonly DraftIssue[]
}

const fieldClass = `w-full rounded-control border border-muted/75 bg-surface px-3 text-base font-normal text-content focus-visible:border-exercise focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-exercise`

/**
 * W08 운동 루틴 만들기·수정 본문. 루틴 이름·소개, 운동 추가·제거·순서 변경, 세트·횟수 등 목표 설정, 저장·편집 취소를 보인다.
 * 운동 한 줄의 편집은 W02와 같은 ComposeItemCard(기록 방식 선택·세트별 목표·순서 이동·삭제)를 그대로 쓴다. 입력 검증도 W02와 같은
 * validateDraft다. 오늘의 운동 초안과 별개의 값이라 여기서 편집해도 W02의 초안은 바뀌지 않는다.
 * 저장 시도에서만 이름·소개·운동 구성의 오류를 한꺼번에 알리고 첫 오류 입력으로 포커스를 옮긴다(페이지가 맡는다).
 */
export default function RoutineEditView({
  mode,
  name,
  description,
  onNameChange,
  onDescriptionChange,
  draft,
  allowedFor,
  liveIssues,
  attempt,
  notice,
  actions,
  onAddExercises,
  onSave,
  saving,
  saveError,
  cancelTo,
  cancelState,
}: {
  mode: 'create' | 'edit'
  name: string
  description: string
  onNameChange: (value: string) => void
  onDescriptionChange: (value: string) => void
  draft: WorkoutDraft
  allowedFor: (exerciseId: string) => readonly RecordType[] | undefined
  liveIssues: readonly DraftIssue[]
  attempt: RoutineEditAttempt | null
  notice: string | null
  actions: ComposeItemActions
  onAddExercises: () => void
  onSave: () => void
  saving: boolean
  saveError: string | null
  cancelTo: string
  cancelState?: { from: string }
}) {
  const nameIssue = attempt?.metaIssues.find((i) => i.field === 'name')
  const descriptionIssue = attempt?.metaIssues.find(
    (i) => i.field === 'description',
  )
  const itemName = (itemId?: string) =>
    draft.items.find((item) => item.itemId === itemId)?.name
  const attemptCount =
    (attempt?.metaIssues.length ?? 0) + (attempt?.draftIssues.length ?? 0)

  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {mode === 'create' ? '새 루틴 만들기' : '루틴 수정'}
        </h1>
        <p className="mt-2 text-body leading-relaxed font-normal text-muted">
          이름을 짓고 운동과 세트별 목표를 정해 저장해 주세요.
        </p>
      </header>

      <section
        aria-labelledby="routine-meta-title"
        className="flex flex-col gap-4"
      >
        <h2 id="routine-meta-title" className={composeSectionTitle}>
          루틴 이름·소개
        </h2>
        <div>
          <label
            htmlFor={ROUTINE_NAME_ID}
            className="mb-1 block text-support leading-snug font-semibold text-content"
          >
            루틴 이름
          </label>
          <input
            id={ROUTINE_NAME_ID}
            type="text"
            value={name}
            maxLength={MAX_ROUTINE_NAME + 20}
            autoComplete="off"
            aria-invalid={nameIssue ? true : undefined}
            aria-describedby={
              nameIssue ? `${ROUTINE_NAME_ID}-error` : undefined
            }
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="예: 월요일 상체 루틴"
            className={`h-11 ${fieldClass}`}
          />
          {nameIssue ? (
            <p
              id={`${ROUTINE_NAME_ID}-error`}
              className="mt-1 text-support leading-snug text-danger"
            >
              {nameIssue.message}
            </p>
          ) : null}
        </div>
        <div>
          <label
            htmlFor={ROUTINE_DESCRIPTION_ID}
            className="mb-1 block text-support leading-snug font-semibold text-content"
          >
            소개(선택)
          </label>
          <textarea
            id={ROUTINE_DESCRIPTION_ID}
            value={description}
            rows={3}
            maxLength={MAX_ROUTINE_DESCRIPTION + 50}
            aria-invalid={descriptionIssue ? true : undefined}
            aria-describedby={
              descriptionIssue ? `${ROUTINE_DESCRIPTION_ID}-error` : undefined
            }
            onChange={(event) => onDescriptionChange(event.target.value)}
            placeholder="루틴에 대한 간단한 설명을 적어 보세요"
            className={`py-2 ${fieldClass}`}
          />
          {descriptionIssue ? (
            <p
              id={`${ROUTINE_DESCRIPTION_ID}-error`}
              className="mt-1 text-support leading-snug text-danger"
            >
              {descriptionIssue.message}
            </p>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="routine-items-title">
        <div className="flex items-center justify-between gap-3">
          <h2 id="routine-items-title" className={composeSectionTitle}>
            운동 구성
          </h2>
          <button
            id={ROUTINE_ADD_ID}
            type="button"
            onClick={onAddExercises}
            aria-disabled={draft.items.length >= MAX_SAVED_ITEMS || undefined}
            className={composeSecondaryButton}
          >
            ＋ 운동 추가
          </button>
        </div>
        <div aria-live="polite">
          {notice ? (
            <p
              role="status"
              className="mt-3 text-support leading-relaxed font-normal text-exercise"
            >
              {notice}
            </p>
          ) : null}
        </div>
        {draft.items.length === 0 ? (
          <p
            className={`mt-3 text-center break-keep text-body leading-relaxed font-normal text-muted ${composeCard}`}
          >
            아직 추가한 운동이 없어요.
            <br />
            즐겨찾기나 검색으로 운동을 찾아 추가해 주세요.
          </p>
        ) : (
          <>
            <p className="mt-3 text-body leading-relaxed font-normal text-muted">
              운동별 기록 방식을 선택하고 세트별 목표를 설정해 주세요.
            </p>
            <ol role="list" className="mt-3 flex flex-col gap-3">
              {draft.items.map((item, index) => (
                <ComposeItemCard
                  key={item.itemId}
                  item={item}
                  index={index}
                  total={draft.items.length}
                  issues={liveIssues.filter(
                    (issue) => issue.itemId === item.itemId,
                  )}
                  allowedTypes={
                    allowedFor(item.exerciseId) ?? LEGACY_ALLOWED_RECORD_TYPES
                  }
                  actions={actions}
                />
              ))}
            </ol>
          </>
        )}
      </section>

      <div className="flex flex-col gap-3">
        {attempt && attemptCount > 0 ? (
          <div
            role="alert"
            className="rounded-card border border-danger bg-danger-soft p-4 text-body leading-relaxed font-normal text-danger"
          >
            <p className="font-semibold">
              입력을 확인해 주세요. 고칠 곳이 {attemptCount}개 있어요.
            </p>
            <ul role="list" className="mt-2 list-none">
              {attempt.metaIssues.map((issue) => (
                <li key={issue.field}>· {issue.message}</li>
              ))}
              {attempt.draftIssues.map((issue, index) => (
                <li key={index}>
                  {itemName(issue.itemId) ? `${itemName(issue.itemId)} ` : ''}
                  {issue.setIndex !== undefined
                    ? `${issue.setIndex + 1}세트 `
                    : ''}
                  · {issue.message}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {saveError ? (
          <p
            role="alert"
            className="rounded-card border border-danger bg-danger-soft p-4 text-body leading-relaxed font-normal text-danger"
          >
            {saveError}
          </p>
        ) : null}
        <button
          type="button"
          aria-disabled={saving || undefined}
          onClick={() => {
            if (!saving) onSave()
          }}
          className={`${composePrimaryButton} aria-disabled:cursor-wait aria-disabled:opacity-60`}
        >
          {saving ? '저장하는 중…' : '루틴 저장'}
        </button>
        <Link
          to={cancelTo}
          state={cancelState}
          className={`${composeSecondaryButton} ${composeFocusRing}`}
        >
          편집 취소
        </Link>
      </div>
    </div>
  )
}
