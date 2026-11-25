import { Link } from 'react-router'
import {
  dashboardDateLabel,
  measuredDurationLabel,
} from '../../../exercise/dashboardSelectors.ts'
import type {
  DashboardSlot,
  RecentRecordsView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import { resultPathFor } from '../../../exercise/useWorkoutResult.ts'
import Icon from '../../icons/Icon.tsx'
import {
  DashboardSection,
  SlotError,
  SlotLoading,
  dashboardFocusRing,
  dashboardSectionTitle,
} from './DashboardParts.tsx'

const TITLE_ID = 'dashboard-recent-title'

export default function RecentRecordsSection({
  slot,
  sharedUnavailable,
  onRetry,
  showAllLink = true,
  notSavedIds,
}: {
  slot: DashboardSlot<RecentRecordsView>
  sharedUnavailable: boolean
  onRetry: () => void
  /** 서버가 받지 않은 기록 id(업로드 거절). 이 기록에는 "서버에 저장되지 않았어요"를 붙이고 이유는 W15(기록 자세히 보기)에서 보여 준다. */
  notSavedIds?: ReadonlySet<string>
  /** false이면 "전체 기록 보기"(W10)를 그리지 않는다. 개발용 예시(?sample=) 화면은 실제 운동 기록 화면으로 보내지 않는다. 기본은 true다. */
  showAllLink?: boolean
}) {
  const view = slot.status === 'ready' ? slot.data : null
  const hasRecords = view !== null && view.items.length > 0
  const unavailable = slot.status === 'unavailable'
  const allCorrupt = view?.items.length === 0 && view.skippedCount > 0

  return (
    <DashboardSection labelId={TITLE_ID}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={TITLE_ID} className={dashboardSectionTitle}>
          최근 운동 기록
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-3">
          {hasRecords ? (
            <span className="text-support font-normal text-muted">
              최근 {view.items.length}건
            </span>
          ) : null}
          {unavailable || !showAllLink ? null : (
            <Link
              to="/records/exercise/my"
              className={`inline-flex min-h-11 items-center text-support font-semibold text-exercise hover:underline ${dashboardFocusRing}`}
            >
              전체 기록 보기
            </Link>
          )}
        </div>
      </div>
      {slot.status === 'loading' ? (
        <SlotLoading label="최근 운동 기록을 불러오는 중이에요…" />
      ) : slot.status === 'error' ? (
        <SlotError
          title="최근 운동 기록을 불러오지 못했어요"
          onRetry={onRetry}
        />
      ) : hasRecords ? (
        <ol role="list" className="divide-y divide-line border-y border-line">
          {view.items.map((record) => {
            const duration = measuredDurationLabel(record.measuredMs)
            return (
              <li key={record.id} className="flex items-start gap-3 py-4">
                <span
                  aria-hidden="true"
                  className="flex size-10 shrink-0 items-center justify-center rounded-control bg-exercise-soft text-exercise"
                >
                  <Icon name="dumbbell" size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <time
                    dateTime={record.performedDate}
                    className="block text-support font-normal tabular-nums text-muted"
                  >
                    {dashboardDateLabel(record.performedDate)}
                  </time>
                  <p className="mt-1 line-clamp-2 text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
                    {record.title}
                  </p>
                  <ul
                    role="list"
                    aria-label="수행한 운동 결과"
                    className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-support font-normal tabular-nums text-muted"
                  >
                    <li>운동 {record.exerciseCount}개</li>
                    <li>{record.completedSetCount}세트 수행</li>
                    {duration !== null ? <li>측정 {duration}</li> : null}
                  </ul>
                  {notSavedIds?.has(record.id) ? (
                    <p className="mt-1 text-support leading-relaxed font-normal break-keep text-warning">
                      서버에 저장되지 않았어요. 기록 자세히 보기에서 이유를
                      확인해 주세요.
                    </p>
                  ) : null}
                  {record.sessionId ? (
                    <Link
                      to={resultPathFor(record.sessionId)}
                      className={`mt-1 inline-flex min-h-11 items-center text-support font-semibold text-exercise hover:underline ${dashboardFocusRing}`}
                    >
                      기록 자세히 보기
                      <span className="sr-only">
                        : {dashboardDateLabel(record.performedDate)}{' '}
                        {record.title}
                      </span>
                    </Link>
                  ) : null}
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="flex items-start gap-3 rounded-card border border-line bg-surface p-4">
          <span
            aria-hidden="true"
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-exercise-soft text-exercise"
          >
            <Icon name="clipboard-check" size={20} />
          </span>
          <div className="min-w-0">
            <p className="text-body leading-snug font-semibold text-content">
              {allCorrupt
                ? '기록을 확인할 수 없어요'
                : unavailable
                  ? '최근 운동이 여기에 보여요'
                  : '아직 저장된 운동 기록이 없어요'}
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
              {allCorrupt
                ? '기록을 읽지 못했어요. 잠시 후 다시 확인해 주세요.'
                : unavailable
                  ? sharedUnavailable
                    ? '운동을 마치면 날짜별로 여기에 모여요.'
                    : '최근 운동 기록을 준비 중이에요.'
                  : '운동을 마치고 저장하면 여기에 남아요.'}
            </p>
          </div>
        </div>
      )}
      {view && view.skippedCount > 0 ? (
        <p className="mt-2 text-support leading-relaxed font-normal text-muted">
          읽을 수 없는 기록 {view.skippedCount}건을 제외했어요.
        </p>
      ) : null}
    </DashboardSection>
  )
}
