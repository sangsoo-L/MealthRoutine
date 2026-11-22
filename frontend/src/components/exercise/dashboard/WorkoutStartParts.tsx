import { useEffect, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { startedOnLabel } from '../../../exercise/startWorkout.ts'
import Icon from '../../icons/Icon.tsx'
import type {
  StartControls,
  StartError,
  StartPanel,
} from '../../../exercise/useWorkoutStart.ts'
import {
  composeCard,
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import {
  DashboardSection,
  PendingButton,
  dashboardFocusRing,
} from './DashboardParts.tsx'

const dangerButton = `flex min-h-12 w-full cursor-pointer items-center justify-center rounded-control bg-danger px-4 text-body font-semibold text-surface hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ${dashboardFocusRing}`
const primaryDisabled =
  'aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100'

const ERROR_TEXT: Record<StartError, string> = {
  start: '운동을 시작하지 못했어요. 잠시 후 다시 시도해 주세요.',
  abandon: '그만두지 못했어요. 잠시 후 다시 시도해 주세요.',
  changed:
    '다른 곳에서 운동이 바뀌어 상태를 다시 확인했어요. 확인한 뒤 다시 시도해 주세요.',
  dateChanged:
    '날짜가 바뀌어 오늘의 목록을 다시 확인하고 있어요. 새 목록이 있으면 다시 시작해 주세요.',
}

/** 복합 기록 방식이 포함된 목록은 진행 기능이 준비될 때까지 시작할 수 없다. */
export const UNSUPPORTED_START_TEXT =
  '이 운동 목록에는 아직 진행 기능이 준비되지 않은 기록 방식이 포함되어 있어요. 해당 방식의 운동 진행 기능이 적용된 후 시작할 수 있어요.'

function progressText(completed: number, total: number): string {
  return `완료 ${completed} / ${total}세트`
}

/** 패널이 열리면 포커스를 안으로 옮겨 보조기기가 읽게 한다(닫으면 호출한 쪽 영역이 다시 그려진다). */
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
      className={`${composeCardActive} mt-3 outline-none`}
    >
      {children}
    </div>
  )
}

/**
 * 충돌(다른 목록의 진행 중 세션)과 그만두기 확인 패널. 그만두기는 2단계 확인이고, 완료한 세트가 있으면 기록으로 남지 않는다는 점을
 * 먼저 알린다(그만두면 기록이 남지 않고 되돌릴 수 없다. 기록으로 남기려면 이어서 운동한 뒤 W15에서 저장한다).
 */
export function StartPanelView({
  panel,
  controls,
}: {
  panel: StartPanel
  controls: StartControls
}) {
  const active = controls.active
  if (!active) return null
  const lost = active.completedSets
  if (panel.kind === 'conflict') {
    return (
      <PanelBox titleId="start-panel-title">
        <h3 id="start-panel-title" className={composeSectionTitle}>
          진행 중인 다른 운동이 있어요
        </h3>
        <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
          {progressText(active.completedSets, active.totalSets)}까지 진행한
          운동이 있어요. 이어서 하거나, 그만두고 이 목록으로 새로 시작할 수
          있어요.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={controls.resume}
            className={composePrimaryButton}
          >
            진행 중인 운동 이어서 하기
          </button>
          <button
            type="button"
            onClick={controls.chooseAbandonAndStart}
            className={composeSecondaryButton}
          >
            그만두고 이 목록으로 새로 시작
          </button>
          <button
            type="button"
            onClick={controls.closePanel}
            className={composeSecondaryButton}
          >
            취소
          </button>
        </div>
      </PanelBox>
    )
  }
  return (
    <PanelBox titleId="start-panel-title">
      <h3 id="start-panel-title" className={composeSectionTitle}>
        {panel.step === 1
          ? '진행 중인 운동을 그만둘까요?'
          : '기록 없이 그만둘까요?'}
      </h3>
      <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
        {lost > 0
          ? `완료한 ${lost}세트는 기록으로 저장되지 않아요. 기록으로 남기려면 이어서 운동한 뒤 결과를 확인해 저장해 주세요. 그만두면 되돌릴 수 없어요.`
          : '완료한 세트가 없어 남는 기록은 없어요.'}
        {panel.step === 2
          ? panel.thenStart
            ? ' 그만둔 뒤 이 목록으로 새로 시작해요.'
            : ' 이 동작은 되돌릴 수 없어요.'
          : ''}
      </p>
      <div className="mt-4 flex flex-col gap-2">
        {panel.step === 1 ? (
          <button
            type="button"
            onClick={controls.confirmAbandon}
            className={composeSecondaryButton}
          >
            그만두기 계속
          </button>
        ) : (
          <button
            type="button"
            aria-disabled={controls.busy}
            onClick={() => {
              if (!controls.busy) controls.confirmAbandon()
            }}
            className={dangerButton}
          >
            {controls.busy ? '처리 중…' : '기록 없이 그만두기'}
          </button>
        )}
        <button
          type="button"
          onClick={controls.closePanel}
          className={composePrimaryButton}
        >
          취소하고 계속하기
        </button>
      </div>
    </PanelBox>
  )
}

