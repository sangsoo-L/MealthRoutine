import { Link } from 'react-router'
import {
  MEAL_LABEL,
  MEAL_TYPES,
  groupByMeal,
  type MealRecord,
  type MealType,
} from '../../food/mealModel.ts'
import {
  incompleteNotice,
  summarizeMeals,
  totalKcalText,
} from '../../food/mealView.ts'
import {
  PATH_MEAL,
  mealDetailPath,
  recordMealPath,
} from '../../food/foodPaths.ts'
import type { MealRecordsState } from '../../food/useMealRecords.ts'
import MacroShareBar from './MacroShareBar.tsx'
import MealRecordItem from './MealRecordItem.tsx'
import {
  mealCard,
  mealFocusRing,
  mealPrimaryButton,
  mealSecondaryButton,
  mealSectionTitle,
} from './foodStyles.ts'

/** 잘못된 끼니 주소 안내. */
export function MealNotFound() {
  return (
    <div className="flex flex-col gap-5 break-keep wrap-anywhere">
      <h1 className="text-app-title leading-snug font-semibold text-content">
        끼니 식단
      </h1>
      <div role="status" className={mealCard}>
        <p className="text-body leading-snug font-semibold text-content">
          없는 끼니예요
        </p>
        <p className="mt-1 text-support leading-relaxed font-normal text-muted">
          아침·점심·저녁 중에서 골라 주세요.
        </p>
      </div>
      <Link to={PATH_MEAL} className={mealSecondaryButton}>
        식단 기록으로
      </Link>
    </div>
  )
}

/**
 * D01-1·D01-2·D01-3 끼니 상세 본문(아침·점심·저녁이 같은 구조). 끼니 전환, 합계 열량·탄단지 비율, 기록한 음식 목록(수정·삭제), 음식 추가 순서다.
 * 합계는 영양값이 있는 기록만 더하며 비어 있는 기록이 있으면 불완전하다고 알린다(0으로 채우지 않는다).
 * 수정은 D02의 양 선택으로, 추가는 이 끼니가 골라진 D02로 연결한다.
 */
export default function MealDetailView({
  meal,
  localDate,
  records,
  deleteTargetId,
  deleting,
  deleteError,
  notice,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onRetry,
}: {
  meal: MealType
  localDate: string
  records: MealRecordsState
  deleteTargetId: string | null
  deleting: boolean
  deleteError: string | null
  notice: string | null
  onAskDelete: (record: MealRecord) => void
  onConfirmDelete: (record: MealRecord) => void
  onCancelDelete: () => void
  onRetry: () => void
}) {
  const here =
    records.status === 'ready' ? groupByMeal(records.records)[meal] : []
  const summary = summarizeMeals(here)
  const detailPath = mealDetailPath(meal)
  return (
    <div className="flex flex-col gap-6 break-keep wrap-anywhere">
      <header>
        <h1 className="text-app-title leading-snug font-semibold text-content">
          {MEAL_LABEL[meal]} 식단
        </h1>
        <p className="mt-1 text-support leading-relaxed font-normal tabular-nums text-muted">
          기록 날짜 {localDate}
        </p>
      </header>

      <nav aria-label="끼니 전환">
        <ul role="list" className="grid grid-cols-3 gap-2">
          {MEAL_TYPES.map((type) => (
            <li key={type}>
              <Link
                to={mealDetailPath(type)}
                replace
                aria-current={type === meal ? 'page' : undefined}
                className={`flex min-h-11 items-center justify-center rounded-control border px-2 text-body ${mealFocusRing} ${
                  type === meal
                    ? 'border-meal bg-meal-soft font-semibold text-meal'
                    : 'border-line bg-surface font-normal text-muted hover:text-content'
                }`}
              >
                {MEAL_LABEL[type]}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <p
            role="status"
            className="rounded-control bg-meal-soft px-3 py-2 text-support leading-relaxed font-semibold text-meal"
          >
            {notice}
          </p>
        ) : null}
      </div>

      {records.status === 'loading' ? (
        <p role="status" className={`${mealCard} text-body text-muted`}>
          기록을 불러오는 중이에요…
        </p>
      ) : records.status === 'unavailable' ? (
        <div className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            식단 기록을 준비 중이에요
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal text-muted">
            기록 저장이 아직 연결되지 않았어요.
          </p>
        </div>
      ) : records.status === 'error' ? (
        <div role="alert" className={mealCard}>
          <p className="text-body leading-snug font-semibold text-content">
            기록을 불러오지 못했어요
          </p>
          <button
            type="button"
            onClick={onRetry}
            className={`mt-3 w-full ${mealSecondaryButton}`}
          >
            다시 시도
          </button>
        </div>
      ) : (
        <>
          <section aria-labelledby="meal-total-title" className={mealCard}>
            <h2 id="meal-total-title" className={mealSectionTitle}>
              {MEAL_LABEL[meal]} 합계
            </h2>
            <p
              data-meal-kcal
              className="mt-2 text-metric leading-none font-semibold tabular-nums text-content"
            >
              {totalKcalText(summary.totals)}
            </p>
            <p className="mt-2 text-support leading-relaxed font-normal tabular-nums text-muted">
              기록 {summary.totals.recordCount}개
            </p>
            {incompleteNotice(summary.totals) ? (
              <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                {incompleteNotice(summary.totals)}
              </p>
            ) : null}
            {summary.share ? (
              <div className="mt-4">
                <MacroShareBar share={summary.share} />
              </div>
            ) : here.length > 0 ? (
              <p className="mt-3 text-support leading-relaxed font-normal text-muted">
                탄수화물·단백질·지방 정보가 모두 있는 기록이 있어야 비율
                그래프를 보여 드려요.
              </p>
            ) : null}
          </section>

          <section
            aria-labelledby="meal-list-title"
            className="flex flex-col gap-3"
          >
            <h2 id="meal-list-title" className={mealSectionTitle}>
              기록한 음식
            </h2>
            {here.length === 0 ? (
              <div role="status" className={mealCard}>
                <p className="text-body leading-snug font-semibold text-content">
                  아직 {MEAL_LABEL[meal]} 기록이 없어요
                </p>
                <p className="mt-1 text-support leading-relaxed font-normal text-muted">
                  아래 버튼으로 먹은 음식을 기록해 보세요.
                </p>
              </div>
            ) : (
              <ul role="list" className="flex flex-col gap-2">
                {here.map((record) => (
                  <MealRecordItem
                    key={record.id}
                    record={record}
                    edit={{
                      type: 'link',
                      to: recordMealPath({ edit: record.id }),
                      state: { from: detailPath },
                    }}
                    onDelete={() => onAskDelete(record)}
                    confirmingDelete={deleteTargetId === record.id}
                    deleting={deleting}
                    deleteError={
                      deleteTargetId === record.id ? deleteError : null
                    }
                    onConfirmDelete={() => onConfirmDelete(record)}
                    onCancelDelete={onCancelDelete}
                  />
                ))}
              </ul>
            )}
            {records.skippedCount > 0 ? (
              <p className="text-support leading-relaxed font-normal text-muted">
                읽을 수 없는 기록 {records.skippedCount}개를 제외했어요.
              </p>
            ) : null}
          </section>
        </>
      )}

      <Link
        to={recordMealPath({ meal })}
        state={{ from: detailPath }}
        className={mealPrimaryButton}
      >
        {MEAL_LABEL[meal]} 음식 추가
      </Link>
    </div>
  )
}
