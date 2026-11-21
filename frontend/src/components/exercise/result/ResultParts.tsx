import { RECORD_COMPONENTS } from '../../../exercise/recordMode.ts'
import { useEffect, useRef, type ReactNode } from 'react'
import { RECORD_TYPE_LABEL } from '../../../exercise/workoutDraftTypes.ts'
import { MAX_REPS, MAX_WEIGHT_KG } from '../../../exercise/workoutProgress.ts'
import { listIncompleteRecordedSets } from '../../../exercise/workoutResult.ts'
import type { SubmitBlockReason } from '../../../exercise/workoutResultController.ts'
import type { ResultSnapshot } from '../../../exercise/workoutResultController.ts'
import {
  type ResultCardModel,
  type ResultCardSet,
  measuredLabel,
} from '../../../exercise/workoutResultView.ts'
import {
  composeCard,
  composeCardActive,
  composeInput,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import type {
  ResultActions,
  ResultEditorState,
  ResultPanel,
} from './resultTypes.ts'

export const dangerButton =
  'flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-danger px-4 text-body font-semibold text-surface hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger'

const smallButton =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-support font-semibold text-content hover:border-exercise hover:text-exercise focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-line aria-disabled:hover:text-content'

const bodyCls =
  'mt-2 text-body leading-relaxed font-normal break-keep text-muted'

const BLOCK_TEXT: Record<SubmitBlockReason, string> = {
  timerRunning: '타이머가 아직 측정 중이에요. 타이머를 멈춘 뒤 저장해 주세요.',
  w14Saving: '운동 진행 내용을 저장하는 중이에요. 잠시 후 다시 시도해 주세요.',
  w14Unsaved: '운동 진행 내용이 아직 저장되지 않았어요.',
  w14SaveFailed: '운동 진행 내용 저장이 실패한 상태예요.',
  w14Conflict: '다른 곳에서 운동이 바뀌어 진행 내용이 맞지 않아요.',
}

const FAILURE_DETAIL: Record<string, string> = {
  quota: '저장 공간이 부족해요.',
  unavailable: '이 브라우저에서는 저장할 수 없어요.',
  blocked: '다른 탭이 운동 기록을 사용 중이에요.',
}

const CONFLICT_TEXT = {
  changed: '다른 곳에서 운동 내용이 변경됐어요.',
  ended: '운동이 이미 종료됐어요.',
  gone: '운동을 찾을 수 없어요.',
} as const

export const RESULT_TITLE = '운동 결과 확인'

/** 패널이 열리면 포커스를 안으로 옮겨 보조기기가 읽게 한다. */
function PanelBox({
  titleId,
  role,
  children,
}: {
  titleId: string
  role?: 'alert' | 'group'
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<Element | null>(null)
  useEffect(() => {
    // 열리면 패널 안으로 포커스를 옮기고, 닫힐 때 포커스가 문서 처음으로 빠지면 열기 전의 버튼으로 되돌린다.
    // (개발 모드의 효과 재실행에서도 처음 열기 전의 버튼을 기억하도록 ref에 한 번만 담는다.)
    triggerRef.current ??= document.activeElement
    ref.current?.focus()
    return () => {
      requestAnimationFrame(() => {
        const current = document.activeElement
        const trigger = triggerRef.current
        if (
          (current === null || current === document.body) &&
          trigger instanceof HTMLElement &&
          trigger.isConnected
        ) {
          trigger.focus()
        }
      })
    }
  }, [])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role={role ?? 'group'}
      aria-labelledby={titleId}
      className={`${composeCardActive} outline-none`}
    >
      {children}
    </div>
  )
}

function Banner({
  tone,
  children,
}: {
  tone: 'danger' | 'warning' | 'muted'
  children: ReactNode
}) {
  const cls =
    tone === 'danger'
      ? 'bg-danger-soft text-danger'
      : tone === 'warning'
        ? 'bg-warning-soft text-warning'
        : 'bg-page text-muted'
  return (
    <div
      className={`rounded-control px-3 py-2 text-support leading-relaxed font-normal break-keep ${cls}`}
    >
      {children}
    </div>
  )
}

// ─── 상단 ──────────────────────────────────────────────────

export interface HeaderModel {
  dateLabel: string
  exerciseCount: number
  completedSetCount: number
  plannedSetCount: number
  percent: number
  statusKey: 'full' | 'partial' | 'none'
  statusLabel: string
  /** 시간형이 포함된 결과(W15)만 값이 있다. null이면 줄을 그리지 않는다. */
  timeLine: string | null
  readOnly: boolean
}

export function ResultHeader({ model }: { model: HeaderModel }) {
  const tone =
    model.statusKey === 'full'
      ? 'bg-exercise-soft text-exercise'
      : model.statusKey === 'partial'
        ? 'bg-warning-soft text-warning'
        : 'bg-page text-muted'
  return (
    <header>
      <h1 className="text-app-title leading-snug font-semibold text-content">
        {RESULT_TITLE}
      </h1>
      <p className="mt-1 text-body font-normal text-muted">
        {model.dateLabel} 운동
        {model.readOnly ? ' · 저장된 기록' : ''}
      </p>
      <p
        className={`mt-3 inline-flex items-center rounded-full px-3 py-1 text-support leading-none font-semibold ${tone}`}
        data-result-status={model.statusKey}
      >
        {model.statusLabel}
      </p>
      <dl className="mt-3 grid grid-cols-3 gap-2">
        <div className="min-w-0 rounded-control bg-surface px-2 py-3 text-center ring-1 ring-line">
          <dt className="text-support font-normal text-muted">운동</dt>
          <dd className="text-metric leading-tight font-semibold text-content tabular-nums">
            {model.exerciseCount}
            <span className="text-support font-normal text-muted">개</span>
          </dd>
        </div>
        <div className="min-w-0 rounded-control bg-surface px-2 py-3 text-center ring-1 ring-line">
          <dt className="text-support font-normal text-muted">완료 세트</dt>
          <dd className="text-metric leading-tight font-semibold text-content tabular-nums">
            {model.completedSetCount}
            <span className="text-support font-normal text-muted">
              /{model.plannedSetCount}
            </span>
          </dd>
        </div>
        <div className="min-w-0 rounded-control bg-surface px-2 py-3 text-center ring-1 ring-line">
          <dt className="text-support font-normal text-muted">완료율</dt>
          <dd className="text-metric leading-tight font-semibold text-content tabular-nums">
            {model.percent}
            <span className="text-support font-normal text-muted">%</span>
          </dd>
        </div>
      </dl>
      <div
        role="progressbar"
        aria-label="세트 완료율"
        aria-valuemin={0}
        aria-valuemax={model.plannedSetCount}
        aria-valuenow={model.completedSetCount}
        aria-valuetext={`${model.plannedSetCount}세트 중 ${model.completedSetCount}세트 완료, ${model.percent}%`}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-exercise"
          style={{ width: `${model.percent}%` }}
        />
      </div>
      {model.timeLine ? (
        <p className="mt-3 text-body font-normal text-muted">
          {model.timeLine}
        </p>
      ) : null}
    </header>
  )
}

// ─── 운동 카드 ─────────────────────────────────────────────

function SetEditForm({
  card,
  editor,
  actions,
}: {
  card: ResultCardModel
  editor: ResultEditorState
  actions: ResultActions
}) {
  const parts = RECORD_COMPONENTS[card.recordType]
  const firstRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    firstRef.current?.focus()
  }, [])
  const key = `${editor.itemIndex}-${editor.setIndex}`
  const repsError = editor.errors.reps
  const weightError = editor.errors.weightKg
  const measuredError = editor.errors.measuredMs
  // 적용이 거부되면 첫 번째 오류 입력으로 포커스를 옮긴다(오류 메시지는 aria-describedby로도 연결돼 있다).
  useEffect(() => {
    const target = repsError
      ? `result-reps-${key}`
      : weightError
        ? `result-weight-${key}`
        : measuredError
          ? `result-measured-${key}`
          : null
    if (target) document.getElementById(target)?.focus()
  }, [repsError, weightError, measuredError, key])
  const currentMeasured = card.sets[editor.setIndex]?.measuredMs ?? null
  // 첫 입력(구성값 순서: 횟수 → 중량 → 시간)에 포커스를 둔다.
  const firstField = parts.reps ? 'reps' : parts.weight ? 'weight' : 'measured'
  return (
    <form
      noValidate
      aria-label={`${card.name} ${editor.setIndex + 1}세트 실제 값 수정`}
      onSubmit={(event) => {
        event.preventDefault()
        actions.applyEdit()
      }}
      className="mt-3 rounded-control bg-page p-3"
    >
      <div className="flex flex-col gap-3">
        {parts.reps ? (
          <div>
            <label
              htmlFor={`result-reps-${key}`}
              className="text-support font-semibold text-content"
            >
              실제 횟수 (1~{MAX_REPS}회)
            </label>
            <input
              ref={firstField === 'reps' ? firstRef : undefined}
              id={`result-reps-${key}`}
              inputMode="numeric"
              autoComplete="off"
              value={editor.reps}
              aria-invalid={repsError ? true : undefined}
              aria-describedby={
                repsError ? `result-reps-error-${key}` : undefined
              }
              onChange={(event) =>
                actions.changeField('reps', event.currentTarget.value)
              }
              className={`${composeInput} mt-1`}
            />
            {repsError ? (
              <p
                id={`result-reps-error-${key}`}
                role="alert"
                className="mt-1 text-support font-normal text-danger"
              >
                {repsError}
              </p>
            ) : null}
          </div>
        ) : null}
        {parts.weight ? (
          <div>
            <label
              htmlFor={`result-weight-${key}`}
              className="text-support font-semibold text-content"
            >
              실제 중량 (0~{MAX_WEIGHT_KG}kg, 소수점 한 자리)
            </label>
            <input
              ref={firstField === 'weight' ? firstRef : undefined}
              id={`result-weight-${key}`}
              inputMode="decimal"
              autoComplete="off"
              value={editor.weightKg}
              aria-invalid={weightError ? true : undefined}
              aria-describedby={
                weightError ? `result-weight-error-${key}` : undefined
              }
              onChange={(event) =>
                actions.changeField('weightKg', event.currentTarget.value)
              }
              className={`${composeInput} mt-1`}
            />
            {weightError ? (
              <p
                id={`result-weight-error-${key}`}
                role="alert"
                className="mt-1 text-support font-normal text-danger"
              >
                {weightError}
              </p>
            ) : null}
            <p className="mt-1 text-support font-normal text-muted">
              0kg도 직접 입력하면 저장돼요. 비워 둘 수 없어요.
            </p>
          </div>
        ) : null}
        {parts.time ? (
          <div>
            <label
              htmlFor={`result-measured-${key}`}
              className="text-support font-semibold text-content"
            >
              실제 측정 시간 (초 또는 분:초)
            </label>
            <input
              ref={firstField === 'measured' ? firstRef : undefined}
              id={`result-measured-${key}`}
              inputMode="text"
              autoComplete="off"
              value={editor.measuredMs}
              aria-invalid={measuredError ? true : undefined}
              aria-describedby={
                measuredError
                  ? `result-measured-error-${key} result-measured-help-${key}`
                  : `result-measured-help-${key}`
              }
              onChange={(event) =>
                actions.changeField('measuredMs', event.currentTarget.value)
              }
              className={`${composeInput} mt-1`}
            />
            {measuredError ? (
              <p
                id={`result-measured-error-${key}`}
                role="alert"
                className="mt-1 text-support font-normal text-danger"
              >
                {measuredError}
              </p>
            ) : null}
            <p
              id={`result-measured-help-${key}`}
              className="mt-1 text-support font-normal text-muted"
            >
              현재 기록: {measuredLabel(currentMeasured)} · 예: 55 또는 55.5
              (초), 1:05 (1분 5초)
            </p>
          </div>
        ) : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="submit"
          className={`${composeSecondaryButton} bg-exercise text-surface hover:bg-exercise hover:opacity-90`}
        >
          적용
        </button>
        <button
          type="button"
          onClick={actions.closeEdit}
          className={composeSecondaryButton}
        >
          닫기
        </button>
      </div>
    </form>
  )
}