/** 진행 중인 운동 영역: 오늘의 운동 목록과 별개로, 진행 중인 세션이 있으면 이어하기·그만두기를 보여 준다. */
export function ActiveSessionCard({ controls }: { controls: StartControls }) {
  const active = controls.active
  if (controls.status !== 'ready' || !active) return null
  const label = startedOnLabel(active)
  const panel = controls.panel
  return (
    <DashboardSection labelId="dashboard-active-title">
      <h2
        id="dashboard-active-title"
        className="mb-3 text-section-title leading-snug font-semibold text-content"
      >
        진행 중인 운동
      </h2>
      <div className={composeCard}>
        <p className="text-body leading-snug font-semibold text-content">
          {progressText(active.completedSets, active.totalSets)}
        </p>
        {label ? (
          <p className="mt-1 text-support leading-relaxed font-normal text-warning">
            {label}. 이어서 하거나 그만둘 수 있어요.
          </p>
        ) : (
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            이어서 운동을 계속할 수 있어요.
          </p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={controls.resume}
            className={composePrimaryButton}
          >
            이어서 운동하기
          </button>
          <button
            type="button"
            onClick={() => controls.openAbandon('card')}
            className={composeSecondaryButton}
          >
            그만두기
          </button>
        </div>
        {controls.error && panel?.origin !== 'card' ? (
          <p role="alert" className="mt-3 text-support text-danger">
            {ERROR_TEXT[controls.error]}
          </p>
        ) : null}
        {panel && panel.origin === 'card' ? (
          <StartPanelView panel={panel} controls={controls} />
        ) : null}
      </div>
    </DashboardSection>
  )
}

/**
 * 오늘의 운동 카드의 시작 영역. 상태에 따라 시작·이어하기·충돌 패널·완료 안내를 보여 준다.
 * 저장소가 없으면(운영 빌드) 이 컴포넌트를 쓰지 않고 호출한 쪽이 기존 "준비 중" 버튼을 유지한다.
 */
export function StartAction({
  controls,
  recordPath,
  recordFrom,
  activeCardAbove = false,
}: {
  controls: StartControls
  /** 마친 목록의 저장된 완료 기록 상세(W15 읽기 전용) 경로. 있을 때만 완료 안내 아래에 "운동 기록 자세히 보기"를 보인다. */
  recordPath?: string | null
  /** 주면 W15로 이동할 때 이 경로를 `state.from`으로 넘겨 W15의 "이전"이 그 화면(W10)으로 돌아오게 한다. 없으면 기존 동작(W01)이다. */
  recordFrom?: string
  /**
   * true이면(W01) 진행 중인 운동 카드(ActiveSessionCard)가 바로 위에 있어 그 카드의 "이어서 운동하기"가 주요 행동이다.
   * 같은 이어하기 버튼을 반복하지 않고 안내만 두며, 다른 목록과 충돌할 때의 시작 버튼은 보조 모양으로 낮춘다.
   * 완료한 목록은 비활성 버튼 대신 완료 문장과 실제 기록 확인 링크(주요 행동)로 보인다. 판정(decideStart)과 동작은 그대로다.
   * 기본값 false(W10)는 기존 모양이다.
   */
  activeCardAbove?: boolean
}) {
  const { status, decision, busy } = controls
  const panel = controls.panel
  if (status === 'loading') {
    return (
      <p role="status" className="text-support font-normal text-muted">
        운동 시작 정보를 확인하는 중이에요…
      </p>
    )
  }
  if (status === 'error') {
    return (
      <div role="alert">
        <p className="text-support leading-relaxed font-normal text-danger">
          운동 시작 정보를 확인하지 못했어요.
        </p>
        <button
          type="button"
          onClick={(event) => {
            // 다시 불러오는 동안 이 버튼이 사라지므로 포커스를 감싼 영역(tabIndex=-1)으로 먼저 옮긴다(body로 빠지지 않게).
            event.currentTarget.closest<HTMLElement>('section')?.focus()
            controls.reload()
          }}
          className={`mt-2 ${composeSecondaryButton} w-full`}
        >
          다시 시도
        </button>
      </div>
    )
  }
  if (status === 'corrupt') {
    return (
      <p
        role="alert"
        className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal text-danger"
      >
        진행 중인 운동의 저장 데이터를 읽을 수 없어 시작할 수 없어요. 데이터는
        지우지 않았어요.
      </p>
    )
  }
  if (!decision || decision.kind === 'notToday') return null
  if (decision.kind === 'unsupported') {
    return (
      <div>
        <button
          type="button"
          aria-disabled="true"
          aria-describedby="start-unsupported-note"
          className={`${composePrimaryButton} aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted aria-disabled:hover:opacity-100`}
        >
          이 목록으로 바로 운동 시작
        </button>
        <p
          id="start-unsupported-note"
          role="note"
          className="mt-2 text-support leading-relaxed font-normal text-muted"
        >
          {UNSUPPORTED_START_TEXT}
        </p>
      </div>
    )
  }
  if (decision.kind === 'done' && activeCardAbove) {
    return (
      <div>
        <p
          role="status"
          className="flex items-start gap-2 rounded-control bg-exercise-soft px-3 py-2 text-body leading-relaxed font-normal break-keep text-content"
        >
          <Icon
            name="clipboard-check"
            size={20}
            className="mt-0.5 shrink-0 text-exercise"
          />
          <span>
            오늘 이 목록으로 운동을 마쳤어요. 같은 목록은 다시 시작하지 않아요.
          </span>
        </p>
        {recordPath ? (
          <Link
            to={recordPath}
            state={recordFrom ? { from: recordFrom } : undefined}
            className={`mt-3 ${composePrimaryButton}`}
          >
            운동 기록 자세히 보기
          </Link>
        ) : null}
      </div>
    )
  }
  if (decision.kind === 'resume' && activeCardAbove) {
    return (
      <p
        role="note"
        className="rounded-control bg-exercise-soft px-3 py-2 text-body leading-relaxed font-normal break-keep text-content"
      >
        이 목록으로 운동하는 중이에요. 위의 진행 중인 운동에서 이어서 할 수
        있어요.
      </p>
    )
  }
  if (decision.kind === 'done') {
    return (
      <div>
        <PendingButton describedBy="start-done-note" showSuffix={false}>
          오늘 운동을 마쳤어요
        </PendingButton>
        <p
          id="start-done-note"
          className="mt-2 text-support leading-relaxed font-normal text-muted"
        >
          오늘 이 목록으로 이미 운동을 마쳤어요. 같은 목록은 다시 시작하지
          않아요.
        </p>
        {recordPath ? (
          <Link
            to={recordPath}
            state={recordFrom ? { from: recordFrom } : undefined}
            className={`mt-3 ${composeSecondaryButton} w-full`}
          >
            운동 기록 자세히 보기
          </Link>
        ) : null}
      </div>
    )
  }
  const label =
    decision.kind === 'resume'
      ? '이어서 운동하기'
      : '이 목록으로 바로 운동 시작'
  return (
    <div>
      <button
        type="button"
        aria-disabled={busy}
        onClick={() => {
          if (!busy) controls.start()
        }}
        className={
          // 충돌이면 위 진행 중인 운동의 이어하기가 주요 행동이라 시작은 보조 모양으로 둔다(W01). 누르면 기존처럼 충돌 패널이 열린다.
          activeCardAbove && decision.kind === 'conflict'
            ? `${composeSecondaryButton} w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-60`
            : `${composePrimaryButton} ${primaryDisabled}`
        }
      >
        {busy
          ? activeCardAbove && decision.kind === 'conflict'
            ? '처리 중…'
            : '시작하는 중…'
          : label}
      </button>
      {decision.kind === 'conflict' && !panel ? (
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          진행 중인 다른 운동이 있어요. 시작하면 이어할지 그만둘지 고를 수
          있어요.
        </p>
      ) : null}
      {/* W01에서 진행 중인 운동 카드가 위에 있으면 오류는 그 카드가 이미 알린다(같은 문장을 두 번 읽지 않게). */}
      {controls.error &&
      panel?.origin !== 'today' &&
      !(activeCardAbove && controls.status === 'ready' && controls.active) ? (
        <p
          role="alert"
          className="mt-2 text-support leading-relaxed text-danger"
        >
          {ERROR_TEXT[controls.error]}
        </p>
      ) : null}
      {panel && panel.origin === 'today' ? (
        <StartPanelView panel={panel} controls={controls} />
      ) : null}
    </div>
  )
}
