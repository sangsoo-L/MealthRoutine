import type { SetFieldErrors } from '../../../exercise/workoutResultView.ts'

/** W15에서 열려 있는 확인 패널(한 번에 하나). */
export type ResultPanel =
  /** 최신 상태를 불러오면 저장하지 않은 수정 내용이 사라진다(수정한 값이 있을 때만 연다). */
  | { kind: 'reload' }
  /** 저장하지 않은 수정 내용이 있는 채 화면을 떠나려 할 때(계속 수정하기 / 수정 내용 버리고 이동). */
  | { kind: 'leave' }

/** 한 세트의 값을 고치는 입력 상태. 입력 원문(문자열)을 그대로 들고 있다가 적용할 때 기존 검증으로 확인한다. */
export interface ResultEditorState {
  itemIndex: number
  setIndex: number
  reps: string
  weightKg: string
  /** 측정 시간 입력 원문(초 또는 분:초). */
  measuredMs: string
  errors: SetFieldErrors
}

export interface ResultActions {
  openEdit: (itemIndex: number, setIndex: number) => void
  closeEdit: () => void
  changeField: (
    field: 'reps' | 'weightKg' | 'measuredMs',
    value: string,
  ) => void
  applyEdit: () => void
  uncomplete: (itemIndex: number, setIndex: number) => void
  /** 수정 취소: W15에 들어올 때의 값으로 되돌린다(저장소의 값은 바꾸지 않는다). */
  cancelEdits: () => void
  submit: () => void
  /** 최신 상태 불러오기. 수정한 값이 있으면 확인 패널을 연다. */
  requestReload: () => void
  confirmReload: () => void
  closePanel: () => void
  /** 재시도 가능한 실패 안내를 접고 화면에 머문다. */
  dismissFailure: () => void
  goSession: () => void
  goDashboard: () => void
  leaveStay: () => void
  leaveDiscard: () => void
}
