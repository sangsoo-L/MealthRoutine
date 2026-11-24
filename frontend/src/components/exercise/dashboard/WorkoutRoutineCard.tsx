import type {
  DashboardSlot,
  WorkoutRoutineView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import { ManagementRow, PendingBadge, SlotError } from './DashboardParts.tsx'

/**
 * W01의 "내 운동 루틴" 행. `to`가 있으면(루틴 저장소가 있는 상태: 개발 서버의 로컬 저장소, 운영 빌드의 루틴 API) 내 운동 루틴(W06)으로 가는 링크를 보인다.
 * `to`가 없으면(개발용 예시 `?sample=`·저장소가 없는 환경) 링크를 그리지 않는다.
 */
export default function WorkoutRoutineCard({
  slot,
  onRetry,
  to,
}: {
  slot: DashboardSlot<WorkoutRoutineView>
  onRetry: () => void
  to?: string
}) {
  // 이동할 곳(W06)이 하나뿐인 상태(루틴 있음·없음)에서는 행 전체가 링크다. 불러오는 중·오류·준비 중은 링크가 아니다.
  const rowTo =
    to && (slot.status === 'ready' || slot.status === 'empty') ? to : undefined
  if (rowTo) {
    return (
      <ManagementRow
        title="내 운동 루틴"
        titleId="dashboard-routine-title"
        icon="clipboard"
        to={rowTo}
        linkLabel={slot.status === 'empty' ? '루틴 만들기' : '루틴 보기'}
        trailing={
          slot.status === 'ready' ? (
            <span className="tabular-nums">{slot.data.count}개 ·</span>
          ) : null
        }
      >
        <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
          {slot.status === 'empty'
            ? '아직 저장한 루틴이 없어요.'
            : '자주 하는 운동 구성을 모아 두어요.'}
        </p>
      </ManagementRow>
    )
  }
  return (
    <ManagementRow
      title="내 운동 루틴"
      titleId="dashboard-routine-title"
      icon="clipboard"
      trailing={
        slot.status === 'unavailable' ? (
          <PendingBadge />
        ) : slot.status === 'ready' ? (
          <span className="text-support font-semibold tabular-nums text-exercise">
            {slot.data.count}개
          </span>
        ) : null
      }
    >
      {slot.status === 'error' ? (
        <SlotError title="내 운동 루틴을 불러오지 못했어요" onRetry={onRetry} />
      ) : (
        <p
          role={slot.status === 'loading' ? 'status' : undefined}
          className="mt-1 text-support leading-relaxed font-normal break-keep text-muted"
        >
          {slot.status === 'loading'
            ? '루틴을 불러오는 중이에요…'
            : slot.status === 'empty'
              ? '아직 저장한 루틴이 없어요.'
              : '자주 하는 운동 구성을 모아 두어요.'}
        </p>
      )}
    </ManagementRow>
  )
}
