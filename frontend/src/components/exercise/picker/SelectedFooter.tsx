import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import type { SelectedExercise } from '../../../exercise/useExerciseSelection.ts'
import Icon from '../../icons/Icon.tsx'
import {
  pickerFocusRing,
  pickerInlineNotice,
  pickerSecondaryButton,
} from './PickerNotices.tsx'

/**
 * 운동 선택 화면 하단의 고정 영역(스토리보드 W13의 하단 완료 영역). 화면 맨 아래에 붙어 있고 목록 끝에 자리를 차지하므로 마지막 운동 행을 가리지 않는다.
 * - 선택한 운동 개수와, 선택한 운동 목록(선택한 순서, 번호 = 추가될 순서). 현재 탭에 보이지 않는 운동도 여기서 확인하고 하나씩 해제할 수 있다
 *   (즐겨찾기 탭에서 선택한 운동의 별을 해제해 행이 사라져도 선택은 이 목록에 남는다).
 * - 목록은 길어지면 이 영역 안에서만 스크롤하고, "접기"로 줄일 수 있다.
 * - 선택을 해제하면 포커스를 이웃한 해제 버튼(없으면 개수 줄)으로 옮겨 포커스가 사라지지 않게 한다.
 * - 운동 등록: 선택이 0개면 비활성이다. 누른 결과 안내(notice)는 이 영역에서 읽어 준다.
 * - 취소: 선택을 모두 버리고 돌아간다(cancelTo가 없으면 그리지 않는다). 화면을 벗어나면 임시 선택은 사라진다.
 */
export default function SelectedFooter({
  items,
  notice,
  noticeKey,
  cancelTo,
  onRemove,
  onComplete,
}: {
  items: readonly SelectedExercise[]
  /** 등록을 눌렀을 때 알릴 안내. 선택이 바뀌면 호출한 쪽이 비운다. */
  notice: string | null
  /** 같은 안내를 다시 보일 때마다 달라지는 번호. 안내 요소를 새로 만들어 보조기기가 다시 읽게 한다. */
  noticeKey: number
  cancelTo: string | null
  onRemove: (id: string) => void
  onComplete: () => void
}) {
  const [expanded, setExpanded] = useState(true)
  const listRef = useRef<HTMLOListElement>(null)
  const countRef = useRef<HTMLParagraphElement>(null)
  // 해제 직후 포커스를 보낼 위치(해제한 항목의 자리 번호). 없으면 null.
  const focusIndex = useRef<number | null>(null)

  useEffect(() => {
    const index = focusIndex.current
    if (index === null) return
    focusIndex.current = null
    const buttons = listRef.current?.querySelectorAll('button')
    const target = buttons?.[Math.min(index, buttons.length - 1)]
    if (target) target.focus()
    else countRef.current?.focus()
  }, [items])

  function remove(id: string, index: number) {
    focusIndex.current = index
    onRemove(id)
  }

  const count = items.length

  return (
    <section
      aria-label="선택한 운동"
      className="sticky bottom-0 z-10 -mx-5 mt-6 -mb-5 border-t border-line bg-surface px-5 pt-3 pb-4"
    >
      <div className="flex items-center justify-between gap-3">
        <p
          ref={countRef}
          role="status"
          tabIndex={-1}
          className="text-body leading-snug font-semibold text-content outline-none"
        >
          선택한 운동 {count}개
        </p>
        {count > 0 ? (
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={expanded ? 'picker-selected-list' : undefined}
            onClick={() => setExpanded((value) => !value)}
            className={`-mr-2 min-h-11 cursor-pointer rounded-control px-2 text-body font-normal text-exercise ${pickerFocusRing}`}
          >
            {expanded ? '접기' : '펼치기'}
          </button>
        ) : null}
      </div>

      {count > 0 && expanded ? (
        <ol
          id="picker-selected-list"
          ref={listRef}
          aria-label="선택한 운동 목록, 선택한 순서"
          className="mt-1 max-h-[min(7rem,16dvh)] overflow-y-auto"
        >
          {items.map((item, index) => (
            <li
              key={item.id}
              className="flex min-h-11 items-center justify-between gap-2 border-b border-line last:border-b-0"
            >
              <span className="min-w-0 text-body leading-snug font-normal break-keep wrap-anywhere text-content">
                <span
                  aria-hidden="true"
                  className="mr-2 text-support text-muted"
                >
                  {index + 1}
                </span>
                {item.name}
              </span>
              <button
                type="button"
                aria-label={`선택 해제: ${item.name}`}
                onClick={() => remove(item.id, index)}
                className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted hover:text-content ${pickerFocusRing}`}
              >
                <Icon name="close" size={18} />
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {/* 안내가 나타날 때 보조기기가 읽도록 항상 그려 두는 영역 */}
      <div aria-live="polite">
        {notice ? (
          <p key={noticeKey} className={`mt-3 ${pickerInlineNotice}`}>
            {notice}
          </p>
        ) : null}
      </div>

      <div className="mt-3 flex flex-col gap-2">
        <button
          type="button"
          disabled={count === 0}
          onClick={onComplete}
          className={`flex min-h-12 cursor-pointer items-center justify-center rounded-control bg-exercise px-4 text-body font-semibold text-surface transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line disabled:text-muted disabled:hover:opacity-100 motion-reduce:transition-none ${pickerFocusRing}`}
        >
          선택한 {count}개 운동 등록
        </button>
        {cancelTo ? (
          <Link to={cancelTo} className={pickerSecondaryButton}>
            선택 취소 · 구성으로 돌아가기
          </Link>
        ) : null}
      </div>
    </section>
  )
}
