import { Link } from 'react-router'
import type {
  DashboardSlot,
  TodayExerciseView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import type { StartControls } from '../../../exercise/useWorkoutStart.ts'
import Icon from '../../icons/Icon.tsx'
import {
  CreateListCta,
  CreateListLink,
  DashboardSection,
  PendingButton,
  SlotError,
  SlotLoading,
  dashboardFocusRing,
  dashboardSectionTitle,
} from './DashboardParts.tsx'
import { StartAction } from './WorkoutStartParts.tsx'

const MAX_VISIBLE_ITEMS = 3

/** 목록·완료 결과는 한 번에 하나만 표시하고, 편집 중 초안은 실적으로 집계하지 않는다. */
export default function TodayExerciseSection({
  slot,
  draftCount,
  onRetry,
  start,
  recordPath,
  recordFrom,
  activeCardAbove = false,
}: {
  slot: DashboardSlot<TodayExerciseView>
  draftCount: number
  onRetry: () => void
  /** 운동 시작·이어하기 상태. 없거나 저장소가 없으면(계정 없음·개발용 예시) 기존 "준비 중" 버튼을 유지한다. */
  start?: StartControls
  /** 오늘 마친 목록의 저장된 완료 기록 상세(W15 읽기 전용) 경로. 저장된 기록이 있을 때만 값이 있다. */
  recordPath?: string | null
  /** 주면 완료 기록 상세(W15)로 갈 때 이 경로를 `state.from`으로 넘긴다(W10이 사용). 없으면 기존 동작(W01)이다. */
  recordFrom?: string
  /** true이면(W01) 진행 중인 운동 카드가 바로 위에 있어 같은 이어하기 버튼을 반복하지 않는다(StartAction 참고). 기본값 false(W10)는 기존 모양이다. */
  activeCardAbove?: boolean
}) {
  const view = slot.status === 'ready' ? slot.data : null
  const completed = view?.phase === 'completed'
  // 목록은 운동명 최대 3개만 보여 주고 나머지는 개수로 줄인다. 개수는 데이터의 운동 종목 수를 따른다.
  const shownItems = view ? view.items.slice(0, MAX_VISIBLE_ITEMS) : []
  const hiddenCount = view
    ? Math.max(0, view.exerciseCount - shownItems.length)
    : 0
  return (
    <DashboardSection labelId="dashboard-today-title">
      <h2
        id="dashboard-today-title"
        className={`mb-3 ${dashboardSectionTitle}`}
      >
        오늘의 운동
      </h2>
      {slot.status === 'loading' ? (
        <SlotLoading label="오늘의 운동을 불러오는 중이에요…" />
      ) : slot.status === 'error' ? (
        <SlotError title="오늘의 운동을 불러오지 못했어요" onRetry={onRetry} />
      ) : (
        <div className="rounded-card border border-line bg-surface p-4">
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-control bg-exercise-soft text-exercise"
            >
              <Icon
                name={completed ? 'clipboard-check' : 'clipboard-plus'}
                size={20}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
                {view
                  ? completed
                    ? '오늘의 운동을 마쳤어요'
                    : view.phase === 'planned'
                      ? view.listName
                      : ''
                  : draftCount > 0
                    ? '구성하던 운동이 있어요'
                    : '오늘 할 운동을 준비해요'}
              </p>
              <p className="mt-1 text-support leading-relaxed font-normal break-keep text-muted">
                {view
                  ? completed
                    ? '완료한 세트가 기록으로 저장됐어요.'
                    : '운동 순서와 목표 세트를 확인해요.'
                  : draftCount > 0
                    ? `운동 ${draftCount}개를 담았어요. 이어서 편집할 수 있어요.`
                    : '운동 순서와 세트·횟수를 미리 구성해요.'}
              </p>
            </div>
          </div>
          {view ? (
            <>
              <dl className="mt-4 grid grid-cols-2 divide-x divide-line rounded-control bg-page py-3">
                <div className="px-3">
                  <dt className="text-support font-normal text-muted">운동</dt>
                  <dd className="mt-1 text-section-title font-semibold tabular-nums text-content">
                    {view.exerciseCount}개
                  </dd>
                </div>
                <div className="px-3">
                  <dt className="text-support font-normal text-muted">
                    {completed ? '완료 세트' : '목표 세트'}
                  </dt>
                  <dd className="mt-1 text-section-title font-semibold tabular-nums text-content">
                    {view.setCount}세트
                  </dd>
                </div>
              </dl>
              <ol role="list" className="mt-3 divide-y divide-line">
                {shownItems.map((item, index) => (
                  <li
                    key={`${index}-${item.name}`}
                    className="flex items-baseline gap-3 py-2.5"
                  >
                    <span
                      aria-hidden="true"
                      className="text-support font-normal tabular-nums text-muted"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
                        {item.name}
                      </p>
                      <p className="mt-0.5 text-support leading-snug font-normal break-keep wrap-anywhere text-muted">
                        {item.detail}
                      </p>
                    </div>
                    {item.trailing ? (
                      <span className="shrink-0 text-support font-normal text-muted">
                        {item.trailing}
                      </span>
                    ) : null}
                  </li>
                ))}
                {hiddenCount > 0 ? (
                  <li className="py-2.5 text-support font-normal text-muted">
                    외 {hiddenCount}개
                  </li>
                ) : null}
              </ol>
              {view.phase === 'completed' ? (
                <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
                  <span className="text-support font-normal text-muted">
                    측정한 운동 시간
                  </span>
                  <span className="text-body font-semibold tabular-nums text-content">
                    {view.durationLabel ?? '미측정'}
                  </span>
                </div>
              ) : null}
              <div className="mt-4">
                {view.phase === 'planned' &&
                view.listId &&
                start &&
                start.status !== 'unavailable' ? (
                  <StartAction
                    controls={start}
                    recordPath={recordPath}
                    recordFrom={recordFrom}
                    activeCardAbove={activeCardAbove}
                  />
                ) : (
                  <>
                    <PendingButton
                      describedBy="today-action-pending"
                      showSuffix={false}
                    >
                      {completed
                        ? '오늘 운동 기록 자세히 보기'
                        : '이 목록으로 바로 운동 시작'}
                    </PendingButton>
                    <p
                      id="today-action-pending"
                      className="mt-2 text-support leading-relaxed font-normal text-muted"
                    >
                      {completed
                        ? '운동 기록 상세 기능을 준비 중이에요.'
                        : '운동 진행 기능을 준비 중이에요.'}
                    </p>
                  </>
                )}
                {view.phase === 'planned' ? (
                  <>
                    {view.skippedCount ? (
                      <p className="mt-2 text-support leading-relaxed font-normal text-muted">
                        일부 저장 목록({view.skippedCount}개)을 읽지 못했어요.
                      </p>
                    ) : null}
                    <Link
                      to="/records/exercise/new"
                      className={`mt-3 flex min-h-11 w-full items-center justify-center rounded-control border border-exercise bg-surface px-4 text-body font-semibold text-exercise hover:bg-exercise-soft ${dashboardFocusRing}`}
                    >
                      목록 다시 구성하기
                    </Link>
                  </>
                ) : null}
              </div>
            </>
          ) : (
            <div className="mt-4">
              {draftCount > 0 ? (
                <>
                  <Link
                    to="/records/exercise/compose"
                    className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-control bg-exercise px-4 py-2 text-body font-semibold text-surface hover:bg-exercise/90 ${dashboardFocusRing}`}
                  >
                    이어서 구성하기
                    <Icon name="arrow-right" size={18} />
                  </Link>
                  <p className="mt-2 text-support leading-relaxed font-normal text-muted">
                    목록 편집을 이어가요. 구성을 마치면 최종 검토에서 저장해요.
                  </p>
                </>
              ) : slot.status === 'unavailable' ? (
                <CreateListCta id="today-create-cta" />
              ) : (
                <CreateListLink />
              )}
            </div>
          )}
        </div>
      )}
    </DashboardSection>
  )
}
