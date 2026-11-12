import { Link } from 'react-router'
import type {
  DashboardSlot,
  TodayExerciseView,
} from '../../../exercise/exerciseDashboardTypes.ts'
import Icon from '../../icons/Icon.tsx'
import {
  CreateListCta,
  DashboardSection,
  PendingButton,
  SlotError,
  SlotLoading,
  dashboardFocusRing,
  dashboardSectionTitle,
} from './DashboardParts.tsx'

/** 목록·완료 결과는 한 번에 하나만 표시하고, 편집 중 초안은 실적으로 집계하지 않는다. */
export default function TodayExerciseSection({
  slot,
  draftCount,
  onRetry,
}: {
  slot: DashboardSlot<TodayExerciseView>
  draftCount: number
  onRetry: () => void
}) {
  const view = slot.status === 'ready' ? slot.data : null
  const completed = view?.phase === 'completed'
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
                {view.items.map((item, index) => (
                  <li
                    key={`${index}-${item.name}`}
                    className="flex items-start gap-3 py-3"
                  >
                    <span
                      aria-hidden="true"
                      className="mt-0.5 text-support font-normal tabular-nums text-muted"
                    >
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                        <p className="text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
                          {item.name}
                        </p>
                        {item.trailing ? (
                          <span className="text-support font-normal text-muted">
                            {item.trailing}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-support leading-relaxed font-normal wrap-anywhere text-muted">
                        {item.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
              {view.phase === 'completed' ? (
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line pt-3">
                  <span className="text-support font-normal text-muted">
                    측정한 운동 시간
                  </span>
                  <span className="text-body font-semibold tabular-nums text-content">
                    {view.durationLabel ?? '미측정'}
                  </span>
                </div>
              ) : null}
              <div className="mt-4">
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
                    목록 편집을 이어가요. 최종 검토·저장은 준비 중이에요.
                  </p>
                </>
              ) : (
                <CreateListCta id="today-create-cta" />
              )}
            </div>
          )}
        </div>
      )}
    </DashboardSection>
  )
}
