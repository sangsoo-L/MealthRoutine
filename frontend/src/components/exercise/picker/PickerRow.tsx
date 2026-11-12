import { pickerExerciseMeta } from '../../../exercise/exercisePickerSearch.ts'
import type { Exercise } from '../../../exercise/exerciseTypes.ts'
import Icon from '../../icons/Icon.tsx'
import { FAVORITE_MESSAGES } from '../favoriteMessages.ts'
import { pickerFocusRing } from './PickerNotices.tsx'

export interface PickerStar {
  /** 접근 이름. 운동 상세(E02)와 같은 형식("즐겨찾기에 추가: 이름" 등)이다. */
  label: string
  favorite: boolean
  /** 상태 확인 중이거나 저장 중이라 누르는 것을 무시한다. */
  waiting: boolean
  /** 직전 저장이 실패했다. */
  failed: boolean
  onClick: () => void
}

/**
 * 운동 선택 목록의 한 행. 운동 선택과 즐겨찾기 별은 서로 다른 조작이라 각자 이름과 상태를 가진 별도 버튼이다(버튼 안에 버튼을 두지 않는다).
 * - 선택 버튼: aria-pressed로 선택 상태를 전하고, 눈에 보이는 "✓ 선택됨"·"선택" 글자와 테두리·배경으로도 구분한다(색만으로 전하지 않는다).
 *   글자는 aria-pressed와 겹쳐 읽히지 않도록 보조기기에서는 숨긴다.
 * - 별 버튼: 선택 상태와 독립이다. 저장이 실패하면 그 운동 행 아래에 승인된 안내를 보인다(별 상태·선택 상태는 그대로).
 * 부가 정보 순서는 난이도·부위·도구다. 값이 없는 항목은 생략한다.
 */
export default function PickerRow({
  exercise,
  selected,
  onToggleSelect,
  star,
}: {
  exercise: Exercise
  selected: boolean
  onToggleSelect: () => void
  star: PickerStar
}) {
  const meta = pickerExerciseMeta(exercise)

  return (
    <li>
      <div
        className={`flex items-center rounded-card border transition-colors motion-reduce:transition-none ${
          selected
            ? 'border-exercise bg-exercise-soft'
            : 'border-line bg-surface'
        }`}
      >
        <button
          type="button"
          aria-pressed={selected}
          onClick={onToggleSelect}
          className={`flex min-h-14 min-w-0 flex-1 scroll-mb-(--picker-footer-h) cursor-pointer items-center justify-between gap-3 rounded-l-card p-4 text-left ${pickerFocusRing}`}
        >
          <span className="min-w-0">
            <span className="block text-section-title leading-snug font-semibold break-keep wrap-anywhere text-content">
              {exercise.name}
            </span>
            {meta ? (
              <span className="mt-2 block text-support leading-snug font-normal break-keep wrap-anywhere text-exercise">
                {meta}
              </span>
            ) : null}
          </span>
          <span
            aria-hidden="true"
            className={`shrink-0 text-support font-normal ${selected ? 'text-exercise' : 'text-muted'}`}
          >
            {selected ? '✓ 선택됨' : '선택'}
          </span>
        </button>
        <button
          type="button"
          aria-label={star.label}
          aria-disabled={star.waiting || undefined}
          onClick={star.onClick}
          className={`mr-1 flex size-11 shrink-0 scroll-mb-(--picker-footer-h) items-center justify-center rounded-full transition-colors motion-reduce:transition-none ${pickerFocusRing} ${
            star.favorite ? 'text-exercise' : 'text-muted hover:text-exercise'
          } ${star.waiting ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
        >
          <Icon name="star" size={21} filled={star.favorite} />
        </button>
      </div>
      {star.failed ? (
        <p className="mt-2 text-support leading-snug font-normal text-danger">
          {FAVORITE_MESSAGES.saveFailed}
        </p>
      ) : null}
    </li>
  )
}
