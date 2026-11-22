import { useEffect, useRef } from 'react'
import { Link } from 'react-router'
import type { SaveFailureReason } from '../../../exercise/saveWorkoutList.ts'
import type {
  SaveError,
  SavePanel,
} from '../../../exercise/useWorkoutListSave.ts'
import {
  RECORD_TYPE_LABEL,
  type NormalizedItem,
  type RecordType,
} from '../../../exercise/workoutDraftTypes.ts'
import {
  buildSetSlides,
  describeSets,
  formatDateLabel,
  type ListSummary,
} from '../../../exercise/workoutListView.ts'
import type { LocalDate } from '../../../exercise/workoutTypes.ts'
import {
  composeCard,
  composeCardActive,
  composePrimaryButton,
  composeSecondaryButton,
  composeSectionTitle,
} from '../compose/composeStyles.ts'
import { PATH_COMPOSE, listSummaryText } from './reviewHelpers.ts'
import SetSlider from './SetSlider.tsx'

/** 기록 방식 배지. 색만으로 구분하지 않고 글자("시간형" 등)로 알린다. */
export function RecordTypeBadge({ type }: { type: RecordType }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-exercise-soft px-2.5 py-1 text-support leading-none font-semibold text-exercise">
      {RECORD_TYPE_LABEL[type]}
    </span>
  )
}

