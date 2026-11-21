import { Link } from 'react-router'
import { dashboardDateLabel } from '../../../exercise/dashboardSelectors.ts'
import { PATH_PREVIOUS_LISTS } from '../../../exercise/myExercise.ts'
import type {
  PreviousListView,
  PreviousRecordLink,
} from '../../../exercise/previousLists.ts'
import { resultPathFor } from '../../../exercise/useWorkoutResult.ts'
import { formatDateLabel } from '../../../exercise/workoutListView.ts'
import { composeSecondaryButton } from '../compose/composeStyles.ts'
import { dashboardFocusRing } from '../dashboard/DashboardParts.tsx'
import { RecordTypeBadge } from '../review/ReviewParts.tsx'

const completedFormat = new Intl.DateTimeFormat('ko-KR', {
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
})

function completedLabel(record: PreviousRecordLink): string {
  const date = new Date(record.completedAt)
  return Number.isNaN(date.getTime())
    ? dashboardDateLabel(record.performedDate)
    : `${completedFormat.format(date)} 완료`
}

/**
 * "저장한 수행 기록 보기" 링크의 보이지 않는 이름 꼬리. 같은 제목의 목록이 다른 날짜에 있어도 링크가 구분되도록 계획 날짜와 제목을 넣고,
 * 연결 기록이 여럿이면 "n건 중 k번째 기록"을 더한다(완료 시각은 보이는 글자에 있다).
 */
function accessibleSuffix(
  list: PreviousListView,
  index: number,
  total: number,
): string {
  const base = `: ${formatDateLabel(list.plannedDate)} 계획 ${list.title}`
  return total > 1 ? `${base}, 기록 ${total}건 중 ${index + 1}번째` : base
}

/**
 * W16의 지난 운동 목록 한 건(계획). 운동명·세트 수를 보이고, "세트별 목표 자세히 보기"로 세트 목표를 펼친다(키보드로 열고 닫는 <details>).
 * 실제 수행 결과가 아니다. 연결된 완료 기록이 있을 때만 "저장한 수행 기록 보기"를 그리고, 누르면 W15 읽기 전용으로 이동한다
 * (이동 때 W16의 경로를 `state.from`으로 넘겨 W15의 "이전"이 W16으로 돌아온다). 연결 기록이 여럿이면 모두 링크로 보인다.
 */
export default function PreviousListCard({ list }: { list: PreviousListView }) {
  const titleId = `previous-list-${list.id}`
  const multiple = list.records.length > 1
  return (
    <article
      aria-labelledby={titleId}
      className="rounded-card border border-line bg-surface p-4"
    >
      <span className="inline-flex items-center rounded-full bg-page px-2.5 py-1 text-support leading-none font-normal text-muted">
        지난 운동 목록
      </span>
      <h3
        id={titleId}
        className="mt-2 text-body leading-snug font-semibold break-keep wrap-anywhere text-content"
      >
        {list.title}
      </h3>
      <p className="mt-1 text-support leading-snug font-normal tabular-nums text-muted">
        운동 {list.exerciseCount}개 · {list.setCount}세트
      </p>
      <ol role="list" className="mt-3 divide-y divide-line">
        {list.exercises.map((exercise, index) => (
          <li
            key={`${index}-${exercise.name}`}
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
                {exercise.name}
              </p>
              <p className="mt-0.5 text-support leading-snug font-normal break-keep wrap-anywhere text-muted">
                {exercise.detail}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <details className="group mt-2 border-t border-line pt-1">
        <summary
          className={`flex min-h-11 cursor-pointer items-center justify-between gap-2 rounded-control text-support font-semibold text-exercise ${dashboardFocusRing}`}
        >
          세트별 목표 자세히 보기
          <span
            aria-hidden="true"
            className="text-support font-normal text-muted transition-transform group-open:rotate-180 motion-reduce:transition-none"
          >
            ⌄
          </span>
        </summary>
        <div className="mt-2 flex flex-col gap-4">
          {list.exercises.map((exercise, index) => (
            <section
              key={`${index}-${exercise.name}`}
              aria-labelledby={`${titleId}-ex-${index}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <h4
                  id={`${titleId}-ex-${index}`}
                  className="text-body leading-snug font-semibold break-keep wrap-anywhere text-content"
                >
                  {exercise.name}
                </h4>
                <RecordTypeBadge type={exercise.recordType} />
              </div>
              <ul role="list" className="mt-1.5 flex flex-col gap-1">
                {exercise.slides.map((slide) => (
                  <li
                    key={slide.key}
                    className="text-support leading-snug font-normal break-keep wrap-anywhere text-content"
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
            </section>
          ))}
        </div>
      </details>
      {list.records.length > 0 ? (
        <ul
          role="list"
          aria-label="연결된 저장 기록"
          className="mt-2 flex flex-col gap-2 border-t border-line pt-3"
        >
          {list.records.map((record, index) => (
            <li key={record.recordId}>
              <Link
                to={resultPathFor(record.sessionId)}
                state={{ from: PATH_PREVIOUS_LISTS }}
                className={`w-full ${composeSecondaryButton}`}
              >
                저장한 수행 기록 보기
                {multiple ? (
                  <>
                    {/* 보이는 간격은 여백(ml-1)이 만들고, 이 공백은 이름에서 단어가 붙지 않게 한다(flex 항목 사이의 공백은 그려지지 않는다). */}{' '}
                    <span className="ml-1 text-support font-normal tabular-nums">
                      · {completedLabel(record)}
                    </span>
                  </>
                ) : null}
                {/* 접근 가능한 이름: 눈에 보이는 문구(와 완료 시각) 뒤에 계획 날짜·목록 제목을 붙인다(레이블 인 네임 유지, 별도 id·aria-label 없음).
                    완료 시각은 이미 보이는 글자에 있어 다시 읽지 않고, 여러 기록은 순번으로만 한 번 더 구분한다. */}
                <span className="sr-only">
                  {accessibleSuffix(list, index, list.records.length)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}
