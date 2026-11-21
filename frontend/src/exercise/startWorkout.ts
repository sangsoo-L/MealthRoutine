import { countCompletedSets, toLocalDate } from './workoutModel.ts'
import { countTotalSets } from './workoutProgress.ts'
import type { LocalDate, WorkoutSession } from './workoutTypes.ts'

/**
 * W01의 운동 시작·이어하기 판단(순수 함수). 저장소 호출·화면과 무관하다.
 *
 * 저장소(startOrResume)는 목록의 날짜와 완료 여부를 보지 않는다. 그래서 이 판단이 화면에서 먼저 막는다.
 * - 진행 중인 세션이 같은 목록이면 이어하기(날짜와 상관없이).
 * - 오늘 날짜의 목록이 아니면 새로 시작하지 않는다(어제 목록을 오늘 운동으로 시작하지 않는다).
 * - 오늘 이미 그 목록으로 운동을 마쳤으면 중복 시작을 막는다.
 * - 목록에 복합 기록 방식이 있으면(startBlocked) 시작하지 않는다. 저장소(startOrResume)도 같은 목록을 거부한다.
 * - 다른 목록의 진행 중인 세션이 있으면 충돌: 이어하기 / 그만두고 새로 시작 중에서 사용자가 고른다.
 * 진행 중인 세션은 목록과 별개로 "진행 중인 운동" 영역에 요약해 보여 준다.
 */

export interface ActiveSessionSummary {
  id: string
  listId: string
  /** 마지막으로 확인한 revision. 그만두기 요청의 expectedRevision으로 쓴다. */
  revision: number
  /** 운동을 시작한 기기 로컬 날짜. */
  startedDate: LocalDate
  /** 오늘 시작했는지. 아니면(자정 이후) 사용자가 이어할지 그만둘지 고르게 안내한다. */
  startedToday: boolean
  plannedDate: LocalDate
  completedSets: number
  totalSets: number
}

export function summarizeActiveSession(
  session: Pick<
    WorkoutSession,
    'id' | 'listId' | 'revision' | 'startedAt' | 'performed' | 'listSnapshot'
  >,
  today: LocalDate,
): ActiveSessionSummary {
  const startedDate = toLocalDate(new Date(session.startedAt))
  return {
    id: session.id,
    listId: session.listId,
    revision: session.revision,
    startedDate,
    startedToday: startedDate === today,
    plannedDate: session.listSnapshot.plannedDate,
    completedSets: countCompletedSets(session.performed),
    totalSets: countTotalSets(session.performed),
  }
}

export type StartDecision =
  /** 진행 중인 세션이 없어 새로 시작할 수 있다. */
  | { kind: 'start'; listId: string }
  /** 같은 목록의 세션이 진행 중이라 이어한다. */
  | { kind: 'resume'; active: ActiveSessionSummary }
  /** 다른 목록의 세션이 진행 중이다. 아무것도 시작하지 않고 사용자가 고른다. */
  | { kind: 'conflict'; active: ActiveSessionSummary; listId: string }
  /** 오늘 이 목록으로 이미 운동을 마쳤다. */
  | { kind: 'done' }
  /** 오늘 날짜의 목록이 아니라 새로 시작할 수 없다. */
  | { kind: 'notToday' }
  /** 목록에 진행(W14)·결과(W15)가 아직 처리하지 못하는 기록 방식(복합 방식)이 있어 시작할 수 없다(S4·S5가 끝날 때까지). */
  | { kind: 'unsupported' }

export function decideStart(params: {
  today: LocalDate
  list: { id: string; plannedDate: LocalDate; startBlocked?: boolean }
  active: ActiveSessionSummary | null
  /** 오늘 완료 기록이 있는 목록 id들. */
  doneListIds: ReadonlySet<string>
}): StartDecision {
  const { today, list, active, doneListIds } = params
  if (active && active.listId === list.id) return { kind: 'resume', active }
  if (list.plannedDate !== today) return { kind: 'notToday' }
  if (doneListIds.has(list.id)) return { kind: 'done' }
  // 복합 방식 목록은 다른 진행 중 세션이 있어도 충돌이 아니라 "시작할 수 없음"이다(시작·그만두고 새로 시작 모두 막는다).
  if (list.startBlocked) return { kind: 'unsupported' }
  if (active) return { kind: 'conflict', active, listId: list.id }
  return { kind: 'start', listId: list.id }
}

/** "11월 13일에 시작한 운동"처럼 진행 중인 운동의 시작 시점 안내. 오늘이면 null이다. */
export function startedOnLabel(summary: ActiveSessionSummary): string | null {
  if (summary.startedToday) return null
  const [, month, day] = summary.startedDate.split('-').map(Number)
  return `${month}월 ${day}일에 시작한 운동이에요`
}
