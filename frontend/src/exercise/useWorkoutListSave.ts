import { useCallback, useEffect, useRef, useState } from 'react'
import {
  saveWorkoutList,
  type SaveFailureReason,
  type SaveWorkoutListDeps,
} from './saveWorkoutList.ts'
import type { RecordType, WorkoutDraft } from './workoutDraftTypes.ts'
import type { LocalDate, WorkoutList } from './workoutTypes.ts'
import { toLocalDate } from './workoutModel.ts'

export type SaveStatus = 'idle' | 'saving' | 'saved'

/** 저장을 멈추고 사용자의 확인을 기다리는 패널. */
export type SavePanel =
  | { kind: 'date'; from: LocalDate; to: LocalDate }
  | { kind: 'replace'; existing: WorkoutList }

export type SaveError =
  | { kind: 'failed'; stage: 'read' | 'save'; reason: SaveFailureReason }
  /** 저장은 됐지만 확인한 날짜와 다른 날짜의 목록이 됐다. 초안은 남아 있다. */
  | { kind: 'dateMismatch'; expected: LocalDate; actual: LocalDate }
  | { kind: 'invalid' }

/** 패널·오류가 어느 초안 버전에 대한 것인지. 초안이 바뀌면 지난 패널·오류는 쓰지 않는다. */
interface View {
  at: string
  panel: SavePanel | null
  error: SaveError | null
}

export interface WorkoutListSave {
  status: SaveStatus
  panel: SavePanel | null
  error: SaveError | null
  /** 사용자가 알고 저장하기로 한 날짜. W11을 연 날짜에서 시작하고 날짜 확인에서만 바뀐다. */
  acknowledgedDate: LocalDate
  save: () => void
  confirmDate: () => void
  confirmReplace: () => void
  cancelPanel: () => void
}

/**
 * W11의 저장 상태와 동작. 절차 자체는 saveWorkoutList(순수 함수)가 하고 이 훅은 화면 상태만 가진다.
 *
 * - 저장 중에는 다시 시작하지 않는다(렌더링을 기다리지 않는 ref로 막아 연타·더블 클릭이 두 번 실행되지 않는다).
 * - 날짜 확인·교체 확인은 패널로 멈춘다. 확인하기 전에는 저장하지 않으며, 확인 뒤에도 절차를 처음부터 다시 검증한다.
 * - 성공(저장함 또는 같은 구성이 이미 오늘의 목록)해야만 초안을 비우고 onSaved를 부른다. 실패·날짜 불일치에서는 초안을 그대로 둔다.
 * - 저장 뒤 초안은 "저장한 버전과 같을 때만" 비운다(clearSaved).
 * - 저장 직전 시도의 초안은 시작할 때 한 번 잡은 값만 쓴다.
 */
export function useWorkoutListSave(args: {
  repository: SaveWorkoutListDeps['listRepository'] | null
  draft: WorkoutDraft
  /** 운동 정보를 읽을 수 있을 때의 운동 id 모음. 아직 읽지 못했으면 null(저장하지 않는다). */
  known: ReadonlySet<string> | null
  /** 운동 id별 허용 기록 방식(저장 직전 재검증). 없으면 확인하지 않는다. */
  allowed?: ReadonlyMap<string, readonly RecordType[]>
  clearSaved: (expectedUpdatedAt: string) => void
  onSaved: (kind: 'saved' | 'same') => void
}): WorkoutListSave {
  const { repository, draft, known, allowed, clearSaved, onSaved } = args
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [view, setView] = useState<View | null>(null)
  const [acknowledgedDate, setAcknowledgedDate] = useState<LocalDate>(() =>
    toLocalDate(new Date()),
  )
  const inFlight = useRef(false)
  const draftRef = useRef(draft)
  useEffect(() => {
    draftRef.current = draft
  }, [draft])

  const run = useCallback(
    async (date: LocalDate, replaceListId: string | null) => {
      if (inFlight.current || !repository || !known) return
      inFlight.current = true
      const snapshot = draftRef.current
      const at = snapshot.updatedAt
      setStatus('saving')
      setView(null)
      let outcome
      try {
        outcome = await saveWorkoutList(
          { listRepository: repository, now: () => new Date() },
          {
            draft: snapshot,
            knownExerciseIds: known,
            allowedRecordTypes: allowed,
            acknowledgedDate: date,
            confirmedReplaceListId: replaceListId,
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
          onSaved(outcome.kind === 'saved' ? 'saved' : 'same')
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
        case 'dateMismatch':
          setStatus('idle')
          setView({
            at,
            panel: null,
            error: {
              kind: 'dateMismatch',
              expected: outcome.expected,
              actual: outcome.list.plannedDate,
            },
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
    void run(acknowledgedDate, null)
  }, [run, acknowledgedDate])

  const confirmDate = useCallback(() => {
    if (panel?.kind !== 'date') return
    setAcknowledgedDate(panel.to)
    void run(panel.to, null)
  }, [panel, run])

  const confirmReplace = useCallback(() => {
    if (panel?.kind !== 'replace') return
    void run(acknowledgedDate, panel.existing.id)
  }, [panel, run, acknowledgedDate])

  const cancelPanel = useCallback(() => {
    setView((prev) => (prev ? { ...prev, panel: null } : prev))
  }, [])

  return {
    status,
    panel,
    error: current?.error ?? null,
    acknowledgedDate,
    save,
    confirmDate,
    confirmReplace,
    cancelPanel,
  }
}
