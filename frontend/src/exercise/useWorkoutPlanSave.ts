import { useCallback, useEffect, useRef, useState } from 'react'
import {
  saveWorkoutPlan,
  type PlanSaveFailureReason,
  type SaveWorkoutPlanDeps,
} from './saveWorkoutPlan.ts'
import type { RecordType, WorkoutDraft } from './workoutDraftTypes.ts'
import { toLocalDate } from './workoutModel.ts'
import { tomorrowOf, type WorkoutPlan } from './workoutPlanModel.ts'
import type { LocalDate } from './workoutTypes.ts'

export type PlanSaveStatus = 'idle' | 'saving' | 'saved'

/** 저장을 멈추고 사용자의 확인을 기다리는 패널(날짜 변경·기존 계획 교체). */
export type PlanSavePanel =
  | { kind: 'date'; from: LocalDate; to: LocalDate }
  | { kind: 'replace'; existing: WorkoutPlan }

export type PlanSaveError =
  | { kind: 'failed'; stage: 'read' | 'save'; reason: PlanSaveFailureReason }
  | { kind: 'invalid' }

/** 패널·오류가 어느 초안 버전에 대한 것인지. 초안이 바뀌면 지난 패널·오류는 쓰지 않는다. */
interface View {
  at: string
  panel: PlanSavePanel | null
  error: PlanSaveError | null
}

export interface WorkoutPlanSave {
  status: PlanSaveStatus
  panel: PlanSavePanel | null
  error: PlanSaveError | null
  /** 사용자가 알고 저장하기로 한 계획 날짜. W11을 연 시점의 내일에서 시작하고 날짜 확인에서만 바뀐다. */
  planDate: LocalDate
  save: () => void
  confirmDate: () => void
  confirmReplace: () => void
  cancelPanel: () => void
}

/**
 * W11(day=tomorrow)의 저장 상태와 동작. 절차 자체는 saveWorkoutPlan(순수 함수)이 하고 이 훅은 화면 상태만 가진다.
 *
 * - 저장 중에는 다시 시작하지 않는다(렌더링을 기다리지 않는 ref로 막아 연타·더블 클릭이 두 번 실행되지 않는다).
 * - 날짜 확인·교체 확인은 패널로 멈춘다. 확인하기 전에는 저장하지 않으며, 확인 뒤에도 절차를 처음부터 다시 검증한다.
 * - 성공(저장함 또는 같은 구성이 이미 저장됨)해야만 초안을 비우고 onSaved를 부른다. 실패에서는 초안을 그대로 둔다.
 * - 저장 뒤 초안은 "저장한 버전과 같을 때만" 비운다(clearSaved).
 */
export function useWorkoutPlanSave(args: {
  repository: SaveWorkoutPlanDeps['planRepository'] | null
  draft: WorkoutDraft
  /** 운동 정보를 읽을 수 있을 때의 운동 id 모음. 아직 읽지 못했으면 null(저장하지 않는다). */
  known: ReadonlySet<string> | null
  /** 운동 id별 허용 기록 방식(저장 직전 재검증). 없으면 확인하지 않는다. */
  allowed?: ReadonlyMap<string, readonly RecordType[]>
  clearSaved: (expectedUpdatedAt: string) => void
  onSaved: (kind: 'saved' | 'replaced' | 'same') => void
}): WorkoutPlanSave {
  const { repository, draft, known, allowed, clearSaved, onSaved } = args
  const [status, setStatus] = useState<PlanSaveStatus>('idle')
  const [view, setView] = useState<View | null>(null)
  const [planDate, setPlanDate] = useState<LocalDate>(() =>
    tomorrowOf(toLocalDate(new Date())),
  )
  const inFlight = useRef(false)
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const run = useCallback(
    async (date: LocalDate, replacePlanId: string | null) => {
      if (inFlight.current || !repository || !known) return
      inFlight.current = true
      const snapshot = draftRef.current
      const at = snapshot.updatedAt
      setStatus('saving')
      setView(null)
      let outcome
      try {
        outcome = await saveWorkoutPlan(
          { planRepository: repository, now: () => new Date() },
          {
            draft: snapshot,
            knownExerciseIds: known,
            allowedRecordTypes: allowed,
            planDate: date,
            confirmedReplacePlanId: replacePlanId,
          },
        )
      } catch {
        // 절차는 오류를 결과로 돌려주도록 만들었다. 그래도 예기치 못한 예외가 나면 저장되지 않은 것으로 안내한다.
        outcome = {
          kind: 'failed' as const,
          stage: 'save' as const,
          reason: 'error' as const,
        }
      } finally {
        inFlight.current = false
      }
      switch (outcome.kind) {
        case 'saved':
        case 'alreadySaved':
          setStatus('saved')
          clearSaved(at)
          onSaved(
            outcome.kind === 'alreadySaved'
              ? 'same'
              : outcome.replaced
                ? 'replaced'
                : 'saved',
          )
          return
        case 'dateChanged':
          setStatus('idle')
          setView({
            at,
            panel: { kind: 'date', from: outcome.from, to: outcome.to },
            error: null,
          })
          return
        case 'replaceConfirm':
          setStatus('idle')
          setView({
            at,
            panel: { kind: 'replace', existing: outcome.existing },
            error: null,
          })
          return
        case 'invalid':
          setStatus('idle')
          setView({ at, panel: null, error: { kind: 'invalid' } })
          return
        case 'failed':
          setStatus('idle')
          setView({
            at,
            panel: null,
            error: {
              kind: 'failed',
              stage: outcome.stage,
              reason: outcome.reason,
            },
          })
      }
    },
    [repository, known, allowed, clearSaved, onSaved],
  )

  const current = view && view.at === draft.updatedAt ? view : null
  const panel = current?.panel ?? null

  const save = useCallback(() => {
    void run(planDate, null)
  }, [run, planDate])

  const confirmDate = useCallback(() => {
    if (panel?.kind !== 'date') return
    setPlanDate(panel.to)
    void run(panel.to, null)
  }, [panel, run])

  const confirmReplace = useCallback(() => {
    if (panel?.kind !== 'replace') return
    void run(planDate, panel.existing.id)
  }, [panel, run, planDate])

  const cancelPanel = useCallback(() => {
    setView((prev) => (prev ? { ...prev, panel: null } : prev))
  }, [])

  return {
    status,
    panel,
    error: current?.error ?? null,
    planDate,
    save,
    confirmDate,
    confirmReplace,
    cancelPanel,
  }
}
