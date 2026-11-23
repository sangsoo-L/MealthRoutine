/**
 * 댓글·답변 입력의 "전송 이후 바뀐 입력 보존" 규칙.
 *
 * 서버 응답을 기다리는 동안 사용자가 새로 쓴 내용을 늦은 성공 응답이 지우지 않도록,
 * 입력이 바뀔 때마다 버전 번호를 올리고 전송 당시의 버전과 응답 시점의 버전을 비교한다.
 * 문자열이 같은지만 보면 A → B → A로 바꾼 입력을 "그대로"로 오해하므로 값이 아니라 변경 횟수를 쓴다.
 */
export type SubmitOutcome =
  /** 성공했고 그 사이 입력이 바뀌지 않았다 → 입력창을 비운다. */
  | 'cleared'
  /** 성공했지만 그 사이 입력이 바뀌었다 → 현재 입력을 그대로 둔다. */
  | 'kept'
  /** 실패 → 현재 입력을 그대로 둔다. */
  | 'failed'

export interface DraftSubmitTracker {
  /** 입력이 바뀔 때마다 부른다. */
  edit: () => void
  /** 전송을 시작한다. 이미 처리 중이면 null(중복 제출 방지), 아니면 전송 당시의 버전 토큰이다. */
  begin: () => number | null
  /** 응답을 받았을 때 부른다. 처리 중 상태를 풀고 입력창을 어떻게 할지 알려 준다. */
  finish: (token: number, ok: boolean) => SubmitOutcome
  /** 처리 중인지(전송 후 응답 전). */
  readonly busy: boolean
}

export function createDraftSubmitTracker(): DraftSubmitTracker {
  let version = 0
  let busy = false
  return {
    edit() {
      version += 1
    },
    begin() {
      if (busy) return null
      busy = true
      return version
    },
    finish(token, ok) {
      busy = false
      if (!ok) return 'failed'
      return token === version ? 'cleared' : 'kept'
    },
    get busy() {
      return busy
    },
  }
}
