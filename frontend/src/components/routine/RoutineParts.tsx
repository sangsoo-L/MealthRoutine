import { Link } from 'react-router'
import { routineDetailPath } from '../../exercise/routinePaths.ts'
import {
  routineCreatedLabel,
  routineSummaryText,
} from '../../exercise/routineView.ts'
import { buildSetSlides } from '../../exercise/workoutListView.ts'
import type { WorkoutListItem } from '../../exercise/workoutTypes.ts'
import type { WorkoutRoutine } from '../../exercise/workoutRoutineModel.ts'
import { composeCard } from '../exercise/compose/composeStyles.ts'
import { RecordTypeBadge } from '../exercise/review/ReviewParts.tsx'

/** 목록의 루틴 한 줄. 행 전체가 상세(W07)로 가는 링크다. */
export function RoutineRow({ routine }: { routine: WorkoutRoutine }) {
  return (
    <li>
      <Link
        to={routineDetailPath(routine.id)}
        className="flex min-h-11 items-center gap-3 p-4 hover:bg-page focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-exercise"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
            {routine.name}
          </span>
          <span className="mt-0.5 block text-support leading-snug font-normal tabular-nums text-muted">
            {routineSummaryText(routine.items)} ·{' '}
            {routineCreatedLabel(routine.createdAt)}
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-muted">
          ›
        </span>
      </Link>
    </li>
  )
}

/**
 * 루틴의 운동 순서와 세트별 목표(저장된 목표 그대로, 실제 수행 결과가 아니다). W11·W16과 같은 슬라이드 계산(buildSetSlides)을 쓴다.
 * 운동마다 "운동 방법 확인"(E02) 링크를 둔다(운동 상세로 가며 이 화면을 진입 경로로 넘긴다).
 */
export function RoutineExerciseSteps({
  items,
  detailFrom,
}: {
  items: readonly WorkoutListItem[]
  detailFrom: string
}) {
  return (
    <ol role="list" className="flex flex-col gap-3">
      {items.map((item, index) => (
        <li
          key={`${index}-${item.exerciseId}`}
          className={composeCard}
          data-routine-exercise
        >
          <div className="flex flex-wrap items-center gap-2">
            <span
              aria-hidden="true"
              className="flex size-6 shrink-0 items-center justify-center rounded-full bg-exercise-soft text-support font-semibold tabular-nums text-exercise"
            >
              {index + 1}
            </span>
            <h3 className="min-w-0 text-section-title leading-snug font-semibold break-keep wrap-anywhere text-content">
              {item.exerciseNameSnapshot}
            </h3>
            <RecordTypeBadge type={item.recordType} />
          </div>
          <ul role="list" className="mt-3 flex flex-col gap-1">
            {buildSetSlides(item.recordType, item.sets).map((slide) => (
              <li
                key={slide.key}
                className="text-body leading-snug font-normal break-keep wrap-anywhere text-content"
              >
                <span className="sr-only">{slide.spoken}</span>
                <span aria-hidden="true">
                  <span className="text-muted">{slide.heading}</span>{' '}
                  <span className="font-semibold tabular-nums">
                    {slide.main}
                    {slide.unit === '회' ? '회' : ` ${slide.unit}`}
                  </span>
                  {slide.extra ? (
                    <span className="tabular-nums"> · {slide.extra}</span>
                  ) : null}
                  {slide.repeat !== null ? (
                    <span className="tabular-nums text-muted">
                      {' '}
                      × {slide.repeat}세트
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          <Link
            to={`/exercises/${encodeURIComponent(item.exerciseId)}`}
            state={{ from: detailFrom }}
            className="mt-2 inline-flex min-h-11 items-center text-body leading-snug font-semibold text-exercise hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-exercise"
          >
            운동 방법 확인
            <span className="sr-only">: {item.exerciseNameSnapshot}</span>
          </Link>
        </li>
      ))}
    </ol>
  )
}
