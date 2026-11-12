import type {
  DashboardSlot,
  WorkoutRoutineView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import { ManagementRow, PendingBadge, SlotError } from './DashboardParts.tsx'

export default function WorkoutRoutineCard({
  slot,
  onRetry,
}: {
  slot: DashboardSlot<WorkoutRoutineView>
  onRetry: () => void
}) {
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
