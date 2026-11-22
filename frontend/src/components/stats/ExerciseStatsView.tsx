import type {
  ExerciseStats,
  StatsPeriod,
} from '../../exercise/exerciseStats.ts'
import { MAX_MONTH_BACK, MAX_WEEK_BACK } from '../../exercise/exerciseStats.ts'
import type { RecordsRangeState } from '../../exercise/useRecordsInRange.ts'
import { measuredDurationLabel } from '../../exercise/dashboardSelectors.ts'
import {
  composeCard,
  composeFocusRing,
  composeSecondaryButton,
  composeSectionTitle,
} from '../exercise/compose/composeStyles.ts'

const PERIODS: readonly { value: StatsPeriod; label: string }[] = [
  { value: 'week', label: '주간' },
  { value: 'month', label: '월간' },
]

const tile = 'rounded-card border border-line bg-surface p-4'
const tileLabel = 'text-support leading-snug font-normal text-muted'
const tileValue =
  'mt-1 text-metric leading-none font-semibold tabular-nums text-content'

/**
 * 운동 기록 통계 본문. 주간·월간 전환, 이전/다음 기간 이동, 운동 횟수·운동한 날짜 수·측정 운동 시간, 기간별 추이 막대, 운동별 수행 횟수를 보인다.
 * - 저장된 완료 기록으로 계산한 값만 보인다. 기록이 없으면 빈 상태 안내만 있고 0으로 채운 통계나 그래프를 그리지 않는다.
 * - 운동 시간은 실제 측정한 기록만 합산한다. 측정한 기록이 없으면 "측정한 시간 없음"이며 0분으로 보이지 않는다.
 * - 저장소가 없으면(운영 빌드) 준비 중으로 안내한다. 가짜 통계를 만들지 않는다.
 */