/** 예정일, 운동 수·총 세트 수, 포함된 기록 방식. */
export function ReviewSummary({
  summary,
  date,
  dayLabel = '오늘',
}: {
  summary: ListSummary
  date: LocalDate
  /** 날짜 앞에 붙는 구분. 오늘의 운동 목록은 "오늘", 내일 운동 계획은 "내일"이다. */
  dayLabel?: '오늘' | '내일'
}) {
  return (
    <section aria-labelledby="review-summary-title" className={composeCard}>
      <h2 id="review-summary-title" className="sr-only">
        운동 목록 요약
      </h2>
      <p className="text-support font-normal text-muted">예정일</p>
      <p className="mt-1 text-section-title leading-snug font-semibold text-content">
        <time dateTime={date}>
          {dayLabel} · {formatDateLabel(date)}
        </time>
      </p>
      <dl className="mt-4 grid grid-cols-2 divide-x divide-line rounded-control bg-page py-3">
        <div className="px-3">
          <dt className="text-support font-normal text-muted">운동</dt>
          <dd className="mt-1 text-section-title font-semibold tabular-nums text-content">
            {summary.exerciseCount}개
          </dd>
        </div>
        <div className="px-3">
          <dt className="text-support font-normal text-muted">총 세트</dt>
          <dd className="mt-1 text-section-title font-semibold tabular-nums text-content">
            {summary.setCount}세트
          </dd>
        </div>
      </dl>
      <div className="mt-3">
        <p className="text-support font-normal text-muted">포함된 기록 방식</p>
        <ul role="list" className="mt-2 flex flex-wrap gap-2">
          {summary.recordTypes.map((type) => (
            <li key={type}>
              <RecordTypeBadge type={type} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** 운동 한 개: 이름, 기록 방식, 세트 목표 요약과 슬라이더. */
export function ReviewItemCard({
  item,
  index,
}: {
  item: NormalizedItem
  index: number
}) {
  return (
    <li className={composeCard}>
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
          <span className="mr-2 text-support font-normal tabular-nums text-muted">
            {index + 1}
          </span>
          {item.name}
        </h3>
        <RecordTypeBadge type={item.recordType} />
      </div>
      <p className="mt-1 text-support font-normal text-muted">
        {describeSets(item.recordType, item.sets)}
      </p>
      <SetSlider
        slides={buildSetSlides(item.recordType, item.sets)}
        label={item.name}
      />
    </li>
  )
}

/**
 * 저장을 멈추고 확인을 받는 패널(날짜 변경·교체). 열리면 포커스를 패널 안으로 옮겨 보조기기가 읽게 한다
 * (W12의 확인 상자와 같은 방식). 닫는 쪽(페이지)이 눌렀던 저장 버튼으로 포커스를 돌려준다.
 */
export function ReviewPanel({
  panel,
  onConfirm,
  onCancel,
}: {
  panel: SavePanel
  onConfirm: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [panel.kind])
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="group"
      aria-labelledby="review-panel-title"
      className={`${composeCardActive} outline-none`}
    >
      {panel.kind === 'date' ? (
        <>
          <h2 id="review-panel-title" className={composeSectionTitle}>
            날짜가 바뀌었어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
            화면을 연 뒤 날짜가 바뀌었어요({formatDateLabel(panel.from)} →{' '}
            {formatDateLabel(panel.to)}). {formatDateLabel(panel.to)} 운동
            목록으로 저장할까요?
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className={composePrimaryButton}
            >
              {formatDateLabel(panel.to)}로 저장
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="review-panel-title" className={composeSectionTitle}>
            오늘 저장한 운동 목록이 있어요
          </h2>
          <p className="mt-2 text-body leading-relaxed font-normal break-keep text-muted">
            {listSummaryText(panel.existing)}이 저장돼 있어요. 새로 저장하면 이
            목록이 오늘의 운동으로 바뀌어요. 이전 목록과 운동 기록은 그대로
            남아요.
          </p>
          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={onConfirm}
              className={composePrimaryButton}
            >
              바꿔서 저장
            </button>
            <button
              type="button"
              onClick={onCancel}
              className={composeSecondaryButton}
            >
              취소
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const FAILURE_MESSAGE: Record<SaveFailureReason, string> = {
  quota:
    '저장 공간이 부족해서 저장하지 못했어요. 브라우저의 저장 공간을 확보한 뒤 다시 시도해 주세요.',
  unavailable:
    '이 브라우저에서는 운동 목록을 저장할 수 없어요. 구성한 운동은 이 탭에 남아 있어요.',
  blocked:
    '다른 탭에서 운동 기록을 사용 중이라 저장하지 못했어요. 다른 탭을 닫거나 새로고침한 뒤 다시 시도해 주세요.',
  requestConflict:
    '이 구성과 겹치는 저장 기록이 있어 저장하지 못했어요. 구성을 확인한 뒤 다시 시도해 주세요.',
  invalidDraft:
    '구성이 올바르지 않아 저장하지 못했어요. 구성 수정에서 확인해 주세요.',
  error:
    '저장하지 못했어요. 구성한 운동은 그대로 남아 있어요. 잠시 후 다시 시도해 주세요.',
}

/** 저장 실패·날짜 불일치 안내. 오류 내용(저장값·운동 내용)은 담지 않는다. 구성을 고쳐야 하면 구성 수정으로 안내한다. */
export function SaveErrorAlert({
  error,
  today,
}: {
  error: SaveError
  today: LocalDate
}) {
  let message: string
  let needsEdit = false
  if (error.kind === 'dateMismatch') {
    message = `저장은 됐지만 자정이 지나 ${formatDateLabel(error.actual)} 목록으로 저장됐어요. 구성한 운동은 남아 있으니 오늘(${formatDateLabel(today)}) 운동으로 다시 저장해 주세요.`
  } else if (error.kind === 'invalid') {
    message =
      '구성이 올바르지 않아 저장하지 않았어요. 구성 수정에서 확인해 주세요.'
    needsEdit = true
  } else if (error.stage === 'read') {
    message =
      '오늘 저장한 목록을 확인하지 못해 저장하지 않았어요. 잠시 후 다시 시도해 주세요.'
  } else {
    message = FAILURE_MESSAGE[error.reason]
    needsEdit =
      error.reason === 'requestConflict' || error.reason === 'invalidDraft'
  }
  return (
    <div
      role="alert"
      className="rounded-control bg-danger-soft px-3 py-2 text-support leading-relaxed font-normal break-keep text-danger"
    >
      <p>{message}</p>
      {needsEdit ? (
        <Link
          to={PATH_COMPOSE}
          className="mt-1 inline-block font-semibold underline"
        >
          구성 수정
        </Link>
      ) : null}
    </div>
  )
}
