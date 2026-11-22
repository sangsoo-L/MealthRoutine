import { useState, type KeyboardEvent } from 'react'
import { pickerFocusRing } from './PickerNotices.tsx'

/** "전체"(조건 없음)를 가리키는 선택지 키. 다른 값과 겹치지 않는다. */
const ALL_KEY = '__all__'

/** 방향키·Home·End로 같은 목록 안 선택지 사이의 포커스를 옮긴다(선택은 Enter·Space). */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  const keys = [
    'ArrowDown',
    'ArrowRight',
    'ArrowUp',
    'ArrowLeft',
    'Home',
    'End',
  ]
  if (!keys.includes(event.key)) return
  const items = [
    ...event.currentTarget.querySelectorAll<HTMLElement>('[role="option"]'),
  ]
  const index = items.indexOf(document.activeElement as HTMLElement)
  if (index < 0) return
  event.preventDefault()
  const last = items.length - 1
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? last
        : event.key === 'ArrowDown' || event.key === 'ArrowRight'
          ? Math.min(index + 1, last)
          : Math.max(index - 1, 0)
  items[next].focus()
}

/**
 * 직접 검색(W13)의 필터 선택지: 난이도 또는 운동 부위 하나를 고르는 단일 선택 목록. 운동 탐색(E01)의 선택 시트와 같은 모양·규칙이다
 * (listbox 패턴, 방향키는 포커스만 옮기고 선택은 Enter·Space, Tab 정지점은 목록에서 하나, 선택은 인디고 테두리·면·굵은 글자).
 * E01의 선택지(큰 분류·운동 도구 포함)와 달리 여기서는 호출부가 준 선택지만 보여 준다. 선택을 풀려면 "전체"를 고른다.
 */
export default function PickerFilterListbox({
  label,
  options,
  value,
  onSelect,
}: {
  /** listbox의 접근 이름(예: "난이도"). */
  label: string
  options: readonly string[]
  value: string | null
  onSelect: (value: string | null) => void
}) {
  const selectedKey = value ?? ALL_KEY
  const [active, setActive] = useState(selectedKey)

  const item = (key: string, text: string) => {
    const selected = selectedKey === key
    return (
      <button
        key={key}
        type="button"
        role="option"
        aria-selected={selected}
        tabIndex={active === key ? 0 : -1}
        onFocus={() => setActive(key)}
        onClick={() => onSelect(key === ALL_KEY ? null : key)}
        className={`min-h-12 cursor-pointer rounded-full border px-4 text-body leading-snug transition-colors motion-reduce:transition-none ${pickerFocusRing} ${
          selected
            ? 'border-exercise bg-exercise-soft font-semibold text-exercise'
            : 'border-line bg-surface font-normal text-content hover:border-exercise/50'
        }`}
      >
        {text}
      </button>
    )
  }

  return (
    <div
      role="listbox"
      aria-label={label}
      onKeyDown={moveFocus}
      className="flex flex-wrap gap-2"
    >
      {item(ALL_KEY, '전체')}
      {options.map((option) => item(option, option))}
    </div>
  )
}
