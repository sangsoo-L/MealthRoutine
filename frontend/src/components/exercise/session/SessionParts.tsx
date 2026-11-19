import { useEffect, useRef, type ReactNode } from 'react'
import type {
  SessionSnapshot,
  SaveFailureReason,
} from '../../../exercise/workoutSessionController.ts'
import {
  describeAbandon,
  itemProgress,
  progressOf,
} from '../../../exercise/workoutProgress.ts'
import {
  formatClock,
  formatTargetSeconds,
} from '../../../exercise/workoutListView.ts'
import {
  composeCard,
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import type { SessionActions, SessionPanel } from './sessionTypes.ts'

const dangerButton =
  'flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-danger px-4 text-body font-semibold text-surface hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger'

const SAVE_FAILURE_TEXT: Record<SaveFailureReason, string> = {
  quota: '저장 공간이 부족해서 저장하지 못했어요.',
  unavailable: '이 브라우저에서는 저장할 수 없어요.',
  blocked: '다른 탭에서 운동 기록을 사용 중이라 저장하지 못했어요.',
  invalidProgress:
    '저장할 수 없는 값이 있어요. 최신 상태를 불러와 다시 진행해 주세요.',
  error: '진행 상태를 저장하지 못했어요.',
}

const CONFLICT_TEXT = {
  changed:
    '다른 탭에서 이 운동이 바뀌었어요. 자동으로 합치지 않고 저장을 멈췄어요.',
  ended: '이 운동이 다른 곳에서 이미 끝났어요.',
  gone: '이 운동을 찾을 수 없어요.',
} as const

/** 상단: 제목, 운동 순서, 전체 진행률. */
export function SessionHeader({ snapshot }: { snapshot: SessionSnapshot }) {
  const session = snapshot.session
  if (!session) return null
  const { completedSets, totalSets, percent } = progressOf(session.performed)
  return (
    <header>
      <h1 className="text-app-title leading-snug font-semibold text-content">
        운동 진행
      </h1>
      <p className="mt-1 text-body font-normal text-muted">
        운동 {session.cursor.itemIndex + 1} /{' '}
        {session.listSnapshot.items.length}
        {' · '}
        <span className="tabular-nums">
          완료 {completedSets} / {totalSets}세트
        </span>
      </p>
      <div
        role="progressbar"
        aria-label="전체 세트 진행률"
        aria-valuemin={0}
        aria-valuemax={totalSets}
        aria-valuenow={completedSets}
        aria-valuetext={`${totalSets}세트 중 ${completedSets}세트 완료, ${percent}%`}
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-line"
      >
        <div
          className="h-full rounded-full bg-exercise transition-[width] motion-reduce:transition-none"
          style={{ width: `${percent}%` }}
        />
      </div>
    </header>
  )
}

/** 세트별 완료 진행 표시. 색만으로 구분하지 않고 글자(완료·진행 중·대기)로 알린다. */
export function SetChips({ snapshot }: { snapshot: SessionSnapshot }) {
  const session = snapshot.session
  if (!session) return null
  const { itemIndex, setIndex } = session.cursor
  const sets = session.performed[itemIndex] ?? []
  const progress = itemProgress(session.performed, itemIndex)
  return (
    <ol
      aria-label={`세트 진행, ${progress?.completedSets ?? 0} / ${progress?.totalSets ?? 0}세트 완료`}
      className="mt-3 flex flex-wrap gap-2"
    >
      {sets.map((set, index) => {
        const current = index === setIndex
        const status = set.completed ? '완료' : current ? '진행 중' : '대기'
        return (
          <li
            key={index}
            aria-current={current ? 'step' : undefined}
            className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-3 text-support leading-none ${
              set.completed
                ? 'border-exercise bg-exercise-soft font-semibold text-exercise'
                : current
                  ? 'border-exercise bg-surface font-semibold text-content'
                  : 'border-line bg-surface font-normal text-muted'
            }`}
          >
            <span aria-hidden="true">{set.completed ? '✓' : ''}</span>
            {index + 1}세트
            <span className="sr-only"> {status}</span>
            <span aria-hidden="true" className="font-normal">
              {status === '진행 중' ? '· 진행 중' : ''}
            </span>
          </li>
        )
      })}
    </ol>
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

const linkButton = 'mt-1 cursor-pointer text-support font-semibold underline'

/** 저장 중·저장 실패·충돌·탭 복귀·수준 조회 실패 안내. 실제 충돌은 자동으로 합치지 않는다. */
export function StatusBanners({
  snapshot,
  levelFailed,
  canResume,
  actions,
}: {
  snapshot: SessionSnapshot
  levelFailed: boolean
  /** 탭 복귀 안내에서 바로 타이머를 재개할 수 있는지(현재 세트가 시간형이고 막혀 있지 않음). */
  canResume: boolean
  actions: SessionActions
}) {
  const { save, conflict, pausedByHide, restorePending } = snapshot
  return (
    <div className="flex flex-col gap-2 empty:hidden">
      {conflict ? (
        <div role="alert">
          <Banner tone="danger">
            <p>{CONFLICT_TEXT[conflict.kind]}</p>
            {conflict.kind === 'changed' && save.dirty ? (
              <p className="mt-1">
                이 화면에서 입력한 값은 아직 저장되지 않았어요.
              </p>
            ) : null}
            <button
              type="button"
              onClick={actions.requestReload}
              className={linkButton}
            >
              {conflict.kind === 'changed'
                ? '최신 상태 불러오기'
                : '운동 상태 다시 확인'}
            </button>
          </Banner>
        </div>
      ) : save.failed ? (
        <div role="alert">
          <Banner tone="danger">
            <p>
              {save.reason
                ? SAVE_FAILURE_TEXT[save.reason]
                : SAVE_FAILURE_TEXT.error}{' '}
              입력한 내용은 이 화면에 남아 있어요.
            </p>
            {restorePending ? (
              <p className="mt-1">
                타이머를 정지 상태로 불러왔지만 저장하지 못했어요. 저장하기
                전에는 타이머를 시작할 수 없어요.
              </p>
            ) : null}
            {save.fatal ? (
              <button
                type="button"
                onClick={actions.requestReload}
                className={linkButton}
              >
                최신 상태 불러오기
              </button>
            ) : (
              <button
                type="button"
                onClick={actions.retrySave}
                className={linkButton}
              >
                저장 다시 시도
              </button>
            )}
          </Banner>
        </div>
      ) : save.saving ? (
        <p
          role="status"
          aria-live="off"
          className="text-support font-normal text-muted"
        >
          저장 중…
        </p>
      ) : null}
      {pausedByHide && !conflict ? (
        <Banner tone="warning">
          <p>
            다른 화면으로 이동해 타이머를 일시정지했어요. 자동으로 재개하지
            않아요.
          </p>
          {canResume ? (
            <button
              type="button"
              onClick={actions.startTimer}
              className={linkButton}
            >
              타이머 재개
            </button>
          ) : null}
        </Banner>
      ) : null}
      {levelFailed ? (
        <Banner tone="muted">
          운동 수준을 확인하지 못해 간단 입력으로 진행해요. 실제 값은 직접 고칠
          수 있어요.
        </Banner>
      ) : null}
    </div>
  )
}

/** 패널이 열리면 포커스를 안으로 옮겨 보조기기가 읽게 한다. */
function PanelBox({
  titleId,
  children,
}: {
  titleId: string
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
      role="group"
      aria-labelledby={titleId}
      className={`${composeCardActive} outline-none`}
    >
      {children}
    </div>
  )
}

function Title({ children }: { children: ReactNode }) {
  return (
    <h2 id="session-panel-title" className={composeSectionTitle}>
      {children}
    </h2>
  )
}

const bodyCls =
  'mt-2 text-body leading-relaxed font-normal break-keep text-muted'

/** 확인·안내 패널 한 개. */
export function PanelView({
  panel,
  snapshot,
  actions,
}: {
  panel: SessionPanel
  snapshot: SessionSnapshot
  actions: SessionActions
}) {
  const performed = snapshot.session?.performed ?? []
  if (panel.kind === 'abandon') {
    const info = describeAbandon(performed)
    return (
      <PanelBox titleId="session-panel-title">
        <Title>
          {panel.step === 1 ? '운동을 그만둘까요?' : '기록 없이 그만둘까요?'}
        </Title>
        <p className={bodyCls}>
          {info.losesRecord
            ? `완료한 ${info.completedSets}세트는 기록으로 저장되지 않아요. 그만두면 되돌릴 수 없어요. 기록으로 남기려면 그만두는 대신 운동 결과 확인에서 저장해 주세요. 나가기를 누르면 진행 상태를 남겨 두고 이어서 할 수 있어요.`
            : '완료한 세트가 없어 남는 기록은 없어요.'}
          {panel.step === 2 ? ' 이 동작은 되돌릴 수 없어요.' : ''}
        </p>
        {panel.failed ? (
          <p role="alert" className="mt-2 text-support text-danger">
            그만두지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {panel.step === 1 ? (
            <button
              type="button"
              onClick={actions.confirmAbandon}
              className={composeSecondaryButton}
            >
              그만두기 계속
            </button>
          ) : (
            <button
              type="button"
              aria-disabled={panel.busy}
              onClick={() => {
                if (!panel.busy) actions.confirmAbandon()
              }}
              className={dangerButton}
            >
              {panel.busy ? '처리 중…' : '기록 없이 그만두기'}
            </button>
          )}
          <button
            type="button"
            onClick={actions.closePanel}
            className={composePrimaryButton}
          >
            취소하고 계속하기
          </button>
        </div>
      </PanelBox>
    )
  }
  if (panel.kind === 'leave') {
    return (
      <PanelBox titleId="session-panel-title">
        <Title>저장하지 못했어요</Title>
        <p className={bodyCls}>
          지금 나가면 저장되지 않은{' '}
          {panel.unsavedCompletedSets > 0
            ? `완료 ${panel.unsavedCompletedSets}세트와 `
            : ''}
          입력, 측정 시간이 사라질 수 있어요. 다시 시도하거나 머물러 주세요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            aria-disabled={panel.retrying}
            onClick={() => {
              if (!panel.retrying) actions.leaveRetry()
            }}
            className={composePrimaryButton}
          >
            {panel.retrying ? '저장 중…' : '다시 시도'}
          </button>
          <button
            type="button"
            onClick={actions.leaveStay}
            className={composeSecondaryButton}
          >
            머무르기
          </button>
          <button
            type="button"
            onClick={actions.leaveAnyway}
            className={dangerButton}
          >
            그래도 나가기 (저장되지 않은 내용이 사라질 수 있어요)
          </button>
        </div>
      </PanelBox>
    )
  }
  if (panel.kind === 'overrun') {
    return (
      <PanelBox titleId="session-panel-title">
        <Title>측정 시간이 너무 길어요</Title>
        <p className={bodyCls}>
          측정 시간이 {formatClock(Math.floor(panel.measuredMs / 1000))}로 목표(
          {formatTargetSeconds(panel.targetSeconds)})의 5배를 넘었어요. 타이머를
          켠 채 두었거나 기기 시계가 바뀌었을 수 있어요. 이 시간으로 기록할까요?
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={actions.confirmOverrun}
            className={composePrimaryButton}
          >
            이 시간으로 세트 완료
          </button>
          <button
            type="button"
            onClick={actions.closePanel}
            className={composeSecondaryButton}
          >
            취소
          </button>
        </div>
      </PanelBox>
    )
  }
  if (panel.kind === 'discard') {
    return (
      <PanelBox titleId="session-panel-title">
        <Title>측정 중인 시간이 사라져요</Title>
        <p className={bodyCls}>
          {panel.direction === 'next' ? '다음' : '이전'} 운동으로 이동하면 이
          세트에서 측정한 시간은 기록되지 않아요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={actions.confirmDiscard}
            className={composePrimaryButton}
          >
            이동하기
          </button>
          <button
            type="button"
            onClick={actions.closePanel}
            className={composeSecondaryButton}
          >
            취소
          </button>
        </div>
      </PanelBox>
    )
  }
  if (panel.kind === 'result') {
    return (
      <PanelBox titleId="session-panel-title">
        <Title>
          {panel.step === 'confirm'
            ? '측정 중인 시간은 기록되지 않아요'
            : panel.step === 'busy'
              ? '결과로 이동하는 중이에요'
              : '결과 화면으로 이동하지 못했어요'}
        </Title>
        <p
          className={bodyCls}
          role={panel.step === 'failed' ? 'alert' : 'status'}
        >
          {panel.step === 'confirm'
            ? '아직 마치지 않은 세트에서 측정한 시간은 결과에 포함되지 않아요. 타이머를 멈추고 진행 상태를 저장한 뒤 결과를 확인해요.'
            : panel.step === 'busy'
              ? '타이머를 멈추고 진행 상태를 저장하고 있어요…'
              : (panel.reason ?? '잠시 후 다시 시도해 주세요.')}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          {panel.step !== 'busy' ? (
            <button
              type="button"
              onClick={actions.confirmResult}
              className={composePrimaryButton}
            >
              {panel.step === 'confirm' ? '결과 확인으로 이동' : '다시 시도'}
            </button>
          ) : null}
          <button
            type="button"
            aria-disabled={panel.step === 'busy'}
            onClick={() => {
              if (panel.step !== 'busy') actions.closePanel()
            }}
            className={composeSecondaryButton}
          >
            {panel.step === 'failed' ? '머무르기' : '취소'}
          </button>
        </div>
      </PanelBox>
    )
  }
  return (
    <PanelBox titleId="session-panel-title">
      <Title>최신 상태를 불러올까요?</Title>
      <p className={bodyCls}>
        {panel.unsavedCompletedSets > 0
          ? `이 화면에서 완료한 ${panel.unsavedCompletedSets}세트를 포함해 저장되지 않은 입력이 사라져요.`
          : '이 화면에서 저장되지 않은 입력이 사라질 수 있어요.'}{' '}
        불러온 뒤에는 저장소에 있는 상태에서 이어서 진행해요.
      </p>
      <div className="mt-4 flex flex-col gap-2">
        <button
          type="button"
          onClick={actions.confirmReload}
          className={dangerButton}
        >
          입력을 버리고 최신 상태 불러오기
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

/**
 * 모든 세트를 마쳤을 때의 안내. 이 화면은 기록을 만들지 않는다(complete는 W15가 호출한다). 결과 확인으로 이동해 저장한다.
 */
export function CompletionNotice({
  actions,
  blocked,
}: {
  actions: SessionActions
  /** 충돌·저장 불가 상태라 결과로 이동할 수 없다. */
  blocked: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="status"
      className={`${composeCard} outline-none`}
    >
      <h2 className={composeSectionTitle}>모든 세트를 마쳤어요</h2>
      <p className={bodyCls}>
        진행 상태와 완료한 세트는 저장돼 있어요. 운동 결과를 확인하고 저장하면
        운동 기록으로 남아요.
      </p>
      <button
        type="button"
        aria-disabled={blocked}
        onClick={() => {
          if (!blocked) actions.openResult()
        }}
        className={`${composePrimaryButton} mt-4 aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted`}
      >
        운동 결과 확인
      </button>
      <button
        type="button"
        onClick={actions.leave}
        className={`${composeSecondaryButton} mt-2 w-full`}
      >
        운동 기록으로 돌아가기
      </button>
    </div>
  )
}
