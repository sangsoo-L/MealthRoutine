import { Link } from 'react-router'
import { portionLabel } from '../../food/foodNutrition.ts'
import type { MealEntry } from '../../food/mealModel.ts'
import { recordNutritionLine } from '../../food/mealView.ts'
import {
  mealDangerButton,
  mealFocusRing,
  mealSecondaryButton,
} from './foodStyles.ts'

/** 수정 진입. D02는 같은 화면의 양 선택 팝업을 열고(button), 끼니 상세는 D02로 간다(link). */
export type MealEditAction =
  | { type: 'button'; onClick: () => void }
  | { type: 'link'; to: string; state?: unknown }

const smallButton = `flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface px-3 text-body font-normal text-content hover:bg-page ${mealFocusRing}`

/**
 * 식단 기록 한 건(음식 이름·양·영양 한 줄·수정·삭제). 영양값은 저장 당시 스냅샷으로 계산한 값이다.
 * 삭제는 되돌릴 수 없어 확인 패널을 거친다(confirmingDelete). 수정·삭제 버튼의 접근 이름에 음식 이름을 넣는다.
 */
export default function MealRecordItem({
  record,
  edit,
  onDelete,
  confirmingDelete,
  deleting,
  deleteError,
  onConfirmDelete,
  onCancelDelete,
}: {
  record: MealEntry
  edit: MealEditAction
  onDelete: () => void
  confirmingDelete: boolean
  deleting: boolean
  deleteError: string | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
}) {
  return (
    <li
      data-meal-record={record.id}
      className="rounded-card border border-line bg-surface p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-body leading-snug font-semibold break-keep wrap-anywhere text-content">
            {record.foodName}
          </p>
          <p className="mt-0.5 text-support leading-snug font-normal text-muted">
            {portionLabel(record.portion, record.weightGrams)}
          </p>
          <p className="mt-1 text-support leading-relaxed font-normal tabular-nums text-content">
            {recordNutritionLine(record)}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {edit.type === 'button' ? (
            <button
              type="button"
              onClick={edit.onClick}
              aria-label={`수정: ${record.foodName}`}
              className={smallButton}
            >
              수정
            </button>
          ) : (
            <Link
              to={edit.to}
              state={edit.state}
              aria-label={`수정: ${record.foodName}`}
              className={smallButton}
            >
              수정
            </Link>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={`삭제: ${record.foodName}`}
            className={`${smallButton} text-danger`}
          >
            삭제
          </button>
        </div>
      </div>
      {confirmingDelete ? (
        <div
          role="group"
          aria-label={`${record.foodName} 삭제 확인`}
          className="mt-3 rounded-control border border-danger bg-danger-soft p-3"
        >
          <p className="text-body leading-relaxed font-normal text-content">
            “{record.foodName}” 기록을 삭제할까요? 되돌릴 수 없어요.
          </p>
          {deleteError ? (
            <p
              role="alert"
              className="mt-1 text-support leading-relaxed text-danger"
            >
              {deleteError}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              aria-disabled={deleting || undefined}
              onClick={() => {
                if (!deleting) onConfirmDelete()
              }}
              className={mealDangerButton}
            >
              {deleting ? '삭제하는 중…' : '삭제하기'}
            </button>
            <button
              type="button"
              onClick={onCancelDelete}
              className={`w-full ${mealSecondaryButton}`}
            >
              취소
            </button>
          </div>
        </div>
      ) : null}
    </li>
  )
}
