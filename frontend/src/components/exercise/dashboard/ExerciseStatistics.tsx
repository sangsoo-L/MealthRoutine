import type { PendingOnlySlot } from '../../../exercise/exerciseDashboardTypes.ts'
import { ManagementRow, PendingBadge, SlotError } from './DashboardParts.tsx'

/**
 * 주간 완료 횟수와 별개인 상세 통계다. 부위·칼로리·달성률 수치를 만들지 않는다.
 * `to`가 있으면(저장된 완료 기록을 읽을 수 있는 개발 서버의 실제 모드) 행 전체가 운동 기록 통계 화면으로 가는 링크이고 "준비 중" 배지를 지운다.
 * `to`가 없으면(개발용 예시·저장소가 없는 환경) 기존처럼 준비 중이다. 불러오는 중·오류에서는 링크로 만들지 않는다.
 */
export default function ExerciseStatistics({
  slot,
  onRetry,
  to,
}: {
  slot: PendingOnlySlot
  onRetry: () => void
  to?: string
}) {
  if (to && slot.status !== 'error' && slot.status !== 'loading') {
    return (
      <ManagementRow
        title="운동 기록 통계"
        titleId="dashboard-statistics-title"
        icon="chart"
        to={to}
        linkLabel="통계 보기"
      >
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          완료한 운동 기록으로 주간·월간 통계를 확인해요.
        </p>
      </ManagementRow>
    )
  }
  return (
    <ManagementRow
      title="운동 기록 통계"
      titleId="dashboard-statistics-title"
      icon="chart"
      trailing={slot.status === 'unavailable' && !to ? <PendingBadge /> : null}
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
