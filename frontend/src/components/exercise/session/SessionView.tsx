import { useEffect, useRef } from 'react'
import { RECORD_COMPONENTS } from '../../../exercise/recordMode.ts'
import {
  RECORD_TYPE_LABEL,
  type RecordType,
} from '../../../exercise/workoutDraftTypes.ts'
import {
  adjacentExercise,
  allSetsCompleted,
  type InputMode,
} from '../../../exercise/workoutProgress.ts'
import {
  formatClock,
  formatTargetSeconds,
} from '../../../exercise/workoutListView.ts'
import type { SessionSnapshot } from '../../../exercise/workoutSessionController.ts'
import {
  composeCard,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import SetEntryForm from './SetEntryForm.tsx'
import {
  CompletionNotice,
  PanelView,
  SessionHeader,
  SetChips,
  StatusBanners,
} from './SessionParts.tsx'
import type { SessionActions, SessionPanel } from './sessionTypes.ts'
import TimerPanel from './TimerPanel.tsx'

const navButton =
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-line'

/** 완료한 세트에서 실제로 기록된 값 문구. 방식의 구성값 순서(횟수·중량·시간)로 보인다. 옛 기록의 빠진 값은 미입력·미측정으로 알린다. */
function actualText(
  recordType: RecordType,
  set: { actualReps?: number; actualWeightKg?: number; measuredMs?: number },
): string {
  const parts = RECORD_COMPONENTS[recordType]
  const texts: string[] = []
  if (parts.reps && set.actualReps !== undefined)
    texts.push(`실제 ${set.actualReps}회`)
  if (parts.weight)
    texts.push(
      set.actualWeightKg === undefined
        ? '중량 미입력'
        : `${set.actualWeightKg}kg`,
    )
  if (parts.time)
    texts.push(
      set.measuredMs === undefined
        ? '측정 시간 없이 완료했어요(미측정)'
        : `측정 ${formatClock(Math.round(set.measuredMs / 1000))}`,
    )
  return texts.join(' · ')
}

/**
 * W14 운동 진행 화면의 표시(저장소·라우터와 무관, props만 받는다). 화면명세 W14-1(중량형)·W14-2(횟수형)·W14-3(시간형)을 한 화면이 현재 세트의
 * 기록 방식에 따라 입력부만 바꿔 그린다.
 *
 * - 목표(목표 횟수·중량·시간)와 실제 값을 구분하고, 완료한 세트는 읽기 전용이다(되돌리기는 방금 완료한 세트 하나만).
 * - 모든 세트를 마치거나 완료 세트가 있으면 "운동 결과 확인"으로 W15로 이동한다. W14는 기록을 만들지 않는다(최종 저장은 W15가 한다).
 */
export default function SessionView({
  snapshot,
  mode,
  levelFailed,
  now,
  lastCompleted,
  panel,
  message,
  completeError,
  actions,
}: {
  snapshot: SessionSnapshot
  mode: InputMode
  levelFailed: boolean
  now: Date
  lastCompleted: { itemIndex: number; setIndex: number } | null
  panel: SessionPanel | null
  /** 보조기기에 읽어 줄 짧은 진행 안내(세트 완료·타이머 상태 변화). */
  message: string | null
  /** 직전 세트 완료 시도가 막힌 이유(미측정·누락 등). 입력 위치 근처에 글자로 보인다. */
  completeError?: string | null
  actions: SessionActions
}) {
  const session = snapshot.session
  const headingRef = useRef<HTMLHeadingElement>(null)
  const firstRender = useRef(true)
  const cursorKey = session
    ? `${session.cursor.itemIndex}-${session.cursor.setIndex}`
    : ''
  const doneCount = session
    ? session.performed.reduce(
        (sum, sets) => sum + sets.filter((set) => set.completed).length,
        0,
      )
    : 0
  // 세트를 완료하거나 다른 운동으로 이동하면 현재 세트 제목으로 포커스를 옮긴다(완료한 버튼이 바뀌어도 포커스가 문서 처음으로 빠지지 않게).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    headingRef.current?.focus()
  }, [cursorKey, doneCount])

  if (!session) return null
  const { itemIndex, setIndex } = session.cursor
  const item = session.listSnapshot.items[itemIndex]
  const target = item.sets[setIndex]
  const parts = RECORD_COMPONENTS[item.recordType]
  const targetSeconds = (target as { targetSeconds?: number }).targetSeconds
  const performedSet = session.performed[itemIndex][setIndex]
  const allDone = allSetsCompleted(session.performed)
  const blocked = snapshot.conflict !== null || snapshot.save.fatal
  const timerIdle =
    session.timer.accumulatedMs === 0 && session.timer.runningSince === null
  const previous = adjacentExercise(
    session.performed,
    session.cursor,
    'previous',
  )
  const next = adjacentExercise(session.performed, session.cursor, 'next')
  const undoable =
    lastCompleted !== null &&
    session.performed[lastCompleted.itemIndex]?.[lastCompleted.setIndex]
      ?.completed === true &&
    !blocked
  const timeBlockedReason = snapshot.conflict
    ? '충돌 상태라 타이머를 시작할 수 없어요. 최신 상태를 불러와 주세요.'
    : snapshot.save.fatal
      ? '저장할 수 없는 값이 있어 타이머를 시작할 수 없어요.'
      : snapshot.restorePending
        ? '저장된 타이머를 정지 상태로 불러오고 있어요. 저장이 끝나면 시작할 수 있어요.'
        : null
  const canResume =
    parts.time && !performedSet.completed && timeBlockedReason === null

  return (
    <div className="flex min-w-0 flex-col gap-5 break-keep wrap-anywhere">
      <SessionHeader snapshot={snapshot} />

      {/* 세트 완료·타이머 상태 변화를 보조기기에 알린다(매초 읽지 않는다). */}
      <div aria-live="polite" className="sr-only">
        {message}
      </div>

      <StatusBanners
        snapshot={snapshot}
        levelFailed={levelFailed}
        canResume={canResume}
        actions={actions}
      />

      {panel ? (
        <PanelView panel={panel} snapshot={snapshot} actions={actions} />
      ) : null}

      {allDone ? (
        <CompletionNotice actions={actions} blocked={blocked} />
      ) : null}

      <section
        aria-labelledby="session-current-heading"
        className={composeCard}
      >
        <div className="flex items-start justify-between gap-3">
          <h2
            id="session-current-heading"
            ref={headingRef}
            tabIndex={-1}
            className={`${composeSectionTitle} min-w-0 outline-none`}
          >
            {item.exerciseNameSnapshot}
          </h2>
          <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-semibold text-exercise">
            {RECORD_TYPE_LABEL[item.recordType]}
          </span>
        </div>
        <SetChips snapshot={snapshot} />

        <div className="mt-5">
          {performedSet.completed ? (
            <div
              role="status"
              className="rounded-control bg-page px-3 py-4 text-center"
            >
              <p className="text-body font-semibold text-content">
                {setIndex + 1}세트를 완료했어요
              </p>
              <p className="mt-1 text-support font-normal text-muted">
                {actualText(item.recordType, performedSet)}
              </p>
            </div>
          ) : parts.time ? (
            <>
              <TimerPanel
                timer={session.timer}
                targetSeconds={targetSeconds as number}
                now={now}
                blockedReason={timeBlockedReason}
                onStart={actions.startTimer}
                onPause={actions.pauseTimer}
              />
              {parts.reps || parts.weight ? (
                <SetEntryForm
                  key={cursorKey}
                  parts={parts}
                  mode={mode}
                  target={target as { reps?: number; weightKg?: number }}
                  blocked={blocked}
                  completeError={completeError}
                  onComplete={actions.complete}
                />
              ) : (
                <>
                  {completeError ? (
                    <p role="alert" className="mt-3 text-support text-danger">
                      {completeError}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    aria-disabled={blocked}
                    onClick={() => {
                      if (!blocked) actions.complete(undefined)
                    }}
                    className={`${composePrimaryButton} mt-4 aria-disabled:cursor-not-allowed aria-disabled:bg-line aria-disabled:text-muted`}
                  >
                    세트 완료
                  </button>
                </>
              )}
              <p className="mt-2 text-center text-support leading-relaxed font-normal text-muted">
                {timerIdle
                  ? '타이머로 시간을 측정해야 세트를 완료할 수 있어요.'
                  : `완료할 때의 실제 경과 시간이 기록돼요. 목표 ${formatTargetSeconds(targetSeconds as number)}에 도달해도 자동으로 완료하지 않아요.`}
              </p>
            </>
          ) : (
            <SetEntryForm
              key={cursorKey}
              parts={parts}
              mode={mode}
              target={target as { reps?: number; weightKg?: number }}
              blocked={blocked}
              completeError={completeError}
              onComplete={actions.complete}
            />
          )}
        </div>

        {undoable ? (
          <button
            type="button"
            onClick={actions.undo}
            className={`${composeSecondaryButton} mt-4 w-full`}
          >
            방금 완료한 세트 되돌리기
          </button>
        ) : null}
      </section>

      <nav aria-label="운동 이동" className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-disabled={previous === null || blocked}
          onClick={() => {
            if (previous !== null && !blocked) actions.requestMove('previous')
          }}
          className={`${composeSecondaryButton} ${navButton}`}
        >
          이전 운동
        </button>
        <button
          type="button"
          aria-disabled={next === null || blocked}
          onClick={() => {
            if (next !== null && !blocked) actions.requestMove('next')
          }}
          className={`${composeSecondaryButton} ${navButton}`}
        >
          다음 운동
        </button>
      </nav>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={actions.leave}
          className={composeSecondaryButton}
        >
          나가기
        </button>
        {doneCount > 0 && !allDone ? (
          <div>
            <button
              type="button"
              aria-disabled={blocked}
              aria-describedby="session-end-note"
              onClick={() => {
                if (!blocked) actions.openResult()
              }}
              className={`${composeSecondaryButton} w-full aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-surface`}
            >
              운동 결과 확인
            </button>
            <p
              id="session-end-note"
              className="mt-2 text-support leading-relaxed font-normal text-muted"
            >
              {blocked
                ? '충돌 상태라 결과를 확인할 수 없어요. 최신 상태를 불러와 주세요.'
                : '여기까지 완료한 세트의 결과를 확인하고 저장할 수 있어요.'}
            </p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={actions.openAbandon}
          className="flex min-h-11 cursor-pointer items-center justify-center rounded-control px-4 text-body font-normal text-danger hover:bg-danger-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-danger"
        >
          그만두기
        </button>
      </div>
    </div>
  )
}
