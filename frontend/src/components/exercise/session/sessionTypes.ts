import type { SetEntry } from '../../../exercise/workoutProgress.ts'

/** W14에서 열려 있는 확인·안내 패널(한 번에 하나). */
export type SessionPanel =
  /** 그만두기 2단계 확인. busy는 처리 중, failed는 그만두지 못함. */
  | { kind: 'abandon'; step: 1 | 2; busy: boolean; failed: boolean }
  /** 저장하지 못한 채 화면을 떠나려 할 때(다시 시도 / 그래도 나가기 / 머무르기). */
  | { kind: 'leave'; unsavedCompletedSets: number; retrying: boolean }
  /** 측정 시간이 목표의 5배를 넘었다. */
  | {
      kind: 'overrun'
      measuredMs: number
      targetSeconds: number
      /** 확인 뒤 같은 입력(횟수·중량)으로 완료하려고 보관한다. */
      entry: SetEntry | undefined
    }
  /** 다른 운동으로 이동하면 측정 중이던 시간이 버려진다. */
  | { kind: 'discard'; direction: 'previous' | 'next' }
  /** 최신 상태를 불러오면 화면의 미저장 입력이 사라진다. */
  | { kind: 'reload'; unsavedCompletedSets: number }
  /**
   * 운동 결과(W15)로 이동하는 확인·진행. confirm은 진행 중이던 세트의 측정 시간이 기록되지 않는다는 확인, busy는 타이머 정지·저장 확인 중,
   * failed는 이동하지 못함(reason은 안내 문구).
   */
  | {
      kind: 'result'
      step: 'confirm' | 'busy' | 'failed'
      reason: string | null
    }

export interface SessionActions {
  complete: (entry: SetEntry | undefined) => void
  undo: () => void
  requestMove: (direction: 'previous' | 'next') => void
  startTimer: () => void
  pauseTimer: () => void
  retrySave: () => void
  requestReload: () => void
  /** 나가기(운동 기록으로). 저장·일시정지가 필요하면 이동 보호가 처리한다. */
  leave: () => void
  openAbandon: () => void
  /** 운동 결과 확인(W15)으로 이동한다. 측정 시간이 쌓인 세트가 있으면 먼저 확인을 받는다. */
  openResult: () => void
  /** 확인 뒤 실제 이동: 타이머 일시정지 → 저장 대기열 처리 → 저장 확인 → 이동. */
  confirmResult: () => void
  closePanel: () => void
  confirmOverrun: () => void
  confirmDiscard: () => void
  confirmReload: () => void
  /** 그만두기의 다음 단계/실행. */
  confirmAbandon: () => void
  leaveRetry: () => void
  leaveAnyway: () => void
  leaveStay: () => void
}
