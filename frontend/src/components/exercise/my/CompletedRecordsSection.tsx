import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import {
  dashboardDateLabel,
  measuredDurationLabel,
} from '../../../exercise/dashboardSelectors.ts'
import type {
  DashboardSlot,
  RecentRecordsView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import {
  RECORD_PAGE_SIZE,
  nextVisibleCount,
  visibleRecordCount,
} from '../../../exercise/myExercise.ts'
import { resultPathFor } from '../../../exercise/useWorkoutResult.ts'
import {
  DashboardSection,
  SlotError,
  SlotLoading,
  dashboardFocusRing,
  dashboardSectionTitle,
} from '../dashboard/DashboardParts.tsx'
import { composeSecondaryButton } from '../compose/composeStyles.ts'
import Icon from '../../icons/Icon.tsx'

const TITLE_ID = 'my-records-title'

/**
 * W10 "완료한 운동 기록". 저장된 완료 기록만 최근 1년 범위에서 완료 시각 최신순으로 보이고, 20건씩 "더 보기"로 늘린다.
 * 각 기록은 W15 읽기 전용 상세로 이동한다(이동 때 이 화면의 경로를 `state.from`으로 넘겨 W15의 "이전"이 이 화면으로 돌아온다).
 * 측정한 시간이 있는 기록에만 실제 측정값을 보이고, 없으면 시간 자체를 그리지 않는다(0으로 보이지 않는다).
 */
export default function CompletedRecordsSection({
  slot,
  fromPath,
  onRetry,
}: {
  slot: DashboardSlot<RecentRecordsView>
  /** W15의 "이전"이 돌아올 이 화면의 경로. */
  fromPath: string
  onRetry: () => void
}) {
  const view = slot.status === 'ready' ? slot.data : null
  const total = view?.items.length ?? 0
  const [shown, setShown] = useState(RECORD_PAGE_SIZE)
  const visible = visibleRecordCount(shown, total)
  const listRef = useRef<HTMLOListElement>(null)
  // "더 보기" 뒤에 새로 보이는 첫 기록으로 포커스를 옮긴다(버튼이 사라져도 포커스가 문서 처음으로 빠지지 않는다).
  const pendingFocus = useRef<number | null>(null)
  useEffect(() => {
    const index = pendingFocus.current
    if (index === null) return
    pendingFocus.current = null
    listRef.current
      ?.querySelectorAll<HTMLElement>('[data-record-item]')
      [index]?.querySelector<HTMLElement>('a')
      ?.focus()
  }, [visible])

  const allCorrupt = view !== null && total === 0 && view.skippedCount > 0
  const unavailable = slot.status === 'unavailable'

  return (
    <DashboardSection labelId={TITLE_ID}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={TITLE_ID} className={dashboardSectionTitle}>
          완료한 운동 기록
        </h2>
        {total > 0 ? (
          <span
            aria-live="polite"
            className="text-support font-normal tabular-nums text-muted"
          >
            전체 {total}건 중 {visible}건
          </span>
        ) : null}
      </div>
      {slot.status === 'loading' ? (
        <SlotLoading label="완료한 운동 기록을 불러오는 중이에요…" />
      ) : slot.status === 'error' ? (
        <SlotError
          title="완료한 운동 기록을 불러오지 못했어요"
          onRetry={onRetry}
        />
      ) : view !== null && total > 0 ? (
        <>
          <ol
            ref={listRef}
            role="list"
            className="divide-y divide-line border-y border-line"
          >
            {view.items.slice(0, visible).map((record) => {
              const duration = measuredDurationLabel(record.measuredMs)
              return (
                <li
                  key={record.id}
                  data-record-item
                  className="flex items-start gap-3 py-4"
                >
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
                    {record.sessionId ? (
                      <Link
                        to={resultPathFor(record.sessionId)}
                        state={{ from: fromPath }}
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
          {visible < total ? (
            <button
              type="button"
              onClick={() => {
                pendingFocus.current = visible
                setShown(nextVisibleCount(visible, total))
              }}
              className={`mt-3 w-full ${composeSecondaryButton}`}
            >
              더 보기
              <span className="ml-1 text-support font-normal tabular-nums">
                (남은 {total - visible}건)
              </span>
            </button>
          ) : null}
        </>
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
                  ? '운동 기록을 준비 중이에요'
                  : '아직 저장된 운동 기록이 없어요'}
            </p>
            <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
              {allCorrupt
                ? '기록을 읽지 못했어요. 잠시 후 다시 확인해 주세요.'
                : unavailable
                  ? '이 환경에서는 저장된 운동 기록을 볼 수 없어요.'
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
