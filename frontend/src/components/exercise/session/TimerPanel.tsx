import type { SessionTimer } from '../../../exercise/workoutTypes.ts'
import { timerLabel, timerView } from '../../../exercise/workoutProgress.ts'
import { formatTargetSeconds } from '../../../exercise/workoutListView.ts'
import {
  composeFocusRing,
  composePrimaryButton,
  composeSecondaryButton,
} from '../compose/composeStyles.ts'

const RADIUS = 52
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const disabledCls =
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:opacity-50'

/**
 * 시간형 세트의 원형 카운트다운. 남은 시간은 실제 경과 시간(시각 차이)으로 계산하고 일시정지 시간은 빠진다.
 * 목표에 도달해도 자동으로 완료하지 않고 계속 측정하며 "+m:ss"로 초과를 알린다. 숫자는 글자로도 읽을 수 있고(role="timer",
 * 초마다 읽지 않도록 aria-live는 끈다) 색만으로 상태를 전하지 않는다.
 */
export default function TimerPanel({
  timer,
  targetSeconds,
  now,
  blockedReason,
  onStart,
  onPause,
}: {
  timer: SessionTimer
  targetSeconds: number
  now: Date
  /** 시작·재개를 막는 이유(복원 저장 전·충돌 등). 없으면 null. */
  blockedReason: string | null
  onStart: () => void
  onPause: () => void
}) {
  const view = timerView(timer, targetSeconds, now)
  const label = timerLabel(view)
  const offset = CIRCUMFERENCE * (1 - view.fraction)
  const reached = view.reachedTarget
  const stateText =
    view.state === 'idle'
      ? '대기 중'
      : view.state === 'running'
        ? '측정 중'
        : '일시정지됨'
  const startBlocked = blockedReason !== null
  return (
    <div className="flex flex-col items-center">
      <div
        role="timer"
        aria-live="off"
        aria-label={`${label.overrun ? `목표 시간 초과 ${label.text}` : `남은 시간 ${label.text}`}, ${stateText}`}
        className="relative size-52"
      >
        <svg
          viewBox="0 0 120 120"
          className="size-full -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            className="stroke-line"
          />
          <circle
            cx="60"
            cy="60"
            r={RADIUS}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={offset}
            className={`transition-[stroke-dashoffset] duration-200 ease-linear motion-reduce:transition-none ${reached ? 'stroke-warning' : 'stroke-exercise'}`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className={`text-metric leading-none font-semibold tabular-nums ${label.overrun ? 'text-warning' : 'text-content'}`}
          >
            {label.text}
          </span>
          <span className="mt-2 text-support font-normal text-muted">
            {stateText}
          </span>
        </div>
      </div>
      <p className="mt-3 text-support font-normal text-muted">
        목표 {formatTargetSeconds(targetSeconds)}
        {reached
          ? label.overrun
            ? ' · 목표를 넘겼어요'
            : ' · 목표에 도달했어요'
          : ''}
      </p>
      <div className="mt-3 flex w-full gap-2">
        {view.state === 'running' ? (
          <button
            type="button"
            onClick={onPause}
            className={`${composeSecondaryButton} flex-1`}
          >
            일시정지
          </button>
        ) : (
          <button
            type="button"
            aria-disabled={startBlocked}
            aria-describedby={startBlocked ? 'timer-blocked-note' : undefined}
            onClick={() => {
              if (!startBlocked) onStart()
            }}
            className={`${composePrimaryButton} flex-1 ${disabledCls} ${composeFocusRing}`}
          >
            {view.state === 'paused' ? '재개' : '시작'}
          </button>
        )}
      </div>
      {startBlocked ? (
        <p
          id="timer-blocked-note"
          className="mt-2 text-support leading-relaxed font-normal text-muted"
        >
          {blockedReason}
        </p>
      ) : null}
    </div>
  )
}
