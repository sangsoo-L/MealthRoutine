import { useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/authContext.ts'
import ExercisePicker, {
  type PickerCompleteResult,
  type PickerCopy,
} from '../components/exercise/picker/ExercisePicker.tsx'
import { composeSecondaryButton } from '../components/exercise/compose/composeStyles.ts'
import BackLink from '../components/layout/BackLink.tsx'
import { RoutineStateNotice } from '../components/routine/RoutineDetailView.tsx'
import RoutineEditView, {
  ROUTINE_ADD_ID,
  ROUTINE_DESCRIPTION_ID,
  ROUTINE_NAME_ID,
  type RoutineEditAttempt,
} from '../components/routine/RoutineEditView.tsx'
import type { ComposeItemActions } from '../components/exercise/compose/ComposeItemCard.tsx'
import {
  fieldId,
  itemCardId,
} from '../components/exercise/compose/composeStyles.ts'
import type { ExerciseCatalogState } from '../exercise/useExerciseCatalog.ts'
import { useExerciseCatalog } from '../exercise/useExerciseCatalog.ts'
import { useRoutine } from '../exercise/useRoutines.ts'
import { PATH_ROUTINES, routineDetailPath } from '../exercise/routinePaths.ts'
import {
  addExercisesToDraft,
  addSetToItem,
  buildAllowedRecordTypes,
  createEmptyDraft,
  MAX_SAVED_ITEMS,
  moveItemInDraft,
  removeItemFromDraft,
  removeSetFromItem,
  setItemRecordType,
  updateSetInItem,
  validateDraft,
} from '../exercise/workoutDraftModel.ts'
import type {
  DraftIssue,
  DraftSet,
  RecordType,
  WorkoutDraft,
} from '../exercise/workoutDraftTypes.ts'
import { isWorkoutStoreError } from '../exercise/workoutRepositories.ts'
import {
  routineToDraft,
  validateRoutineMeta,
  type WorkoutRoutine,
} from '../exercise/workoutRoutineModel.ts'
import { createWorkoutRoutineRepository } from '../exercise/workoutSource.ts'

const PICKER_COPY: PickerCopy = {
  title: '운동 추가',
  description:
    '루틴에 넣을 운동을 골라 주세요. 세트와 목표는 다음 화면에서 정해요.',
  completeLabel: (count) => `선택한 ${count}개 운동 루틴에 추가`,
}

/** 저장 요청 식별자(영문·숫자·`-`·`_`). 같은 내용을 다시 저장하는 재시도(응답 유실·연타)는 같은 식별자를 쓴다. */
function newRequestId(): string {
  const random = Math.random().toString(36).slice(2, 10)
  return `w08-${Date.now().toString(36)}-${random}`
}

function focusTargetId(issue: DraftIssue): string {
  if (!issue.itemId) return ROUTINE_ADD_ID
  if (issue.setIndex !== undefined) {
    return fieldId(issue.itemId, issue.setIndex, issue.field)
  }
  if (issue.field === 'recordType') {
    return fieldId(issue.itemId, null, 'recordType')
  }
  return itemCardId(issue.itemId)
}

function saveErrorText(error: unknown): string {
  if (isWorkoutStoreError(error)) {
    if (error.code === 'revisionMismatch') {
      return '다른 곳에서 이 루틴이 바뀌어 저장하지 않았어요. 화면을 새로 열어 최신 내용으로 다시 수정해 주세요.'
    }
    if (error.code === 'requestConflict') {
      return '같은 저장 요청에 다른 내용이 있어 저장하지 않았어요. 다시 저장해 주세요.'
    }
    if (error.reason === 'notFound') {
      return '이 루틴을 찾을 수 없어 저장하지 못했어요. 이미 삭제되었을 수 있어요.'
    }
    if (error.reason === 'validation') {
      return '입력을 확인해 주세요. 저장할 수 없는 값이 있어요.'
    }
    if (error.reason === 'unavailable') {
      return '이 환경에서는 루틴을 저장할 수 없어요.'
    }
  }
  return '루틴을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.'
}

/**
 * 루틴 편집기 본체. 이름·소개·운동 구성은 이 화면 안의 임시 값이며 오늘의 운동 초안(WorkoutDraftProvider)과 별개다.
 * `routine`이 있으면 수정(저장하면 revision이 올라간다), 없으면 새로 만든다. 저장하면 상세(W07)로 이동한다(편집 화면은 기록에서 교체한다).
 */
function RoutineEditor({ routine }: { routine: WorkoutRoutine | null }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const catalog = useExerciseCatalog()
  const [name, setName] = useState(routine?.name ?? '')
  const [description, setDescription] = useState(routine?.description ?? '')
  const [draft, setDraft] = useState<WorkoutDraft>(() =>
    routine ? routineToDraft(routine) : createEmptyDraft(),
  )
  const [pickMode, setPickMode] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [attempt, setAttempt] = useState<RoutineEditAttempt | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const requestIdRef = useRef<string | null>(null)
  const savingRef = useRef(false)

  const known = useMemo(
    () =>
      catalog.state.status === 'ready'
        ? new Set(catalog.state.exercises.map((exercise) => exercise.id))
        : undefined,
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
    () => validateDraft(draft, known, allowed),
    [draft, known, allowed],
  )
  const liveIssues = validation.ok
    ? []
    : validation.issues.filter((issue) => issue.field !== 'items')

  /** 내용을 바꾸면 이전 저장 시도의 안내와 요청 식별자를 버린다(다른 내용이 같은 식별자로 가지 않게). */
  function edited() {
    requestIdRef.current = null
    setAttempt(null)
    setSaveError(null)
  }
  function editDraft(change: (current: WorkoutDraft) => WorkoutDraft) {
    edited()
    setDraft(change)
  }

  const actions: ComposeItemActions = {
    moveItem: (itemId: string, direction: 'up' | 'down') =>
      editDraft((d) => moveItemInDraft(d, itemId, direction)),
    removeItem: (itemId: string) =>
      editDraft((d) => removeItemFromDraft(d, itemId)),
    setRecordType: (
      itemId: string,
      recordType: RecordType,
      allowedTypes?: readonly RecordType[],
    ) =>
      editDraft((d) =>
        setItemRecordType(d, itemId, recordType, undefined, allowedTypes),
      ),
    addSet: (itemId: string) => editDraft((d) => addSetToItem(d, itemId)),
    removeSet: (itemId: string, setIndex: number) =>
      editDraft((d) => removeSetFromItem(d, itemId, setIndex)),
    updateSet: (
      itemId: string,
      setIndex: number,
      patch: Partial<Record<keyof DraftSet, number | undefined>>,
    ) => editDraft((d) => updateSetInItem(d, itemId, setIndex, patch)),
  }

  function handlePick(
    ids: readonly string[],
    catalogState: ExerciseCatalogState,
  ): PickerCompleteResult {
    if (catalogState.status !== 'ready') {
      return {
        ok: false,
        message:
          '운동 정보를 불러오지 못해 추가할 수 없어요. 잠시 후 다시 시도해 주세요.',
      }
    }
    const byId = new Map(catalogState.exercises.map((e) => [e.id, e]))
    const exercises = ids.flatMap((id) => {
      const exercise = byId.get(id)
      return exercise ? [exercise] : []
    })
    if (exercises.length !== ids.length) {
      return {
        ok: false,
        message:
          '일부 운동의 정보를 찾을 수 없어 추가하지 않았어요. 선택을 확인해 주세요.',
      }
    }
    const added =
      addExercisesToDraft(draft, exercises).items.length - draft.items.length
    if (added === 0) {
      return {
        ok: false,
        message: '이미 루틴에 있는 운동이거나 더 추가할 수 없어요.',
      }
    }
    const skipped = exercises.length - added
    // 상한(100개)에 닿았으면 건너뛴 운동에 이미 있는 운동이 아닌 것도 섞여 있다.
    const skippedLabel =
      draft.items.length + added >= MAX_SAVED_ITEMS
        ? `이미 있거나 최대 ${MAX_SAVED_ITEMS}개를 넘는 운동`
        : '이미 있는 운동'
    editDraft((d) => addExercisesToDraft(d, exercises))
    setNotice(
      `운동 ${added}개를 추가했어요.${skipped > 0 ? ` ${skippedLabel} ${skipped}개는 건너뛰었어요.` : ''}`,
    )
    setPickMode(false)
    return { ok: true }
  }

  async function handleSave() {
    if (!user || savingRef.current) return
    const meta = validateRoutineMeta(name, description)
    const result = validateDraft(draft, known, allowed)
    if (!meta.ok || !result.ok) {
      const next: RoutineEditAttempt = {
        metaIssues: meta.ok ? [] : meta.issues,
        draftIssues: result.ok ? [] : result.issues,
      }
      setAttempt(next)
      const targetId = !meta.ok
        ? meta.issues[0].field === 'name'
          ? ROUTINE_NAME_ID
          : ROUTINE_DESCRIPTION_ID
        : result.ok
          ? null
          : focusTargetId(result.issues[0])
      if (targetId) document.getElementById(targetId)?.focus()
      return
    }
    const repository = createWorkoutRoutineRepository(user.id)
    if (!repository) {
      setSaveError('루틴 저장 기능을 준비 중이라 저장할 수 없어요.')
      return
    }
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    try {
      const content = {
        name: meta.name,
        description: meta.description,
        draft,
        knownExerciseIds: known,
        allowedRecordTypes: allowed,
      }
      const saved = routine
        ? await repository.update(routine.id, {
            ...content,
            expectedRevision: routine.revision,
          })
        : (
            await repository.create({
              ...content,
              requestId: (requestIdRef.current ??= newRequestId()),
            })
          ).routine
      // 저장 화면은 기록에서 교체해 "이전"이 편집 화면으로 돌아오지 않게 한다.
      void navigate(routineDetailPath(saved.id), { replace: true })
    } catch (error) {
      savingRef.current = false
      setSaving(false)
      setSaveError(saveErrorText(error))
    }
  }

  const cancelTo = routine ? routineDetailPath(routine.id) : PATH_ROUTINES

  if (pickMode) {
    return (
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2">
          <p className="text-support leading-relaxed font-normal text-muted">
            루틴에 넣을 운동을 골라 주세요.
          </p>
          <button
            type="button"
            onClick={() => setPickMode(false)}
            className={composeSecondaryButton}
          >
            돌아가기
          </button>
        </div>
        <ExercisePicker
          backTo={null}
          onComplete={handlePick}
          copy={PICKER_COPY}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <BackLink parent={PATH_ROUTINES} />
      </div>
      <RoutineEditView
        mode={routine ? 'edit' : 'create'}
        name={name}
        description={description}
        onNameChange={(value) => {
          edited()
          setName(value)
        }}
        onDescriptionChange={(value) => {
          edited()
          setDescription(value)
        }}
        draft={draft}
        allowedFor={(exerciseId) => allowed?.get(exerciseId)}
        liveIssues={liveIssues}
        attempt={attempt}
        notice={notice}
        actions={actions}
        onAddExercises={() => setPickMode(true)}
        onSave={() => void handleSave()}
        saving={saving}
        saveError={saveError}
        cancelTo={cancelTo}
      />
    </div>
  )
}

function EditExisting({ routineId }: { routineId: string }) {
  const { user } = useAuth()
  const { state, reload } = useRoutine(user?.id ?? null, routineId)
  if (state.status !== 'ready') {
    return <RoutineStateNotice state={state} onRetry={reload} />
  }
  return <RoutineEditor routine={state.routine} />
}

/**
 * W08 운동 루틴 만들기·수정(`/records/exercise/routines/new`, `/records/exercise/routines/:routineId/edit`, 회원 전용).
 * 계정·루틴이 바뀌면 key로 본체를 다시 만들어 이전 화면의 편집 내용이 남지 않게 한다. 하단 탭은 그리지 않는다(운동 선택 화면을 품고 있다).
 */
export default function RoutineEditPage() {
  const { user } = useAuth()
  const { routineId } = useParams()
  const scope = `${user?.id ?? ''}|${routineId ?? 'new'}`
  return routineId ? (
    <EditExisting key={scope} routineId={routineId} />
  ) : (
    <RoutineEditor key={scope} routine={null} />
  )
}