function SetRow({
  card,
  set,
  readOnly,
  editable,
  editor,
  actions,
}: {
  card: ResultCardModel
  set: ResultCardSet
  /** 저장된 기록을 보는 화면이라 수정 컨트롤을 그리지 않는다. */
  readOnly: boolean
  /** 수정 컨트롤을 쓸 수 있는지(false이면 저장 요청이 시작되어 잠겼다). */
  editable: boolean
  editor: ResultEditorState | null
  actions: ResultActions
}) {
  const index = set.setNumber - 1
  const isTime = RECORD_COMPONENTS[card.recordType].time
  const editing =
    editor !== null &&
    editor.itemIndex === card.itemIndex &&
    editor.setIndex === index
  const controls = set.completed && !readOnly
  return (
    <li
      data-set-state={set.completed ? 'done' : 'todo'}
      className={`rounded-control border px-3 py-3 ${
        set.completed ? 'border-line bg-surface' : 'border-line bg-page'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-body font-semibold text-content">
          {set.setNumber}세트
        </span>
        <span
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-support leading-none font-semibold ${
            set.completed
              ? 'bg-exercise-soft text-exercise'
              : 'bg-line text-muted'
          }`}
        >
          {set.completed ? '✓ 완료' : '미완료'}
        </span>
        {set.edited ? (
          <span className="inline-flex items-center rounded-full bg-warning-soft px-2 py-0.5 text-support leading-none font-semibold text-warning">
            수정됨
          </span>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-body">
        {set.targetText !== null ? (
          <>
            <dt className="font-normal text-muted">목표</dt>
            <dd className="font-normal text-content">{set.targetText}</dd>
          </>
        ) : null}
        <dt className="font-normal text-muted">실제</dt>
        <dd
          className={`font-semibold ${set.completed ? 'text-content' : 'text-muted'}`}
        >
          {set.completed ? set.actualText : '기록 없음 (미완료)'}
        </dd>
      </dl>
      {!set.completed ? (
        <p className="mt-1 text-support font-normal text-muted">
          결과 화면에서는 미완료 세트를 완료할 수 없어요.
        </p>
      ) : null}
      {set.completed &&
      isTime &&
      set.timeStatus === 'unmeasured' &&
      readOnly ? (
        <p className="mt-1 text-support font-normal text-muted">
          타이머 없이 완료한 세트예요. 목표 시간으로 대신하지 않아요.
        </p>
      ) : null}
      {set.completed && !readOnly && set.missing.length > 0 ? (
        <p className="mt-1 text-support font-semibold text-warning">
          <span aria-hidden="true">⚠ </span>
          실제 기록이 빠졌어요 ({set.missing.join(', ')}). 저장하려면 입력하거나
          완료를 해제해 주세요.
        </p>
      ) : null}
      {controls ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            id={`result-edit-${card.itemIndex}-${index}`}
            aria-disabled={!editable}
            aria-expanded={editing}
            onClick={() => {
              if (editable) actions.openEdit(card.itemIndex, index)
            }}
            className={smallButton}
          >
            <span aria-hidden="true">수정</span>
            <span className="sr-only">
              {card.name} {set.setNumber}세트 실제 값 수정
            </span>
          </button>
          <button
            type="button"
            aria-disabled={!editable}
            onClick={() => {
              if (editable) actions.uncomplete(card.itemIndex, index)
            }}
            className={smallButton}
          >
            <span aria-hidden="true">완료 해제</span>
            <span className="sr-only">
              {card.name} {set.setNumber}세트 완료 해제
            </span>
          </button>
        </div>
      ) : null}
      {editing && editor && editable ? (
        <SetEditForm card={card} editor={editor} actions={actions} />
      ) : null}
    </li>
  )
}

export function ExerciseCard({
  card,
  editable,
  readOnly,
  editor,
  actions,
}: {
  card: ResultCardModel
  editable: boolean
  readOnly: boolean
  editor: ResultEditorState | null
  actions: ResultActions
}) {
  const headingId = `result-ex-${card.itemIndex}`
  return (
    <section
      aria-labelledby={headingId}
      data-exercise-state={card.completedAll ? 'done' : 'partial'}
      className={composeCard}
    >
      <div className="flex items-start justify-between gap-3">
        <h2
          id={headingId}
          tabIndex={-1}
          className={`${composeSectionTitle} min-w-0 outline-none`}
        >
          <span className="font-normal text-muted">{card.itemIndex + 1}. </span>
          {card.name}
        </h2>
        <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-semibold text-exercise">
          {RECORD_TYPE_LABEL[card.recordType]}
        </span>
      </div>
      <p className="mt-2 text-body font-normal text-muted">
        {card.targetSummary}
      </p>
      <p className="mt-1 text-body font-semibold text-content">
        {card.actualSummary ?? '완료한 세트가 없어요'}
        <span className="ml-2 text-support font-normal text-muted">
          {card.completedAll
            ? '운동 완료'
            : `${card.completedSetCount}/${card.plannedSetCount}세트 완료`}
        </span>
      </p>
      <ol
        aria-label={`${card.name} 세트별 결과`}
        className="mt-3 flex flex-col gap-2"
      >
        {card.sets.map((set) => (
          <SetRow
            key={set.setNumber}
            card={card}
            set={set}
            readOnly={readOnly}
            editable={editable}
            editor={readOnly ? null : editor}
            actions={actions}
          />
        ))}
      </ol>
    </section>
  )
}

// ─── 상태·안내 ─────────────────────────────────────────────

const MISSING_GUIDE =
  '이전에 완료한 세트 중 실제 운동 기록이 빠진 항목이 있어요. 해당 세트의 기록을 입력하거나 완료 상태를 해제한 후 저장해 주세요.'

/** 저장 상태·실패·충돌·차단 안내. 자동 병합·덮어쓰기는 하지 않는다. */
export function StatusPanels({
  snapshot,
  failureDismissed,
  actions,
}: {
  snapshot: ResultSnapshot
  failureDismissed: boolean
  actions: ResultActions
}) {
  const { phase, conflict, block, issues, progressSaved } = snapshot
  // 옛 세션의 값 빠진 완료 세트: 저장 전에 입력하거나 완료를 해제해야 한다(어느 세트인지 미리 알린다).
  const missingSets =
    snapshot.session && snapshot.draft
      ? listIncompleteRecordedSets(
          snapshot.session.listSnapshot,
          snapshot.draft.performed,
        )
      : []
  const busy =
    phase === 'validating' ||
    phase === 'savingProgress' ||
    phase === 'completing'
  const detail =
    snapshot.failure !== null ? FAILURE_DETAIL[snapshot.failure] : undefined
  return (
    <div className="flex flex-col gap-3 empty:hidden">
      {conflict && failureDismissed ? (
        <div role="alert">
          <Banner tone="danger">
            <p>{CONFLICT_TEXT[conflict.kind]} 저장은 멈춘 상태예요.</p>
            <button
              type="button"
              aria-disabled={busy}
              onClick={() => {
                if (!busy) actions.requestReload()
              }}
              className="mt-1 cursor-pointer text-support font-semibold underline"
            >
              최신 상태 불러오기
            </button>
          </Banner>
        </div>
      ) : conflict ? (
        <PanelBox titleId="result-conflict-title" role="alert">
          <h2 id="result-conflict-title" className={composeSectionTitle}>
            {CONFLICT_TEXT[conflict.kind]}
          </h2>
          <p className={bodyCls}>
            {conflict.recordMismatch
              ? '이미 저장된 운동 기록이 지금 보는 결과와 달라요. 자동으로 합치거나 덮어쓰지 않았어요.'
              : '자동으로 합치거나 덮어쓰지 않고 저장을 멈췄어요.'}
            {conflict.kind === 'gone'
              ? ''
              : ' 최신 상태를 불러온 뒤 다시 확인해 주세요.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              aria-disabled={busy}
              onClick={() => {
                if (!busy) actions.requestReload()
              }}
              className={composePrimaryButton}
            >
              최신 상태 불러오기
            </button>
            <button
              type="button"
              onClick={actions.goSession}
              className={composeSecondaryButton}
            >
              운동 진행(W14)으로 돌아가기
            </button>
            <button
              type="button"
              onClick={actions.dismissFailure}
              className={composeSecondaryButton}
            >
              머무르기
            </button>
          </div>
        </PanelBox>
      ) : phase === 'fatalError' ? (
        <PanelBox titleId="result-fatal-title" role="alert">
          <h2 id="result-fatal-title" className={composeSectionTitle}>
            운동 결과를 저장할 수 없어요
          </h2>
          <p className={bodyCls}>
            저장소가 이 값을 받아들이지 않았어요. 다시 시도해도 같은 결과예요.
            최신 상태를 불러와 다시 확인해 주세요.
          </p>
          <div className="mt-4">
            <button
              type="button"
              onClick={actions.requestReload}
              className={composePrimaryButton}
            >
              최신 상태 불러오기
            </button>
          </div>
        </PanelBox>
      ) : phase === 'retryableError' && !failureDismissed ? (
        <PanelBox titleId="result-retry-title" role="alert">
          <h2 id="result-retry-title" className={composeSectionTitle}>
            {progressSaved
              ? '수정한 운동 기록은 저장됐지만 최종 완료 처리가 끝나지 않았어요.'
              : '운동 결과를 저장하지 못했어요. 다시 시도할 수 있어요.'}
          </h2>
          <p className={bodyCls}>
            {detail ? `${detail} ` : ''}
            {progressSaved
              ? '다시 시도하면 저장한 값은 그대로 두고 완료 처리만 이어서 해요.'
              : '수정한 내용은 이 화면에 남아 있어요.'}
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={actions.submit}
              className={composePrimaryButton}
            >
              다시 시도
            </button>
            <button
              type="button"
              onClick={actions.dismissFailure}
              className={composeSecondaryButton}
            >
              운동 결과 화면에 머무르기
            </button>
          </div>
        </PanelBox>
      ) : phase === 'retryableError' ? (
        <div role="alert">
          <Banner tone="danger">
            <p>
              {progressSaved
                ? '수정한 운동 기록은 저장됐지만 최종 완료 처리가 끝나지 않았어요.'
                : '운동 결과를 저장하지 못했어요.'}
            </p>
            <button
              type="button"
              onClick={actions.submit}
              className="mt-1 cursor-pointer text-support font-semibold underline"
            >
              다시 시도
            </button>
          </Banner>
        </div>
      ) : null}

      {!conflict && block ? (
        <div role="status">
          <Banner tone="warning">
            <p>{BLOCK_TEXT[block]}</p>
            <button
              type="button"
              onClick={actions.goSession}
              className="mt-1 cursor-pointer text-support font-semibold underline"
            >
              운동 진행(W14)으로 돌아가기
            </button>
          </Banner>
        </div>
      ) : null}

      {missingSets.length > 0 && issues.length === 0 && phase === 'idle' ? (
        <div role="status">
          <Banner tone="warning">
            <p>{MISSING_GUIDE}</p>
            <ul className="mt-1 list-disc pl-4">
              {missingSets.map((info) => (
                <li key={`${info.itemIndex}-${info.setIndex}`}>
                  {info.name} {info.setNumber}세트: {info.fields.join(', ')}
                </li>
              ))}
            </ul>
          </Banner>
        </div>
      ) : null}

      {issues.length > 0 && phase === 'idle' ? (
        <div role="alert">
          <Banner tone="danger">
            {issues.some((issue) => issue.reason === 'invalidValue') ? (
              <p className="mb-1">{MISSING_GUIDE}</p>
            ) : null}
            <ul className="list-disc pl-4">
              {issues.map((issue, index) => (
                <li key={index}>{issue.message}</li>
              ))}
            </ul>
          </Banner>
        </div>
      ) : null}

      {snapshot.editLocked && snapshot.hasChanges && phase !== 'success' ? (
        <Banner tone="muted">
          저장 요청이 시작되어 지금은 수정할 수 없어요. 최신 상태를 불러오면
          다시 수정할 수 있어요.
        </Banner>
      ) : null}
    </div>
  )
}

/** 확인 패널. 수정한 값이 사라질 수 있는 두 동작(최신 불러오기, 화면 이탈)에만 쓴다. */
export function PanelView({
  panel,
  actions,
}: {
  panel: ResultPanel
  actions: ResultActions
}) {
  if (panel.kind === 'reload') {
    return (
      <PanelBox titleId="result-panel-title">
        <h2 id="result-panel-title" className={composeSectionTitle}>
          최신 상태를 불러올까요?
        </h2>
        <p className={bodyCls}>
          최신 운동 기록을 불러오면 저장하지 않은 수정 내용이 사라질 수 있어요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={actions.confirmReload}
            className={dangerButton}
          >
            최신 기록 불러오기
          </button>
          <button
            type="button"
            onClick={actions.closePanel}
            className={composePrimaryButton}
          >
            취소
          </button>
        </div>
      </PanelBox>
    )
  }
  return (
    <PanelBox titleId="result-panel-title">
      <h2 id="result-panel-title" className={composeSectionTitle}>
        저장하지 않은 수정 내용이 있어요
      </h2>
      <p className={bodyCls}>
        지금 이동하면 수정한 값이 사라져요. 운동 기록은 W15에 들어오기 전 상태로
        남아 있어요.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={actions.leaveStay}
          className={composePrimaryButton}
        >
          계속 수정하기
        </button>
        <button
          type="button"
          onClick={actions.leaveDiscard}
          className={dangerButton}
        >
          수정 내용 버리고 이동
        </button>
      </div>
    </PanelBox>
  )
}

/** 하단 저장 바. 저장 중에는 눌러도 아무 일도 하지 않는다(중복 실행 방지). */
export function SaveBar({
  snapshot,
  actions,
}: {
  snapshot: ResultSnapshot
  actions: ResultActions
}) {
  const { phase, canSubmit, summary, hasChanges, editLocked } = snapshot
  const busy =
    phase === 'validating' ||
    phase === 'savingProgress' ||
    phase === 'completing'
  const label =
    phase === 'validating'
      ? '검증 중…'
      : phase === 'savingProgress'
        ? '수정한 값 저장 중…'
        : phase === 'completing'
          ? '최종 완료 처리 중…'
          : phase === 'success'
            ? '저장했어요'
            : phase === 'retryableError'
              ? '다시 시도'
              : '운동 결과 저장하기'
  const reason =
    summary?.noneCompleted === true
      ? '완료한 세트가 없어 저장할 수 없어요.'
      : null
  return (
    <div className="sticky bottom-0 z-10 -mx-5 mt-2 border-t border-line bg-surface px-5 py-3">
      <p
        role="status"
        aria-live="polite"
        className="mb-2 min-h-5 text-support font-normal text-muted"
      >
        {busy
          ? label
          : phase === 'success'
            ? '운동 기록을 저장했어요. 오늘의 운동으로 이동해요.'
            : (reason ?? '')}
      </p>
      {hasChanges && !editLocked && !busy ? (
        <button
          type="button"
          onClick={actions.cancelEdits}
          className={`${composeSecondaryButton} mb-2 w-full`}
        >
          수정 취소
        </button>
      ) : null}
      <button
        type="button"
        aria-disabled={!canSubmit}
        aria-busy={busy}
        onClick={() => {
          if (canSubmit) actions.submit()
        }}
        className={`${composePrimaryButton} aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted`}
      >
        {label}
      </button>
    </div>
  )
}