export default function ExerciseStatsView({
  period,
  offset,
  label,
  sub,
  state,
  stats,
  skippedCount,
  onPeriodChange,
  onOffsetChange,
  onRetry,
}: {
  period: StatsPeriod
  offset: number
  label: string
  sub: string
  state: RecordsRangeState['status']
  /** 조회에 성공했을 때만 값이 있다. */
  stats: ExerciseStats | null
  skippedCount: number
  onPeriodChange: (period: StatsPeriod) => void
  onOffsetChange: (offset: number) => void
  onRetry: () => void
}) {
  const min = -(period === 'week' ? MAX_WEEK_BACK : MAX_MONTH_BACK)
  const unit = period === 'week' ? '주' : '달'
  const maxBucket = stats
    ? Math.max(1, ...stats.buckets.map((b) => b.sessions))
    : 1
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          운동 기록 통계
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          저장한 운동 기록으로 계산해요.
        </p>
      </header>

      <div
        role="group"
        aria-label="통계 기간 단위"
        className="grid grid-cols-2 gap-2"
      >
        {PERIODS.map((item) => {
          const selected = item.value === period
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={selected}
              onClick={() => onPeriodChange(item.value)}
              className={`flex min-h-11 cursor-pointer items-center justify-center rounded-control border px-4 text-body ${composeFocusRing} ${
                selected
                  ? 'border-exercise bg-exercise-soft font-semibold text-exercise'
                  : 'border-line bg-surface font-normal text-muted hover:text-content'
              }`}
            >
              {item.label}
            </button>
          )
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-disabled={offset <= min || undefined}
          aria-label={`이전 ${unit}`}
          onClick={() => {
            if (offset > min) onOffsetChange(offset - 1)
          }}
          className={`${composeSecondaryButton} min-w-11 aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted`}
        >
          ‹
        </button>
        <div className="min-w-0 text-center" aria-live="polite">
          <p className="text-section-title leading-snug font-semibold text-content">
            {label}
          </p>
          <p className="text-support leading-snug font-normal tabular-nums text-muted">
            {sub}
          </p>
        </div>
        <button
          type="button"
          aria-disabled={offset >= 0 || undefined}
          aria-label={`다음 ${unit}`}
          onClick={() => {
            if (offset < 0) onOffsetChange(offset + 1)
          }}
          className={`${composeSecondaryButton} min-w-11 aria-disabled:cursor-not-allowed aria-disabled:border-line aria-disabled:text-muted`}
        >
          ›
        </button>
      </div>

      {state === 'loading' ? (
        <p role="status" className={`${composeCard} text-body text-muted`}>
          통계를 불러오는 중이에요…
        </p>
      ) : state === 'unavailable' ? (
        <div className={composeCard}>
          <p className="text-body leading-snug font-semibold text-content">
            운동 기록 통계를 준비 중이에요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            이 환경에서는 저장한 운동 기록을 볼 수 없어요.
          </p>
        </div>
      ) : state === 'error' || stats === null ? (
        <div role="alert" className={composeCard}>
          <p className="text-body leading-snug font-semibold text-content">
            운동 기록을 불러오지 못했어요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 w-full ${composeSecondaryButton}`}
          >
            다시 시도
          </button>
        </div>
      ) : stats.sessionCount === 0 ? (
        <div className={composeCard}>
          <p className="text-body leading-snug font-semibold text-content">
            {skippedCount > 0
              ? '기록을 확인할 수 없어요'
              : '이 기간에 완료한 운동 기록이 없어요'}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            {skippedCount > 0
              ? '저장된 기록을 읽지 못했어요. 잠시 후 다시 확인해 주세요.'
              : '운동을 마치고 저장하면 여기에 통계가 쌓여요.'}
          </p>
        </div>
      ) : (
        <>
          <section aria-label="요약" className="grid grid-cols-2 gap-3">
            <div className={tile}>
              <p className={tileLabel}>운동 횟수</p>
              <p className={tileValue}>
                {stats.sessionCount}
                <span className="ml-0.5 text-section-title font-semibold">
                  회
                </span>
              </p>
            </div>
            <div className={tile}>
              <p className={tileLabel}>운동한 날</p>
              <p className={tileValue}>
                {stats.activeDays}
                <span className="ml-0.5 text-section-title font-semibold">
                  일
                </span>
              </p>
            </div>
            <div className={`${tile} col-span-2`}>
              <p className={tileLabel}>측정한 운동 시간</p>
              {stats.measuredMs !== null ? (
                <>
                  <p className={tileValue}>
                    {measuredDurationLabel(stats.measuredMs)}
                  </p>
                  <p className="mt-1 text-support leading-snug font-normal text-muted">
                    측정한 기록 {stats.measuredRecordCount}건 합계
                  </p>
                </>
              ) : (
                <p className="mt-1 text-body leading-snug font-semibold text-muted">
                  측정한 시간 없음
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="stats-trend-title">
            <h2
              id="stats-trend-title"
              className={`mb-3 ${composeSectionTitle}`}
            >
              {period === 'week' ? '요일별 운동 횟수' : '주차별 운동 횟수'}
            </h2>
            <ol
              role="list"
              className={`${composeCard} flex items-end justify-between gap-1`}
            >
              {stats.buckets.map((bucket) => (
                <li
                  key={bucket.key}
                  data-stats-bar={bucket.sessions}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <span className="sr-only">
                    {bucket.spoken} {bucket.sessions}회
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-support leading-none font-semibold tabular-nums text-content"
                  >
                    {bucket.sessions > 0 ? bucket.sessions : ''}
                  </span>
                  <span
                    aria-hidden="true"
                    className="flex h-24 w-full items-end justify-center"
                  >
                    <span
                      className={`block w-full max-w-8 rounded-t-control ${
                        bucket.sessions > 0 ? 'bg-exercise' : 'bg-line'
                      }`}
                      style={{
                        height:
                          bucket.sessions > 0
                            ? `${Math.max(8, Math.round((bucket.sessions / maxBucket) * 100))}%`
                            : '2px',
                      }}
                    />
                  </span>
                  <span
                    aria-hidden="true"
                    className="text-support leading-snug font-normal text-muted"
                  >
                    {bucket.label}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="stats-exercise-title">
            <h2
              id="stats-exercise-title"
              className={`mb-3 ${composeSectionTitle}`}
            >
              운동별 수행 횟수
            </h2>
            {stats.byExercise.length === 0 ? (
              <p className={`${composeCard} text-body text-muted`}>
                완료한 세트가 있는 운동이 없어요.
              </p>
            ) : (
              <ul
                role="list"
                className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface"
              >
                {stats.byExercise.map((row) => (
                  <li
                    key={row.exerciseId}
                    data-stats-exercise
                    className="flex items-baseline justify-between gap-3 p-4"
                  >
                    <span className="min-w-0 text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
                      {row.name}
                    </span>
                    <span className="shrink-0 text-right text-support leading-snug font-normal tabular-nums text-muted">
                      <span className="text-body font-semibold text-content">
                        {row.sessions}회
                      </span>{' '}
                      · {row.completedSets}세트
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-support leading-relaxed font-normal text-muted">
            운동 시간은 실제로 측정한 기록만 합산해요. 측정하지 않은 기록은
            0분으로 계산하지 않아요.
          </p>
          {skippedCount > 0 ? (
            <p className="text-support leading-relaxed font-normal text-muted">
              읽을 수 없는 기록 {skippedCount}건은 제외했어요.
            </p>
          ) : null}
        </>
      )}
    </div>
  )
}
