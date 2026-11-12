import type { PendingOnlySlot } from '../../../exercise/exerciseDashboardTypes.ts'
import Icon from '../../icons/Icon.tsx'
import {
  PendingBadge,
  SlotError,
  dashboardFocusRing,
  dashboardSectionTitle,
} from './DashboardParts.tsx'

/** 후속 기능은 펼쳐 볼 수 있는 안내에 보존한다. 미구현 화면으로 이동하지 않는다. */
export default function NextExerciseSection({
  slot,
  onRetry,
}: {
  slot: PendingOnlySlot
  onRetry: () => void
}) {
  return (
    <details className="group">
      <summary
        className={`flex min-h-14 cursor-pointer list-none items-center gap-3 p-4 [&::-webkit-details-marker]:hidden ${dashboardFocusRing}`}
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-control bg-page text-muted"
        >
          <Icon name="calendar-plus" size={20} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block ${dashboardSectionTitle}`}>
            다음 운동 준비하기
          </span>
          <span className="mt-1 block text-support font-normal text-muted">
            내일 계획 · 주간 리포트
          </span>
        </span>
        <Icon
          name="chevron-down"
          size={20}
          className="shrink-0 text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="border-t border-line px-4 pb-4">
        {slot.status === 'error' ? (
          <div className="mt-3">
            <SlotError
              title="다음 운동 정보를 불러오지 못했어요"
              onRetry={onRetry}
            />
          </div>
        ) : slot.status === 'loading' ? (
          <p role="status" className="mt-3 text-support font-normal text-muted">
            불러오는 중이에요…
          </p>
        ) : (
          <ul role="list" className="divide-y divide-line">
            {[
              {
                title: '내일 운동 계획',
                body: '내일 할 운동 목록을 미리 구성해요.',
              },
              {
                title: '주간 리포트',
                body: '기록을 바탕으로 한 주를 돌아봐요.',
              },
            ].map((row) => (
              <li
                key={row.title}
                className="flex items-start justify-between gap-3 pt-3 not-last:pb-3"
              >
                <div className="min-w-0">
                  <h3 className="text-body font-semibold text-content">
                    {row.title}
                  </h3>
                  <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                    {row.body}
                  </p>
                </div>
                <PendingBadge />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}
