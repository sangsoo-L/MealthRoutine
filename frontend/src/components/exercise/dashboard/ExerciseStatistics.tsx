import type { PendingOnlySlot } from '../../../exercise/exerciseDashboardTypes.ts'
import { ManagementRow, PendingBadge, SlotError } from './DashboardParts.tsx'

/** 주간 완료 횟수와 별개인 상세 통계다. 부위·칼로리·달성률 수치를 만들지 않는다. */
export default function ExerciseStatistics({
  slot,
  onRetry,
}: {
  slot: PendingOnlySlot
  onRetry: () => void
}) {
  return (
    <ManagementRow
      title="운동 기록 통계"
      titleId="dashboard-statistics-title"
      icon="chart"
      trailing={slot.status === 'unavailable' ? <PendingBadge /> : null}
    >
      {slot.status === 'error' ? (
        <SlotError
          title="운동 기록 통계를 불러오지 못했어요"
          onRetry={onRetry}
        />
      ) : (
        <p
          role={slot.status === 'loading' ? 'status' : undefined}
          className="mt-1 text-support leading-relaxed font-normal text-muted"
        >
          {slot.status === 'loading'
            ? '통계를 불러오는 중이에요…'
            : '기록한 운동의 구성을 확인해요.'}
        </p>
      )}
    </ManagementRow>
  )
}
